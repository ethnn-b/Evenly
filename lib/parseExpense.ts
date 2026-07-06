// Client wrapper for natural-language expense entry.
//
// Sends a sentence plus the group's members to /api/parse-expense, which asks an
// open-weight model on Groq to turn it into structured fields. Returns null on
// any failure (unconfigured, network, or unparseable) so the caller can tell the
// user to fill the form by hand. There is no local fallback: unlike the receipt
// name, there is no cheap heuristic for parsing a free-form sentence.

export interface ParseMember {
  id: string;
  name: string;
}

export interface ParsedExpense {
  description: string;
  amountCents: number;
  payerId: string | null;
  memberIds: string[];
}

export async function parseExpense(
  text: string,
  members: ParseMember[],
  currentUserId: string,
  opts?: { signal?: AbortSignal }
): Promise<ParsedExpense | null> {
  try {
    const res = await fetch("/api/parse-expense", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, members, currentUserId }),
      signal: opts?.signal,
    });
    if (!res.ok) return null;

    const data: unknown = await res.json();
    const r = (data ?? {}) as Record<string, unknown>;
    if (typeof r.description !== "string" || typeof r.amountCents !== "number") {
      return null;
    }

    return {
      description: r.description,
      amountCents: r.amountCents,
      payerId: typeof r.payerId === "string" ? r.payerId : null,
      memberIds: Array.isArray(r.memberIds)
        ? r.memberIds.filter((x): x is string => typeof x === "string")
        : [],
    };
  } catch {
    return null;
  }
}
