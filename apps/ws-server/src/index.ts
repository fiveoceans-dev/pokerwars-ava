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
import { healthCheck } from './health';

// Import pure FSM components (no legacy types)
import { createEventEngine, EventEngine } from "@hyper-poker/engine";
import type {
  Table,
  ServerEvent,
  ClientCommand,
  LobbyTable,
  GovernanceRole,
} from "@hyper-poker/engine";

import { SessionManager, Session } from "./sessionManager";
import { WebSocketFSMBridge } from "./pokerWebSocketServer";
import { logger } from "@hyper-poker/engine/utils/logger";
import { getTableConfig, listTableConfigs, setTableConfigs } from "./tableConfig";
import { globalSeatMappings } from "./seatMappingManager";
import { getServerEnv, normalizeOrigin } from "./env";
import { TournamentManager } from "./tournamentManager";
import { getPrisma } from "./prisma";
import { TournamentOrchestrator } from "./tournamentOrchestrator";
import { BotManager } from "./botManager";
import { LedgerService } from "./ledgerService";
import { LedgerPort } from "./ledgerPort";
import { InMemoryLedger } from "./inMemoryLedger";
import { ChainAdapter } from "./chainAdapter";
import { Asset, GovernanceRoleType } from "@prisma/client";
import { authNonces, verifiedWallets, issueAuthToken, verifyAuthToken } from "./security";
import { ethers } from "ethers";
import {
  saveSession,
  saveRoom,
  loadAllRooms,
  loadSession,
} from "./persistence";
import { applyGovernanceRoles, getGovernanceRoles } from "./governance";

// Environment Configuration
const env = getServerEnv();
const PORT = typeof env.port === "number" && !Number.isNaN(env.port) ? env.port : 8099;
const RECONNECT_GRACE_MS = env.reconnectGraceMs; // default 30s
const prisma = getPrisma();
const ledger: LedgerPort | null = prisma ? new LedgerService(prisma) : new InMemoryLedger();
const chain = ledger ? new ChainAdapter(ledger) : null;

if (prisma) {
  refreshGovernanceAssignments().catch((err) => {
    logger.error("❌ Failed to load governance assignments:", err);
  });
}
const allowUnverifiedWallets = process.env.ALLOW_UNVERIFIED_WALLETS === "1";

const GOVERNANCE_ROLES_LIST: GovernanceRoleType[] = [
  GovernanceRoleType.DIRECTOR,
  GovernanceRoleType.MANAGER,
  GovernanceRoleType.PROMOTER,
  GovernanceRoleType.ADMIN,
];

let governanceAssignments = new Map<string, GovernanceRoleType[]>();

function normalizeLedgerWallet(wallet?: string): string | null {
  return wallet ? wallet.toLowerCase().trim() : null;
}

async function refreshGovernanceAssignments() {
  if (!prisma) return;
  const assignments = await prisma.governanceAssignment.findMany();
  const next = new Map<string, GovernanceRoleType[]>();
  for (const entry of assignments) {
    const wallet = normalizeLedgerWallet(entry.wallet);
    if (!wallet) continue;
    const list = next.get(wallet) ?? [];
    if (!list.includes(entry.role)) {
      list.push(entry.role);
    }
    next.set(wallet, list);
  }
  governanceAssignments = next;
  logger.info(`🔐 Loaded governance assignments for ${governanceAssignments.size} wallets`);
}

function getGovernanceRoles(userId?: string): GovernanceRoleType[] {
  const normalized = normalizeLedgerWallet(userId);
  if (!normalized) return [];
  const assigned = governanceAssignments.get(normalized) ?? [];
  if (isUserAdmin(userId) && !assigned.includes(GovernanceRoleType.ADMIN)) {
    return [...assigned, GovernanceRoleType.ADMIN];
  }
  return assigned;
}

function applyGovernanceRoles(session: Session) {
  session.roles = getGovernanceRoles(session.userId);
}

function isGovernanceAuthorized(wallet?: string): boolean {
  const roles = getGovernanceRoles(wallet);
  return roles.length > 0;
}

