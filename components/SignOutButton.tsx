"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
    >
      Sign out
    </button>
  );
}
