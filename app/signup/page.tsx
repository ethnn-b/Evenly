"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName.trim() || email.split("@")[0] },
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }

    // If email confirmation is on, there is no active session yet. Tell the
    // user to confirm. If it is off, we have a session and can go straight in.
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setNotice(
        "Account created. Check your email to confirm, then sign in."
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold">Create an account</h1>
      <p className="mb-6 text-sm text-gray-600">
        Split expenses with your group.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium">
            Display name
          </label>
          <input
            id="name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="optional"
            className="w-full rounded border border-gray-300 px-3 py-2 focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 focus:border-gray-500 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-green-700">{notice}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-gray-900 px-3 py-2 text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-sm text-gray-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-gray-900 underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
