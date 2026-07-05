// Auto-naming for expenses from receipt OCR text.
//
// The expense title is the merchant name, which sits at the top of almost every
// receipt (e.g. "Trader Joe's", "Shell"). Taking it from the text is
// deterministic, instant, and needs no model download, so scanning a receipt
// gives a usable title with nothing to load and nothing to hallucinate.
//
// The helpers are pure (string in, string out) and unit tested in
// tests/expenseName.test.ts.

const FALLBACK_NAME = "Receipt expense";

function tidy(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/**
 * Clean a candidate name (a receipt line) into a short title: strip surrounding
 * quotes and trailing punctuation, collapse whitespace, keep the first few
 * words, cap the length, and capitalize the first letter. Returns "" if nothing
 * usable is left.
 */
export function cleanName(raw: string): string {
  let s = tidy(raw).replace(/^["'`]+|["'`]+$/g, "");
  s = s.replace(/[.,:;\s-]+$/g, "");
  s = tidy(s).split(" ").filter(Boolean).slice(0, 6).join(" ").slice(0, 48).trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Suggest an expense name from receipt OCR text. The merchant name is almost
 * always at the top of a receipt, so return the first line near the top that
 * reads like a name (has letters and is not mostly digits), title-cased. Falls
 * back to a generic name when no such line is found.
 */
export function guessMerchantName(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 6)) {
    const letters = (line.match(/[a-z]/gi) || []).length;
    const digits = (line.match(/\d/g) || []).length;
    if (letters >= 2 && letters >= digits) {
      const name = cleanName(titleCase(line));
      if (name) return name;
    }
  }
  return FALLBACK_NAME;
}
