"use client";

import { useMemo, useState } from "react";
import { settle } from "@/lib/settle";
import { formatCents } from "@/lib/format";
import type { MemberBalance, MemberWithProfile } from "@/lib/types";

// Shows each member's net position and, on demand, the settle-up suggestions
// from the greedy algorithm. The settlement runs client side on the balances
// passed in: no money moves, it just lists who should pay whom.
export default function BalanceList({
  members,
  balances,
}: {
  members: MemberWithProfile[];
  balances: MemberBalance[];
}) {
  const [showSettlement, setShowSettlement] = useState(false);

  const nameOf = useMemo(() => {
    const map = new Map(
      members.map((m) => [m.user_id, m.display_name || m.email])
    );
    return (id: string) => map.get(id) ?? "Unknown";
  }, [members]);

  const transactions = useMemo(() => settle(balances), [balances]);

  const allSettled = balances.every((b) => b.net_cents === 0);

  return (
    <div className="rounded border border-gray-200 bg-white">
      <ul className="divide-y divide-gray-100">
        {balances.map((b) => {
          const owed = b.net_cents > 0;
          const owes = b.net_cents < 0;
          return (
            <li
              key={b.user_id}
              className="flex items-center justify-between px-4 py-3"
            >
              <span>{nameOf(b.user_id)}</span>
              <span
                className={
                  owed
                    ? "font-medium text-green-700"
                    : owes
                      ? "font-medium text-red-600"
                      : "text-gray-500"
                }
              >
                {owed && "is owed "}
                {owes && "owes "}
                {b.net_cents === 0 ? "settled" : formatCents(Math.abs(b.net_cents))}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-gray-200 p-4">
        {allSettled ? (
          <p className="text-sm text-gray-500">Everyone is settled up.</p>
        ) : (
          <button
            onClick={() => setShowSettlement((v) => !v)}
            className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
          >
            {showSettlement ? "Hide settle up" : "Settle up"}
          </button>
        )}

        {showSettlement && !allSettled && (
          <div className="mt-4">
            <p className="mb-2 text-sm text-gray-600">
              {transactions.length} payment
              {transactions.length === 1 ? "" : "s"} settles the group:
            </p>
            <ul className="space-y-1 text-sm">
              {transactions.map((t, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="font-medium">{nameOf(t.from)}</span>
                  <span className="text-gray-400">pays</span>
                  <span className="font-medium">{nameOf(t.to)}</span>
                  <span className="ml-auto tabular-nums">
                    {formatCents(t.amount_cents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
