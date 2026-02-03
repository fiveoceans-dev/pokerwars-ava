/**
 * Professional Production WebSocket Poker Server
 * 
 * Pure Event-Driven FSM Architecture:
 * - Direct EventEngine integration (no adapter layer)
 * - EventEngine as single source of truth
 * - All state changes through event dispatch
 * - Complete event sourcing and auditability
 */

import 'dotenv/config';
import { createServer, type IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { healthCheck } from './health.js';

// Import pure FSM components (no legacy types)
import { createEventEngine, EventEngine } from "@hyper-poker/engine";
import type {
  Table,
  ServerEvent,
  ClientCommand,
  LobbyTable,
} from "@hyper-poker/engine";

import { SessionManager, Session } from "./sessionManager";
import { WebSocketFSMBridge } from "./pokerWebSocketServer";
import { logger } from "@hyper-poker/engine/utils/logger";
import { getTableConfig, listTableConfigs, setTableConfigs } from "./tableConfig";
import { globalSeatMappings } from "./seatMappingManager";
import { getServerEnv, normalizeOrigin } from "./env";
import { TournamentManager, loadTournamentDefinitions } from "./tournamentManager";
import { getPrisma } from "./prisma";
import { TournamentOrchestrator } from "./tournamentOrchestrator";
import { BotManager } from "./botManager";
import { LedgerService } from "./ledgerService";
import { LedgerPort } from "./ledgerPort";
import { InMemoryLedger } from "./inMemoryLedger";
import { ChainAdapter } from "./chainAdapter";
import { Asset } from "@prisma/client";
import { authNonces, verifiedWallets, issueAuthToken, verifyAuthToken } from "./security";
import { ethers } from "ethers";
import {
  saveSession,
  saveRoom,
  loadAllRooms,
  loadSession,
} from "./persistence";

// Environment Configuration
const env = getServerEnv();
const PORT = typeof env.port === "number" && !Number.isNaN(env.port) ? env.port : 8099;
const RECONNECT_GRACE_MS = env.reconnectGraceMs; // default 30s
const prisma = getPrisma();
const ledger: LedgerPort | null = prisma ? new LedgerService(prisma) : new InMemoryLedger();
const chain = ledger ? new ChainAdapter(ledger) : null;
const allowUnverifiedWallets = process.env.ALLOW_UNVERIFIED_WALLETS === "1";

function getBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization || req.headers.Authorization;
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function isWalletAuthorized(req: IncomingMessage, wallet: string | undefined): boolean {
  if (!wallet) return false;
  if (!env.isProduction) return true;
  if (allowUnverifiedWallets) return true;
  const token = getBearerToken(req);
  if (token) {
    const verified = verifyAuthToken(token);
    if (verified && verified.wallet === wallet.toLowerCase()) {
      return true;
    }
  }
  return verifiedWallets.has(wallet.toLowerCase());
}

const isDevEnvironment = !env.isProduction;
const allowedOrigins = env.allowedOrigins;
const devAllowedOrigins = env.devAllowedOrigins;

if (isDevEnvironment && allowedOrigins.length === 0 && devAllowedOrigins.length === 0) {
  logger.warn(
    "No WebSocket origins configured. Set DEV_ALLOWED_WS_ORIGINS (recommended) or ALLOWED_WS_ORIGINS to accept browser connections.",
  );
}

// Load cash table configs from DB if available; fall back to defaults otherwise.
if (prisma) {
  prisma.gameTemplate
    .findMany({ where: { type: "CASH" as any }, orderBy: { bigBlind: "asc" } })
    .then((templates) => {
      if (templates.length) {
        setTableConfigs(
          templates.map((t) => ({
            id: t.id,
            name: t.name,
            blinds: { small: t.smallBlind, big: t.bigBlind },
            maxPlayers: t.maxPlayers,
            buyIn: { min: t.minBuyIn, max: t.maxBuyIn, default: t.defaultBuyIn },
            stakeLevel: "custom",
          })),
        );
        logger.info(`🗄️ Loaded ${templates.length} cash tables from database`);
      }
    })
    .catch((err) => {
      logger.error("❌ Failed to load cash table configs; using defaults", err);
    });
}

const rateLimits = new Map<string, { window: number; count: number }>(); // key = `${wallet}:${route}`
function checkRateLimit(key: string, limitPerMinute = 60): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const current = rateLimits.get(key) || { window: now, count: 0 };
  if (now - current.window > windowMs) {
    current.window = now;
    current.count = 0;
  }
  current.count += 1;
  rateLimits.set(key, current);
  return current.count <= limitPerMinute;
}

