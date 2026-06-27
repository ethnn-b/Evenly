# Splitwise-OCR

A multi-user expense-splitting web app. Make a group, add the people you share costs with, log
expenses, and the app tracks who owes whom. When it is time to settle up, it works out the
smallest set of payments that clears everyone's debts. You can also photograph a receipt and the
app reads the line items and total for you, so adding an expense is mostly automatic.

Built with Next.js, TypeScript, and Supabase. Runs entirely on free tiers.

## The novel angle

Two things make this more than a standard CRUD app:

1. **Receipt OCR auto-itemization.** Upload a receipt photo and Tesseract.js reads it in the
   browser. The app parses item lines and the total, then prefills the expense form. This adds
   a small computer-vision piece to an otherwise plain database app, and it runs client side so
   the image never leaves the user's device.

2. **Debt simplification.** Splitting costs in a group creates a tangle of small debts. The
   settlement step collapses that into the fewest payments using a greedy algorithm (repeatedly
   pay the biggest debtor's balance toward the biggest creditor). Six scattered IOUs can become
   three clean payments.

## Features

- Email/password auth via Supabase Auth.
- Groups with members.
- Add expenses with an even split across selected members.
- Per-group balances showing each person's net position.
- One-click settle-up with simplified payment suggestions.
- Receipt upload with in-browser OCR that prefills the expense amount.
- Row level security so users only ever see groups they belong to.
- Realtime updates so a shared group page refreshes across clients.

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
lib/          supabaseClient, settle (debt simplification), ocr, types
supabase/     schema.sql (tables, RLS, storage bucket)
tests/        vitest tests for settlement and the OCR parser
docs/         concepts.md and design-decisions.md
```

## Results

_Placeholder, fill in after building._

- Settlement: reduced N pairwise debts to M payments in the demo group (M <= members - 1).
- Concurrency: handled K concurrent users on the free tier in testing.
- OCR: parsed line items and total from sample receipts and prefilled the expense form.
