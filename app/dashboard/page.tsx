import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabaseServer";
import GroupList from "@/components/GroupList";
import CreateGroupForm from "@/components/CreateGroupForm";
import SignOutButton from "@/components/SignOutButton";
import type { Group } from "@/lib/types";

// Server component. Fetches the signed-in user's groups (RLS only returns
// groups they belong to) and renders the dashboard.
export default async function DashboardPage() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Membership rows for this user, joined to the group. RLS makes the join
  // safe: it can only return groups the user is a member of.
  const { data: rows } = await supabase
    .from("group_members")
    .select("groups (id, name, created_by, created_at)")
    .eq("user_id", user.id);

  const groups: Group[] = (rows ?? [])
    .flatMap((r) => (r.groups ? [r.groups as unknown as Group] : []))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your groups</h1>
          <p className="text-sm text-gray-600">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <section className="mb-8">
        <CreateGroupForm userId={user.id} />
      </section>

      <GroupList groups={groups} />
    </main>
  );
}
