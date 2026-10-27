-- REVIEW DRAFT ONLY. Apply after booking timeline, gap and phase upgrades.
-- No production activation, historical booking rewrite or automatic cancellation.
begin;

create table public.booking_calendar_exceptions (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete restrict,
 staff_id uuid references public.staff(id) on delete restrict,
 local_date date not null,
 timezone text not null,
 intervals jsonb not null check(jsonb_typeof(intervals)='array'),
 revision integer not null default 1 check(revision>0),
 active boolean not null default true,
 created_by uuid not null references public.profiles(id) on delete restrict,
 updated_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create unique index booking_calendar_exception_day on public.booking_calendar_exceptions
 (business_id,coalesce(staff_id,'00000000-0000-0000-0000-000000000000'::uuid),local_date);
alter table public.booking_calendar_exceptions enable row level security;
create policy booking_calendar_exception_owner_read on public.booking_calendar_exceptions for select to authenticated
 using(exists(select 1 from public.businesses b where b.id=business_id and b.verified and b.owner_id=(select auth.uid())));
revoke all on public.booking_calendar_exceptions from public,anon,authenticated;
grant select on public.booking_calendar_exceptions to authenticated;

create table go_booking_timeline_private.calendar_exception_events (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete restrict,
 exception_id uuid not null references public.booking_calendar_exceptions(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 request_key text not null,
 operation text not null check(operation in ('create','update','delete')),
 command jsonb not null,
 previous_value jsonb,
 next_value jsonb not null,
 affected_bookings jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(business_id,actor_id,request_key)
);
alter table go_booking_timeline_private.calendar_exception_events enable row level security;
revoke all on go_booking_timeline_private.calendar_exception_events from public,anon,authenticated;

create function go_booking_timeline_private.calendar_intervals(p_value jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare item jsonb; previous_end integer:=-1; result jsonb:='[]'; a integer; z integer;
begin
 if jsonb_typeof(p_value) is distinct from 'array' or jsonb_array_length(p_value) not between 1 and 32 then
  raise exception using errcode='PT422',message='BOOKING_CALENDAR_INVALID_INTERVALS';end if;
 for item in select value from jsonb_array_elements(p_value) order by (value->>'startMinute')::numeric loop
  if jsonb_typeof(item)<>'object' or item->>'kind' not in ('open','closed') or item->>'kind' is null
   or exists(select 1 from jsonb_object_keys(item) k where k not in ('kind','startMinute','endMinute'))
   or jsonb_typeof(item->'startMinute') is distinct from 'number' or jsonb_typeof(item->'endMinute') is distinct from 'number'
   or (item->>'startMinute')!~'^[0-9]+$' or (item->>'endMinute')!~'^[0-9]+$'
   or (item->>'startMinute')::numeric not between 0 and 1439 or (item->>'endMinute')::numeric not between 1 and 1440 then
   raise exception using errcode='PT422',message='BOOKING_CALENDAR_INVALID_INTERVALS';end if;
  a:=(item->>'startMinute')::integer;z:=(item->>'endMinute')::integer;
  if z<=a or a<previous_end then raise exception using errcode='PT422',message='BOOKING_CALENDAR_OVERLAP';end if;
  result:=result||jsonb_build_array(jsonb_build_object('kind',item->>'kind','startMinute',a,'endMinute',z));previous_end:=z;
 end loop;
 return result;
end; $$;

-- Write-time validation rejects non-existent or ambiguous local endpoints.
-- Full local days still cover 23/25 hours on DST transitions, without UTC dates.
create function go_booking_timeline_private.calendar_boundary(p_date date,p_minute integer,p_zone text)
returns timestamptz language plpgsql stable set search_path='' as $$
declare wall timestamp:=p_date::timestamp+p_minute*interval '1 minute'; instant timestamptz:=wall at time zone p_zone;
begin
 if instant at time zone p_zone<>wall then raise exception using errcode='PT422',message='BOOKING_CALENDAR_NONEXISTENT_TIME';end if;
 if exists(select 1 from generate_series(instant-interval '26 hours',instant+interval '26 hours',interval '1 minute') t
  where t<>instant and t at time zone p_zone=wall) then
  raise exception using errcode='PT422',message='BOOKING_CALENDAR_AMBIGUOUS_TIME';end if;
 return instant;
end; $$;

create function go_booking_timeline_private.calendar_ranges(p_business uuid,p_staff uuid,p_kind text,
 p_start timestamptz,p_end timestamptz,p_all_staff boolean default false)
returns tstzmultirange language sql stable set search_path='' as $$
 select coalesce(range_agg(tstzrange(
  (e.local_date::timestamp+(i->>'startMinute')::integer*interval '1 minute') at time zone e.timezone,
  (e.local_date::timestamp+(i->>'endMinute')::integer*interval '1 minute') at time zone e.timezone,'[)')),'{}'::tstzmultirange)
 from public.booking_calendar_exceptions e cross join lateral jsonb_array_elements(e.intervals) i
 where e.business_id=p_business and e.active and i->>'kind'=p_kind
 and (e.staff_id is not distinct from p_staff or p_all_staff and e.staff_id is not null
  and exists(select 1 from public.staff s where s.id=e.staff_id and s.business_id=e.business_id and s.active
   and coalesce(s.ui_metadata->>'archived','false')<>'true'))
 and e.local_date between (p_start at time zone e.timezone)::date-1 and (p_end at time zone e.timezone)::date+1;
$$;

-- The previous weekly query is preserved as the base of the ONE window engine.
create function go_booking_timeline_private.recurring_shift_windows(p_business uuid,p_staff uuid,p_service uuid,
 p_start timestamptz,p_end timestamptz)
returns tstzmultirange language sql stable set search_path='' as $$
 select coalesce(range_agg(tstzrange(
   (dates.day::date+a.start_time) at time zone a.timezone,
   (dates.day::date+a.end_time+case when coalesce(a.ui_metadata->>'endNextDay','false')='true'
    then interval '1 day' else interval '0' end) at time zone a.timezone,'[)')),'{}'::tstzmultirange)
 from public.availability a
 cross join lateral generate_series((p_start at time zone a.timezone)::date-1,
  (p_end at time zone a.timezone)::date,interval '1 day') dates(day)
 where a.business_id=p_business and a.staff_id is not distinct from p_staff
 and a.active and coalesce(a.ui_metadata->>'archived','false')<>'true'
 and (p_service is null or nullif(a.ui_metadata->>'bookableItemId','') is null or a.ui_metadata->>'bookableItemId'=p_service::text)
 and a.weekday=extract(dow from dates.day);
$$;

create or replace function go_booking_timeline_private.shift_windows(p_business uuid,p_staff uuid,p_service uuid,
 p_start timestamptz,p_end timestamptz)
returns tstzmultirange language plpgsql stable set search_path='' as $$
declare company tstzmultirange; professional tstzmultirange; additions tstzmultirange; closures tstzmultirange; has_staff boolean;
begin
 company:=go_booking_timeline_private.recurring_shift_windows(p_business,null,p_service,p_start,p_end)
  +go_booking_timeline_private.calendar_ranges(p_business,null,'open',p_start,p_end);
 closures:=go_booking_timeline_private.calendar_ranges(p_business,null,'closed',p_start,p_end);
 if p_staff is null then
  -- The premises may open for one explicitly selected professional. Other
  -- professionals still need THEIR own effective window below.
  return (company+go_booking_timeline_private.calendar_ranges(p_business,null,'open',p_start,p_end,true))-closures;
 end if;
 select exists(select 1 from public.availability a where a.business_id=p_business and a.staff_id=p_staff
  and a.active and coalesce(a.ui_metadata->>'archived','false')<>'true') into has_staff;
 professional:=case when has_staff then go_booking_timeline_private.recurring_shift_windows(p_business,p_staff,p_service,p_start,p_end) else company end;
 additions:=go_booking_timeline_private.calendar_ranges(p_business,p_staff,'open',p_start,p_end);
 return ((company+additions)-closures)*((professional+additions)-go_booking_timeline_private.calendar_ranges(p_business,p_staff,'closed',p_start,p_end));
end; $$;

create or replace function go_booking_timeline_private.in_shift(p_business uuid,p_staff uuid,p_service uuid,
 p_start timestamptz,p_end timestamptz,p_require boolean default true)
returns boolean language sql stable set search_path='' as $$
 select go_booking_timeline_private.shift_windows(p_business,p_staff,p_service,p_start,p_end) @> tstzrange(p_start,p_end,'[)');
$$;

create or replace function go_booking_timeline_private.available_segments(p_business uuid,p_staff uuid,p_from timestamptz,p_to timestamptz)
returns tstzmultirange language plpgsql stable set search_path='' as $$
declare windows tstzmultirange;blocks jsonb;closed tstzmultirange;
begin
 windows:=go_booking_timeline_private.shift_windows(p_business,p_staff,null,p_from,p_to);
 select coalesce(b.ui_metadata->'bookingBlocks','[]')||coalesce(s.ui_metadata->'bookingBlocks','[]') into blocks
 from public.businesses b left join public.staff s on s.business_id=b.id and s.id=p_staff where b.id=p_business;
 perform go_booking_timeline_private.blocked(blocks,p_from,p_to);
 select coalesce(range_agg(tstzrange((b->>'startsAt')::timestamptz,(b->>'endsAt')::timestamptz,'[)')),'{}'::tstzmultirange)
 into closed from jsonb_array_elements(blocks) b;
 return windows-closed;
end; $$;

create function go_booking_timeline_private.calendar_conflicts(p_business uuid,p_staff uuid,p_date date,p_zone text,p_intervals jsonb)
returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('bookingId',b.id,'customerName',p.full_name,'serviceName',s.name,
 'staffName',t.display_name,'startsAt',b.starts_at,'endsAt',b.ends_at,'status',b.status) order by b.starts_at,b.id),'[]'::jsonb)
 from public.bookings b join public.profiles p on p.id=b.customer_id join public.services s on s.id=b.service_id
 left join public.staff t on t.id=b.staff_id and t.business_id=b.business_id
 where b.business_id=p_business and b.status in ('PENDING','CONFIRMED') and exists(
  select 1 from jsonb_array_elements(p_intervals) i
  cross join lateral (select (p_date::timestamp+(i->>'startMinute')::integer*interval '1 minute') at time zone p_zone a,
    (p_date::timestamp+(i->>'endMinute')::integer*interval '1 minute') at time zone p_zone z) span
  where i->>'kind'='closed' and b.starts_at<span.z and b.ends_at>span.a
   and (p_staff is null or b.timing_snapshot is null and (b.staff_id is null or b.staff_id=p_staff)
    or exists(select 1 from jsonb_array_elements(b.timing_snapshot->'workIntervals') w
     where (w->>'staffId' is null or w->>'staffId'=p_staff::text)
      and (w->>'startsAt')::timestamptz<span.z and (w->>'endsAt')::timestamptz>span.a)));
$$;

create function go_booking_timeline_private.calendar_list(p_business uuid,p_date date,p_staff uuid,p_from date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.businesses; rows jsonb; opened tstzmultirange;closed tstzmultirange;a timestamptz;z timestamptz;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('go-booking:'||p_business::text,0));
 select * into company from public.businesses b where b.id=p_business and b.verified and b.owner_id=auth.uid();
 if not found then raise exception using errcode='42501',message='BOOKING_FORBIDDEN';end if;
 if p_staff is not null and not exists(select 1 from public.staff s where s.id=p_staff and s.business_id=p_business and s.active
  and coalesce(s.ui_metadata->>'archived','false')<>'true') then raise exception using errcode='PT422',message='BOOKING_STAFF_UNAVAILABLE';end if;
 if p_date is null or p_from is null or p_date<'1000-01-01' or p_date>'9998-12-31' then
  raise exception using errcode='PT422',message='BOOKING_INVALID_RANGE';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'businessId',e.business_id,'staffId',e.staff_id,'dateISO',e.local_date,
  'timezone',e.timezone,'intervals',e.intervals,'revision',e.revision,'createdBy',e.created_by,'updatedBy',e.updated_by,
  'createdAt',e.created_at,'updatedAt',e.updated_at,'conflicts',go_booking_timeline_private.calendar_conflicts(e.business_id,e.staff_id,e.local_date,e.timezone,e.intervals))
  order by e.local_date,e.staff_id nulls first),'[]'::jsonb) into rows
 from public.booking_calendar_exceptions e where e.business_id=p_business and e.active and (e.local_date>=p_from or e.local_date=p_date);
 a:=p_date::timestamp at time zone company.timezone;z:=(p_date+1)::timestamp at time zone company.timezone;
 opened:=go_booking_timeline_private.available_segments(p_business,p_staff,a,z)*tstzmultirange(tstzrange(a,z,'[)'));
 closed:=tstzmultirange(tstzrange(a,z,'[)'))-opened;
 return jsonb_build_object('timezone',company.timezone,'exceptions',rows,'day',jsonb_build_object('dateISO',p_date,'staffId',p_staff,
  'openIntervals',coalesce((select jsonb_agg(jsonb_build_object('startsAt',lower(r),'endsAt',upper(r)) order by lower(r)) from unnest(opened) r),'[]'::jsonb),
  'closedIntervals',coalesce((select jsonb_agg(jsonb_build_object('startsAt',lower(r),'endsAt',upper(r)) order by lower(r)) from unnest(closed) r),'[]'::jsonb)));
