/**
 * Event-Driven Finite State Machine Types for Poker Engine
 *
 * This implements the battle-tested pattern for poker game engines:
 * - Immutable state with pure reducer functions
 * - Explicit FSM: Waiting → Deal → Preflop → Flop → Turn → River → Showdown → Payout → HandEnd
 * - Event-sourced architecture for complete auditability
 */

// Core game phases following explicit FSM pattern
export type Phase =
  | "waiting" // Waiting for players between hands
  | "deal" // Dealing hole cards
  | "preflop" // Pre-flop betting round
  | "flop" // Post-flop betting round
  | "turn" // Turn betting round
  | "river" // River betting round
  | "showdown" // Card evaluation
  | "payout" // Distributing winnings
  | "handEnd"; // Hand cleanup

export type Street = "preflop" | "flop" | "turn" | "river";

export type ActionType = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALLIN";

// UI-facing action flag that also represents sitting out state
export type SeatAction = ActionType | "SITTING_OUT";

export type SeatStatus = "active" | "folded" | "allin" | "empty" | "sittingOut";

// UI helper state used by client stores/components
export type SeatUIState = SeatStatus;

/**
 * Seat represents a single position at the poker table
 * Immutable structure with all state needed for betting calculations
 */
export interface Seat {
  id: number; // seat index (0-8 for 9-max)
  pid?: string; // player ID if occupied
  chips: number; // chips behind (not yet in pot)
  committed: number; // total committed this hand
  streetCommitted: number; // committed on current street only
  status: SeatStatus; // current seat state (active/folded/allin/empty only)
  holeCards?: [number, number]; // card indices if dealt
  nickname?: string; // display name
  /**
   * UI action flag for table rendering
   * - Derived "SITTING_OUT" from SitOutManager when player is sitting out
   * - Last action taken during the current street (FOLD, CHECK, CALL, BET, RAISE, ALLIN)
   */
  action?: SeatAction;
}

/**
 * Pot structure for main pot and side pots
 * Handles complex all-in scenarios with proper eligibility
 */
export interface Pot {
  cap?: number; // side-pot cap (undefined for main pot)
  amount: number; // total chips in this pot
  eligiblePids: string[]; // player IDs eligible to win this pot
}

/**
 * Core Table state - single source of truth
 * All game state managed through immutable updates to this structure
 */
export interface Table {
  id: string; // table identifier
  seats: Seat[]; // exactly 9 seats (0-8)
  button: number; // dealer button position
  smallBlind: number; // small blind amount
  bigBlind: number; // big blind amount
  deckSeed?: string; // deterministic deck seed for this hand (persisted)
  // Canonical deck representation for this hand (numeric codes 0..51)
  deckCodes?: number[];

  // Game state
  phase: Phase; // current game phase
  street?: Street; // current street if in betting

  // Betting state
  actor?: number; // seat ID whose turn it is
  lastAggressor?: number; // seat ID of last bet/raise
  currentBet: number; // highest streetCommitted among active
  lastRaiseSize: number; // size of last bet/raise for min-raise rules

  // Pot management
  pots: Pot[]; // main pot + side pots

  // Board cards
  communityCards: number[]; // cumulative numeric card codes (0..51)
  // Burn/discarded cards by street for auditability
  burns?: {
    flop: number[];
    turn: number[];
    river: number[];
  };

  // Deck management
  deck?: Card[]; // Deprecated: use deckCodes; kept for backward compatibility
  deckIndex?: number; // Next index into deckCodes

  // Configuration
  blinds: {
    sb: number; // small blind amount
    bb: number; // big blind amount
    ante?: number; // ante amount (optional)
  };

  // Metadata
  handNumber: number; // incrementing hand counter
  timestamp: number; // hand start time

  // Showdown/reveal state (per hand)
  revealedPids?: string[]; // players whose hole cards are revealed to all
  winnersPids?: string[]; // last payout winners (cleared on StartHand)
  autoRevealAll?: boolean; // flag indicating showdown forced all hands face-up

  // Big blind option tracking
  bbSeat?: number; // big blind position
  bbHasActed?: boolean; // track if BB has used option

  // Action sequence tracking for proper round completion
  playersActedThisRound?: number[]; // seat IDs that have acted in current round
  roundStartActor?: number; // first actor of the current round
}

/**
 * Event types for the event-sourced architecture
 * Each event represents an atomic change to game state
 */
