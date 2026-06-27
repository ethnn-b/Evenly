"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";

// Subscribes to expense and split changes for one group and refreshes the
// server-rendered page when anything changes, so a group page updates live
// across clients (milestone 9). It re-fetches via router.refresh() rather than
// patching state, which keeps the balance math in one place (the server).
export default function RealtimeRefresher({ groupId }: { groupId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`group-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
          filter: `group_id=eq.${groupId}`,
        },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expense_splits" },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, router]);

  return null;
}
