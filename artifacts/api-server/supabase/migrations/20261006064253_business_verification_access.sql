-- Applied to the GO Supabase project on 2026-10-06, migration 20261006064253.
-- businesses.verified remains the sole approval authority, protected by the
-- existing column grants. No user role or editable metadata grants approval.
begin;
alter table public.businesses alter column verified set default false;
alter table public.businesses alter column booking_enabled set default false;
alter table public.businesses add constraint business_booking_requires_verification
  check (not booking_enabled or verified);

-- Fiscal details must never be placed in public businesses.ui_metadata.
create table public.business_verification_requests (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  tax_id text not null check (char_length(tax_id) between 3 and 32),
  trading_name text not null default '' check (char_length(trading_name) <= 200),
  address text not null check (char_length(address) between 1 and 4000),
  status text not null default 'pending' check (status in ('pending', 'rejected')),
  rejection_reason text,
  updated_at timestamptz not null default now()
);
alter table public.business_verification_requests enable row level security;
revoke all on public.business_verification_requests from public, anon, authenticated;
grant select on public.business_verification_requests to authenticated;
create policy verification_owner_read on public.business_verification_requests for select to authenticated
using (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=(select auth.uid())));

create function public.submit_business_verification(
  p_business_id uuid, p_legal_name text, p_tax_id text, p_trading_name text, p_address text
) returns setof public.businesses language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  target public.businesses;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_legal_name is null or char_length(trim(p_legal_name)) not between 2 and 200
    or p_tax_id is null or char_length(trim(p_tax_id)) not between 3 and 32
    or p_address is null or char_length(trim(p_address)) not between 1 and 4000
    or char_length(coalesce(p_trading_name,'')) > 200 then
    raise exception 'Invalid business enrollment' using errcode='22023';
  end if;
  -- Serialize enrollment per identity to avoid duplicate businesses on retry.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text, 0));
  if p_business_id is null then
    select * into target from public.businesses where owner_id=caller order by created_at desc limit 1 for update;
    if not found then
      insert into public.businesses(owner_id,name,address,timezone,booking_enabled,verified)
      values(caller,coalesce(nullif(trim(p_trading_name),''),trim(p_legal_name)),trim(p_address),'Europe/Madrid',false,false)
      returning * into target;
    end if;
  else
    select * into target from public.businesses where id=p_business_id and owner_id=caller for update;
    if not found then raise exception 'Business not found' using errcode='42501'; end if;
  end if;
  if target.verified then raise exception 'Use verified business configuration' using errcode='42501'; end if;
  update public.businesses set name=coalesce(nullif(trim(p_trading_name),''),trim(p_legal_name)),
    address=trim(p_address),booking_enabled=false,verified=false where id=target.id returning * into target;
  insert into public.business_verification_requests(business_id,legal_name,tax_id,trading_name,address,status)
  values(target.id,trim(p_legal_name),trim(p_tax_id),trim(coalesce(p_trading_name,'')),trim(p_address),'pending')
  on conflict(business_id) do update set legal_name=excluded.legal_name,tax_id=excluded.tax_id,
    trading_name=excluded.trading_name,address=excluded.address,status='pending',rejection_reason=null,updated_at=now();
  return next target;
end;
$$;
revoke all on function public.submit_business_verification(uuid,text,text,text,text) from public, anon;
grant execute on function public.submit_business_verification(uuid,text,text,text,text) to authenticated;

-- Private resource permissions also apply to direct Supabase access.
alter policy businesses_public_read on public.businesses using (booking_enabled=true and verified=true);
alter policy services_public_read on public.services using (active=true and exists(
  select 1 from public.businesses b where b.id=business_id and b.booking_enabled=true and b.verified=true));
alter policy staff_public_read on public.staff using (active=true and exists(
  select 1 from public.businesses b where b.id=business_id and b.booking_enabled=true and b.verified=true));
alter policy availability_public_read on public.availability using (active=true and exists(
  select 1 from public.businesses b where b.id=business_id and b.booking_enabled=true and b.verified=true));
alter policy services_owner_manage on public.services
using (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid() and b.verified=true))
with check (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid() and b.verified=true));
alter policy staff_owner_manage on public.staff
using (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid() and b.verified=true))
with check (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid() and b.verified=true));
alter policy availability_owner_manage on public.availability
using (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid() and b.verified=true))
with check (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid() and b.verified=true));
alter policy business_settings_owner on public.business_settings
using (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid() and b.verified=true))
with check (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid() and b.verified=true));
alter policy bookings_business_manage on public.bookings
using (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid() and b.verified=true))
with check (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid() and b.verified=true));
alter policy bookings_customer_create on public.bookings with check (customer_id=auth.uid() and exists(
  select 1 from public.businesses b where b.id=business_id and b.booking_enabled=true and b.verified=true));

-- An unverified owner keeps personal customer cancellation rights, but cannot
-- use those rights to regain enterprise privileges on their own bookings.
create or replace function public.guard_customer_booking_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if exists (select 1 from public.businesses b where b.id=old.business_id and b.owner_id=auth.uid() and b.verified=true) then
    return new;
  end if;
  if old.customer_id <> auth.uid()
    or old.status not in ('PENDING', 'CONFIRMED', 'CANCELLED')
    or new.status <> 'CANCELLED'
    or (to_jsonb(new) - 'status' - 'updated_at' - 'resource_id') is distinct from (to_jsonb(old) - 'status' - 'updated_at' - 'resource_id') then
    raise exception 'Customers may only cancel their own active bookings' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_customer_booking_update() from public, anon, authenticated;
commit;
