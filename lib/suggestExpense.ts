// Client wrapper for expense name/category suggestion.
//
// Calls the server route (/api/suggest-expense), which asks an open-weight model
// on Groq to read the receipt text. If the route is unconfigured (no API key),
// errors, or times out, this falls back to the local, instant heuristic name
// (guessMerchantName) so scanning a receipt always yields a usable title. The
// caller can show `source` to distinguish the two.

import { guessMerchantName } from "./expenseName";
import { isExpenseCategory, type ExpenseCategory } from "./categories";

export interface ExpenseSuggestion {
  name: string;
  category: ExpenseCategory | null; // the heuristic cannot infer a category
  totalCents: number | null; // model-read grand total; the heuristic has none
  source: "llm" | "heuristic";
}

// The heuristic result, used as the baseline and the fallback. It has no total:
// the regex parser in lib/ocr.ts already supplies that.
export function heuristicSuggestion(rawText: string): ExpenseSuggestion {
  return {
    name: guessMerchantName(rawText),
    category: null,
    totalCents: null,
    source: "heuristic",
  };
}

export async function suggestExpense(
  rawText: string,
  opts?: { signal?: AbortSignal }
): Promise<ExpenseSuggestion> {
  try {
    const res = await fetch("/api/suggest-expense", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rawText }),
      signal: opts?.signal,
    });
    if (!res.ok) return heuristicSuggestion(rawText);

    const data: unknown = await res.json();
    const record = (data ?? {}) as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) return heuristicSuggestion(rawText);

    return {
      name,
      category: isExpenseCategory(record.category) ? record.category : null,
      totalCents:
        typeof record.totalCents === "number" &&
        Number.isFinite(record.totalCents)
          ? record.totalCents
          : null,
      source: "llm",
    };
  } catch {
    // Network error or aborted request (e.g. a newer scan superseded this one).
    return heuristicSuggestion(rawText);
  }
}
