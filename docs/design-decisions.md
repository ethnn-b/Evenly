# Design decisions

Why the main choices were made, what the alternatives were, and the trade-offs. Each section is
short on purpose.

## Supabase vs a custom backend

**Decision:** use Supabase for auth, database, storage, and realtime.

**Why:** it covers four things I would otherwise have to build and host separately. Auth, a
Postgres database, file storage, and a realtime channel come as one free-tier service with a
TypeScript client. For a portfolio project that means I spend time on the interesting parts
(settlement, OCR) instead of wiring up sessions and S3.

**Alternative:** a custom backend, for example Node/Express with Prisma on a Postgres instance,
plus a separate auth library and an object store. More control over every layer and no vendor
lock to a specific platform. The cost is a lot more setup, more to deploy, and more to keep
secure.

**Trade-off:** I accept lock-in to Supabase's API and some loss of low-level control in exchange
for shipping faster and free. Because it is plain Postgres underneath, the schema and SQL would
mostly port to another host if needed.

## Row level security vs app-layer authorization

**Decision:** enforce access in the database with RLS policies.

**Why:** the access rule is the same everywhere (you can touch a group only if you are a member),
so it belongs in one place. With RLS, every query is filtered by Postgres, and a frontend bug
cannot leak another group's data because the database refuses to return it.

**Alternative:** check permissions in application code (middleware or per-route guards). This is
easier to read for some developers and does not need SQL policy knowledge. The risk is that the
check has to be repeated on every path, and one forgotten check is a data leak.

**Trade-off:** RLS has a learning curve and policies can be fiddly to debug, but the security
property (no trusted client, no missed check) is worth it. I still validate inputs in the app;
RLS is the backstop, not the only layer.

## OCR engine: Tesseract.js vs cloud OCR vs a Donut model

**Decision:** Tesseract.js, running in the browser.

**Why:** free, no backend, and the receipt image stays on the user's device. It is good enough to
prefill a form, which is the actual goal.

**Alternatives:**

- **Cloud OCR** (Google Vision, AWS Textract, Azure). Much better accuracy on messy receipts and
  some understand receipt structure directly. But it costs money per call, needs a server to hold
  the API key, and sends the user's receipt to a third party.
- **A Donut model** (a transformer that reads a document image straight to structured output, no
  separate OCR step). Can produce clean itemized JSON and handles layout well. But it is heavy to
  run, realistically needs a GPU or a hosted inference endpoint, and is overkill here.

**Trade-off:** I trade accuracy for being free, private, and self-contained. If accuracy became a
real problem, a server route calling a cloud OCR provider is the natural upgrade, and the parser
in `lib/ocr.ts` would not have to change much.

## Picking the grand total off a receipt

**Decision:** treat a line as a total candidate if it names a total (the word "total", or a label
like "payable", "amount due", or "inclusive of GST") and is not a known non-grand-total line, then
take the largest candidate.

**Why this shape:** the first version just took the largest line containing "total". Running the
parser on real receipt images (see `scripts/ocr-eval.mjs`, scored against the ICDAR 2019 SROIE
ground-truth totals) showed that fails a lot, because receipts print several "total" lines and
some are bigger than the amount due: per-tax-band lines ("Total 6% supplies"), pre-tax lines
("Total Sales Excluding GST"), tax subtotals ("Total GST"), and a gross line ("Total Gross").
Excluding those and keeping the max lifted exact-total accuracy from 65% to 70% on a 113-receipt
sample, with no regressions in that sample.

**Things that did not work, and why they are not in the code:**

- Excluding a spaced "Sub Total". Some receipts print only "Sub Total" as the amount due, so
  dropping it lost the total on those. A one-word "subtotal" is still excluded.
- Preferring a labelled grand total over a plain "Total" (a rank). It picked a pre-rounding
  "Inclusive of GST" line over the final rounded "Total" on a few receipts, and scored worse than
  the plain max. So the rank idea was dropped.

**Known limits:** when Tesseract misreads the digits of the total itself (for example reads 9.00 as
9.60), no line-selection rule can recover it. Those account for most of the remaining misses and
are an OCR-engine limit, not a parser one. The unit tests in `tests/ocr.test.ts` lock in the
selection rules against sample text; the image eval measures the whole pipeline.

