-- Reviewed identity linkage for pre-existing local configuration documents.
-- No automatic company creation, verification, matching by name or client writes.
begin;
create table go_booking_timeline_private.calendar_business_links (
 source_id text not null check(length(source_id) between 1 and 256),
 owner_id uuid not null references public.profiles(id),
 business_id uuid not null unique references public.businesses(id),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,source_id)
);
alter table go_booking_timeline_private.calendar_business_links enable row level security;
revoke all on go_booking_timeline_private.calendar_business_links from public,anon,authenticated;
create function public.go_booking_calendar_business(p_source_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.businesses;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED';end if;
 if p_source_id is null or length(p_source_id) not between 1 and 256 then
  raise exception using errcode='PT422',message='BOOKING_INVALID_COMMAND';end if;
 select b.* into company from public.businesses b
  join go_booking_timeline_private.calendar_business_links l on l.business_id=b.id
  where l.owner_id=auth.uid() and l.source_id=p_source_id and b.owner_id=auth.uid() and b.verified;
 if not found then raise exception using errcode='PT404',message='BOOKING_CALENDAR_BUSINESS_NOT_LINKED';end if;
 return jsonb_build_object('businessId',company.id,'sourceId',p_source_id,'name',company.name,'timezone',company.timezone);
end; $$;
revoke all on function public.go_booking_calendar_business(text) from public,anon,authenticated;
grant execute on function public.go_booking_calendar_business(text) to authenticated;
-- Traceability only: one existing source booking maps to one canonical booking.
-- Does not create another reservation/availability store or expose private source payloads.
create table go_booking_timeline_private.calendar_booking_sources (
 business_id uuid not null references public.businesses(id),
 source_id text not null,
 booking_id uuid not null unique references public.bookings(id),
 source_snapshot jsonb not null,
 imported_at timestamptz not null default clock_timestamp(),
 primary key(business_id,source_id)
);
alter table go_booking_timeline_private.calendar_booking_sources enable row level security;
revoke all on go_booking_timeline_private.calendar_booking_sources from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
