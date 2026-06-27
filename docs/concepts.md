# Concepts

Background for the ideas this project relies on. Aimed at someone who knows general web dev but
has not used Supabase, RLS, or written a settlement algorithm before.

## Supabase auth and JWTs

Supabase Auth handles signup, login, and sessions. When a user logs in, Supabase issues a JWT
(JSON Web Token), which is a signed token carrying claims about the user, most importantly their
`sub` (the user id) and their role. The token is signed with a secret only Supabase knows, so the
server can trust it without a database lookup on every request.

The client stores the JWT and sends it with each request to Supabase. Postgres receives that
token and exposes the user id as `auth.uid()` inside SQL. That single function is what makes row
level security work: policies can compare `auth.uid()` against rows in the table.

The anon key is a separate thing from the user JWT. The anon key identifies your project and is
fine to ship in the browser. On its own it grants only what RLS allows for an anonymous request.
Once a user logs in, their JWT rides on top, and `auth.uid()` becomes their id.

## Row level security (RLS)

RLS moves authorization into the database. Instead of every API route remembering to check "does
this user own this row", you write policies on the table and Postgres enforces them on every
query, insert, update, and delete. If a policy does not allow a row, the row is invisible. A
`SELECT *` returns only the rows the current user is allowed to see.

A policy is a boolean SQL expression evaluated per row. For this app the core idea is membership:
a user can see a group only if they appear in `group_members` for that group. Sketch:

```
-- a user can read groups they belong to
create policy "read own groups" on groups
for select using (
  exists (
    select 1 from group_members m
    where m.group_id = groups.id and m.user_id = auth.uid()
  )
);
```

Expenses and splits inherit the same rule: you can see an expense if you can see its group. The
big win is that there is no trusted application layer to bypass. Even if a bug in the frontend
sends a query for someone else's group, Postgres returns nothing. The check lives next to the
data.

Watch out for two things. First, policies can be slow if the membership check is not indexed, so
index `group_members(group_id, user_id)`. Second, RLS is easy to get wrong in the open direction
(too permissive), so the tests and a manual two-user check matter.

## The relational model for expenses and splits

The tricky part of expense splitting is that one expense is shared by several people in possibly
unequal shares. That is a many-to-many relationship, so it needs a join table.

Tables:

- `profiles`: one row per user (id matches the auth user id, plus display name).
- `groups`: a named group.
- `group_members`: which users belong to which group (the many-to-many link).
- `expenses`: one row per expense (group, who paid, total amount in cents, optional receipt path).
- `expense_splits`: one row per person per expense, holding that person's share in cents.

When someone adds a $30 dinner split three ways, you write one `expenses` row (payer = Alice,
amount = 3000) and three `expense_splits` rows (Alice owes 1000, Bob owes 1000, Carol owes 1000).

A person's net balance in a group is: (sum of amounts they paid) minus (sum of their split
shares). Positive means the group owes them, negative means they owe the group. The sum of all
net balances in a group is always zero, which is a handy invariant to assert in tests.

Store money as integer cents, not floats. Floating point cannot represent $0.10 exactly, and
rounding errors accumulate across many splits. Integers avoid the whole problem; divide and
format only at display time.

## The settlement / debt-simplification problem

After many expenses you have a net balance per person. Some people are owed money (creditors),
some owe money (debtors). The question: what payments clear all debts?

**Graph and flow view.** Think of it as a directed graph. Each debtor is a source pushing out
its debt, each creditor is a sink pulling in what it is owed, and a payment is flow on an edge
from a debtor to a creditor. Any set of payments where the total out of each debtor equals what
they owe and the total into each creditor equals what they are owed is a valid settlement. There
are many valid settlements. The naive one has everyone pay everyone, which is a lot of edges. We
want few edges.

**Why the true minimum is hard.** Finding the minimum number of transactions is NP-hard. It is
equivalent to a partition-style problem: if you could split the people into groups whose balances
each sum to zero, each such group can settle internally with (size - 1) payments, and more
zero-sum subgroups means fewer total payments. Deciding the best partition is the hard part
(reducible from subset-sum / the partition problem). So for any nontrivial group, computing the
exact minimum is not practical, and it does not matter much in practice anyway.

**The greedy heuristic.** Use a simple, fast rule that gives good results:

1. Compute each person's net balance.
2. Take the person owed the most (largest creditor) and the person who owes the most (largest
   debtor).
3. Settle the smaller of the two amounts: the debtor pays that amount to the creditor.
4. One of them now hits zero and drops out. The other keeps a reduced balance.
5. Repeat until everyone is at zero.

Each step zeroes at least one person, so it finishes in at most (members - 1) transactions. That
upper bound alone is already much better than everyone-pays-everyone, and it is the number to
quote. The greedy answer is not always the theoretical minimum, but it is close and runs in well
under a millisecond for any realistic group.

## Client vs server OCR

OCR (optical character recognition) turns an image of text into actual text. Tesseract.js is a
WebAssembly build of the Tesseract engine that runs in the browser. That has real upsides for
this app: the receipt image never leaves the device, there is no per-call cost, and there is no
backend to scale. The downsides are that the first run downloads the language model (a few MB),
recognition uses the user's CPU, and accuracy on a crumpled phone photo is so-so.

The alternative is server OCR: send the image to a route handler or a cloud OCR API. That gives
better accuracy and offloads work from the phone, but it adds a backend, a privacy question (the
receipt now leaves the device), and possibly cost. For v1 the client-side choice wins because it
is free, private, and simple. The design-decisions doc covers the trade in more detail.

After OCR returns raw text, a small parser pulls out item/price lines. A receipt line tends to
look like a name followed by a price, so a regex that captures a trailing number like `12.99`
works as a first pass, with the largest or last such number near a "total" keyword treated as the
total. It will not be perfect. The goal is to prefill the form, not to be an accountant.

## Storage and signed URLs

Supabase Storage holds the receipt images in a bucket backed by object storage. The bucket is
private, so files are not world-readable by URL. To show a receipt to an allowed user, you ask
Supabase for a signed URL: a temporary link that includes a token and expires after a set time.
Access to the bucket is governed by storage policies, the same RLS idea applied to files, so a
user can only read receipts for groups they belong to. Storing only the file path in the
`expenses` row (and generating a signed URL on demand) keeps the link fresh and the bucket
locked down.

## Realtime and optimistic UI

Supabase Realtime streams Postgres changes to subscribed clients over a websocket. The group
page can subscribe to inserts on `expenses` for its group, so when one member adds an expense,
everyone else's view updates without a refresh. RLS still applies to the stream, so a client only
receives changes for rows it is allowed to see.

Optimistic UI is a separate trick for snappiness. When the user submits an expense, update the
local list immediately as if it succeeded, then send the request. If the server confirms, you are
already showing the right thing. If it fails, roll back the local change and show an error. It
makes the app feel instant even on a slow connection. Combined with realtime, the author sees
their own change optimistically while other members get it pushed over the websocket.
