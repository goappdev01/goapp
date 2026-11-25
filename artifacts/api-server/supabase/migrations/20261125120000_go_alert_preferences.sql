-- Preferences are private to the authenticated account. Native receipts stay on the device.
create table if not exists public.go_alert_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint go_alert_preferences_object check (jsonb_typeof(settings) = 'object')
);

alter table public.go_alert_preferences enable row level security;
revoke all on public.go_alert_preferences from anon;
grant select, insert, update, delete on public.go_alert_preferences to authenticated;

create policy go_alert_preferences_select_self on public.go_alert_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy go_alert_preferences_insert_self on public.go_alert_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy go_alert_preferences_update_self on public.go_alert_preferences
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
