// src/hooks/useGameStore.ts
import { create } from "zustand";
import {
  type SeatUIState,
  type Phase,
  type ServerEvent,
  type ClientCommand,
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

  connectWallet: (address: string) => void;
  handleDisconnect: () => Promise<void>;
  joinTable: (tableId: string) => void;
  createTable: (name: string) => Promise<void>;
  joinSeat: (seatIdx: number, tableId?: string) => Promise<void>;
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
}

export const useGameStore = create<GameStoreState>((set, get) => {
  // Helper function to determine if a player should have cards dealt
  function shouldHaveCards(seat: any, phase: string): boolean {
    // Player should have cards if:
    // 1. They are active (not folded, not sitting out)
    // 2. Game has progressed past initial setup (preflop or later)
    // 3. They haven't left the table
    const hasValidStatus =
      seat.status && !["empty", "sittingOut"].includes(seat.status);
    const gameStarted = [
      "preflop",
      "flop",
      "turn",
      "river",
      "showdown",
    ].includes(phase);
    const notFolded = seat.status !== "folded";

    return hasValidStatus && gameStarted && notFolded;
  }

  function applySnapshot(room: any, maxPlayers?: number) {
    console.log("📸 Applying TABLE_SNAPSHOT:", {
      seatsCount: room.seats?.length || 0,
      phase: room.phase,
    });

    // Start with completely fresh arrays to ensure proper cleanup
    const seats = Array(9).fill(null) as (string | null)[];
    const ids = Array(9).fill(null) as (string | null)[];
    const hands = Array(9).fill(null) as (
      | [number, number]
      | "encrypted"
      | null
    )[];
    const chips = Array(9).fill(0) as number[];
    const bets = Array(9).fill(0) as number[];
    const states = Array(9).fill("empty") as SeatUIState[];
    const labels = Array(9).fill(null) as (string | null)[];

    // Get current state to preserve player's own cards
    const currentState = get();
    const currentWalletId = currentState.currentWalletId;

    // Populate only seats that have active players
    // Handle both new EventEngine format (seats array) and legacy format (players array)
    if (room.seats && Array.isArray(room.seats)) {
      // New EventEngine format
      const seatNameCache = (() => {
        try {
          // Pull latest names from seatStore as an additional fallback
          const m = seatStore.getState().seats;
          return m;
        } catch {
          return new Map<number, { playerId: string; name?: string | null }>();
        }
      })();
      room.seats.forEach((seat: any, index: number) => {
        if (seat.pid) {
          // Always ensure we have a display name - preserve existing name if new snapshot doesn't provide one
          const currentName = currentState.players[index];
          const cached = seatNameCache.get(index);
          const cachedName = cached && cached.playerId?.toLowerCase() === seat.pid.toLowerCase() ? cached.name : null;
          seats[index] = seat.nickname || currentName || cachedName || shortAddress(seat.pid);
          ids[index] = seat.pid;

          // Handle card display logic:
          // - If holeCards exist and have 2 cards: show real cards
          // - If holeCards undefined but player should have cards: use 'encrypted' marker for card backs
          // - For player's own seat: preserve cards even when folded
          if (seat.holeCards?.length === 2) {
            // Always trust direct cards from server
            hands[index] = [seat.holeCards[0], seat.holeCards[1]];
          } else if (seat.pid === currentWalletId && currentState.playerHands[index] && Array.isArray(currentState.playerHands[index])) {
            // Preserve my cards if I already saw them this hand
            hands[index] = currentState.playerHands[index];
          } else if (shouldHaveCards(seat, room.phase)) {
            // Player should have cards but holeCards undefined (server sanitized them)
            // Use 'encrypted' marker to trigger card back display
            hands[index] = "encrypted" as any;
          }

          chips[index] = seat.chips ?? 0;
          bets[index] = seat.streetCommitted ?? 0;

          // Use action field for sitting out or last action label
          const state =
            seat.action === "SITTING_OUT"
              ? "sittingOut"
              : seat.status || "empty";
          states[index] = state as any;

          if (seat.action && seat.action !== "SITTING_OUT") {
            switch (seat.action) {
              case "FOLD":
                labels[index] = "Fold";
                break;
              case "CHECK":
                labels[index] = "Check";
                break;
              case "CALL":
                labels[index] = "Call";
                break;
              case "BET":
                labels[index] = "Bet";
                break;
              case "RAISE":
                labels[index] = "Raise";
                break;
              case "ALLIN":
                labels[index] = "All In";
                break;
            }
          }

          console.log(
            `👤 Seat ${index}: ${seat.pid?.slice(0, 10)}... (${chips[index]} chips, ${seat.streetCommitted} streetCommitted, state: ${seat.status})`,
          );
        }
      });
    } else if (room.players && Array.isArray(room.players)) {
      // Legacy format
      room.players.forEach((p: any) => {
        if (p.seat === undefined) return;
        const idx = p.seat;
        const currentName = currentState.players[idx];
        seats[idx] = p.nickname || p.name || currentName || shortAddress(p.playerId);
        ids[idx] = p.playerId;

        if (p.cards?.length === 2) {
          hands[idx] = [p.cards[0], p.cards[1]];
        }
        chips[idx] = p.chips ?? 0;
        bets[idx] = p.bet ?? 0;
        states[idx] = (p.state || "empty") as SeatUIState;
      });
    } else {
      // No valid format found - initialize with empty state
      console.warn("⚠️ No valid room format found, using empty state");
    }

    const comm = Array(5).fill(null) as (number | null)[];
    const newCards = room.communityCards ?? room.board ?? [];

    // Preserve existing community cards during betting if the snapshot sends none,
    // but continue updating players and other fields to avoid stale UI state.
    if (newCards.length === 0) {
      const existingCards = get().community || [];
      const hasExistingCards = existingCards.some((c) => c !== null);
      if (
        hasExistingCards &&
        room.phase &&
        !["waiting", "deal"].includes(room.phase)
      ) {
        for (let i = 0; i < Math.min(existingCards.length, comm.length); i++) {
          comm[i] = existingCards[i];
        }
      }
    } else {
      // Update community cards with new data
      newCards.forEach((c: any, i: number) => {
        // Cards are now always in hash format (numeric IDs)
        comm[i] = c as number;
      });
    }

    const pot =
      room.pot ??
      room.pots?.reduce((sum: number, pt: any) => sum + pt.amount, 0) ??
      0;

    // Compute revealed seats from authoritative snapshot
    const revealedSet = new Set(
      (room.revealedPids || []).map((p: string) => p.toLowerCase()),
    );
    const cardsRevealed = ids.map((pid, idx) => {
      if (!pid) return false;
      return revealedSet.has(pid.toLowerCase());
    });

    const resolvedMaxPlayers =
      typeof maxPlayers === "number" && Number.isFinite(maxPlayers)
        ? maxPlayers
        : get().tableMaxPlayers;

    set({
      playerHands: hands,
      community: comm,
      chips,
      playerBets: bets,
      playerStates: states,
      players: seats,
      playerIds: ids,
      tableMaxPlayers: resolvedMaxPlayers,
      cardsRevealed,
      lastActionLabels: labels,
      dealerIndex: room.dealerIndex ?? null,
      pot,
      currentTurn: (() => {
        // Debug logging for currentTurn calculation
        console.log(`🔍 [useGameStore] Calculating currentTurn:`, {
          hasActor: "actor" in room,
          actor: (room as any).actor,
          currentTurnIndex: room.currentTurnIndex,
          playersLength: room.players?.length,
          playerWithTurn: room.players?.find((p) => p.isTurn)?.seat,
          actingIndex: (room as any).actingIndex,
        });

        // New EventEngine format: use actor directly
        if ("actor" in room && (room as any).actor !== undefined) {
          console.log(`   → Using EventEngine actor: ${(room as any).actor}`);
          return (room as any).actor;
        }

        // No legacy format support in pure FSM

        console.log(`   → No current turn found, returning null`);
        return null;
      })(),
      street: phaseToStreet[room.phase] ?? 0,
      phase: room.phase ?? null,
      loading: false,
      error: null,
      smallBlind: room.smallBlind ?? get().smallBlind,
      bigBlind: room.bigBlind ?? get().bigBlind,
      // default to big blind if minRaise not provided (e.g. pre-action snapshot)
      minRaise: room.minRaise ?? room.bigBlind ?? get().minRaise,
    });
  }

  const connectWebSocket = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      console.log("🔗 WebSocket already connected");
      return;
    }

    const wsUrl = resolveWebSocketUrl();
    console.log(
      `🔗 Connecting to WebSocket: ${wsUrl} (attempt ${reconnectAttempts + 1})`,
    );

    set({ connectionState: "connecting", connectionError: null });

    try {
      socket = new WebSocket(wsUrl);

      // Set up message handler immediately after creating socket
      socket.onmessage = (ev) => {
        try {
          const msg: ServerEvent = JSON.parse(ev.data as string);
          switch (msg.type) {
            case "SESSION":
              console.log("📨 Received SESSION message:", msg);
              try {
                // Persist sessionId to enable REATTACH across reloads
                if ((msg as any).sessionId) {
                  localStorage.setItem("sessionId", (msg as any).sessionId);
                  console.log("💾 Stored sessionId:", (msg as any).sessionId);
                }
                // Persist wallet address (userId) if present
                if (msg.userId) {
                  localStorage.setItem("walletAddress", msg.userId);
                  set({ currentWalletId: msg.userId });
                  console.log("💾 Stored wallet address:", msg.userId);
                }
              } catch (e) {
                console.error("🚫 Failed to persist session info:", e);
              }
              break;
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
              applySnapshot(msg.table as any, msg.maxPlayers);
              // Don't auto-seat - let the user choose their seat manually
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

                // Clear all data for the leaving player's seat
                states[msg.seat] = "empty";
                chips[msg.seat] = 0;
                bets[msg.seat] = 0;
                hands[msg.seat] = null;
                names[msg.seat] = null;
                ids[msg.seat] = null;

                console.log(
                  `🚪 Player left seat ${msg.seat}, cleared all seat data`,
                );

                // If this is our wallet leaving, update table seats tracking
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
              // Snapshot is authoritative — request fresh snapshot instead of mutating local state
              try {
                const tableId = get().tableId;
                if (tableId && socket && socket.readyState === WebSocket.OPEN) {
                  const cmd: ClientCommand = {
                    cmdId: crypto.randomUUID(),
                    type: "JOIN_TABLE",
                    tableId,
                  } as any;
                  socket.send(JSON.stringify(cmd));
                  console.log(
                    `🔄 [useGameStore] Requested TABLE_SNAPSHOT after PLAYER_SIT_OUT`,
                  );
                }
              } catch {}
              get().addLog(`${shortAddress(msg.playerId)} sat out`);
              break;
            case "PLAYER_SIT_IN":
              // Snapshot is authoritative — request fresh snapshot instead of mutating local state
              try {
                const tableId = get().tableId;
                if (tableId && socket && socket.readyState === WebSocket.OPEN) {
                  const cmd: ClientCommand = {
                    cmdId: crypto.randomUUID(),
                    type: "JOIN_TABLE",
                    tableId,
                  } as any;
                  socket.send(JSON.stringify(cmd));
                  console.log(
                    `🔄 [useGameStore] Requested TABLE_SNAPSHOT after PLAYER_SIT_IN`,
                  );
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

                const dealerIndex =
                  s.dealerIndex === msg.seat ? null : s.dealerIndex;
                const currentTurn =
                  s.currentTurn === msg.seat ? null : s.currentTurn;

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
              // Legacy events — prefer snapshot for truth
              try {
                const tableId = get().tableId;
                if (tableId && socket && socket.readyState === WebSocket.OPEN) {
                  const cmd: ClientCommand = {
                    cmdId: crypto.randomUUID(),
                    type: "JOIN_TABLE",
                    tableId,
                  } as any;
                  socket.send(JSON.stringify(cmd));
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
              let text = ``;
              switch (msg.action) {
                case "FOLD":
                  text = `${name} folds`;
                  break;
                case "CHECK":
                  text = `${name} checks`;
                  break;
                case "CALL":
                  text = `${name} calls ${msg.amount ?? ""}`.trim();
                  break;
                case "BET":
                case "RAISE":
                case "ALLIN":
                  text = `${name} ${msg.action.toLowerCase()} ${
                    msg.amount ?? ""
                  }`.trim();
                  break;
              }
              if (text) get().addLog(text);
              // Record action in history and update lastActionLabels/playerStates for that seat
              set((s) => {
                const actionHistory = [
                  ...s.actionHistory,
                  {
                    playerId: msg.playerId,
                    action: msg.action,
                    amount: (msg as any).amount,
                  },
                ];
                const labels = [...s.lastActionLabels];
                const states = [...s.playerStates];
                const bets = [...s.playerBets];
                const chips = [...s.chips];
                const seatIdx = seatStore.getState().findSeatId(msg.playerId);
                if (seatIdx >= 0) {
                  let label = "";
                  switch (msg.action) {
                    case "FOLD":
                      label = "Fold";
                      states[seatIdx] = "folded";
                      break;
                    case "CHECK":
                      label = "Check";
                      states[seatIdx] = "active";
                      break;
                    case "CALL":
                      label = "Call";
                      states[seatIdx] = "active";
                      break;
                    case "BET":
                      label = "Bet";
                      states[seatIdx] = "active";
                      break;
                    case "RAISE":
                      label = "Raise";
                      states[seatIdx] = "active";
                      break;
                    case "ALLIN":
                      label = "All In";
                      states[seatIdx] = "allin";
                      break;
                    default:
                      label = msg.action;
                  }
                  labels[seatIdx] = label;

                  // Update live per-street bet tracking and chips when amount is provided
                  const amt = typeof (msg as any).amount === 'number' ? (msg as any).amount : undefined;
                  if (amt !== undefined && Number.isFinite(amt)) {
                    bets[seatIdx] = (bets[seatIdx] ?? 0) + amt;
                    chips[seatIdx] = Math.max(0, (chips[seatIdx] ?? 0) - amt);
                  }
                }
                return {
                  actionHistory,
                  lastActionLabels: labels,
                  playerStates: states,
                  playerBets: bets,
                  chips,
                };
              });
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
                // Move agreed current round bets into Pot before clearing
                const addToPot = (s.playerBets || []).reduce((sum, b) => sum + (b || 0), 0);
                const comm = [...s.community];
                msg.cards.forEach((c, i) => (comm[i] = c as number));
                return {
                  community: comm,
                  lastActionLabels: Array(9).fill(null), // Clear action labels on new street
                  playerBets: Array(9).fill(0), // Clear street bets
                  pot: (s.pot || 0) + addToPot,
                };
              });
              break;
            case "DEAL_TURN":
              set((s) => {
                const addToPot = (s.playerBets || []).reduce((sum, b) => sum + (b || 0), 0);
                const comm = [...s.community];
                comm[3] = msg.card as number;
                return {
                  community: comm,
                  lastActionLabels: Array(9).fill(null), // Clear action labels on new street
                  playerBets: Array(9).fill(0),
                  pot: (s.pot || 0) + addToPot,
                };
              });
              break;
            case "DEAL_RIVER":
              set((s) => {
                const addToPot = (s.playerBets || []).reduce((sum, b) => sum + (b || 0), 0);
                const comm = [...s.community];
                comm[4] = msg.card as number;
                return {
                  community: comm,
                  lastActionLabels: Array(9).fill(null), // Clear action labels on new street
                  playerBets: Array(9).fill(0),
                  pot: (s.pot || 0) + addToPot,
                };
              });
              break;
            case "HAND_START":
              get().addLog("Dealer: Hand started");
              get().resetCardReveals(); // Reset card reveals for new hand
              get().clearWinners(); // Clear previous winners for new hand
              // Reset action history at the beginning of each hand
              set({
                actionHistory: [],
                lastActionLabels: Array(9).fill(null),
                playerBets: Array(9).fill(0),
                playerHands: Array(9).fill(null),
                community: Array(5).fill(null),
              });
              break;
            case "HAND_END":
              get().addLog("Dealer: Hand complete");
              break;
            case "ROUND_END":
              // Round ended without card dealing (safety): move current bets to pot and clear
              set((s) => {
                const addToPot = (s.playerBets || []).reduce((sum, b) => sum + (b || 0), 0);
                return {
                  playerBets: Array(9).fill(0),
                  lastActionLabels: Array(9).fill(null),
                  pot: (s.pot || 0) + addToPot,
                };
              });
              break;
            case "TIMER":
              set({ timer: msg.countdown });
              if (msg.countdown === 0) {
                set({ timer: null });
              }
              break;
            case "COUNTDOWN_START":
              // Handle new client-driven countdown system
              set((state) => {
                if (!isCountdownType(msg.countdownType)) {
                  return {};
                }

                const countdowns = new Map(state.countdowns);
                countdowns.set(msg.countdownType, {
                  startTime: msg.startTime,
                  duration: msg.duration,
                  metadata: msg.metadata,
                  type: msg.countdownType,
                });

                console.log(
                  `⏱️ [useGameStore] Started ${msg.countdownType} countdown: ${msg.duration}ms`,
                  msg.metadata,
                );

                return { countdowns };
              });
              break;
            case "GAME_START_COUNTDOWN":
              // Legacy support - convert to new format
              set((state) => {
                const countdowns = new Map(state.countdowns);
                countdowns.set("game_start", {
                  startTime: Date.now(),
                  duration: msg.countdown * 1000,
                  metadata: {
                    activePlayerCount: msg.activePlayerCount,
                    totalPlayerCount: msg.totalPlayerCount,
                  },
                  type: "game_start",
                });
                // Also set legacy timer for backward compatibility
                return { countdowns, timer: msg.countdown };
              });
              console.log(
                `🚀 Game starting in ${msg.countdown} seconds with ${msg.activePlayerCount || 0} players`,
              );
              break;
            case "TABLE_RESET":
              // Handle table reset due to idle timeout
              console.log("🔄 Table was reset due to inactivity");
              get().addLog("Table was reset due to 5 minutes of inactivity");
              // Force a fresh table state
              seatStore.getState().reset();
              set({
                playerHands: Array(9).fill(null),
                community: Array(5).fill(null),
                chips: Array(9).fill(0),
                playerBets: Array(9).fill(0),
                playerStates: Array(9).fill("empty") as SeatUIState[],
                players: Array(9).fill(null),
                playerIds: Array(9).fill(null),
                dealerIndex: null,
                pot: 0,
                currentTurn: null,
                street: 0,
                cardsRevealed: Array(9).fill(false),
                lastActionLabels: Array(9).fill(null),
              });
              break;
            case "SHOWDOWN":
              console.log("🃏 Showdown started");
              get().addLog(`🃏 Showdown!`);
              // Do not auto-reveal everyone; let winners and user preference handle visibility
              try {
                const auto = get().autoRevealAtShowdown;
                if (auto) {
                  // Politely request to reveal our own cards on showdown
                  void get().showCards();
                }
              } catch (e) {
                console.warn("⚠️ Auto-show at showdown failed (non-fatal)", e);
              }
              break;
            case "DEALER_MESSAGE":
              console.log("📢 Dealer message:", msg.message);
              get().addLog(`🎯 Dealer: ${msg.message}`);
              break;
            case "WINNER_ANNOUNCEMENT":
              console.log(
                "🏆 Winner announcement:",
                msg.winners,
                "pot:",
                msg.potAmount,
              );
              // Trigger winner visuals, reveal cards, and set action label to "Winner"
              set((s) => {
                const revealed = [...s.cardsRevealed];
                const labels = [...s.lastActionLabels];
                const winnersSet = new Set(s.recentWinners);
                msg.winners.forEach((winner) => {
                  if (winner.seat >= 0) {
                    winnersSet.add(winner.seat);
                    revealed[winner.seat] = true;
                    labels[winner.seat] = "Winner";
                  }
                });
                return { cardsRevealed: revealed, lastActionLabels: labels, recentWinners: winnersSet };
              });
              // Schedule clearing of recentWinners (visual effect) after 5s
              setTimeout(() => {
                set((s) => {
                  const newWinners = new Set(s.recentWinners);
                  msg.winners.forEach((w) => newWinners.delete(w.seat));
                  return { recentWinners: newWinners };
                });
              }, 5000);
              break;
            case "PLAYER_REVEALED":
              set((s) => {
                const cardsRevealed = [...s.cardsRevealed];
                if (msg.seat >= 0 && msg.seat < cardsRevealed.length) {
                  cardsRevealed[msg.seat] = true;
                }
                return { cardsRevealed };
              });
              break;
            case "PLAYER_WAITING":
              // Handle player waiting to join next hand
              set((s) => {
                const states = [...s.playerStates];

                states[msg.seat] = "active"; // Show as sitting out until next hand

                // If this is our wallet, update table seats tracking
                if (msg.playerId === s.currentWalletId) {
                  const newTableSeats = new Map(s.tableSeats);
                  newTableSeats.set(msg.tableId || s.tableId || "", msg.seat);
                  console.log(
                    `🪑 [GameStore] Updated our seat tracking: table ${msg.tableId} -> seat ${msg.seat}`,
                  );
                  return {
                    playerStates: states,
                    tableSeats: newTableSeats,
                  };
                }

                return { playerStates: states };
              });
              get().addLog(
                `${shortAddress(msg.playerId)} waiting for next hand`,
              );
              break;
            case "WAITING_FOR_NEXT_HAND":
              // Handle personal message about waiting for next hand
              console.log(
                `⏳ [GameStore] Waiting for next hand at seat ${msg.seat}:`,
                msg.msg,
              );
              get().addLog(`⏳ ${msg.msg}`);
              // This is sent directly to the requesting player, so no state updates needed
              break;
            case "ERROR":
              // Record error and request a fresh snapshot to resync UI
              set({ error: msg.msg });
              try {
                const tableId = get().tableId;
                if (tableId && socket && socket.readyState === WebSocket.OPEN) {
                  const cmd: ClientCommand = {
                    cmdId: crypto.randomUUID(),
                    type: "JOIN_TABLE",
                    tableId,
                  } as any;
                  socket.send(JSON.stringify(cmd));
                  console.log(
                    "🔄 [useGameStore] Requested fresh TABLE_SNAPSHOT after error",
                  );
                }
              } catch (e) {
                console.error(
                  "❌ Failed to request TABLE_SNAPSHOT after error:",
                  e,
                );
              }
              break;
          }
        } catch {
          /* ignore malformed */
        }
      };

      const connectionTimeout = setTimeout(() => {
        if (socket && socket.readyState !== WebSocket.OPEN) {
          console.error("🚫 WebSocket connection timeout");
          socket.close();
          set({
            connectionState: "disconnected",
            connectionError: "Connection timeout",
          });
          scheduleReconnect();
        }
      }, 10000);

      socket.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log("✅ WebSocket connected successfully");
        reconnectAttempts = 0;
        set({ connectionState: "connected", connectionError: null });

        // Prefer REATTACH using persisted sessionId to restore room/seat/user binding
        const persistedSessionId = localStorage.getItem("sessionId");
        if (persistedSessionId) {
          try {
            const reattach: ClientCommand = {
              cmdId: crypto.randomUUID(),
              type: "REATTACH",
              sessionId: persistedSessionId,
            } as any;
            socket!.send(JSON.stringify(reattach));
            console.log("📤 Sent REATTACH with sessionId:", persistedSessionId);
          } catch (e) {
            console.error("🚫 Failed to REATTACH session:", e);
          }
        }

        // Also attach wallet if we have it (idempotent on server)
        const address = localStorage.getItem("walletAddress");
        console.log("🔍 Checking for stored wallet address:", address);
        if (address) {
          try {
            const cmd: ClientCommand = {
              cmdId: crypto.randomUUID(),
              type: "ATTACH",
              userId: address,
            } as any;
            socket!.send(JSON.stringify(cmd));
            console.log("📤 Sent ATTACH command with userId:", address);
            set({ currentWalletId: address });
          } catch (error) {
            console.error("🚫 Failed to attach wallet:", error);
            set({ connectionError: "Failed to attach wallet" });
          }
        }

        const pendingTable = get().tableId;
        if (pendingTable) {
          try {
            const joinCmd: ClientCommand = {
              cmdId: crypto.randomUUID(),
              type: "JOIN_TABLE",
              tableId: pendingTable,
            } as any;
            socket!.send(JSON.stringify(joinCmd));
            console.log("📥 Joined table on connect:", pendingTable);
          } catch (error) {
            console.error("🚫 Failed to join table:", error);
          }
        }
      };

      socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log(
          `🔌 WebSocket closed: Code ${event.code}, Reason: ${event.reason}`,
        );
        set({
          connectionState: "disconnected",
          connectionError: event.reason || `Connection closed (${event.code})`,
        });

        // Don't auto-reconnect for normal closures or if explicitly disconnected
        if (event.code !== 1000 && event.code !== 1001) {
          scheduleReconnect();
        }
      };

      socket.onerror = (event: Event) => {
        clearTimeout(connectionTimeout);
        const details = event instanceof ErrorEvent ? event.message : "";
        console.error("🚫 WebSocket error event:", event.type, details);
        set({
          connectionState: "disconnected",
          connectionError: "Connection error",
        });
      };
    } catch (error) {
      console.error("🚫 Failed to create WebSocket:", error);
      set({
        connectionState: "disconnected",
        connectionError: "Failed to create connection",
      });
      scheduleReconnect();
    }

    // Update socket reference in store
    set({ socket });
  };

  const scheduleReconnect = () => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error("🚫 Max reconnection attempts reached");
      set({
        connectionState: "disconnected",
        connectionError: "Max reconnection attempts reached",
      });
      return;
    }

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    console.log(`🔄 Scheduling reconnect in ${delay}ms`);

    set({ connectionState: "reconnecting" });
    reconnectAttempts++;

    reconnectTimeout = setTimeout(() => {
      connectWebSocket();
    }, delay);
  };

  if (typeof window !== "undefined" && !socket) {
    connectWebSocket();
  }

  return {
    playerHands: Array(9).fill(null),
    community: Array(5).fill(null),
    chips: Array(9).fill(0),
    playerBets: Array(9).fill(0),
    playerStates: Array(9).fill("empty") as SeatUIState[],
    players: Array(9).fill(null),
    playerIds: Array(9).fill(null),
    dealerIndex: null,
    pot: 0,
    currentTurn: null,
    street: 0,
    phase: null,
    loading: false,
    error: null,
    logs: [],
    addLog: (msg) => set((s) => ({ logs: [...s.logs, msg] })),
    cardsRevealed: Array(9).fill(false),
    autoRevealAtShowdown:
      (typeof window !== "undefined"
        ? (localStorage.getItem("autoRevealAtShowdown") ?? "true")
        : "true") === "true",
    setAutoRevealAtShowdown: (v: boolean) => {
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("autoRevealAtShowdown", v ? "true" : "false");
        } catch {}
      }
      set({ autoRevealAtShowdown: v });
    },
    recentWinners: new Set<number>(),
    lastActionLabels: Array(9).fill(null),
    smallBlind: DEFAULT_SMALL_BLIND,
    bigBlind: DEFAULT_BIG_BLIND,
    minRaise: DEFAULT_BIG_BLIND,
    startBlindTimer: () => {
      const increase = () =>
        set((s) => {
          const newSmall = s.smallBlind * 2;
          const newBig = s.bigBlind * 2;
          return {
            smallBlind: newSmall,
            bigBlind: newBig,
            minRaise: newBig,
          };
        });
      setTimeout(
        function tick() {
          increase();
          setTimeout(tick, 10 * 60 * 1000);
        },
        10 * 60 * 1000,
      );
    },
    socket,
    // Initialize as null to avoid SSR/client hydration mismatches.
    // Wallet will be rehydrated on mount by useWalletGameSync or Header.
    currentWalletId: null,
    tableSeats: new Map<string, number>(),
    tableId: null,
    tableMaxPlayers: DEFAULT_MAX_PLAYERS,
    timer: null,
    countdowns: new Map<CountdownType, CountdownData>(),
    connectionState: "disconnected",
    connectionError: null,
    actionHistory: [],

    connectWallet: (address: string) => {
      const previousWallet = get().currentWalletId;

      if (!address || typeof address !== "string") {
        console.error("🚫 Invalid wallet address provided");
        set({ connectionError: "Invalid wallet address" });
        return;
      }

      console.log(
        `💼 Connecting wallet: ${address.slice(0, 10)}... (Previous: ${previousWallet?.slice(0, 10) + "..." || "none"})`,
      );

      // If switching wallets, disconnect from previous wallet's sessions
      if (previousWallet && previousWallet !== address) {
        console.log("🔄 Switching wallets - cleaning up previous state");
        get()
          .handleDisconnect()
          .then(() => {
            // After cleanup, connect with new wallet and ensure clean state
            seatStore.getState().reset();
            set({
              currentWalletId: address,
              tableSeats: new Map(),
              connectionError: null,
              tableMaxPlayers: DEFAULT_MAX_PLAYERS,
              chips: Array(9).fill(0),
              playerBets: Array(9).fill(0),
              playerStates: Array(9).fill("empty") as SeatUIState[],
              players: Array(9).fill(null),
              playerIds: Array(9).fill(null),
            });

            if (typeof window !== "undefined") {
              // Validate localStorage consistency - ensure only this address is stored
              const storedAddress = localStorage.getItem("walletAddress");
              if (storedAddress !== address) {
                console.log(
                  `🧹 Cleaning inconsistent localStorage: ${storedAddress} → ${address}`,
                );
                localStorage.setItem("walletAddress", address);
              }
            }

            // Ensure WebSocket is connected before attaching
            if (socket && socket.readyState === WebSocket.OPEN) {
              try {
                const cmd: ClientCommand = {
                  cmdId: crypto.randomUUID(),
                  type: "ATTACH",
                  userId: address,
                } as any;
                socket.send(JSON.stringify(cmd));
                console.log(
                  "📤 Sent ATTACH command with new wallet:",
                  address.slice(0, 10) + "...",
                );
              } catch (error) {
                console.error("🚫 Failed to attach new wallet:", error);
                set({ connectionError: "Failed to attach wallet" });
              }
            } else {
              console.log(
                "🔗 WebSocket not connected, attempting connection...",
              );
              connectWebSocket();
            }
          })
          .catch((error) => {
            console.error("🚫 Failed to disconnect previous wallet:", error);
            set({ connectionError: "Failed to switch wallets" });
          });
      } else {
        // First time connecting or same wallet - validate consistency
        if (typeof window !== "undefined") {
          const storedAddress = localStorage.getItem("walletAddress");
          if (storedAddress !== address) {
            console.log(
              `🧹 Syncing localStorage: ${storedAddress} → ${address}`,
            );
            localStorage.setItem("walletAddress", address);
          }
        }

        set({ currentWalletId: address, connectionError: null });

        // Ensure WebSocket is connected before attaching
        if (socket && socket.readyState === WebSocket.OPEN) {
          try {
            const cmd: ClientCommand = {
              cmdId: crypto.randomUUID(),
              type: "ATTACH",
              userId: address,
            } as any;
            socket.send(JSON.stringify(cmd));
            console.log(
              "📤 Sent ATTACH command with wallet address:",
              address.slice(0, 10) + "...",
            );
          } catch (error) {
            console.error("🚫 Failed to attach wallet:", error);
            set({ connectionError: "Failed to attach wallet" });
          }
        } else {
          console.log("🔗 WebSocket not connected, attempting connection...");
          connectWebSocket();
        }
      }
    },

    handleDisconnect: async () => {
      console.log("🔌 Handling wallet disconnect...");
      const { currentWalletId, tableSeats } = get();

      if (!currentWalletId) return;

      // Auto-fold and leave all tables where this wallet is seated
      const promises: Promise<void>[] = [];
      tableSeats.forEach((seatIndex, tableId) => {
        promises.push(
          (async () => {
            try {
              // Try to fold first if it's this player's turn
              await get().playerAction({ type: "FOLD" });
            } catch (error) {
              // Ignore fold errors - player might not be on turn
              console.log(
                "Failed to auto-fold (expected if not on turn):",
                error,
              );
            }

            // Leave the table
            try {
              await get().leaveSeat(tableId);
            } catch (error) {
              console.error("Failed to leave table", tableId, error);
            }
          })(),
        );
      });

      await Promise.all(promises);

      // Clear all wallet-related state and storage
      if (typeof window !== "undefined") {
        localStorage.removeItem("walletAddress");
        localStorage.removeItem("sessionId");
      }

      seatStore.getState().reset();
      set({
        currentWalletId: null,
        tableSeats: new Map(),
        tableId: null,
        tableMaxPlayers: DEFAULT_MAX_PLAYERS,
        // Reset game state for safety
        playerHands: Array(9).fill(null),
        chips: Array(9).fill(0),
        playerBets: Array(9).fill(0),
        playerStates: Array(9).fill("empty") as SeatUIState[],
        players: Array(9).fill(null),
        playerIds: Array(9).fill(null),
        currentTurn: null,
        pot: 0,
      });

      console.log("✅ Wallet disconnect handled successfully");
    },

    joinTable: (tableId: string) => {
      set({ tableId });
      // Send JOIN_TABLE command to server to get table snapshot
      if (socket && socket.readyState === WebSocket.OPEN) {
        const cmd: ClientCommand = {
          cmdId: crypto.randomUUID(),
          type: "JOIN_TABLE",
          tableId,
        } as any;
        socket.send(JSON.stringify(cmd));
        console.log(`🎯 Joining table: ${tableId}`);
      }
    },

    createTable: async (name: string) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        const cmd: ClientCommand = {
          cmdId: crypto.randomUUID(),
          type: "CREATE_TABLE",
          name,
        } as ClientCommand;
        socket.send(JSON.stringify(cmd));
      }
    },

    joinSeat: async (seatIdx: number, tableId?: string, chips?: number) => {
      const currentTableId = tableId || get().tableId;
      console.log(
        `🪑 Attempting to join seat ${seatIdx} at table ${currentTableId}`,
      );

      if (!currentTableId) {
        console.error("🚫 No table selected");
        set({ error: "No table selected" });
        return;
      }

      const { currentWalletId, tableSeats } = get();
      if (!currentWalletId) {
        console.error("🚫 No wallet connected");
        set({ error: "No wallet connected" });
        return;
      }

      console.log(
        `👤 Wallet: ${currentWalletId.slice(0, 10)}... attempting to join seat ${seatIdx}`,
      );

      // Check if already seated at this table
      if (tableSeats.has(currentTableId)) {
        console.error(
          `🚫 Already seated at table ${currentTableId}:`,
          tableSeats.get(currentTableId),
        );
        set({ error: "Already seated at this table" });
        return;
      }

      if (socket && socket.readyState === WebSocket.OPEN) {
        const cmd: ClientCommand = {
          cmdId: crypto.randomUUID(),
          type: "SIT",
          tableId: currentTableId,
          seat: seatIdx,
          chips,
          playerId: currentWalletId, // Send client wallet as authoritative
          nickname: shortAddress(currentWalletId), // Provide display name
        } as ClientCommand;
        console.log("📤 Sending SIT command:", {
          tableId: currentTableId,
          seat: seatIdx,
          chips,
          playerId: currentWalletId?.slice(0, 10) + "...",
        });
        socket.send(JSON.stringify(cmd));

        // Optimistically update local state
        const newTableSeats = new Map(tableSeats);
        newTableSeats.set(currentTableId, seatIdx);
        set({ tableSeats: newTableSeats });
        console.log(`✅ Optimistically updated tableSeats:`, newTableSeats);
        get().addLog(`Joining seat ${seatIdx}`);
      } else {
        console.error("🚫 WebSocket not connected, cannot join seat");
        set({ error: "Not connected to server" });
      }
    },

    leaveSeat: async (tableId?: string) => {
      const currentTableId = tableId || get().tableId;
      if (!currentTableId) return;

      const { tableSeats } = get();

      // Send LEAVE to server if connected (best-effort)
      try {
        if (socket && socket.readyState === WebSocket.OPEN) {
          const cmd: ClientCommand = {
            cmdId: crypto.randomUUID(),
            type: "LEAVE",
            tableId: currentTableId,
          } as ClientCommand;
          socket.send(JSON.stringify(cmd));
        }
      } catch (e) {
        console.warn("ℹ️ LEAVE command not sent (offline or error)", e);
      }

      // Always update local state so user can exit regardless of mapping/connection
      const newTableSeats = new Map(tableSeats);
      newTableSeats.delete(currentTableId);
      set({ tableSeats: newTableSeats });

      // If leaving current table, clear our own seat state locally
      if (currentTableId === get().tableId) {
        set((s) => {
          const idx = seatStore.getState().findSeatId(s.currentWalletId);
          const states = [...s.playerStates];
          const names = [...s.players];
          const ids = [...s.playerIds];
          if (idx !== undefined) {
            states[idx] = "empty";
            names[idx] = null;
            ids[idx] = null;
          }
          return { playerStates: states, players: names, playerIds: ids };
        });
      }
    },

    leaveAllTables: async () => {
      const { tableSeats } = get();
      const promises: Promise<void>[] = [];

      tableSeats.forEach((seatIndex, tableId) => {
        promises.push(get().leaveSeat(tableId));
      });

      await Promise.all(promises);
    },

    sitOut: async (tableId?: string) => {
      const currentTableId = tableId || get().tableId;
      if (!currentTableId) return;

      if (socket && socket.readyState === WebSocket.OPEN) {
        const cmd: ClientCommand = {
          cmdId: crypto.randomUUID(),
          type: "SIT_OUT",
          tableId: currentTableId,
        } as ClientCommand;
        socket.send(JSON.stringify(cmd));
      }
    },

    sitIn: async (tableId?: string) => {
      const currentTableId = tableId || get().tableId;
      if (!currentTableId) return;

      if (socket && socket.readyState === WebSocket.OPEN) {
        const cmd: ClientCommand = {
          cmdId: crypto.randomUUID(),
          type: "SIT_IN",
          tableId: currentTableId,
        } as ClientCommand;
        socket.send(JSON.stringify(cmd));
      }
    },

    startHand: async () => {},
    dealFlop: async () => {},
    dealTurn: async () => {},
    dealRiver: async () => {},

    playerAction: async (action) => {
      if (!action || !action.type) {
        console.error("🚫 Invalid action provided");
        throw new Error("Invalid action");
      }

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error("🚫 WebSocket not connected for player action");
        set({ connectionError: "Not connected to game server" });
        throw new Error("WebSocket not connected");
      }

      try {
        const { currentWalletId } = get(); // Extract from store
        const cmd: ClientCommand = {
          cmdId: crypto.randomUUID(),
          type: "ACTION",
          action: action.type,
          amount: action.amount,
          playerId: currentWalletId || undefined, // Safely handle null
        };

        socket.send(JSON.stringify(cmd));
        console.log("🎯 Sent player action:", {
          type: action.type,
          amount: action.amount,
        });
      } catch (error) {
        console.error("🚫 Failed to send player action:", error);
        set({ connectionError: "Failed to send action" });
        throw error;
      }
    },

    rebuy: async (amount: number) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        const cmd: ClientCommand = {
          cmdId: crypto.randomUUID(),
          type: "REBUY",
          amount,
        };
        socket.send(JSON.stringify(cmd));
      }
    },
    revealCards: (seatIndex: number) => {
      set((s) => {
        const newRevealed = [...s.cardsRevealed];
        newRevealed[seatIndex] = true;
        return { cardsRevealed: newRevealed };
      });
    },
    resetCardReveals: () => {
      set({ cardsRevealed: Array(9).fill(false) });
    },
    markWinner: (seatIndex: number) => {
      set((s) => {
        const newWinners = new Set(s.recentWinners);
        newWinners.add(seatIndex);
        return { recentWinners: newWinners };
      });
    },
    clearWinners: () => {
      set({ recentWinners: new Set<number>() });
    },
    showCards: async () => {
      const socket = get().socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error("❌ Cannot show cards: WebSocket not connected");
        return;
      }

      const cmd: ClientCommand = {
        cmdId: crypto.randomUUID(),
        type: "SHOW_CARDS",
      } as any;

      socket.send(JSON.stringify(cmd));
      console.log("🃏 [useGameStore] Sent SHOW_CARDS command");
    },
    muckCards: async () => {
      const socket = get().socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error("❌ Cannot muck cards: WebSocket not connected");
        return;
      }

      const cmd: ClientCommand = {
        cmdId: crypto.randomUUID(),
        type: "MUCK_CARDS",
      } as any;

      socket.send(JSON.stringify(cmd));
      console.log("🃏 [useGameStore] Sent MUCK_CARDS command");
    },
  };
});
