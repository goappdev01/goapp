-- REVIEW DRAFT: install atomically with the matching canonical timeline/gap functions.
-- No historical booking or payment is rewritten.
begin;
create or replace function go_booking_timeline_private.validate_service_timing(p_business uuid,p_timing jsonb,p_minutes integer,p_overrides boolean default true)
returns void language plpgsql stable set search_path='' as $$
declare phase jsonb;entry record;ids text[]:='{}';total integer:=0;occupied boolean:=false;
begin
 if p_timing is null then return;end if;
 if jsonb_typeof(p_timing)<>'object' or p_timing->>'version' is distinct from '1' or coalesce(p_timing->>'mode','') not in ('simple','phases')
  or jsonb_typeof(p_timing->'resourcesConfigured') is distinct from 'boolean' then raise exception using errcode='PT422',message='BOOKING_INVALID_TIMING';end if;
 if p_timing->>'mode'='phases' and p_timing->>'resourcesConfigured'<>'true' then raise exception using errcode='PT422',message='BOOKING_RESOURCE_CONFIGURATION_REQUIRED';end if;
 if p_timing ? 'phases' then
  if jsonb_typeof(p_timing->'phases')<>'array' or jsonb_array_length(p_timing->'phases') not between 1 and 32 then raise exception using errcode='PT422',message='BOOKING_INVALID_TIMING';end if;
  for phase in select value from jsonb_array_elements(p_timing->'phases') loop
   if nullif(phase->>'id','') is null or phase->>'id'=any(ids) or length(phase->>'id')>128
    or coalesce(phase->>'kind','') not in ('work','wait') or jsonb_typeof(phase->'durationMinutes') is distinct from 'number'
    or (phase->>'durationMinutes')!~'^[0-9]+$' or (phase->>'durationMinutes')::numeric not between 1 and 1440
    or phase ? 'name' and jsonb_typeof(phase->'name') is distinct from 'string'
    or length(coalesce(phase->>'name',''))>120
    or phase ? 'releaseProfessional' and jsonb_typeof(phase->'releaseProfessional') is distinct from 'boolean'
    or phase->>'kind'='work' and phase->>'releaseProfessional'='true'
    or jsonb_typeof(phase->'resources') is distinct from 'array' then raise exception using errcode='PT422',message='BOOKING_INVALID_TIMING';end if;
   if phase->>'kind'='work' or phase->>'releaseProfessional' is distinct from 'true' then occupied:=true;end if;
   ids:=array_append(ids,phase->>'id');total:=total+(phase->>'durationMinutes')::integer;
  end loop;
  if not occupied or total<>p_minutes or total>1440 or p_timing->>'mode'='simple' and (jsonb_array_length(p_timing->'phases')<>1 or p_timing->'phases'->0->>'kind'<>'work') then
   raise exception using errcode='PT422',message='BOOKING_TIMING_TOTAL_MISMATCH';end if;
 elsif p_timing->>'mode'<>'simple' then raise exception using errcode='PT422',message='BOOKING_INVALID_TIMING';end if;
 if p_timing ? 'professionalTimings' then
  if not p_overrides or jsonb_typeof(p_timing->'professionalTimings')<>'object' or (select count(*) from jsonb_object_keys(p_timing->'professionalTimings'))>100 then
   raise exception using errcode='PT422',message='BOOKING_INVALID_TIMING';end if;
  for entry in select * from jsonb_each(p_timing->'professionalTimings') loop
   if entry.key!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or not exists(select 1 from public.staff s where s.id=entry.key::uuid and s.business_id=p_business)
    or jsonb_typeof(entry.value->'durationMinutes') is distinct from 'number' or (entry.value->>'durationMinutes')!~'^[0-9]+$'
    or (entry.value->>'durationMinutes')::numeric not between 1 and 1440 then raise exception using errcode='PT422',message='BOOKING_INVALID_PROFESSIONAL_TIMING';end if;
   perform go_booking_timeline_private.validate_service_timing(p_business,entry.value,(entry.value->>'durationMinutes')::integer,false);
  end loop;
 end if;
