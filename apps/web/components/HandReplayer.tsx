"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../hooks/useGameStore";
import TableWithLottie from "./TableWithLottie";
import { PlayPageStyles } from "./PlayPageStyles";
import DealerWindow from "./DealerWindow";
import ChatWindow from "./ChatWindow";
import useIsMobile from "../hooks/useIsMobile";
import { useTableViewModel } from "../hooks/useTableViewModel";

interface HandReplayerProps {
  handData: any;
  autoPlay?: boolean;
}

export default function HandReplayer({ handData, autoPlay = true }: HandReplayerProps) {
  const isMobile = useIsMobile();
  const { processServerEvent, addLog } = useGameStore();
  const { baseW, baseH } = useTableViewModel();
  
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [eventIndex, setEventIndex] = useState(0);
  const [tableScale, setTableScale] = useState(1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize hand state
  useEffect(() => {
    if (!handData) return;
    
    // Set initial players from hand data
    if (handData.initialSeats) {
      processServerEvent({
        type: "TABLE_SNAPSHOT",
        table: {
          id: handData.id,
          phase: "waiting",
          seats: handData.initialSeats.map((s: any) => ({
            ...s,
            status: "active"
          })),
          communityCards: [],
          pots: [],
          button: handData.events[0]?.data?.button ?? 0,
          smallBlind: handData.config.smallBlind,
          bigBlind: handData.config.bigBlind
        }
      } as any);
    }
  }, [handData, processServerEvent]);

  // Playback logic
  useEffect(() => {
    if (!isPlaying || !handData || eventIndex >= handData.events.length) {
      if (eventIndex >= handData.events.length) {
        // Loop back to start after a delay
        timerRef.current = setTimeout(() => {
          setEventIndex(0);
        }, 5000);
      }
      return;
    }

    const event = handData.events[eventIndex];
    const delay = event.delay || 1000;

    timerRef.current = setTimeout(() => {
      processServerEvent(event);
      setEventIndex(prev => prev + 1);
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, eventIndex, handData, processServerEvent]);

  // Layout scaling (reused from PlayTableContainer)
  useEffect(() => {
    const calculateLayout = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const availableWidth = viewportWidth;
      const availableHeight = viewportHeight;

      const scaleByWidth = availableWidth / baseW;
      const scaleByHeight = availableHeight / baseH;
      const optimalScale = Math.min(scaleByWidth, scaleByHeight, 1);
      const minScale = isMobile ? 0.38 : 0.5;
      const finalScale = isMobile ? Math.max(optimalScale * 0.85, minScale) : Math.max(optimalScale, minScale);
      
      setTableScale(finalScale);
    };

    calculateLayout();
    window.addEventListener("resize", calculateLayout);
    return () => window.removeEventListener("resize", calculateLayout);
  }, [baseW, baseH, isMobile]);

  return (
    <div className="play-page-container w-full h-full relative overflow-hidden" style={{ minHeight: '600px' }}>
      <div
        className="table-container"
        style={{
          position: "absolute",
          width: `${baseW}px`,
          height: `${baseH}px`,
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) scale(${tableScale})`,
          transformOrigin: "center center",
        }}
      >
        <TableWithLottie />
      </div>

      {/* Replayer Controls */}
      <div className="absolute top-4 left-4 z-50 flex gap-2">
        <button 
          onClick={() => setIsPlaying(!isPlaying)}
          className="tbtn text-xs px-4 py-2 bg-black/40 backdrop-blur-md"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button 
          onClick={() => { setEventIndex(0); setIsPlaying(true); }}
          className="tbtn text-xs px-4 py-2 bg-black/40 backdrop-blur-md"
        >
          Restart
        </button>
        <div className="px-4 py-2 rounded-lg bg-black/40 backdrop-blur-md text-xs text-white/70 flex items-center border border-white/5 font-mono">
          Hand: {handData?.name} ({eventIndex}/{handData?.events.length})
        </div>
      </div>

      <div className={`absolute bottom-0 left-0 ${isMobile ? "w-40 h-24 m-2" : "w-64 h-32 m-4"} overflow-hidden z-50 pointer-events-none opacity-60`}>
        <DealerWindow isMobile={isMobile} />
      </div>

      <PlayPageStyles />
    </div>
  );
}
