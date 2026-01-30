type WebEnv = {
  appName: string;
  appDescription: string;
  appUrl?: string;
  wsUrl: string;
  apiUrl: string;
  walletConnectProjectId?: string;
};

const readEnv = (
  key: string,
  options?: { requiredInProd?: boolean; fallback?: string },
): string => {
  const value = process.env[key]?.trim();
  if (value) return value;
  const isBuildPhase =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-export";
  if (options?.requiredInProd && process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error(`${key} must be set in production`);
  }
  return options?.fallback ?? "";
};

export const getWebEnv = (): WebEnv => {
  const appName =
    process.env.NEXT_PUBLIC_APP_NAME?.trim() || "PokerWars";
  const appDescription =
    process.env.NEXT_PUBLIC_APP_DESCRIPTION?.trim() ||
    "PokerWars is a tournament poker game.";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  return {
    appName,
    appDescription,
    appUrl,
    wsUrl: readEnv("NEXT_PUBLIC_WS_URL", { requiredInProd: true }),
    apiUrl: readEnv("NEXT_PUBLIC_API_URL", { requiredInProd: true }),
    walletConnectProjectId:
      process.env.WALLETCONNECT_PROJECT_ID?.trim() ||
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ||
      undefined,
  };
};
