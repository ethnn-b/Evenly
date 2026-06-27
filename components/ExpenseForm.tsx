"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { dollarsToCents, splitEvenly } from "@/lib/format";
import ReceiptUpload from "./ReceiptUpload";
import type { MemberWithProfile } from "@/lib/types";

// Add an expense: who paid, how much, and an even split across the selected
// members. Accepts prefill values from receipt OCR (the amount, mostly). On
// submit it inserts the expense and one expense_splits row per selected member,
// with the even-split remainder spread one cent at a time so shares sum exactly
// to the amount.
export default function ExpenseForm({
  groupId,
  members,
  currentUserId,
}: {
  groupId: string;
  members: MemberWithProfile[];
  currentUserId: string;
}) {
  const router = useRouter();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(""); // dollars, as typed
  const [payerId, setPayerId] = useState(currentUserId);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(members.map((m) => m.user_id))
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function nameOf(m: MemberWithProfile) {
    return m.display_name || m.email;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amountCents = dollarsToCents(amount);
    if (!description.trim()) return setError("Add a description.");
    if (amountCents === null || amountCents <= 0)
      return setError("Enter a valid amount.");
    const splitUsers = members.filter((m) => selected.has(m.user_id));
    if (splitUsers.length === 0)
      return setError("Select at least one member to split between.");

    setLoading(true);
    const supabase = createBrowserSupabase();

    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .insert({
        group_id: groupId,
        payer_id: payerId,
        description: description.trim(),
        amount_cents: amountCents,
        created_by: currentUserId,
      })
      .select()
      .single();

    if (expenseError || !expense) {
      setLoading(false);
      setError(expenseError?.message ?? "Could not save the expense.");
      return;
    }

    const shares = splitEvenly(amountCents, splitUsers.length);
    const rows = splitUsers.map((m, i) => ({
      expense_id: expense.id,
      user_id: m.user_id,
      amount_cents: shares[i],
    }));

    const { error: splitError } = await supabase
      .from("expense_splits")
      .insert(rows);

    setLoading(false);
    if (splitError) {
      setError(splitError.message);
      return;
    }

    router.push(`/group/${groupId}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <ReceiptUpload
        onParsed={({ total }) => {
          if (total !== null) setAmount((total / 100).toFixed(2));
        }}
      />

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="desc" className="mb-1 block text-sm font-medium">
            Description
          </label>
          <input
            id="desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            placeholder="Dinner, groceries, ..."
            className="w-full rounded border border-gray-300 px-3 py-2 focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="amount" className="mb-1 block text-sm font-medium">
            Amount
          </label>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded border border-gray-300 px-3 py-2 focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="payer" className="mb-1 block text-sm font-medium">
            Paid by
          </label>
          <select
            id="payer"
            value={payerId}
            onChange={(e) => setPayerId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 focus:border-gray-500 focus:outline-none"
          >
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {nameOf(m)}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="mb-1 block text-sm font-medium">
            Split evenly between
          </legend>
          <div className="space-y-1 rounded border border-gray-200 p-3">
            {members.map((m) => (
              <label key={m.user_id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(m.user_id)}
                  onChange={() => toggle(m.user_id)}
                />
                {nameOf(m)}
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-gray-900 px-3 py-2 text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Add expense"}
        </button>
      </form>
    </div>
  );
}
