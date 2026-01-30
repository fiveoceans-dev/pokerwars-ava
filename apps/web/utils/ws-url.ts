const normalizeUrlList = (value: string): string[] => {
  return value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
};

const isLocalHost = (host: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(host);

const selectPreferredUrl = (value: string): string | undefined => {
  const candidates = normalizeUrlList(value);
  if (candidates.length === 0) return undefined;

  const parsed = candidates.reduce<Array<{ raw: string; url: URL }>>(
    (acc, raw) => {
      try {
        const url = new URL(raw);
        acc.push({ raw, url });
      } catch {
        // ignore invalid URLs
      }
      return acc;
    },
    [],
  );

  if (parsed.length === 0) {
    return undefined;
  }

  if (typeof window === "undefined") {
    return parsed[0].raw;
  }

  const desiredProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const currentHost = window.location.host;
  const isLocalContext = isLocalHost(window.location.hostname);

  const hostAndProtocol = parsed.find(
    (item) => item.url.host === currentHost && item.url.protocol === desiredProtocol,
  );
  if (hostAndProtocol) {
    return hostAndProtocol.raw;
  }

  const protocolPreferred = parsed.find((item) => item.url.protocol === desiredProtocol);
  if (protocolPreferred) {    
    if (!isLocalContext && isLocalHost(protocolPreferred.url.hostname)) {
      const nonLocalWithProtocol = parsed.find(
        (item) => item.url.protocol === desiredProtocol && !isLocalHost(item.url.hostname),
      );
      if (nonLocalWithProtocol) return nonLocalWithProtocol.raw;
    }
    return protocolPreferred.raw;
  }

  const hostPreferred = parsed.find((item) => item.url.host === currentHost);
  if (hostPreferred) {
    return hostPreferred.raw;
  }

  return parsed[0].raw;
};

const readRuntimeWsUrl = (): string | undefined => {
  if (typeof window === "undefined") return undefined;
  const value = (window as unknown as { __NEXT_PUBLIC_WS_URL?: unknown }).__NEXT_PUBLIC_WS_URL;
  if (typeof value !== "string") return undefined;
  return selectPreferredUrl(value.trim());
};

export const resolveWebSocketUrl = (): string => {
  const envValueRaw = (process.env.NEXT_PUBLIC_WS_URL ?? "").trim();
  const envValue = envValueRaw ? selectPreferredUrl(envValueRaw) : undefined;
  const runtimeValue = readRuntimeWsUrl();
  const candidate = runtimeValue || envValue;

  if (candidate) {
    return candidate;
  }

  if (typeof window !== "undefined") {
    return "";
  }
  throw new Error("NEXT_PUBLIC_WS_URL must be defined before initializing the client");
};
