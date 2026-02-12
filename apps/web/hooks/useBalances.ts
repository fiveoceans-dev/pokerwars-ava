import { useEffect, useState, useCallback, useMemo } from "react";
import { resolveWebSocketUrl } from "~~/utils/ws-url";
import { useWallet } from "~~/components/providers/WalletProvider";
import { clearAuthToken, getAuthToken } from "~~/utils/auth";
import { getLocalIdentity, resolveEffectiveId } from "~~/utils/identity";
import { useGameStore } from "./useGameStore";

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
const FREE_CLAIM_AMOUNT = 3_000;
const FREE_CLAIM_COOLDOWN_MS = 5 * 60 * 60 * 1000;

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
  const { address, isAuthenticated, ensureAuth } = useWallet();
  const { balances: storeBalances, setBalances: setStoreBalances } = useGameStore();
  const [balances, setBalances] = useState<Balances>(storeBalances);
  const [hydrated, setHydrated] = useState(false);
  const [lastClaimAt, setLastClaimAt] = useState<number | null>(null);
  const apiBase = useMemo(() => resolveApiBase(), []);
  const localIdentity = getLocalIdentity();
  const walletForBalance =
    resolveEffectiveId(address, localIdentity.walletAddress) ||
    resolveEffectiveId(null, localIdentity.sessionId) ||
    null;

  // Sync local state when store balances change (e.g. via WebSocket)
  useEffect(() => {
    setBalances(storeBalances);
  }, [storeBalances]);

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
          // In production, this typically means the user hasn't signed in yet.
          // Attempt an auth handshake once (will prompt a signature) and retry.
          if (address) {
            const authed = await ensureAuth().catch(() => false);
            if (authed) {
              const retryToken = getAuthToken();
              const retryRes = await fetch(`${apiBase}/api/user/balance?wallet=${walletForBalance}`, {
                headers: retryToken ? { Authorization: `Bearer ${retryToken}` } : undefined,
              });
              if (retryRes.ok) {
                const retryData = await retryRes.json();
                if (!cancelled && retryData?.balance) {
                  const next = {
                    coins: retryData.balance.coins ?? 0,
                    tickets: {
                      ticket_x: retryData.balance.ticket_x ?? 0,
                      ticket_y: retryData.balance.ticket_y ?? 0,
                      ticket_z: retryData.balance.ticket_z ?? 0,
                    },
                  };
                  setBalances(next);
                  setStoreBalances(next);
                }
              }
            }
          }
          setHydrated(true);
          return;
        }
        const data = await res.json();
        if (!cancelled && data?.balance) {
          const next = {
            coins: data.balance.coins ?? 0,
            tickets: {
              ticket_x: data.balance.ticket_x ?? 0,
              ticket_y: data.balance.ticket_y ?? 0,
              ticket_z: data.balance.ticket_z ?? 0,
            },
          };
          setBalances(next);
          setStoreBalances(next);
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
        let next;
        if (buyIn.currency === "chips") {
          next = { ...prev, coins: Math.max(0, prev.coins - buyIn.amount) };
        } else {
          next = {
            ...prev,
            tickets: {
              ...prev.tickets,
              ticket_x: Math.max(0, prev.tickets.ticket_x - buyIn.amount),
            },
          };
        }
        setStoreBalances(next);
        return next;
      });
    },
    [setStoreBalances],
  );

  const refund = useCallback(
    (buyIn: { currency: "chips" | "tickets"; amount: number }) => {
      setBalances((prev) => {
        let next;
        if (buyIn.currency === "chips") {
          next = { ...prev, coins: prev.coins + buyIn.amount };
        } else {
          next = {
            ...prev,
            tickets: {
              ...prev.tickets,
              ticket_x: prev.tickets.ticket_x + buyIn.amount,
            },
          };
        }
        setStoreBalances(next);
        return next;
      });
    },
    [setStoreBalances],
  );

  const refreshBalances = useCallback(async (): Promise<Balances | null> => {
    if (!walletForBalance || !apiBase) return null;
    const token = getAuthToken();
    const res = await fetch(`${apiBase}/api/user/balance?wallet=${walletForBalance}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.status === 401) {
      clearAuthToken();
      return null;
    }
    const data = await res.json();
    if (data?.balance) {
      const next = {
        coins: data.balance.coins ?? 0,
        tickets: {
          ticket_x: data.balance.ticket_x ?? 0,
          ticket_y: data.balance.ticket_y ?? 0,
          ticket_z: data.balance.ticket_z ?? 0,
        },
      };
      setBalances(next);
      setStoreBalances(next);
      return next;
    }
    return null;
  }, [apiBase, walletForBalance, setStoreBalances]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshBalances();
  }, [isAuthenticated, refreshBalances]);

  useEffect(() => {
    if (!walletForBalance || !apiBase) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await refreshBalances();
    };
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [apiBase, refreshBalances, walletForBalance]);

  const claimFreeCoins = useCallback(async (): Promise<{ ok: boolean; nextAvailableInMs?: number; error?: string }> => {
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
      return { ok: false, nextAvailableInMs: data?.nextAvailableInMs ?? 0, error: data?.error };
    }
    if (data?.balance) {
      const next = {
        coins: data.balance.coins ?? 0,
        tickets: {
          ticket_x: data.balance.ticket_x ?? 0,
          ticket_y: data.balance.ticket_y ?? 0,
          ticket_z: data.balance.ticket_z ?? 0,
        },
      };
      setBalances(next);
      setStoreBalances(next);
    }
    setLastClaimAt(Date.now());
    return { ok: true, nextAvailableInMs: 0 };
  }, [address, apiBase, setStoreBalances]);

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
        const next = {
          coins: data.balance.coins ?? 0,
          tickets: {
            ticket_x: data.balance.ticket_x ?? 0,
            ticket_y: data.balance.ticket_y ?? 0,
            ticket_z: data.balance.ticket_z ?? 0,
          },
        };
        setBalances(next);
        setStoreBalances(next);
      }
      return { ok: true };
    },
    [address, apiBase, setStoreBalances],
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
