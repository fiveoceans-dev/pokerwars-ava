"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PlayPageStyles } from "~~/components/PlayPageStyles";
import Table from "../../components/Table";
import DealerWindow from "../../components/DealerWindow";
import ChatWindow from "../../components/ChatWindow";
import PlayerActionButtons from "../../components/PlayerActionButtons";
import { useTableViewModel } from "../../hooks/useTableViewModel";
import { useGameStore } from "../../hooks/useGameStore";
import { usePlayViewModel } from "../../hooks/usePlayViewModel";
import useIsMobile from "../../hooks/useIsMobile";
import useGameEvents from "../../hooks/useGameEvents";

function PlayPageInner() {
  const searchParams = useSearchParams();
  const tableId = searchParams.get("table");
  const isMobile = useIsMobile();
  const { 
    joinTable, 
    playerBets, 
    currentTurn, 
    chips, 
    playerStates, 
    minRaise,
    sitOut,
    sitIn,
    leaveSeat,
    playerAction
  } = useGameStore();
  const { baseW, baseH, walletSeatIdx } = useTableViewModel();
  const { timer } = usePlayViewModel();
  const [layoutReady, setLayoutReady] = useState(false);
  const [tableScale, setTableScale] = useState(1);
  const [isActionPending, setIsActionPending] = useState(false);

  useGameEvents();

  useEffect(() => {
    if (tableId) {
      joinTable(tableId);
    } else {
      joinTable("demo");
    }
  }, [tableId, joinTable]);

  useEffect(() => {
    const calculateLayout = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const paddingV = 0;
      const paddingH = 0;
      const availableWidth = viewportWidth - paddingH;
      const availableHeight = viewportHeight - paddingV;

      const scaleByWidth = availableWidth / baseW;
      const scaleByHeight = availableHeight / baseH;
      const optimalScale = Math.min(scaleByWidth, scaleByHeight, 1);
      const minScale = isMobile ? 0.38 : 0.5;
      const finalScale = isMobile ? Math.max(optimalScale * 0.85, minScale) : Math.max(optimalScale, minScale);
      
      setTableScale((prev) => {
        if (Math.abs(prev - finalScale) < 0.001) return prev;
        return finalScale;
      });
      setLayoutReady(true);
    };

    calculateLayout();
    window.addEventListener("resize", calculateLayout);
    return () => window.removeEventListener("resize", calculateLayout);
  }, [baseW, baseH, isMobile]);

  // Derived state for controls
  const isMyTurn = currentTurn !== null && currentTurn === walletSeatIdx;
  const isSittingOut = walletSeatIdx >= 0 && playerStates[walletSeatIdx] === "sittingOut";
  const myChips = walletSeatIdx >= 0 ? chips[walletSeatIdx] : 0;
  const myCommitted = walletSeatIdx >= 0 ? playerBets[walletSeatIdx] : 0;
  // Filter out null/undefined bets before calculating max
  const validBets = playerBets.filter((b) => typeof b === 'number');
  const currentBet = validBets.length > 0 ? Math.max(...validBets) : 0;

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

  return (
    <div
      className="play-page-container"
      data-layout={isMobile ? "mobile" : "desktop"}
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh" }}
    >
      <div
        className="table-container"
        role="main"
        style={{
          position: "absolute",
          width: `${baseW}px`,
          height: `${baseH}px`,
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) scale(${tableScale})`,
          transformOrigin: "center center",
          opacity: layoutReady ? 1 : 0,
          transition: "opacity 0.2s ease, transform 0.3s ease",
        }}
      >
        <Table timer={timer} />
      </div>

      {/* Top Right Navigation & Controls - Aligned with Header content-wrap */}
      <div className="absolute top-[60px] left-0 right-0 z-50 pointer-events-none">
        <div className="content-wrap flex justify-end">
          <div className="flex items-center gap-2 pointer-events-auto">
            {walletSeatIdx >= 0 && (
              <>
                <button 
                  onClick={handleSitOutToggle}
                  disabled={isActionPending}
                  className={`tbtn text-[10px] px-2 h-7 flex items-center justify-center min-w-[70px] ${isSittingOut ? "bg-amber-600/20 border-amber-600/50 text-amber-400" : ""}`}
                >
                  {isSittingOut ? "Sit In" : "Sit Out"}
                </button>
                <button 
                  onClick={handleLeaveTable}
                  disabled={isActionPending}
                  className="tbtn text-[10px] px-2 h-7 flex items-center justify-center text-rose-400 border-rose-400/30 hover:bg-rose-400/10"
                >
                  Leave
                </button>
              </>
            )}
            <button 
              onClick={() => window.history.back()}
              className="tbtn text-[10px] px-3 h-7 flex items-center justify-center text-white/60 hover:text-white"
            >
              Back
            </button>
          </div>
        </div>
      </div>

      {/* Dealer Messages (Chat) - Bottom Left */}
      <div 
        className={`absolute bottom-0 left-0 ${isMobile ? "w-40 h-24 m-2" : "w-64 h-32 m-4"} overflow-hidden z-50`}
      >
        <DealerWindow isMobile={isMobile} />
      </div>

      {/* Chat Component - Bottom Right */}
      <div 
        className={`absolute bottom-0 right-0 ${isMobile ? "w-40 h-24 m-2" : "w-64 h-32 m-4"} overflow-hidden z-50`}
      >
        <ChatWindow />
      </div>

      {/* Player Actions - Bottom Center */}
      {walletSeatIdx >= 0 && (
        <div 
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-auto z-50 pointer-events-none"
          style={{ paddingBottom: isMobile ? '10px' : '20px' }}
        >
          <div className="pointer-events-auto">
            <PlayerActionButtons
              isPlayerTurn={isMyTurn && !isSittingOut}
              currentBet={currentBet}
              playerCommitted={myCommitted}
              playerChips={myChips}
              minRaise={minRaise}
              isMobile={isMobile}
              className="bg-black/60 backdrop-blur-xl p-2 rounded-xl border border-white/10 shadow-2xl"
            />
          </div>
        </div>
      )}

      <PlayPageStyles />
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <PlayPageInner />
    </Suspense>
  );
}
