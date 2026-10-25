-- REVIEW DRAFT ONLY. Never activate against GO without review/authorization.
-- Prerequisites: committed migrations, booking_negotiation_v1, booking_verification_v1.
-- Existing booking rows are never rewritten. All scheduling uses ONE engine below.
begin;
create schema go_booking_timeline_private;
revoke all on schema go_booking_timeline_private from public,anon,authenticated;
grant usage on schema go_booking_timeline_private to authenticated;

alter table public.bookings add column timing_snapshot jsonb,
 add column timing_request_key text, add column timing_command jsonb;
alter table public.bookings add constraint booking_timing_shape check (
 (timing_snapshot is null and timing_request_key is null and timing_command is null)
 or (timing_snapshot is not null and jsonb_typeof(timing_snapshot)='object'
 and timing_snapshot->>'version'='1' and jsonb_typeof(timing_snapshot->'phases')='array'));
create unique index booking_timing_request_unique on public.bookings(customer_id,timing_request_key)
 where timing_request_key is not null;
alter table public.availability drop constraint availability_check;
alter table public.availability add constraint availability_interval_shape check (
 (not(ui_metadata ? 'endNextDay') or jsonb_typeof(ui_metadata->'endNextDay')='boolean')
 and ((end_time>start_time and coalesce(ui_metadata->>'endNextDay','false')<>'true')
 or (end_time<start_time and coalesce(ui_metadata->>'endNextDay','false')='true')));

