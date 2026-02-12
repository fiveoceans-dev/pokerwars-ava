type ServerEnv = {
  nodeEnv: string;
  isProduction: boolean;
  rawPortSet: boolean;
  port?: number;
  allowedOrigins: string[];
  devAllowedOrigins: string[];
  reconnectGraceMs: number;
  wsMaxPayload: number;
  adminWallets: string[];
};

const stripQuotes = (value: string | undefined | null): string => {
  if (!value) return "";
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

export const normalizeOrigin = (value?: string | null): string => {
  if (!value) return "";
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    const sanitized = trimmed.replace(/\/+$/, "").toLowerCase();
    return sanitized.startsWith("http://") || sanitized.startsWith("https://")
      ? sanitized
      : sanitized
        ? `http://${sanitized}`
        : "";
  }
};

const parseOrigins = (value?: string | null): string[] =>
  stripQuotes(value || "")
    .split(",")
    .map((s) => s.trim())
    .map(normalizeOrigin)
    .filter(Boolean);

const parseNumber = (value: string | undefined, fallback: number): number => {
  const stripped = stripQuotes(value);
  if (!stripped) return fallback;
  const parsed = Number.parseInt(stripped, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const getServerEnv = (): ServerEnv => {
  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";

  const rawPort = stripQuotes(process.env.PORT);
  let port: number | undefined;
  if (rawPort) {
    const parsed = Number.parseInt(rawPort, 10);
    if (Number.isNaN(parsed)) {
      throw new Error("PORT must be a valid number");
    }
    port = parsed;
  }

  const allowedOrigins = parseOrigins(process.env.ALLOWED_WS_ORIGINS);
  const devAllowedOrigins = parseOrigins(process.env.DEV_ALLOWED_WS_ORIGINS);

  if (isProduction && allowedOrigins.length === 0) {
    throw new Error("ALLOWED_WS_ORIGINS must be configured when NODE_ENV=production");
  }

  const adminWallets = (process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

  return {
    nodeEnv,
    isProduction,
    rawPortSet: Boolean(rawPort),
    port,
    allowedOrigins,
    devAllowedOrigins,
    reconnectGraceMs: parseNumber(process.env.RECONNECT_GRACE_SECONDS, 30) * 1000,
    wsMaxPayload: parseNumber(process.env.WS_MAX_PAYLOAD, 64 * 1024),
    adminWallets,
  };
};
