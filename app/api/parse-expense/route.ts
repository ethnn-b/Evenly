// POST /api/parse-expense
//
// Turns a natural-language expense ("I paid 800 for dinner, split with Alex and
// Sam") into structured fields the add-expense form can prefill: a description,
// an amount, who paid, and who shares it. Member names are resolved against the
// group's actual members, and the model may only return ids from that list;
// anything off-list is dropped server-side, so it cannot invent a member.
//
// Runs on the server so the Groq key stays off the client. There is no local
// fallback for this one (unlike the receipt name): parsing a sentence needs the
// model, so when it is unavailable the client just asks the user to fill the
// form by hand. Config is the same GROQ_API_KEY / GROQ_MODEL as suggest-expense.

import { NextResponse } from "next/server";
import { cleanName } from "@/lib/expenseName";
import { majorToCents } from "@/lib/format";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

const MAX_TEXT_CHARS = 500;
const MAX_MEMBERS = 50;
const UPSTREAM_TIMEOUT_MS = 8000;

interface Member {
  id: string;
  name: string;
}

const SYSTEM_PROMPT = `You convert a short natural-language description of a shared expense into structured JSON.

You are given the sentence, the group's members as a list of {id, name}, and the id of the speaker (the person meant by "I", "me", "my").

Return a JSON object with exactly these keys:
- "description": a short title for the expense, 2-4 words, Title Case (e.g. "Dinner", "Groceries", "Uber Ride").
- "amount": the total as a number in main currency units (e.g. 800 or 42.50). Ignore any currency symbol. Use 0 if no amount is stated.
- "payer_id": the id of the member who paid. If the sentence says "I paid" (or similar), use the speaker's id. If unclear, null.
- "member_ids": the ids of everyone who shares the cost. Match named people to member names. Include the payer unless they are clearly excluded. If no people are named, use every member.

Only use ids that appear in the members list. Respond with JSON only, no prose.`;

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let text = "";
  let members: Member[] = [];
  let currentUserId = "";
  try {
    const body = await req.json();
    if (typeof body?.text === "string") text = body.text;
    if (typeof body?.currentUserId === "string") currentUserId = body.currentUserId;
    if (Array.isArray(body?.members)) {
      members = body.members
        .filter(
          (m: unknown): m is Member =>
            typeof (m as Member)?.id === "string" &&
            typeof (m as Member)?.name === "string"
        )
        .slice(0, MAX_MEMBERS);
    }
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  text = text.trim().slice(0, MAX_TEXT_CHARS);
  if (!text || members.length === 0) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const idSet = new Set(members.map((m) => m.id));
  const userMessage = [
    `Members: ${JSON.stringify(members.map((m) => ({ id: m.id, name: m.name })))}`,
    `Speaker id: ${currentUserId || "unknown"}`,
    `Expense: ${text}`,
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 200,
      }),
      signal: controller.signal,
    });

    if (!groqRes.ok) {
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }

    const data = await groqRes.json();
    const content: unknown = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }

    const record = (parsed ?? {}) as Record<string, unknown>;

    const amountCents = majorToCents(record.amount);
    if (amountCents == null) {
      // Without an amount there is nothing useful to prefill.
      return NextResponse.json({ error: "no_amount" }, { status: 502 });
    }

    const description =
      cleanName(typeof record.description === "string" ? record.description : "") ||
      "Expense";

    const payerId =
      typeof record.payer_id === "string" && idSet.has(record.payer_id)
        ? record.payer_id
        : null;

    // Keep only real member ids; fall back to everyone if none matched.
    let memberIds = Array.isArray(record.member_ids)
      ? [
          ...new Set(
            record.member_ids.filter(
              (x: unknown): x is string => typeof x === "string" && idSet.has(x)
            )
          ),
        ]
      : [];
    if (memberIds.length === 0) memberIds = members.map((m) => m.id);

    return NextResponse.json({ description, amountCents, payerId, memberIds });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
