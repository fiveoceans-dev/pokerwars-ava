export const readPublicEnv = (key: string): string => {
  if (typeof window !== "undefined") {
    const value = (window as unknown as Record<string, unknown>)[`__${key}`];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  const envValue = process.env[key];
  return typeof envValue === "string" ? envValue.trim() : "";
};

export const readPublicEnvOptional = (key: string): string | undefined => {
  const value = readPublicEnv(key);
  return value ? value : undefined;
};
