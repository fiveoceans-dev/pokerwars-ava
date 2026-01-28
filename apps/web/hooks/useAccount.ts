import { useEffect, useMemo, useState } from "react";
import { initChain } from "~~/services/ownership";

type UseAccountResult = {
  address?: string;
  status: "connected" | "disconnected" | "connecting";
  chainId?: bigint;
  account?: any;
};

export function useAccount(): UseAccountResult {
  const [address, setAddress] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<"connected" | "disconnected" | "connecting">("disconnected");
  const [chainId, setChainId] = useState<bigint | undefined>(undefined);

  useEffect(() => {
    initChain();
    try {
      const stored = localStorage.getItem("walletAddress");
      if (stored) {
        setAddress(stored);
        setStatus("connected");
      }
    } catch {}
    setChainId(undefined);
  }, []);

  return useMemo(() => ({ address, status, chainId }), [address, status, chainId]);
}
