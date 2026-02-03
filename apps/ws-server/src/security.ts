import crypto from "crypto";

export const authNonces = new Map<string, string>(); // wallet -> nonce
export const verifiedWallets = new Set<string>(); // lowercase wallets

const AUTH_HEADER = { alg: "HS256", typ: "JWT" } as const;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function getSecret(): string | null {
  return process.env.JWT_SECRET || null;
}

function base64Url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export function issueAuthToken(wallet: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const payload = {
    wallet: wallet.toLowerCase(),
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encodedHeader = base64Url(JSON.stringify(AUTH_HEADER));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyAuthToken(token: string): { wallet: string } | null {
  const secret = getSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  const expected = sign(`${encodedHeader}.${encodedPayload}`, secret);
  if (signature !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload?.wallet || typeof payload.wallet !== "string") return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return { wallet: payload.wallet.toLowerCase() };
  } catch {
    return null;
  }
}