end; $$;

create or replace function go_booking_timeline_private.effective_timing(p_timing jsonb,p_staff uuid,p_minutes integer)
returns jsonb language sql immutable set search_path='' as $$
 select coalesce(p_timing->'professionalTimings'->(p_staff::text),p_timing,jsonb_build_object('version',1,'mode','simple','resourcesConfigured',false))
  ||jsonb_build_object('durationMinutes',coalesce((p_timing->'professionalTimings'->(p_staff::text)->>'durationMinutes')::integer,p_minutes));
$$;

-- A historical snapshot is immutable. Before explicit release flags existed,
-- wait phases were deliberately free. Infer only from its server-owned receipt.
create or replace function go_booking_timeline_private.snapshot_waits(p_snapshot jsonb,p_staff uuid default null)
returns jsonb language plpgsql immutable set search_path='' as $$
declare phase jsonb;worker uuid;rows jsonb:='[]';
begin
 if p_snapshot->>'phasePolicyVersion'='1' then return coalesce(p_snapshot->'releasedWaitIntervals','[]');end if;
 for phase in select value from jsonb_array_elements(coalesce(p_snapshot->'phases','[]')) where value->>'kind'='wait' loop
  select (w->>'staffId')::uuid into worker from jsonb_array_elements(p_snapshot->'workIntervals') w
   where (w->>'endsAt')::timestamptz<=(phase->>'startsAt')::timestamptz order by (w->>'endsAt')::timestamptz desc limit 1;
  worker:=coalesce(worker,p_staff,(p_snapshot->>'staffId')::uuid);
  if not exists(select 1 from jsonb_array_elements(p_snapshot->'workIntervals') w
   where (w->>'staffId')::uuid is not distinct from worker and (w->>'startsAt')::timestamptz<(phase->>'endsAt')::timestamptz and (w->>'endsAt')::timestamptz>(phase->>'startsAt')::timestamptz) then
   rows:=rows||jsonb_build_array(jsonb_build_object('startsAt',phase->'startsAt','endsAt',phase->'endsAt','staffId',worker,'serviceId',phase->'serviceId','phaseId',phase->'id','historical',true));
  end if;
 end loop;
 return rows;
end; $$;

create or replace function go_booking_timeline_private.released_waits(p_business uuid,p_staff uuid,p_from timestamptz,p_to timestamptz,p_exclude uuid default null)
returns tstzmultirange language sql stable set search_path='' as $$
 select coalesce(range_agg(tstzrange((w->>'startsAt')::timestamptz,(w->>'endsAt')::timestamptz,'[)')),'{}'::tstzmultirange)
 from public.bookings b cross join lateral jsonb_array_elements(go_booking_timeline_private.snapshot_waits(b.timing_snapshot,b.staff_id)) w
 where b.business_id=p_business and b.id is distinct from p_exclude and b.status in ('PENDING','CONFIRMED')
  and b.starts_at<p_to and b.ends_at>p_from and (w->>'staffId')::uuid is not distinct from p_staff
  and (w->>'startsAt')::timestamptz<p_to and (w->>'endsAt')::timestamptz>p_from;
$$;

-- One modulo policy. Only the proven wait-origin portions are subtracted.
create or replace function go_booking_timeline_private.valid_ordinary_remainders(p_gaps tstzmultirange,p_released tstzmultirange,p_minimum integer)
returns boolean language plpgsql immutable set search_path='' as $$
begin
 return (select coalesce(bool_and(go_booking_timeline_private.valid_gap(extract(epoch from(upper(r)-lower(r)))/60,p_minimum)),true)
 from unnest(p_gaps-p_released) r);
end; $$;