end; $$;

create function go_booking_timeline_private.calendar_save(p_business uuid,p_staff uuid,p_date date,p_intervals jsonb,
 p_expected integer,p_request text,p_delete boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.businesses; old public.booking_calendar_exceptions; saved public.booking_calendar_exceptions;
 previous go_booking_timeline_private.calendar_exception_events; normalized jsonb;command jsonb;conflicts jsonb;item jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('go-booking:'||p_business::text,0));
 select * into company from public.businesses b where b.id=p_business and b.verified and b.owner_id=auth.uid();
 if not found then raise exception using errcode='42501',message='BOOKING_FORBIDDEN';end if;
 if p_staff is not null and not exists(select 1 from public.staff s where s.id=p_staff and s.business_id=p_business and s.active
  and coalesce(s.ui_metadata->>'archived','false')<>'true') then raise exception using errcode='PT422',message='BOOKING_STAFF_UNAVAILABLE';end if;
 if p_date is null or p_date<'1000-01-01' or p_date>'9998-12-31' or p_expected is null or p_expected<0 or p_delete is null
  or p_request is null or p_request!~'^[A-Za-z0-9_-]{1,128}$' then raise exception using errcode='PT422',message='BOOKING_INVALID_COMMAND';end if;
 normalized:=case when p_delete then '[]'::jsonb else go_booking_timeline_private.calendar_intervals(p_intervals) end;
 command:=jsonb_build_object('staffId',p_staff,'dateISO',p_date,'intervals',normalized,'expectedRevision',p_expected,'delete',p_delete);
 select * into previous from go_booking_timeline_private.calendar_exception_events where business_id=p_business and actor_id=auth.uid() and request_key=p_request;
 if found then
  if previous.command is distinct from command then raise exception using errcode='PT409',message='BOOKING_REQUEST_REUSED';end if;
  return go_booking_timeline_private.calendar_list(p_business,p_date,p_staff,(now() at time zone company.timezone)::date);
 end if;
 select * into old from public.booking_calendar_exceptions e where e.business_id=p_business and e.staff_id is not distinct from p_staff and e.local_date=p_date for update;
 if old.active and old.revision<>p_expected or not coalesce(old.active,false) and p_expected<>0 or p_delete and not coalesce(old.active,false) then
  raise exception using errcode='PT409',message='BOOKING_CALENDAR_CHANGED';end if;
 for item in select value from jsonb_array_elements(normalized) loop
  if go_booking_timeline_private.calendar_boundary(p_date,(item->>'endMinute')::integer,company.timezone)
   <=go_booking_timeline_private.calendar_boundary(p_date,(item->>'startMinute')::integer,company.timezone) then
   raise exception using errcode='PT422',message='BOOKING_CALENDAR_INVALID_INTERVALS';end if;
 end loop;
 conflicts:=go_booking_timeline_private.calendar_conflicts(p_business,p_staff,p_date,company.timezone,normalized);
 if old.id is null then
  insert into public.booking_calendar_exceptions(business_id,staff_id,local_date,timezone,intervals,created_by,updated_by)
   values(p_business,p_staff,p_date,company.timezone,normalized,auth.uid(),auth.uid()) returning * into saved;
 else
  update public.booking_calendar_exceptions set intervals=normalized,timezone=company.timezone,active=not p_delete,
   revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=old.id returning * into saved;
 end if;
 insert into go_booking_timeline_private.calendar_exception_events(business_id,exception_id,actor_id,request_key,operation,command,previous_value,next_value,affected_bookings)
 values(p_business,saved.id,auth.uid(),p_request,case when p_delete then 'delete' when coalesce(old.active,false) then 'update' else 'create' end,
  command,case when old.id is null then null else to_jsonb(old) end,to_jsonb(saved),conflicts);
 return go_booking_timeline_private.calendar_list(p_business,p_date,p_staff,(now() at time zone company.timezone)::date);
