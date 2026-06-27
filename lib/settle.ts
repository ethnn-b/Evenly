// Debt simplification.
//
// Input: each member's net balance in cents. Positive means the group owes
// them money (a creditor); negative means they owe the group (a debtor). The
// balances must sum to zero, which they do by construction when they come from
// expenses (every dollar paid is a dollar owed by someone).
//
// Output: a small set of payments that settles everyone. We use the greedy
// heuristic: repeatedly take the largest creditor and the largest debtor, move
// the smaller of the two amounts between them, and repeat. This does not always
// hit the theoretical minimum number of transactions (that problem is NP-hard),
// but it is fast, easy to reason about, and produces at most (n - 1) payments
// for n people with nonzero balances. See docs/design-decisions.md.

import type { MemberBalance, SettlementTransaction } from "./types";

/**
 * Compute net balances from expenses and their splits.
 *
 * For each expense: the payer is credited the full amount, and every member is
 * debited their share. The result per user is (paid - owed). Sums to zero.
 *
 * @param payments  list of { user_id, amount_cents } the user paid out
 * @param shares    list of { user_id, amount_cents } the user owes
 */
export function computeBalances(
  payments: { user_id: string; amount_cents: number }[],
  shares: { user_id: string; amount_cents: number }[]
): MemberBalance[] {
  const net = new Map<string, number>();

  for (const p of payments) {
    net.set(p.user_id, (net.get(p.user_id) ?? 0) + p.amount_cents);
  }
  for (const s of shares) {
    net.set(s.user_id, (net.get(s.user_id) ?? 0) - s.amount_cents);
  }

  return [...net.entries()].map(([user_id, net_cents]) => ({
    user_id,
    net_cents,
  }));
}

/**
 * Greedy settlement. Returns the suggested payments.
 *
 * Members with a zero balance are ignored. The returned amounts are always
 * positive integers (cents).
 */
export function settle(balances: MemberBalance[]): SettlementTransaction[] {
  // Work on copies so we do not mutate the caller's data.
  const creditors = balances
    .filter((b) => b.net_cents > 0)
    .map((b) => ({ user_id: b.user_id, amount: b.net_cents }));
  const debtors = balances
    .filter((b) => b.net_cents < 0)
    .map((b) => ({ user_id: b.user_id, amount: -b.net_cents })); // store as positive owed

  // Largest first. Heaps would be asymptotically better, but groups are small
  // and re-sorting each round keeps the code obvious.
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions: SettlementTransaction[] = [];

  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];

    const amount = Math.min(creditor.amount, debtor.amount);
    if (amount > 0) {
      transactions.push({
        from: debtor.user_id,
        to: creditor.user_id,
        amount_cents: amount,
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    // Whoever hit zero moves on. Because we always settle the smaller side
    // fully, at least one pointer advances each iteration, so this terminates.
    if (creditor.amount === 0) ci += 1;
    if (debtor.amount === 0) di += 1;
  }

  return transactions;
}
