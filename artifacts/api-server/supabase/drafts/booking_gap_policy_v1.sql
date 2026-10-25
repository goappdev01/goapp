-- REVIEW DRAFT. Apply only together with the matching canonical timeline functions.
-- No historical booking is rewritten. Uses existing staff metadata and snapshots.
begin;

create or replace function go_booking_timeline_private.valid_gap(p_minutes numeric,p_minimum integer)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_minimum>0 and p_minutes>=0 and mod(p_minutes,nullif(p_minimum,0))=0,false);
$$;

create or replace function go_booking_timeline_private.minimum_service(p_business uuid,p_staff uuid)
returns integer language sql stable set search_path='' as $$
 select min(s.duration_minutes) from public.services s
 where s.business_id=p_business and s.active and s.duration_minutes>0
 and coalesce(s.ui_metadata->>'archived','false')<>'true'
 and coalesce(s.ui_metadata->>'visible','true')<>'false'
 and coalesce(s.ui_metadata->>'reservable','true')<>'false'
 and coalesce(s.ui_metadata->>'catalogKind','service')<>'product'
 and (p_staff is null or exists(select 1 from public.staff p where p.id=p_staff and p.business_id=p_business and p.active
   and coalesce(p.ui_metadata->>'archived','false')<>'true'
   and jsonb_typeof(p.ui_metadata->'serviceIds')='array'
   and p.ui_metadata->'serviceIds' @> jsonb_build_array(s.id::text)));
$$;

