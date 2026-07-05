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
