import { useEffect, useRef } from "react";
import { useGameStore } from "../hooks/useGameStore";
import useIsMobile from "../hooks/useIsMobile";

interface Props {
  isMobile?: boolean;
}

export default function DealerWindow({ isMobile: propIsMobile }: Props = {}) {
  const logs = useGameStore((s) => s.logs);
  const containerRef = useRef<HTMLDivElement>(null);
  const hookIsMobile = useIsMobile();
  const isMobile = propIsMobile ?? hookIsMobile;

  return (
    <div className="w-full h-full text-xs flex flex-col">
      {/* Header - Hidden on mobile */}
      {!isMobile && (
        <div className="text-gray-300 font-bold mb-2 border-b border-gray-600/30 pb-1 flex-shrink-0">
          DEALER
        </div>
      )}
      
      {/* Scrollable logs - Newest at top */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ direction: 'rtl' }}
      >
        <div style={{ direction: 'ltr' }}>
          {logs.length > 0 ? (
            logs.slice().reverse().map((msg, i) => (
              <div 
                key={i} 
                className="leading-tight break-words mb-1 text-gray-100"
                style={{ 
                  wordWrap: "break-word", 
                  overflowWrap: "break-word",
                  hyphens: "auto"
                }}
              >
                {msg}
              </div>
            ))
          ) : (
            <div className="text-gray-400 italic">No activity yet...</div>
          )}
        </div>
      </div>
    </div>
  );
}
