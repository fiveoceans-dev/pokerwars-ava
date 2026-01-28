import { useMemo } from "react";
import { useGameStore } from "./useGameStore";

export interface PokerAction {
  type: "fold" | "check" | "call" | "bet" | "raise";
  label: string;
  enabled: boolean;
  amount?: number;
}

export function usePokerActions() {
  const {
    currentTurn,
    playerBets,
    chips,
    currentWalletId,
    playerIds,
    playerStates,
    dealerIndex,
    bigBlind,
    minRaise,
    street,
    actionHistory,
    tableMaxPlayers,
  } = useGameStore();

  return useMemo(() => {
    // Early return with empty actions if critical data is not available
    if (!currentWalletId) {
      console.log("🎮 No wallet ID available for actions");
      return [];
    }

    // Defensive checks for array integrity
    const safePlayerIds = Array.isArray(playerIds)
      ? playerIds
      : Array(9).fill(null);
    const safePlayerBets = Array.isArray(playerBets)
      ? playerBets
      : Array(9).fill(0);
    const safeChips = Array.isArray(chips) ? chips : Array(9).fill(0);

    // Log current state for debugging
    console.log("🎮 usePokerActions state:", {
      currentWalletId,
      hasPlayerIds: !!playerIds,
      playerIdsLength: safePlayerIds.length,
      hasPlayerBets: !!playerBets,
      playerBetsLength: safePlayerBets.length,
      hasChips: !!chips,
      chipsLength: safeChips.length,
    });

    // Find the current player's seat using case-insensitive comparison
    const mySeatIndex = safePlayerIds.findIndex(
      (id) =>
        id &&
        currentWalletId &&
        typeof id === "string" &&
        typeof currentWalletId === "string" &&
        id.toLowerCase() === currentWalletId.toLowerCase(),
    );

    // If we can't find the player, return empty actions
    if (mySeatIndex < 0) {
      return [];
    }

    const isMyTurn = currentTurn === mySeatIndex;
    const myChips =
      mySeatIndex < safeChips.length ? safeChips[mySeatIndex] || 0 : 0;
    const myCurrentBet =
      mySeatIndex < safePlayerBets.length
        ? safePlayerBets[mySeatIndex] || 0
        : 0;

    // Check player state - don't allow actions if sitting out
    const safePlayerStates = Array.isArray(playerStates)
      ? playerStates
      : Array(9).fill("empty");
    const myPlayerState =
      mySeatIndex < safePlayerStates.length
        ? safePlayerStates[mySeatIndex]
        : "empty";
    const canTakeActions = myPlayerState === "active";

    // Calculate the current betting state with defensive checks
    const maxBet =
      safePlayerBets.length > 0
        ? Math.max(
            ...safePlayerBets.filter(
              (bet) => typeof bet === "number" && !isNaN(bet),
            ),
          )
        : 0;
    const betToCall = Math.max(0, maxBet - myCurrentBet);

    // Debug logging for action button issues
    if (currentWalletId) {
      console.log("🎮 usePokerActions DEBUG:", {
        currentWalletId: currentWalletId.slice(0, 10) + "...",
        mySeatIndex,
        currentTurn,
        isMyTurn,
        myChips,
        myCurrentBet,
        maxBet,
        betToCall,
        playerIds: safePlayerIds.map((id, i) => ({
          i,
          id: id?.slice(0, 10) + "...",
          chips: safeChips[i] || 0,
          bet: safePlayerBets[i] || 0,
        })),
      });
    }
    const canCheck = betToCall === 0;
    const canBet = maxBet === 0; // No one has bet yet in this round
    // Use minRaise from game state; fall back to big blind if undefined
    const minRaiseAmount = minRaise || bigBlind;

    // Check if this is BB with option (preflop, I'm BB, everyone called)
    const totalPlayers =
      safePlayerIds.filter(Boolean).length ||
      safePlayerStates.filter(
        (s) => s && s !== "empty" && s !== "sittingOut",
      ).length;
    const seatCount = tableMaxPlayers || safePlayerIds.length;
    const bbIndex =
      dealerIndex !== null && totalPlayers > 2
        ? (dealerIndex + 2) % seatCount // Multi-way: BB is 2 seats after dealer
        : dealerIndex !== null && totalPlayers === 2
          ? (dealerIndex + 1) % seatCount // Heads-up: BB is 1 seat after dealer (non-dealer)
          : -1;

    const isBBWithOption =
      street === 0 && // preflop
      mySeatIndex === bbIndex && // I'm the big blind
      betToCall === 0 && // No additional bet to call
      maxBet === bigBlind && // Max bet is still just the BB
      mySeatIndex >= 0; // Valid seat index

    // Safety check: if we don't have chips data, return limited actions
    if (myChips < 0) {
      return [
        {
          type: "fold",
          label: "Fold",
          enabled: false,
        },
      ];
    }

    const actions: PokerAction[] = [
      {
        type: "fold",
        label: "Fold",
        enabled: isMyTurn && canTakeActions, // Can always fold when it's your turn
      },
      {
        type: "check",
        label: "Check",
        enabled: isMyTurn && canTakeActions && canCheck,
      },
      {
        type: "call",
        label: `Call $${Math.min(betToCall, myChips)}${myChips < betToCall ? " (All-in)" : ""}`,
        enabled: isMyTurn && canTakeActions && betToCall > 0 && myChips > 0,
        amount: Math.min(betToCall, myChips),
      },
      {
        type: "bet",
        label: "Bet",
        enabled: isMyTurn && canTakeActions && canBet && myChips >= 50,
      },
      {
        type: "raise",
        label: "Raise",
        enabled:
          isMyTurn &&
          canTakeActions &&
          ((betToCall > 0 && myChips >= betToCall + minRaiseAmount) ||
            (isBBWithOption && myChips >= bigBlind)),
      },
    ];

    // Additional logging for action states (only when it's my turn to avoid spam)
    if (currentWalletId && isMyTurn) {
      console.log("🎯 Action buttons state:", {
        mySeatIndex,
        currentTurn,
        myChips,
        myCurrentBet,
        maxBet,
        betToCall,
        myPlayerState,
        canTakeActions,
        canFold: betToCall > 0,
        canCheck: canCheck,
        canCall: betToCall > 0 && myChips > 0,
        canBet: canBet && myChips >= bigBlind,
        canRaise:
          (betToCall > 0 && myChips >= betToCall + minRaiseAmount) ||
          (isBBWithOption && myChips >= bigBlind),
        isBBWithOption,
        actions: actions.map((a) => ({ type: a.type, enabled: a.enabled })),
      });
    }

    return actions;
  }, [
    currentTurn,
    playerBets,
    chips,
    currentWalletId,
    playerIds,
    playerStates,
    dealerIndex,
    bigBlind,
    minRaise,
    street,
    actionHistory,
  ]);
}
