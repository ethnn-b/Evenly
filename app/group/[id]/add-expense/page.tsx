import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabaseClient";
import ExpenseForm from "@/components/ExpenseForm";
import type { MemberWithProfile, Profile } from "@/lib/types";

// Add-expense page: fetches the group's members on the server and hands them to
// the ExpenseForm (which is a client component because of OCR and form state).
export default async function AddExpensePage({
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
    .select("id, name")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) notFound();

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

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="mb-6">
        <Link
          href={`/group/${groupId}`}
          className="text-sm text-gray-500 hover:underline"
        >
          &larr; Back to {group.name}
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-semibold">Add an expense</h1>

      <ExpenseForm
        groupId={groupId}
        members={members}
        currentUserId={user.id}
      />
    </main>
  );
}