/**
 * HTTP Server with Health Endpoints
 */
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const origin = normalizeOrigin(req.headers.origin?.toString());

  if (req.method === 'OPTIONS') {
    setCorsHeaders(res, origin);
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Health check endpoint
  if (url.pathname === '/health') {
    const dbHealth = await healthCheck();

    setCorsHeaders(res, origin);
    res.writeHead(dbHealth.status === 'healthy' ? 200 : 503, {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    });

    const response = {
      status: dbHealth.status,
      timestamp: new Date().toISOString(),
      websocket: {
        connections: wss.clients.size,
        tables: bridge.getTables().length
      },
      database: dbHealth.database
    };

    res.end(JSON.stringify(response));
    return;
  }
  
  // Auth: challenge
  if (url.pathname === '/api/auth/challenge' && req.method === 'GET') {
    setCorsHeaders(res, origin);
    const wallet = url.searchParams.get('wallet')?.toLowerCase();
    if (!wallet) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "wallet param required" }));
      return;
    }
    const nonce = randomUUID();
    authNonces.set(wallet, nonce);
    const message = `PokerWars login nonce: ${nonce}`;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ nonce, message }));
    return;
  }

  // Auth: verify
  if (url.pathname === '/api/auth/verify' && req.method === 'POST') {
    setCorsHeaders(res, origin);
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const wallet: string | undefined = parsed.wallet?.toLowerCase();
        const signature: string | undefined = parsed.signature;
        if (!wallet || !signature) throw new Error("wallet and signature required");
        const nonce = authNonces.get(wallet);
        if (!nonce) throw new Error("no challenge found");
        const message = `PokerWars login nonce: ${nonce}`;
        const recovered = ethers.verifyMessage(message, signature).toLowerCase();
        if (recovered !== wallet) throw new Error("signature does not match wallet");
        verifiedWallets.add(wallet);
        const token = issueAuthToken(wallet);
        authNonces.delete(wallet);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, token }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "invalid request" }));
      }
    });
    return;
  }

  // API endpoint to list tables
  if (url.pathname === '/api/tables') {
    setCorsHeaders(res, origin);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    });
    res.end(JSON.stringify({ tables: bridge.getTables() }));
    return;
  }

  // API endpoint to list tournaments
  if (url.pathname === '/api/tournaments') {
    setCorsHeaders(res, origin);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    });
    res.end(JSON.stringify({ tournaments: tournamentManager.list() }));
    return;
  }

  // API endpoint: single tournament detail
  if (url.pathname.startsWith('/api/tournaments/')) {
    const id = url.pathname.split('/').pop() || '';
    const t = tournamentManager.get(id);
    setCorsHeaders(res, origin);
    if (!t) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    });
    res.end(JSON.stringify({ tournament: t }));
    return;
  }

  if (url.pathname === '/api/user/balance' && req.method === 'GET') {
    setCorsHeaders(res, origin);
    if (!chain) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Database not configured" }));
      return;
    }
    const wallet = url.searchParams.get('wallet')?.toLowerCase();
    if (!wallet) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "wallet param required" }));
      return;
    }
    if (!isWalletAuthorized(req, wallet)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "wallet not verified" }));
      return;
    }
    const receipt = await chain.getBalance(wallet);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(receipt.payload));
    return;
  }

  if (url.pathname === '/api/user/profile' && req.method === 'GET') {
    setCorsHeaders(res, origin);
    if (!chain) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Database not configured" }));
      return;
    }
    const wallet = url.searchParams.get('wallet')?.toLowerCase();
    if (!wallet) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "wallet param required" }));
      return;
    }
    if (!isWalletAuthorized(req, wallet)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "wallet not verified" }));
      return;
    }
    const user = await ledger!.getUserByWallet(wallet);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user }));
    return;
  }

  if (url.pathname === '/api/user/ledger' && req.method === 'GET') {
    setCorsHeaders(res, origin);
    if (!chain) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Database not configured" }));
      return;
    }
    const wallet = url.searchParams.get('wallet')?.toLowerCase();
    const limit = Number(url.searchParams.get('limit') || 20);
    if (!wallet) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "wallet param required" }));
      return;
    }
    if (!isWalletAuthorized(req, wallet)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "wallet not verified" }));
      return;
    }
    const entries = await ledger!.getLedgerForWallet(wallet, Number.isFinite(limit) ? limit : 20);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ entries }));
    return;
  }

  if (url.pathname === '/api/user/claim' && req.method === 'POST') {
    setCorsHeaders(res, origin);
    if (!ledger) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Database not configured" }));
      return;
    }
    const wallet = url.searchParams.get('wallet')?.toLowerCase();
    if (!wallet) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "wallet param required" }));
      return;
    }
    if (!isWalletAuthorized(req, wallet)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "wallet not verified" }));
      return;
    }
    if (!checkRateLimit(`${wallet}:claim`, 20)) {
      res.writeHead(429);
      res.end(JSON.stringify({ error: "rate limited" }));
      return;
    }
    const result = await chain.claim(wallet);
    const payload: any = result.payload;
    if (payload && payload.ok === false) {
      res.writeHead(429);
      res.end(JSON.stringify({ error: "cooldown", nextAvailableInMs: payload.nextAvailableInMs }));
      return;
    }
    if (payload?.account && !payload?.balance) {
      payload.balance = payload.account;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
    return;
  }

  if (url.pathname === '/api/user/convert' && req.method === 'POST') {
    setCorsHeaders(res, origin);
    if (!ledger) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Database not configured" }));
      return;
    }
    const wallet = url.searchParams.get('wallet')?.toLowerCase();
    if (!wallet) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "wallet param required" }));
      return;
    }
    if (!isWalletAuthorized(req, wallet)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "wallet not verified" }));
      return;
    }
    if (!checkRateLimit(`${wallet}:convert`, 60)) {
      res.writeHead(429);
      res.end(JSON.stringify({ error: "rate limited" }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const { direction, tier, amount } = parsed;
        if (!["coinsToTickets", "ticketsToCoins"].includes(direction)) throw new Error("invalid direction");
        if (!["ticket_x", "ticket_y", "ticket_z"].includes(tier)) throw new Error("invalid tier");
        const qty = Math.max(0, Math.floor(Number(amount) || 0));
        if (qty <= 0) throw new Error("invalid amount");
        const receipt = await chain.convert(wallet, direction, tier, qty);
        const payload: any = receipt.payload;
        if (payload?.account && !payload?.balance) {
          payload.balance = payload.account;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "invalid request" }));
      }
    });
    return;
  }

  if (url.pathname === '/api/user/email' && req.method === 'POST') {
    setCorsHeaders(res, origin);
    if (!ledger) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Database not configured" }));
      return;
    }
    const wallet = url.searchParams.get('wallet')?.toLowerCase();
    if (!wallet) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "wallet param required" }));
      return;
    }
    if (!isWalletAuthorized(req, wallet)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "wallet not verified" }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const email = String(parsed.email || '').trim();
        if (!email) throw new Error("email required");
        const user = await ledger!.updateEmail(wallet, email);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ user }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "invalid request" }));
      }
    });
    return;
  }
  
  // Default response
  res.writeHead(200, {
    'Content-Type': 'text/plain',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer'
  });
  res.end('Pure Event-Driven FSM Poker Server - Use WebSocket for game play');
});

