// src/hooks/useGameStore.ts
import { create } from "zustand";
import {
  type SeatUIState,
  type Phase,
  type ServerEvent,
  type ClientCommand,
  type GovernanceRole,
} from "../game-engine";
import { shortAddress } from "../utils/address";
import { seatStore } from "../stores/seatStore";
import { resolveWebSocketUrl } from "../utils/ws-url";
import type { CountdownData, CountdownType } from "./useCountdown";

/** Map Phase strings to numeric street indices used by the UI */
const phaseToStreet: Record<string, number> = {
  waiting: -1, // Not in active play
  deal: -1, // Cards being dealt, no street yet
  preflop: 0, // Preflop betting round
  flop: 1, // Flop betting round
  turn: 2, // Turn betting round
  river: 3, // River betting round
  showdown: 4, // Showdown phase
  payout: 4, // Payout phase (maintain showdown display)
  handEnd: -1, // Hand complete, back to waiting
};

let socket: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectTimeout: NodeJS.Timeout | null = null;

const DEFAULT_SMALL_BLIND = 25;
const DEFAULT_BIG_BLIND = DEFAULT_SMALL_BLIND * 2;
const DEFAULT_MAX_PLAYERS = 9;

const countdownOrder: CountdownType[] = [
  "action",
  "reconnect",
  "game_start",
  "street_deal",
  "new_hand",
];

function isCountdownType(value: unknown): value is CountdownType {
  return typeof value === "string" && countdownOrder.includes(value as CountdownType);
}

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

function parseAmount(val: any): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

interface GameStoreState {
  playerHands: ([number, number] | "encrypted" | null)[];
  community: (number | null)[];
  chips: number[];
  playerBets: number[];
  playerStates: SeatUIState[];
  players: (string | null)[];
  playerIds: (string | null)[];
  /** which seat is the dealer */
  dealerIndex: number | null;
  pot: number;
  currentTurn: number | null;
  street: number;
  /** current phase of the game */
  phase: string | null;
  loading: boolean;
  error: string | null;
  logs: string[];
  addLog: (msg: string) => void;
  smallBlind: number;
  bigBlind: number;
  /** minimum raise amount required to reopen betting */
  minRaise: number;
  startBlindTimer: () => void;
  socket: WebSocket | null;
  /** current connected wallet address - single source of truth */
  currentWalletId: string | null;
  /** map of tableId to seatIndex for multi-table support */
  tableSeats: Map<string, number>;
  /** current table ID */
  tableId: string | null;
  /** current table type */
  tableType: "cash" | "stt" | "mtt" | null;
  /** max seats for current table */
  tableMaxPlayers: number;
  /** unified countdown timer from server (legacy) */
  timer: number | null;
  /** client-driven countdown data by type */
  countdowns: Map<CountdownType, CountdownData>;
  /** track which players have revealed their cards at showdown */
  cardsRevealed: boolean[];
  /** user preference: reveal own cards automatically at showdown */
  autoRevealAtShowdown: boolean;
  setAutoRevealAtShowdown: (v: boolean) => void;
  /** track recent winners for sparkle effects */
  recentWinners: Set<number>;
  /** last action label per seat (UI-ready, event-driven) */
  lastActionLabels: (string | null)[];
  /** WebSocket connection state */
  connectionState: "disconnected" | "connecting" | "connected" | "reconnecting";
  /** Connection error message */
  connectionError: string | null;
  /** Action history for the current hand */
  actionHistory: Array<{ playerId: string; action: string; amount?: number }>;
  /** User asset balances (synced via WebSocket) */
  balances: {
    coins: number;
    tickets: {
      ticket_x: number;
      ticket_y: number;
      ticket_z: number;
    };
  };
  /** User active play status (synced via WebSocket) */
  activeStatus: {
    cashActive: boolean;
    cashTableIds: string[];
    sngActive: boolean;
    mttActive: boolean;
  };
  /** Governance roles granted to this wallet */
  governanceRoles: GovernanceRole[];
  setGovernanceRoles: (roles: GovernanceRole[]) => void;
  /** Whether current user is an admin */
  isAdmin: boolean;

