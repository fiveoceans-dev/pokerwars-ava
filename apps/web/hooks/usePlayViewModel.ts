import { useEffect, useState } from "react";
import { useGameStore } from "./useGameStore";

/**
 * Persist a session token from the backend websocket and attempt to reattach on reload.
 */
const stageNames = ["preflop", "flop", "turn", "river", "showdown"] as const;

export function usePlayViewModel() {
  const {
    street,
    startHand,
    dealTurn,
    dealRiver,
    playerHands,
    players,
    playerStates,
    startBlindTimer,
  } = useGameStore();
  const [timer, setTimer] = useState<number | null>(null);

  // Ensure we always work with valid arrays
  const safePlayerHands = Array.isArray(playerHands)
    ? playerHands
    : Array(9).fill(null);
  const safePlayers = Array.isArray(players)
    ? players
    : Array(9).fill(null);

  const handStarted = safePlayerHands.some((h) => h !== null);

  // Prefer players array for counts, fall back to playerStates
  let activePlayers = safePlayers.filter(Boolean).length;
  if (
    activePlayers === 0 &&
    Array.isArray(playerStates)
  ) {
    activePlayers = playerStates.filter(
      (s) => s && s !== "empty" && s !== "sittingOut",
    ).length;
  }

  useEffect(() => {
    const originalBody = document.body.style.overflow;
    const originalHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalBody;
      document.documentElement.style.overflow = originalHtml;
    };
  }, []);

  useEffect(() => {
    startBlindTimer();
  }, [startBlindTimer]);

  useEffect(() => {
    if (activePlayers >= 2 && !handStarted && timer === null) {
      setTimer(10);
    }
  }, [activePlayers, handStarted, timer]);

  useEffect(() => {
    if (timer === null || handStarted) return;
    if (timer === 0) {
      startHand();
      setTimer(null);
      return;
    }
    const id = setTimeout(() => setTimer((t) => (t as number) - 1), 1000);
    return () => clearTimeout(id);
  }, [timer, handStarted, startHand]);

  const handleActivate = async () => {
    setTimer(null);
    await startHand();
  };

  return {
    street,
    dealTurn,
    dealRiver,
    timer,
    stageNames,
    handStarted,
    handleActivate,
  };
}
