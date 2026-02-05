/**
 * Minimal footer pinned at the bottom by layout flex.
 * - Centered text, inherits body font and size
 * - Subtle top border to keep the footer visually light
 */
import { ConnectionStatus } from "./ConnectionStatus";

export const Footer = () => {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "PokerWars";
  return (
    <footer className="shrink-0 w-full border-t border-white/10 h-[15px] flex items-center">
      <div className="content-wrap flex items-center justify-between text-[10px] text-white/60 leading-none">
        <span>{appName}</span>
        <div className="flex items-center gap-3 h-full">
          <ConnectionStatus />
        </div>
      </div>
    </footer>
  );
};
