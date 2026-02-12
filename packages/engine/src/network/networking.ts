import type { Card, Table, ActionType, Phase } from "../core/types";

export type GovernanceRole = "director" | "manager" | "admin" | "promoter";

export interface LobbyTable {
  id: string;
  name: string;
  gameType: string;
  playerCount: number;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  stakeLevel?: string;
  tableType: "cash" | "stt" | "mtt";
  buyIn?: {
    min: number;
    max: number;
    default: number;
  };
}

export type BlindType = "SMALL" | "BIG";

export type ServerEvent =
  | {
      tableId: string;
      type: "SESSION";
      sessionId: string;
      userId?: string;
      isAdmin?: boolean;
      roles?: GovernanceRole[];
    }
  | {
      tableId: string;
      type: "TABLE_SNAPSHOT";
      table: Table;
      tableType: "cash" | "stt" | "mtt";
      maxPlayers?: number;
    }
  | { tableId: ""; type: "TABLE_LIST"; tables: LobbyTable[] }
  | {
      tableId: "";
      type: "TOURNAMENT_LIST";
      tournaments: any;
    }
  | {
      tableId: "";
      type: "TOURNAMENT_UPDATED";
      tournament: any;
    }
  | {
      tableId: string;
      type: "TOURNAMENT_SEAT";
      tournamentId: string;
      seatIndex: number;
      playerId: string;
    }
  | {
      tableId: "";
      type: "TOURNAMENT_PAYOUTS";
      tournamentId: string;
      payouts: any;
    }
  | { tableId: string; type: "TABLE_CREATED"; table: LobbyTable }
  | { tableId: string; type: "HAND_START" }
  | {
      tableId: string;
      type: "GAME_START_COUNTDOWN";
      countdown: number;
      activePlayerCount?: number;
      totalPlayerCount?: number;
    }
  | { tableId: string; type: "BLINDS_POSTED" }
  | { tableId: string; type: "DEAL_HOLE"; seat: number; cards: [Card, Card] }
  | {
      tableId: string;
      type: "PLAYER_JOINED";
      seat: number;
      playerId: string;
      nickname?: string;
    }
  | { tableId: string; type: "PLAYER_LEFT"; seat: number; playerId: string }
  | {
      tableId: string;
      type: "PLAYER_DISCONNECTED";
      seat: number;
      playerId: string;
    }
  | {
      tableId: string;
      type: "PLAYER_REJOINED";
      seat: number;
      playerId: string;
      nickname?: string;
    }
  | {
      tableId: string;
      type: "PLAYER_WAITING";
      seat: number;
      playerId: string;
      nickname?: string;
    }
  | {
      tableId: string;
      type: "WAITING_FOR_NEXT_HAND";
      seat: number;
      msg: string;
    }
  | {
      tableId: string;
      type: "PLAYER_SAT_OUT";
      seat: number;
      playerId: string;
      reason?: string;
    }
  | { tableId: string; type: "PLAYER_SAT_IN"; seat: number; playerId: string }
  | { tableId: string; type: "TABLE_RESET"; message?: string }
  | {
      tableId: string;
      type: "ACTION_PROMPT";
      actingIndex: number;
      betToCall: number;
      minRaise: number;
      timeLeftMs: number;
    }
  | {
      tableId: string;
      type: "PLAYER_ACTION_APPLIED";
      playerId: string;
      action: ActionType;
      amount?: number;
    }
  | { tableId: string; type: "ROUND_END"; street: Phase }
  | { tableId: string; type: "DEAL_FLOP"; cards: [Card, Card, Card] }
  | { tableId: string; type: "DEAL_TURN"; card: Card }
  | { tableId: string; type: "DEAL_RIVER"; card: Card }
  | { tableId: string; type: "SHOWDOWN"; revealOrder: string[] }
  | {
      tableId: string;
      type: "PAYOUT";
      potBreakdown: Array<{
        playerId: string;
        amount: number;
        potIndex: number;
      }>;
    }
  | { tableId: string; type: "HAND_END" }
  | { tableId: string; type: "BUTTON_MOVED"; buttonIndex: number }
  | { tableId: string; type: "TIMER"; countdown: number }
  | { tableId: string; type: "DEALER_MESSAGE"; message: string }
  | {
      tableId: string;
      type: "WINNER_ANNOUNCEMENT";
      winners: Array<{ seat: number; playerId: string }>;
      potAmount: number;
    }
  | {
      tableId: "";
      type: "BALANCE_UPDATE";
      playerId: string;
      coins: string;
      tickets: Record<string, string>;
    }
  | {
      tableId: "";
      type: "USER_STATUS_UPDATE";
      playerId: string;
      cashActive: boolean;
      cashTableIds: string[];
      sngActive: boolean;
      mttActive: boolean;
    }
  | { tableId: string; type: "ERROR"; code: string; msg: string };

export type ClientCommand =
  | { cmdId: string; type: "LIST_TABLES" }
  | { cmdId: string; type: "JOIN_TABLE"; tableId: string }
  | { cmdId: string; type: "CREATE_TABLE"; name: string }
  | { cmdId: string; type: "REATTACH"; sessionId: string }
  | { cmdId: string; type: "ATTACH"; userId: string }
  | {
      cmdId: string;
      type: "SIT";
      tableId: string;
      /** desired seat index */
      seat: number;
      buyIn: number;
      /** client wallet address - takes precedence over session */
      playerId?: string;
      /** display name for the player */
      nickname?: string;
    }
  | { cmdId: string; type: "LEAVE" }
  | { cmdId: string; type: "SIT_OUT" }
  | { cmdId: string; type: "SIT_IN" }
  | { cmdId: string; type: "POST_BLIND"; blindType: BlindType }
  | {
      cmdId: string;
      type: "ACTION";
      action: "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALLIN";
      amount?: number;
      playerId?: string; // Optional player ID for identity consistency
    }
  | { cmdId: string; type: "REBUY"; amount: number }
  | { cmdId: string; type: "SHOW_CARDS" }
  | { cmdId: string; type: "MUCK_CARDS" };
