import { useState, useCallback } from 'react';
import { useSignMessage } from 'wagmi';
import { resolveWebSocketUrl } from '~~/utils/ws-url';
import { clearAuthToken, setAuthToken } from '~~/utils/auth';

export type AuthStatus = 'none' | 'challenging' | 'signing' | 'verifying' | 'verified' | 'failed';

export function useAuth() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('none');
  const { signMessageAsync } = useSignMessage();

  const authenticate = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return false;

    try {
      setAuthStatus('challenging');

      // Get WebSocket API base URL
      const wsUrl = resolveWebSocketUrl() || 'ws://localhost:8099';
      const ws = new URL(wsUrl);
      const apiBase = `${ws.protocol === 'wss:' ? 'https:' : 'http:'}//${ws.host}`;

      // 1. Get challenge
      const challengeRes = await fetch(`${apiBase}/api/auth/challenge?wallet=${walletAddress}`);
      if (!challengeRes.ok) {
        throw new Error('Failed to get challenge');
      }

      const { nonce, message } = await challengeRes.json();
      console.log('Auth challenge:', { nonce, message });

      setAuthStatus('signing');

      // 2. Request wallet signature
      const signature = await signMessageAsync({
        message,
        account: walletAddress as `0x${string}`,
      });

      console.log('Wallet signature:', signature);

      setAuthStatus('verifying');

      // 3. Verify signature
      const verifyRes = await fetch(`${apiBase}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: walletAddress,
          signature
        })
      });

      if (verifyRes.ok) {
        const result = await verifyRes.json();
        console.log('Auth verification successful:', result);
        if (result?.token) {
          setAuthToken(String(result.token));
        }
        setAuthStatus('verified');
        return true;
      } else {
        const error = await verifyRes.json();
        console.error('Auth verification failed:', error);
        clearAuthToken();
        setAuthStatus('failed');
        return false;
      }
    } catch (error) {
      console.error('Authentication error:', error);
      clearAuthToken();
      setAuthStatus('failed');
      return false;
    }
  }, [signMessageAsync]);

  const reset = useCallback(() => {
    clearAuthToken();
    setAuthStatus('none');
  }, []);

  return {
    authStatus,
    isAuthenticated: authStatus === 'verified',
    authenticate,
    reset
  };
}