## Expense auto-naming: heuristic baseline, hosted-model upgrade

**Decision:** name the expense from the merchant heuristic (the first name-like line at the top of
the OCR text, title-cased and cleaned) as the instant baseline, and upgrade it with a hosted
open-weight model that also adds a category and reads the total (see the next section). The heuristic
is the offline fallback.

**Why:** the store name is what you actually want the expense called ("Trader Joe's", "Shell") and is
almost always the top line, so the heuristic gives a usable title instantly, with no download and
nothing to hallucinate. It fills the field the moment OCR finishes and stands alone when the model is
unavailable. The model then improves the wording and adds what the heuristic cannot (a category, and
a total cross-check). The suggestion is always editable.

**Alternatives:**

- **Heuristic only (no model).** What the app shipped with. Simplest and fully offline, but it gives
  the store name and nothing else: no category, no help on the total, no natural-language entry.
- **Small in-browser LLM** (LaMini-Flan-T5-77M via Transformers.js). Tried and dropped. A model that
  small could not follow the instruction reliably: it often echoed the prompt (returning literally
  "The purchase, for example \"Grocery shopping\"") instead of a title, for an ~80MB one-time
  download and worse results than just reading the store name.
- **Local Ollama** via a route handler. Good quality and free, but the user has to run Ollama with a
  model pulled, and it does not work on deployed Vercel without a hosted endpoint.

**Trade-off:** the upgrade adds a server route and a dependency on a hosted model, but it is additive
(the heuristic stays the baseline and the fallback), so the app keeps working with no key.

## Hosted LLM suggestions (Groq) and natural-language entry

**Decision:** call a hosted open-weight model (Llama 3.3 on Groq) from two Next.js route handlers,
one that turns receipt text into a name, category, and total, and one that turns a sentence into a
filled-in expense. Both validate the model's JSON on the server and fall back to the heuristics when
the model is off.

**Why:**

- **Server route, not the browser.** The API key cannot ship to the client, so the routes hold it
  and the existing auth middleware limits them to logged-in users. The browser sends text only.
- **Open-weight via Groq.** These are small extraction jobs, not frontier work; an open model on
  Groq's fast, free tier fits well and keeps cost near zero.
- **Validated structured output.** The routes ask for JSON and then check it: the category is coerced
  to the fixed list, amounts and totals become integer minor units, and member ids are matched
  against the real group. The model cannot invent a member or an off-list category.
- **Graceful fallback.** No key, an error, or a timeout falls back to the heuristic name and the
  regex total; quick add reports it could not read the sentence. The feature never breaks the app.

**Alternatives:** a hosted closed model (better quality, higher cost, and overkill for extraction);
a model in the browser (dropped, see the previous section); no AI at all (the shipped baseline).

**Trade-offs and limits:** the category is suggested and shown but not yet stored (the `expenses`
table has no category column), so it is display-only for now; persisting it is a small schema change
left as a next step. There is no rate limiting on the routes beyond the auth gate, which is fine on
the free tier for a small group. Natural-language entry has no offline fallback, because parsing a
free-form sentence genuinely needs the model.

## Currency: integer minor units, rupees by default

**Decision:** store money as integer minor units everywhere, and display and parse it through one
currency setting (`lib/currency.ts`), defaulting to INR (₹).

**Why:** integers dodge floating-point rounding across many splits (0.10 has no exact float, and the
errors accumulate). Keeping the symbol in one constant makes switching currencies a one-line change
and keeps every balance, expense, and settlement consistent.

**Alternative:** per-group or per-expense currency with a stored exchange rate (multi-currency). More
flexible, but it needs rate handling and conversion at display time, which is out of scope for v1.

**Trade-off:** one app-wide currency is simpler and correct for a single-region group. Multi-currency
is a noted next step; because amounts are already minor-unit integers, only formatting and a rate
would need to change.

## Even and unequal splits, and editable OCR output

**Decision:** support an even split and an unequal split where you type each member's share, and the
shares must sum to the total. The OCR-detected total and the suggested name are both editable.

