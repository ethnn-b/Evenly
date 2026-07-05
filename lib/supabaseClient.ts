// Browser-side Supabase client, for use inside client components ("use
// client"). The server-side client lives in lib/supabaseServer.ts because it
// imports next/headers, which cannot be reached from a client bundle.
//
// The anon key is public on purpose. RLS in the database is what protects data,
// not secrecy of the key.

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser client for use inside client components. Reads and writes the session
 * from cookies the middleware keeps in sync.
 */
export function createBrowserSupabase() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
