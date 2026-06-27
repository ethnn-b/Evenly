import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabaseClient";
import { computeBalances } from "@/lib/settle";
import { formatCents } from "@/lib/format";
import BalanceList from "@/components/BalanceList";
import AddMemberForm from "@/components/AddMemberForm";
import RealtimeRefresher from "@/components/RealtimeRefresher";
import type {
  Expense,
  ExpenseSplit,
  MemberWithProfile,
  Profile,
} from "@/lib/types";

// Server component for one group: members, expenses, and computed balances.
// All reads are RLS-filtered, so a user who is not a member gets nothing back
// and we 404.
export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: groupId } = await params;
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, created_by, created_at")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) notFound();

  // Members with their profiles.
  const { data: memberRows } = await supabase
    .from("group_members")
    .select("user_id, profiles (id, email, display_name)")
    .eq("group_id", groupId);

  const members: MemberWithProfile[] = (memberRows ?? [])
    .map((r) => {
      const p = r.profiles as unknown as Profile | null;
      return p
        ? { user_id: p.id, email: p.email, display_name: p.display_name }
        : null;
    })
    .filter((m): m is MemberWithProfile => m !== null)
    .sort((a, b) =>
      (a.display_name || a.email).localeCompare(b.display_name || b.email)
    );

  // Expenses for the group, newest first.
  const { data: expenseRows } = await supabase
    .from("expenses")
    .select("id, group_id, payer_id, description, amount_cents, created_by, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });
  const expenses: Expense[] = expenseRows ?? [];

  // Splits for those expenses.
  const expenseIds = expenses.map((e) => e.id);
  let splits: ExpenseSplit[] = [];
  if (expenseIds.length > 0) {
    const { data: splitRows } = await supabase
      .from("expense_splits")
      .select("id, expense_id, user_id, amount_cents")
      .in("expense_id", expenseIds);
    splits = splitRows ?? [];
  }

  const balances = computeBalances(
    expenses.map((e) => ({ user_id: e.payer_id, amount_cents: e.amount_cents })),
    splits.map((s) => ({ user_id: s.user_id, amount_cents: s.amount_cents }))
  )
    // Make sure every member appears, even at zero.
    .concat(
      members
        .filter((m) => !expenses.some((e) => e.payer_id === m.user_id))
        .filter((m) => !splits.some((s) => s.user_id === m.user_id))
        .map((m) => ({ user_id: m.user_id, net_cents: 0 }))
    )
    .sort((a, b) => b.net_cents - a.net_cents);

  const nameOf = (id: string) => {
    const m = members.find((x) => x.user_id === id);
    return m ? m.display_name || m.email : "Unknown";
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <RealtimeRefresher groupId={groupId} />

      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:underline">
          &larr; All groups
        </Link>
      </div>

      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{group.name}</h1>
        <Link
          href={`/group/${groupId}/add-expense`}
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
        >
          Add expense
        </Link>
      </header>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Members
        </h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {members.map((m) => (
            <span
              key={m.user_id}
              className="rounded-full bg-gray-100 px-3 py-1 text-sm"
            >
              {m.display_name || m.email}
            </span>
          ))}
        </div>
        <AddMemberForm groupId={groupId} />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Balances
        </h2>
        <BalanceList members={members} balances={balances} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Expenses
        </h2>
        {expenses.length === 0 ? (
          <p className="rounded border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            No expenses yet. Add one to get started.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded border border-gray-200 bg-white">
            {expenses.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="font-medium">{e.description}</p>
                  <p className="text-sm text-gray-500">
                    {nameOf(e.payer_id)} paid
                  </p>
                </div>
                <span className="tabular-nums font-medium">
                  {formatCents(e.amount_cents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
