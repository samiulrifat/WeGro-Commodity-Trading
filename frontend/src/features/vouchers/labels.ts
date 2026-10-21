/** Stickers on one A4 sheet: 3 across, 7 down (63.5 × 38.1 mm each). */
export const PER_SHEET = 21;
/** At most this many labels in one print. */
export const MAX_LABELS = 1050;

/** How many labels go on each sheet: full sheets, then what is left. */
export function labelPages(count: number): number[] {
  const n = Math.max(0, Math.min(MAX_LABELS, Math.floor(count)));
  const pages = Array<number>(Math.floor(n / PER_SHEET)).fill(PER_SHEET);
  if (n % PER_SHEET) pages.push(n % PER_SHEET);
  return pages;
}
