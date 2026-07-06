import { describe, it, expect } from "vitest";
import {
  formatCents,
  dollarsToCents,
  majorToCents,
  splitEvenly,
  parseSharesToCents,
} from "../lib/format";

describe("formatCents", () => {
  it("formats positive, zero, and negative amounts in the default currency", () => {
    expect(formatCents(2132)).toBe("₹21.32");
    expect(formatCents(0)).toBe("₹0.00");
    expect(formatCents(-1000)).toBe("-₹10.00");
  });
});

describe("dollarsToCents", () => {
  it("parses money input to minor units", () => {
    expect(dollarsToCents("21.32")).toBe(2132);
    expect(dollarsToCents("₹250")).toBe(25000);
    expect(dollarsToCents("$1,000.00")).toBe(100000);
    expect(dollarsToCents("5")).toBe(500);
  });

  it("rejects blank and invalid input", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("-3")).toBeNull();
  });
});

describe("majorToCents", () => {
  it("converts positive numbers to minor units, rounding", () => {
    expect(majorToCents(45)).toBe(4500);
    expect(majorToCents(42.4)).toBe(4240);
    expect(majorToCents(19.999)).toBe(2000);
  });

  it("returns null for zero, negatives, and non-finite or non-number input", () => {
    expect(majorToCents(0)).toBeNull();
    expect(majorToCents(-5)).toBeNull();
    expect(majorToCents(NaN)).toBeNull();
    expect(majorToCents(Infinity)).toBeNull();
    expect(majorToCents("45")).toBeNull();
    expect(majorToCents(null)).toBeNull();
    expect(majorToCents(undefined)).toBeNull();
  });
});

describe("splitEvenly", () => {
  it("splits evenly when divisible", () => {
    expect(splitEvenly(3000, 3)).toEqual([1000, 1000, 1000]);
  });

  it("distributes the remainder one unit at a time and sums to the total", () => {
    const shares = splitEvenly(1000, 3);
    expect(shares).toEqual([334, 333, 333]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("returns an empty array for zero members", () => {
    expect(splitEvenly(1000, 0)).toEqual([]);
  });
});

describe("parseSharesToCents", () => {
  it("parses each custom share to minor units", () => {
    expect(parseSharesToCents(["10", "5.50", "4.50"])).toEqual([1000, 550, 450]);
  });

  it("returns null if any share is blank or invalid", () => {
    expect(parseSharesToCents(["10", ""])).toBeNull();
    expect(parseSharesToCents(["10", "abc"])).toBeNull();
    expect(parseSharesToCents(["10", "-5"])).toBeNull();
  });
});
