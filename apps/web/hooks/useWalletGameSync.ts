import { useEffect, useState, useCallback } from "react";
import { useWallet } from "~~/components/providers/WalletProvider";
import { useGameStore } from "./useGameStore";
import { notifyError } from "~~/utils/notifications";

type WalletStatus = "connected" | "disconnected" | "connecting";

export function useWalletGameSync() {
  const { address, status, error, connect, disconnect } = useWallet();
  const { connectWallet, handleDisconnect } = useGameStore();
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const path = window.location?.pathname || "";
      const isTestTable =
        (window as any).__POKERWARS_DISABLE_WS__ === true ||
        (window as any).__POKERWARS_DISABLE_WALLET_SYNC__ === true ||
        path.startsWith("/table6-test") ||
        path.startsWith("/table9-test");
      if (isTestTable) {
        setIsInitialized(true);
        return;
      }
    }

    if (status === "connected" && address) {
      connectWallet(address);
      setIsInitialized(true);
      return;
    }

    if (status === "disconnected") {
      handleDisconnect().catch(() => void 0);
      setIsInitialized(true);
    }
  }, [status, address, connectWallet, handleDisconnect]);

  useEffect(() => {
    if (error && error !== lastError) {
      notifyError(error);
      setLastError(error);
    }
    if (!error && lastError) {
      setLastError(null);
    }
  }, [error, lastError]);

  const reconnect = useCallback(async () => {
    await connect();
  }, [connect]);

  const safeDisconnect = useCallback(async () => {
    await disconnect();
  }, [disconnect]);

  return {
    isConnected: status === "connected" && !!address,
    address,
    status: status as WalletStatus,
    error,
    isInitialized,
    reconnect,
    disconnect: safeDisconnect,
  };
}
