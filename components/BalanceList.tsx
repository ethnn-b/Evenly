"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { settle } from "@/lib/settle";
import { formatCents } from "@/lib/format";
import type {
  MemberBalance,
  MemberWithProfile,
  SettlementTransaction,
} from "@/lib/types";

// Shows each member's net position and, on demand, the settle-up suggestions
// from the greedy algorithm. Each suggested payment the current user owes has a
// "Mark as paid" button that records a settlement; balances fold that in and
// drop toward zero. No money moves, it just records that the payment happened.
export default function BalanceList({
  members,
  balances,
  groupId,
  currentUserId,
}: {
  members: MemberWithProfile[];
  balances: MemberBalance[];
  groupId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [showSettlement, setShowSettlement] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameOf = useMemo(() => {
    const map = new Map(
      members.map((m) => [m.user_id, m.display_name || m.email])
    );
    return (id: string) => map.get(id) ?? "Unknown";
  }, [members]);

  const transactions = useMemo(() => settle(balances), [balances]);

  const allSettled = balances.every((b) => b.net_cents === 0);

  const keyOf = (t: SettlementTransaction) =>
    `${t.from}-${t.to}-${t.amount_cents}`;

  async function markPaid(t: SettlementTransaction) {
    setError(null);
    setPending(keyOf(t));
    const supabase = createBrowserSupabase();
    const { error: insertError } = await supabase.from("settlements").insert({
      group_id: groupId,
      from_user: t.from,
      to_user: t.to,
      amount_cents: t.amount_cents,
      created_by: currentUserId,
    });
    setPending(null);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    // Realtime will update other clients; refresh this one right away.
    router.refresh();
  }

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

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {showSettlement && !allSettled && (
          <div className="mt-4">
            <p className="mb-2 text-sm text-gray-600">
              {transactions.length} payment
              {transactions.length === 1 ? "" : "s"} settles the group:
            </p>
            <ul className="space-y-2 text-sm">
              {transactions.map((t) => {
                const mine = t.from === currentUserId;
                return (
                  <li key={keyOf(t)} className="flex items-center gap-2">
                    <span className="font-medium">{nameOf(t.from)}</span>
                    <span className="text-gray-400">pays</span>
                    <span className="font-medium">{nameOf(t.to)}</span>
                    <span className="ml-auto tabular-nums">
                      {formatCents(t.amount_cents)}
                    </span>
                    {mine && (
                      <button
                        onClick={() => markPaid(t)}
                        disabled={pending === keyOf(t)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50"
                      >
                        {pending === keyOf(t) ? "Saving..." : "Mark as paid"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
