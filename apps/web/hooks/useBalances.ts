import { useEffect, useState, useCallback, useMemo } from "react";
import { resolveWebSocketUrl } from "~~/utils/ws-url";
import { useWallet } from "~~/components/providers/WalletProvider";
import { clearAuthToken, getAuthToken } from "~~/utils/auth";

type TicketBalances = {
  ticket_x: number;
  ticket_y: number;
  ticket_z: number;
};

export type Balances = {
  coins: number;
  tickets: TicketBalances;
};

const DEFAULT_BALANCES: Balances = {
  coins: 0,
  tickets: { ticket_x: 0, ticket_y: 0, ticket_z: 0 },
};
const FREE_CLAIM_AMOUNT = 1_000;
const FREE_CLAIM_COOLDOWN_MS = 10 * 60 * 60 * 1000;

function resolveApiBase(): string | null {
  try {
    const ws = resolveWebSocketUrl();
    const url = new URL(ws);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    return url.origin;
  } catch {
    return null;
  }
}

export function useBalances() {
  const { address, isAuthenticated } = useWallet();
  const [balances, setBalances] = useState<Balances>({
    coins: 0,
    tickets: { ticket_x: 0, ticket_y: 0, ticket_z: 0 },
  });
  const [hydrated, setHydrated] = useState(false);
  const [lastClaimAt, setLastClaimAt] = useState<number | null>(null);
  const apiBase = useMemo(() => resolveApiBase(), []);
  const fallbackWallet =
    typeof window !== "undefined" ? window.localStorage.getItem("walletAddress") : null;
  const walletForBalance = (address || fallbackWallet || "").toLowerCase() || null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!walletForBalance || !apiBase) {
        setHydrated(true);
        return;
      }
      try {
        const token = getAuthToken();
        const res = await fetch(`${apiBase}/api/user/balance?wallet=${walletForBalance}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.status === 401) {
          clearAuthToken();
          setHydrated(true);
          return;
        }
        const data = await res.json();
        if (!cancelled && data?.balance) {
          setBalances({
            coins: data.balance.coins ?? 0,
            tickets: {
              ticket_x: data.balance.ticket_x ?? 0,
              ticket_y: data.balance.ticket_y ?? 0,
              ticket_z: data.balance.ticket_z ?? 0,
            },
          });
        }
      } catch {
        if (!cancelled) setBalances(DEFAULT_BALANCES);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [apiBase, walletForBalance]);

  const canAfford = useCallback(
    (buyIn: { currency: "chips" | "tickets"; amount: number }) => {
      if (buyIn.currency === "chips") {
        return balances.coins >= buyIn.amount;
      }
      // Tickets: use ticket_x by default
      return balances.tickets.ticket_x >= buyIn.amount;
    },
    [balances],
  );

  const spend = useCallback(
    (buyIn: { currency: "chips" | "tickets"; amount: number }) => {
      setBalances((prev) => {
        if (buyIn.currency === "chips") {
          return { ...prev, coins: Math.max(0, prev.coins - buyIn.amount) };
        }
        return {
          ...prev,
          tickets: {
            ...prev.tickets,
            ticket_x: Math.max(0, prev.tickets.ticket_x - buyIn.amount),
          },
        };
      });
    },
    [],
  );

  const refund = useCallback(
    (buyIn: { currency: "chips" | "tickets"; amount: number }) => {
      setBalances((prev) => {
        if (buyIn.currency === "chips") {
          return { ...prev, coins: prev.coins + buyIn.amount };
        }
        return {
          ...prev,
          tickets: {
            ...prev.tickets,
            ticket_x: prev.tickets.ticket_x + buyIn.amount,
          },
        };
      });
    },
    [],
  );

  const refreshBalances = useCallback(async () => {
    if (!walletForBalance || !apiBase) return;
    const token = getAuthToken();
    const res = await fetch(`${apiBase}/api/user/balance?wallet=${walletForBalance}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.status === 401) {
      clearAuthToken();
      return;
    }
    const data = await res.json();
    if (data?.balance) {
      setBalances({
        coins: data.balance.coins ?? 0,
        tickets: {
          ticket_x: data.balance.ticket_x ?? 0,
          ticket_y: data.balance.ticket_y ?? 0,
          ticket_z: data.balance.ticket_z ?? 0,
        },
      });
    }
  }, [apiBase, walletForBalance]);

  const claimFreeCoins = useCallback(async () => {
    if (!address || !apiBase) return { ok: false, nextAvailableInMs: 0 };
    const token = getAuthToken();
    const res = await fetch(`${apiBase}/api/user/claim?wallet=${address}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.status === 401) {
      clearAuthToken();
    }
    const data = await res.json();
    if (!res.ok) {
      if (typeof data?.nextAvailableInMs === "number") {
        const now = Date.now();
        setLastClaimAt(now - (FREE_CLAIM_COOLDOWN_MS - data.nextAvailableInMs));
      }
      return { ok: false, nextAvailableInMs: data?.nextAvailableInMs ?? 0 };
    }
    if (data?.balance) {
      setBalances({
        coins: data.balance.coins ?? 0,
        tickets: {
          ticket_x: data.balance.ticket_x ?? 0,
          ticket_y: data.balance.ticket_y ?? 0,
          ticket_z: data.balance.ticket_z ?? 0,
        },
      });
    }
    setLastClaimAt(Date.now());
    return { ok: true, nextAvailableInMs: data?.nextAvailableInMs ?? 0 };
  }, [address, apiBase]);

  const convert = useCallback(
    async (direction: "coinsToTickets" | "ticketsToCoins", tier: "ticket_x" | "ticket_y" | "ticket_z", amount: number) => {
      if (!address || !apiBase) return { ok: false };
      const token = getAuthToken();
      const res = await fetch(`${apiBase}/api/user/convert?wallet=${address}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ direction, tier, amount }),
      });
      if (res.status === 401) {
        clearAuthToken();
      }
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data?.error };
      if (data?.balance) {
        setBalances({
          coins: data.balance.coins ?? 0,
          tickets: {
            ticket_x: data.balance.ticket_x ?? 0,
            ticket_y: data.balance.ticket_y ?? 0,
            ticket_z: data.balance.ticket_z ?? 0,
          },
        });
      }
      return { ok: true };
    },
    [address, apiBase],
  );

  return {
    balances,
    hydrated,
    canAfford,
    spend,
    refund,
    claimFreeCoins,
    lastClaimAt,
    refreshBalances,
    convert,
    freeClaimAmount: FREE_CLAIM_AMOUNT,
    freeClaimCooldownMs: FREE_CLAIM_COOLDOWN_MS,
    walletForBalance,
  };
}
