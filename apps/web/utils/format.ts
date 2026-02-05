export function formatNumber(
  value: number | string,
  options?: Intl.NumberFormatOptions,
): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-US", options).format(num);
}
