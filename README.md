# Evenly

A multi-user expense-splitting web app. Make a group, add the people you share costs with, log
expenses, and the app tracks who owes whom. When it is time to settle up, it works out the
smallest set of payments that clears everyone's debts. You can also photograph a receipt and the
app reads the line items and total for you, so adding an expense is mostly automatic.

Built with Next.js, TypeScript, and Supabase. Runs entirely on free tiers.

<p align="center">
  <img src="docs/media/04-group.png" alt="A group page showing members, per-person balances, and the expense list" width="600">
  <br>
  <sub>A group page: members, each person's net balance, and the shared expense list.</sub>
</p>

## The novel angle

Two things make this more than a standard CRUD app:

1. **Receipt OCR with auto-naming.** Upload a receipt photo and Tesseract.js reads it in the
   browser. The app parses item lines and the total, then prefills the expense form (the detected
   total is editable, so you can fix a misread digit) and suggests a name from the merchant at the
   top of the receipt. This adds a computer-vision piece to an otherwise plain database app, and it
   runs client side so the image never leaves the user's device.

2. **Debt simplification.** Splitting costs in a group creates a tangle of small debts. The
   settlement step collapses that into the fewest payments using a greedy algorithm (repeatedly
   pay the biggest debtor's balance toward the biggest creditor). Six scattered IOUs can become
   three clean payments.

Both features in action:

<p align="center">
  <img src="docs/media/07-receipt-scan.png" alt="A receipt photo uploaded; OCR reports the number of items read" width="560">
  <br>
  <sub>Upload a receipt photo and Tesseract.js reads it in the browser, no server round trip.</sub>
</p>

<p align="center">
  <img src="docs/media/08-ocr-prefill.png" alt="Detected total, parsed line items, and a suggested name prefilled into the form" width="440">
  <br>
  <sub>The detected total (editable, in case a digit is misread) and a merchant name prefill the expense form.</sub>
</p>

<p align="center">
  <img src="docs/media/05-settle-up.png" alt="Settle-up view suggesting two payments that clear the group" width="440">
  <br>
  <sub>Settle up: three lopsided balances collapse to two payments, each with a "Mark as paid" button.</sub>
</p>

## Features

- Email/password auth via Supabase Auth.
- Groups with members.
- Add expenses with an even or unequal split (type each person's share) across selected members.
- Per-group balances showing each person's net position.
- Settle-up: simplified payment suggestions, each with a "Mark as paid" button that
  records the payment so the debt clears and balances drop to zero.
- Receipt upload with in-browser OCR that prefills the amount (editable if it misreads) and
  auto-names the expense from the merchant on the receipt.
- Amounts in rupees by default (one setting in `lib/currency.ts` to switch currency).
- Row level security so users only ever see groups they belong to.
- Realtime updates so a shared group page refreshes across clients.

## A quick tour

Sign up or sign in with email and password:

<p align="center">
  <img src="docs/media/01-sign-up.png" alt="Create an account form" width="360">
  &nbsp;&nbsp;
  <img src="docs/media/02-sign-in.png" alt="Sign in form" width="360">
</p>

The dashboard lists your groups and creates new ones:

<p align="center">
  <img src="docs/media/03-dashboard.png" alt="Dashboard listing the user's groups" width="600">
</p>

Adding an expense: pick who paid, the amount, and split it equally or by custom amounts across
the members you select (a receipt scan prefills the amount and name):

<p align="center">
  <img src="docs/media/06-add-expense.png" alt="Add-expense form with payer, amount, and equal/unequal split options" width="440">
</p>

## Tech stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS
- Supabase: Auth, Postgres, Storage, Realtime
- Tesseract.js for OCR
- Vitest for unit tests

## Setup

1. Create a Supabase project at https://supabase.com (free tier is fine).
2. In the SQL editor, run `supabase/schema.sql` to create the tables, RLS policies, and the
   receipts storage bucket.
3. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Project Settings -> API.
4. Install and run:

```
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy

- **App:** push the repo to GitHub and import it into Vercel. Set the two
  `NEXT_PUBLIC_SUPABASE_*` env vars in the Vercel project settings. Vercel builds and hosts the
  Next.js app on its free tier.
- **Backend:** the same Supabase project serves production. Nothing else to host. The anon key
  is meant to be public; data access is controlled by RLS, not by hiding the key.

## Folder structure

```
app/          Next.js App Router routes (auth, dashboard, group page, add-expense)
components/   GroupList, ExpenseForm, BalanceList, ReceiptUpload
lib/          supabaseClient, settle (debt simplification), ocr, expenseName (merchant naming),
              currency, format, types
supabase/     schema.sql (tables, RLS, storage bucket)
tests/        vitest tests for settlement, the OCR parser, money formatting, and naming helpers
docs/         architecture.md (diagrams), concepts.md, design-decisions.md
```

## Results

- OCR: on 113 real receipt images from the ICDAR 2019 SROIE dataset, the parser reads the correct
  grand total on 70% of receipts and extracts some total on 90%. Tuning the total-selection rules
  against this dataset raised exact-total accuracy from 65% to 70% (see the eval below and
  `docs/design-decisions.md`). Most remaining misses are Tesseract misreading the digits, not the
  parser picking the wrong line.
- Settlement: reduced N pairwise debts to M payments in the demo group (M <= members - 1).
- Concurrency: handled K concurrent users on the free tier in testing.

### Running the OCR accuracy eval

`npm run eval:ocr` downloads a sample of SROIE receipts (cached in `.ocr-eval-cache/`), runs the
real Tesseract + parser pipeline, and scores the extracted total against ground truth. Set the
sample size with `OCR_EVAL_N` (default 30). It needs the network and Node >= 22.6, and is separate
from `npm test`, which stays fast and offline.
