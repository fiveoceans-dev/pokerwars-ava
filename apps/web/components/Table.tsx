// src/components/Table.tsx

import type { CSSProperties } from "react";
import { useTableViewModel } from "../hooks/useTableViewModel";
import { useGameStore } from "../hooks/useGameStore";
import Card from "./Card";
import { hashIdToCard } from "../game-engine";
import PlayerSeat from "./PlayerSeat";
import type { Card as TCard } from "../game-engine";
import { useWalletGameSync } from "../hooks/useWalletGameSync";
import { PotDisplayBubbles } from "./PotDisplayBubbles";
import useIsMobile from "../hooks/useIsMobile";
import { useCountdownWithPriority } from "../hooks/useCountdown";
import { seatStore } from "../stores/seatStore";
import { getBetChipColorClass } from "../constants/chipColors";
import { shortAddress } from "../utils/address";

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
    localIdx,
    actionDisabled,
    handleActionClick,
    dealerIndex,
    currentRoundBetting,
  } = useTableViewModel(timer);

  const gameStore = useGameStore();
  const street = gameStore.street || 0; // Get street from game store, default to 0
  const totalPot = gameStore.pot;
  const cardsRevealed = gameStore.cardsRevealed;
  const revealCards = gameStore.revealCards;
  const recentWinners = gameStore.recentWinners;
  const lastActionLabels = gameStore.lastActionLabels;
  const { isConnected, address } = useWalletGameSync();
  const isMobile = useIsMobile();

  // Use new client-driven countdown system
  const countdownInfo = useCountdownWithPriority(gameStore.countdowns);
  const seats = seatStore((state) => state.seats);

  // Ensure arrays are always defined
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

  // Debug logging for player data
  console.log("🎲 Table component debug:", {
    playersCount: safePlayers.filter((p) => p).length,
    players: safePlayers
      .map((p, i) => ({ seat: i, name: p }))
      .filter((p) => p.name),
    playerIds: safePlayerIds
      .map((id, i) => ({ seat: i, id: id?.slice(0, 10) + "..." }))
      .filter((p) => p.id && p.id !== "undefined..."),
    chips: safeChips
      .map((c, i) => ({ seat: i, chips: c }))
      .filter((c) => c.chips > 0),
    currentTurn,
    dealerIndex,
    displayTimer,
  });

  const handleSeatRequest = (idx: number) => {
    if (!isConnected || !address) {
      // Trigger global wallet connect dialog
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("open-wallet-connect"));
      }
      return;
    }

    // Enhanced address validation - ensure navbar address matches game store
    const gameStoreAddress = gameStore.currentWalletId;
    const storedAddress =
      typeof window !== "undefined"
        ? localStorage.getItem("walletAddress")
        : null;

    console.log("🔍 Address validation for seating:", {
      navbarAddress: address.slice(0, 10) + "...",
      gameStoreAddress: gameStoreAddress?.slice(0, 10) + "..." || "null",
      storedAddress: storedAddress?.slice(0, 10) + "..." || "null",
    });

    // Priority validation: navbar address should match game store and localStorage
    if (gameStoreAddress !== address) {
      console.warn("🚫 Address mismatch: navbar vs game store", {
        navbar: address,
        gameStore: gameStoreAddress,
      });
      alert("Wallet address mismatch detected. Please reconnect your wallet.");
      return;
    }

    if (storedAddress !== address) {
      console.warn("🚫 Address mismatch: navbar vs localStorage", {
        navbar: address,
        stored: storedAddress,
      });
      alert("Wallet address mismatch detected. Please reconnect your wallet.");
      return;
    }

    // Prevent seating if this wallet is already seated at the table
    if (safePlayerIds.some((id) => id?.toLowerCase() === address.toLowerCase())) {
      alert("You are already seated at this table");
      return;
    }

    // Additional validation: check if any other address variants are seated
    if (
      gameStoreAddress &&
      safePlayerIds.some(
        (id) =>
          id &&
          id.toLowerCase() === gameStoreAddress.toLowerCase() &&
          id.toLowerCase() !== address.toLowerCase(),
      )
    ) {
      console.warn("🚫 Different address variant already seated", {
        seated: gameStoreAddress,
        requesting: address,
      });
      alert(
        "A different variant of your wallet address is already seated. Please refresh the page.",
      );
      return;
    }

    console.log(
      "✅ Address validation passed, joining seat",
      idx,
      "with address:",
      address.slice(0, 10) + "...",
    );
    // Join seat using the validated address
    joinSeat(idx);
  };

  // The table is always visible; wallet connections are handled elsewhere.

  // Slightly smaller hole cards to fit tighter seats
  const holeCardSize = "xs";

  /* helper – calculate position along oval border from seat toward center */
  const getOvalPosition = (
    seatPos: { x: string; y: string },
    percentage: number,
  ) => {
    // Parse seat position percentages
    const seatX = parseFloat(seatPos.x);
    const seatY = parseFloat(seatPos.y);

    // Center is at 50%, 50%
    const centerX = 50;
    const centerY = 50;

    // Calculate direction vector from seat to center
    const dx = centerX - seatX;
    const dy = centerY - seatY;

    // Apply percentage along the line from seat toward center
    const targetX = seatX + (dx * percentage) / 100;
    const targetY = seatY + (dy * percentage) / 100;

    return { x: targetX, y: targetY };
  };

  /* helper – render a seat or an empty placeholder */
  const seatAt = (idx: number) => {
    const seat = seats.get(idx);
    const handCodes = safePlayerHands[idx];
    const pos = layout[idx];
    if (!pos) return null;
    const posStyle = {
      left: pos.x,
      top: pos.y,
      transform: `translate(${pos.t})`,
    } as CSSProperties;

    // Position dealer button at 40% from seat toward center (20% closer than chips)
    const dealerPosition = getOvalPosition(pos, 40);
    const dealerOffset = {
      x: (dealerPosition.x - parseFloat(pos.x)) * (baseW / 100),
      y: (dealerPosition.y - parseFloat(pos.y)) * (baseH / 100),
    };
    const isSeatEmpty = !seat;

    /* ── occupied seat ───────────────────────────────────── */
    const hand: [TCard, TCard] | null = handCodes
      ? [hashIdToCard(handCodes[0]), hashIdToCard(handCodes[1])]
      : null;
    const state = safePlayerStates[idx];
    const playerChips = safeChips[idx] ?? 0;
    const betAmount = safePlayerBets[idx] ?? 0;
    const isDealer = idx === dealerIndex;
    const isActive = idx === currentTurn;
    const isWinner = recentWinners.has(idx);
    const isAllIn = state === "allin";
    const isPlaceholderAddress = (addr: string) =>
      addr.toLowerCase() === "white" || /^0x0{40}$/.test(addr);
    const displayName =
      seat?.name?.trim()
        ? seat.name
        : seat?.playerId && !isPlaceholderAddress(seat.playerId)
          ? shortAddress(seat.playerId)
          : "—";
    const statusLabel =
      lastActionLabels[idx] ||
      (state === "sittingOut" ? "Sitting Out" : null);
    const statusClass = (() => {
      if (!statusLabel) return "";
      const lower = statusLabel.toLowerCase();
      if (lower.includes("all") || lower === "winner") {
        return "text-[var(--color-neon-yellow)]";
      }
      if (lower === "fold") return "text-gray-400";
      if (state === "sittingOut") return "text-orange-300";
      return "text-blue-300";
    })();
    const badgeLabel = isSeatEmpty ? "Play" : displayName;
    const badgeSubLabel = isSeatEmpty
      ? `Seat ${idx + 1}`
      : `$${playerChips.toLocaleString()}`;
    // Reveal rules:
    // - Own seat: always reveal own cards once dealt (professional poker UX)
    // - Winners or players who opted to reveal: cardsRevealed[idx] set by store
    // - Auto-reveal at showdown: still controlled by autoRevealAtShowdown
    const isOwnSeat = idx === walletSeatIdx;
    const revealOwn = isOwnSeat && hand !== null; // Always show own cards if dealt
    const reveal = cardsRevealed[idx] || revealOwn;

    const badge = (
      <div
        className={`absolute left-1/2 -translate-x-1/2 px-3 h-10 rounded-full
                  bg-[#0e1117] text-white flex flex-col items-center justify-center
                  font-mono tabular-nums min-w-[96px] shadow-[0_4px_16px_rgba(0,0,0,0.4)]
                  ${
                    isSeatEmpty
                      ? "cursor-pointer hover:border-[var(--brand-accent)] hover:text-[var(--brand-accent)] border border-dashed border-white/30 pointer-events-auto"
                      : "border border-white/30 pointer-events-none"
                  }`}
        style={{ top: "-34px" }}
        onClick={() => {
          if (isSeatEmpty) handleSeatRequest(idx);
        }}
      >
        <span className="text-[10px] uppercase tracking-wide leading-tight text-white/80">
          {badgeLabel}
        </span>
        <span className="text-xs leading-tight">
          {badgeSubLabel}
        </span>
      </div>
    );

    if (isSeatEmpty) {
      return (
        <div key={idx} style={posStyle} className="absolute">
          <div className="relative h-10">
            {badge}
            {statusLabel && (
              <span
                className={`absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap ${statusClass}`}
                style={{ top: "9px" }} // 3px under badge bottom
              >
                {statusLabel}
              </span>
            )}
          </div>
        </div>
      );
    }

    // Position chips at 30% from seat toward center (on oval border)
    const chipPosition = getOvalPosition(pos, 30);
    const betStyle = {
      left: `${chipPosition.x}%`,
      top: `${chipPosition.y}%`,
      transform: "translate(-50%, -50%)",
    } as CSSProperties;
    const betBg = getBetChipColorClass(betAmount, bigBlind);

    const seatCount = layout.length || safePlayers.length;
    // Calculate blind positions (SB = dealer + 1, BB = dealer + 2 for multi-way games)
    const totalPlayers =
      safePlayers.filter((p) => p).length ||
      safePlayerStates.filter(
        (s) => s && s !== "empty" && s !== "sittingOut",
      ).length;
    const isSmallBlind =
      totalPlayers > 2 &&
      dealerIndex !== null &&
      (dealerIndex + 1) % seatCount === idx;
    const isBigBlind =
      totalPlayers > 2 &&
      dealerIndex !== null &&
      (dealerIndex + 2) % seatCount === idx;
    // For heads-up, dealer is SB
    const isHeadsUpSmallBlind =
      totalPlayers === 2 && dealerIndex !== null && dealerIndex === idx;
    const isHeadsUpBigBlind =
      totalPlayers === 2 &&
      dealerIndex !== null &&
      (dealerIndex + 1) % seatCount === idx;

    return (
      <div key={idx} className="contents">
        <div style={posStyle} className="absolute">
          <div className="relative">
            {badge}
            {statusLabel && (
              <span
                className={`absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap ${statusClass}`}
                style={{ top: "9px" }} // 3px under badge bottom
              >
                {statusLabel}
              </span>
            )}
            <div style={{ transform: `rotate(${pos.r}deg)` }}>
              <PlayerSeat
                seat={seat}
                status={state}
                isDealer={isDealer}
                isActive={isActive}
                revealCards={reveal}
                cardSize={holeCardSize}
                dealerOffset={dealerOffset}
                isWinner={isWinner}
                actionLabel={lastActionLabels[idx] || undefined}
                hand={hand}
              />
            </div>
          </div>
        </div>
        {betAmount > 0 && (
          <div
            style={betStyle}
            className={`absolute w-6 h-6 rounded-full border-2 border-black flex items-center justify-center text-xs text-white font-semibold ${betBg}`}
          >
            {betAmount}
          </div>
        )}
        {isAllIn && (
          <div
            style={{
              left: `${chipPosition.x}%`,
              top: `${chipPosition.y}%`,
              // Offset well away from bet chips to avoid overlap
              transform: "translate(-50%, -50%) translate(0, 28px)",
              clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
            }}
            className="absolute w-9 h-9 bg-red-600 text-white text-[7px] font-bold flex items-center justify-center uppercase tracking-[0.06em] pointer-events-none z-30"
          >
            <span className="text-center leading-[0.9]">
              All
              <br />
              in
            </span>
          </div>
        )}
        {(isSmallBlind || isHeadsUpSmallBlind) && (
          <div
            style={{
              left: `${chipPosition.x}%`,
              top: `${chipPosition.y}%`,
              transform: "translate(-50%, -50%) translate(-12px, -12px)",
            }}
            className="absolute w-4 h-4 rounded-full bg-blue-600 border border-white flex items-center justify-center text-xs text-white font-bold pointer-events-none z-30"
          >
            SB
          </div>
        )}
        {(isBigBlind || isHeadsUpBigBlind) && (
          <div
            style={{
              left: `${chipPosition.x}%`,
              top: `${chipPosition.y}%`,
              transform: "translate(-50%, -50%) translate(12px, -12px)",
            }}
            className="absolute w-4 h-4 rounded-full bg-orange-600 border border-white flex items-center justify-center text-xs text-white font-bold pointer-events-none z-30"
          >
            BB
          </div>
        )}
      </div>
    );
  };

  // BANK element removed - replaced with pot display bubbles

  /* community cards – only reveal dealt streets */
  const visibleCommunity = community.filter((c): c is number => c !== null);
  const communityRow = (
    <div className="absolute inset-0 flex items-center justify-center w-full">
      <div className="relative">
        <div className="relative z-20 flex items-center gap-2 px-4">
          {visibleCommunity.map((code, i) => (
            <Card key={i} card={hashIdToCard(code)} size={communityCardSize} />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full">
      {/* Client-driven countdown display with priority handling */}
      {countdownInfo.timeLeft !== null && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-white bg-black/70 px-4 py-2 rounded-lg z-50">
          {countdownInfo.activeType && (
            <span className="text-sm font-medium">
              {countdownInfo.activeType === "game_start" && "Game Starting"}
              {countdownInfo.activeType === "action" && "Action Timer"}
              {countdownInfo.activeType === "street_deal" && "Dealing Cards"}
              {countdownInfo.activeType === "new_hand" && "New Hand"}
              {countdownInfo.activeType === "reconnect" && "Reconnecting"}
            </span>
          )}
          <span className="text-2xl font-mono font-bold">
            {countdownInfo.timeLeft.toString().padStart(2, "0")}
          </span>
        </div>
      )}

      {/* Legacy timer fallback for compatibility */}
      {countdownInfo.timeLeft === null && displayTimer !== null && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-white bg-black/70 px-4 py-2 rounded-lg z-50">
          <span className="text-sm font-medium">Timer</span>
          <span className="text-2xl font-mono font-bold">
            {displayTimer.toString().padStart(2, "0")}
          </span>
        </div>
      )}

      {/* poker-table oval */}
      <div className="relative" style={{ width: baseW, height: baseH }}>
        {/* Pot Display Bubbles above community to avoid overlap */}
        <div className="absolute left-1/2 top-[10%] -translate-x-1/2 z-30">
          <PotDisplayBubbles
            currentRoundBetting={currentRoundBetting}
            totalPot={totalPot}
            isMobile={isMobile}
          />
        </div>

        <div
          className="relative rounded-full border-8 border-[var(--brand-accent)] bg-main shadow-[0_0_40px_rgba(0,0,0,0.6)]"
          style={{
            width: baseW,
            height: baseH,
            transform: `scale(1)`,
            transformOrigin: "center",
          }}
        >
          {communityRow}

          {/* seats */}
          {layout.map((_, i) => seatAt(i))}
        </div>
      </div>

      {/* Show-cards control moved into PlayerActionButtons */}
    </div>
  );
}
