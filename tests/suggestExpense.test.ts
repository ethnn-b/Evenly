import { describe, it, expect, vi, afterEach } from "vitest";
import { suggestExpense } from "../lib/suggestExpense";

// suggestExpense calls /api/suggest-expense and, on any failure, falls back to
// the local heuristic name. fetch is stubbed so these stay fast and offline.

// "STARBUCKS" at the top of the receipt is what the heuristic resolves to, so
// the fallback cases below can assert on it.
const RECEIPT = "STARBUCKS\n123 Main St\nLatte 4.50\nTotal 4.50";

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("suggestExpense", () => {
  it("uses the model result when the route returns name, category, and total", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(true, {
          name: "Coffee at Starbucks",
          category: "Food",
          totalCents: 450,
        })
      )
    );
    const s = await suggestExpense(RECEIPT);
    expect(s).toEqual({
      name: "Coffee at Starbucks",
      category: "Food",
      totalCents: 450,
      source: "llm",
    });
  });

  it("keeps the llm name but nulls an off-list category and a non-numeric total", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(true, {
          name: "Rent Check",
          category: "Rent",
          totalCents: "12.00",
        })
      )
    );
    const s = await suggestExpense(RECEIPT);
    expect(s.name).toBe("Rent Check");
    expect(s.category).toBeNull();
    expect(s.totalCents).toBeNull();
    expect(s.source).toBe("llm");
  });

  it("falls back to the heuristic when the route is unconfigured (503)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(false, { error: "not_configured" })));
    const s = await suggestExpense(RECEIPT);
    expect(s).toEqual({
      name: "Starbucks",
      category: null,
      totalCents: null,
      source: "heuristic",
    });
  });

  it("falls back to the heuristic when the network throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const s = await suggestExpense(RECEIPT);
    expect(s).toEqual({
      name: "Starbucks",
      category: null,
      totalCents: null,
      source: "heuristic",
    });
  });

  it("falls back to the heuristic when the model returns no usable name", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(true, { name: "  " })));
    const s = await suggestExpense(RECEIPT);
    expect(s.source).toBe("heuristic");
    expect(s.name).toBe("Starbucks");
  });
});
