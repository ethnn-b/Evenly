-- Evenly schema: tables, row level security, and a storage bucket for receipts.
--
-- Run this in the Supabase SQL editor (or via the CLI) against a fresh project.
-- It is written to be idempotent enough to re-run during development: it drops
-- policies before recreating them. It does NOT drop tables, so your data is safe.
--
-- Money is stored as integer cents everywhere. Never store dollars as floats.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per user, mirroring auth.users. Holds the display fields we want to
-- show in the UI without reaching into the auth schema.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  display_name text,
  created_at  timestamptz not null default now()
);

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 100),
  created_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists group_members_user_id_idx on public.group_members (user_id);
create index if not exists group_members_group_id_idx on public.group_members (group_id);

create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  payer_id      uuid not null references public.profiles (id) on delete restrict,
  description   text not null check (char_length(description) between 1 and 200),
  amount_cents  bigint not null check (amount_cents > 0),
  created_by    uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now()
);

create index if not exists expenses_group_id_idx on public.expenses (group_id);

-- One row per member's share of an expense. The shares for an expense should
-- sum to the expense amount; we enforce that in app code, not a constraint,
-- because rounding remainders get distributed across members.
create table if not exists public.expense_splits (
  id            uuid primary key default gen_random_uuid(),
  expense_id    uuid not null references public.expenses (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  amount_cents  bigint not null check (amount_cents >= 0),
  unique (expense_id, user_id)
);

create index if not exists expense_splits_expense_id_idx on public.expense_splits (expense_id);

-- ---------------------------------------------------------------------------
-- Helper: is the current user a member of a given group?
--
-- SECURITY DEFINER so it runs with the function owner's rights and bypasses
-- RLS on group_members. This is what breaks the recursion: if the
-- group_members SELECT policy itself queried group_members, Postgres would
-- recurse forever. Querying through this function sidesteps that.
-- ---------------------------------------------------------------------------
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = gid
      and gm.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_splits enable row level security;

-- profiles -------------------------------------------------------------------
-- Any authenticated user can read profiles (we need names/emails to display
-- group members and to look people up by email when adding them). A user can
-- only insert and update their own row.
drop policy if exists "profiles are readable by authenticated users" on public.profiles;
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "users can insert their own profile" on public.profiles;
create policy "users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- groups ---------------------------------------------------------------------
-- A user can read a group if they belong to it OR they created it. The
-- created_by arm is essential for bootstrap: right after creating a group the
-- creator is not yet a member, and without it (a) the .insert().select() that
-- returns the new row would be filtered out by RLS, and (b) the group_members
-- insert policy below, which checks group ownership via a subquery on this
-- table, could not see the group either. Both would fail.
drop policy if exists "members can read their groups" on public.groups;
create policy "members can read their groups"
  on public.groups for select
  to authenticated
  using (public.is_group_member(id) or created_by = auth.uid());

drop policy if exists "users can create groups" on public.groups;
create policy "users can create groups"
  on public.groups for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "creators can delete their groups" on public.groups;
create policy "creators can delete their groups"
  on public.groups for delete
  to authenticated
  using (created_by = auth.uid());

-- group_members --------------------------------------------------------------
-- Read: you can see the membership rows of any group you belong to (so you can
-- list who else is in the group). Uses the helper to avoid recursion.
drop policy if exists "members can read membership of their groups" on public.group_members;
create policy "members can read membership of their groups"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));

-- Insert: you can add members to a group if you created it or already belong
-- to it. The created_by check covers the bootstrap case where the creator
-- adds themselves as the first member, before any membership row exists.
drop policy if exists "members can add people to their groups" on public.group_members;
create policy "members can add people to their groups"
  on public.group_members for insert
  to authenticated
  with check (
    public.is_group_member(group_id)
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );

-- Delete: a member can remove themselves; the group creator can remove anyone.
drop policy if exists "members can leave or be removed by creator" on public.group_members;
create policy "members can leave or be removed by creator"
  on public.group_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );

