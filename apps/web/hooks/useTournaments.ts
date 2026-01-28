import { useEffect, useMemo, useState } from "react";

export type TournamentType = "stt" | "mtt";
export type TournamentStartMode = "full" | "scheduled";
export type TournamentStatus = "registering" | "scheduled" | "running" | "finished" | "cancelled";

export type Tournament = {
  id: string;
  name: string;
  type: TournamentType;
  startMode: TournamentStartMode;
  startAt?: string;
  buyIn: { currency: "chips" | "tickets"; amount: number };
  lateRegMinutes?: number;
  maxPlayers: number;
  registeredCount: number;
  entrants?: number;
  startingStack: number;
  status: TournamentStatus;
  tables?: string[];
  currentLevel?: number;
  lateRegEndAt?: string;
  payouts?: Array<{ playerId: string; amount: number; currency: "chips" | "tickets"; position: number }>;
  tableConfigId?: string;
  description?: string;
};

function deriveApiBase(): string {
  const env = process.env.NEXT_PUBLIC_WS_URL?.split(",")?.[0]?.trim();
  if (env) {
    try {
      const url = new URL(env);
      url.protocol = url.protocol.startsWith("wss") ? "https:" : "http:";
      return url.origin;
    } catch {
      // ignore parse error, fall through to localhost
    }
  }
  return "http://localhost:8099";
}

const FALLBACK_TOURNAMENTS: Tournament[] = [
  {
    id: "mtt-headsup-20",
    name: "Evening Heads-Up MTT",
    type: "mtt",
    startMode: "scheduled",
    startAt: "2099-01-01T19:00:00Z",
    buyIn: { currency: "chips", amount: 2000 },
    lateRegMinutes: 60,
    maxPlayers: 64,
    registeredCount: 0,
    startingStack: 10000,
    status: "scheduled",
  },
  {
    id: "mtt-fullring-21",
    name: "Evening Full Ring MTT",
    type: "mtt",
    startMode: "scheduled",
    startAt: "2099-01-01T21:00:00Z",
    buyIn: { currency: "chips", amount: 5000 },
    lateRegMinutes: 120,
    maxPlayers: 540,
    registeredCount: 0,
    startingStack: 15000,
    status: "scheduled",
  },
  {
    id: "stt-9max",
    name: "Sit & Go (9-max)",
    type: "stt",
    startMode: "full",
    buyIn: { currency: "chips", amount: 100 },
    maxPlayers: 9,
    registeredCount: 0,
    startingStack: 5000,
    status: "registering",
  },
  {
    id: "stt-6max",
    name: "Sit & Go (6-max)",
    type: "stt",
    startMode: "full",
    buyIn: { currency: "chips", amount: 100 },
    maxPlayers: 6,
    registeredCount: 0,
    startingStack: 5000,
    status: "registering",
  },
];

export function useTournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fetchTournaments = async () => {
      setLoading(true);
      setError(null);
      try {
        const base = deriveApiBase();
        const res = await fetch(`${base}/api/tournaments`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        const list: Tournament[] = Array.isArray(json.tournaments)
          ? json.tournaments
          : [];
        setTournaments(list.length > 0 ? list : FALLBACK_TOURNAMENTS);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
          setTournaments(FALLBACK_TOURNAMENTS);
          return;
        }
        console.error("Failed to load tournaments", err);
        setError(err instanceof Error ? err.message : "Failed to load tournaments");
        setTournaments(FALLBACK_TOURNAMENTS);
      } finally {
        setLoading(false);
      }
    };
    fetchTournaments();
    return () => controller.abort();
  }, []);

  const grouped = useMemo(() => {
    const mtt = tournaments.filter((t) => t.type === "mtt");
    const stt = tournaments.filter((t) => t.type === "stt");
    return { mtt, stt };
  }, [tournaments]);

  return { tournaments, setTournaments, ...grouped, loading, error };
}
