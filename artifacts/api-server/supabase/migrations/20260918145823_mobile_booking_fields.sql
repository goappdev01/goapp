alter table public.businesses add column ui_metadata jsonb not null default '{}' check (jsonb_typeof(ui_metadata) = 'object');
alter table public.services add column ui_metadata jsonb not null default '{}' check (jsonb_typeof(ui_metadata) = 'object');
alter table public.staff add column ui_metadata jsonb not null default '{}' check (jsonb_typeof(ui_metadata) = 'object');
alter table public.availability add column ui_metadata jsonb not null default '{}' check (jsonb_typeof(ui_metadata) = 'object');
grant insert (ui_metadata), update (ui_metadata) on public.businesses, public.services, public.staff, public.availability to authenticated;
create table public.business_settings (
 business_id uuid primary key references public.businesses(id) on delete cascade,
 payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 100000),
 updated_at timestamptz not null default now()
);
alter table public.business_settings enable row level security;
revoke all on public.business_settings from public, anon, authenticated;
grant select, insert, update on public.business_settings to authenticated;
create policy business_settings_owner on public.business_settings for all to authenticated
 using (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=(select auth.uid())))
 with check (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
create trigger business_settings_updated before update on public.business_settings
 for each row execute function public.set_updated_at();
