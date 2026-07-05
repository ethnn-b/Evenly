-- One-off fix: enable Realtime for expenses and expense_splits (milestone 9).
-- A table only emits postgres_changes if it is in the supabase_realtime
-- publication, so without this the client subscription connects but never
-- fires. REPLICA IDENTITY FULL lets realtime see the whole row to evaluate the
-- RLS policy for each subscriber (needed for RLS-filtered and DELETE events).
-- Already folded into schema.sql; run this if your project was created from the
-- earlier version. Safe to run more than once.
alter table public.expenses       replica identity full;
alter table public.expense_splits replica identity full;

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
end $$;
