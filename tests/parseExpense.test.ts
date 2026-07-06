import { describe, it, expect, vi, afterEach } from "vitest";
import { parseExpense } from "../lib/parseExpense";

// parseExpense calls /api/parse-expense and returns null on any failure (there
// is no local fallback for a free-form sentence). fetch is stubbed here.

const MEMBERS = [
  { id: "u1", name: "Me" },
  { id: "u2", name: "Alex" },
  { id: "u3", name: "Sam" },
];

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseExpense", () => {
  it("returns the structured expense from a valid response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(true, {
          description: "Dinner",
          amountCents: 80000,
          payerId: "u1",
          memberIds: ["u1", "u2", "u3"],
        })
      )
    );
    const r = await parseExpense("I paid 800 for dinner with Alex and Sam", MEMBERS, "u1");
    expect(r).toEqual({
      description: "Dinner",
      amountCents: 80000,
      payerId: "u1",
      memberIds: ["u1", "u2", "u3"],
    });
  });

  it("normalizes a missing payer and non-string member ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(true, {
          description: "Groceries",
          amountCents: 25000,
          payerId: null,
          memberIds: ["u2", 5, null, "u3"],
        })
      )
    );
    const r = await parseExpense("groceries 250 with Alex and Sam", MEMBERS, "u1");
    expect(r?.payerId).toBeNull();
    expect(r?.memberIds).toEqual(["u2", "u3"]);
  });

  it("returns null when the route fails (e.g. no amount, 502)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(false, { error: "no_amount" })));
    expect(await parseExpense("dinner with Alex", MEMBERS, "u1")).toBeNull();
  });

  it("returns null when the response is missing required fields", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(true, { description: "Dinner" })));
    expect(await parseExpense("dinner", MEMBERS, "u1")).toBeNull();
  });

  it("returns null when the network throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      })
    );
    expect(await parseExpense("dinner", MEMBERS, "u1")).toBeNull();
  });
});