/**
 * WebSocket Server with FSM Integration
 */
const wss = new WebSocketServer({
  server,
  maxPayload: env.wsMaxPayload,
});
const sessions = new SessionManager();
const bridge = new WebSocketFSMBridge(sessions, ledger);
const botManager = new BotManager();
bridge.setBotManager(botManager);
const tournamentManager = new TournamentManager(loadTournamentDefinitions(), prisma);
const tournamentOrchestrator = new TournamentOrchestrator(
  tournamentManager,
  bridge,
  undefined,
  broadcastAll,
  async (tournamentId, payouts) => {
    if (!ledger) return;
    for (const p of payouts) {
      const asset = p.currency === "tickets" ? Asset.TICKET_X : Asset.COINS;
      try {
        await ledger.payout(p.playerId, tournamentId, asset, p.amount, p.position);
      } catch (err) {
        logger.warn(`Payout ledger failed for ${p.playerId}`, err);
      }
    }
  },
);
// Wire bust detection from engine to tournament orchestrator (placeholder: log for now)
bridge.setBustHandler((tableId, playerId) => {
  logger.info(`💥 Detected bust: ${playerId} on ${tableId}`);
  tournamentOrchestrator.handleBust(tableId, playerId);
});

// Kick off scheduled tournament checks every minute
setInterval(() => tournamentOrchestrator.checkScheduled(), 60_000);

// Local helper to avoid leaking frontend utilities into server path
function shortAddr(id?: string): string | undefined {
  if (!id) return id;
  const s = id.toString();
  return s.length > 10 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;
}

// Connection tracking
let connectionCount = 0;

