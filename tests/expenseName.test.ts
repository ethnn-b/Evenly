import { describe, it, expect } from "vitest";
import { cleanName, guessMerchantName } from "../lib/expenseName";

// The naming helpers are pure functions, so they are tested directly here.

describe("cleanName", () => {
  it("trims, strips quotes and trailing punctuation, capitalizes", () => {
    expect(cleanName('  "grocery shopping." ')).toBe("Grocery shopping");
  });

  it("keeps the first few words and caps the length", () => {
    expect(cleanName("dinner and drinks with the whole team last night")).toBe(
      "Dinner and drinks with the whole"
    );
  });

  it("returns an empty string for junk", () => {
    expect(cleanName("   ")).toBe("");
    expect(cleanName('""')).toBe("");
  });
});

describe("guessMerchantName", () => {
  it("picks the merchant name from the top of the receipt", () => {
    const text = ["STARBUCKS", "123 Main St", "Latte 4.50", "Total 4.50"].join(
      "\n"
    );
    expect(guessMerchantName(text)).toBe("Starbucks");
  });

  it("skips leading number/date lines", () => {
    const text = ["01/02/2026", "#4471", "Blue Bottle Coffee", "Total 6.00"].join(
      "\n"
    );
    expect(guessMerchantName(text)).toBe("Blue Bottle Coffee");
  });

  it("falls back when there is no name-like line", () => {
    expect(guessMerchantName("12.00\n3.50\n")).toBe("Receipt expense");
    expect(guessMerchantName("")).toBe("Receipt expense");
  });
});
