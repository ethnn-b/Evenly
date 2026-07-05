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

    // This supabase-js version passes the client's token getter to the realtime
    // client without binding `this`, so realtime's heartbeat setAuth() calls it
    // with `this` = the realtime client, where accessToken points back at itself
    // and recurses ("Maximum call stack size exceeded"). Replace it with a
    // correctly-bound getter, which also keeps the socket token fresh.
    supabase.realtime.accessToken = async () =>
      (await supabase.auth.getSession()).data.session?.access_token ?? null;

    // Dev-only tracing so we can tell a subscribe failure (status !=
    // SUBSCRIBED) apart from events never arriving (subscribed, no payloads).
    const debug = process.env.NODE_ENV !== "production";
    const onChange = (table: string) => (payload: { eventType: string }) => {
      if (debug) console.log(`[realtime] ${table} ${payload.eventType}`);
      router.refresh();
    };

    // Realtime must present the user's access token. Otherwise postgres_changes
    // on our RLS-protected tables is evaluated as the anon role and every event
    // is filtered out: the channel still reports SUBSCRIBED, but nothing ever
    // arrives. The browser client does not reliably propagate the cookie session
    // to the socket before we subscribe, so set the token explicitly first.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      } else if (debug) {
        console.log("[realtime] no session; socket is anon, RLS will hide events");
      }

      channel = supabase
        .channel(`group-${groupId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "expenses",
            filter: `group_id=eq.${groupId}`,
          },
          onChange("expenses")
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "expense_splits" },
          onChange("expense_splits")
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "settlements",
            filter: `group_id=eq.${groupId}`,
          },
          onChange("settlements")
        )
        .subscribe((status, err) => {
          if (debug) console.log("[realtime] channel status:", status, err ?? "");
        });
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [groupId, router]);

  return null;
}