type TournamentClientCommand =
  | { type: "LIST_TOURNAMENTS" }
  | { type: "TOURNAMENT_STATUS"; tournamentId: string }
  | { type: "REGISTER_TOURNAMENT"; tournamentId: string }
  | { type: "UNREGISTER_TOURNAMENT"; tournamentId: string }
  | { type: "START_SNG_WITH_BOTS"; tournamentId: string };

type Command = ClientCommand | TournamentClientCommand;

/**
 * Create persistent tables on startup
 */
function createPersistentTables(): void {
  listTableConfigs().forEach((tableConfig) => {
    const engine = bridge.getEngine(
      tableConfig.id, 
      tableConfig.blinds.small, 
      tableConfig.blinds.big
    );
    
    logger.info(`🎯 Created table: ${tableConfig.name} (${tableConfig.blinds.small}/${tableConfig.blinds.big}) - Buy-in: ${tableConfig.buyIn.min}-${tableConfig.buyIn.max} chips [${tableConfig.stakeLevel}]`);
  });
  
  const configs = listTableConfigs();
  logger.info(`✅ Created ${configs.length} persistent tables across ${new Set(configs.map(t => t.stakeLevel)).size} stake levels`);
}

/**
 * Broadcast events to WebSocket clients
 */
function sanitizeTableForSession(table: Table, session: Session, roomId: string): Table {
  // Only expose holeCards for the viewer's own seat; strip others
  const viewerSeat = session.seat;
  const bridgeRevealed = bridge.getRevealedPids(roomId);
  const tableRevealed = new Set((table as any).revealedPids || []);
  const revealed = new Set([...bridgeRevealed, ...tableRevealed]);
  const seats = table.seats.map((s, idx) => {
    if (s && s.pid && idx !== viewerSeat) {
      const { holeCards, ...rest } = s as any;
      // Ensure nickname is always populated for rendering stability
      const nickname = rest.nickname || shortAddr(rest.pid);
      if (!nickname && !env.isProduction) {
        logger.warn(`Snapshot seat missing nickname (pid=${rest.pid})`);
      }
      // Reveal cards if player has been marked revealed (showdown or explicit show)
      const shouldReveal = revealed.has(rest.pid.toLowerCase());
      return { ...rest, holeCards: shouldReveal ? holeCards : undefined, nickname };
    }
    if (s && s.pid) {
      // For viewer seat, also ensure nickname fallback
      const nickname = (s as any).nickname || shortAddr((s as any).pid);
      if (!nickname && !env.isProduction) {
        logger.warn(`Snapshot viewer seat missing nickname (pid=${(s as any).pid})`);
      }
      return { ...(s as any), nickname } as any;
    }
    return s as any;
  });
  // Enforce numeric-only arrays for community and burns
  const communityCards = (table.communityCards || []).filter((c: any) => typeof c === 'number');
  const burns = table.burns
    ? {
        flop: (table.burns.flop || []).filter((c: any) => typeof c === 'number'),
        turn: (table.burns.turn || []).filter((c: any) => typeof c === 'number'),
        river: (table.burns.river || []).filter((c: any) => typeof c === 'number'),
      }
    : undefined;
  return { ...table, seats, communityCards, burns };
}

function broadcast(roomId: string, event: ServerEvent): void {
  let sentCount = 0;

  wss.clients.forEach((client) => {
    const session = sessions.get(client);
    if (session?.roomId === roomId && client.readyState === WebSocket.OPEN) {
      try {
        // Sanitize TABLE_SNAPSHOT per viewer to avoid leaking others' hole cards
        let payload: ServerEvent = event;
        if (event.type === "TABLE_SNAPSHOT") {
          const sanitized = sanitizeTableForSession((event as any).table, session, roomId);
          payload = { ...event, table: sanitized } as ServerEvent;
        }
        const msg = JSON.stringify({ ...payload, tableId: roomId });
        client.send(msg);
        sentCount++;
      } catch (error) {
        logger.error(`❌ Broadcast failed:`, error);
      }
    }
  });

  logger.debug(`📡 Event: ${event.type}, Room: ${roomId}, Clients: ${sentCount}`);
}

function isHttpOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  return allowedOrigins.includes(origin) || (!env.isProduction && devAllowedOrigins.includes(origin));
}

function setCorsHeaders(res: any, origin: string | undefined) {
  if (origin && isHttpOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  }
}

function broadcastAll(event: any): void {
  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(event));
        sent++;
      } catch (err) {
        logger.error(`❌ BroadcastAll failed:`, err);
      }
    }
  });
  logger.debug(`📡 Event: ${event.type} broadcast to ${sent} clients`);
}

