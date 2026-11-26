begin;

-- The existing planner already authorizes p_exclude against this exact booking,
-- business and customer. Permit a fresh catalogue plan for that same booking;
-- a foreign booking ID still fails before any occupancy is excluded.
do $$
declare definition text; needle text:='if p_frozen is distinct from coalesce(frozen_booking.timing_snapshot,go_booking_timeline_private.legacy(frozen_booking)) then';
begin
 definition:=pg_catalog.pg_get_functiondef('go_booking_timeline_private.plan(uuid,uuid[],timestamptz,uuid,jsonb,uuid,uuid)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))<>length(needle) then raise exception 'Unexpected booking planner version';end if;
 definition:=replace(definition,needle,'if p_frozen is not null and p_frozen is distinct from coalesce(frozen_booking.timing_snapshot,go_booking_timeline_private.legacy(frozen_booking)) then');
 needle:='if not found or coalesce(p_customer,auth.uid())<>frozen_booking.customer_id then';
 if (length(definition)-length(replace(definition,needle,'')))<>length(needle) then raise exception 'Unexpected booking exclusion guard';end if;
 definition:=replace(definition,needle,'if not found or frozen_booking.status not in (''PENDING'',''CONFIRMED'') or coalesce(p_customer,auth.uid())<>frozen_booking.customer_id then');
 execute definition;
end $$;

create schema if not exists go_booking_change_private;
revoke all on schema go_booking_change_private from public,anon,authenticated;

-- This is the sole preview path. The caller supplies no business/customer to
-- exclude; both are taken from the owned, active booking after authorization.
create function go_booking_change_private.availability(p_booking_id uuid,p_service_ids uuid[],p_date_iso date,
 p_staff_id uuid default null,p_days integer default 1,p_dates_only boolean default false,p_step_minutes integer default 15)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.bookings; company public.businesses; tick timestamptz; stop_at timestamptz;
 plan jsonb; slots jsonb:='[]'; dates jsonb:='[]'; day text; last_day text; offered boolean;
 previous_valid boolean:=false; truncated boolean:=false;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED';end if;
 select * into saved from public.bookings where id=p_booking_id;
 if not found then raise exception using errcode='PT404',message='BOOKING_NOT_FOUND';end if;
 select * into company from public.businesses where id=saved.business_id;
 if saved.status not in ('PENDING','CONFIRMED') or not company.verified or not company.booking_enabled
  or (saved.customer_id is distinct from auth.uid() and company.owner_id is distinct from auth.uid()) then
  raise exception using errcode='PT404',message='BOOKING_NOT_FOUND';end if;
 if p_date_iso is null or p_days not between 1 and 31 or p_step_minutes not between 1 and 60
  or p_service_ids is null or cardinality(p_service_ids) not between 1 and 32 then
  raise exception using errcode='22023',message='BOOKING_INVALID_RANGE';end if;
 tick:=p_date_iso::timestamp at time zone company.timezone;
 stop_at:=(p_date_iso+p_days)::timestamp at time zone company.timezone;
 while tick<stop_at loop
  offered:=false;
  begin
   plan:=go_booking_timeline_private.plan(saved.business_id,p_service_ids,tick,p_staff_id,null,saved.id,saved.customer_id);
   if saved.party_size is null or go_restaurant_private.table_for(saved.business_id,saved.party_size,tick,(plan->>'endsAt')::timestamptz,saved.id) is not null then
    offered:=true;day:=to_char(tick at time zone company.timezone,'YYYY-MM-DD');
    if last_day is distinct from day then dates:=dates||jsonb_build_array(day);last_day:=day;end if;
    if p_dates_only then tick:=((tick at time zone company.timezone)::date+1)::timestamp at time zone company.timezone;continue;end if;
    if not previous_valid or p_step_minutes=1 or extract(minute from tick at time zone company.timezone)::integer%p_step_minutes=0
      or tick=saved.starts_at then slots:=slots||jsonb_build_array(plan);end if;
    if jsonb_array_length(slots)>=5000 then truncated:=true;tick:=tick+interval '1 minute';exit;end if;
   end if;
  exception when exclusion_violation then null;
   when sqlstate 'PT422' then
    if sqlerrm not in ('BOOKING_OUTSIDE_AVAILABILITY','BOOKING_STAFF_UNAVAILABLE','BOOKING_RESOURCE_UNAVAILABLE',
     'BOOKING_NO_ASSIGNED_SERVICES','BOOKING_GAP_NOT_MULTIPLE') then raise;end if;
  end;
  previous_valid:=offered;tick:=tick+interval '1 minute';
 end loop;
 return jsonb_build_object('version',1,'gapPolicyVersion',1,'phasePolicyVersion',1,'timezone',company.timezone,
  'slots',slots,'availableDates',dates,'truncated',truncated,'nextFrom',case when truncated then tick else null end);
end $$;
revoke all on function go_booking_change_private.availability(uuid,uuid[],date,uuid,integer,boolean,integer) from public,anon,authenticated;
create function public.go_booking_change_availability(p_booking_id uuid,p_service_ids uuid[],p_date_iso date,
 p_staff_id uuid default null,p_days integer default 1,p_dates_only boolean default false,p_step_minutes integer default 15)
returns jsonb language sql security invoker set search_path='' as $$
 select go_booking_change_private.availability(p_booking_id,p_service_ids,p_date_iso,p_staff_id,p_days,p_dates_only,p_step_minutes);
$$;
revoke all on function public.go_booking_change_availability(uuid,uuid[],date,uuid,integer,boolean,integer) from public,anon,authenticated;
grant execute on function public.go_booking_change_availability(uuid,uuid[],date,uuid,integer,boolean,integer) to authenticated;
grant usage on schema go_booking_change_private to authenticated;
grant execute on function go_booking_change_private.availability(uuid,uuid[],date,uuid,integer,boolean,integer) to authenticated;

-- A one-transaction journal entry, written by the negotiation core before
-- UPDATE, is the trusted marker for replacing an accepted selection. Direct
-- table UPDATE cannot manufacture this entry under RLS/GRANT restrictions.
create function go_reservation_negotiation.selection_accept_allowed(old_booking public.bookings,new_booking public.bookings)
returns boolean language sql security definer stable set search_path='' as $$
 select old_booking.change_proposal->'selection' is not null and new_booking.change_proposal is null
  and old_booking.id=new_booking.id and old_booking.status=new_booking.status
  and new_booking.catalog_snapshot=old_booking.change_proposal->'selection'->'catalogSnapshot'
  and to_jsonb(new_booking)->'service_ids'=old_booking.change_proposal->'selection'->'serviceIds'
  and exists(select 1 from go_reservation_negotiation.requests j
   where j.booking_id=old_booking.id and j.actor_id=auth.uid()
    and j.request_id::text=new_booking.change_history->-1->>'requestId'
    and j.command->>'operation'='accept'
    and j.command->>'proposalId'=old_booking.change_proposal->>'id'
    and new_booking.change_history->-1->>'outcome'='accepted'
    and new_booking.change_history->-1->>'actorId'=auth.uid()::text);
$$;
revoke all on function go_reservation_negotiation.selection_accept_allowed(public.bookings,public.bookings) from public,anon,authenticated;

-- Keep the installed trigger implementations, including later restaurant and
-- phase rules. Only the accepted, journaled selection may compile a fresh plan.
do $$
declare definition text; needle text;
begin
 definition:=pg_catalog.pg_get_functiondef('go_reservation_negotiation.guard_interval()'::regprocedure);
 needle:='frozen:=coalesce(old.timing_snapshot,go_booking_timeline_private.legacy(old));';
 if (length(definition)-length(replace(definition,needle,'')))<>length(needle) then raise exception 'Unexpected interval guard';end if;
 definition:=replace(definition,needle,
  'frozen:=case when go_reservation_negotiation.selection_accept_allowed(old,new) then null else coalesce(old.timing_snapshot,go_booking_timeline_private.legacy(old)) end;');
 needle:='new.timing_command->''serviceIds''';
 if (length(definition)-length(replace(definition,needle,'')))<>length(needle) then raise exception 'Unexpected interval service source';end if;
 definition:=replace(definition,needle,
  'case when go_reservation_negotiation.selection_accept_allowed(old,new) then null else new.timing_command->''serviceIds'' end');
 execute definition;

 definition:=pg_catalog.pg_get_functiondef('go_catalog_private.booking_guard()'::regprocedure);
 needle:='if new.catalog_snapshot is distinct from old.catalog_snapshot then raise exception using errcode=''42501'',message=''CATALOG_SNAPSHOT_IMMUTABLE'';end if;';
 if (length(definition)-length(replace(definition,needle,'')))<>length(needle) then raise exception 'Unexpected catalogue guard';end if;
 definition:=replace(definition,needle,
  'if new.catalog_snapshot is distinct from old.catalog_snapshot and not go_reservation_negotiation.selection_accept_allowed(old,new) then raise exception using errcode=''42501'',message=''CATALOG_SNAPSHOT_IMMUTABLE'';end if;');
 needle:='new:=jsonb_populate_record(new,jsonb_build_object(''total_price'',old.catalog_snapshot->''totalPrice'',''currency'',old.catalog_snapshot->''currency''));';
 if (length(definition)-length(replace(definition,needle,'')))<>length(needle) then raise exception 'Unexpected catalogue price guard';end if;
 definition:=replace(definition,needle,
  'new:=jsonb_populate_record(new,jsonb_build_object(''total_price'',new.catalog_snapshot->''totalPrice'',''currency'',new.catalog_snapshot->''currency''));');
 execute definition;

 definition:=pg_catalog.pg_get_functiondef('public.guard_customer_booking_update()'::regprocedure);
 needle:='''resource_id'',''timing_snapshot'']';
 if (length(definition)-length(replace(definition,needle,'')))<>2*length(needle) then raise exception 'Unexpected participant update guard';end if;
 definition:=replace(definition,needle,
  '''resource_id'',''timing_snapshot'',''service_id'',''service_ids'',''service_details'',''total_duration_minutes'',''total_price'',''currency'',''staff_id'',''catalog_snapshot'']');
 execute definition;