  connectWallet: (address: string) => void;
  handleDisconnect: () => Promise<void>;
  joinTable: (tableId: string) => void;
  createTable: (name: string) => Promise<void>;
  joinSeat: (seatIdx: number, tableId?: string, chips?: number) => Promise<void>;
  leaveSeat: (tableId?: string) => Promise<void>;
  leaveAllTables: () => Promise<void>;
  sitOut: (tableId?: string) => Promise<void>;
  sitIn: (tableId?: string) => Promise<void>;
  playerAction: (action: {
    type: "FOLD" | "CALL" | "RAISE" | "CHECK" | "BET" | "ALLIN";
    amount?: number;
  }) => Promise<void>;
  startHand: () => Promise<void>;
  dealFlop: () => Promise<void>;
  dealTurn: () => Promise<void>;
  dealRiver: () => Promise<void>;
  rebuy: (amount: number) => Promise<void>;
  revealCards: (seatIndex: number) => void;
  resetCardReveals: () => void;
  markWinner: (seatIndex: number) => void;
  clearWinners: () => void;
  showCards: () => Promise<void>;
  muckCards: () => Promise<void>;
  setBalances: (balances: GameStoreState["balances"]) => void;
  setActiveStatus: (status: GameStoreState["activeStatus"]) => void;
  /** Direct injection of server events (used for replayer/demos) */
  processServerEvent: (msg: ServerEvent) => void;
  /** User intent to show cards at the end of the hand */
  showCardsIntent: boolean;
  setShowCardsIntent: (intent: boolean) => void;
}

