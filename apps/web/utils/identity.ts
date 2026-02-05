export type Identity = {
  walletAddress?: string | null;
  sessionId?: string | null;
  effectiveId?: string | null;
};

export const getLocalIdentity = (): Identity => {
  if (typeof window === "undefined") return {};
  const walletAddress = window.localStorage.getItem("walletAddress");
  const sessionId = window.localStorage.getItem("sessionId");
  const effectiveId = walletAddress || sessionId;
  return { walletAddress, sessionId, effectiveId };
};

export const resolveEffectiveId = (
  walletAddress?: string | null,
  sessionId?: string | null,
): string | null => {
  const id = walletAddress || sessionId;
  return id ? id.toLowerCase() : null;
};
