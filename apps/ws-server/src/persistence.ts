import type { Session } from "./sessionManager";
import type { Table } from "@hyper-poker/engine";
import { logger } from "@hyper-poker/engine/utils/logger";

type RedisClientType = import("redis").RedisClientType;

let client: RedisClientType | null;
const memorySessions = new Map<string, Omit<Session, "socket" | "timeout">>();
const memoryRooms = new Map<string, Table>();

/**
 * Custom JSON replacer to handle BigInt values
 */
const bigIntReplacer = (_key: string, value: any) => {
  return typeof value === "bigint" ? value.toString() : value;
};

/**
 * Custom JSON reviver to convert numeric strings back to numbers for specific fields
 */
const numericReviver = (key: string, value: any) => {
  // Fields that should always be numbers in the engine/app
  const numericFields = [
    "chips", "committed", "streetCommitted", "amount", "pot", 
    "currentBet", "lastRaiseSize", "smallBlind", "bigBlind", 
    "ante", "handNumber", "timestamp"
  ];
  if (numericFields.includes(key) && typeof value === "string") {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) return parsed;
  }
  return value;
};

let redisConnectionAttempted = false;

export async function getClient(): Promise<RedisClientType | null> {
  if (client !== undefined) return client;
  if (!redisConnectionAttempted) {
    redisConnectionAttempted = true;
    try {
      const mod = await import("redis");
      const c = mod.createClient({ url: process.env.REDIS_URL });
      
      // Silence error logging after first attempt
      let errorCount = 0;
      c.on("error", (err) => {
        errorCount++;
        if (errorCount === 1) {
          logger.warn("📡 Redis connection failed, using in-memory storage");
        }
        // Don't log subsequent Redis errors to avoid spam
      });
      
      await c.connect();
      logger.info("📡 Redis connected successfully");
      client = c as any;
    } catch (err) {
      logger.warn("📡 Redis unavailable, using in-memory storage");
      client = null;
    }
  }
  return client;
}

export async function saveSession(session: Session) {
  const data = JSON.stringify({
    sessionId: session.sessionId,
    userId: session.userId,
    roomId: session.roomId,
    seat: session.seat,
    chips: session.chips,
    nickname: session.nickname,
    inActiveHand: session.inActiveHand,
    roles: session.roles,
  }, bigIntReplacer);
  const c = await getClient();
  if (c) await c.set(`session:${session.sessionId}`, data);
  memorySessions.set(session.sessionId, JSON.parse(data, numericReviver));
}

export async function loadSession(id: string) {
  const c = await getClient();
  if (c) {
    const raw = await c.get(`session:${id}`);
    if (raw) return JSON.parse(raw, numericReviver) as Omit<Session, "socket" | "timeout">;
  }
  return memorySessions.get(id);
}

export async function removeSession(id: string) {
  const c = await getClient();
  if (c) await c.del(`session:${id}`);
  memorySessions.delete(id);
}

export async function saveRoom(room: Table) {
  const c = await getClient();
  if (c) await c.set(`room:${room.id}`, JSON.stringify(room, bigIntReplacer));
  memoryRooms.set(room.id, room);
}

export async function removeRoom(id: string) {
  const c = await getClient();
  if (c) await c.del(`room:${id}`);
  memoryRooms.delete(id);
}

export async function loadRoom(id: string) {
  const c = await getClient();
  if (c) {
    const raw = await c.get(`room:${id}`);
    if (raw) return JSON.parse(raw, numericReviver) as Table;
  }
  return memoryRooms.get(id);
}

export async function loadAllRooms(): Promise<Table[]> {
  const c = await getClient();
  if (c) {
    const keys = await c.keys("room:*");
    const rooms: Table[] = [];
    for (const key of keys) {
      const raw = await c.get(key);
      if (raw) rooms.push(JSON.parse(raw, numericReviver));
    }
    return rooms;
  }
  return Array.from(memoryRooms.values());
}