export const useGameStore = create<GameStoreState>((set, get) => {
  const isWebSocketDisabled = () => {
    if (typeof window === "undefined") return false;
    const flag = (window as any).__POKERWARS_DISABLE_WS__ === true;
    const path = window.location?.pathname || "";
    return flag || path.startsWith("/table6-test") || path.startsWith("/table9-test");
  };

  const processServerEvent = (msg: ServerEvent) => {
    switch (msg.type) {
      case "SESSION": {
        console.log("📨 Received SESSION message:", msg);
        try {
          const roles = msg.roles ?? (msg.isAdmin ? ["admin"] : []);
          const normalizedWallet = msg.userId?.toLowerCase().trim() || null;
          if ((msg as any).sessionId) {
            localStorage.setItem("sessionId", (msg as any).sessionId);
            console.log("💾 Stored sessionId:", (msg as any).sessionId);
          }
          if (normalizedWallet) {
            localStorage.setItem("walletAddress", normalizedWallet);
            set({ currentWalletId: normalizedWallet });
            console.log("💾 Stored wallet address:", normalizedWallet);
          }
          set({
            governanceRoles: roles,
            isAdmin: msg.isAdmin ?? roles.includes("admin"),
          });
        } catch (e) {
          console.error("🚫 Failed to persist session info:", e);
        }
        break;
      }
      case "TABLE_CREATED":
        // Automatically join the table that was just created
        set({
          tableId: msg.table.id,
          tableMaxPlayers: msg.table.maxPlayers ?? get().tableMaxPlayers,
        });
        get().addLog(`Created table: ${msg.table.name}`);
        break;
      case "TABLE_SNAPSHOT":
        console.log("📨 Received TABLE_SNAPSHOT message");
        if (Array.isArray((msg as any).countdowns)) {
          const nextCountdowns = new Map<CountdownType, CountdownData>();
          (msg as any).countdowns.forEach((c: CountdownData) => {
            if (c && isCountdownType(c.type)) nextCountdowns.set(c.type, c);
          });
          set({ countdowns: nextCountdowns });
        }
        applySnapshot(msg.table as any, msg.maxPlayers);
        break;
      case "PLAYER_JOINED":
        set((s) => {
          if (msg.playerId === s.currentWalletId) {
            const newTableSeats = new Map(s.tableSeats);
            newTableSeats.set(msg.tableId || s.tableId || "", msg.seat);
            return { tableSeats: newTableSeats };
          }
          return {};
        });
        get().addLog(`${shortAddress(msg.playerId)} joined`);
        break;
      case "PLAYER_LEFT":
        set((s) => {
          const states = [...s.playerStates];
          const chips = [...s.chips];
          const bets = [...s.playerBets];
          const hands = [...s.playerHands];
          const names = [...s.players];
          const ids = [...s.playerIds];

          states[msg.seat] = "empty";
          chips[msg.seat] = 0;
          bets[msg.seat] = 0;
          hands[msg.seat] = null;
          names[msg.seat] = null;
          ids[msg.seat] = null;

          if (msg.playerId === s.currentWalletId) {
            const newTableSeats = new Map(s.tableSeats);
            newTableSeats.delete(msg.tableId || s.tableId || "");
            return {
              playerStates: states,
              chips,
              playerBets: bets,
              playerHands: hands,
              players: names,
              playerIds: ids,
              tableSeats: newTableSeats,
            };
          }

          return {
            playerStates: states,
            chips,
            playerBets: bets,
            playerHands: hands,
            players: names,
            playerIds: ids,
          };
        });
        get().addLog(`${shortAddress(msg.playerId)} left`);
        break;
      case "PLAYER_SIT_OUT":
        try {
          const tableId = get().tableId;
          const s = get().socket;
          if (tableId && s && s.readyState === WebSocket.OPEN) {
            const cmd: ClientCommand = {
              cmdId: crypto.randomUUID(),
              type: "JOIN_TABLE",
              tableId,
            } as any;
            s.send(JSON.stringify(cmd));
          }
        } catch {}
        get().addLog(`${shortAddress(msg.playerId)} sat out`);
        break;
      case "PLAYER_SIT_IN":
        try {
          const tableId = get().tableId;
          const s = get().socket;
          if (tableId && s && s.readyState === WebSocket.OPEN) {
            const cmd: ClientCommand = {
              cmdId: crypto.randomUUID(),
              type: "JOIN_TABLE",
              tableId,
            } as any;
            s.send(JSON.stringify(cmd));
          }
        } catch {}
        get().addLog(`${shortAddress(msg.playerId)} sat in`);
        break;
      case "PLAYER_DISCONNECTED":
        set((s) => {
          const states = [...s.playerStates];
          const chips = [...s.chips];
          const bets = [...s.playerBets];
          const hands = [...s.playerHands];
          const labels = [...s.lastActionLabels];
          const revealed = [...s.cardsRevealed];
          const winners = new Set(s.recentWinners);
          const names = [...s.players];
          const ids = [...s.playerIds];

          states[msg.seat] = "empty";
          chips[msg.seat] = 0;
          bets[msg.seat] = 0;
          hands[msg.seat] = null;
          labels[msg.seat] = null;
          revealed[msg.seat] = false;
          names[msg.seat] = null;
          ids[msg.seat] = null;
          winners.delete(msg.seat);

          const dealerIndex = s.dealerIndex === msg.seat ? null : s.dealerIndex;
          const currentTurn = s.currentTurn === msg.seat ? null : s.currentTurn;

          if (msg.playerId === s.currentWalletId) {
            const newTableSeats = new Map(s.tableSeats);
            newTableSeats.delete(msg.tableId || s.tableId || "");
            return {
              playerStates: states,
              chips,
              playerBets: bets,
              playerHands: hands,
              lastActionLabels: labels,
              cardsRevealed: revealed,
              recentWinners: winners,
              dealerIndex,
              currentTurn,
              players: names,
              playerIds: ids,
              tableSeats: newTableSeats,
            };
          }

          return {
            playerStates: states,
            chips,
            playerBets: bets,
            playerHands: hands,
            lastActionLabels: labels,
            cardsRevealed: revealed,
            recentWinners: winners,
            dealerIndex,
            currentTurn,
            players: names,
            playerIds: ids,
          };
        });
        get().addLog(`${shortAddress(msg.playerId)} disconnected`);
        break;
      case "PLAYER_SAT_OUT":
      case "PLAYER_SAT_IN":
        try {
          const tableId = get().tableId;
          const s = get().socket;
          if (tableId && s && s.readyState === WebSocket.OPEN) {
            const cmd: ClientCommand = {
              cmdId: crypto.randomUUID(),
              type: "JOIN_TABLE",
              tableId,
            } as any;
            s.send(JSON.stringify(cmd));
          }
        } catch {}
        break;
      case "PLAYER_REJOINED":
        set((s) => {
          const states = [...s.playerStates];
          states[msg.seat] = "active";
          return { playerStates: states };
        });
        get().addLog(`${shortAddress(msg.playerId)} rejoined`);
        break;
      case "ACTION_PROMPT":
        set({ currentTurn: msg.actingIndex, minRaise: msg.minRaise });
        break;
      case "PLAYER_ACTION_APPLIED": {
        const name = shortAddress(msg.playerId);
        console.log(`🎮 Action Applied: ${name} ${msg.action} ${msg.amount || ""}`);
        let text = ``;
        switch (msg.action) {
          case "FOLD": text = `${name} folds`; break;
          case "CHECK": text = `${name} checks`; break;
          case "CALL": text = `${name} calls ${msg.amount ?? ""}`.trim(); break;
          case "BET":
          case "RAISE":
          case "ALLIN":
            text = `${name} ${msg.action.toLowerCase()} ${msg.amount ?? ""}`.trim();
            break;
        }
        if (text) get().addLog(text);
        // Do not optimistically mutate chips/bets here; TABLE_SNAPSHOT is authoritative.
        set((s) => ({
          actionHistory: [
            ...s.actionHistory,
            { playerId: msg.playerId, action: msg.action, amount: (msg as any).amount },
          ],
        }));
        break;
      }
      case "DEAL_HOLE":
        set((s) => {
          const hands = [...s.playerHands];
          hands[msg.seat] = msg.cards as [number, number];
          return { playerHands: hands };
        });
        break;
      case "DEAL_FLOP":
        set((s) => {
          const addToPot = (s.playerBets || []).reduce((sum, b) => sum + (b || 0), 0);
          const comm = [...s.community];
          msg.cards.forEach((c, i) => (comm[i] = c as number));
          return { community: comm, lastActionLabels: Array(9).fill(null), playerBets: Array(9).fill(0), pot: (s.pot || 0) + addToPot };
        });
        break;
      case "DEAL_TURN":
        set((s) => {
          const addToPot = (s.playerBets || []).reduce((sum, b) => sum + (b || 0), 0);
          const comm = [...s.community];
          comm[3] = msg.card as number;
          return { community: comm, lastActionLabels: Array(9).fill(null), playerBets: Array(9).fill(0), pot: (s.pot || 0) + addToPot };
        });
        break;
      case "DEAL_RIVER":
        set((s) => {
          const addToPot = (s.playerBets || []).reduce((sum, b) => sum + (b || 0), 0);
          const comm = [...s.community];
          comm[4] = msg.card as number;
          return { community: comm, lastActionLabels: Array(9).fill(null), playerBets: Array(9).fill(0), pot: (s.pot || 0) + addToPot };
        });
        break;
      case "HAND_START":
        get().addLog("Dealer: Hand started");
        get().resetCardReveals();
        get().clearWinners();
        set({ showCardsIntent: false, actionHistory: [], lastActionLabels: Array(9).fill(null), playerBets: Array(9).fill(0), playerHands: Array(9).fill(null), community: Array(5).fill(null) });
        break;
      case "HAND_END":
        get().addLog("Dealer: Hand complete");
        break;
      case "ROUND_END":
        set((s) => {
          const addToPot = (s.playerBets || []).reduce((sum, b) => sum + (b || 0), 0);
          return { playerBets: Array(9).fill(0), lastActionLabels: Array(9).fill(null), pot: (s.pot || 0) + addToPot };
        });
        break;
      case "TIMER":
        set({ timer: msg.countdown });
        if (msg.countdown === 0) set({ timer: null });
        break;
      case "COUNTDOWN_START":
        set((state) => {
          if (!isCountdownType(msg.countdownType)) return {};
          const countdowns = new Map(state.countdowns);
          countdowns.set(msg.countdownType, { startTime: msg.startTime, duration: msg.duration, metadata: msg.metadata, type: msg.countdownType });
          return { countdowns };
        });
        break;
      case "GAME_START_COUNTDOWN":
        set((state) => {
          const countdowns = new Map(state.countdowns);
          countdowns.set("game_start", { startTime: Date.now(), duration: msg.countdown * 1000, metadata: { activePlayerCount: msg.activePlayerCount, totalPlayerCount: msg.totalPlayerCount }, type: "game_start" });
          return { countdowns, timer: msg.countdown };
        });
        break;
      case "TABLE_RESET":
        seatStore.getState().reset();
        set({ showCardsIntent: false, playerHands: Array(9).fill(null), community: Array(5).fill(null), chips: Array(9).fill(0), playerBets: Array(9).fill(0), playerStates: Array(9).fill("empty"), players: Array(9).fill(null), playerIds: Array(9).fill(null), dealerIndex: null, pot: 0, currentTurn: null, street: 0, cardsRevealed: Array(9).fill(false), lastActionLabels: Array(9).fill(null) });
        break;
      case "SHOWDOWN":
        get().addLog(`🃏 Showdown!`);
        try {
          if (get().autoRevealAtShowdown || get().showCardsIntent) void get().showCards();
        } catch (e) {}
        break;
      case "DEALER_MESSAGE":
        get().addLog(`🎯 Dealer: ${msg.message}`);
        break;
      case "WINNER_ANNOUNCEMENT":
        set((s) => {
          const revealed = [...s.cardsRevealed];
          const labels = [...s.lastActionLabels];
          const winnersSet = new Set(s.recentWinners);
          msg.winners.forEach((winner) => {
            if (winner.seat >= 0) {
              winnersSet.add(winner.seat);
              revealed[winner.seat] = true;
              labels[winner.seat] = "Win";
            }
          });
          return { cardsRevealed: revealed, lastActionLabels: labels, recentWinners: winnersSet };
        });
        setTimeout(() => {
          try {
            const tableId = get().tableId;
            const s = get().socket;
            if (tableId && s && s.readyState === WebSocket.OPEN) {
              const cmd: ClientCommand = { cmdId: crypto.randomUUID(), type: "JOIN_TABLE", tableId } as any;
              s.send(JSON.stringify(cmd));
            }
          } catch (e) {}
        }, 2000);
        break;
      case "PLAYER_REVEALED":
        set((s) => {
          const cardsRevealed = [...s.cardsRevealed];
          if (msg.seat >= 0 && msg.seat < cardsRevealed.length) cardsRevealed[msg.seat] = true;
          return { cardsRevealed };
        });
        break;
      case "PLAYER_WAITING":
        set((s) => {
          const states = [...s.playerStates];
          states[msg.seat] = "active";
          if (msg.playerId === s.currentWalletId) {
            const newTableSeats = new Map(s.tableSeats);
            newTableSeats.set(msg.tableId || s.tableId || "", msg.seat);
            return { playerStates: states, tableSeats: newTableSeats };
          }
          return { playerStates: states };
        });
        get().addLog(`${shortAddress(msg.playerId)} waiting for next hand`);
        break;
      case "BALANCE_UPDATE":
        set({
          balances: {
            coins: parseInt(msg.coins),
            tickets: { ticket_x: parseInt(msg.tickets.ticket_x), ticket_y: parseInt(msg.tickets.ticket_y), ticket_z: parseInt(msg.tickets.ticket_z) },
          },
        });
        break;
      case "USER_STATUS_UPDATE":
        set({ activeStatus: { cashActive: msg.cashActive, cashTableIds: msg.cashTableIds, sngActive: msg.sngActive, mttActive: msg.mttActive } });
        break;
      case "ERROR":
        set({ error: msg.msg });
        try {
          const tableId = get().tableId;
          const s = get().socket;
          if (tableId && s && s.readyState === WebSocket.OPEN) {
            const cmd: ClientCommand = { cmdId: crypto.randomUUID(), type: "JOIN_TABLE", tableId } as any;
            s.send(JSON.stringify(cmd));
          }
        } catch (e) {}
        break;
    }
  };

  function shouldHaveCards(seat: any, phase: string): boolean {
    const hasValidStatus = seat.status && !["empty", "sittingOut"].includes(seat.status);
    const gameStarted = ["preflop", "flop", "turn", "river", "showdown"].includes(phase);
    const notFolded = seat.status !== "folded";
    return hasValidStatus && gameStarted && notFolded;
  }

  function applySnapshot(room: any = {}, maxPlayers?: number) {
    if (!room || Object.keys(room).length === 0) {
      console.warn("⚠️ applySnapshot called with empty room data");
      return;
    }
    console.log(`📸 Applying snapshot for table ${room.id || "unknown"} (Phase: ${room.phase})`);
    
    try {
      const seats = Array(9).fill(null);
      const ids = Array(9).fill(null);
      const hands = Array(9).fill(null);
      const chips = Array(9).fill(0);
      const bets = Array(9).fill(0);
      const states = Array(9).fill("empty");
      const labels = Array(9).fill(null);

      const currentWalletId = get().currentWalletId;
      let mySeatIndex: number | undefined = undefined;

      if (room.seats && Array.isArray(room.seats)) {
        room.seats.forEach((seat: any, index: number) => {
          if (seat.pid) {
            if (currentWalletId && seat.pid.toLowerCase() === currentWalletId.toLowerCase()) mySeatIndex = index;
            seats[index] = seat.nickname || shortAddress(seat.pid);
            ids[index] = seat.pid;
            if (seat.holeCards?.length === 2) hands[index] = [seat.holeCards[0], seat.holeCards[1]];
            else if (shouldHaveCards(seat, room.phase)) hands[index] = "encrypted";
                      chips[index] = parseAmount(seat.chips);
                      bets[index] = parseAmount(seat.streetCommitted);
                      states[index] = seat.action === "SITTING_OUT" ? "sittingOut" : seat.status || "empty";
                      
                      // Populate action labels from snapshot
                      if (seat.action && seat.action !== "SITTING_OUT") {
                        const actionMap: Record<string, string> = {
                          "FOLD": "Fold",
                          "CHECK": "Check",
                          "CALL": "Call",
                          "BET": "Bet",
                          "RAISE": "Raise",
                          "ALLIN": "All In"
                        };
                        labels[index] = actionMap[seat.action] || seat.action;
                      }
                      
                      seatStore.getState().assignSeat(index, { playerId: seat.pid, name: seats[index], chips: chips[index] });          } else {
            seatStore.getState().clearSeat(index);
          }
        });
      }

      const comm = Array(5).fill(null);
      const newCards = room.communityCards ?? [];
      newCards.forEach((c: any, i: number) => { comm[i] = c; });

      const pot = (parseAmount(room.pot) || room.pots?.reduce((sum: number, pt: any) => sum + parseAmount(pt.amount), 0)) ?? 0;
      const revealedSet = new Set((room.revealedPids || []).map((p: string) => p.toLowerCase()));
      const winnersSet = new Set(get().recentWinners);
      const cardsRevealed = ids.map((pid, idx) =>
        pid ? (revealedSet.has(pid.toLowerCase()) || winnersSet.has(idx)) : false
      );

      // Preserve winner label even if snapshot action is missing/cleared
      winnersSet.forEach((idx) => {
        if (idx >= 0 && idx < labels.length) labels[idx] = "Win";
      });

      const tableId = room.id || get().tableId;
      const newTableSeats = new Map(get().tableSeats);
      if (tableId && mySeatIndex !== undefined) newTableSeats.set(tableId, mySeatIndex);

      set({
        playerHands: hands, community: comm, chips, playerBets: bets, playerStates: states, players: seats, playerIds: ids,
        tableMaxPlayers: maxPlayers ?? get().tableMaxPlayers, tableType: room.tableType ?? room.type ?? get().tableType,
        cardsRevealed, lastActionLabels: labels, dealerIndex: room.dealerIndex ?? null, pot, tableSeats: newTableSeats, tableId,
        currentTurn: room.actor !== undefined ? room.actor : null,
        street: phaseToStreet[room.phase] ?? 0, phase: room.phase ?? null,
        smallBlind: room.smallBlind ?? get().smallBlind, bigBlind: room.bigBlind ?? get().bigBlind, minRaise: room.minRaise ?? room.bigBlind ?? get().minRaise,
      });
      console.log(`✅ Snapshot applied successfully for ${tableId}`);
    } catch (err) {
      console.error("❌ Failed to apply table snapshot:", err, room);
    }
  }

  const connectWebSocket = () => {
    if (isWebSocketDisabled()) return;
    const wsUrl = resolveWebSocketUrl();
    if (!wsUrl) return;
    socket = new WebSocket(wsUrl);
    
    socket.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data as string, numericReviver);
        if (msg.type !== "TABLE_SNAPSHOT") {
          console.log(`📨 WebSocket Event: ${msg.type}`, msg);
        }
        processServerEvent(msg);
      } catch (err) {
        console.error("❌ Failed to parse or process WebSocket message:", err, ev.data);
      }
    });

    socket.onopen = () => {
      reconnectAttempts = 0;
      set({ connectionState: "connected", connectionError: null });
      const persistedSessionId = localStorage.getItem("sessionId");
      if (persistedSessionId) socket?.send(JSON.stringify({ type: "REATTACH", sessionId: persistedSessionId }));
      const address = localStorage.getItem("walletAddress");
      if (address) {
        const normalized = address.trim().toLowerCase();
        socket?.send(JSON.stringify({ type: "ATTACH", userId: normalized }));
        set({ currentWalletId: normalized });
      }
      const pendingTable = get().tableId;
      if (pendingTable) socket?.send(JSON.stringify({ type: "JOIN_TABLE", tableId: pendingTable }));
    };
    socket.onclose = (event) => {
      set({ connectionState: "disconnected", connectionError: event.reason || `Connection closed (${event.code})` });
      if (event.code !== 1000 && event.code !== 1001) scheduleReconnect();
    };
    socket.onerror = () => {
      set({ connectionState: "disconnected", connectionError: "Connection failed" });
      scheduleReconnect();
    };
    set({ socket, connectionState: "connecting" });
  };

  const scheduleReconnect = () => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectAttempts++;
    reconnectTimeout = setTimeout(() => connectWebSocket(), Math.min(1000 * Math.pow(2, reconnectAttempts), 30000));
    set({ connectionState: "reconnecting" });
  };

  if (typeof window !== "undefined" && !socket && !isWebSocketDisabled()) connectWebSocket();

  return {
    playerHands: Array(9).fill(null), community: Array(5).fill(null), chips: Array(9).fill(0), playerBets: Array(9).fill(0),
    playerStates: Array(9).fill("empty"), players: Array(9).fill(null), playerIds: Array(9).fill(null),
    dealerIndex: null, pot: 0, currentTurn: null, street: 0, phase: null, loading: false, error: null, logs: [],
    addLog: (msg) => set((s) => ({ logs: [...s.logs, msg] })),
    cardsRevealed: Array(9).fill(false),
    autoRevealAtShowdown: (typeof window !== "undefined" ? (localStorage.getItem("autoRevealAtShowdown") ?? "true") : "true") === "true",
    setAutoRevealAtShowdown: (v) => {
      if (typeof window !== "undefined") localStorage.setItem("autoRevealAtShowdown", v ? "true" : "false");
      set({ autoRevealAtShowdown: v });
    },
    recentWinners: new Set<number>(), lastActionLabels: Array(9).fill(null),
    smallBlind: DEFAULT_SMALL_BLIND, bigBlind: DEFAULT_BIG_BLIND, minRaise: DEFAULT_BIG_BLIND,
    startBlindTimer: () => {},
    socket, currentWalletId: null, tableSeats: new Map(), tableId: null, tableType: null, tableMaxPlayers: DEFAULT_MAX_PLAYERS,
    timer: null, countdowns: new Map(), connectionState: "disconnected", connectionError: null, actionHistory: [],
    balances: { coins: 0, tickets: { ticket_x: 0, ticket_y: 0, ticket_z: 0 } },
    activeStatus: { cashActive: false, cashTableIds: [], sngActive: false, mttActive: false },
    governanceRoles: [], isAdmin: false,
    setGovernanceRoles: (roles) => set({ governanceRoles: roles, isAdmin: roles.includes("admin") }),
    connectWallet: (address) => {
      const normalized = (address || "").trim().toLowerCase();
      set({ currentWalletId: normalized });
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ATTACH", userId: normalized }));
    },
    handleDisconnect: async () => {
      localStorage.removeItem("walletAddress");
      localStorage.removeItem("sessionId");
      set({ currentWalletId: null, tableSeats: new Map(), tableId: null });
    },
    joinTable: (tableId) => {
      set({ tableId });
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "JOIN_TABLE", tableId }));
    },
    createTable: async (name) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "CREATE_TABLE", name }));
    },
    joinSeat: async (seatIdx, tableId, chips) => {
      const currentTableId = tableId || get().tableId;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "SIT", tableId: currentTableId, seat: seatIdx, chips, playerId: get().currentWalletId, nickname: shortAddress(get().currentWalletId || "") }));
      }
    },
    leaveSeat: async (tableId) => {
      const currentTableId = tableId || get().tableId;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "LEAVE", tableId: currentTableId }));
    },
    leaveAllTables: async () => {},
    sitOut: async (tableId) => {
      const currentTableId = tableId || get().tableId;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "SIT_OUT", tableId: currentTableId }));
    },
    sitIn: async (tableId) => {
      const currentTableId = tableId || get().tableId;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "SIT_IN", tableId: currentTableId }));
    },
    startHand: async () => {},
    dealFlop: async () => {},
    dealTurn: async () => {},
    dealRiver: async () => {},
    playerAction: async (action) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ACTION", action: action.type, amount: action.amount, playerId: get().currentWalletId || undefined }));
      }
    },
    rebuy: async (amount) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "REBUY", amount }));
    },
    revealCards: (seatIndex) => set((s) => {
      const newRevealed = [...s.cardsRevealed];
      newRevealed[seatIndex] = true;
      return { cardsRevealed: newRevealed };
    }),
    resetCardReveals: () => set({ cardsRevealed: Array(9).fill(false) }),
    markWinner: (seatIndex) => set((s) => {
      const newWinners = new Set(s.recentWinners);
      newWinners.add(seatIndex);
      return { recentWinners: newWinners };
    }),
    clearWinners: () => set({ recentWinners: new Set() }),
    showCards: async () => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "SHOW_CARDS" }));
    },
    muckCards: async () => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "MUCK_CARDS" }));
    },
    setBalances: (balances) => set({ balances }),
    setActiveStatus: (activeStatus) => set({ activeStatus }),
    processServerEvent,
    showCardsIntent: false,
    setShowCardsIntent: (intent) => set({ showCardsIntent: intent }),
  };
});
