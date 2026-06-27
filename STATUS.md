# Status

Updated: 2026-06-27
Phase: in progress
Progress: 8/10 milestones

## Milestones
- [x] Create the Supabase project, get URL and anon key into .env.local
- [x] Apply schema.sql: tables, RLS policies, storage bucket
- [x] Auth: signup, login, logout, a protected dashboard route
- [x] Groups and members
- [x] Expenses and even splits
- [x] Balances: net position per member
- [x] Settlement algorithm plus settle-up UI
- [x] Receipt upload and OCR prefill
- [ ] Realtime expense updates across clients
- [ ] Deploy to Vercel, verify end to end

## Current state
Full v1 app is built and runs. 27 unit tests pass (settlement, OCR parser, money
formatting) and 17 live checks pass against the Supabase project (signup +
profile trigger, group bootstrap, members, expenses, even splits, balance math,
and RLS isolation: a non-member is blocked from reading or joining a group).

Verified live: milestones 1-6.
Verified by unit tests + code complete: 7 (settlement) and 8 (OCR).

Caveat on milestone 8: the OCR parser is unit-tested against sample text, and
the upload/prefill UI is built, but OCR on a real receipt image has only been
run in the browser by hand, not in an automated test. The parse step is the
tested part; real Tesseract output is messier than the samples.

Milestone 9 (realtime) is coded (components/RealtimeRefresher.tsx subscribes to
expense and split changes and refreshes the page) but is not ticked: there is no
automated test and it has not been verified across two live clients yet.

Schema note: an early RLS bug blocked group creation (a creator could not read
their own group before joining it, which broke both the insert-returning-select
and the first-member insert). Fixed by adding `created_by = auth.uid()` to the
groups select policy. Folded into schema.sql; patch is supabase/fix-group-bootstrap.sql.

## Blockers
None.

## Next
- Verify realtime across two browser clients, then tick milestone 9.
- Deploy to Vercel (needs the Vercel account + env vars) for milestone 10.
- Patch the next@15.1.0 CVE before deploying.