end $$;

-- The legacy RPC must not accept a selection proposal as a time-only change.
do $$
declare definition text;needle text:='if p_operation=''accept'' then';
begin
 definition:=pg_catalog.pg_get_functiondef('go_reservation_negotiation.act(uuid,text,uuid,bigint,uuid,text,text,timestamptz,boolean)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))<>length(needle) then raise exception 'Unexpected negotiation core';end if;
 definition:=replace(definition,needle,
  'if p_operation=''accept'' and proposal ? ''selection'' then raise exception using errcode=''PT409'',message=''BOOKING_SELECTION_REQUIRES_V2'';end if; if p_operation=''accept'' then');
 execute definition;
end $$;

create function go_reservation_negotiation.act_selection(p_booking_id uuid,p_operation text,p_request_id uuid,
 p_expected_revision bigint,p_proposal_id uuid,p_date_iso text,p_time text,p_starts_at timestamptz,
 p_financial_consent boolean,p_selection jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();saved public.bookings;business public.businesses;actor text;
 proposal jsonb;previous go_reservation_negotiation.requests;command jsonb;start_at timestamptz;
 local_start timestamp;plan jsonb;quote jsonb;roots uuid[];chosen uuid[];services uuid[];
 chosen_staff uuid;event jsonb;professional_name text;
begin
 if caller is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED';end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0
  or p_operation not in ('propose','counter','accept','reject','cancel','confirm') then
  raise exception using errcode='22023',message='BOOKING_INVALID_COMMAND';end if;
 select * into saved from public.bookings where id=p_booking_id;
 if not found then raise exception using errcode='PT404',message='BOOKING_NOT_FOUND';end if;
 select * into business from public.businesses where id=saved.business_id;
 if saved.customer_id is distinct from caller and not(business.owner_id=caller and business.verified) then
  raise exception using errcode='PT404',message='BOOKING_NOT_FOUND';end if;
 -- An accepted selection clears change_proposal. Read its durable journal first
 -- so an identical retry still returns the successful receipt after that clear.
 command:=jsonb_build_object('bookingId',p_booking_id,'operation',p_operation,'revision',p_expected_revision,
  'proposalId',p_proposal_id,'dateISO',p_date_iso,'time',p_time,'startsAt',p_starts_at,
  'financialConsent',p_financial_consent,'selection',p_selection);
 select * into previous from go_reservation_negotiation.requests where actor_id=caller and request_id=p_request_id;
 if found and previous.command ? 'selection' then
  if previous.command is distinct from command or previous.booking_id is distinct from p_booking_id then
   raise exception using errcode='PT409',message='BOOKING_REQUEST_REUSED';end if;
  return go_reservation_negotiation.receipt(saved.id);
 end if;
 -- Time-only decisions, rejection and cancellation preserve the installed core.
 if p_operation not in ('propose','counter','accept')
  or p_operation in ('propose','counter') and p_selection is null
  or p_operation='accept' and saved.change_proposal->'selection' is null then
  return go_reservation_negotiation.act(p_booking_id,p_operation,p_request_id,p_expected_revision,
   p_proposal_id,p_date_iso,p_time,p_starts_at,p_financial_consent);
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||saved.business_id::text,0));
 select * into saved from public.bookings where id=p_booking_id for update;
 select * into business from public.businesses where id=saved.business_id for share;
 if saved.customer_id=caller then actor:='customer';
 elsif business.owner_id=caller and business.verified then actor:='business';
 else raise exception using errcode='PT404',message='BOOKING_NOT_FOUND';end if;
 command:=jsonb_build_object('bookingId',p_booking_id,'operation',p_operation,'revision',p_expected_revision,
  'proposalId',p_proposal_id,'dateISO',p_date_iso,'time',p_time,'startsAt',p_starts_at,
  'financialConsent',p_financial_consent,'selection',p_selection);
 select * into previous from go_reservation_negotiation.requests where actor_id=caller and request_id=p_request_id;
 if found then
  if previous.command is distinct from command then raise exception using errcode='PT409',message='BOOKING_REQUEST_REUSED';end if;
  return go_reservation_negotiation.receipt(saved.id);
 end if;
 if saved.change_revision<>p_expected_revision then raise exception using errcode='PT409',message='BOOKING_REVISION_CONFLICT';end if;
 if saved.status not in ('PENDING','CONFIRMED') then raise exception using errcode='PT409',message='BOOKING_NOT_ACTIVE';end if;
 proposal:=saved.change_proposal;
 if p_operation in ('propose','counter') then
  if (proposal->>'id') is distinct from p_proposal_id::text or (p_operation='counter' and proposal is null) then
   raise exception using errcode='PT409',message='BOOKING_PROPOSAL_CHANGED';end if;
  if p_financial_consent is distinct from true then raise exception using errcode='PT422',message='BOOKING_FINANCIAL_ACCEPTANCE_REQUIRED';end if;
  if jsonb_typeof(p_selection) is distinct from 'object'
   or jsonb_typeof(p_selection->'catalogSnapshot') is distinct from 'object'
   or jsonb_typeof(p_selection->'serviceIds') is distinct from 'array'
   or p_date_iso is null or p_date_iso !~ '^\d{4}-\d{2}-\d{2}$'
   or p_time is null or p_time !~ '^([01]\d|2[0-3]):[0-5]\d$'
   or not exists(select 1 from pg_catalog.pg_timezone_names where name=business.timezone) then
   raise exception using errcode='22023',message='BOOKING_INVALID_COMMAND';end if;
  begin
   select array_agg(value::uuid order by ordinality) into roots
    from jsonb_array_elements_text(p_selection->'catalogSnapshot'->'rootIds') with ordinality;
   select coalesce(array_agg(value::uuid order by ordinality),'{}'::uuid[]) into chosen
    from jsonb_array_elements_text(p_selection->'catalogSnapshot'->'selectedAssociationIds') with ordinality;
   select array_agg(value::uuid order by ordinality) into services
    from jsonb_array_elements_text(p_selection->'serviceIds') with ordinality;
   chosen_staff:=nullif(p_selection->>'staffId','')::uuid;
   local_start:=(p_date_iso||' '||p_time)::timestamp;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
   raise exception using errcode='22023',message='BOOKING_INVALID_COMMAND';end;
  if p_starts_at is not null then
   start_at:=p_starts_at;
   if not isfinite(start_at) or start_at at time zone business.timezone<>local_start then
    raise exception using errcode='22023',message='BOOKING_INVALID_LOCAL_TIME';end if;
  else
   start_at:=local_start at time zone business.timezone;
   if start_at at time zone business.timezone<>local_start then raise exception using errcode='PT422',message='BOOKING_NONEXISTENT_LOCAL_TIME';end if;
   if (start_at-interval '1 hour') at time zone business.timezone=local_start
    or (start_at+interval '1 hour') at time zone business.timezone=local_start then
    raise exception using errcode='PT422',message='BOOKING_AMBIGUOUS_LOCAL_TIME';end if;
  end if;
  quote:=go_catalog_private.quote(saved.business_id,roots,chosen);
  if quote is distinct from p_selection->'catalogSnapshot'
   or quote->'serviceIds' is distinct from to_jsonb(services)
   or quote->>'ready'<>'true' then raise exception using errcode='PT409',message='BOOKING_CATALOG_CHANGED';end if;
  plan:=go_booking_timeline_private.plan(saved.business_id,services,start_at,chosen_staff,null,saved.id,saved.customer_id);
  if (plan->>'totalClientMinutes')::integer is distinct from (p_selection->>'durationMinutes')::integer
   or p_selection->>'staffId' is not null and plan->>'staffId' is distinct from p_selection->>'staffId' then
   raise exception using errcode='PT409',message='BOOKING_PLAN_CHANGED';end if;
  if saved.party_size is not null and go_restaurant_private.table_for(saved.business_id,saved.party_size,start_at,
   (plan->>'endsAt')::timestamptz,saved.id) is null then
   raise exception using errcode='PT409',message='RESTAURANT_CAPACITY_UNAVAILABLE';end if;
  if proposal is not null then
   saved.change_history:=saved.change_history||jsonb_build_array(jsonb_build_object('proposal',proposal,
    'outcome','countered','actor',actor,'actorId',caller,'at',floor(extract(epoch from now())*1000),'requestId',p_request_id));
  end if;
  select display_name into professional_name from public.staff where id=(plan->>'staffId')::uuid;
  proposal:=jsonb_build_object('id',p_request_id,'proposedBy',actor,'actorId',caller,'dateISO',p_date_iso,
   'date',to_char(local_start,'DD/MM/YYYY'),'time',p_time,'duration',(plan->>'totalClientMinutes')||'min',
   'proposedAt',floor(extract(epoch from now())*1000),'startsAt',start_at,'endsAt',plan->>'endsAt',
   'originalStartsAt',saved.starts_at,'originalEndsAt',saved.ends_at,
   'originalDateISO',to_char(saved.starts_at at time zone business.timezone,'YYYY-MM-DD'),
   'originalDate',to_char(saved.starts_at at time zone business.timezone,'DD/MM/YYYY'),
   'originalTime',to_char(saved.starts_at at time zone business.timezone,'HH24:MI'),
   'originalDuration',round(extract(epoch from(saved.ends_at-saved.starts_at))/60)::text||'min',
   'originalStartDatetime',to_char(saved.starts_at at time zone business.timezone,'YYYY-MM-DD"T"HH24:MI:SS'),
   'originalEndDatetime',to_char(saved.ends_at at time zone business.timezone,'YYYY-MM-DD"T"HH24:MI:SS'),
   'financialAcceptanceRequired',true,'proposerAcceptedFinancialTerms',true,
   'financialSettlement','unchanged_pending_external_review',
   'selection',jsonb_build_object('serviceIds',to_jsonb(services),'staffId',plan->'staffId',
    'professionalName',professional_name,'durationMinutes',plan->'totalClientMinutes','catalogSnapshot',quote),
   'timingSnapshot',plan);
  insert into go_reservation_negotiation.requests(actor_id,request_id,booking_id,command)
   values(caller,p_request_id,saved.id,command);
  update public.bookings set change_proposal=proposal,change_history=saved.change_history,
   change_revision=change_revision+1 where id=saved.id;
 else
  if proposal is null or proposal->>'id' is distinct from p_proposal_id::text then
   raise exception using errcode='PT409',message='BOOKING_PROPOSAL_CHANGED';end if;
  if proposal->>'actorId'=caller::text or proposal->>'proposedBy'=actor then
   raise exception using errcode='42501',message='BOOKING_OTHER_PARTICIPANT_REQUIRED';end if;
  if p_financial_consent is distinct from true or proposal->>'proposerAcceptedFinancialTerms'<>'true' then
   raise exception using errcode='PT422',message='BOOKING_FINANCIAL_ACCEPTANCE_REQUIRED';end if;
  if saved.starts_at is distinct from (proposal->>'originalStartsAt')::timestamptz
   or saved.ends_at is distinct from (proposal->>'originalEndsAt')::timestamptz then
   raise exception using errcode='PT409',message='BOOKING_ORIGINAL_CHANGED';end if;
  start_at:=(proposal->>'startsAt')::timestamptz;
  quote:=proposal->'selection'->'catalogSnapshot';
  select array_agg(value::uuid order by ordinality) into roots
   from jsonb_array_elements_text(quote->'rootIds') with ordinality;
  select coalesce(array_agg(value::uuid order by ordinality),'{}'::uuid[]) into chosen
   from jsonb_array_elements_text(quote->'selectedAssociationIds') with ordinality;
  select array_agg(value::uuid order by ordinality) into services
   from jsonb_array_elements_text(quote->'serviceIds') with ordinality;
  chosen_staff:=(proposal->'selection'->>'staffId')::uuid;
  if go_catalog_private.quote(saved.business_id,roots,chosen) is distinct from quote then
   raise exception using errcode='PT409',message='BOOKING_CATALOG_CHANGED';end if;
  plan:=go_booking_timeline_private.plan(saved.business_id,services,start_at,chosen_staff,null,saved.id,saved.customer_id);
  if plan->'phases' is distinct from proposal->'timingSnapshot'->'phases'
   or plan->>'endsAt' is distinct from proposal->>'endsAt' then
   raise exception using errcode='PT409',message='BOOKING_PLAN_CHANGED';end if;
  if saved.party_size is not null and go_restaurant_private.table_for(saved.business_id,saved.party_size,start_at,
   (plan->>'endsAt')::timestamptz,saved.id) is null then
   raise exception using errcode='PT409',message='RESTAURANT_CAPACITY_UNAVAILABLE';end if;
  event:=jsonb_build_object('proposal',proposal,'outcome','accepted','actor',actor,'actorId',caller,
   'at',floor(extract(epoch from now())*1000),'requestId',p_request_id,'financialConsent',true);
  insert into go_reservation_negotiation.requests(actor_id,request_id,booking_id,command)
   values(caller,p_request_id,saved.id,command);
  update public.bookings set service_id=services[1],service_ids=services,
   service_details=plan->'serviceDetails',staff_id=(plan->>'staffId')::uuid,
   starts_at=start_at,ends_at=(plan->>'endsAt')::timestamptz,
   total_duration_minutes=(plan->>'totalClientMinutes')::integer,timing_snapshot=plan,
   catalog_snapshot=quote,total_price=(quote->>'totalPrice')::numeric,currency=quote->>'currency',
   change_proposal=null,change_history=change_history||jsonb_build_array(event),
   change_revision=change_revision+1 where id=saved.id;
 end if;
 return go_reservation_negotiation.receipt(saved.id);
end $$;
revoke all on function go_reservation_negotiation.act_selection(uuid,text,uuid,bigint,uuid,text,text,timestamptz,boolean,jsonb) from public,anon,authenticated;
grant execute on function go_reservation_negotiation.act_selection(uuid,text,uuid,bigint,uuid,text,text,timestamptz,boolean,jsonb) to authenticated;
create function public.go_negotiate_booking_selection(p_booking_id uuid,p_operation text,p_request_id uuid,p_expected_revision bigint,
 p_proposal_id uuid default null,p_date_iso text default null,p_time text default null,p_starts_at timestamptz default null,
 p_financial_consent boolean default false,p_selection jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$
 select go_reservation_negotiation.act_selection(p_booking_id,p_operation,p_request_id,p_expected_revision,p_proposal_id,
  p_date_iso,p_time,p_starts_at,p_financial_consent,p_selection);
$$;
revoke all on function public.go_negotiate_booking_selection(uuid,text,uuid,bigint,uuid,text,text,timestamptz,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.go_negotiate_booking_selection(uuid,text,uuid,bigint,uuid,text,text,timestamptz,boolean,jsonb) to authenticated;

commit;
