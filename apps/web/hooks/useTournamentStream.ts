import { useEffect } from "react";
import { useGameStore } from "./useGameStore";

type TournamentEvent =
  | { type: "TOURNAMENT_UPDATED"; tournament: any }
  | { type: "TOURNAMENT_SEAT"; tournamentId: string; tableId: string; seatIndex: number; playerId: string }
  | { type: "TOURNAMENT_PAYOUTS"; tournamentId: string; payouts: any };

/**
 * Hook to subscribe to tournament WS events and update a local callback.
 * Expects the main websocket connection in gameStore.
 */
export function useTournamentStream(onEvent: (evt: TournamentEvent) => void) {
  const gameStore = useGameStore();
  const ws = gameStore.socket;

  useEffect(() => {
    if (!ws) return;
    const handler = (msg: MessageEvent) => {
      try {
        const data = JSON.parse(msg.data);
        if (!data?.type) return;
        if (
          data.type === "TOURNAMENT_UPDATED" ||
          data.type === "TOURNAMENT_SEAT" ||
          data.type === "TOURNAMENT_PAYOUTS"
        ) {
          onEvent(data as TournamentEvent);
        }
      } catch {
        // ignore parse errors
      }
    };
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [ws, onEvent]);
}
