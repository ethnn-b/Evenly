-- Feature: recorded settlements (settle up and clear debts).
-- Adds a settlements table, its RLS policies, and realtime. Balances fold a
-- settlement in like an expense (payer credited, receiver debited), so
-- recording the suggested settle-up payments drives balances to zero. No real
-- money moves. Already folded into schema.sql; run this against a project
-- created before the feature. Safe to run more than once.

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

drop policy if exists "members can read settlements" on public.settlements;
create policy "members can read settlements"
  on public.settlements for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "participants can record settlements" on public.settlements;
create policy "participants can record settlements"
  on public.settlements for insert
  to authenticated
  with check (
    public.is_group_member(group_id)
    and created_by = auth.uid()
    and (from_user = auth.uid() or to_user = auth.uid())
  );

drop policy if exists "recorder can delete settlements" on public.settlements;
create policy "recorder can delete settlements"
  on public.settlements for delete
  to authenticated
  using (created_by = auth.uid());

-- Realtime so a settle-up updates live across clients.
alter table public.settlements replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settlements'
  ) then
    alter publication supabase_realtime add table public.settlements;
  end if;
end $$;
