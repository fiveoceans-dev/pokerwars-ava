/**
 * Minimal footer pinned at the bottom by layout flex.
 * - Centered text, inherits body font and size
 * - Subtle top border to keep the footer visually light
 */
import { ConnectionStatus } from "./ConnectionStatus";

export const Footer = () => {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "PokerWars";
  return (
    <footer className="shrink-0 w-full border-t border-white/10 py-3">
      <div className="content-wrap flex items-center justify-between text-xs text-white/60">
        <span>{appName}</span>
        <div className="flex items-center gap-3">
          <ConnectionStatus />
        </div>
      </div>
    </footer>
  );
};
