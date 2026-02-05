interface GameTimerProps {
  timeLeft: number | null;
  activeType: string | null;
  displayTimer?: number | null;
}

export default function GameTimer({ timeLeft, activeType, displayTimer }: GameTimerProps) {
  if (timeLeft !== null) {
    return (
      <div className="absolute top-[-60px] left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white px-4 py-1 rounded-full border border-white/10 backdrop-blur-sm shadow-xl flex items-center">
        <span className="text-xs font-medium uppercase tracking-wider text-blue-400 mr-2 whitespace-nowrap">
          {activeType === "game_start" && "Game Starting"}
          {activeType === "action" && "Time"}
          {activeType === "street_deal" && "Dealing"}
          {activeType === "new_hand" && "New Hand"}
          {activeType === "reconnect" && "Reconnecting"}
          {!activeType && "Time"}
        </span>
        <span className="font-mono font-bold text-lg">{timeLeft.toString().padStart(2, "0")}</span>
      </div>
    );
  }

  if (displayTimer !== null) {
    return (
      <div className="absolute top-[-60px] left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white px-4 py-1 rounded-full border border-white/10 backdrop-blur-sm shadow-xl flex items-center">
        <span className="text-xs font-medium uppercase tracking-wider text-blue-400 mr-2 whitespace-nowrap">Time</span>
        <span className="font-mono font-bold text-lg">{displayTimer.toString().padStart(2, "0")}</span>
      </div>
    );
  }

  return null;
}
