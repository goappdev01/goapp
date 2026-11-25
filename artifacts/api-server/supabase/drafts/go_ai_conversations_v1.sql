-- DRAFT ONLY. Do not apply without the owner's separate authorization, a current
-- verified backup, and an isolated RLS test. The existing GO AI route remains ADMIN-only.
create table public.go_ai_conversations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb
    check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) <= 20
      and octet_length(messages::text) <= 16000),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.go_ai_conversations enable row level security;
revoke all on public.go_ai_conversations from anon, authenticated;
grant select, insert, update, delete on public.go_ai_conversations to authenticated;

create policy go_ai_history_select on public.go_ai_conversations for select to authenticated
  using ((select auth.uid()) = user_id and exists (
    select 1 from public.admin_memberships membership
    where membership.user_id = (select auth.uid()) and membership.active = true));
create policy go_ai_history_insert on public.go_ai_conversations for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.admin_memberships membership
    where membership.user_id = (select auth.uid()) and membership.active = true));
create policy go_ai_history_update on public.go_ai_conversations for update to authenticated
  using ((select auth.uid()) = user_id and exists (
    select 1 from public.admin_memberships membership
    where membership.user_id = (select auth.uid()) and membership.active = true))
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.admin_memberships membership
    where membership.user_id = (select auth.uid()) and membership.active = true));
create policy go_ai_history_delete on public.go_ai_conversations for delete to authenticated
  using ((select auth.uid()) = user_id);
