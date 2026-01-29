"use client";

import { useMemo, useState } from "react";
import { Tournament } from "~~/hooks/useTournaments";
import { useTournamentActions } from "~~/hooks/useTournamentActions";
import { useBalances } from "~~/hooks/useBalances";

type SortKey = "start" | "name" | "buyIn" | "players" | "prize" | "level";

type Props = {
  tournaments: Tournament[];
  title?: string;
  showStartColumn?: boolean;
};

const headerBase = "px-2 py-2 text-left text-[11px] uppercase tracking-wide cursor-pointer select-none";
const cellBase = "px-2 py-2 text-sm whitespace-nowrap";

function formatStart(t: Tournament): string {
  if (t.startMode === "full") return "When full";
  if (t.startAt) {
    const date = new Date(t.startAt);
    if (!Number.isNaN(date.valueOf())) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  }
  if (typeof t.lateRegMinutes === "number") {
    const mins = t.lateRegMinutes;
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    return `Late Reg ${parts.join(" ")}`;
  }
  return "TBD";
}

function estimatePrizePool(t: Tournament): number {
  return (t.buyIn?.amount || 0) * (t.maxPlayers || 0);
}

function formatLevel(t: Tournament): string {
  if (t.currentLevel) return `L${t.currentLevel}`;
  return "—";
}