async function readRequestBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function isUserAdmin(userId?: string): boolean {
  if (!userId) return false;
  return env.adminWallets.includes(userId.toLowerCase().trim());
}

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

if (!env.isProduction) {
  logger.info(`🧪 Dev Env: ${env.nodeEnv}`);
  logger.info(`🧪 PORT: ${PORT}`);
  logger.info(`🧪 DB: ${process.env.DATABASE_URL ? "configured" : "missing"}`);
  logger.info(`🧪 Origins: ${devAllowedOrigins.join(", ") || "none"}`);
}

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
      if (!templates.length) {
        logger.error("❌ No CASH game templates found in DB; refusing to start without DB data");
        process.exit(1);
      }
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
    })
    .catch((err) => {
      logger.error("❌ Failed to load cash table configs; using defaults", err);
    });
}

const rateLimits = new Map<string, { window: number; count: number }>(); // key = `${wallet}:${route}`
const balanceCache = new Map<string, { ts: number; payload: any }>();
const BALANCE_CACHE_TTL_MS = 5000;

function invalidateBalanceCache(wallet?: string | null) {
  if (!wallet) return;
  balanceCache.delete(wallet.toLowerCase());
}

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
    const cached = balanceCache.get(wallet);
    const now = Date.now();
    if (cached && now - cached.ts < BALANCE_CACHE_TTL_MS) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cached.payload));
      return;
    }
    const receipt = await chain.getBalance(wallet);
    const payload = receipt.payload;
    balanceCache.set(wallet, { ts: now, payload });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
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

  // Admin: List all game templates
  if (url.pathname === '/api/admin/templates' && req.method === 'GET') {
    setCorsHeaders(res, origin);
    if (!prisma) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Database not configured" }));
      return;
    }
    const token = getBearerToken(req);
    const auth = token ? verifyAuthToken(token) : null;
    if (!auth || !isGovernanceAuthorized(auth.wallet)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    try {
      const templates = await prisma.gameTemplate.findMany({
        orderBy: [{ type: 'asc' }, { bigBlind: 'asc' }]
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ templates }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Failed to load templates" }));
    }
    return;
  }

  if (url.pathname === '/api/templates' && req.method === 'GET') {
    setCorsHeaders(res, origin);
    if (!prisma) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Database not configured" }));
      return;
    }
    try {
      const templates = await prisma.gameTemplate.findMany({
        orderBy: [{ type: 'asc' }, { bigBlind: 'asc' }],
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ templates }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Failed to load templates" }));
    }
    return;
  }

  // Admin: Force template sync (hot-reload)
  if (url.pathname === '/api/admin/sync' && req.method === 'POST') {
    setCorsHeaders(res, origin);
    if (!prisma) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Database not configured" }));
      return;
    }
    const token = getBearerToken(req);
    const auth = token ? verifyAuthToken(token) : null;
    if (!auth || !isGovernanceAuthorized(auth.wallet)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    try {
      const config = await prisma.systemConfig.upsert({
        where: { id: 'default' },
        update: { templatesVersion: { increment: 1 } },
        create: { id: 'default', templatesVersion: 1 },
      });
      logger.info(`🔄 Admin triggered template sync. New version: ${config.templatesVersion}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: config.templatesVersion }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Failed to sync templates" }));
    }
    return;
  }

  if (url.pathname === '/api/admin/game-config') {
    setCorsHeaders(res, origin);
    if (!prisma) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Database not configured" }));
      return;
    }
    const token = getBearerToken(req);
    const auth = token ? verifyAuthToken(token) : null;
    if (!auth || !isGovernanceAuthorized(auth.wallet)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    if (req.method === 'GET') {
      const config = await prisma.gameConfig.upsert({
        where: { id: "default" },
        update: {},
        create: {
          id: "default",
          actionTimeoutSeconds: 15,
          gameStartCountdownSeconds: 10,
          minPlayersToStart: 2,
          maxPlayersPerTable: 9,
          streetDealDelaySeconds: 3,
          newHandDelaySeconds: 5,
        },
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ config }));
      return;
    }
    if (req.method === 'POST') {
      try {
        const payload = await readRequestBody(req);
        const values = {
          actionTimeoutSeconds: Number(payload.actionTimeoutSeconds) || 15,
          gameStartCountdownSeconds: Number(payload.gameStartCountdownSeconds) || 10,
          minPlayersToStart: Number(payload.minPlayersToStart) || 2,
          maxPlayersPerTable: Number(payload.maxPlayersPerTable) || 9,
          streetDealDelaySeconds: Number(payload.streetDealDelaySeconds) || 3,
          newHandDelaySeconds: Number(payload.newHandDelaySeconds) || 5,
        };
        const updated = await prisma.gameConfig.upsert({
          where: { id: "default" },
          update: values,
          create: { id: "default", ...values },
        });
        logger.info("🧭 Game config updated", values);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, config: updated }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid config payload" }));
      }
      return;
    }
    res.writeHead(405);
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  if (url.pathname === '/api/admin/roles') {
    setCorsHeaders(res, origin);
    if (!prisma) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Database not configured" }));
      return;
    }
    const token = getBearerToken(req);
    const auth = token ? verifyAuthToken(token) : null;
    if (!auth || !isGovernanceAuthorized(auth.wallet)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    if (req.method === 'GET') {
      const assignments = await prisma.governanceAssignment.findMany({
        orderBy: { createdAt: "desc" },
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ roles: assignments }));
      return;
    }
    if (req.method === 'POST') {
      try {
        const payload = await readRequestBody(req);
        const wallet = normalizeLedgerWallet(payload.wallet);
        const role = payload.role as GovernanceRoleType;
        if (!wallet || !role || !GOVERNANCE_ROLES_LIST.includes(role)) {
          throw new Error("Invalid wallet or role");
        }
        await prisma.governanceAssignment.upsert({
          where: {
            wallet_role: { wallet, role },
          },
          update: {},
          create: { wallet, role },
        });
        await refreshGovernanceAssignments();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Invalid payload" }));
      }
      return;
    }
    res.writeHead(405);
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  if (url.pathname === '/api/admin/balance-pools' && req.method === 'GET') {
    setCorsHeaders(res, origin);
    if (!prisma) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Database not configured" }));
      return;
    }
    const token = getBearerToken(req);
    const auth = token ? verifyAuthToken(token) : null;
    if (!auth || !isGovernanceAuthorized(auth.wallet)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    const pools = await prisma.balancePool.findMany({
      include: { account: true },
      orderBy: { name: "asc" },
    });
    const payload = pools.map((pool) => ({
      id: pool.id,
      name: pool.name,
      description: pool.description,
      type: pool.type,
      asset: pool.asset,
      accountId: pool.accountId,
      account: {
        coins: pool.account.coins.toString(),
        ticket_x: pool.account.ticket_x.toString(),
        ticket_y: pool.account.ticket_y.toString(),
        ticket_z: pool.account.ticket_z.toString(),
      },
      updatedAt: pool.updatedAt,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ pools: payload }));
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

  if (url.pathname === '/api/user/registrations' && req.method === 'GET') {
    setCorsHeaders(res, origin);
    if (!ledger || !prisma) {
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
    try {
      const rows = await prisma.tournamentRegistration.findMany({
        where: {
          playerId: { equals: wallet, mode: "insensitive" },
          status: { in: ["REGISTERED", "SEATED"] },
          tournament: {
            status: { in: ["REGISTERING", "SCHEDULED", "RUNNING", "LATE_REG", "BREAKING"] },
          },
        },
        select: { tournamentId: true },
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ registrations: rows }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "failed to load registrations" }));
    }
    return;
  }

  if (url.pathname === '/api/user/active' && req.method === 'GET') {
    setCorsHeaders(res, origin);
    if (!ledger || !prisma) {
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
    try {
      const registrations = await prisma.tournamentRegistration.findMany({
        where: {
          playerId: { equals: wallet, mode: "insensitive" },
          status: { in: ["REGISTERED", "SEATED"] },
          tournament: {
            status: { in: ["REGISTERING", "SCHEDULED", "RUNNING", "LATE_REG", "BREAKING"] },
          },
        },
        select: {
          tournament: { select: { type: true } },
        },
      });
      const sngActive = registrations.some((r) => r.tournament.type === "STT");
      const mttActive = registrations.some((r) => r.tournament.type === "MTT");

      const cashTableIds = globalSeatMappings
        .getTablesForPlayer(wallet)
        .filter((tableId) => !/^(mtt|stt)-/i.test(tableId));
      const cashActive = cashTableIds.length > 0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ cashActive, cashTableIds, sngActive, mttActive }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "failed to load active games" }));
    }
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
    invalidateBalanceCache(wallet);
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
        invalidateBalanceCache(wallet);
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
const bridge = new WebSocketFSMBridge(sessions, ledger, prisma);
const botManager = new BotManager();
bridge.setBotManager(botManager);
const tournamentManager = new TournamentManager(prisma!);
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
        // Push balance update to winner
        void bridge.pushBalanceUpdate(p.playerId);
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

// Ensure initial SNG instances exist
tournamentOrchestrator.spawnInitialInstances();

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

/**
 * Send a sanitized TABLE_SNAPSHOT to a specific client
 */
function sendSanitizedSnapshot(ws: WebSocket, session: Session, roomId: string, table: Table, maxPlayers?: number) {
  const sanitized = sanitizeTableForSession(table, session, roomId);
  ws.send(JSON.stringify({
    tableId: roomId,
    type: "TABLE_SNAPSHOT",
    table: sanitized,
    maxPlayers,
  }));
}

function broadcast(roomId: string, event: ServerEvent): void {
  let sentCount = 0;

  wss.clients.forEach((client) => {
    const session = sessions.get(client);
    if (session?.roomId === roomId && client.readyState === WebSocket.OPEN) {
      try {
        let payload: any = event;

        // PER-PLAYER SANITIZATION
        if (event.type === "TABLE_SNAPSHOT") {
          const sanitized = sanitizeTableForSession((event as any).table, session, roomId);
          payload = { ...event, table: sanitized };
        } else if (event.type === "DEAL_HOLE") {
          // DEAL_HOLE arrives from bridge with all cards in a map: { pid: [c1, c2] }
          // We must transform it into the client-expected format: { seat, cards }
          // BUT only if this session is the owner of those cards.
          const allCards = (event as any).cards || {};
          const myPid = session.userId || session.sessionId;
          const myCards = allCards[myPid.toLowerCase()];
          
          if (myCards && session.seat !== undefined) {
            payload = {
              type: "DEAL_HOLE",
              tableId: roomId,
              seat: session.seat,
              cards: myCards,
            };
          } else {
            // Other players just see that cards were dealt (optional, but good for UI sync)
            // They don't get the 'cards' field, or get it as 'encrypted'
            payload = {
              type: "DEAL_HOLE",
              tableId: roomId,
              seat: -1, // Ignore for others
              cards: "encrypted",
            };
          }
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
  applyGovernanceRoles(session);
  void saveSession(session);
  
  // Send session info to client
  ws.send(JSON.stringify({
    tableId: "",
    type: "SESSION",
    sessionId: session.sessionId,
    userId: session.userId,
    isAdmin: isUserAdmin(session.userId),
    roles: session.roles ?? getGovernanceRoles(session.userId),
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
          const rawPlayerId = session.userId || session.sessionId;
          const playerId = rawPlayerId?.toLowerCase().trim();
          if (!playerId) {
            ws.send(JSON.stringify({
              tableId: "",
              type: "ERROR",
              code: "REGISTER_FAILED",
              msg: "Missing player identity",
            } satisfies ServerEvent));
            break;
          }
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
          // Push real-time status update
          void bridge.pushUserStatusUpdate(playerId);
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
          const rawPlayerId = session.userId || session.sessionId;
          const playerId = rawPlayerId?.toLowerCase().trim();
          if (!playerId) {
            ws.send(JSON.stringify({
              tableId: "",
              type: "ERROR",
              code: "UNREGISTER_FAILED",
              msg: "Missing player identity",
            } satisfies ServerEvent));
            break;
          }
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
          // Push real-time status update
          void bridge.pushUserStatusUpdate(playerId);
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
            const maxPlayers = bridge.getMaxPlayers(command.tableId, table);
            
            // Proactively restore seat mapping on rejoin to prevent action failures
            if (session.userId) {
              const normalizedId = session.userId.toLowerCase().trim();
              logger.debug(`🔧 [JOIN_TABLE] Attempting seat mapping recovery for ${normalizedId}`);
              
              // Check if player exists in FSM table state but not in seat mappings
              for (let i = 0; i < table.seats.length; i++) {
                const seat = table.seats[i];
                if (seat?.pid && seat.pid.toLowerCase().trim() === normalizedId) {
                  // Found player in FSM - restore their seat mapping
                  session.seat = i;
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
            
            sendSanitizedSnapshot(ws, session, command.tableId, table, maxPlayers);
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
            applyGovernanceRoles(existing);
            void saveSession(existing);
            
            ws.send(JSON.stringify({
              tableId: existing.roomId ?? "",
              type: "SESSION",
              sessionId: existing.sessionId,
              userId: existing.userId,
              isAdmin: isUserAdmin(existing.userId),
              roles: existing.roles ?? getGovernanceRoles(existing.userId),
            } satisfies ServerEvent));
            
            if (existing.roomId) {
              try {
                const table = bridge.getTableState(existing.roomId);
                const maxPlayers = bridge.getMaxPlayers(existing.roomId, table);
                sendSanitizedSnapshot(ws, session, existing.roomId, table, maxPlayers);
              } catch (err) {
                logger.warn(`⚠️ [REATTACH] Table ${existing.roomId} not found; skipping snapshot`, err);
              }
            }
            if (existing.userId) {
              void bridge.pushUserStatusUpdate(existing.userId);
            }
          }
          break;

        case "ATTACH":
          const normalizedUserId = command.userId.toLowerCase().trim();
          const attached = sessions.attach(ws, normalizedUserId);
          if (attached) {
            session.userId = attached.userId;
            applyGovernanceRoles(session);
            session.roomId = session.roomId || attached.roomId;

            // Proactively recover seat for immediate snapshot correctly
            if (session.roomId) {
              try {
                const table = bridge.getTableState(session.roomId);
                for (let i = 0; i < table.seats.length; i++) {
                  const s = table.seats[i];
                  if (s?.pid && s.pid.toLowerCase().trim() === normalizedUserId) {
                    session.seat = i;
                    break;
                  }
                }
              } catch {}
            }

            sessions.handleReconnect(attached);
            void saveSession(session);
            
            ws.send(JSON.stringify({
              tableId: session.roomId ?? "",
              type: "SESSION",
              sessionId: attached.sessionId,
              userId: attached.userId,
              isAdmin: isUserAdmin(attached.userId),
              roles: session.roles ?? getGovernanceRoles(attached.userId),
            } satisfies ServerEvent));
            
            if (session.roomId) {
              try {
                const table = bridge.getTableState(session.roomId);
                const maxPlayers = bridge.getMaxPlayers(session.roomId, table);
                sendSanitizedSnapshot(ws, session, session.roomId, table, maxPlayers);
              } catch (err) {
                logger.warn(`⚠️ [ATTACH] Table ${session.roomId} not found; skipping snapshot`, err);
              }
            }
            if (attached.userId) {
              void bridge.pushUserStatusUpdate(attached.userId);
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
    
    // Rehydrate each room into the bridge
    for (const room of rooms) {
      try {
        bridge.rehydrateEngine(room);
      } catch (err) {
        logger.error(`❌ Failed to rehydrate room ${room.id}:`, err);
      }
    }
    
    // Using pure Table format for persistence
    logger.info(`✅ Pure FSM architecture - rehydrated ${rooms.length} tables`);
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
