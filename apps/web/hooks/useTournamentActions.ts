import { useCallback, useEffect, useState } from "react";
import { useGameStore } from "./useGameStore";
import { getLocalIdentity, resolveEffectiveId } from "~~/utils/identity";
import { resolveWebSocketUrl } from "~~/utils/ws-url";
import { getAuthToken } from "~~/utils/auth";
import { useWallet } from "~~/components/providers/WalletProvider";

export function useTournamentActions() {
  const socket = useGameStore((s) => s.socket);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    { id: string; type: "register" | "unregister"; onSuccess?: () => void; onError?: (message?: string) => void } | null
  >(null);
  const [startLoadingId, setStartLoadingId] = useState<string | null>(null);
  const [pendingStart, setPendingStart] = useState<
    { id: string; onSuccess?: () => void; onError?: (message?: string) => void } | null
  >(null);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());
  const { isAuthenticated } = useWallet();

  const markRegistered = useCallback((tournamentId: string) => {
    setRegisteredIds((prev) => {
      const next = new Set(prev);
      next.add(tournamentId);
      return next;
    });
  }, []);

  const markUnregistered = useCallback((tournamentId: string) => {
    setRegisteredIds((prev) => {
      const next = new Set(prev);
      next.delete(tournamentId);
      return next;
    });
  }, []);

  type ActionCallbacks = { onSuccess?: () => void; onError?: (message?: string) => void };

  const register = useCallback(
    (tournamentId: string, callbacks?: ActionCallbacks): boolean => {
      if (!socket) return false;
      setLoadingId(tournamentId);
      setPendingAction({ id: tournamentId, type: "register", ...callbacks });
      try {
        socket.send(JSON.stringify({ type: "REGISTER_TOURNAMENT", tournamentId }));
        return true;
      } catch (err) {
        console.error("Failed to register tournament", err);
        setLoadingId(null);
        setPendingAction(null);
        callbacks?.onError?.();
        return false;
      }
    },
    [socket],
  );

  const unregister = useCallback(
    (tournamentId: string, callbacks?: ActionCallbacks): boolean => {
      if (!socket) return false;
      setLoadingId(tournamentId);
      setPendingAction({ id: tournamentId, type: "unregister", ...callbacks });
      try {
        socket.send(JSON.stringify({ type: "UNREGISTER_TOURNAMENT", tournamentId }));
        return true;
      } catch (err) {
        console.error("Failed to unregister tournament", err);
        setLoadingId(null);
        setPendingAction(null);
        callbacks?.onError?.();
        return false;
      }
    },
    [socket],
  );

  const startSitAndGoWithBots = useCallback(
    (tournamentId: string, callbacks?: ActionCallbacks): boolean => {
      if (!socket) return false;
      setStartLoadingId(tournamentId);
      setPendingStart({ id: tournamentId, ...callbacks });
      try {
        socket.send(JSON.stringify({ type: "START_SNG_WITH_BOTS", tournamentId }));
        return true;
      } catch (err) {
        console.error("Failed to start SNG with bots", err);
        setStartLoadingId(null);
        setPendingStart(null);
        callbacks?.onError?.();
        return false;
      }
    },
    [socket],
  );

  useEffect(() => {
    if (!socket) return;
    const handler = (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data);
        if (!data?.type) return;
        if (pendingAction && data.type === "TOURNAMENT_UPDATED" && data.tournament?.id === pendingAction.id) {
          if (pendingAction.type === "register") markRegistered(pendingAction.id);
          else markUnregistered(pendingAction.id);
          pendingAction.onSuccess?.();
          setLoadingId(null);
          setPendingAction(null);
        }
        if (
          pendingAction &&
          data.type === "ERROR" &&
          (data.code === "REGISTER_FAILED" ||
            data.code === "UNREGISTER_FAILED" ||
            data.code === "BUY_IN_FAILED")
        ) {
          pendingAction.onError?.(data.msg);
          setLoadingId(null);
          setPendingAction(null);
        }
        if (pendingStart && data.type === "TOURNAMENT_UPDATED" && data.tournament?.id === pendingStart.id) {
          pendingStart.onSuccess?.();
          setStartLoadingId(null);
          setPendingStart(null);
        }
        if (pendingStart && data.type === "ERROR" && data.code === "START_FAILED") {
          pendingStart.onError?.(data.msg);
          setStartLoadingId(null);
          setPendingStart(null);
        }
      } catch {
        // ignore parse errors
      }
    };
    socket.addEventListener("message", handler);
    return () => socket.removeEventListener("message", handler);
  }, [socket, pendingAction, markRegistered, markUnregistered, pendingStart]);

  const localIdentity = getLocalIdentity();
  const effectiveId = resolveEffectiveId(
    localIdentity.walletAddress,
    localIdentity.sessionId,
  );

  useEffect(() => {
    if (!effectiveId || !isAuthenticated) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const wsUrl = resolveWebSocketUrl();
        if (!wsUrl) return;
        const ws = new URL(wsUrl);
        const apiBase = `${ws.protocol === "wss:" ? "https:" : "http:"}//${ws.host}`;
        const res = await fetch(`${apiBase}/api/user/registrations?wallet=${effectiveId}`, {
          signal: controller.signal,
          headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : undefined,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data?.registrations)) return;
        const ids = data.registrations.map((r: { tournamentId: string }) => r.tournamentId);
        setRegisteredIds(new Set(ids));
      } catch {
        // ignore
      }
    };
    load();
    return () => controller.abort();
  }, [effectiveId, isAuthenticated]);

  useEffect(() => {
    if (!socket) {
      setLoadingId(null);
      setPendingAction(null);
      setStartLoadingId(null);
      setPendingStart(null);
    }
  }, [socket]);

  return {
    register,
    unregister,
    startSitAndGoWithBots,
    loadingId,
    startLoadingId,
    registeredIds,
    effectiveId,
  };
}