-- Actual remaining professional capacity for Calendar. A freed professional
-- is not a promise that every service's physical resources are available.
create or replace function go_booking_timeline_private.professional_capacity(p_business uuid,p_staff uuid,p_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare zone text;a timestamptz;z timestamptz;available tstzmultirange;busy tstzmultirange;r tstzrange;w jsonb;b record;rows jsonb:='[]';
begin
 if auth.uid() is null then raise exception using errcode='42501',message='BOOKING_FORBIDDEN';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||p_business::text,0));
 -- Recheck ownership after waiting for concurrent company/configuration writes.
 select timezone into zone from public.businesses where id=p_business and verified and owner_id=auth.uid();
 if auth.uid() is null or not found or not exists(select 1 from public.staff s where s.id=p_staff and s.business_id=p_business and s.active and coalesce(s.ui_metadata->>'archived','false')<>'true') then
  raise exception using errcode='42501',message='BOOKING_FORBIDDEN';end if;
 if p_date is null then raise exception using errcode='PT422',message='BOOKING_INVALID_RANGE';end if;
 a:=p_date::timestamp at time zone zone;z:=(p_date+1)::timestamp at time zone zone;
 available:=go_booking_timeline_private.available_segments(p_business,p_staff,a,z)*tstzmultirange(tstzrange(a,z,'[)'));
 busy:=go_booking_timeline_private.occupied(p_business,p_staff,a,z);
 for b in select id,timing_snapshot,staff_id from public.bookings where business_id=p_business and status in ('PENDING','CONFIRMED') and starts_at<z and ends_at>a loop
  for w in select value from jsonb_array_elements(go_booking_timeline_private.snapshot_waits(b.timing_snapshot,b.staff_id)) where (value->>'staffId')::uuid=p_staff loop
   for r in select unnest((tstzmultirange(tstzrange((w->>'startsAt')::timestamptz,(w->>'endsAt')::timestamptz,'[)'))*available)-busy) loop
    rows:=rows||jsonb_build_array(jsonb_build_object('bookingId',b.id,'phaseId',w->'phaseId','startsAt',lower(r),'endsAt',upper(r),'staffId',p_staff));
   end loop;
  end loop;
 end loop;
 return jsonb_build_object('version',1,'phasePolicyVersion',1,'timezone',zone,'dateISO',p_date,'releasedCapacity',rows,'resourceValidationRequired',true);
end; $$;
create or replace function public.go_booking_professional_capacity(p_business_id uuid,p_staff_id uuid,p_date_iso date)
returns jsonb language sql security invoker set search_path='' as $$
 select go_booking_timeline_private.professional_capacity(p_business_id,p_staff_id,p_date_iso);
$$;
create or replace function public.go_booking_phase_policy_version()
returns integer language sql stable security invoker set search_path='' as $$
 select case when position('''phasePolicyVersion'',1' in pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('go_booking_timeline_private.plan(uuid,uuid[],timestamptz,uuid,jsonb,uuid,uuid)')))>0
 and position('valid_ordinary_remainders' in pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('go_booking_timeline_private.gap_admission(uuid,timestamptz,jsonb,uuid)')))>0 then 1 else 0 end;
$$;
revoke all on function go_booking_timeline_private.validate_service_timing(uuid,jsonb,integer,boolean),go_booking_timeline_private.effective_timing(jsonb,uuid,integer),
 go_booking_timeline_private.snapshot_waits(jsonb,uuid),go_booking_timeline_private.released_waits(uuid,uuid,timestamptz,timestamptz,uuid),
 go_booking_timeline_private.valid_ordinary_remainders(tstzmultirange,tstzmultirange,integer),go_booking_timeline_private.professional_capacity(uuid,uuid,date)
 from public,anon,authenticated;
revoke all on function public.go_booking_professional_capacity(uuid,uuid,date),public.go_booking_phase_policy_version() from public,anon,authenticated;
grant execute on function public.go_booking_professional_capacity(uuid,uuid,date),public.go_booking_phase_policy_version(),go_booking_timeline_private.professional_capacity(uuid,uuid,date) to authenticated;
commit;
