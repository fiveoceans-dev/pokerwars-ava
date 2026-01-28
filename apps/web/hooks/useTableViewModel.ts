import { useEffect, useMemo, useState } from "react";
import { useGameStore } from "./useGameStore";
import useIsMobile from "./useIsMobile";
import { useWalletGameSync } from "./useWalletGameSync";
import {
  DESKTOP_SEAT_POSITIONS,
  MOBILE_SEAT_POSITIONS,
  DESKTOP_SEAT_POSITIONS_2,
  DESKTOP_SEAT_POSITIONS_6,
  MOBILE_SEAT_POSITIONS_2,
  MOBILE_SEAT_POSITIONS_6,
  type SeatPos,
} from "../utils/seatPositions";

const buildLayout = (isMobile: boolean, maxPlayers: number): SeatPos[] => {
  if (maxPlayers === 2) {
    return isMobile ? MOBILE_SEAT_POSITIONS_2 : DESKTOP_SEAT_POSITIONS_2;
  }
  if (maxPlayers === 6) {
    return isMobile ? MOBILE_SEAT_POSITIONS_6 : DESKTOP_SEAT_POSITIONS_6;
  }
  return isMobile ? MOBILE_SEAT_POSITIONS : DESKTOP_SEAT_POSITIONS;
};

export function useTableViewModel(_timer?: number | null) {
  const {
    players,
    playerIds,
    playerHands,
    community,
    joinSeat,
    bigBlind,
    minRaise,
    chips,
    currentTurn,
    playerBets,
    playerAction,
    playerStates,
    dealerIndex,
    timer: serverTimer,
    currentWalletId,
    tableSeats,
    tableId,
    tableMaxPlayers,
  } = useGameStore();

  // Defensive array fallbacks
  const safePlayers = Array.isArray(players) ? players : Array(9).fill(null);
  const safePlayerIds = Array.isArray(playerIds) ? playerIds : Array(9).fill(null);
  const safePlayerHands = Array.isArray(playerHands)
    ? playerHands
    : Array(9).fill(null);
  const safeChips = Array.isArray(chips) ? chips : Array(9).fill(0);
  const safePlayerBets = Array.isArray(playerBets) ? playerBets : Array(9).fill(0);
  const safePlayerStates = Array.isArray(playerStates)
    ? playerStates
    : Array(9).fill("empty");

  const isMobile = useIsMobile();
  const [tableScale, setTableScale] = useState(1);
  const [bet, setBet] = useState(minRaise);

  useEffect(() => {
    const stack = safeChips[currentTurn ?? 0] ?? minRaise;
    setBet(Math.min(minRaise, stack));
  }, [minRaise, currentTurn, chips]);

  useEffect(() => {
    const handle = () => {
      const baseW = isMobile ? 420 : 820;
      const baseH = isMobile ? 680 : 520;
      const minTableWidth = isMobile ? 360 : baseW;
      // Reserve extra space for action controls so table and buttons remain visible
      const bottomSpace = isMobile ? 220 : 200;
      const minScale = minTableWidth / baseW;
      const scale = Math.min(
        Math.max(window.innerWidth / baseW, minScale),
        (window.innerHeight - bottomSpace) / baseH,
        1,
      );
      setTableScale(isMobile ? scale * 0.85 : scale);
    };
    handle();
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, [isMobile]);

  const layout = useMemo(
    () => buildLayout(isMobile, tableMaxPlayers),
    [isMobile, tableMaxPlayers],
  );

  const localIdx = useMemo(() => {
    let max = 0;
    for (let i = 1; i < layout.length; i++) {
      if (parseFloat(layout[i].y) > parseFloat(layout[max].y)) max = i;
    }
    return max;
  }, [layout]);

  const { address } = useWalletGameSync();
  const walletSeatIdx = useMemo(() => {
    if (!currentWalletId || !tableId) return -1;

    // Check if we have a seat at the current table
    const seatIndex = tableSeats.get(tableId);
    if (seatIndex !== undefined) {
      // Verify the seat is still ours in the current player list
      const playerId = safePlayerIds[seatIndex];
      if (
        playerId &&
        playerId.toLowerCase() === currentWalletId.toLowerCase()
      ) {
        return seatIndex;
      }
    }

    // Fallback: search through playerIds (for compatibility)
    return safePlayerIds.findIndex(
      (id) =>
        id &&
        currentWalletId &&
        id.toLowerCase() === currentWalletId.toLowerCase(),
    );
  }, [playerIds, currentWalletId, tableSeats, tableId]);

  const communityCardSize = useMemo((): "xs" | "sm" | "md" | "lg" => {
    return tableScale < 0.75 ? "xs" : tableScale < 1 ? "sm" : "md";
  }, [tableScale]);

  const baseW = isMobile ? 420 : 820;
  const baseH = isMobile ? 680 : 520;
  const highestBet = Math.max(0, ...safePlayerBets);
  // Use walletSeatIdx instead of localIdx for current player
  const myBet = walletSeatIdx >= 0 ? safePlayerBets[walletSeatIdx] ?? 0 : 0;
  const myChips = walletSeatIdx >= 0 ? safeChips[walletSeatIdx] ?? 0 : 0;
  const toCall = Math.max(0, highestBet - myBet);
  let actions: string[] = [];
  if (currentTurn === walletSeatIdx) {
    actions = ["Fold"];
    if (toCall > 0) {
      actions.push("Call");
      if (myChips > toCall) actions.push("Raise");
    } else {
      actions.push("Check");
      if (myChips > 0) actions.push("Bet");
    }
  }
  const betEnabled = actions.includes("Bet") || actions.includes("Raise");
  const maxBet = myChips;
  const currentRoundBetting = safePlayerBets.reduce((sum, bet) => sum + bet, 0);

  const displayTimer = serverTimer;

  const handleActionClick = (action: string) => {
    switch (action) {
      case "Fold":
        playerAction({ type: "FOLD" });
        break;
      case "Check":
        playerAction({ type: "CHECK" });
        break;
      case "Call":
        playerAction({ type: "CALL" });
        break;
      case "Bet":
      case "Raise":
        playerAction({ type: "RAISE", amount: bet });
        break;
    }
  };

  const actionDisabled = currentTurn !== walletSeatIdx;

  return {
    players: safePlayers,
    playerIds: safePlayerIds,
    playerHands: safePlayerHands,
    community,
    joinSeat,
    bigBlind,
    minRaise,
    chips: safeChips,
    currentTurn,
    playerBets: safePlayerBets,
    playerAction,
    playerStates: safePlayerStates,
    layout,
    localIdx,
    walletSeatIdx,
    tableScale,
    bet,
    setBet,
    communityCardSize,
    baseW,
    baseH,
    actions,
    betEnabled,
    maxBet,
    displayTimer,
    actionDisabled,
    handleActionClick,
    dealerIndex,
    currentRoundBetting,
  };
}