create or replace function go_booking_timeline_private.validate_gap_policy(p_policy jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
begin
 if p_policy is null then return jsonb_build_object('allowLastMinuteGaps',false,'lastMinuteMinutes',1440);end if;
 if jsonb_typeof(p_policy)<>'object' or jsonb_typeof(p_policy->'allowLastMinuteGaps') is distinct from 'boolean'
 or jsonb_typeof(p_policy->'lastMinuteMinutes') is distinct from 'number'
 or (p_policy->>'lastMinuteMinutes')!~'^[0-9]+$'
 or (p_policy->>'lastMinuteMinutes')::numeric not between 1 and 525600 then
  raise exception using errcode='PT422',message='BOOKING_INVALID_GAP_POLICY';end if;
 return p_policy;
end; $$;

-- Subtract closed ranges before considering any booking residual. Real gaps
-- remain disjoint, including split shifts, absences and overnight/DST windows.
create or replace function go_booking_timeline_private.available_segments(p_business uuid,p_staff uuid,p_from timestamptz,p_to timestamptz)
returns tstzmultirange language plpgsql stable set search_path='' as $$
declare windows tstzmultirange;blocks jsonb;closed tstzmultirange;has_staff boolean;
begin
 windows:=go_booking_timeline_private.shift_windows(p_business,null,null,p_from,p_to);
 if p_staff is not null then
  select exists(select 1 from public.availability a where a.business_id=p_business and a.staff_id=p_staff
    and a.active and coalesce(a.ui_metadata->>'archived','false')<>'true') into has_staff;
  if has_staff then windows:=windows*go_booking_timeline_private.shift_windows(p_business,p_staff,null,p_from,p_to);end if;
 end if;
 select coalesce(b.ui_metadata->'bookingBlocks','[]')||coalesce(s.ui_metadata->'bookingBlocks','[]') into blocks
 from public.businesses b left join public.staff s on s.business_id=b.id and s.id=p_staff where b.id=p_business;
 perform go_booking_timeline_private.blocked(blocks,p_from,p_to);
 select coalesce(range_agg(tstzrange((b->>'startsAt')::timestamptz,(b->>'endsAt')::timestamptz,'[)')),'{}'::tstzmultirange)
 into closed from jsonb_array_elements(blocks) b;
 return windows-closed;
end; $$;

-- Sole projection of persisted professional occupation for both placement and
-- day analysis. Legacy appointments occupy their committed full duration.
create or replace function go_booking_timeline_private.occupied(p_business uuid,p_staff uuid,p_from timestamptz,p_to timestamptz,p_exclude uuid default null,p_analysis boolean default false)
returns tstzmultirange language sql stable set search_path='' as $$
 select coalesce(range_agg(tstzrange((w->>'startsAt')::timestamptz,(w->>'endsAt')::timestamptz,'[)')),'{}'::tstzmultirange)
 from public.bookings b cross join lateral jsonb_array_elements(coalesce(b.timing_snapshot,go_booking_timeline_private.legacy(b))->'workIntervals') w
 where b.business_id=p_business and b.id is distinct from p_exclude
 and (b.status in ('PENDING','CONFIRMED') or p_analysis and b.status in ('COMPLETED','NO_SHOW'))
 and b.starts_at<p_to and b.ends_at>p_from
 and (p_staff is null or w->>'staffId' is null or w->>'staffId'=p_staff::text)
 and (w->>'startsAt')::timestamptz<p_to and (w->>'endsAt')::timestamptz>p_from;
$$;

-- Necessary conditions for enumerating starts, cached once per locked availability
-- query. These helpers NEVER admit a booking: every surviving start calls plan.
create or replace function go_booking_timeline_private.gap_start_windows(p_business uuid,p_staff uuid,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable set search_path='' as $$
declare professional record;minimum integer;policy jsonb;windows tstzmultirange;free tstzmultirange;
 a timestamptz:=p_from-interval '8 days';z timestamptz:=p_to+interval '8 days';r tstzrange;rows jsonb:='[]';
begin
 for professional in select s.id,s.ui_metadata from public.staff s where s.business_id=p_business and s.active
   and coalesce(s.ui_metadata->>'archived','false')<>'true' and (p_staff is null or s.id=p_staff)
   union all select null,'{}'::jsonb where p_staff is null and not exists(select 1 from public.staff s where s.business_id=p_business and s.active and coalesce(s.ui_metadata->>'archived','false')<>'true') loop
  minimum:=go_booking_timeline_private.minimum_service(p_business,professional.id);if minimum is null then continue;end if;
  policy:=go_booking_timeline_private.validate_gap_policy(professional.ui_metadata->'gapPolicy');
  windows:=go_booking_timeline_private.available_segments(p_business,professional.id,a,z);
  free:=windows-go_booking_timeline_private.occupied(p_business,professional.id,a,z);
  for r in select unnest(free) loop
   if upper(r)<=p_from or lower(r)>=p_to then continue;end if;
   rows:=rows||jsonb_build_array(jsonb_build_object('startsAt',lower(r),'endsAt',upper(r),'minimumMinutes',minimum,'policy',policy,
    'leftBounded',lower(r)<>a or not(go_booking_timeline_private.available_segments(p_business,professional.id,a-interval '1 minute',a) @> tstzrange(a-interval '1 minute',a,'[)')),
    'rightBounded',upper(r)<>z or not(go_booking_timeline_private.available_segments(p_business,professional.id,z,z+interval '1 minute') @> tstzrange(z,z+interval '1 minute','[)'))));
  end loop;
 end loop;
 return rows;
end; $$;

create or replace function go_booking_timeline_private.gap_start_possible(p_windows jsonb,p_start timestamptz,p_continuous_minutes integer default null)
returns boolean language plpgsql volatile set search_path='' as $$
declare w jsonb;a timestamptz;z timestamptz;finish timestamptz;policy jsonb;flexible boolean;
begin
 for w in select value from jsonb_array_elements(p_windows) loop
  a:=(w->>'startsAt')::timestamptz;z:=(w->>'endsAt')::timestamptz;
  finish:=p_start+coalesce(p_continuous_minutes,1)*interval '1 minute';
  if p_start<a or finish>z then continue;end if;
  policy:=w->'policy';flexible:=(policy->>'allowLastMinuteGaps')::boolean
   and p_start-clock_timestamp()<=(policy->>'lastMinuteMinutes')::integer*interval '1 minute';
  if flexible then return true;end if;
  if (w->>'leftBounded')::boolean and not go_booking_timeline_private.valid_gap(extract(epoch from(p_start-a))/60,(w->>'minimumMinutes')::integer) then continue;end if;
  if p_continuous_minutes is not null and (w->>'rightBounded')::boolean
   and not go_booking_timeline_private.valid_gap(extract(epoch from(z-finish))/60,(w->>'minimumMinutes')::integer) then continue;end if;
  return true;
 end loop;
 return false;
end; $$;


create or replace function go_booking_timeline_private.gap_admission(p_business uuid,p_start timestamptz,p_plan jsonb,p_exclude uuid default null)
returns jsonb language plpgsql volatile set search_path='' as $$
declare professional record;minimum integer;policy jsonb;windows tstzmultirange;segment tstzrange;
 inserted tstzmultirange;existing tstzmultirange;combined tstzmultirange;gap tstzrange;
 invalid boolean;flexible boolean;minutes numeric;rows jsonb:='[]';at timestamptz:=clock_timestamp();left_neighbor timestamptz;right_neighbor timestamptz;
begin
 if p_start<=at then raise exception using errcode='PT422',message='BOOKING_INVALID_INTERVAL';end if;
 for professional in select distinct (w->>'staffId')::uuid id from jsonb_array_elements(p_plan->'workIntervals') w order by 1 loop
  minimum:=go_booking_timeline_private.minimum_service(p_business,professional.id);
  if minimum is null then raise exception using errcode='PT422',message='BOOKING_NO_ASSIGNED_SERVICES';end if;
  select go_booking_timeline_private.validate_gap_policy(s.ui_metadata->'gapPolicy') into policy
   from public.staff s where s.id=professional.id and s.business_id=p_business;
  policy:=coalesce(policy,jsonb_build_object('allowLastMinuteGaps',false,'lastMinuteMinutes',1440));
  flexible:=(policy->>'allowLastMinuteGaps')::boolean and p_start-at<=((policy->>'lastMinuteMinutes')::integer*interval '1 minute');
  select range_agg(tstzrange((w->>'startsAt')::timestamptz,(w->>'endsAt')::timestamptz,'[)')) into inserted
   from jsonb_array_elements(p_plan->'workIntervals') w where (w->>'staffId')::uuid is not distinct from professional.id;
  -- A date range is NOT a working-day boundary. Include the nearest real work
  -- endpoints on both sides, then let shifts/breaks split the actual segments.
  select max((w->>'endsAt')::timestamptz) filter(where (w->>'endsAt')::timestamptz<=lower(range_merge(inserted))),
    min((w->>'startsAt')::timestamptz) filter(where (w->>'startsAt')::timestamptz>=upper(range_merge(inserted)))
   into left_neighbor,right_neighbor from public.bookings b
   cross join lateral jsonb_array_elements(coalesce(b.timing_snapshot,go_booking_timeline_private.legacy(b))->'workIntervals') w
   where b.business_id=p_business and b.id is distinct from p_exclude and b.status in ('PENDING','CONFIRMED')
     and (professional.id is null or w->>'staffId' is null or w->>'staffId'=professional.id::text);
  windows:=go_booking_timeline_private.available_segments(p_business,professional.id,
    least(lower(range_merge(inserted)),coalesce(left_neighbor,lower(range_merge(inserted))))-interval '8 days',
    greatest(upper(range_merge(inserted)),coalesce(right_neighbor,upper(range_merge(inserted))))+interval '8 days');
  invalid:=false;
  for segment in select unnest(windows) loop
   if not inserted&&tstzmultirange(segment) then continue;end if;
   existing:=go_booking_timeline_private.occupied(p_business,professional.id,lower(segment),upper(segment),p_exclude)*tstzmultirange(segment);
   combined:=existing+(inserted*tstzmultirange(segment));
   for gap in select unnest(tstzmultirange(segment)-combined) loop
    -- Check residuals up to REAL opening/closing/break boundaries as well.
    -- Never invent padding or treat a finite query horizon as a real closure.
    if lower(gap)=lower(segment) and go_booking_timeline_private.available_segments(p_business,professional.id,lower(gap)-interval '1 minute',lower(gap))
      @> tstzrange(lower(gap)-interval '1 minute',lower(gap),'[)') then continue;end if;
    if upper(gap)=upper(segment) and go_booking_timeline_private.available_segments(p_business,professional.id,upper(gap),upper(gap)+interval '1 minute')
      @> tstzrange(upper(gap),upper(gap)+interval '1 minute','[)') then continue;end if;
    -- A configured wait inside this SAME service is intentional, not a residual
    -- between reservations. A different booking within it is checked normally.
    if exists(select 1 from unnest(inserted) n where upper(n)=lower(gap))
      and exists(select 1 from unnest(inserted) n where lower(n)=upper(gap)) then continue;end if;
    -- Ignore old gaps untouched by this placement, even when incompatible.
    if not exists(select 1 from unnest(inserted) n where upper(n)=lower(gap) or lower(n)=upper(gap)) then continue;end if;
    minutes:=extract(epoch from(upper(gap)-lower(gap)))/60;
    if not go_booking_timeline_private.valid_gap(minutes,minimum) then invalid:=true;end if;
   end loop;
  end loop;
  if invalid and not flexible then raise exception using errcode='PT422',message='BOOKING_GAP_NOT_MULTIPLE';end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('staffId',professional.id,'minimumMinutes',minimum,
    'exceptionUsed',invalid,'lastMinuteMinutes',(policy->>'lastMinuteMinutes')::integer,
    'authorizedBy',policy->'authorizedBy','authorizedAt',policy->'authorizedAt'));
 end loop;
 if jsonb_array_length(rows)=0 then raise exception using errcode='PT422',message='BOOKING_NO_ASSIGNED_SERVICES';end if;
 return jsonb_build_object('version',1,'professionals',rows);
end; $$;

create or replace function go_booking_timeline_private.day_analysis(p_business uuid,p_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.businesses;professional record;windows tstzmultirange;busy tstzmultirange;free tstzmultirange;
 bounds tstzrange;minimum integer;gap tstzrange;gaps jsonb;rows jsonb:='[]';ordinary integer;exceptional integer;legacy integer;
 available numeric;occupied numeric;last_end timestamptz;finished boolean:=true;zone text;a timestamptz;z timestamptz;
begin
 select * into company from public.businesses where id=p_business and verified and owner_id=auth.uid();
 if auth.uid() is null or not found then raise exception using errcode='42501',message='BOOKING_FORBIDDEN';end if;
 zone:=company.timezone;a:=p_date::timestamp at time zone zone;z:=(p_date+1)::timestamp at time zone zone;
 if p_date is null or p_date>(clock_timestamp() at time zone zone)::date then raise exception using errcode='PT422',message='BOOKING_INVALID_RANGE';end if;
 for professional in select s.id,s.display_name from public.staff s where s.business_id=p_business and s.active and coalesce(s.ui_metadata->>'archived','false')<>'true' loop
  windows:=go_booking_timeline_private.available_segments(p_business,professional.id,a,z)*tstzmultirange(tstzrange(a,z,'[)'));
  busy:=go_booking_timeline_private.occupied(p_business,professional.id,a,z,null,true)*windows;
  free:=windows-busy;minimum:=go_booking_timeline_private.minimum_service(p_business,professional.id);gaps:='[]';
  select coalesce(sum(extract(epoch from(upper(r)-lower(r)))/60),0),max(upper(r)) into available,last_end from unnest(windows) r;
  select coalesce(sum(extract(epoch from(upper(r)-lower(r)))/60),0) into occupied from unnest(busy) r;
  if last_end>clock_timestamp() then finished:=false;end if;
  for gap in select unnest(free) loop
   gaps:=gaps||jsonb_build_array(jsonb_build_object('startsAt',lower(gap),'endsAt',upper(gap),'minutes',extract(epoch from(upper(gap)-lower(gap)))/60));
  end loop;
  select count(*) filter(where b.timing_snapshot->'gapPolicy'->>'version'='1' and not coalesce((policy->>'exceptionUsed')::boolean,false)),
    count(*) filter(where coalesce((policy->>'exceptionUsed')::boolean,false)),
    count(*) filter(where b.timing_snapshot->'gapPolicy' is null)
   into ordinary,exceptional,legacy from public.bookings b
   left join lateral (select value policy from jsonb_array_elements(b.timing_snapshot->'gapPolicy'->'professionals') r
     where r->>'staffId'=professional.id::text) p on true
   where b.business_id=p_business and b.starts_at>=a and b.starts_at<z and b.status::text not in ('CANCELLED','REJECTED','EXPIRED')
   and (b.staff_id=professional.id or exists(select 1 from jsonb_array_elements(b.timing_snapshot->'workIntervals') w where w->>'staffId'=professional.id::text));
  rows:=rows||jsonb_build_array(jsonb_build_object('staffId',professional.id,'name',professional.display_name,'minimumMinutes',minimum,
    'ordinaryBookings',ordinary,'exceptionBookings',exceptional,'legacyBookings',legacy,'availableMinutes',available,'occupiedMinutes',occupied,
    'freeMinutes',available-occupied,'remainingGaps',gaps,
    'recommendation',case when available>occupied then 'REVIEW_FUTURE_AVAILABILITY' else 'KEEP_AUTHORIZED_RULES' end));
 end loop;
 return jsonb_build_object('version',1,'dateISO',p_date,'timezone',zone,'finished',finished and clock_timestamp()>=a,'professionals',rows,
   'basis','scheduled-occupation','estimatedOpportunities',true,'automaticConfigurationChanges',false);
end; $$;

create or replace function public.go_booking_gap_policy_version()
returns integer language sql stable security invoker set search_path='' as $$
 -- Installing helpers alone must NOT advertise an upgraded booking authority.
 select case when position('go_booking_timeline_private.gap_admission(p_business,p_start,result,p_exclude)'
   in pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('go_booking_timeline_private.plan(uuid,uuid[],timestamptz,uuid,jsonb,uuid,uuid)')))>0
  and position('''gapPolicyVersion'',1' in pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('go_booking_timeline_private.availability(uuid,uuid[],timestamptz,timestamptz,uuid,integer,date,integer,boolean)')))>0
  and position('validate_gap_policy' in pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('go_booking_timeline_private.lock_configuration()')))>0
 then 1 else 0 end;
$$;
revoke all on function public.go_booking_gap_policy_version() from public,anon,authenticated;
grant execute on function public.go_booking_gap_policy_version() to authenticated;

create or replace function public.go_booking_day_analysis(p_business_id uuid,p_date_iso date)
returns jsonb language sql security invoker set search_path='' as $$
 select go_booking_timeline_private.day_analysis(p_business_id,p_date_iso);
$$;
revoke all on function go_booking_timeline_private.valid_gap(numeric,integer),
 go_booking_timeline_private.minimum_service(uuid,uuid),go_booking_timeline_private.validate_gap_policy(jsonb),
 go_booking_timeline_private.available_segments(uuid,uuid,timestamptz,timestamptz),
 go_booking_timeline_private.occupied(uuid,uuid,timestamptz,timestamptz,uuid,boolean),
 go_booking_timeline_private.gap_start_windows(uuid,uuid,timestamptz,timestamptz),
 go_booking_timeline_private.gap_start_possible(jsonb,timestamptz,integer),
 go_booking_timeline_private.gap_admission(uuid,timestamptz,jsonb,uuid),go_booking_timeline_private.day_analysis(uuid,date)
 from public,anon,authenticated;
revoke all on function public.go_booking_day_analysis(uuid,date) from public,anon,authenticated;
grant execute on function public.go_booking_day_analysis(uuid,date),go_booking_timeline_private.day_analysis(uuid,date) to authenticated;
commit;
