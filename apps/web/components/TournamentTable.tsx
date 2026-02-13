"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Tournament } from "~~/hooks/useTournaments";
import { useTournamentActions } from "~~/hooks/useTournamentActions";
import { useBalances } from "~~/hooks/useBalances";
import { useWallet } from "~~/components/providers/WalletProvider";
import { useGameStore } from "~~/hooks/useGameStore";
import { formatNumber } from "~~/utils/format";
import { 
  Modal, 
  ModalLabel, 
  ModalRule, 
  ModalFooter, 
  ModalContent 
} from "~~/components/ui/Modal";

type SortKey = "start" | "name" | "buyIn" | "players" | "prize" | "level";

type Props = {
  tournaments: Tournament[];
  title?: string;
  showStartColumn?: boolean;
  showPayouts?: boolean;
  startColumnTitle?: string;
};

const headerBase = "px-2 py-2 text-left text-[11px] uppercase tracking-wide cursor-pointer select-none";
const cellBase = "px-2 py-2 text-sm whitespace-nowrap";

function formatStart(t: Tournament): string {
  if (t.startMode === "full") return "When full";
  if (t.startAt) {
    const date = new Date(t.startAt);
    if (!Number.isNaN(date.valueOf())) {
      const now = Date.now();
      const diffMs = date.getTime() - now;
      const hours = diffMs / (1000 * 60 * 60);

      // If less than 48 hours, show HH:mm
      if (hours < 48) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      }
      
      // If more than 28 hours (and logic above ensures > 48 if we reach here, 
      // but to strictly follow "more then 28 hours" format):
      const day = String(date.getDate()).padStart(2, '0');
      const month = date.toLocaleString('en-US', { month: 'short' });
      return `${day}-${month}`;
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

const LateRegCountdown = ({ endTime }: { endTime: string }) => {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const end = new Date(endTime).getTime();
    
    const update = () => {
      const now = Date.now();
      const diff = end - now;
      if (diff <= 0) {
        setTimeLeft("Closed");
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  return <span>Late Reg {timeLeft}</span>;
};

function formatLateReg(t: Tournament): React.ReactNode {
  if (t.status === "running" && t.lateRegEndAt) {
    return <LateRegCountdown endTime={t.lateRegEndAt} />;
  }
  if (typeof t.lateRegMinutes === "number" && t.lateRegMinutes > 0) {
    return <span>Late reg {t.lateRegMinutes}m</span>;
  }
  return null;
}

function formatPayouts(t: Tournament): string {
  if (!t.payouts || t.payouts.length === 0) return "";
  return t.payouts
    .slice(0, 3)
    .map((p) => `#${p.position}: ${p.amount} ${p.currency === "tickets" ? "tickets" : "chips"}`)
    .join(" · ");
}

function formatBuyIn(t: Tournament): string {
  if (!t.buyIn) return "—";
  if (t.buyIn.currency === "tickets") return `${t.buyIn.amount} ticket`;
  return `${formatNumber(t.buyIn.amount)} Coins`;
}

export function TournamentTable({
  tournaments,
  title,
  showStartColumn = true,
  showPayouts = true,
  startColumnTitle = "Start",
}: Props) {
  const router = useRouter();
  const { register, unregister, startSitAndGoWithBots, loadingId, startLoadingId, registeredIds } = useTournamentActions();
  const { balances, hydrated, refreshBalances } = useBalances();
  const { status, isAuthenticated, ensureAuth } = useWallet();
  const tableSeats = useGameStore(s => s.tableSeats);
  const [selected, setSelected] = useState<Tournament | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "start",
    dir: "asc",
  });

  const isLateRegOpen = (t: Tournament) => {
    if (t.status === "registering" || t.status === "scheduled") return true;
    if (t.status === "running") {
      if (!t.lateRegEndAt) return false;
      const end = new Date(t.lateRegEndAt).getTime();
      return Date.now() < end;
    }
    return false;
  };

  const sorted = useMemo(() => {
    const items = tournaments.filter((t) => t.status !== "finished");
    
    const { key, dir } = sort;
    const factor = dir === "asc" ? 1 : -1;

    const getRank = (t: Tournament) => {
      const isRegistered = registeredIds.has(t.id);
      if (isRegistered) return 0;
      if (t.status === "running") return 1;
      if (t.status === "scheduled" || t.status === "registering") return 2;
      return 3;
    };

    items.sort((a, b) => {
      const aReg = registeredIds.has(a.id);
      const bReg = registeredIds.has(b.id);

      // 1. Registered tournaments ALWAYS stay at the top
      if (aReg && !bReg) return -1;
      if (!aReg && bReg) return 1;

      // 2. If user explicitly sorted, use that as primary (within registered vs non-registered)
      // Note: We already handled 'Registered' above, so this applies to the rest.
      
      const compareBySortKey = () => {
        if (key === "start") {
          const aTime = a.startAt ? new Date(a.startAt).getTime() : (a.startMode === "full" ? 0 : Infinity);
          const bTime = b.startAt ? new Date(b.startAt).getTime() : (b.startMode === "full" ? 0 : Infinity);
          return factor * (aTime - bTime);
        }
        if (key === "name") return factor * a.name.localeCompare(b.name);
        if (key === "buyIn") return factor * ((a.buyIn?.amount ?? 0) - (b.buyIn?.amount ?? 0));
        if (key === "players") {
          const aPerc = a.registeredCount / (a.maxPlayers || 1);
          const bPerc = b.registeredCount / (b.maxPlayers || 1);
          return factor * (aPerc - bPerc);
        }
        if (key === "prize") return factor * (estimatePrizePool(a) - estimatePrizePool(b));
        if (key === "level") return factor * ((a.currentLevel ?? 0) - (b.currentLevel ?? 0));
        return 0;
      };

      const sortResult = compareBySortKey();
      if (sortResult !== 0) return sortResult;

      // 3. Default fallback: Rank (Running > Scheduled)
      const rankDiff = getRank(a) - getRank(b);
      if (rankDiff !== 0) return rankDiff;

      // 4. Secondary fallback: Fullness for SNG, Time for MTT
      if (a.type === "stt") {
        const aPerc = a.registeredCount / (a.maxPlayers || 1);
        const bPerc = b.registeredCount / (b.maxPlayers || 1);
        return bPerc - aPerc; // More full first
      } else {
        const aTime = a.startAt ? new Date(a.startAt).getTime() : Infinity;
        const bTime = b.startAt ? new Date(b.startAt).getTime() : Infinity;
        return aTime - bTime; // Closest start first
      }
    });
    return items;
  }, [tournaments, sort, registeredIds]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  };

  const isWalletConnected = status === "connected";

  const canAffordWith = (buyIn: { currency: "chips" | "tickets"; amount: number }, currentBalances: typeof balances) => {
    if (buyIn.currency === "chips") return currentBalances.coins >= buyIn.amount;
    return currentBalances.tickets.ticket_x >= buyIn.amount;
  };

  const openModal = (t: Tournament) => {
    if (!isWalletConnected) {
      window.dispatchEvent(new Event("open-wallet-connect"));
      return;
    }
    setSelected(t);
    setError(null);
    setModalOpen(true);
  };

  const confirmJoin = async () => {
    if (!selected) return;
    setError(null);
    if (!isWalletConnected) {
      window.dispatchEvent(new Event("open-wallet-connect"));
      setError("Connect wallet to join.");
      return;
    }
    if (!isAuthenticated) {
      const ok = await ensureAuth();
      if (!ok) {
        setError("Wallet not authenticated.");
        return;
      }
    }
    const latestBalances = (await refreshBalances()) ?? balances;
    const affordable = canAffordWith(selected.buyIn, latestBalances);
    if (!affordable) {
      setError("Not enough balance for the buy-in.");
      return;
    }
    const sent = register(selected.id, {
      onSuccess: () => refreshBalances(),
      onError: (message) => setError(message || "Unable to register right now. Please check your connection."),
    });
    if (!sent) return;
    setModalOpen(false);
  };

  const handleCancel = (tournament: Tournament) => {
    if (!registeredIds.has(tournament.id)) return;
    const sent = unregister(tournament.id, {
      onSuccess: () => refreshBalances(),
      onError: (message) => setError(message || "Unable to cancel right now. Please check your connection."),
    });
    if (!sent) return;
  };

  const handleStartWithBots = (tournament: Tournament) => {
    if (tournament.type !== "stt") return;
    if (tournament.registeredCount === 0) return;
    startSitAndGoWithBots(tournament.id);
  };

  const openTable = (t: Tournament) => {
    // Requirement: "open a table where users is sittted or a random table"
    // 1. Find if seated at any table of this tournament
    const seatedTableId = t.tables?.find(tid => tableSeats.has(tid));
    if (seatedTableId) {
      router.push(`/${seatedTableId}`);
      return;
    }
    
    // 2. Otherwise open a random (first) table if any exist
    if (t.tables && t.tables.length > 0) {
      router.push(`/${t.tables[0]}`);
      return;
    }
    
    // 3. Fallback to tournament lobby/waiting page
    router.push(`/${t.id}`);
  };

  const handleRowClick = (t: Tournament) => {
    const isRegistered = registeredIds.has(t.id);
    const hasStarted = t.status === "running";
    
    if (isRegistered || hasStarted) {
      openTable(t);
    } else if (t.status === "registering" || t.status === "scheduled") {
      openModal(t);
    }
  };

  return (
    <div className="w-full">
      {title ? <h2 className="text-2xl mb-3">{title}</h2> : null}
      <div className="overflow-auto">
        <table className="min-w-full">
          <thead className="text-white/60 uppercase text-[11px] tracking-[0.14em]">
            <tr>
              <th className={headerBase} onClick={() => toggleSort("start")}>Name</th>
              <th className={headerBase} onClick={() => toggleSort("name")}>Game</th>
              <th className={headerBase} onClick={() => toggleSort("players")}>Players</th>
              <th className={headerBase} onClick={() => toggleSort("buyIn")}>Buy-in</th>
              <th className={headerBase} onClick={() => toggleSort("level")}>Level</th>
              <th className={headerBase} onClick={() => toggleSort("prize")}>Prize</th>
              {showPayouts ? <th className={headerBase}>Payouts</th> : null}
              <th className={headerBase}>Register</th>
              {showStartColumn ? <th className={headerBase}>{startColumnTitle}</th> : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const isRegistered = registeredIds.has(t.id);
              const isActive = isRegistered || t.status === "running";
              const hasStarted = t.status === "running";
              const canJoin = !isRegistered && isLateRegOpen(t);
              
              return (
              <tr 
                key={t.id} 
                className={`border-b border-white/10 hover:bg-white/5 cursor-pointer transition-colors ${isRegistered ? "bg-white/5" : ""}`}
                onClick={() => handleRowClick(t)}
              >
                <td className={cellBase}>
                  <div className="flex items-center gap-2">
                    <span className={isActive ? "font-bold text-white" : ""}>{t.name}</span>
                    {isRegistered ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.7)]"
                        aria-label="active table"
                      />
                    ) : null}
                  </div>
                </td>
                <td className={cellBase}>No Limit Hold&apos;em</td>
                <td className={cellBase}>
                  {formatNumber(t.registeredCount)}/{formatNumber(t.maxPlayers)}
                </td>
                <td className={cellBase}>
                  {formatBuyIn(t)}
                </td>
                <td className={cellBase}>
                  <div className="flex flex-col leading-tight">
                    <span>{formatLevel(t)}</span>
                    <span className="text-[11px] text-white/60">{formatLateReg(t)}</span>
                  </div>
                </td>
                <td className={cellBase}>{formatNumber(estimatePrizePool(t))}</td>
                {showPayouts ? (
                  <td className={cellBase}>
                    {formatPayouts(t) ? (
                      <span className="text-xs text-white/80">{formatPayouts(t)}</span>
                    ) : (
                      <span className="text-xs text-white/50">—</span>
                    )}
                  </td>
                ) : null}
                <td className={cellBase} onClick={(e) => e.stopPropagation()}>
                  {isRegistered ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openTable(t)}
                        className="tbtn text-xs font-semibold bg-emerald-600 hover:bg-emerald-500"
                      >
                        Open
                      </button>
                      {!hasStarted && (
                        <button
                          onClick={() => handleCancel(t)}
                          className="tbtn text-xs font-semibold bg-red-600 hover:bg-red-500"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ) : canJoin ? (
                    <button
                      onClick={() => openModal(t)}
                      className="tbtn text-xs font-semibold"
                    >
                      Join
                    </button>
                  ) : null}
                </td>
                {showStartColumn ? (
                  <td className={cellBase} onClick={(e) => e.stopPropagation()}>
                    {t.type === "stt" && (t.status === "registering" || t.status === "scheduled") ? (
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
              );
            })}
            {sorted.length === 0 ? (
              <tr>
                <td
                  className="px-2 py-3 text-sm text-white/60"
                  colSpan={(() => {
                    let cols = showStartColumn ? 9 : 8;
                    if (!showPayouts) cols -= 1;
                    return cols;
                  })()}
                >
                  No tournaments available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal
        modalId="tournament-join-confirm"
        open={modalOpen && !!selected}
        onClose={() => setModalOpen(false)}
      >
        <ModalContent>
          <ModalLabel>Confirm Buy-in</ModalLabel>
          <ModalRule />
          <p className="text-sm text-white/80">
            Join <span className="text-white">{selected?.name}</span> with buy-in{" "}
            {selected?.buyIn.currency === "tickets"
              ? `${selected.buyIn.amount} ticket(s)`
              : `${formatNumber(selected?.buyIn.amount || 0)} Coins`}
            .
          </p>
          <div className="text-xs text-white/70 space-y-1">
            <div>
              Balance: {hydrated ? balances.coins : "—"} chips | Tickets: X:{hydrated ? balances.tickets.ticket_x : "—"} Y:{hydrated ? balances.tickets.ticket_y : "—"} Z:{hydrated ? balances.tickets.ticket_z : "—"}
            </div>
            {selected?.lateRegEndAt ? (
              <div>
                Late reg until: {new Date(selected.lateRegEndAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            ) : null}
          </div>
          {error ? <div className="text-xs text-red-400">{error}</div> : null}
          <ModalFooter>
            <button className="tbtn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="tbtn" onClick={confirmJoin}>
              Confirm
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