-- Keep the original exclusion for legacy-vs-legacy safety. The engine checks
-- EVERY pairing, including legacy wildcard staff, under the same business lock.
alter table public.bookings drop constraint bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap exclude using gist
 (resource_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
 where(status in ('PENDING','CONFIRMED') and timing_snapshot is null);

create function go_booking_timeline_private.shift(p_plan jsonb,p_start timestamptz)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb:=p_plan; key text; rows jsonb; item jsonb; delta interval;
begin
 delta:=p_start-(p_plan->>'startsAt')::timestamptz;
 foreach key in array array['phases','workIntervals','resourceIntervals'] loop
  rows:='[]';
  for item in select value from jsonb_array_elements(coalesce(p_plan->key,'[]')) loop
   rows:=rows||jsonb_build_array(item||jsonb_build_object(
    'startsAt',(item->>'startsAt')::timestamptz+delta,'endsAt',(item->>'endsAt')::timestamptz+delta));
  end loop;
  result:=jsonb_set(result,array[key],rows);
 end loop;
 return result||jsonb_build_object('startsAt',p_start,'endsAt',(p_plan->>'endsAt')::timestamptz+delta);
end; $$;

-- Conservative projection: no historical phases are inferred from today's
-- catalogue. NULL staff remains a business-wide wildcard exactly as before.
create function go_booking_timeline_private.legacy(p_booking public.bookings)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('version',1,'legacy',true,'startsAt',p_booking.starts_at,'endsAt',p_booking.ends_at,
 'staffId',p_booking.staff_id,'serviceIds',coalesce(nullif(to_jsonb(p_booking)->'service_ids','null'::jsonb),jsonb_build_array(p_booking.service_id)),
 'totalClientMinutes',extract(epoch from(p_booking.ends_at-p_booking.starts_at))/60,
 'totalDurationMinutes',extract(epoch from(p_booking.ends_at-p_booking.starts_at))/60,
 'workMinutes',extract(epoch from(p_booking.ends_at-p_booking.starts_at))/60,'waitMinutes',0,
 'resourcesConfigured',false,'phases','[]'::jsonb,'resourceIntervals','[]'::jsonb,
 'workIntervals',jsonb_build_array(jsonb_build_object('startsAt',p_booking.starts_at,'endsAt',p_booking.ends_at,
 'staffId',p_booking.staff_id,'serviceId',p_booking.service_id)));
$$;

create function go_booking_timeline_private.blocked(p_blocks jsonb,p_start timestamptz,p_end timestamptz)
returns boolean language plpgsql immutable set search_path='' as $$
declare block jsonb; a timestamptz; z timestamptz;
begin
 if p_blocks is null then return false; end if;
 if jsonb_typeof(p_blocks)<>'array' then raise exception using errcode='PT422',message='BOOKING_INVALID_BLOCKS'; end if;
 for block in select value from jsonb_array_elements(p_blocks) loop
  begin
   a:=(block->>'startsAt')::timestamptz;z:=(block->>'endsAt')::timestamptz;
   if a is null or z is null or not isfinite(a) or not isfinite(z) or z<=a then raise invalid_parameter_value; end if;
  exception when others then raise exception using errcode='PT422',message='BOOKING_INVALID_BLOCKS';end;
  if a<p_end and z>p_start then return true;end if;
 end loop;
 return false;
end; $$;

-- Every instant must be covered: adjacent shifts may join, genuine gaps cannot.
-- Overnight shifts use metadata.endNextDay=true with an allowed SQL time pair;
-- weekday belongs to the starting local day. UTC iteration handles DST/night.
create function go_booking_timeline_private.shift_windows(p_business uuid,p_staff uuid,p_service uuid,
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
create function go_booking_timeline_private.in_shift(p_business uuid,p_staff uuid,p_service uuid,
 p_start timestamptz,p_end timestamptz,p_require boolean default true)
returns boolean language plpgsql stable set search_path='' as $$
declare ok boolean; has_shifts boolean;
begin
 select exists(select 1 from public.availability a where a.business_id=p_business
  and a.staff_id is not distinct from p_staff and a.active
  and coalesce(a.ui_metadata->>'archived','false')<>'true') into has_shifts;
 if not has_shifts then return not p_require; end if;
 select go_booking_timeline_private.shift_windows(p_business,p_staff,p_service,p_start,p_end)
  @> tstzrange(p_start,p_end,'[)') into ok;
 return ok;
end; $$;

create function go_booking_timeline_private.work_free(p_business uuid,p_staff uuid,p_start timestamptz,
 p_end timestamptz,p_exclude uuid)
returns boolean language sql stable set search_path='' as $$
 select not exists(select 1 from public.bookings b
 where b.business_id=p_business and b.id is distinct from p_exclude and b.status in ('PENDING','CONFIRMED')
 and b.starts_at<p_end and b.ends_at>p_start
 and ((b.timing_snapshot is null and (p_staff is null or b.staff_id is null or b.staff_id=p_staff))
  or (b.timing_snapshot is not null and exists(select 1 from jsonb_array_elements(b.timing_snapshot->'workIntervals') w
   where (p_staff is null or w->>'staffId' is null or w->>'staffId'=p_staff::text)
   and (w->>'startsAt')::timestamptz<p_end and (w->>'endsAt')::timestamptz>p_start))));
$$;

-- Single authority. Fresh plans compile canonical catalogue metadata. Frozen
-- plans only shift timestamps: service prices/durations/phase assignments stay.
create function go_booking_timeline_private.plan(p_business uuid,p_services uuid[],p_start timestamptz,
 p_staff uuid default null,p_frozen jsonb default null,p_exclude uuid default null,p_customer uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 business public.businesses; service public.services; professional public.staff;
 selected uuid; timing jsonb; phase jsonb; phases jsonb:='[]'; work jsonb:='[]'; resources jsonb:='[]';
 demands jsonb; demand jsonb; resource jsonb; resource_key text; quantity integer; capacity integer;
 phase_minutes integer; offset_minutes integer:=0; work_minutes integer:=0; wait_minutes integer:=0;
 a timestamptz; z timestamptz; assigned uuid; wanted uuid; default_staff uuid; candidate record; phase_key text; seen text[]:='{}';
 details jsonb:='[]'; money text; amount numeric:=0; known_price boolean:=true;
 configured boolean:=true; assigned_ok boolean; candidate_ok boolean; result jsonb; iv jsonb; other jsonb; tick timestamptz; used numeric;
 frozen_booking public.bookings;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED';end if;
 if p_customer is not null and p_customer<>auth.uid() and not exists(select 1 from public.businesses b
  where b.id=p_business and b.verified and b.owner_id=auth.uid()) then
  raise exception using errcode='42501',message='BOOKING_FORBIDDEN';end if;
 if p_exclude is not null then
  select * into frozen_booking from public.bookings b where b.id=p_exclude and b.business_id=p_business
   and (b.customer_id=auth.uid() or exists(select 1 from public.businesses company
    where company.id=b.business_id and company.verified and company.owner_id=auth.uid()));
  if not found or coalesce(p_customer,auth.uid())<>frozen_booking.customer_id then
   raise exception using errcode='42501',message='BOOKING_FORBIDDEN';end if;
  if p_frozen is distinct from coalesce(frozen_booking.timing_snapshot,go_booking_timeline_private.legacy(frozen_booking)) then
   raise exception using errcode='42501',message='BOOKING_FORBIDDEN';end if;
 elsif p_frozen is not null then
  raise exception using errcode='42501',message='BOOKING_FORBIDDEN';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||p_business::text,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking-customer:'||coalesce(p_customer,auth.uid())::text,0));
 select * into business from public.businesses where id=p_business;
 if not found or not business.verified or not business.booking_enabled then
  raise exception using errcode='PT422',message='BOOKING_BUSINESS_UNAVAILABLE';end if;
 if p_start is null or not isfinite(p_start) or p_start<=now()
  or (date_trunc('minute',p_start)<>p_start and not coalesce((p_frozen->>'legacy')::boolean,false)) then
  raise exception using errcode='PT422',message='BOOKING_INVALID_INTERVAL';end if;
 if p_services is null or cardinality(p_services) not between 1 and 32 or array_ndims(p_services)<>1
  or array_lower(p_services,1)<>1 or (select count(distinct s) from unnest(p_services) s)<>cardinality(p_services) then
  raise exception using errcode='PT422',message='BOOKING_INVALID_SERVICES';end if;
 if p_frozen is null then
  foreach selected in array p_services loop
   select * into service from public.services s where s.id=selected and s.business_id=p_business
    and s.active and coalesce(s.ui_metadata->>'archived','false')<>'true' and coalesce(s.ui_metadata->>'visible','true')<>'false'
    and coalesce(s.ui_metadata->>'reservable','true')<>'false' and coalesce(s.ui_metadata->>'catalogKind','service')<>'product';
   if not found then raise exception using errcode='PT422',message='BOOKING_SERVICE_UNAVAILABLE';end if;
   if money is not null and money<>service.currency then raise exception using errcode='PT422',message='BOOKING_MIXED_CURRENCY';end if;
   money:=service.currency;if service.price is null then known_price:=false;else amount:=amount+service.price;end if;
   timing:=service.ui_metadata->'timing';
   if timing is null then timing:=jsonb_build_object('version',1,'mode','simple','resourcesConfigured',false);end if;
   if jsonb_typeof(timing)<>'object' or timing->>'version' is distinct from '1' or coalesce(timing->>'mode','') not in ('simple','phases')
    or jsonb_typeof(timing->'resourcesConfigured') is distinct from 'boolean' then
    raise exception using errcode='PT422',message='BOOKING_INVALID_TIMING';end if;
   configured:=configured and (timing->>'resourcesConfigured')::boolean;
   if timing->>'mode'='simple' then
    if timing ? 'phases' then
     demands:=timing->'phases';
     if jsonb_typeof(demands) is distinct from 'array' or jsonb_array_length(demands)<>1
      or demands->0->>'kind' is distinct from 'work'
      or demands->0->'durationMinutes' is distinct from to_jsonb(service.duration_minutes) then
      raise exception using errcode='PT422',message='BOOKING_INVALID_TIMING';end if;
    else
     demands:=jsonb_build_array(jsonb_build_object('id','simple','name',service.name,'kind','work',
      'durationMinutes',service.duration_minutes,'resources','[]'::jsonb));
    end if;
   else
    if (timing->>'resourcesConfigured') is distinct from 'true' then
     raise exception using errcode='PT422',message='BOOKING_RESOURCE_CONFIGURATION_REQUIRED';end if;
    demands:=timing->'phases';
    if jsonb_typeof(demands) is distinct from 'array' or jsonb_array_length(demands) not between 1 and 64 then
     raise exception using errcode='PT422',message='BOOKING_INVALID_TIMING';end if;
   end if;
   seen:='{}';phase_minutes:=offset_minutes;
   for phase in select value from jsonb_array_elements(demands) loop
    if jsonb_typeof(phase)<>'object' or jsonb_typeof(phase->'id') is distinct from 'string'
     or nullif(phase->>'id','') is null or phase->>'id'=any(seen)
     or jsonb_typeof(phase->'name') is distinct from 'string'
     or nullif(phase->>'name','') is null or coalesce(phase->>'kind','') not in ('work','wait')
     or jsonb_typeof(phase->'durationMinutes') is distinct from 'number'
     or (phase->>'durationMinutes')!~'^[0-9]+$' or (phase->>'durationMinutes')::numeric not between 1 and 1440
     or jsonb_typeof(coalesce(phase->'resources','[]'))<>'array' then
     raise exception using errcode='PT422',message='BOOKING_INVALID_TIMING';end if;
    seen:=array_append(seen,phase->>'id');
    phase:=phase||jsonb_build_object('serviceId',selected,'offsetMinutes',offset_minutes);
    offset_minutes:=offset_minutes+(phase->>'durationMinutes')::integer;
    if offset_minutes>10080 then raise exception using errcode='PT422',message='BOOKING_INVALID_TIMING';end if;
    phases:=phases||jsonb_build_array(phase);
   end loop;
   details:=details||jsonb_build_array(jsonb_build_object('id',service.id,'title',service.name,
    'durationMinutes',offset_minutes-phase_minutes,'price',service.price,'currency',service.currency,'priceKnown',service.price is not null));
  end loop;
  result:=jsonb_build_object('version',1,'timezone',business.timezone,'serviceIds',to_jsonb(p_services),
   'startsAt',p_start,'endsAt',p_start+offset_minutes*interval '1 minute','totalClientMinutes',offset_minutes,
   'totalDurationMinutes',offset_minutes,'resourcesConfigured',configured,'phases',phases,'serviceDetails',details,
   'totalPrice',case when known_price then amount else null end,'currency',money);
 else
  result:=go_booking_timeline_private.shift(p_frozen,p_start);phases:=result->'phases';
  offset_minutes:=ceil(extract(epoch from((result->>'endsAt')::timestamptz-p_start))/60);
 end if;
 -- Unknown historical resources are conservative, in BOTH insertion orders.
 -- No catalogue-based chair allocation is invented for an existing receipt.
 if not coalesce((result->>'resourcesConfigured')::boolean,false) and exists(
  select 1 from public.bookings b cross join lateral jsonb_array_elements(coalesce(b.timing_snapshot->'resourceIntervals','[]')) r
  where b.business_id=p_business and b.id is distinct from p_exclude and b.status in ('PENDING','CONFIRMED')
  and (r->>'startsAt')::timestamptz<(result->>'endsAt')::timestamptz and (r->>'endsAt')::timestamptz>p_start) then
  raise exception using errcode='23P01',message='BOOKING_RESOURCE_CONFLICT';end if;
 z:=(result->>'endsAt')::timestamptz;
 foreach selected in array p_services loop
  perform 1 from public.services s where s.id=selected and s.business_id=p_business and s.active
   and coalesce(s.ui_metadata->>'archived','false')<>'true' and coalesce(s.ui_metadata->>'visible','true')<>'false'
    and coalesce(s.ui_metadata->>'reservable','true')<>'false' and coalesce(s.ui_metadata->>'catalogKind','service')<>'product';
  if not found then raise exception using errcode='PT422',message='BOOKING_SERVICE_UNAVAILABLE';end if;
 end loop;
 if exists(select 1 from public.bookings b where b.customer_id=coalesce(p_customer,auth.uid())
  and b.id is distinct from p_exclude and b.status in ('PENDING','CONFIRMED') and b.starts_at<z and b.ends_at>p_start) then
  raise exception using errcode='23P01',message='BOOKING_CUSTOMER_CONFLICT';end if;
 if not go_booking_timeline_private.in_shift(p_business,null,null,p_start,z,true)
  or go_booking_timeline_private.blocked(business.ui_metadata->'bookingBlocks',p_start,z) then
  raise exception using errcode='PT422',message='BOOKING_OUTSIDE_AVAILABILITY';end if;
 -- No preference means ONE qualified default professional for every implicit
 -- work phase. Only explicit per-phase staffId can request a staff handoff.
 if p_frozen is null and p_staff is null and exists(select 1 from jsonb_array_elements(result->'phases') p
   where p->>'kind'='work' and nullif(p->>'staffId','') is null)
   and exists(select 1 from public.staff s where s.business_id=p_business and s.active and coalesce(s.ui_metadata->>'archived','false')<>'true') then
  -- Evaluate the COMPLETE same plan for each professional, including resources
  -- and gap admission; an invalid first professional must not hide another.
  for candidate in select s.id from public.staff s where s.business_id=p_business and s.active
    and coalesce(s.ui_metadata->>'archived','false')<>'true' order by s.id loop
   begin
    return go_booking_timeline_private.plan(p_business,p_services,p_start,candidate.id,null,p_exclude,p_customer);
   exception when exclusion_violation then null;
    when sqlstate 'PT422' then
     if sqlerrm not in ('BOOKING_STAFF_UNAVAILABLE','BOOKING_OUTSIDE_AVAILABILITY','BOOKING_RESOURCE_UNAVAILABLE','BOOKING_NO_ASSIGNED_SERVICES','BOOKING_GAP_NOT_MULTIPLE') then raise;end if;
   end;
  end loop;
  raise exception using errcode='PT422',message='BOOKING_STAFF_UNAVAILABLE';
 end if;
 -- Legacy rows remain full-span and keep historical duration and identity.
 if coalesce((result->>'legacy')::boolean,false) then
  work:=result->'workIntervals';
 else
  phases:='[]';
  for phase in select value from jsonb_array_elements(result->'phases') loop
   selected:=(phase->>'serviceId')::uuid;
   a:=p_start+(phase->>'offsetMinutes')::integer*interval '1 minute';
   z:=a+(phase->>'durationMinutes')::integer*interval '1 minute';
   assigned:=null;assigned_ok:=false;
   if phase->>'kind'='work' then
    begin wanted:=coalesce(nullif(phase->>'staffId','')::uuid,p_staff,default_staff);
    exception when invalid_text_representation then raise exception using errcode='PT422',message='BOOKING_INVALID_TIMING';end;
    for candidate in
     select s.id from public.staff s where s.business_id=p_business and s.active
      and coalesce(s.ui_metadata->>'archived','false')<>'true' and (wanted is null or s.id=wanted)
      and not(p_frozen is not null and phase ? 'staffId' and phase->>'staffId' is null)
     union all select null::uuid where wanted is null and ((p_frozen is not null and phase ? 'staffId' and phase->>'staffId' is null)
      or not exists(select 1 from public.staff s where s.business_id=p_business and s.active))
     order by 1 nulls last
    loop
     if candidate.id is not null then
      select * into professional from public.staff where id=candidate.id;
      if professional.ui_metadata ? 'serviceIds' and (jsonb_typeof(professional.ui_metadata->'serviceIds')<>'array'
       or (jsonb_array_length(professional.ui_metadata->'serviceIds')>0
       and not(professional.ui_metadata->'serviceIds' @> jsonb_build_array(selected::text)))) then continue;end if;
      if not go_booking_timeline_private.in_shift(p_business,candidate.id,selected,a,z,false)
       or go_booking_timeline_private.blocked(professional.ui_metadata->'bookingBlocks',a,z) then continue;end if;
     end if;
     if not go_booking_timeline_private.in_shift(p_business,null,selected,a,z,true)
      or not go_booking_timeline_private.work_free(p_business,candidate.id,a,z,p_exclude) then continue;end if;
     assigned:=candidate.id;assigned_ok:=true;exit;
    end loop;
    if not assigned_ok then raise exception using errcode='23P01',message='BOOKING_CONFLICT';end if;
    work_minutes:=work_minutes+(phase->>'durationMinutes')::integer;
    work:=work||jsonb_build_array(jsonb_build_object('startsAt',a,'endsAt',z,'staffId',assigned,'serviceId',selected));
   else
    if nullif(phase->>'staffId','') is not null then raise exception using errcode='PT422',message='BOOKING_INVALID_TIMING';end if;
    wait_minutes:=wait_minutes+(phase->>'durationMinutes')::integer;
   end if;
   phases:=phases||jsonb_build_array(phase||jsonb_build_object('startsAt',a,'endsAt',z,'staffId',assigned));
   seen:='{}';
   for demand in select value from jsonb_array_elements(coalesce(phase->'resources','[]')) loop
    resource_key:=demand->>'resourceId';
    if nullif(resource_key,'') is null or resource_key=any(seen)
     or jsonb_typeof(demand->'quantity') is distinct from 'number' or (demand->>'quantity')!~'^[0-9]+$'
     or (demand->>'quantity')::numeric not between 1 and 1000 or coalesce(demand->>'occupancy','') not in ('phase','booking') then
     raise exception using errcode='PT422',message='BOOKING_INVALID_RESOURCES';end if;
    seen:=array_append(seen,resource_key);
    resources:=resources||jsonb_build_array(jsonb_build_object('resourceId',resource_key,'quantity',(demand->>'quantity')::integer,
     'startsAt',case when demand->>'occupancy'='booking' then p_start else a end,
     'endsAt',case when demand->>'occupancy'='booking' then (result->>'endsAt')::timestamptz else z end));
   end loop;
  end loop;
  -- A booking-wide requirement repeated on multiple phases consumes max(q),
  -- never one extra chair per phase. Distinct simultaneous requirements add.
  select coalesce(jsonb_agg(x),'[]') into resources from (
   select jsonb_build_object('resourceId',r->>'resourceId','quantity',max((r->>'quantity')::integer),
    'startsAt',(r->>'startsAt')::timestamptz,'endsAt',(r->>'endsAt')::timestamptz) x
   from jsonb_array_elements(resources) r group by r->>'resourceId',(r->>'startsAt')::timestamptz,(r->>'endsAt')::timestamptz) q;
  result:=result||jsonb_build_object('phases',phases,'workIntervals',work,'resourceIntervals',resources,
   'workMinutes',work_minutes,'waitMinutes',wait_minutes,'staffId',work->0->'staffId');
 end if;
 -- Frozen and legacy intervals share exactly the same final checker.
 for iv in select value from jsonb_array_elements(work) loop
  a:=(iv->>'startsAt')::timestamptz;z:=(iv->>'endsAt')::timestamptz;assigned:=(iv->>'staffId')::uuid;
  if not go_booking_timeline_private.in_shift(p_business,null,(iv->>'serviceId')::uuid,a,z,true) then
   raise exception using errcode='PT422',message='BOOKING_OUTSIDE_AVAILABILITY';end if;
  if not go_booking_timeline_private.work_free(p_business,assigned,a,z,p_exclude) then
   raise exception using errcode='23P01',message='BOOKING_CONFLICT';end if;
  if assigned is not null then
   select * into professional from public.staff s where s.id=assigned and s.business_id=p_business and s.active
    and coalesce(s.ui_metadata->>'archived','false')<>'true';
   if not found or not go_booking_timeline_private.in_shift(p_business,assigned,(iv->>'serviceId')::uuid,a,z,false)
    or go_booking_timeline_private.blocked(professional.ui_metadata->'bookingBlocks',a,z) then
    raise exception using errcode='PT422',message='BOOKING_STAFF_UNAVAILABLE';end if;
   if professional.ui_metadata ? 'serviceIds' and (jsonb_typeof(professional.ui_metadata->'serviceIds')<>'array'
    or (jsonb_array_length(professional.ui_metadata->'serviceIds')>0 and not(professional.ui_metadata->'serviceIds'
    @> jsonb_build_array(iv->>'serviceId')))) then raise exception using errcode='PT422',message='BOOKING_STAFF_UNAVAILABLE';end if;
  end if;
 end loop;
 for iv in select value from jsonb_array_elements(coalesce(result->'resourceIntervals','[]')) loop
  resource_key:=iv->>'resourceId';capacity:=null;
  if exists(select 1 from public.bookings b where b.business_id=p_business and b.id is distinct from p_exclude
   and b.status in ('PENDING','CONFIRMED') and not coalesce((b.timing_snapshot->>'resourcesConfigured')::boolean,false)
   and b.starts_at<(iv->>'endsAt')::timestamptz and b.ends_at>(iv->>'startsAt')::timestamptz) then
   raise exception using errcode='23P01',message='BOOKING_RESOURCE_CONFLICT';end if;
  if jsonb_typeof(business.ui_metadata->'bookingResources') is distinct from 'array' then
   raise exception using errcode='PT422',message='BOOKING_RESOURCES_NOT_CONFIGURED';end if;
  select value into resource from jsonb_array_elements(business.ui_metadata->'bookingResources') where value->>'id'=resource_key;
  if not found or coalesce(resource->>'active','true')<>'true' or jsonb_typeof(resource->'capacity') is distinct from 'number'
   or (resource->>'capacity')!~'^[0-9]+$'
   or (resource->>'capacity')::numeric not between 1 and 1000 then
   raise exception using errcode='PT422',message='BOOKING_RESOURCE_UNAVAILABLE';end if;
  if (select count(*) from jsonb_array_elements(business.ui_metadata->'bookingResources') r where r->>'id'=resource_key)<>1 then
   raise exception using errcode='PT422',message='BOOKING_INVALID_RESOURCES';end if;
  capacity:=(resource->>'capacity')::integer;a:=(iv->>'startsAt')::timestamptz;z:=(iv->>'endsAt')::timestamptz;
  -- Demand changes only at an interval boundary, not at every elapsed minute.
  -- Test the initial occupation and every start/end event inside [a,z).
  for tick in select distinct boundary from (
   select a boundary
   union all
   select edge.boundary from public.bookings b
    cross join lateral jsonb_array_elements(coalesce(b.timing_snapshot->'resourceIntervals','[]')) r
    cross join lateral (values((r->>'startsAt')::timestamptz),((r->>'endsAt')::timestamptz)) edge(boundary)
    where b.business_id=p_business and b.id is distinct from p_exclude and b.status in ('PENDING','CONFIRMED')
    and r->>'resourceId'=resource_key and edge.boundary>a and edge.boundary<z
   union all
   select edge.boundary from jsonb_array_elements(result->'resourceIntervals') r
    cross join lateral (values((r->>'startsAt')::timestamptz),((r->>'endsAt')::timestamptz)) edge(boundary)
    where r->>'resourceId'=resource_key and edge.boundary>a and edge.boundary<z
  ) boundaries loop
   select coalesce(sum((r->>'quantity')::numeric),0) into used from public.bookings b
    cross join lateral jsonb_array_elements(coalesce(b.timing_snapshot->'resourceIntervals','[]')) r
    where b.business_id=p_business and b.id is distinct from p_exclude and b.status in ('PENDING','CONFIRMED')
    and r->>'resourceId'=resource_key and (r->>'startsAt')::timestamptz<=tick and (r->>'endsAt')::timestamptz>tick;
   select used+coalesce(sum((r->>'quantity')::numeric),0) into used from jsonb_array_elements(result->'resourceIntervals') r
    where r->>'resourceId'=resource_key and (r->>'startsAt')::timestamptz<=tick and (r->>'endsAt')::timestamptz>tick;
   if used>capacity then raise exception using errcode='23P01',message='BOOKING_RESOURCE_CONFLICT';end if;
  end loop;
 end loop;
 result:=result||jsonb_build_object('gapPolicy',go_booking_timeline_private.gap_admission(p_business,p_start,result,p_exclude));
 return result;
end; $$;

-- Existing negotiation entry points delegate; there is no alternate predicate.
create or replace function go_reservation_negotiation.validate_slot(p_booking public.bookings,p_start timestamptz,p_end timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare result jsonb; ids uuid[];
begin
 if p_end-p_start<>p_booking.ends_at-p_booking.starts_at then raise exception using errcode='PT422',message='BOOKING_INVALID_INTERVAL';end if;
 select array_agg(value::uuid order by ordinality) into ids from jsonb_array_elements_text(coalesce(p_booking.timing_snapshot->'serviceIds',jsonb_build_array(p_booking.service_id))) with ordinality;
 result:=go_booking_timeline_private.plan(p_booking.business_id,ids,p_start,p_booking.staff_id,
  coalesce(p_booking.timing_snapshot,go_booking_timeline_private.legacy(p_booking)),p_booking.id,p_booking.customer_id);
end; $$;

create or replace function go_reservation_negotiation.guard_interval() returns trigger
language plpgsql security definer set search_path='' as $$
declare result jsonb; ids uuid[]; frozen jsonb;
begin
 if auth.uid() is null then return new;end if;
 if new.customer_id is distinct from auth.uid() and not exists(select 1 from public.businesses b
  where b.id=new.business_id and b.verified and b.owner_id=auth.uid()) then
  raise exception using errcode='42501',message='BOOKING_FORBIDDEN';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||new.business_id::text,0));
 if tg_op='UPDATE' then
  if new.starts_at=old.starts_at and new.ends_at=old.ends_at and new.status=old.status
   and new.staff_id is not distinct from old.staff_id and new.timing_snapshot is not distinct from old.timing_snapshot then return new;end if;
  if new.status not in ('PENDING','CONFIRMED') then return new;end if;
  frozen:=coalesce(old.timing_snapshot,go_booking_timeline_private.legacy(old));
 else
  if new.status not in ('PENDING','CONFIRMED') then raise exception using errcode='22023',message='BOOKING_INVALID_COMMAND';end if;
  -- Snapshot columns are server-owned, but even an internal caller must use
  -- the canonical catalogue compiler on INSERT, never a supplied frozen plan.
  frozen:=null;
 end if;
 select array_agg(value::uuid order by ordinality) into ids from jsonb_array_elements_text(coalesce(frozen->'serviceIds',new.timing_command->'serviceIds',
  nullif(to_jsonb(new)->'service_ids','null'::jsonb),jsonb_build_array(new.service_id))) with ordinality;
 result:=go_booking_timeline_private.plan(new.business_id,ids,new.starts_at,
  case when tg_op='INSERT' and new.timing_command is not null then (new.timing_command->>'staffId')::uuid else new.staff_id end,frozen,
  case when tg_op='UPDATE' then new.id else null end,new.customer_id);
 if new.ends_at<>(result->>'endsAt')::timestamptz then raise exception using errcode='PT422',message='BOOKING_INVALID_INTERVAL';end if;
 if tg_op='INSERT' or old.timing_snapshot is not null then
  new.timing_snapshot:=result;new.staff_id:=(result->>'staffId')::uuid;
  if to_jsonb(new) ? 'service_ids' and (jsonb_typeof(to_jsonb(new)->'service_ids')='array' or new.timing_request_key is not null) then
   new:=jsonb_populate_record(new,jsonb_build_object('service_ids',result->'serviceIds','service_details',result->'serviceDetails',
    'total_duration_minutes',result->'totalDurationMinutes','total_price',result->'totalPrice','currency',result->'currency',
    'request_key',coalesce(nullif(to_jsonb(new)->>'request_key',''),new.timing_request_key)));
  end if;
 end if;
 return new;
end; $$;

-- If the separately reviewed multi-service reference is installed, its old
-- BEFORE INSERT trigger must not keep a second whole-span conflict predicate.
-- The shared guard above also fills its canonical additive snapshot columns.
drop trigger if exists bookings_service_snapshot on public.bookings;
do $$ begin
 if to_regprocedure('public.go_guard_booking_services()') is not null then
  execute $definition$create or replace function public.go_guard_booking_services() returns trigger
   language plpgsql security invoker set search_path='' as $body$
   begin return new;end;$body$;$definition$;
 end if;
end; $$;

-- Configuration and scheduling changes share the business transaction lock.
create function go_booking_timeline_private.lock_configuration() returns trigger
language plpgsql security definer set search_path='' as $$
declare business uuid;resource_key text;resource_before jsonb;resource_after jsonb;
begin
 if tg_table_name='businesses' then business:=coalesce(new.id,old.id);
 else business:=coalesce(new.business_id,old.business_id);end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||business::text,0));
 if tg_table_name='staff' and tg_op<>'DELETE' and new.ui_metadata ? 'gapPolicy' then
  perform go_booking_timeline_private.validate_gap_policy(new.ui_metadata->'gapPolicy');
  if tg_op='INSERT' or jsonb_build_array(new.ui_metadata->'gapPolicy'->'allowLastMinuteGaps',new.ui_metadata->'gapPolicy'->'lastMinuteMinutes')
    is distinct from jsonb_build_array(old.ui_metadata->'gapPolicy'->'allowLastMinuteGaps',old.ui_metadata->'gapPolicy'->'lastMinuteMinutes') then
   new.ui_metadata:=jsonb_set(new.ui_metadata,'{gapPolicy}',new.ui_metadata->'gapPolicy'||jsonb_build_object('authorizedBy',auth.uid(),'authorizedAt',clock_timestamp()));
  else
   -- A normal configuration save must not revoke/re-stamp the same authorization.
   new.ui_metadata:=jsonb_set(new.ui_metadata,'{gapPolicy}',old.ui_metadata->'gapPolicy');
  end if;
 end if;
 if tg_table_name='businesses' and tg_op='UPDATE' and (new.ui_metadata->'bookingResources') is distinct from(old.ui_metadata->'bookingResources') then
  for resource_key in select distinct r->>'resourceId' from public.bookings b
   cross join lateral jsonb_array_elements(coalesce(b.timing_snapshot->'resourceIntervals','[]')) r
   where b.business_id=business and b.status in ('PENDING','CONFIRMED') and (r->>'endsAt')::timestamptz>now()
  loop
   if jsonb_typeof(new.ui_metadata->'bookingResources') is distinct from 'array' then
    raise exception using errcode='PT409',message='BOOKING_RESOURCE_IN_USE';end if;
   select value into resource_before from jsonb_array_elements(old.ui_metadata->'bookingResources') where value->>'id'=resource_key;
   select value into resource_after from jsonb_array_elements(new.ui_metadata->'bookingResources') where value->>'id'=resource_key;
   if not found or coalesce(resource_after->>'active','true')<>'true'
    or jsonb_typeof(resource_after->'capacity') is distinct from 'number' or (resource_after->>'capacity')!~'^[0-9]+$'
    or (resource_after->>'capacity')::numeric<coalesce((resource_before->>'capacity')::numeric,1)
    or (select count(*) from jsonb_array_elements(new.ui_metadata->'bookingResources') r where r->>'id'=resource_key)<>1 then
    raise exception using errcode='PT409',message='BOOKING_RESOURCE_IN_USE';end if;
  end loop;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end; $$;
