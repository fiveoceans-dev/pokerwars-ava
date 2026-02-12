import { create } from "zustand";

export interface SeatState {
  playerId: string;
  name?: string | null;
  chips?: number;
}

interface SeatStore {
  seats: Map<number, SeatState>;
  assignSeat: (seatId: number, player: SeatState) => void;
  clearSeat: (seatId: number) => void;
  reset: () => void;
  findSeatId: (playerId: string | null | undefined) => number | undefined;
}

export const seatStore = create<SeatStore>((set, get) => ({
  seats: new Map<number, SeatState>(),
  assignSeat: (seatId, player) =>
    set((state) => {
      const next = new Map(state.seats);
      next.set(seatId, player);
      return { seats: next };
    }),
  clearSeat: (seatId) =>
    set((state) => {
      const next = new Map(state.seats);
      next.delete(seatId);
      return { seats: next };
    }),
  reset: () => set({ seats: new Map<number, SeatState>() }),
  findSeatId: (playerId) => {
    if (!playerId) return undefined;
    const { seats } = get();
    for (const [id, seat] of seats) {
      if (seat.playerId.toLowerCase() === playerId.toLowerCase()) {
        return id;
      }
    }
    return undefined;
  },
}));