end; $$;

create function public.go_booking_calendar_exceptions(p_business_id uuid,p_date_iso date,p_staff_id uuid default null,p_from_date date default null)
returns jsonb language sql security invoker set search_path='' as $$
 select go_booking_timeline_private.calendar_list(p_business_id,p_date_iso,p_staff_id,coalesce(p_from_date,p_date_iso));
$$;
create function public.go_save_booking_calendar_exception(p_business_id uuid,p_date_iso date,p_staff_id uuid,p_intervals jsonb,
 p_expected_revision integer,p_request_key text,p_delete boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
 select go_booking_timeline_private.calendar_save(p_business_id,p_staff_id,p_date_iso,p_intervals,p_expected_revision,p_request_key,p_delete);
$$;

-- Only the two guarded owner RPCs are new public capabilities. No direct writes.
revoke all on function go_booking_timeline_private.calendar_intervals(jsonb),
 go_booking_timeline_private.calendar_boundary(date,integer,text),
 go_booking_timeline_private.calendar_ranges(uuid,uuid,text,timestamptz,timestamptz,boolean),
 go_booking_timeline_private.recurring_shift_windows(uuid,uuid,uuid,timestamptz,timestamptz),
 go_booking_timeline_private.calendar_conflicts(uuid,uuid,date,text,jsonb),
 go_booking_timeline_private.calendar_list(uuid,date,uuid,date),
 go_booking_timeline_private.calendar_save(uuid,uuid,date,jsonb,integer,text,boolean),
 public.go_booking_calendar_exceptions(uuid,date,uuid,date),
 public.go_save_booking_calendar_exception(uuid,date,uuid,jsonb,integer,text,boolean) from public,anon,authenticated;
grant execute on function go_booking_timeline_private.calendar_list(uuid,date,uuid,date),
 go_booking_timeline_private.calendar_save(uuid,uuid,date,jsonb,integer,text,boolean),
 public.go_booking_calendar_exceptions(uuid,date,uuid,date),
 public.go_save_booking_calendar_exception(uuid,date,uuid,jsonb,integer,text,boolean) to authenticated;
commit;
