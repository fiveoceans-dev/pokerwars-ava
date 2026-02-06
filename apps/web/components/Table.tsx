// src/components/Table.tsx

import type { CSSProperties } from "react";
import { useState } from "react";
import { useTableViewModel } from "../hooks/useTableViewModel";
import { useGameStore } from "../hooks/useGameStore";
import Card from "./Card";
import { hashIdToCard } from "../game-engine";
import PlayerSeat from "./PlayerSeat";
import type { Card as TCard } from "../game-engine";
import { useWalletGameSync } from "../hooks/useWalletGameSync";
import useIsMobile from "../hooks/useIsMobile";
import { useCountdownWithPriority } from "../hooks/useCountdown";
import { seatStore } from "../stores/seatStore";
import { getBetChipColorClass } from "../constants/chipColors";
import { formatNumber } from "~~/utils/format";

// New modular components
import TableFelt from "./TableFelt";
import TableCenter from "./TableCenter";
import BuyInModal, { type BuyInConfig } from "./BuyInModal";
import GameTimer from "./GameTimer";

/* ─────────────────────────────────────────────────────── */

export default function Table({ timer }: { timer?: number | null }) {
  const {
    players,
    playerIds,
    playerHands,
    community,
    joinSeat,
    bigBlind,
    chips,
    currentTurn,
    playerBets,
    playerStates,
    layout,
    walletSeatIdx,
    baseW,
    baseH,
    dealerIndex,
    currentRoundBetting,
  } = useTableViewModel(timer);

  const gameStore = useGameStore();
  const { sitOut, sitIn, leaveSeat, playerAction } = gameStore;
  const street = gameStore.street || 0;
  const totalPot = gameStore.pot;
  const cardsRevealed = gameStore.cardsRevealed;
  const recentWinners = gameStore.recentWinners;
  const lastActionLabels = gameStore.lastActionLabels;
  const { isConnected, address } = useWalletGameSync();
  const isMobile = useIsMobile();

  const countdownInfo = useCountdownWithPriority(gameStore.countdowns);
  const seats = seatStore((state) => state.seats);
  const [buyInModal, setBuyInModal] = useState<BuyInConfig | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);

  // Safe Accessors
  const safePlayerHands = Array.isArray(playerHands) ? playerHands : Array(9).fill(null);
  const safePlayerBets = Array.isArray(playerBets) ? playerBets : Array(9).fill(0);
  const safePlayerStates = Array.isArray(playerStates) ? playerStates : Array(9).fill("empty");
  const safePlayerIds = Array.isArray(playerIds) ? playerIds : Array(9).fill(null);

  const isMyTurn = currentTurn !== null && currentTurn === walletSeatIdx;
  const isSittingOut = walletSeatIdx >= 0 && safePlayerStates[walletSeatIdx] === "sittingOut";

  const handleSitOutToggle = async () => {
    if (walletSeatIdx < 0 || isActionPending) return;
    setIsActionPending(true);
    try {
      if (isSittingOut) await sitIn();
      else await sitOut();
    } finally {
      setIsActionPending(false);
    }
  };

  const handleLeaveTable = async () => {
    if (walletSeatIdx < 0 || isActionPending) return;
    setIsActionPending(true);
    try {
      if (isMyTurn) {
        try { await playerAction({ type: "FOLD" }); } catch {}
      }
      await leaveSeat();
    } finally {
      setIsActionPending(false);
    }
  };

  const handleSeatRequest = (idx: number) => {
    if (!isConnected || !address) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("open-wallet-connect"));
      }
      return;
    }

    const gameStoreAddress = gameStore.currentWalletId?.toLowerCase();
    const normalizedAddr = address.toLowerCase();
    if (gameStoreAddress && gameStoreAddress !== normalizedAddr) {
      alert("Wallet address mismatch. Please reconnect.");
      return;
    }

    if (safePlayerIds.some((id) => id?.toLowerCase() === address.toLowerCase())) {
      alert("You are already seated.");
      return;
    }

    const bbMin = 30;
    const bbMax = 100;
    setBuyInModal({ seat: idx, bbAmount: bbMax, bbMin, bbMax, bigBlind });
  };

  const handleBuyInConfirm = (amount: number) => {
    if (!buyInModal) return;
    joinSeat(buyInModal.seat, undefined, amount);
    setBuyInModal(null);
  };

  const unifiedCardSize = "xs";

  // Calculate position for chips relative to seat center (move towards table center)
  const getInnerPosition = (seatPos: { x: string; y: string }, percent: number) => {
    const sx = parseFloat(seatPos.x);
    const sy = parseFloat(seatPos.y);
    const dx = 50 - sx;
    const dy = 50 - sy;
    return {
      x: sx + dx * percent,
      y: sy + dy * percent,
    };
  };

  const seatAt = (idx: number) => {
    const seat = seats.get(idx);
    const pos = layout[idx];
    if (!pos) return null;

    const posStyle = {
      left: pos.x,
      top: pos.y,
      transform: `translate(${pos.t})`,
    } as CSSProperties;

    // State
    const handCodes = safePlayerHands[idx];
    const hasEncryptedCards = handCodes === "encrypted";
    const hand: [TCard, TCard] | null =
      handCodes && Array.isArray(handCodes)
        ? [hashIdToCard(handCodes[0]), hashIdToCard(handCodes[1])]
        : null;
    
    const state = safePlayerStates[idx];
    const isDealer = idx === dealerIndex;
    const isActive = idx === currentTurn;
    const isWinner = recentWinners.has(idx);
    const isOwnSeat = idx === walletSeatIdx;
    const reveal = cardsRevealed[idx] || (isOwnSeat && !!hand);

    // Cards Position: Shifted up to peek out from behind the seat HUD
    const cardsStyle: CSSProperties = {
      position: "absolute",
      left: "50%",
      top: "-35px", 
      transform: "translateX(-50%)",
      zIndex: 0, // Behind seat HUD
    };

    return (
      <div key={idx} className="absolute" style={posStyle}>
        {/* Container for Seat + Cards */}
        <div className="relative w-[140px] h-[50px] flex items-center justify-center z-10">
          {/* Hole Cards */}
          {(hand || hasEncryptedCards) && (
            <div style={cardsStyle} className="flex gap-1 justify-center origin-bottom transition-transform hover:scale-110 hover:z-20 scale-90">
              <Card
                card={hand ? hand[0] : null}
                hidden={!reveal || hasEncryptedCards}
                size={unifiedCardSize}
              />
              <Card
                card={hand ? hand[1] : null}
                hidden={!reveal || hasEncryptedCards}
                size={unifiedCardSize}
              />
            </div>
          )}

          {/* Seat HUD */}
          <div className="relative z-10 w-full h-full">
            <PlayerSeat
              seat={seat}
              status={state}
              isDealer={isDealer}
              isActive={isActive}
              isWinner={isWinner}
              actionLabel={lastActionLabels[idx] || undefined}
              onClick={() => !seat && handleSeatRequest(idx)}
            />
          </div>
        </div>
      </div>
    );
  };

  // Render chips separately to manage z-index
  const chipAt = (idx: number) => {
    const pos = layout[idx];
    if (!pos) return null;
    const betAmount = safePlayerBets[idx] ?? 0;
    if (betAmount <= 0) return null;

    const chipPos = getInnerPosition(pos, 0.28); // 28% towards center
    const style = {
      left: `${chipPos.x}%`,
      top: `${chipPos.y}%`,
      transform: isMobile 
        ? "translate(-50%, -50%) translateY(-50px)" 
        : "translate(-50%, -50%)",
    } as CSSProperties;
    const betBg = getBetChipColorClass(betAmount, bigBlind);

    return (
      <div
        key={`bet-${idx}`}
        style={style}
        className={`absolute z-20 flex items-center justify-center shadow-md ${betBg} 
                    px-2 py-0.5 rounded-full border border-black/20 min-w-[32px]`}
      >
        <span className="text-[10px] font-bold text-white font-mono">
          {formatNumber(betAmount)}
        </span>
      </div>
    );
  };

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full select-none">
      
      {/* 1. Timer / Info Overlay */}
      <GameTimer 
        timeLeft={countdownInfo.timeLeft} 
        activeType={countdownInfo.activeType}
        displayTimer={null} // Legacy timer support if needed
      />

      {/* 2. Buy-in Modal */}
      {buyInModal && (
        <BuyInModal
          config={buyInModal}
          onConfirm={handleBuyInConfirm}
          onCancel={() => setBuyInModal(null)}
        />
      )}

      {/* 3. The Table Surface */}
      <TableFelt>
        {/* Central Area: Community Cards + Pot */}
        <TableCenter 
          community={community}
          street={street}
          currentRoundBetting={currentRoundBetting}
          totalPot={totalPot}
          isMobile={isMobile}
        />

        {/* 4. Game Elements Layer (Seats & Chips) */}
        <div className="absolute inset-0 z-20">
          {layout.map((_, i) => seatAt(i))}
          {layout.map((_, i) => chipAt(i))}
        </div>
      </TableFelt>
    </div>
  );
}