create trigger a_go_timeline_config before insert or update or delete on public.services for each row execute function go_booking_timeline_private.lock_configuration();
create trigger a_go_timeline_config before insert or update or delete on public.staff for each row execute function go_booking_timeline_private.lock_configuration();
create trigger a_go_timeline_config before insert or update or delete on public.availability for each row execute function go_booking_timeline_private.lock_configuration();
create trigger a_go_timeline_config before update on public.businesses for each row execute function go_booking_timeline_private.lock_configuration();

create function public.go_booking_timeline(p_business_id uuid,p_service_ids uuid[],p_starts_at timestamptz,p_staff_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||p_business_id::text,0));
 return go_booking_timeline_private.plan(p_business_id,p_service_ids,p_starts_at,p_staff_id);
end; $$;

create function go_booking_timeline_private.create_booking(p_business_id uuid,p_service_ids uuid[],p_starts_at timestamptz,
 p_staff_id uuid,p_request_key text,p_notes text,p_status public.booking_status,p_customer_id uuid,
 p_expected_plan jsonb default null,p_expected_end_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();customer uuid:=coalesce(p_customer_id,auth.uid());command jsonb;saved public.bookings;result jsonb;
begin
 if caller is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED';end if;
 if customer<>caller and not exists(select 1 from public.businesses b where b.id=p_business_id and b.verified and b.owner_id=caller) then
  raise exception using errcode='42501',message='BOOKING_FORBIDDEN';end if;
 if not exists(select 1 from public.profiles p where p.id=customer) then raise exception using errcode='PT422',message='BOOKING_CUSTOMER_UNAVAILABLE';end if;
 if p_request_key is null or p_request_key!~'^[a-zA-Z0-9_-]{1,128}$' or length(coalesce(p_notes,''))>4000
  or p_status is null or p_status not in ('PENDING','CONFIRMED') then raise exception using errcode='22023',message='BOOKING_INVALID_COMMAND';end if;
 command:=jsonb_build_object('actorId',caller,'customerId',customer,'businessId',p_business_id,'serviceIds',p_service_ids,
  'startsAt',p_starts_at,'staffId',p_staff_id,'notes',p_notes,'status',p_status,
  'expectedPlan',p_expected_plan,'expectedEndAt',p_expected_end_at);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||p_business_id::text,0));
 select * into saved from public.bookings where customer_id=customer and timing_request_key=p_request_key;
 if found then
  if saved.timing_command is distinct from command then raise exception using errcode='PT409',message='BOOKING_REQUEST_REUSED';end if;
  return to_jsonb(saved);
 end if;
 result:=go_booking_timeline_private.plan(p_business_id,p_service_ids,p_starts_at,p_staff_id,null,null,customer);
 if (p_expected_plan is not null and p_expected_plan is distinct from result)
  or (p_expected_end_at is not null and p_expected_end_at<>(result->>'endsAt')::timestamptz) then
  raise exception using errcode='PT409',message='BOOKING_SELECTION_STALE';end if;
 insert into public.bookings(business_id,service_id,staff_id,customer_id,starts_at,ends_at,status,notes,timing_snapshot,timing_request_key,timing_command)
 values(p_business_id,p_service_ids[1],(result->>'staffId')::uuid,customer,p_starts_at,(result->>'endsAt')::timestamptz,p_status,p_notes,result,p_request_key,command)
 returning * into saved;
 return to_jsonb(saved);
