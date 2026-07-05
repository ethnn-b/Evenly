"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";

// Adds a member to a group by their email. We look the email up in profiles
// (readable by any authenticated user) to get their user id, then insert a
// membership row. The person must already have a Evenly account.
export default function AddMemberForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) return;

    setError(null);
    setLoading(true);
    const supabase = createBrowserSupabase();

    const { data: profile, error: lookupError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", target)
      .maybeSingle();

    if (lookupError) {
      setLoading(false);
      setError(lookupError.message);
      return;
    }
    if (!profile) {
      setLoading(false);
      setError("No account found with that email.");
      return;
    }

    const { error: insertError } = await supabase
      .from("group_members")
      .insert({ group_id: groupId, user_id: profile.id });

    setLoading(false);
    if (insertError) {
      // Unique violation means they are already in the group.
      setError(
        insertError.code === "23505"
          ? "That person is already in the group."
          : insertError.message
      );
      return;
    }

    setEmail("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Add member by email"
        className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={loading || !email.trim()}
        className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
      >
        {loading ? "Adding..." : "Add"}
      </button>
      {error && <p className="self-center text-sm text-red-600">{error}</p>}
    </form>
  );
}
