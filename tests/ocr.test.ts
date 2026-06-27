import { describe, it, expect } from "vitest";
import { parseAmountToCents, parseReceiptText } from "../lib/ocr";

// These run against sample OCR *text* strings, not real images, so they stay
// fast and deterministic. The strings imitate what Tesseract.js spits out.

describe("parseAmountToCents", () => {
  it("parses a plain amount", () => {
    expect(parseAmountToCents("12.99")).toBe(1299);
  });

  it("ignores a leading currency symbol", () => {
    expect(parseAmountToCents("$4.50")).toBe(450);
  });

  it("parses thousands separators", () => {
    expect(parseAmountToCents("1,234.56")).toBe(123456);
  });

  it("returns null when there is no .NN amount", () => {
    expect(parseAmountToCents("two dollars")).toBeNull();
    expect(parseAmountToCents("42")).toBeNull();
  });
});

describe("parseReceiptText", () => {
  it("parses a simple receipt into items and a total", () => {
    const text = [
      "THE CORNER CAFE",
      "Cheeseburger      12.99",
      "Fries              4.50",
      "Soda               2.25",
      "Subtotal          19.74",
      "Tax                1.58",
      "TOTAL             21.32",
    ].join("\n");

    const { items, total } = parseReceiptText(text);

    expect(items).toEqual([
      { name: "Cheeseburger", price: 1299 },
      { name: "Fries", price: 450 },
      { name: "Soda", price: 225 },
    ]);
    expect(total).toBe(2132);
  });

  it("does not treat subtotal, tax, or tip lines as items", () => {
    const text = [
      "Pizza             18.00",
      "Subtotal          18.00",
      "Tax                1.44",
      "Tip                3.60",
      "Total             23.04",
    ].join("\n");

    const { items, total } = parseReceiptText(text);
    expect(items).toEqual([{ name: "Pizza", price: 1800 }]);
    expect(total).toBe(2304);
  });

  it("prefers the grand total over the subtotal", () => {
    const text = ["Item A 10.00", "Subtotal 10.00", "Total 11.00"].join("\n");
    expect(parseReceiptText(text).total).toBe(1100);
  });

  it("handles currency symbols on prices", () => {
    const text = ["Latte $5.25", "Muffin $3.75", "Total $9.00"].join("\n");
    const { items, total } = parseReceiptText(text);
    expect(items).toEqual([
      { name: "Latte", price: 525 },
      { name: "Muffin", price: 375 },
    ]);
    expect(total).toBe(900);
  });

  it("takes the trailing price when a line has more than one number", () => {
    // "2 @ 3.50" then the line total 7.00
    const text = ["Tacos 2 @ 3.50 7.00", "Total 7.00"].join("\n");
    const { items } = parseReceiptText(text);
    expect(items).toHaveLength(1);
    expect(items[0].price).toBe(700);
    expect(items[0].name).toContain("Tacos");
  });

  it("returns null total when no total line is present", () => {
    const text = ["Apple 1.00", "Banana 0.50"].join("\n");
    const { items, total } = parseReceiptText(text);
    expect(items).toHaveLength(2);
    expect(total).toBeNull();
  });

  it("skips noise lines without a price", () => {
    const text = [
      "WELCOME TO THE STORE",
      "123 Main St",
      "Widget 9.99",
      "Thank you!",
      "Total 9.99",
    ].join("\n");
    const { items, total } = parseReceiptText(text);
    expect(items).toEqual([{ name: "Widget", price: 999 }]);
    expect(total).toBe(999);
  });

  it("ignores a bare price with no item name", () => {
    const text = ["9.99", "Total 9.99"].join("\n");
    expect(parseReceiptText(text).items).toEqual([]);
  });
});
