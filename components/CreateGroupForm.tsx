"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";

// Creates a group and adds the creator as its first member, then refreshes the
// dashboard. Both writes are guarded by RLS: the insert policy on groups checks
// created_by = auth.uid(), and the bootstrap membership insert is allowed
// because the user created the group.
export default function CreateGroupForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setError(null);
    setLoading(true);
    const supabase = createBrowserSupabase();

    const { data: group, error: groupError } = await supabase
      .from("groups")
      .insert({ name: trimmed, created_by: userId })
      .select()
      .single();

    if (groupError || !group) {
      setLoading(false);
      setError(groupError?.message ?? "Could not create the group.");
      return;
    }

    const { error: memberError } = await supabase
      .from("group_members")
      .insert({ group_id: group.id, user_id: userId });

    setLoading(false);
    if (memberError) {
      setError(memberError.message);
      return;
    }

    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New group name"
        maxLength={100}
        className="flex-1 rounded border border-gray-300 px-3 py-2 focus:border-gray-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create"}
      </button>
      {error && <p className="self-center text-sm text-red-600">{error}</p>}
    </form>
  );
}