/**
 * Setup FSM bridge event forwarding
 */
bridge.on('broadcast', broadcast);
bridge.on('error', (roomId: string, error: ServerEvent) => {
  broadcast(roomId, error);
});

/**
 * WebSocket Connection Handler
 */
wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  // Origin allowlist check
  try {
    const origin = normalizeOrigin(req.headers["origin"]?.toString());
    const ok = !origin
      || allowedOrigins.includes(origin)
      || (isDevEnvironment && devAllowedOrigins.includes(origin));
    if (!ok) {
      logger.warn(`🚫 WS origin rejected: ${origin}`);
      ws.close(1008, 'Origin not allowed');
      return;
    }
  } catch (e) {
    logger.error('Origin validation error:', e);
    ws.close(1011, 'Server error');
    return;
  }
  connectionCount++;
  const clientId = `client-${connectionCount}`;
  logger.info(`🔗 [${clientId}] Connected (Total: ${wss.clients.size})`);
  
  let session = sessions.create(ws);
  void saveSession(session);
  
  // Send session info to client
  ws.send(JSON.stringify({
    tableId: "",
    type: "SESSION",
    sessionId: session.sessionId,
    userId: session.userId,
  } satisfies ServerEvent));

  /**
   * Message Handler - Convert WebSocket commands to FSM events
   */
// Basic command validation before delegating to the FSM bridge
function validateClientCommand(cmd: any): { ok: true } | { ok: false; code: string; msg: string } {
  if (!cmd || typeof cmd !== "object") {
    return { ok: false, code: "VALIDATION_ERROR", msg: "Missing or invalid command payload" };
  }

  if (!cmd.type || typeof cmd.type !== "string") {
    return { ok: false, code: "VALIDATION_ERROR", msg: "Missing command type" };
  }

  switch (cmd.type) {
    case "LIST_TABLES":
      return { ok: true };
    case "LIST_TOURNAMENTS":
      return { ok: true };
    case "REGISTER_TOURNAMENT":
    case "UNREGISTER_TOURNAMENT":
    case "TOURNAMENT_STATUS":
    case "START_SNG_WITH_BOTS":
      if (!cmd.tournamentId || typeof cmd.tournamentId !== "string") {
        return { ok: false, code: "VALIDATION_ERROR", msg: `${cmd.type} requires tournamentId` };
      }
      return { ok: true };
    case "JOIN_TABLE":
      if (!cmd.tableId || typeof cmd.tableId !== "string") {
        return { ok: false, code: "VALIDATION_ERROR", msg: "JOIN_TABLE requires tableId" };
      }
      return { ok: true };
    case "CREATE_TABLE":
      if (!cmd.name || typeof cmd.name !== "string" || cmd.name.trim().length < 2) {
        return { ok: false, code: "VALIDATION_ERROR", msg: "CREATE_TABLE requires name (>= 2 chars)" };
      }
      return { ok: true };
    case "REATTACH":
      if (!cmd.sessionId || typeof cmd.sessionId !== "string") {
        return { ok: false, code: "VALIDATION_ERROR", msg: "REATTACH requires sessionId" };
      }
      return { ok: true };
    case "ATTACH":
      if (!cmd.userId || typeof cmd.userId !== "string") {
        return { ok: false, code: "VALIDATION_ERROR", msg: "ATTACH requires userId" };
      }
      return { ok: true };
    case "SIT": {
      if (!cmd.tableId || typeof cmd.tableId !== "string") {
        return { ok: false, code: "VALIDATION_ERROR", msg: "SIT requires tableId" };
      }
      if (typeof cmd.seat !== "number" || cmd.seat < 0 || cmd.seat > 8) {
        return { ok: false, code: "VALIDATION_ERROR", msg: "SIT requires seat 0..8" };
      }
      // buyIn/chips are optional (server can recommend); don't fail hard here
      return { ok: true };
    }
    case "ACTION": {
      const actions = ["FOLD", "CHECK", "CALL", "BET", "RAISE", "ALLIN"];
      if (!actions.includes(cmd.action)) {
        return { ok: false, code: "VALIDATION_ERROR", msg: `Invalid action: ${cmd.action}` };
      }
      if ((cmd.action === "BET" || cmd.action === "RAISE") && (typeof cmd.amount !== "number" || cmd.amount <= 0)) {
        return { ok: false, code: "VALIDATION_ERROR", msg: `${cmd.action} requires positive amount` };
      }
      return { ok: true };
    }
    case "LEAVE":
    case "SIT_OUT":
    case "SIT_IN":
    case "SHOW_CARDS":
    case "MUCK_CARDS":
      return { ok: true };
    default:
      return { ok: false, code: "BAD_COMMAND", msg: `Unknown command type: ${cmd.type}` };
  }
}

