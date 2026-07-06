// Expense categories.
//
// A fixed, small set so the value is consistent enough to group and total on
// later (spending by category). The LLM name/category suggestion (see
// lib/suggestExpense.ts) is constrained to this list; anything off-list is
// coerced to "Other". Kept dependency-free so both the browser wrapper and the
// server route can import it.

export const EXPENSE_CATEGORIES = [
  "Food",
  "Groceries",
  "Transport",
  "Travel",
  "Entertainment",
  "Shopping",
  "Utilities",
  "Health",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// True if `value` is exactly one of the known categories.
export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return (
    typeof value === "string" &&
    (EXPENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

// Map an arbitrary model output to a valid category. Case-insensitive so
// "food" or "FOOD" still land on "Food"; anything unrecognized becomes "Other".
export function coerceCategory(value: unknown): ExpenseCategory {
  if (typeof value !== "string") return "Other";
  const match = EXPENSE_CATEGORIES.find(
    (c) => c.toLowerCase() === value.trim().toLowerCase()
  );
  return match ?? "Other";
}