end; $$;
create function public.go_create_timeline_booking(p_business_id uuid,p_service_ids uuid[],p_starts_at timestamptz,p_staff_id uuid,
 p_request_key text,p_notes text default null,p_status public.booking_status default 'CONFIRMED',p_customer_id uuid default null,
 p_expected_plan jsonb default null,p_expected_end_at timestamptz default null)
returns jsonb language sql security invoker set search_path='' as $$
 select go_booking_timeline_private.create_booking(p_business_id,p_service_ids,p_starts_at,p_staff_id,p_request_key,p_notes,p_status,p_customer_id,p_expected_plan,p_expected_end_at);
$$;

create function go_booking_timeline_private.availability(p_business_id uuid,p_service_ids uuid[],p_from timestamptz,p_to timestamptz,
 p_staff_id uuid,p_step_minutes integer,p_date_iso date,p_days integer,p_dates_only boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare zone text;tick timestamptz;stop_at timestamptz;result jsonb;slots jsonb:='[]';dates jsonb:='[]';day text;last_day text;truncated boolean:=false;
 previous_valid boolean:=false;current_valid boolean;
 company_windows tstzmultirange;first_timing jsonb;first_phase jsonb;initial_work boolean:=false;initial_staff uuid;initial_free boolean;gap_windows jsonb;continuous_minutes integer;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED';end if;
 select timezone into zone from public.businesses where id=p_business_id and verified and booking_enabled;
 if not found then raise exception using errcode='PT422',message='BOOKING_BUSINESS_UNAVAILABLE';end if;
 if p_step_minutes is null or p_step_minutes not between 1 and 60 or p_days is null or p_days not between 1 and 31 then
  raise exception using errcode='22023',message='BOOKING_INVALID_RANGE';end if;
 tick:=coalesce(p_from,p_date_iso::timestamp at time zone zone);
 stop_at:=coalesce(p_to,(p_date_iso+p_days)::timestamp at time zone zone);
 if tick is null or stop_at is null or not isfinite(tick) or not isfinite(stop_at) or stop_at<=tick or stop_at-tick>interval '32 days'
  or date_trunc('minute',tick)<>tick or date_trunc('minute',stop_at)<>stop_at then
  raise exception using errcode='22023',message='BOOKING_INVALID_RANGE';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||p_business_id::text,0));
 company_windows:=go_booking_timeline_private.shift_windows(p_business_id,null,null,tick,stop_at);
 select s.ui_metadata->'timing' into first_timing from public.services s where s.business_id=p_business_id and s.id=p_service_ids[1];
 initial_staff:=p_staff_id;
 if first_timing is null or (first_timing->>'mode'='simple' and not(first_timing ? 'phases')) then
  initial_work:=true;
 elsif jsonb_typeof(first_timing->'phases')='array' then
  first_phase:=first_timing->'phases'->0;
  if first_phase->>'kind'='work' and jsonb_typeof(first_phase->'durationMinutes')='number'
   and (first_phase->>'durationMinutes')~'^[0-9]+$' then
   initial_work:=(first_phase->>'durationMinutes')::numeric between 1 and 1440;
   begin initial_staff:=coalesce(nullif(first_phase->>'staffId','')::uuid,p_staff_id);
   exception when invalid_text_representation then initial_work:=false;end;
  end if;
 end if;
 if initial_work then
  gap_windows:=go_booking_timeline_private.gap_start_windows(p_business_id,initial_staff,tick,stop_at);
  -- Only plain continuous services can prune BOTH sides using their sum. Phases
  -- retain the full canonical sequence check and prune the initial side only.
  select case when count(*)=cardinality(p_service_ids) and bool_and(s.ui_metadata->'timing' is null)
    then sum(s.duration_minutes)::integer else null end into continuous_minutes
   from public.services s where s.business_id=p_business_id and s.id=any(p_service_ids);
  if continuous_minutes is not null then
   -- If both real residuals must be multiples, their SUM must be one too.
   -- This only discards impossible windows; it never admits a candidate.
   select coalesce(jsonb_agg(w),'[]') into gap_windows from jsonb_array_elements(gap_windows) w
    where (w->'policy'->>'allowLastMinuteGaps')::boolean
     or not((w->>'leftBounded')::boolean and (w->>'rightBounded')::boolean)
     or go_booking_timeline_private.valid_gap(extract(epoch from((w->>'endsAt')::timestamptz-(w->>'startsAt')::timestamptz))/60-continuous_minutes,(w->>'minimumMinutes')::integer);
  end if;
  if gap_windows='[]'::jsonb then tick:=stop_at;end if;
 end if;
 while tick<stop_at loop
  current_valid:=false;
  day:=to_char(tick at time zone zone,'YYYY-MM-DD');
  initial_free:=true;
  if tick>now() and company_windows @> tstzrange(tick,tick+interval '1 minute','[)') then
   -- Necessary-condition pruning only. The complete canonical plan still
   -- validates every offered candidate. Initial waits bypass this probe.
   if initial_work then
    initial_free:=go_booking_timeline_private.gap_start_possible(gap_windows,tick,continuous_minutes);
   end if;
   if initial_free then
   begin
    result:=go_booking_timeline_private.plan(p_business_id,p_service_ids,tick,p_staff_id);
    -- Range bounds possible STARTS; a customer visit may end after midnight or
    -- after the requested start-range. The engine validates its complete span.
    if result is not null then
     current_valid:=true;
     if last_day is distinct from day then dates:=dates||jsonb_build_array(day);last_day:=day;end if;
     if not previous_valid or p_step_minutes=1 or extract(minute from tick at time zone zone)::integer%p_step_minutes=0 then
      slots:=slots||jsonb_build_array(result);
     end if;
     if jsonb_array_length(slots)>=5000 then truncated:=true;tick:=tick+interval '1 minute';exit;end if;
     if p_dates_only then tick:=((tick at time zone zone)::date+1)::timestamp at time zone zone;continue;end if;
    end if;
   exception when exclusion_violation then null;
    when sqlstate 'PT422' then
     if sqlerrm not in ('BOOKING_OUTSIDE_AVAILABILITY','BOOKING_STAFF_UNAVAILABLE','BOOKING_RESOURCE_UNAVAILABLE','BOOKING_NO_ASSIGNED_SERVICES','BOOKING_GAP_NOT_MULTIPLE') then raise;end if;
   end;
   end if;
  end if;
  previous_valid:=current_valid;
  tick:=tick+interval '1 minute';
 end loop;
 return jsonb_build_object('version',1,'gapPolicyVersion',1,'timezone',zone,'slots',slots,'availableDates',dates,'truncated',truncated,
  'nextFrom',case when truncated then tick else null end);
