import { getClient } from "./persistence";
import { logger } from "@hyper-poker/engine/utils/logger";

const REJOIN_PREFIX = "rejoin:";
const FIVE_MINUTES_SEC = 5 * 60;

/**
 * Manages cash table rejoin protection.
 * If a player leaves a cash table, we remember their stack for 5 minutes.
 * If they rejoin within that window, they must buy in for at least that amount.
 */
class CashRejoinManager {
  private memoryCache = new Map<string, { chips: number; expiresAt: number }>();

  private getKey(walletAddress: string, tableId: string): string {
    return `${REJOIN_PREFIX}${walletAddress.toLowerCase()}:${tableId}`;
  }

  /**
   * Record that a player has left a table with a certain amount of chips.
   */
  async setLeftStack(walletAddress: string, tableId: string, chips: number) {
    if (!walletAddress || !tableId) return;
    
    const key = this.getKey(walletAddress, tableId);
    const expiresAt = Date.now() + FIVE_MINUTES_SEC * 1000;

    try {
      const client = await getClient();
      if (client) {
        // Persist in Redis with 5-minute expiration
        await client.setEx(key, FIVE_MINUTES_SEC, chips.toString());
      }
    } catch (err) {
      logger.error(`❌ [RejoinManager] Redis set failed:`, err);
    }

    // Always update memory cache as fallback
    this.memoryCache.set(key, { chips, expiresAt });
    this.cleanup();
  }

  /**
   * Get the required minimum buy-in for a player rejoining a table.
   * Returns null if no record exists or window has expired.
   */
  async getRequiredBuyIn(walletAddress: string, tableId: string): Promise<number | null> {
    if (!walletAddress || !tableId) return null;

    const key = this.getKey(walletAddress, tableId);

    // 1. Try Redis first
    try {
      const client = await getClient();
      if (client) {
        const val = await client.get(key);
        if (val) {
          const chips = parseInt(val, 10);
          if (!isNaN(chips)) return chips;
        }
      }
    } catch (err) {
      logger.error(`❌ [RejoinManager] Redis get failed:`, err);
    }

    // 2. Fallback to memory cache
    const entry = this.memoryCache.get(key);
    if (entry) {
      if (Date.now() < entry.expiresAt) {
        return entry.chips;
      }
      this.memoryCache.delete(key);
    }

    return null;
  }

  /**
   * Internal cleanup for memory fallback
   */
  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expiresAt) {
        this.memoryCache.delete(key);
      }
    }
  }
}

export const cashRejoinManager = new CashRejoinManager();
