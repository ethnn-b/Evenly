// Receipt OCR and parsing.
//
// Two concerns live here, kept separate on purpose:
//   1. parseReceiptText()  -- pure function: OCR text in, items + total out.
//      No image handling, no dependencies, so it is fast and deterministic to
//      unit test (see tests/ocr.test.ts).
//   2. runOcr()            -- runs Tesseract.js on an image in the browser and
//      feeds its text to the parser. Tesseract is imported dynamically so that
//      importing this module (e.g. in tests) does not pull in the OCR engine.
//
// Prices are returned in integer cents to match the rest of the app.

import type { ReceiptItem, ReceiptParseResult } from "./types";

// Words that mark a line as metadata (a summary or payment line), not a
// purchased item. Compared case-insensitively against the line's text.
const META_KEYWORDS = [
  "subtotal",
  "total",
  "tax",
  "vat",
  "gst",
  "hst",
  "tip",
  "gratuity",
  "balance",
  "change",
  "cash",
  "credit",
  "debit",
  "visa",
  "mastercard",
  "amex",
  "discover",
  "card",
  "payment",
  "payable",
  "amount due",
  "amount",
];

// Lines whose "total" is NOT the amount actually due, so they must never be
// counted as the grand total: a per-tax-band figure ("Total 6% supplies"), a
// pre-tax figure ("Total Sales Excluding GST"), a tax subtotal ("Total GST"),
// the pre-tax gross ("Total Gross"), or a count ("Total Qty"). Some of these
// print a LARGER number than the amount due, which is why the old rule of
// taking the largest "total" line went wrong on real receipts.
//
// Note "subtotal" (one word) is excluded, but a spaced "Sub Total" is not: on
// many receipts "Sub Total" is the only line and doubles as the amount due, so
// dropping it loses the total entirely. When a real grand total is also
// present it is normally the larger of the two, so the max below still wins.
const NON_GRAND_TOTAL = [
  "subtotal",
  "supplies",
  "excluding",
  "excl.",
  "excl ",
  "before gst",
  "total gst",
  "gst total",
  "total tax",
  "tax total",
  "total gross",
  "gross total",
  "total qty",
  "total quantity",
  "total item",
  "total unit",
  "no. of item",
  "no of item",
  "total discount",
  "total saving",
];

// Labels that mark the amount due without the word "total" in the line, so
// "Amount Due 42.40", "Payable 22.58", or "Inclusive of GST 65.53" still count
// as total candidates. (Labels that do contain "total", like "grand total",
// need no entry here since isTotalLine already matches on the word "total".)
const GRAND_TOTAL_LABEL = [
  "payable",
  "amount due",
  "balance due",
  "inclusive",
  "incl gst",
  "incl. gst",
  "including gst",
];

// Is this line a grand-total candidate? It must name a total (either the word
// "total" or one of the labels above) and must not be one of the excluded
// non-grand-total lines.
function isTotalLine(lower: string): boolean {
  if (NON_GRAND_TOTAL.some((k) => lower.includes(k))) return false;
  return lower.includes("total") || GRAND_TOTAL_LABEL.some((k) => lower.includes(k));
}

// Matches a money amount like 12.99, 1,234.56, or 0.50. The cents group is
// required so we do not pick up stray integers (quantities, item numbers).
const AMOUNT_RE = /(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})(?!\d)/g;

/**
 * Parse a single money substring (e.g. "$12.99", "1,234.50") to integer cents.
 * Returns null if no amount is found.
 */
export function parseAmountToCents(raw: string): number | null {
  AMOUNT_RE.lastIndex = 0;
  const match = AMOUNT_RE.exec(raw);
  if (!match) return null;
  const dollars = parseInt(match[1].replace(/,/g, ""), 10);
  const cents = parseInt(match[2], 10);
  if (Number.isNaN(dollars) || Number.isNaN(cents)) return null;
  return dollars * 100 + cents;
}

// Find the last money amount on a line (the price usually sits at the right
// edge) and return both the cents value and where it started, so the caller can
// strip it off to recover the item name.
function lastAmountOnLine(line: string): { cents: number; index: number } | null {
  AMOUNT_RE.lastIndex = 0;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(line)) !== null) {
    last = m;
  }
  if (!last) return null;
  const dollars = parseInt(last[1].replace(/,/g, ""), 10);
  const cents = parseInt(last[2], 10);
  return { cents: dollars * 100 + cents, index: last.index };
}

function lineHasKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword);
}

/**
 * Parse raw OCR text into line items and a total.
 *
 * Heuristics (deliberately simple; see docs/design-decisions.md for rationale):
 *   - A line with a trailing price and a name is an item, unless its text
 *     matches a metadata keyword (subtotal, tax, tip, card, ...).
 *   - The total is the largest amount among the grand-total lines (see
 *     isTotalLine): lines that name a total but are not a subtotal, a tax
 *     subtotal, a per-tax-band figure, a pre-tax "excluding GST" line, or a
 *     count. If none is found, total is null. (The old rule took the largest of
 *     every "total" line including those, so pre-tax and per-band figures,
 *     which are often larger, were mistaken for the amount due.)
 */
export function parseReceiptText(text: string): ReceiptParseResult {
  const items: ReceiptItem[] = [];
  const totalCandidates: number[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    const found = lastAmountOnLine(line);
    if (!found) continue;

    const lower = line.toLowerCase();
    const isMeta = META_KEYWORDS.some((k) => lineHasKeyword(lower, k));

    if (isMeta) {
      if (isTotalLine(lower)) totalCandidates.push(found.cents);
      continue; // never treat metadata lines as items
    }

    const name = line.slice(0, found.index).replace(/[.\s:$£€₹-]+$/, "").trim();
    if (name.length === 0) continue; // a bare price with no label, skip it

    items.push({ name, price: found.cents });
  }

  const total =
    totalCandidates.length > 0 ? Math.max(...totalCandidates) : null;

  return { items, total };
}

/**
 * Run OCR on a receipt image in the browser and parse the result.
 *
 * @param image   a File, Blob, or image URL accepted by Tesseract.js
 * @param onProgress optional 0..1 progress callback for a UI bar
 */
export async function runOcr(
  image: File | Blob | string,
  onProgress?: (fraction: number) => void
): Promise<ReceiptParseResult & { rawText: string }> {
  // Dynamic import keeps the ~heavy engine out of non-browser import paths.
  const Tesseract = (await import("tesseract.js")).default;

  const { data } = await Tesseract.recognize(image, "eng", {
    logger: (m: { status: string; progress: number }) => {
      if (onProgress && m.status === "recognizing text") {
        onProgress(m.progress);
      }
    },
  });

  const parsed = parseReceiptText(data.text);
  return { ...parsed, rawText: data.text };
}
