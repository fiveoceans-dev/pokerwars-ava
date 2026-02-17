"use client";

import { useRef } from "react";
import { TournamentTable } from "~~/components/TournamentTable";
import { useTournaments } from "~~/hooks/useTournaments";
import { useTournamentStream } from "~~/hooks/useTournamentStream";
import { useGameStore } from "~~/hooks/useGameStore";

export default function MttPage() {
  const { mtt, loading, setTournaments } = useTournaments();
  const currentWalletId = useGameStore((s) => s.currentWalletId);
  const openedTables = useRef<Set<string>>(new Set());

  useTournamentStream((evt) => {
    if (evt.type === "TOURNAMENT_UPDATED" && evt.tournament) {
      setTournaments((prev) => {
        const status = (evt.tournament.status || "").toLowerCase();
        const isClosed = status === "finished" || status === "cancelled" || status === "template";
        const existing = prev.filter((t) => t.id !== evt.tournament.id);
        if (isClosed) return existing;
        return [...existing, evt.tournament];
      });
    }
    if (evt.type === "TOURNAMENT_PAYOUTS") {
      setTournaments((prev) =>
        prev.filter((t) => t.id !== evt.tournamentId)
      );
    }
    if (evt.type === "TOURNAMENT_SEAT") {
      setTournaments((prev) =>
        prev.map((t) => {
          if (t.id !== evt.tournamentId) return t;
          const tables = new Set(t.tables || []);
          tables.add(evt.tableId);
          return {
            ...t,
            tables: Array.from(tables),
          };
        }),
      );
    }

    if (evt.type === "TOURNAMENT_SEAT") {
      const myId = currentWalletId?.toLowerCase();
      const sessionId = typeof window !== "undefined" ? localStorage.getItem("sessionId")?.toLowerCase() : undefined;
      const pid = evt.playerId?.toLowerCase();
      if (pid && (pid === myId || (!myId && pid === sessionId))) {
          if (!openedTables.current.has(evt.tableId)) {
            openedTables.current.add(evt.tableId);
            window.open(`/${evt.tableId}`, "_blank");
          }
      }
    }
  });

  return (
    <main className="min-h-screen pb-16 pt-10">
      <div className="content-wrap space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl md:text-3xl">MTT</h1>
          <span className="text-[11px] uppercase tracking-[0.4em] text-white/50">
            Multi-table
          </span>
        </div>
        {loading ? (
          <p className="text-sm text-white/60">Loading tournaments…</p>
        ) : (
          <TournamentTable tournaments={mtt} showStartColumn={false} showPayouts={false} />
        )}
      </div>
    </main>
  );
}
