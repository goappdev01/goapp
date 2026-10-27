-- Connect an explicitly registered local configuration to the canonical booking
-- engine. No public booking activation, data deletion or permission by name.
begin;
create or replace function public.go_booking_calendar_business(p_source_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.businesses;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED';end if;
 if p_source_id is null or length(p_source_id) not between 1 and 256 then raise exception using errcode='PT422',message='BOOKING_INVALID_COMMAND';end if;
 select b.* into company from public.businesses b
 where b.verified and b.owner_id=auth.uid() and (b.id::text=p_source_id or exists(
  select 1 from go_booking_timeline_private.calendar_business_links l
  where l.business_id=b.id and l.owner_id=auth.uid() and l.source_id=p_source_id));
 if not found then raise exception using errcode='PT404',message='BOOKING_CALENDAR_BUSINESS_NOT_LINKED';end if;
 return jsonb_build_object('businessId',company.id,'sourceId',p_source_id,'name',company.name,'timezone',company.timezone,
  'bookingAuthority',exists(select 1 from go_booking_timeline_private.calendar_business_links l where l.business_id=company.id and l.owner_id=auth.uid()),
  'serviceLinks',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'sourceId',s.ui_metadata->>'calendarSourceServiceId') order by s.id),'[]')
   from public.services s where s.business_id=company.id),
  'staffLinks',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'sourceId',s.ui_metadata->>'calendarSourceStaffId') order by s.id),'[]')
   from public.staff s where s.business_id=company.id),
  'bookingLinks',(select coalesce(jsonb_agg(jsonb_build_object('id',s.booking_id,'sourceId',s.source_id) order by s.booking_id),'[]')
   from go_booking_timeline_private.calendar_booking_sources s where s.business_id=company.id));
end; $$;
revoke all on function public.go_booking_calendar_business(text) from public,anon;
grant execute on function public.go_booking_calendar_business(text) to authenticated;

-- Owners may test their explicitly linked private business through the SAME
-- engine. Other customers still require public booking_enabled=true.
create function go_booking_timeline_private.calendar_can_book(p_business uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.businesses b where b.id=p_business and b.verified
  and (b.booking_enabled or (b.owner_id=auth.uid() and exists(select 1 from go_booking_timeline_private.calendar_business_links l
   where l.business_id=b.id and l.owner_id=auth.uid()))));
$$;
revoke all on function go_booking_timeline_private.calendar_can_book(uuid) from public,anon,authenticated;

-- Preserve the reviewed minute, phase, gap, resource and locking algorithms.
-- Refuse an unknown engine version rather than silently patching its logic.
do $$ declare body text; begin
 select pg_get_functiondef('go_booking_timeline_private.plan(uuid,uuid[],timestamp with time zone,uuid,jsonb,uuid,uuid)'::regprocedure) into body;
 if position('not business.verified or not business.booking_enabled' in body)=0 then raise exception 'Unexpected booking plan version';end if;
 body:=replace(body,'not business.verified or not business.booking_enabled','not go_booking_timeline_private.calendar_can_book(business.id)');execute body;
 select pg_get_functiondef('go_booking_timeline_private.availability(uuid,uuid[],timestamp with time zone,timestamp with time zone,uuid,integer,date,integer,boolean)'::regprocedure) into body;
 if position('where id=p_business_id and verified and booking_enabled' in body)=0 then raise exception 'Unexpected booking availability version';end if;
 body:=replace(body,'where id=p_business_id and verified and booking_enabled','where id=p_business_id and go_booking_timeline_private.calendar_can_book(id)');execute body;
end; $$;
notify pgrst,'reload schema';
commit;
