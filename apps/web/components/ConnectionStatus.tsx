"use client";
import { useGameStore } from "../hooks/useGameStore";

export function ConnectionStatus() {
  const { connectionState, connectionError } = useGameStore();

  const statusText =
    connectionState === "connected"
      ? "Status: Online"
      : connectionState === "connecting"
        ? "Status: Connecting"
        : connectionState === "reconnecting"
          ? "Status: Reconnecting"
          : `Status: Offline${connectionError ? ` (${connectionError})` : ""}`;

  const statusColor =
    connectionState === "connected"
      ? "bg-[var(--ok)]"
      : connectionState === "connecting" || connectionState === "reconnecting"
        ? "bg-[var(--accent)]"
        : "bg-[var(--danger)]";

  return (
    <span
      className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-white/50"
      title={statusText}
      aria-label={statusText}
    >
      <span className={`inline-block w-3 h-2 ${statusColor}`} aria-hidden="true" />
      <span className="sr-only">{statusText}</span>
    </span>
  );
}