end; $$;
create function public.go_booking_availability(p_business_id uuid,p_service_ids uuid[],p_from timestamptz default null,p_to timestamptz default null,
 p_staff_id uuid default null,p_step_minutes integer default 1,p_date_iso date default null,p_days integer default 1,p_dates_only boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
 select go_booking_timeline_private.availability(p_business_id,p_service_ids,p_from,p_to,p_staff_id,p_step_minutes,p_date_iso,p_days,p_dates_only);
$$;

-- New helpers are never PUBLIC APIs by default. Only deliberate wrappers and
-- the invoker negotiation validator can reach the private scheduling authority.
revoke all on all functions in schema go_booking_timeline_private from public,anon,authenticated;
grant execute on function go_booking_timeline_private.plan(uuid,uuid[],timestamptz,uuid,jsonb,uuid,uuid) to authenticated;
grant execute on function go_booking_timeline_private.legacy(public.bookings) to authenticated;
grant execute on function go_booking_timeline_private.create_booking(uuid,uuid[],timestamptz,uuid,text,text,public.booking_status,uuid,jsonb,timestamptz) to authenticated;
grant execute on function go_booking_timeline_private.availability(uuid,uuid[],timestamptz,timestamptz,uuid,integer,date,integer,boolean) to authenticated;
revoke all on function public.go_booking_timeline(uuid,uuid[],timestamptz,uuid),
 public.go_create_timeline_booking(uuid,uuid[],timestamptz,uuid,text,text,public.booking_status,uuid,jsonb,timestamptz),
 public.go_booking_availability(uuid,uuid[],timestamptz,timestamptz,uuid,integer,date,integer,boolean) from public,anon,authenticated;
grant execute on function public.go_booking_timeline(uuid,uuid[],timestamptz,uuid),
 public.go_create_timeline_booking(uuid,uuid[],timestamptz,uuid,text,text,public.booking_status,uuid,jsonb,timestamptz),
 public.go_booking_availability(uuid,uuid[],timestamptz,timestamptz,uuid,integer,date,integer,boolean) to authenticated;
commit;
