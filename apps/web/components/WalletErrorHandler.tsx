import React from "react";
import { useWalletGameSync } from "../hooks/useWalletGameSync";
import { useGameStore } from "../hooks/useGameStore";

interface WalletErrorHandlerProps {
  children: React.ReactNode;
}

export function WalletErrorHandler({ children }: WalletErrorHandlerProps) {
  const { error: walletSyncError, reconnect, disconnect } = useWalletGameSync();
  const { connectionError } = useGameStore();

  // Determine the most critical error to display
  const activeError = walletSyncError || connectionError;

  if (!activeError) {
    return <>{children}</>;
  }

  const getErrorInfo = (error: string) => {
    if (error.includes('timeout')) {
      return {
        title: 'Connection Timeout',
        message: 'The wallet connection is taking longer than expected.',
        actions: ['retry', 'refresh']
      };
    }
    
    if (error.includes('Invalid wallet address')) {
      return {
        title: 'Invalid Wallet',
        message: 'There was an issue with your wallet address.',
        actions: ['reconnect', 'refresh']
      };
    }
    
    if (error.includes('Failed to attach wallet')) {
      return {
        title: 'Wallet Attachment Failed', 
        message: 'Unable to connect your wallet to the game server.',
        actions: ['retry', 'reconnect']
      };
    }
    
    if (error.includes('Not connected to game server')) {
      return {
        title: 'Server Connection Lost',
        message: 'Lost connection to the game server.',
        actions: ['retry', 'refresh']
      };
    }

    if (error.includes('Failed to send action')) {
      return {
        title: 'Action Failed',
        message: 'Unable to send your action to the server.',
        actions: ['retry']
      };
    }

    // Default error
    return {
      title: 'Wallet Error',
      message: error,
      actions: ['retry', 'refresh']
    };
  };

  const handleRetry = () => {
    reconnect();
  };

  const handleReconnectWallet = () => {
    void disconnect();
    // Clear localStorage and force wallet reconnection
    localStorage.removeItem('walletAddress');
    localStorage.removeItem('sessionId');
    window.location.reload();
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const errorInfo = getErrorInfo(activeError);

  return (
    <div className="relative">
      <div className="fixed top-4 right-4 z-50 w-72 min-h-[96px] border border-white/10 bg-black/85 px-4 py-3 text-[11px] text-white/80">
        <div className="flex items-start gap-3">
          <div className="text-white/50">!</div>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-[0.3em] text-white/60">
              Warning
            </div>
            <div className="text-white mb-1">{errorInfo.title}</div>
            <p className="text-white/60 mb-3 leading-relaxed">
              {errorInfo.message}
            </p>
            <div className="flex gap-2">
              {errorInfo.actions.includes("retry") && (
                <button onClick={handleRetry} className="tbtn text-[11px] font-semibold">
                  Retry
                </button>
              )}
              {errorInfo.actions.includes("reconnect") && (
                <button onClick={handleReconnectWallet} className="tbtn text-[11px] font-semibold">
                  Reconnect
                </button>
              )}
              {errorInfo.actions.includes("refresh") && (
                <button onClick={handleRefresh} className="tbtn text-[11px] font-semibold">
                  Refresh
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
