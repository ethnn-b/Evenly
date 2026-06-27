// Server-side Supabase client, for server components and route handlers.
// Bound to the request cookies via next/headers. Kept in its own file so the
// next/headers import never reaches a client bundle (Next forbids that).
//
// In a pure server component the cookie store is read-only, so the setAll
// handler is wrapped in try/catch; the middleware is what actually refreshes
// and persists the session cookie.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a server component where cookies are read-only.
          // Safe to ignore: middleware refreshes the session.
        }
      },
    },
  });
}