-- expenses -------------------------------------------------------------------
drop policy if exists "members can read group expenses" on public.expenses;
create policy "members can read group expenses"
  on public.expenses for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "members can add expenses" on public.expenses;
create policy "members can add expenses"
  on public.expenses for insert
  to authenticated
  with check (public.is_group_member(group_id) and created_by = auth.uid());

drop policy if exists "creators can delete their expenses" on public.expenses;
create policy "creators can delete their expenses"
  on public.expenses for delete
  to authenticated
  using (public.is_group_member(group_id) and created_by = auth.uid());

-- expense_splits -------------------------------------------------------------
-- A split is visible/insertable if you can see the parent expense's group.
drop policy if exists "members can read splits" on public.expense_splits;
create policy "members can read splits"
  on public.expense_splits for select
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

drop policy if exists "members can add splits" on public.expense_splits;
create policy "members can add splits"
  on public.expense_splits for insert
  to authenticated
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Settlements: a recorded payment from one member to another that pays down
-- debt. Balances fold this in like an expense (payer credited, receiver
-- debited), so recording the suggested settle-up payments drives balances to
-- zero. No real money moves; this just records that it happened.
-- ---------------------------------------------------------------------------
create table if not exists public.settlements (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  from_user    uuid not null references public.profiles (id) on delete cascade,
  to_user      uuid not null references public.profiles (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  created_by   uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  check (from_user <> to_user)
);

create index if not exists settlements_group_id_idx on public.settlements (group_id);

alter table public.settlements enable row level security;

-- Read: any member of the group can see its settlements.
drop policy if exists "members can read settlements" on public.settlements;
create policy "members can read settlements"
  on public.settlements for select
  to authenticated
  using (public.is_group_member(group_id));

-- Insert: only a participant records a settlement they are part of (the payer
-- or the payee), and created_by must be themselves.
drop policy if exists "participants can record settlements" on public.settlements;
create policy "participants can record settlements"
  on public.settlements for insert
  to authenticated
  with check (
    public.is_group_member(group_id)
    and created_by = auth.uid()
    and (from_user = auth.uid() or to_user = auth.uid())
  );

-- Delete: whoever recorded it can undo it.
drop policy if exists "recorder can delete settlements" on public.settlements;
create policy "recorder can delete settlements"
  on public.settlements for delete
  to authenticated
  using (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- New-user trigger: create a profile row whenever someone signs up.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Storage: a private bucket for receipt images.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Each user gets a folder named after their uid: receipts/<uid>/<file>.
-- Policies key off the first path segment so a user only touches their own
-- files. (v1 OCR runs in the browser and does not strictly need to upload,
-- but storing the receipt lets us keep a record and is wired up here.)
drop policy if exists "users can read their own receipts" on storage.objects;
create policy "users can read their own receipts"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users can upload their own receipts" on storage.objects;
create policy "users can upload their own receipts"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users can delete their own receipts" on storage.objects;
create policy "users can delete their own receipts"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Realtime: let clients subscribe to expense and split changes so a group page
-- updates live across sessions (milestone 9). A table only emits postgres_changes
-- if it is in the supabase_realtime publication; without this the subscription
-- connects but never fires. REPLICA IDENTITY FULL puts the whole row (not just
-- the primary key) into the change feed, which realtime needs to evaluate the
-- RLS policy for a subscriber, otherwise DELETE and RLS-filtered events are
-- dropped. This block is idempotent, so re-running schema.sql is safe.
-- ---------------------------------------------------------------------------
alter table public.expenses       replica identity full;
alter table public.expense_splits replica identity full;
alter table public.settlements    replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expense_splits'
  ) then
    alter publication supabase_realtime add table public.expense_splits;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settlements'
  ) then
    alter publication supabase_realtime add table public.settlements;
  end if;
end $$;
