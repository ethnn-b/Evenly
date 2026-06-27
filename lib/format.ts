// Money formatting helpers. Cents are the source of truth everywhere; dollars
// exist only for display and for reading user input.

/** Format integer cents as a dollar string, e.g. 2132 -> "$21.32". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

/**
 * Parse a dollar string from a form field into integer cents. Returns null for
 * blank or invalid input. Rounds to the nearest cent.
 */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/**
 * Split a total evenly across n members, distributing the leftover cents one
 * each to the first few so the shares sum exactly to the total.
 * e.g. splitEvenly(1000, 3) -> [334, 333, 333].
 */
export function splitEvenly(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}
