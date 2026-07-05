// Money formatting helpers. Minor units (paise for INR, cents for USD) are the
// source of truth everywhere; the major-unit strings here exist only for display
// and for reading user input. The currency symbol comes from lib/currency.ts.

import { DEFAULT_CURRENCY, type Currency } from "./currency";

/** Format integer minor units as a currency string, e.g. 2132 -> "₹21.32". */
export function formatCents(cents: number, currency: Currency = DEFAULT_CURRENCY): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${currency.symbol}${(abs / 100).toFixed(2)}`;
}

/**
 * Parse a money string from a form field into integer minor units. Returns null
 * for blank or invalid input. Rounds to the nearest minor unit.
 */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[₹$,\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/**
 * Split a total evenly across n members, distributing the leftover units one
 * each to the first few so the shares sum exactly to the total.
 * e.g. splitEvenly(1000, 3) -> [334, 333, 333].
 */
export function splitEvenly(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Parse per-member custom share inputs (major-unit strings) into minor units
 * for an unequal split. Returns null if any entry is blank or invalid, so the
 * caller can reject the split before saving.
 */
export function parseSharesToCents(inputs: string[]): number[] | null {
  const out: number[] = [];
  for (const input of inputs) {
    const cents = dollarsToCents(input);
    if (cents === null) return null;
    out.push(cents);
  }
  return out;
}