**Why:** the even split covers the common case; the unequal split handles "I only had the salad".
Requiring the shares to add up to the total keeps `expense_splits` consistent with the expense amount,
which is the invariant balances rely on. OCR and the LLM are best-effort, so their outputs are
presented as editable defaults rather than trusted values.

**Alternative:** percentage or ratio splits, or deriving the total from the sum of the shares.
Percentages are a next step. Deriving the total conflicts with the OCR prefill, so the total stays
the source of truth and the shares are validated against it (with a live "assigned / left" indicator
and a "fill equally" shortcut to start from an even split and tweak).

**Trade-off:** the user has to make unequal shares add up exactly. No schema change was needed:
`expense_splits` already stores an arbitrary per-member amount, so the even and unequal paths write
the same shape of rows.

## Greedy vs optimal settlement

**Decision:** greedy (largest creditor against largest debtor, repeat).

**Why:** the exact minimum-transaction problem is NP-hard, so an optimal solver is slow for large
groups and adds a lot of code. The greedy heuristic runs instantly, is easy to test, and
guarantees at most (members - 1) payments, which is already a big reduction.

**Alternative:** an exact solver that searches for the true minimum (for example by finding
zero-sum subgroups via subset-sum). It produces the provably smallest number of payments. The
cost is exponential worst-case runtime and far more code, for a difference of usually one or two
fewer transactions.

**Trade-off:** I give up theoretical optimality for speed, simplicity, and testability. For a
bill-splitting app the greedy answer is what people actually want, and the (members - 1) bound is
the metric I can quote.

## Next.js App Router

**Decision:** Next.js 15 with the App Router.

**Why:** one framework for routing, server components, and the build, with first-class Vercel
deploy. Server components let me query Supabase on the server where it makes sense and keep client
components for the interactive parts (forms, OCR, realtime).

**Alternative:** a plain React SPA (Vite) talking to Supabase entirely from the client, or the
older Next.js Pages Router. The SPA is simpler to reason about but gives up server rendering and
server-side data fetching. The Pages Router is stable and familiar but is the older model.

**Trade-off:** the App Router has a steeper mental model (the server/client component split trips
people up), but it matches how Supabase recommends structuring auth and data access, and it is
the current default worth knowing.

## Free-tier deploy choices

**Decision:** Vercel for the app, Supabase for the backend, both free tier.

**Why:** zero hosting cost, and both are made to work together. Vercel auto-builds on push and
injects env vars; Supabase hosts the database, auth, storage, and realtime. Good enough for a
demo and a handful of real users.

**Alternative:** self-host on a VPS (one box running the Next.js app and a Postgres instance), or
use another PaaS. Self-hosting is cheaper at scale and fully under my control, but it means
managing a server, TLS, backups, and uptime, which is not the point of this project.

**Trade-off:** free tiers have limits (cold starts, database size, monthly active users, request
caps). For a portfolio app those limits are fine, and hitting them would itself be a good
problem and a story to tell.

**Staying live and cost:** the Vercel Hobby plan and the Supabase free tier both run indefinitely
at no charge and require no credit card. The one gotcha is Supabase's auto-pause: a project with
no database activity for seven days is paused, and the first request after that wakes it back up
(adds a few seconds to the first load). Auto-pause can be disabled in the Supabase dashboard
under Settings > General. Free-tier caps are generous for a portfolio project: Vercel gives 100 GB
bandwidth per month, Supabase gives 500 MB of database storage and 1 GB of file storage.

## Where OCR should run (client vs a route handler)

**Decision:** run OCR client side in v1.

**Why:** it keeps the image on the device, costs nothing, and needs no backend. It also keeps the
upload flow simple: read the file, run Tesseract.js, parse, prefill.

**Alternative:** a Next.js route handler that receives the image and runs OCR (Tesseract or a
cloud API) on the server. This offloads work from low-power phones and centralizes the parsing
logic, but it adds a server dependency, a privacy trade (the receipt leaves the device), and
possible cost.

**Trade-off:** client-side OCR can be slow on old phones and downloads the language model on
first use. I accept that for v1. A route handler is listed as a next step if device performance
turns out to be a problem.