function formatLateReg(t: Tournament): string {
  if (t.lateRegEndAt) {
    const end = new Date(t.lateRegEndAt);
    if (!Number.isNaN(end.valueOf())) {
      return `Late reg until ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
  }
  if (typeof t.lateRegMinutes === "number") {
    return `Late reg ${t.lateRegMinutes}m`;
  }
  return "";
}

function formatPayouts(t: Tournament): string {
  if (!t.payouts || t.payouts.length === 0) return "";
  return t.payouts
    .slice(0, 3)
    .map((p) => `#${p.position}: ${p.amount} ${p.currency === "tickets" ? "tickets" : "chips"}`)
    .join(" · ");
}

export function TournamentTable({ tournaments, title, showStartColumn = true }: Props) {
  const { register, unregister, startSitAndGoWithBots, loadingId, startLoadingId, registeredIds } = useTournamentActions();
  const { balances, hydrated, canAfford, refreshBalances } = useBalances();
  const [selected, setSelected] = useState<Tournament | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "start",
    dir: "asc",
  });

  const sorted = useMemo(() => {
    const items = [...tournaments];
    const { key, dir } = sort;
    items.sort((a, b) => {
      const factor = dir === "asc" ? 1 : -1;
      if (key === "start") {
        return factor * formatStart(a).localeCompare(formatStart(b));
      }
      if (key === "name") {
        return factor * a.name.localeCompare(b.name);
      }
      if (key === "buyIn") {
        return factor * ((a.buyIn?.amount ?? 0) - (b.buyIn?.amount ?? 0));
      }
      if (key === "players") {
        return factor * (a.registeredCount - b.registeredCount || a.maxPlayers - b.maxPlayers);
      }
      if (key === "prize") {
        return factor * (estimatePrizePool(a) - estimatePrizePool(b));
      }
      if (key === "level") {
        return factor * ((a.currentLevel ?? 0) - (b.currentLevel ?? 0));
      }
      return 0;
    });
    return items;
  }, [tournaments, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  };

  const openModal = (t: Tournament) => {
    setSelected(t);
    setError(null);
    setModalOpen(true);
  };

  const confirmJoin = () => {
    if (!selected) return;
    const affordable = canAfford(selected.buyIn);
    if (!affordable) {
      setError("Not enough balance for the buy-in.");
      return;
    }
    const sent = register(selected.id, {
      onSuccess: () => refreshBalances(),
      onError: () => setError("Unable to register right now. Please check your connection."),
    });
    if (!sent) return;
    setModalOpen(false);
  };

  const handleCancel = (tournament: Tournament) => {
    if (!registeredIds.has(tournament.id)) return;
    const sent = unregister(tournament.id, {
      onSuccess: () => refreshBalances(),
    });
    if (!sent) return;
  };

  const handleStartWithBots = (tournament: Tournament) => {
    if (tournament.type !== "stt") return;
    if (tournament.registeredCount === 0) return;
    startSitAndGoWithBots(tournament.id);
  };

  return (
    <div className="w-full">
      {title ? <h2 className="text-2xl mb-3">{title}</h2> : null}
      <div className="overflow-auto">
        <table className="min-w-full">
          <thead className="text-white/60 uppercase text-[11px] tracking-[0.14em]">
            <tr>
              <th className={headerBase} onClick={() => toggleSort("start")}>Table</th>
              <th className={headerBase} onClick={() => toggleSort("name")}>Game</th>
              <th className={headerBase} onClick={() => toggleSort("players")}>Players</th>
              <th className={headerBase} onClick={() => toggleSort("buyIn")}>Buy-in</th>
              <th className={headerBase} onClick={() => toggleSort("level")}>Level</th>
              <th className={headerBase} onClick={() => toggleSort("prize")}>Prize</th>
              <th className={headerBase}>Payouts</th>
              <th className={headerBase}>Status</th>
              {showStartColumn ? <th className={headerBase}>Start</th> : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id} className="border-b border-white/10">
                <td className={cellBase}>{t.name}</td>
                <td className={cellBase}>{t.type?.toUpperCase() ?? "MTT"}</td>
                <td className={cellBase}>
                  {t.registeredCount}/{t.maxPlayers}
                </td>
                <td className={cellBase}>
                  {t.buyIn?.currency === "tickets" ? `${t.buyIn.amount} ticket` : `${t.buyIn?.amount ?? 0} chips`}
                </td>
                <td className={cellBase}>
                  <div className="flex flex-col leading-tight">
                    <span>{formatLevel(t)}</span>
                    <span className="text-[11px] text-white/60">{formatLateReg(t)}</span>
                  </div>
                </td>
                <td className={cellBase}>{estimatePrizePool(t).toLocaleString()}</td>
                <td className={cellBase}>
                  {formatPayouts(t) ? (
                    <span className="text-xs text-white/80">{formatPayouts(t)}</span>
                  ) : (
                    <span className="text-xs text-white/50">—</span>
                  )}
                </td>
                <td className={cellBase}>
                  {(() => {
                    const isRegistered = registeredIds.has(t.id);
                    const isLoading = loadingId === t.id;
                    if (t.status === "running") {
                      return <span className="text-xs text-white/70">Started</span>;
                    }
                    const label = isLoading
                      ? isRegistered
                        ? "Cancelling…"
                        : "Joining…"
                      : isRegistered
                        ? "Cancel"
                        : "Join";
                    return (
                      <button
                        onClick={() => (isRegistered ? handleCancel(t) : openModal(t))}
                        disabled={isLoading}
                        className="tbtn text-xs font-semibold"
                        aria-disabled={isLoading}
                      >
                        {label}
                      </button>
                    );
                  })()}
                </td>
                {showStartColumn ? (
                  <td className={cellBase}>
                    {t.type === "stt" ? (
                      <button
                        onClick={() => handleStartWithBots(t)}
                        className="tbtn text-xs font-semibold"
                      >
                        {startLoadingId === t.id ? "Starting…" : "Start w/ bots"}
                      </button>
                    ) : (
                      <span className="text-xs text-white/50">—</span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td className="px-2 py-3 text-sm text-white/60" colSpan={showStartColumn ? 9 : 8}>
                  No tournaments available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {modalOpen && selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black px-4">
          <div className="w-full max-w-md space-y-3 rounded-lg bg-black p-5 border border-white/10 shadow-xl">
            <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">
              Confirm Buy-in
            </div>
            <div className="rule" aria-hidden="true" />
            <p className="text-sm text-white/80">
              Join <span className="text-white">{selected.name}</span> with buy-in{" "}
              {selected.buyIn.currency === "tickets"
                ? `${selected.buyIn.amount} ticket(s)`
                : `${selected.buyIn.amount} chips`}
              .
            </p>
            <div className="text-xs text-white/70 space-y-1">
              <div>
                Balance: {hydrated ? balances.coins : "—"} chips | Tickets: X:{hydrated ? balances.tickets.ticket_x : "—"} Y:{hydrated ? balances.tickets.ticket_y : "—"} Z:{hydrated ? balances.tickets.ticket_z : "—"}
              </div>
              {selected.lateRegEndAt ? (
                <div>
                  Late reg until: {new Date(selected.lateRegEndAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              ) : null}
            </div>
            {error ? <div className="text-xs text-red-400">{error}</div> : null}
            <div className="flex justify-end gap-4 text-xs">
              <button className="tbtn" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="tbtn" onClick={confirmJoin}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