export type PokerEvent =
  | { t: "StartHand"; handNumber: number; timestamp: number }
  | { t: "PostBlinds"; sb: number; bb: number; ante?: number }
  | { t: "DealHole"; cards: Record<string, [number, number]> }
  | {
      t: "EnterStreet";
      street: Street;
      cards?: number[];
      isAutoDealt?: boolean;
    }
  | { t: "Action"; seat: number; action: ActionType; amount?: number }
  | { t: "TimeoutAutoFold"; seat: number }
  | { t: "CloseStreet" }
  | { t: "Showdown"; results: ShowdownResult[] }
  | { t: "Payout"; distributions: PayoutDistribution[] }
  | { t: "HandEnd" }
  // Table management and player state
  | {
      t: "PlayerJoin";
      seat: number;
      pid: string;
      chips: number;
      nickname?: string;
    }
  | { t: "PlayerLeave"; seat: number; pid: string }
  | {
      t: "PlayerSitOut";
      seat: number;
      pid: string;
      reason: "voluntary" | "timeout" | "busted";
    }
  | { t: "PlayerSitIn"; seat: number; pid: string }
  // Showdown visibility controls (event-driven)
  | { t: "PlayerShowCards"; pid: string }
  | { t: "PlayerMuckCards"; pid: string }
  | { t: "GameCountdownStart"; countdown: number }
  | { t: "GameCountdownStop"; reason: string }
  | { t: "UpdateBlinds"; smallBlind: number; bigBlind: number };

/**
 * Supporting types for complex events
 */
export interface ShowdownResult {
  pid: string;
  handRank: number;
  handDescription: string;
  cards: number[];
}

export interface PayoutDistribution {
  pid: string;
  amount: number;
  potIndex: number;
  reason: "win" | "tie" | "uncalled";
}

/**
 * Action validation result
 * Pure functions return this instead of throwing exceptions
 */
export interface ActionValidation {
  valid: boolean;
  error?: string;
  normalizedAmount?: number; // for bet/raise normalization
  normalizedAction?: ActionType; // for action type normalization (e.g. CALL 0 -> CHECK)
  isAllIn?: boolean;
}

/**
 * Betting round state calculation result
 */
export interface BettingRoundState {
  isComplete: boolean;
  reason?: "fold-to-one" | "action-complete" | "all-players-allin";
  nextActor?: number;
}

/**
 * Ring traversal helper result
 */
export interface NextActorResult {
  actor?: number;
  isComplete: boolean;
  activeCount: number;
}

/**
 * Pot distribution calculation
 */
export interface PotCalculation {
  pots: Pot[];
  totalCollected: number;
}

/**
 * Hand evaluation result
 */
export interface HandEvaluation {
  rank: number;
  description: string;
  cards: number[];
}

/**
 * Complete game state snapshot for debugging/replay
 */
export interface GameSnapshot {
  table: Table;
  eventLog: PokerEvent[];
  timestamp: number;
  handNumber: number;
}

/**
 * Timer event data
 */
export interface TimerEvent {
  pid: string;
  seat: number;
  deadline: number;
  actionTimeoutMs: number;
}

// Re-export common types that external modules might need
export type { Seat as PokerSeat, Table as PokerTable, Pot as PokerPot };

// ============================================================================
// CARD TYPES
// ============================================================================

export type Suit = "s" | "h" | "d" | "c";
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "T"
  | "J"
  | "Q"
  | "K"
  | "A";

export interface Card {
  suit: Suit;
  rank: Rank;
}

/**
 * Side Effects - Actions that the reducer wants the engine to perform
 * These are returned by the reducer instead of being executed directly
 */
export type SideEffect =
  | {
      type: "START_TIMER";
      payload: { playerId: string; seatId: number; timeoutMs: number };
    }
  | { type: "STOP_TIMER"; payload: { playerId?: string } }
  | { type: "DISPATCH_EVENT"; payload: { event: PokerEvent; delayMs?: number } }
  | { type: "EMIT_STATE_CHANGE"; payload: { reason: string } }
  | { type: "CLEAR_TIMERS"; payload: {} }
  | { type: "EVALUATE_HANDS"; payload: {} }
  | { type: "CHECK_GAME_START"; payload: { delayMs?: number } };

/**
 * State Transition Result
 * Pure reducer returns new state and side effects to execute
 */
export interface StateTransition {
  nextState: Table;
  sideEffects: SideEffect[];
  events?: PokerEvent[]; // Additional events to dispatch
}

/**
 * Transition Configuration for FSM
 */
export interface TransitionConfig {
  fromPhase: Phase;
  trigger: "AUTOMATIC" | "EVENT" | "CONDITION";
  condition?: (table: Table) => boolean;
  toPhase: Phase;
  sideEffects?: SideEffect[];
}
