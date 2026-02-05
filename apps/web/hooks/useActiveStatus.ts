import { useCallback, useEffect, useState } from "react";
import { resolveWebSocketUrl } from "~~/utils/ws-url";
import { getLocalIdentity, resolveEffectiveId } from "~~/utils/identity";
import { getAuthToken } from "~~/utils/auth";

type ActiveStatus = {
  cashActive: boolean;
  cashTableIds: string[];
  sngActive: boolean;
  mttActive: boolean;
};

const EMPTY_STATUS: ActiveStatus = {
  cashActive: false,
  cashTableIds: [],
  sngActive: false,
  mttActive: false,
};

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

export function useActiveStatus(pollMs = 20000) {
  const [status, setStatus] = useState<ActiveStatus>(EMPTY_STATUS);

  const fetchActive = useCallback(async () => {
    const identity = getLocalIdentity();
    const effectiveId = resolveEffectiveId(identity.walletAddress, identity.sessionId);
    if (!effectiveId) {
      setStatus(EMPTY_STATUS);
      return;
    }
    const apiBase = resolveApiBase();
    if (!apiBase) return;
    try {
      const token = getAuthToken();
      const res = await fetch(`${apiBase}/api/user/active?wallet=${effectiveId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        setStatus(EMPTY_STATUS);
        return;
      }
      const data = await res.json();
      setStatus({
        cashActive: Boolean(data?.cashActive),
        cashTableIds: Array.isArray(data?.cashTableIds) ? data.cashTableIds : [],
        sngActive: Boolean(data?.sngActive),
        mttActive: Boolean(data?.mttActive),
      });
    } catch {
      setStatus(EMPTY_STATUS);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      if (!mounted) return;
      await fetchActive();
    };
    void tick();
    const interval = window.setInterval(tick, pollMs);
    const onFocus = () => void tick();
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchActive, pollMs]);

  return status;
}
