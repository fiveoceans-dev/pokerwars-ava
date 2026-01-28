export type TournamentSeat = {
  playerId: string;
  tableId: string;
  seatIndex: number;
  stack: number;
};

export type TournamentPayoutEntry = {
  playerId: string;
  position: number;
  amount: number;
  currency: "chips" | "tickets";
};

export type TournamentSummary = {
  id: string;
  name: string;
  status: string;
  tables: string[];
  registeredCount: number;
  currentLevel?: number;
  lateRegEndAt?: string;
};
