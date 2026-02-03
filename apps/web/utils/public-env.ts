const normalizeEnvValue = (value: unknown): string => {
  if (typeof value !== "string") return "";
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

export const readPublicEnv = (key: string): string => {
  if (typeof window !== "undefined") {
    const value = (window as unknown as Record<string, unknown>)[`__${key}`];
    const normalized = normalizeEnvValue(value);
    if (normalized) return normalized;
  }
  const envValue = process.env[key];
  return normalizeEnvValue(envValue);
};

export const readPublicEnvOptional = (key: string): string | undefined => {
  const value = readPublicEnv(key);
  return value ? value : undefined;
};
