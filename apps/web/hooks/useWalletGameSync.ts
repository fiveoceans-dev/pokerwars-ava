import { useEffect, useState, useCallback } from "react";
import { useWallet } from "~~/components/providers/WalletProvider";
import { useGameStore } from "./useGameStore";

type WalletStatus = "connected" | "disconnected" | "connecting";

export function useWalletGameSync() {
  const { address, status, error, connect, disconnect } = useWallet();
  const { connectWallet, handleDisconnect } = useGameStore();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
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
