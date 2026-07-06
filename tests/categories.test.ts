import { describe, it, expect } from "vitest";
import {
  EXPENSE_CATEGORIES,
  isExpenseCategory,
  coerceCategory,
} from "../lib/categories";

// coerceCategory normalizes model output; isExpenseCategory guards the client.

describe("isExpenseCategory", () => {
  it("accepts exact known categories", () => {
    expect(isExpenseCategory("Food")).toBe(true);
    expect(isExpenseCategory("Other")).toBe(true);
  });

  it("rejects wrong case, unknown values, and non-strings", () => {
    expect(isExpenseCategory("food")).toBe(false);
    expect(isExpenseCategory("Rent")).toBe(false);
    expect(isExpenseCategory(null)).toBe(false);
    expect(isExpenseCategory(undefined)).toBe(false);
    expect(isExpenseCategory(42)).toBe(false);
  });
});

describe("coerceCategory", () => {
  it("passes through a valid category", () => {
    expect(coerceCategory("Groceries")).toBe("Groceries");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(coerceCategory("food")).toBe("Food");
    expect(coerceCategory("  TRANSPORT  ")).toBe("Transport");
  });

  it("falls back to Other for anything unrecognized", () => {
    expect(coerceCategory("Rent")).toBe("Other");
    expect(coerceCategory("")).toBe("Other");
    expect(coerceCategory(null)).toBe("Other");
    expect(coerceCategory(123)).toBe("Other");
  });

  it("only ever returns a known category", () => {
    for (const input of ["Food", "nonsense", "", null, undefined, {}]) {
      expect(EXPENSE_CATEGORIES).toContain(coerceCategory(input));
    }
  });
});
