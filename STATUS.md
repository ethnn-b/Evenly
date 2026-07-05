# Status

Updated: 2026-07-06
Phase: done
Progress: 10/10 milestones

## Milestones
- [x] Create the Supabase project, get URL and anon key into .env.local
- [x] Apply schema.sql: tables, RLS policies, storage bucket
- [x] Auth: signup, login, logout, a protected dashboard route
- [x] Groups and members
- [x] Expenses and even splits
- [x] Balances: net position per member
- [x] Settlement algorithm plus settle-up UI
- [x] Receipt upload and OCR prefill
- [x] Realtime expense updates across clients
- [x] Deploy to Vercel, verify end to end

## Current state
Full v1 app is built and runs. 33 unit tests pass (settlement, OCR parser, money
formatting) and 17 live checks pass against the Supabase project (signup +
profile trigger, group bootstrap, members, expenses, even splits, balance math,
and RLS isolation: a non-member is blocked from reading or joining a group).

Verified live: milestones 1-6.
Verified by unit tests + code complete: 7 (settlement) and 8 (OCR).

Milestone 8 OCR, now tested on real images: the earlier caveat (parser only
tested on sample text, never on real Tesseract output) is closed. scripts/ocr-eval.mjs
runs the real Tesseract + parser pipeline against the ICDAR 2019 SROIE receipt
dataset and scores the extracted total against ground truth (npm run eval:ocr).
On 113 receipts the parser reads the correct grand total on 70% and some total
on 90%. Running this surfaced two parser bugs (a spaced "Sub Total" treated as
the grand total, and taking the largest of all "total" lines, which grabbed
pre-tax and per-tax-band figures). Fixing the total-selection rules raised
exact-total accuracy from 65% to 70% on that sample with no regressions; three
new unit tests lock in the fixes. Most remaining misses are Tesseract misreading
the digits, which no line-selection rule can fix.

Milestone 9 (realtime) verified live across two browser clients: an expense
added in one window shows up in the other within about a second, with balances
recomputed. Two fixes were needed and folded into schema.sql:
- The tables were never in the supabase_realtime publication, so no change
  events were emitted. Added them (plus replica identity full so realtime can
  evaluate RLS per subscriber). Patch: supabase/fix-realtime.sql.
- The realtime socket connected unauthenticated, so RLS filtered every event
  out (channel showed SUBSCRIBED but nothing arrived). components/RealtimeRefresher.tsx
  now sets the access token before subscribing, and rebinds the realtime token
  getter to dodge a supabase-js 2.47 heartbeat recursion (Maximum call stack).

Beyond v1: recorded settlements (settle up and clear debts). A settlements
table plus BalanceList "Mark as paid" buttons let a member record paying off a
suggested transfer; balances fold it in like an expense and drop to zero. Three
unit tests cover the balance math. Needs supabase/add-settlements.sql applied,
then a live check, before calling it done.

Beyond v1: currency, unequal splits, and OCR corrections/auto-naming.
- Currency is now a single setting (lib/currency.ts), defaulting to rupees (₹);
  formatCents/dollarsToCents read from it so every amount in the app switched
  from $ to ₹.
- ExpenseForm has an Equally/Unequally toggle. Unequal mode gives each selected
  member an amount input, validates the shares sum to the total, and offers a
  "fill equally" starting point. No schema change (expense_splits already holds
  per-member amounts).
- The OCR-detected total is editable in ReceiptUpload (fixes a misread digit),
  and after OCR the merchant name from the top of the receipt is suggested as
  the expense name (deterministic, no model). The suggested name prefills the
  description if it is empty. An earlier in-browser LLM (LaMini-Flan-T5-77M via
  Transformers.js) was dropped: too small to follow the prompt, it echoed the
  instruction instead of a title and added an ~80MB download for worse results.
- Unit tests pass (parseSharesToCents and the naming helpers); production build
  is clean. Still to do: a manual run against a real receipt to eyeball
  OCR-total correction and the name suggestion. Docs and the architecture
  diagram were updated for these features.

Schema note: an early RLS bug blocked group creation (a creator could not read
their own group before joining it, which broke both the insert-returning-select
and the first-member insert). Fixed by adding `created_by = auth.uid()` to the
groups select policy. Folded into schema.sql; patch is supabase/fix-group-bootstrap.sql.

Deployed to Vercel: https://evenly-evenly1.vercel.app
Supabase env vars confirmed in the JS bundle. Auth endpoint reachable (Supabase
returns 422 for an empty signup, confirming the API key is valid and the project
is live). next upgraded to 15.5.20 and vitest to 3.2.6 to patch all critical CVEs
before deploying.

## Blockers
None.

## Next
- Apply supabase/add-settlements.sql, then verify settle-up live.
- Custom domain (optional, currently on evenly-evenly1.vercel.app).
- See "Next steps (after v1)" in CLAUDE.md for feature work.
