-- REVIEW / LOCAL ACTIVATION. Configure an owned business without reinterpreting commitments.
begin;
create or replace function public.go_booking_calendar_business(p_source_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.businesses;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED';end if;
 if p_source_id is null or length(p_source_id) not between 1 and 256 then raise exception using errcode='PT422',message='BOOKING_INVALID_COMMAND';end if;
 select b.* into company from public.businesses b where b.owner_id=auth.uid() and b.verified
  and (b.id::text=lower(p_source_id) or exists(select 1 from go_booking_timeline_private.calendar_business_links l
   where l.business_id=b.id and l.owner_id=auth.uid() and l.source_id=p_source_id));
 if not found then raise exception using errcode='PT404',message='BOOKING_CALENDAR_BUSINESS_NOT_LINKED';end if;
 return jsonb_build_object('businessId',company.id,'sourceId',p_source_id,'name',company.name,'timezone',company.timezone);
end; $$;

create function public.go_set_booking_calendar_timezone(p_business_id uuid,p_timezone text,p_expected_timezone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.businesses;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('go-booking:'||p_business_id::text,0));
 select * into company from public.businesses b where b.id=p_business_id and b.owner_id=auth.uid() and b.verified for update;
 if not found then raise exception using errcode='42501',message='BOOKING_FORBIDDEN';end if;
 if p_timezone is null or length(p_timezone)>120 or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
  raise exception using errcode='PT422',message='BOOKING_INVALID_TIMEZONE';end if;
 if company.timezone<>p_timezone then
  if company.timezone is distinct from p_expected_timezone then raise exception using errcode='PT409',message='BOOKING_CALENDAR_CHANGED';end if;
  -- No silent conversion of booked local dates/hours or existing dated exceptions.
  if exists(select 1 from public.bookings b where b.business_id=p_business_id)
   or exists(select 1 from public.booking_calendar_exceptions e where e.business_id=p_business_id and e.active) then
   raise exception using errcode='PT409',message='BOOKING_TIMEZONE_HAS_COMMITMENTS';end if;
  update public.businesses set timezone=p_timezone where id=p_business_id;
  update public.availability set timezone=p_timezone where business_id=p_business_id and timezone=company.timezone;
 end if;
 update public.business_settings set payload=jsonb_set(payload,'{timezone}',to_jsonb(p_timezone),true),updated_at=clock_timestamp()
  where business_id=p_business_id and payload->>'timezone' is distinct from p_timezone;
 return jsonb_build_object('businessId',p_business_id,'timezone',p_timezone);
end; $$;
revoke all on function public.go_booking_calendar_business(text),public.go_set_booking_calendar_timezone(uuid,text,text) from public,anon,authenticated;
grant execute on function public.go_booking_calendar_business(text),public.go_set_booking_calendar_timezone(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
