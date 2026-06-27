-- One-off fix: let a group's creator read it before they are added as a member.
-- This unblocks creating a group (the .insert().select() returning the new row)
-- and adding the first member. Already folded into schema.sql; run this if your
-- project was created from the earlier version. Safe to run more than once.
drop policy if exists "members can read their groups" on public.groups;
create policy "members can read their groups"
  on public.groups for select
  to authenticated
  using (public.is_group_member(id) or created_by = auth.uid());
