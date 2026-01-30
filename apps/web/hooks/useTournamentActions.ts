import { useCallback, useEffect, useState } from "react";
import { useGameStore } from "./useGameStore";

export function useTournamentActions() {
  const socket = useGameStore((s) => s.socket);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    { id: string; type: "register" | "unregister"; onSuccess?: () => void; onError?: () => void } | null
  >(null);
  const [startLoadingId, setStartLoadingId] = useState<string | null>(null);
  const [pendingStart, setPendingStart] = useState<
    { id: string; onSuccess?: () => void; onError?: () => void } | null
  >(null);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = window.localStorage.getItem("pokerwars:registered-tournaments");
      if (!stored) return new Set();
      return new Set(JSON.parse(stored) as string[]);
    } catch {
      return new Set();
    }
  });

  const persistRegistered = useCallback((ids: Set<string>) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("pokerwars:registered-tournaments", JSON.stringify([...ids]));
  }, []);

  const markRegistered = useCallback(
    (tournamentId: string) => {
      setRegisteredIds((prev) => {
        const next = new Set(prev);
        next.add(tournamentId);
        persistRegistered(next);
        return next;
      });
    },
    [persistRegistered],
  );

  const markUnregistered = useCallback(
    (tournamentId: string) => {
      setRegisteredIds((prev) => {
        const next = new Set(prev);
        next.delete(tournamentId);
        persistRegistered(next);
        return next;
      });
    },
    [persistRegistered],
  );

  type ActionCallbacks = { onSuccess?: () => void; onError?: () => void };

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
          if (pendingAction.type === "register") {
            markRegistered(pendingAction.id);
          } else {
            markUnregistered(pendingAction.id);
          }
          pendingAction.onSuccess?.();
          setLoadingId(null);
          setPendingAction(null);
        }
        if (pendingAction && data.type === "ERROR" && (data.code === "REGISTER_FAILED" || data.code === "UNREGISTER_FAILED")) {
          pendingAction.onError?.();
          setLoadingId(null);
          setPendingAction(null);
        }
        if (pendingStart && data.type === "TOURNAMENT_UPDATED" && data.tournament?.id === pendingStart.id) {
          pendingStart.onSuccess?.();
          setStartLoadingId(null);
          setPendingStart(null);
        }
        if (pendingStart && data.type === "ERROR" && data.code === "START_FAILED") {
          pendingStart.onError?.();
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

  useEffect(() => {
    if (!socket) {
      setLoadingId(null);
      setPendingAction(null);
      setStartLoadingId(null);
      setPendingStart(null);
    }
  }, [socket]);

  return { register, unregister, startSitAndGoWithBots, loadingId, startLoadingId, registeredIds };
}
