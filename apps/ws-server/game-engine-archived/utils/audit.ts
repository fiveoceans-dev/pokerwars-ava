import { logger } from "./logger";
import type { Table } from "../core/types";

/**
 * Lightweight audit logger for card-related hand metadata.
 * In production, this can be wired to persistent storage.
 */
export function logHandStartAudit(
  table: Table,
  handNumber: number,
  deckSeed?: string,
  deckCommit?: string,
) {
  const payload = {
    tableId: table.id,
    handNumber,
    deckSeed: deckSeed ?? null,
    deckCommit: deckCommit ?? null,
    timestamp: new Date().toISOString(),
    playerCount: table.seats.filter((s) => s.pid).length,
  };
  logger.info(`🧾 [Audit] HandStart: ${JSON.stringify(payload)}`);
}

