import { describe, it, expect } from "vitest";
import { formatCents, dollarsToCents, splitEvenly } from "../lib/format";

describe("formatCents", () => {
  it("formats positive, zero, and negative cents", () => {
    expect(formatCents(2132)).toBe("$21.32");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(-1000)).toBe("-$10.00");
  });
});

describe("dollarsToCents", () => {
  it("parses dollar input to cents", () => {
    expect(dollarsToCents("21.32")).toBe(2132);
    expect(dollarsToCents("$1,000.00")).toBe(100000);
    expect(dollarsToCents("5")).toBe(500);
  });

  it("rejects blank and invalid input", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("-3")).toBeNull();
  });
});

describe("splitEvenly", () => {
  it("splits evenly when divisible", () => {
    expect(splitEvenly(3000, 3)).toEqual([1000, 1000, 1000]);
  });

  it("distributes the remainder one cent at a time and sums to the total", () => {
    const shares = splitEvenly(1000, 3);
    expect(shares).toEqual([334, 333, 333]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("returns an empty array for zero members", () => {
    expect(splitEvenly(1000, 0)).toEqual([]);
  });
});
