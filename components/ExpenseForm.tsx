"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import {
  dollarsToCents,
  splitEvenly,
  parseSharesToCents,
  formatCents,
} from "@/lib/format";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import ReceiptUpload from "./ReceiptUpload";
import { parseExpense } from "@/lib/parseExpense";
import type { MemberWithProfile } from "@/lib/types";

type SplitMode = "equal" | "unequal";

// Add an expense: who paid, how much, and how it splits across the selected
// members. Two split modes: an even split, or an unequal split where you type
// the amount each member owes (their shares must add up to the total). Accepts
// prefill values from receipt OCR (the amount, mostly). On submit it inserts the
// expense and one expense_splits row per selected member.
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
  // True once the user edits the description by hand. Until then, receipt
  // suggestions (the instant heuristic, then the model upgrade) may fill it;
  // after, the user's text is left alone.
  const [descTouched, setDescTouched] = useState(false);
  const [amount, setAmount] = useState(""); // total, in major units as typed
  const [payerId, setPayerId] = useState(currentUserId);
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(members.map((m) => m.user_id))
  );
  // Per-member custom shares (major-unit strings), used in unequal mode.
  const [shares, setShares] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Natural-language quick add.
  const [nlText, setNlText] = useState("");
  const [nlLoading, setNlLoading] = useState(false);
  const [nlError, setNlError] = useState<string | null>(null);

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function setShare(userId: string, value: string) {
    setShares((prev) => ({ ...prev, [userId]: value }));
  }

  function nameOf(m: MemberWithProfile) {
    return m.display_name || m.email;
  }

  const selectedMembers = members.filter((m) => selected.has(m.user_id));

  // Live totals shown under the unequal split so you can see what is left to
  // assign as you type.
  const totalCents = dollarsToCents(amount) ?? 0;
  const assignedCents = selectedMembers.reduce(
    (sum, m) => sum + (dollarsToCents(shares[m.user_id] ?? "") ?? 0),
    0
  );
  const remainingCents = totalCents - assignedCents;

  // Prefill each selected member's share with an even split, as a starting
  // point to tweak in unequal mode.
  function fillEqually() {
    const total = dollarsToCents(amount);
    if (total === null || selectedMembers.length === 0) return;
    const even = splitEvenly(total, selectedMembers.length);
    setShares((prev) => {
      const next = { ...prev };
      selectedMembers.forEach((m, i) => {
        next[m.user_id] = (even[i] / 100).toFixed(2);
      });
      return next;
    });
  }

  // Natural-language quick add: send the sentence plus the member list to the
  // model and prefill the form from what comes back. Member names resolve to
  // real ids server-side. No local fallback (a sentence needs the model), so on
  // failure we ask the user to fill the form by hand.
  async function onParseNl() {
    const text = nlText.trim();
    if (!text) return;
    setNlError(null);
    setNlLoading(true);
    const result = await parseExpense(
      text,
      members.map((m) => ({ id: m.user_id, name: nameOf(m) })),
      currentUserId
    );
    setNlLoading(false);
    if (!result) {
      setNlError("Could not read that. Add it in the form below, or rephrase.");
      return;
    }
    setDescription(result.description);
    setDescTouched(true);
    setAmount((result.amountCents / 100).toFixed(2));
    if (result.payerId) setPayerId(result.payerId);
    if (result.memberIds.length > 0) setSelected(new Set(result.memberIds));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amountCents = dollarsToCents(amount);
    if (!description.trim()) return setError("Add a description.");
    if (amountCents === null || amountCents <= 0)
      return setError("Enter a valid amount.");
    if (selectedMembers.length === 0)
      return setError("Select at least one member to split between.");

    // Work out each selected member's share for the chosen split mode.
    let shareCents: number[];
    if (splitMode === "equal") {
      shareCents = splitEvenly(amountCents, selectedMembers.length);
    } else {
      const parsed = parseSharesToCents(
        selectedMembers.map((m) => shares[m.user_id] ?? "")
      );
      if (parsed === null)
        return setError("Enter a valid amount for each selected member.");
      const sum = parsed.reduce((a, b) => a + b, 0);
      if (sum !== amountCents)
        return setError(
          `Shares add up to ${formatCents(sum)} but the total is ${formatCents(
            amountCents
          )}. Adjust so they match.`
        );
      shareCents = parsed;
    }

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

    const rows = selectedMembers.map((m, i) => ({
      expense_id: expense.id,
      user_id: m.user_id,
      amount_cents: shareCents[i],
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
      <div className="rounded border border-gray-200 bg-white p-4">
        <label htmlFor="nl" className="mb-2 block text-sm font-medium">
          Quick add (describe it)
        </label>
        <div className="flex gap-2">
          <input
            id="nl"
            type="text"
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onParseNl();
              }
            }}
            placeholder={'e.g. "I paid 800 for dinner, split with Alex and Sam"'}
            className="flex-1 rounded border border-gray-300 px-3 py-2 focus:border-gray-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onParseNl}
            disabled={nlLoading || !nlText.trim()}
            className="rounded bg-gray-900 px-3 py-2 text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {nlLoading ? "Reading..." : "Parse"}
          </button>
        </div>
        {nlError && <p className="mt-2 text-sm text-red-600">{nlError}</p>}
        <p className="mt-2 text-xs text-gray-500">
          Fills the form below from a sentence. Check it before saving.
        </p>
      </div>

      <ReceiptUpload
        onParsed={({ total }) => {
          if (total !== null) setAmount((total / 100).toFixed(2));
        }}
        onNamed={(name) => {
          if (!descTouched) setDescription(name);
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
            onChange={(e) => {
              setDescription(e.target.value);
              setDescTouched(true);
            }}
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
          <p className="mt-1 text-xs text-gray-500">
            Total for the expense, in {DEFAULT_CURRENCY.code}. If you scanned a
            receipt this is prefilled from it; edit if it read the wrong number.
          </p>
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
          <legend className="mb-1 block text-sm font-medium">Split</legend>

          <div className="mb-2 inline-flex rounded border border-gray-300 p-0.5 text-sm">
            {(["equal", "unequal"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSplitMode(mode)}
                className={`rounded px-3 py-1 ${
                  splitMode === mode
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {mode === "equal" ? "Equally" : "Unequally"}
              </button>
            ))}
          </div>

          <div className="space-y-1 rounded border border-gray-200 p-3">
            {members.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(m.user_id)}
                    onChange={() => toggle(m.user_id)}
                  />
                  {nameOf(m)}
                </label>

                {splitMode === "unequal" && selected.has(m.user_id) && (
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">
                      {DEFAULT_CURRENCY.symbol}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`${nameOf(m)} owes`}
                      value={shares[m.user_id] ?? ""}
                      onChange={(e) => setShare(m.user_id, e.target.value)}
                      placeholder="0.00"
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-right focus:border-gray-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {splitMode === "unequal" && (
            <div className="mt-2 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={fillEqually}
                className="text-gray-600 underline hover:text-gray-900"
              >
                Fill equally
              </button>
              <span
                className={
                  remainingCents === 0 ? "text-green-700" : "text-gray-600"
                }
              >
                {`Assigned ${formatCents(assignedCents)} of ${formatCents(
                  totalCents
                )} `}
                {remainingCents === 0
                  ? "(balanced)"
                  : `(${formatCents(Math.abs(remainingCents))} ${
                      remainingCents > 0 ? "left" : "over"
                    })`}
              </span>
            </div>
          )}
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
