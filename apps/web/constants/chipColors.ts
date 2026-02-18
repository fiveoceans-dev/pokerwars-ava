// Centralized chip color definitions so UI stays consistent across the table.
// Colors use Tailwind utility classes to match our palette.

export type ChipColorBand = {
  minRatio: number;
  className: string;
};

// Ordered from highest ratio to lowest.
export const CHIP_COLOR_BANDS: ChipColorBand[] = [
  { minRatio: 50, className: "bg-emerald-900" }, // 50bb+
  { minRatio: 25, className: "bg-emerald-800" }, // 25–49bb
  { minRatio: 10, className: "bg-emerald-700" }, // 10–24bb
  { minRatio: 5, className: "bg-emerald-600" }, // 5–9bb
  { minRatio: 2, className: "bg-emerald-500" }, // 2–4bb
  { minRatio: 0, className: "bg-[var(--brand-accent)] text-black" }, // <2bb
];

/**
 * Return the chip color class based on ratio to big blind.
 * Defaults to gray when no bet is present.
 */
export function getBetChipColorClass(amount: number, bigBlind?: number) {
  const base = Math.max(1, bigBlind || 1);
  const ratio = amount / base;

  for (const band of CHIP_COLOR_BANDS) {
    if (ratio >= band.minRatio) {
      return band.className;
    }
  }
  return "bg-gray-600";
}

/**
 * Return a more vibrant version of the action color for chips.
 * Returns null if the action doesn't warrant a special vibrant color.
 */
export function getVibrantActionColor(actionLabel?: string | null) {
  if (!actionLabel) return null;

  const label = actionLabel.toUpperCase();
  
  if (label.includes("CHECK")) return "bg-emerald-400";
  if (label.includes("CALL")) return "bg-blue-400";
  if (label.includes("BET")) return "bg-amber-400";
  if (label.includes("RAISE")) return "bg-indigo-400";
  if (label.includes("ALL IN") || label.includes("ALLIN")) return "bg-orange-400";
  if (label.includes("WINNER")) return "bg-yellow-400";

  // For CHECK, FOLD or other labels, use default coloring
  return null;
}