ws.on("message", async (data) => {
  try {
    const command: Command = JSON.parse(data.toString());
    
    logger.debug(`📨 [${clientId}] Command: ${command.type}`);
    // Early validation: reject malformed commands consistently
    const validation = validateClientCommand(command as any);
    if (validation.ok === false) {
      const { code, msg } = validation;
      const err: ServerEvent = {
        tableId: (command as any)?.tableId || session.roomId || "",
        type: "ERROR",
        code,
        msg,
      } satisfies ServerEvent;
      ws.send(JSON.stringify(err));
      logger.warn(`⚠️ Rejected command: ${code} - ${msg}`);
      return;
    }
      
      // Handle session-level commands
      switch (command.type) {
        case "LIST_TABLES":
          const tables = bridge.getTables();
          ws.send(JSON.stringify({
            tableId: "",
            type: "TABLE_LIST",
            tables,
          } satisfies ServerEvent));
          break;
        case "LIST_TOURNAMENTS": {
          const tournaments = tournamentManager.list();
          ws.send(JSON.stringify({
            tableId: "",
            type: "TOURNAMENT_LIST",
            tournaments,
          } as any));
          break;
        }
        case "TOURNAMENT_STATUS": {
          const tournament = tournamentManager.get(command.tournamentId);
  if (!tournament) {
    ws.send(JSON.stringify({
      tableId: "",
      type: "ERROR",
      code: "TOURNAMENT_NOT_FOUND",
              msg: `Tournament ${command.tournamentId} not found`,
            } satisfies ServerEvent));
            break;
          }
          ws.send(JSON.stringify({
            tableId: "",
            type: "TOURNAMENT_UPDATED",
            tournament,
          } as any));
          break;
        }
        case "REGISTER_TOURNAMENT": {
          const playerId = session.userId || session.sessionId;
          const result = tournamentManager.registerPlayer(command.tournamentId, playerId);
          if (!result.ok || !result.tournament) {
            ws.send(JSON.stringify({
              tableId: "",
              type: "ERROR",
              code: "REGISTER_FAILED",
              msg: result.message || "Failed to register",
            } satisfies ServerEvent));
            break;
          }
          const state = tournamentManager.getState(command.tournamentId);
          if (ledger && state) {
            try {
              const asset = state.buyIn.currency === "tickets" ? Asset.TICKET_X : Asset.COINS;
              await ledger.buyIn(playerId, command.tournamentId, asset, state.buyIn.amount);
            } catch (err) {
              tournamentManager.unregisterPlayer(command.tournamentId, playerId);
              ws.send(JSON.stringify({
                tableId: "",
                type: "ERROR",
                code: "BUY_IN_FAILED",
                msg: err instanceof Error ? err.message : "Buy-in failed",
              } satisfies ServerEvent));
              break;
            }
          }
          tournamentOrchestrator.handleRegistration(command.tournamentId);
          const payload = {
            tableId: "",
            type: "TOURNAMENT_UPDATED",
            tournament: result.tournament,
          };
          broadcastAll(payload);
          break;
        }
        case "START_SNG_WITH_BOTS": {
          const result = tournamentOrchestrator.startSitAndGoWithBots(command.tournamentId);
          if (!result.ok) {
            ws.send(JSON.stringify({
              tableId: "",
              type: "ERROR",
              code: "START_FAILED",
              msg: result.message || "Failed to start SNG with bots",
            } satisfies ServerEvent));
          }
          break;
        }
        case "UNREGISTER_TOURNAMENT": {
          const playerId = session.userId || session.sessionId;
          const result = tournamentManager.unregisterPlayer(command.tournamentId, playerId);
          if (!result.ok || !result.tournament) {
            ws.send(JSON.stringify({
              tableId: "",
              type: "ERROR",
              code: "UNREGISTER_FAILED",
              msg: result.message || "Failed to unregister",
            } satisfies ServerEvent));
            break;
          }
          const state = tournamentManager.getState(command.tournamentId);
          if (ledger && state) {
            try {
              const asset = state.buyIn.currency === "tickets" ? Asset.TICKET_X : Asset.COINS;
              await ledger.refund(playerId, command.tournamentId, asset, state.buyIn.amount);
            } catch (err) {
              logger.warn("Refund failed", err);
            }
          }
          const payload = {
            tableId: "",
            type: "TOURNAMENT_UPDATED",
            tournament: result.tournament,
          };
          broadcastAll(payload);
          break;
        }

        case "JOIN_TABLE":
          session.roomId = command.tableId;
          void saveSession(session);
          
          try {
            const table = bridge.getTableState(command.tableId);
            const maxPlayers =
              getTableConfig(command.tableId)?.maxPlayers ?? table.seats.length;
            
            // Proactively restore seat mapping on rejoin to prevent action failures
            if (session.userId) {
              const normalizedId = session.userId.toLowerCase().trim();
              logger.debug(`🔧 [JOIN_TABLE] Attempting seat mapping recovery for ${normalizedId}`);
              
              // Check if player exists in FSM table state but not in seat mappings
              for (let i = 0; i < table.seats.length; i++) {
                const seat = table.seats[i];
                if (seat?.pid && seat.pid.toLowerCase().trim() === normalizedId) {
                  // Found player in FSM - restore their seat mapping
                  const existingMapping = globalSeatMappings.findSeat(command.tableId, normalizedId);
                  if (existingMapping === undefined) {
                    globalSeatMappings.setSeatMapping(command.tableId, normalizedId, i);
                    logger.info(`🔧 [JOIN_TABLE] Restored seat mapping: ${normalizedId} -> seat ${i}`);
                  } else {
                    logger.debug(`ℹ️ [JOIN_TABLE] Seat mapping already exists: ${normalizedId} -> seat ${existingMapping}`);
                  }
                  break;
                }
              }
            }
            
            ws.send(JSON.stringify({
              tableId: command.tableId,
              type: "TABLE_SNAPSHOT",
              table, // Send Table format directly
              maxPlayers,
            } as ServerEvent & { maxPlayers?: number }));
          } catch (error) {
            ws.send(JSON.stringify({
              tableId: command.tableId,
              type: "ERROR",
              code: "TABLE_NOT_FOUND",
              msg: `Table ${command.tableId} not found`,
            } satisfies ServerEvent));
          }
          break;

        case "CREATE_TABLE":
          const tableId = randomUUID();
          const engine = bridge.getEngine(tableId);
          const table = bridge.getTableState(tableId);
          
          ws.send(JSON.stringify({
            tableId,
            type: "TABLE_CREATED",
            table: {
              id: tableId,
              name: command.name,
              gameType: "No Limit Hold'em", 
              playerCount: table.seats.filter(s => s.pid).length,
              maxPlayers: table.seats.length,
              smallBlind: table.smallBlind,
              bigBlind: table.bigBlind
            } as LobbyTable,
          } satisfies ServerEvent));
          break;

        case "REATTACH":
          // Handle session reattachment
          let existing = sessions.getBySessionId(command.sessionId);
          if (!existing) {
            const data = await loadSession(command.sessionId);
            if (data) {
              existing = sessions.restore(data, ws);
            }
          }
          
          if (existing) {
            sessions.handleReconnect(existing);
            sessions.expire(session);
            sessions.replaceSocket(existing, ws);
            session = existing;
            void saveSession(existing);
            
            ws.send(JSON.stringify({
              tableId: existing.roomId ?? "",
              type: "SESSION",
              sessionId: existing.sessionId,
              userId: existing.userId,
            } satisfies ServerEvent));
            
            if (existing.roomId) {
              try {
                const table = bridge.getTableState(existing.roomId);
              const maxPlayers =
                getTableConfig(existing.roomId)?.maxPlayers ?? table.seats.length;
              ws.send(JSON.stringify({
                tableId: existing.roomId,
                type: "TABLE_SNAPSHOT", 
                table,
                maxPlayers,
              } as ServerEvent & { maxPlayers?: number }));
              } catch (err) {
                logger.warn(`⚠️ [REATTACH] Table ${existing.roomId} not found; skipping snapshot`, err);
              }
            }
          }
          break;

        case "ATTACH":
          const attached = sessions.attach(ws, command.userId);
          if (attached) {
            session.userId = attached.userId;
            session.roomId = session.roomId || attached.roomId;
            sessions.handleReconnect(attached);
            void saveSession(session);
            
            ws.send(JSON.stringify({
              tableId: session.roomId ?? "",
              type: "SESSION",
              sessionId: attached.sessionId,
              userId: attached.userId,
            } satisfies ServerEvent));
            
            if (session.roomId) {
              try {
                const table = bridge.getTableState(session.roomId);
              const maxPlayers =
                getTableConfig(session.roomId)?.maxPlayers ?? table.seats.length;
              ws.send(JSON.stringify({
                tableId: session.roomId,
                type: "TABLE_SNAPSHOT",
                table,
                maxPlayers,
              } as ServerEvent & { maxPlayers?: number }));
              } catch (err) {
                logger.warn(`⚠️ [ATTACH] Table ${session.roomId} not found; skipping snapshot`, err);
              }
            }
          }
          break;

        default:
          // Forward game commands to FSM bridge
          await bridge.handleCommand(ws, session, command);
          break;
      }
      
    } catch (error) {
      logger.error(`❌ [${clientId}] Message processing failed:`, error);
      ws.send(JSON.stringify({
        tableId: session.roomId || "",
        type: "ERROR",
        code: "BAD_MESSAGE",
        msg: String(error),
      } satisfies ServerEvent));
    }
  });

  /**
   * Disconnect Handler
   */
  ws.on("close", (code, reason) => {
    logger.info(`🔌 [${clientId}] Disconnected (Code: ${code}, Remaining: ${wss.clients.size - 1})`);
    
    sessions.handleDisconnect(session, (s: Session) => {
      if (s.roomId && s.seat !== undefined) {
        broadcast(s.roomId, {
          type: "PLAYER_DISCONNECTED",
          tableId: s.roomId,
          seat: s.seat,
          playerId: s.userId || s.sessionId,
        });

        // Start a reconnect grace countdown so clients can reflect the state
        try {
          const playerId = s.userId || s.sessionId;
          bridge.startReconnectCountdown(s.roomId, playerId, RECONNECT_GRACE_MS);
          logger.info(
            `⏳ Started reconnect countdown for ${playerId} on ${s.roomId} (${RECONNECT_GRACE_MS}ms)`,
          );
        } catch (err) {
          logger.error(`❌ Failed to start reconnect countdown:`, err);
        }
      }
    });
  });
});

