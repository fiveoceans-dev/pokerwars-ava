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

const FALLBACK_TOURNAMENTS: Tournament[] = [];

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
        setTournaments(list);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
          setTournaments([]);
          return;
        }
        console.error("Failed to load tournaments", err);
        setError(err instanceof Error ? err.message : "Failed to load tournaments");
        setTournaments([]);
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
