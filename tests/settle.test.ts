import { describe, it, expect } from "vitest";
import { computeBalances, settle } from "../lib/settle";
import type { MemberBalance, SettlementTransaction } from "../lib/types";

// Helpers ---------------------------------------------------------------------

function sumBalances(balances: MemberBalance[]): number {
  return balances.reduce((acc, b) => acc + b.net_cents, 0);
}

// Replay the suggested transactions against the starting balances and assert
// everyone lands exactly at zero. This is the real correctness property: the
// settlement is valid if applying it clears every balance.
function assertSettles(
  balances: MemberBalance[],
  txns: SettlementTransaction[]
) {
  const running = new Map(balances.map((b) => [b.user_id, b.net_cents]));
  for (const t of txns) {
    // debtor pays, so their (negative) balance rises toward zero
    running.set(t.from, (running.get(t.from) ?? 0) + t.amount_cents);
    // creditor is paid, so their (positive) balance falls toward zero
    running.set(t.to, (running.get(t.to) ?? 0) - t.amount_cents);
  }
  for (const [, v] of running) {
    expect(v).toBe(0);
  }
}

// computeBalances -------------------------------------------------------------

describe("computeBalances", () => {
  it("nets payments against shares and sums to zero", () => {
    // Alice paid 30.00 for dinner, split evenly three ways (10.00 each).
    const balances = computeBalances(
      [{ user_id: "alice", amount_cents: 3000 }],
      [
        { user_id: "alice", amount_cents: 1000 },
        { user_id: "bob", amount_cents: 1000 },
        { user_id: "carol", amount_cents: 1000 },
      ]
    );

    const byId = Object.fromEntries(balances.map((b) => [b.user_id, b.net_cents]));
    expect(byId.alice).toBe(2000); // paid 3000, owes 1000 -> +2000
    expect(byId.bob).toBe(-1000);
    expect(byId.carol).toBe(-1000);
    expect(sumBalances(balances)).toBe(0);
  });

  it("handles a user who only owes and never paid", () => {
    const balances = computeBalances(
      [{ user_id: "alice", amount_cents: 5000 }],
      [
        { user_id: "alice", amount_cents: 2500 },
        { user_id: "bob", amount_cents: 2500 },
      ]
    );
    const byId = Object.fromEntries(balances.map((b) => [b.user_id, b.net_cents]));
    expect(byId.alice).toBe(2500);
    expect(byId.bob).toBe(-2500);
  });
});

// settle ----------------------------------------------------------------------

describe("settle", () => {
  it("returns no transactions when everyone is already at zero", () => {
    const txns = settle([
      { user_id: "a", net_cents: 0 },
      { user_id: "b", net_cents: 0 },
    ]);
    expect(txns).toEqual([]);
  });

  it("returns no transactions for an empty group", () => {
    expect(settle([])).toEqual([]);
  });

  it("settles a single debtor and single creditor in one payment", () => {
    const balances: MemberBalance[] = [
      { user_id: "alice", net_cents: 2000 },
      { user_id: "bob", net_cents: -2000 },
    ];
    const txns = settle(balances);
    expect(txns).toHaveLength(1);
    expect(txns[0]).toEqual({ from: "bob", to: "alice", amount_cents: 2000 });
    assertSettles(balances, txns);
  });

  it("settles the dinner example (one creditor, two debtors)", () => {
    const balances: MemberBalance[] = [
      { user_id: "alice", net_cents: 2000 },
      { user_id: "bob", net_cents: -1000 },
      { user_id: "carol", net_cents: -1000 },
    ];
    const txns = settle(balances);
    assertSettles(balances, txns);
    // 3 people with nonzero balances -> at most 2 payments.
    expect(txns.length).toBeLessThanOrEqual(2);
  });

  it("never exceeds (members - 1) transactions", () => {
    // 6 members, a tangled web of debts that nets to zero.
    const balances: MemberBalance[] = [
      { user_id: "a", net_cents: 500 },
      { user_id: "b", net_cents: 1500 },
      { user_id: "c", net_cents: -300 },
      { user_id: "d", net_cents: -700 },
      { user_id: "e", net_cents: 1000 },
      { user_id: "f", net_cents: -2000 },
    ];
    expect(sumBalances(balances)).toBe(0);

    const txns = settle(balances);
    assertSettles(balances, txns);
    expect(txns.length).toBeLessThanOrEqual(balances.length - 1);
  });

  it("produces only positive integer amounts", () => {
    const balances: MemberBalance[] = [
      { user_id: "a", net_cents: 333 },
      { user_id: "b", net_cents: 333 },
      { user_id: "c", net_cents: -666 },
    ];
    const txns = settle(balances);
    assertSettles(balances, txns);
    for (const t of txns) {
      expect(t.amount_cents).toBeGreaterThan(0);
      expect(Number.isInteger(t.amount_cents)).toBe(true);
    }
  });

  it("collapses a 6-debt cycle into fewer payments (the resume metric)", () => {
    // Imagine 6 pairwise IOUs floating around a group; after netting, the
    // balances below remain. Greedy settles them in at most 3 payments.
    const balances: MemberBalance[] = [
      { user_id: "a", net_cents: 1000 },
      { user_id: "b", net_cents: 2000 },
      { user_id: "c", net_cents: 1500 },
      { user_id: "d", net_cents: -1500 },
      { user_id: "e", net_cents: -1000 },
      { user_id: "f", net_cents: -2000 },
    ];
    const txns = settle(balances);
    assertSettles(balances, txns);
    expect(txns.length).toBeLessThanOrEqual(5);
  });
});
