type WebEnv = {
  appName: string;
  appDescription: string;
  appUrl?: string;
  wsUrl: string;
  apiUrl: string;
  walletConnectProjectId?: string;
};

const normalizeEnvValue = (value: string | undefined): string => {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const readEnv = (
  key: string,
  options?: { requiredInProd?: boolean; fallback?: string },
): string => {
  const value = normalizeEnvValue(process.env[key]);
  if (value) return value;
  const isBuildPhase =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-export";
  if (options?.requiredInProd && process.env.NODE_ENV === "production" && !isBuildPhase) {
    // Runtime envs are injected on Cloud Run; warn instead of crashing build/runtime.
    console.warn(`${key} is not set; runtime injection must provide it.`);
  }
  return options?.fallback ?? "";
};

export const getWebEnv = (): WebEnv => {
  const appName =
    normalizeEnvValue(process.env.NEXT_PUBLIC_APP_NAME) || "PokerWars";
  const appDescription =
    normalizeEnvValue(process.env.NEXT_PUBLIC_APP_DESCRIPTION) ||
    "PokerWars is a tournament poker game.";
  const appUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_APP_URL);

  return {
    appName,
    appDescription,
    appUrl,
    wsUrl: readEnv("NEXT_PUBLIC_WS_URL", { requiredInProd: true }),
    apiUrl: readEnv("NEXT_PUBLIC_API_URL", { requiredInProd: true }),
    walletConnectProjectId:
      normalizeEnvValue(process.env.WALLETCONNECT_PROJECT_ID) ||
      normalizeEnvValue(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) ||
      undefined,
  };
};
