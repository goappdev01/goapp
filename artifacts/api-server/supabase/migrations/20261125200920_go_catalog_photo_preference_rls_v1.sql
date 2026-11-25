alter table public.go_catalog_photo_preferences enable row level security;
revoke all on public.go_catalog_photo_preferences from anon;
grant select, insert, update on public.go_catalog_photo_preferences to authenticated;
create policy go_catalog_photo_preferences_select_self on public.go_catalog_photo_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy go_catalog_photo_preferences_insert_self on public.go_catalog_photo_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy go_catalog_photo_preferences_update_self on public.go_catalog_photo_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
