"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "~~/components/ThemeProvider";
import { WalletConnectButton } from "~~/components/WalletConnectButton";
import { WalletDisconnectConfirmHost } from "~~/components/WalletDisconnectConfirm";
import { WalletProvider } from "~~/components/providers/WalletProvider";
import { DebugPanel } from "~~/components/DebugPanel";
import TournamentWinModal from "~~/components/TournamentWinModal";
import { useGameStore } from "~~/hooks/useGameStore";
import { notifyError } from "~~/utils/notifications";
import { wagmiConfig } from "~~/config/wagmi";

function GameStoreErrorWatcher() {
  const connectionError = useGameStore((state) => state.connectionError);
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!connectionError || connectionError === lastErrorRef.current) return;
    lastErrorRef.current = connectionError;
    notifyError(connectionError);
  }, [connectionError]);

  return null;
}

function ConsoleErrorForwarder() {
  useEffect(() => {
    const original = console.error;
    const recent = new Map<string, number>();

    const isExtensionError = (arg: unknown): boolean => {
      if (arg instanceof Error) {
        const stack = arg.stack ?? "";
        if (
          stack.includes("chrome-extension://") ||
          stack.includes("moz-extension://")
        ) {
          return true;
        }
        if (
          arg.message.includes("chrome.runtime.sendMessage") &&
          arg.message.includes("Extension ID")
        ) {
          return true;
        }
      }
      if (typeof arg === "string") {
        if (
          arg.includes("chrome-extension://") ||
          arg.includes("moz-extension://")
        ) {
          return true;
        }
        if (
          arg.includes("chrome.runtime.sendMessage") &&
          arg.includes("Extension ID")
        ) {
          return true;
        }
      }
      return false;
    };

    console.error = (...args: unknown[]) => {
      if (args.some(isExtensionError)) {
        return;
      }
      original.apply(console, args as any);

      const message = args
        .map((arg) => {
          if (arg instanceof Error) return arg.message;
          if (typeof arg === "string") return arg;
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        })
        .filter(Boolean)
        .join(" \u2022 ");

      const trimmed = message.trim();
      if (!trimmed) return;

      const truncated =
        trimmed.length > 220 ? `${trimmed.slice(0, 220)}…` : trimmed;

      const now = Date.now();
      const last = recent.get(truncated) ?? 0;
      if (now - last < 1500) {
        return;
      }

      recent.set(truncated, now);
      notifyError(truncated);
    };

    const handleWindowError = (event: ErrorEvent) => {
      if (isExtensionError(event.error) || isExtensionError(event.message)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isExtensionError(event.reason)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    };

    window.addEventListener("error", handleWindowError, true);
    window.addEventListener("unhandledrejection", handleRejection, true);

    return () => {
      console.error = original;
      window.removeEventListener("error", handleWindowError, true);
      window.removeEventListener("unhandledrejection", handleRejection, true);
    };
  }, []);

  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const queryClientRef = useRef<QueryClient>();
  if (!queryClientRef.current) {
    queryClientRef.current = new QueryClient();
  }

  const enableConsoleForwarder =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEBUG_TOASTS !== "0" &&
    process.env.NEXT_PUBLIC_DEBUG_TOASTS !== "false";

  const suppressConsoleLog =
    process.env.NEXT_PUBLIC_DEBUG_LOGS === "0" ||
    process.env.NEXT_PUBLIC_DEBUG_LOGS === "false";

  useEffect(() => {
    if (!suppressConsoleLog) return;
    const original = console.log;
    console.log = () => {};
    return () => {
      console.log = original;
    };
  }, [suppressConsoleLog]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClientRef.current}>
        <WalletProvider>
          <ThemeProvider>
            {children}
            <GameStoreErrorWatcher />
            {enableConsoleForwarder ? <ConsoleErrorForwarder /> : null}
            <WalletConnectButton showButton={false} />
            <WalletDisconnectConfirmHost />
            <TournamentWinModal />
            <DebugPanel />
            <Toaster position="bottom-right" />
          </ThemeProvider>
        </WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
