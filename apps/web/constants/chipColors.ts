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