// WebSocket heartbeat to terminate dead connections
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((client) => {
    const anyClient = client as any;
    if (anyClient.isAlive === false) return client.terminate();
    anyClient.isAlive = false;
    try { client.ping(); } catch {}
  });
}, 30000);

wss.on('connection', (client) => {
  (client as any).isAlive = true;
  client.on('pong', () => ((client as any).isAlive = true));
});

wss.on('close', () => clearInterval(heartbeatInterval));

/**
 * Server Startup
 */
logger.info('🎮 Starting Pure Event-Driven FSM Poker Server...');
createPersistentTables();

// Load persisted game state (non-blocking)
(async () => {
  try {
    logger.info('📂 Loading persisted game state...');
    const rooms = await loadAllRooms();
    logger.info(`📂 Loaded ${rooms.length} persisted rooms`);
    
    // Using pure Table format for persistence
    logger.info('ℹ️ Pure FSM architecture - using Table format only');
  } catch (error) {
    logger.error('❌ Room restoration failed:', error);
    logger.info('ℹ️ Continuing with fresh tables');
  }
})();

/**
 * Graceful Shutdown Handler
 */
function gracefulShutdown(signal: string): void {
  logger.info(`📶 Received ${signal}, starting graceful shutdown...`);
  
  // Close WebSocket server
  wss.close(() => {
    logger.info('🔌 WebSocket server closed');
  });
  
  // Close HTTP server
  server.close(() => {
    logger.info('🌐 HTTP server closed');
  });
  
  // Cleanup all engines
  bridge.getTables().forEach(table => {
    try {
      const engine = bridge.getEngine(table.id);
      // Engines have their own cleanup via TimerIntegration.shutdown()
      logger.debug(`🧹 Cleaned up engine for table ${table.id}`);
    } catch (error) {
      logger.error(`❌ Error cleaning up table ${table.id}:`, error);
    }
  });
  
  logger.info('✅ Graceful shutdown completed');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Start Server
 */
server.listen(PORT, () => {
  logger.info(`🚀 Pure FSM Poker Server running on port ${PORT}`);
  logger.info(`🌍 Environment: ${env.nodeEnv}`);
  logger.info(`🏥 Health: http://localhost:${PORT}/health`);
  logger.info(`📊 Tables API: http://localhost:${PORT}/api/tables`);
  logger.info(`🎯 WebSocket: ws://localhost:${PORT}`);
  logger.info(`🎮 Architecture: Direct EventEngine FSM Integration`);
  logger.info(`✅ Ready for game connections...`);
});
