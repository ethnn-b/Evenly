// POST /api/suggest-expense
//
// Turns raw receipt OCR text into a short expense name and a category, using an
// open-weight model hosted on Groq (Llama 3.x by default). This runs on the
// server so the API key never reaches the browser; the client calls it through
// lib/suggestExpense.ts, which falls back to the local heuristic name when this
// route is unavailable or unconfigured.
//
// Config (see .env.example):
//   GROQ_API_KEY   required to enable the route; without it we return 503 and
//                  the client uses the heuristic instead.
//   GROQ_MODEL     optional model override (defaults to llama-3.3-70b-versatile).

import { NextResponse } from "next/server";
import { cleanName } from "@/lib/expenseName";
import { coerceCategory, EXPENSE_CATEGORIES } from "@/lib/categories";
import { majorToCents } from "@/lib/format";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

// Cap the OCR text we send so a huge scan cannot run up tokens or latency.
const MAX_INPUT_CHARS = 4000;
// Groq is usually sub-second; bail if the upstream stalls so the serverless
// function does not hang and the client can fall back promptly.
const UPSTREAM_TIMEOUT_MS = 8000;

const SYSTEM_PROMPT = `You label shared expenses from receipt OCR text, which may be noisy or misread.

Return a JSON object with exactly three keys:
- "name": a short human title for the expense, 2-4 words, Title Case. Prefer the merchant or what was bought (e.g. "Dinner at Olive Garden", "Shell Gas", "Trader Joe's"). No addresses, phone numbers, receipt numbers, dates, or prices.
- "category": exactly one of ${EXPENSE_CATEGORIES.join(", ")}. Use "Other" if unsure.
- "total": the grand total actually payable as a number (e.g. 42.40), including tax and tip. This is the amount due, not the subtotal or a per-tax-band figure. Use null if no total is legible.

Respond with JSON only, no prose.`;

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    // Not configured: tell the client to use its local fallback.
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let rawText = "";
  try {
    const body = await req.json();
    if (typeof body?.rawText === "string") rawText = body.rawText;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const text = rawText.trim().slice(0, MAX_INPUT_CHARS);
  if (!text) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

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
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 80,
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

    // response_format: json_object guarantees valid JSON, but parse defensively.
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }

    const record = (parsed ?? {}) as Record<string, unknown>;
    // Reuse the same cleanup the heuristic uses (strip junk, cap length).
    const name = cleanName(typeof record.name === "string" ? record.name : "");
    if (!name) {
      // Model returned nothing usable; let the client fall back.
      return NextResponse.json({ error: "no_name" }, { status: 502 });
    }

    return NextResponse.json({
      name,
      category: coerceCategory(record.category),
      totalCents: majorToCents(record.total), // null when not legible
    });
  } catch {
    // Timeout (abort) or network error.
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
