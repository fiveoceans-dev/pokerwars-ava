import { useEffect } from "react";
import { seatStore } from "../stores/seatStore";
import { useGameStore } from "./useGameStore";
import { shortAddress } from "../utils/address";
import type { ServerEvent } from "../game-engine";
import { notifyError } from "../utils/notifications";
import { useGameSounds } from "./useGameSounds";

export function useGameEvents() {
  const socket = useGameStore((s) => s.socket);
  const tableId = useGameStore((s) => s.tableId);
  const connectionState = useGameStore((s) => s.connectionState);
  const { playSound } = useGameSounds();

  useEffect(() => {
    if (!socket) return;

    const handler = (event: MessageEvent) => {
      let msg: ServerEvent;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (tableId && msg.tableId && msg.tableId !== tableId) return;

      switch (msg.type) {
        case "HAND_START":
        case "DEAL_HOLE":
        case "DEAL_FLOP":
        case "DEAL_TURN":
        case "DEAL_RIVER":
          // playSound("CARD_DEAL");
          break;

        case "PLAYER_ACTION_APPLIED":
          if (msg.action === "ALLIN") {
            playSound("CHIP_ALLIN");
          } else if (["BET", "RAISE", "CALL"].includes(msg.action)) {
            playSound("CHIP_BET");
          }
          break;

        case "WINNER_ANNOUNCEMENT":
          playSound("POT_WIN");
          break;

        case "ERROR":
          if (msg.msg) {
            // Check for rejoin protection floor error
            if (msg.msg.includes("Re-entry minimum required")) {
              const amountMatch = msg.msg.match(/(\d+)/);
              if (amountMatch && typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("open-buyin-reentry", { 
                  detail: { amount: parseInt(amountMatch[1], 10) } 
                }));
                return; // Suppress general toast for this specific recovery flow
              }
            }
            notifyError(msg.msg);
          }
          break;
        case "PLAYER_JOINED":
        case "PLAYER_REJOINED":
        case "PLAYER_WAITING":
          seatStore.getState().assignSeat(msg.seat, {
            playerId: msg.playerId,
            name: (msg as any).nickname || shortAddress(msg.playerId),
          });
          break;
        case "PLAYER_LEFT":
        case "PLAYER_DISCONNECTED":
          seatStore.getState().clearSeat(msg.seat);
          break;
        case "TABLE_SNAPSHOT": {
          // Diff-based update to avoid flicker: assign occupied, clear vacated
          const api = seatStore.getState();
          const table: any = (msg as any).table;
          const occupied = new Set<number>();

          // Assign all occupied seats from snapshot
          table?.seats?.forEach((seat: any, idx: number) => {
            if (seat?.pid) {
              occupied.add(idx);
              api.assignSeat(idx, {
                playerId: seat.pid,
                name: seat.nickname || shortAddress(seat.pid),
              });
            }
          });

          // Clear seats that are no longer occupied
          try {
            const current = new Map(api.seats);
            current.forEach((_, idx) => {
              if (!occupied.has(idx)) api.clearSeat(idx);
            });
          } catch {}
          break;
        }
      }
    };

    socket.addEventListener("message", handler);
    return () => socket.removeEventListener("message", handler);
  }, [socket, tableId, connectionState]);
}

export default useGameEvents;
