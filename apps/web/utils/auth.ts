const AUTH_TOKEN_KEY = "pokerwars:authToken";
const AUTH_WALLET_KEY = "pokerwars:authWallet";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getAuthWallet(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_WALLET_KEY);
}

export function setAuthToken(token: string, wallet?: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  if (wallet) {
    window.localStorage.setItem(AUTH_WALLET_KEY, wallet.toLowerCase());
  }
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_WALLET_KEY);
}
