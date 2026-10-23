-- REVIEW DRAFT ONLY. Never run against a real database without Nelson's review.
-- Apply after the committed GO migrations. Works with or without the separate
-- booking_multi_service_v2 draft; it neither installs nor modifies that contract.
-- No auth/payout/price changes, no new global role and no broader table grants.
begin;

create schema go_reservation_negotiation;
revoke all on schema go_reservation_negotiation from public, anon, authenticated;
grant usage on schema go_reservation_negotiation to authenticated;

alter table public.bookings
  add column change_proposal jsonb,
  add column change_history jsonb not null default '[]',
  add column change_revision bigint not null default 0,
  add constraint booking_change_shape check (
    (change_proposal is null or jsonb_typeof(change_proposal)='object')
    and jsonb_typeof(change_history)='array' and change_revision >= 0);

-- Durable request journal: a retry cannot apply a decision twice. No direct
-- client access. History remains attached to the ONE existing booking row.
create table go_reservation_negotiation.requests (
  actor_id uuid not null references public.profiles(id),
  request_id uuid not null,
  booking_id uuid not null references public.bookings(id),
  command jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id, request_id)
);
alter table go_reservation_negotiation.requests enable row level security;
revoke all on go_reservation_negotiation.requests from public, anon, authenticated;
create index booking_negotiation_requests_booking on go_reservation_negotiation.requests(booking_id,created_at);

-- Not executable by clients. Called only AFTER participant authorization, from
-- the restricted core below. Receipts remain readable if a catalogue is hidden.
create function go_reservation_negotiation.receipt(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$
  select jsonb_build_object('id',r.id,'business_id',r.business_id,'service_id',r.service_id,'staff_id',r.staff_id,
    'customer_id',r.customer_id,'starts_at',r.starts_at,'ends_at',r.ends_at,'status',r.status,'notes',r.notes,
    'created_at',r.created_at,'updated_at',r.updated_at,'change_proposal',r.change_proposal,
    'change_history',r.change_history,'change_revision',r.change_revision,
    'service_ids',to_jsonb(r)->'service_ids','service_details',to_jsonb(r)->'service_details',
    'total_duration_minutes',to_jsonb(r)->'total_duration_minutes','total_price',to_jsonb(r)->'total_price',
    'currency',to_jsonb(r)->'currency','request_key',to_jsonb(r)->'request_key',
    'timing_snapshot',to_jsonb(r)->'timing_snapshot','catalog_snapshot',to_jsonb(r)->'catalog_snapshot') || jsonb_build_object(
    'business_name', b.name, 'business_address', b.address, 'business_timezone', b.timezone,
    'service_name', s.name, 'staff_name', p.display_name,
    'customer_name',case when c.full_name not like '%@%' then nullif(btrim(c.full_name),'') else null end)
  from public.bookings r join public.businesses b on b.id=r.business_id
  join public.services s on s.id=r.service_id left join public.staff p on p.id=r.staff_id
  left join public.profiles c on c.id=r.customer_id
  where r.id=p_id;
$$;
revoke all on function go_reservation_negotiation.receipt(uuid) from public,anon,authenticated;

-- All booking paths (including legacy single-service REST inserts) serialize
-- by business. The boolean check sees hidden busy rows, returning no private
-- customer data. It also covers legacy unassigned bookings vs assigned staff.
create function go_reservation_negotiation.guard_interval() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return new; end if; -- trusted maintenance only
  if new.customer_id is distinct from auth.uid() and not exists(
    select 1 from public.businesses b where b.id=new.business_id and b.verified and b.owner_id=auth.uid()) then
    raise exception using errcode='42501',message='BOOKING_FORBIDDEN';
  end if;
  if tg_op='UPDATE' and new.starts_at=old.starts_at and new.ends_at=old.ends_at
    and new.status=old.status and new.staff_id is not distinct from old.staff_id then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||new.business_id::text,0));
  if new.status in ('PENDING','CONFIRMED') and exists(
    select 1 from public.bookings r where r.business_id=new.business_id and r.id<>new.id
      and r.status in ('PENDING','CONFIRMED')
      and (r.staff_id is null or new.staff_id is null or r.staff_id=new.staff_id)
      and r.starts_at<new.ends_at and r.ends_at>new.starts_at) then
    raise exception using errcode='23P01',message='BOOKING_CONFLICT';
  end if;
  return new;
end;
$$;
revoke all on function go_reservation_negotiation.guard_interval() from public,anon,authenticated;
create trigger a_go_negotiation_interval before insert or update on public.bookings
  for each row execute function go_reservation_negotiation.guard_interval();

create function go_reservation_negotiation.validate_slot(p_booking public.bookings,p_start timestamptz,p_end timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare
  item_id uuid;
  items uuid[];
  professional public.staff;
begin
  if p_start is null or not isfinite(p_start) or not isfinite(p_end) or p_start<=now()
    or p_end-p_start<>p_booking.ends_at-p_booking.starts_at then
    raise exception using errcode='PT422',message='BOOKING_INVALID_INTERVAL';
  end if;
  perform b.id from public.businesses b where b.id=p_booking.business_id and b.verified and b.booking_enabled for share;
  if not found then raise exception using errcode='PT422',message='BOOKING_BUSINESS_UNAVAILABLE'; end if;
  -- Hold scheduling rows until this transaction commits; no stale read followed
  -- by a detached PATCH. Snapshots/duration/prices of existing bookings survive.
  perform a.id from public.availability a where a.business_id=p_booking.business_id for share;
  if p_booking.staff_id is not null then
    select * into professional from public.staff p where p.id=p_booking.staff_id
      and p.business_id=p_booking.business_id and p.active and coalesce(p.ui_metadata->>'archived','false')<>'true' for share;
    if not found then raise exception using errcode='PT422',message='BOOKING_STAFF_UNAVAILABLE'; end if;
  end if;
  select array_agg(value::uuid) into items from jsonb_array_elements_text(
    case when jsonb_typeof(to_jsonb(p_booking)->'service_ids')='array' then to_jsonb(p_booking)->'service_ids' else '[]'::jsonb end);
  items:=coalesce(items,array[p_booking.service_id]);
  foreach item_id in array items loop
    perform s.id from public.services s where s.id=item_id and s.business_id=p_booking.business_id
      and s.active and coalesce(s.ui_metadata->>'archived','false')<>'true'
      and coalesce(s.ui_metadata->>'visible','true')<>'false' for share;
    if not found then raise exception using errcode='PT422',message='BOOKING_SERVICE_UNAVAILABLE'; end if;
    if p_booking.staff_id is not null and professional.ui_metadata ? 'serviceIds' then
      if jsonb_typeof(professional.ui_metadata->'serviceIds')<>'array' then
        raise exception using errcode='PT422',message='BOOKING_STAFF_UNAVAILABLE';
      end if;
      if jsonb_array_length(professional.ui_metadata->'serviceIds')>0
        and not (professional.ui_metadata->'serviceIds' @> jsonb_build_array(item_id::text)) then
        raise exception using errcode='PT422',message='BOOKING_STAFF_UNAVAILABLE';
      end if;
    end if;
    if not exists(select 1 from public.availability a where a.business_id=p_booking.business_id and a.active
      and coalesce(a.ui_metadata->>'archived','false')<>'true'
      and (not(a.ui_metadata ? 'bookableItemId') or a.ui_metadata->>'bookableItemId' is null or a.ui_metadata->>'bookableItemId'=item_id::text)
      and (case when p_booking.staff_id is not null and exists(select 1 from public.availability own_shift
        where own_shift.business_id=p_booking.business_id and own_shift.staff_id=p_booking.staff_id and own_shift.active
        and coalesce(own_shift.ui_metadata->>'archived','false')<>'true'
        and own_shift.weekday=extract(dow from p_start at time zone own_shift.timezone))
        then a.staff_id=p_booking.staff_id else a.staff_id is null end)
      and a.weekday=extract(dow from p_start at time zone a.timezone)
      and p_start>=(((p_start at time zone a.timezone)::date+a.start_time) at time zone a.timezone)
      and p_end<=(((p_start at time zone a.timezone)::date+a.end_time) at time zone a.timezone)) then
      raise exception using errcode='PT422',message='BOOKING_OUTSIDE_AVAILABILITY';
    end if;
  end loop;
  if exists(select 1 from public.bookings r where r.business_id=p_booking.business_id and r.id<>p_booking.id
    and r.status in ('PENDING','CONFIRMED') and (r.staff_id is null or p_booking.staff_id is null or r.staff_id=p_booking.staff_id)
    and r.starts_at<p_end and r.ends_at>p_start) then
    raise exception using errcode='23P01',message='BOOKING_CONFLICT';
  end if;
end;
$$;
revoke all on function go_reservation_negotiation.validate_slot(public.bookings,timestamptz,timestamptz) from public,anon,authenticated;

create function go_reservation_negotiation.act(p_booking_id uuid,p_operation text,p_request_id uuid,
  p_expected_revision bigint,p_proposal_id uuid,p_date_iso text,p_time text,p_starts_at timestamptz,p_financial_consent boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  caller uuid:=auth.uid();
  saved public.bookings;
  business public.businesses;
  actor text;
  proposal jsonb;
  existing go_reservation_negotiation.requests;
  command jsonb;
  start_at timestamptz;
  end_at timestamptz;
  local_start timestamp;
  event jsonb;
begin
  if caller is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision<0
    or p_operation is null or p_operation not in ('propose','counter','accept','reject','cancel','confirm') then
    raise exception using errcode='22023',message='BOOKING_INVALID_COMMAND';
  end if;
  select * into saved from public.bookings where id=p_booking_id;
  if not found then raise exception using errcode='PT404',message='BOOKING_NOT_FOUND'; end if;
  select * into business from public.businesses where id=saved.business_id;
  if saved.customer_id=caller then actor:='customer';
  elsif business.owner_id=caller and business.verified then actor:='business';
  else raise exception using errcode='PT404',message='BOOKING_NOT_FOUND'; end if;
  -- Same lock namespace/order as the multi-service draft and legacy INSERTs.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||saved.business_id::text,0));
  select * into saved from public.bookings where id=p_booking_id for update;
  select * into business from public.businesses where id=saved.business_id for share;
  if saved.customer_id=caller then actor:='customer';
  elsif business.owner_id=caller and business.verified then actor:='business';
  else raise exception using errcode='PT404',message='BOOKING_NOT_FOUND'; end if;
  command:=jsonb_build_object('bookingId',p_booking_id,'operation',p_operation,'revision',p_expected_revision,
    'proposalId',p_proposal_id,'dateISO',p_date_iso,'time',p_time,'startsAt',p_starts_at,'financialConsent',p_financial_consent);
  select * into existing from go_reservation_negotiation.requests where actor_id=caller and request_id=p_request_id;
  if found then
    if existing.command is distinct from command then
      raise exception using errcode='PT409',message='BOOKING_REQUEST_REUSED';
    end if;
    return go_reservation_negotiation.receipt(saved.id);
  end if;
  if saved.change_revision<>p_expected_revision then
    raise exception using errcode='PT409',message='BOOKING_REVISION_CONFLICT';
  end if;
  if saved.status not in ('PENDING','CONFIRMED') and not(p_operation='cancel' and saved.status='CANCELLED') then
    raise exception using errcode='PT409',message='BOOKING_NOT_ACTIVE';
  end if;
  proposal:=saved.change_proposal;
  if p_operation='cancel' then
    -- Existing cancellation policy/permissions; never perform financial actions.
    -- The shared audit trigger also covers the old PATCH /cancel endpoint.
    update public.bookings set status='CANCELLED' where id=saved.id;
  elsif p_operation='confirm' then
    if actor<>'business' then raise exception using errcode='42501',message='BOOKING_BUSINESS_ACCEPTANCE_REQUIRED'; end if;
    if saved.status<>'PENDING' or saved.change_proposal is not null then
      raise exception using errcode='PT409',message='BOOKING_NOT_PENDING'; end if;
    perform go_reservation_negotiation.validate_slot(saved,saved.starts_at,saved.ends_at);
    update public.bookings set status='CONFIRMED',change_history=change_history||jsonb_build_array(
      jsonb_build_object('outcome','reservation_confirmed','actor',actor,'actorId',caller,'at',floor(extract(epoch from now())*1000),'requestId',p_request_id)) where id=saved.id;
  elsif p_operation in ('propose','counter') then
    if (proposal->>'id') is distinct from p_proposal_id::text or (p_operation='counter' and proposal is null) then
      raise exception using errcode='PT409',message='BOOKING_PROPOSAL_CHANGED';
    end if;
    if p_financial_consent is distinct from true then
      raise exception using errcode='PT422',message='BOOKING_FINANCIAL_ACCEPTANCE_REQUIRED';
    end if;
    if p_date_iso is null or p_date_iso !~ '^\d{4}-\d{2}-\d{2}$' or p_time is null or p_time !~ '^([01]\d|2[0-3]):[0-5]\d$'
      or not exists(select 1 from pg_catalog.pg_timezone_names where name=business.timezone) then
      raise exception using errcode='22023',message='BOOKING_INVALID_LOCAL_TIME';
    end if;
    begin local_start:=(p_date_iso||' '||p_time)::timestamp;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception using errcode='22023',message='BOOKING_INVALID_LOCAL_TIME'; end;
    if p_starts_at is not null then
      start_at:=p_starts_at;
      if not isfinite(start_at) or start_at at time zone business.timezone<>local_start then
        raise exception using errcode='22023',message='BOOKING_INVALID_LOCAL_TIME'; end if;
    else
      start_at:=local_start at time zone business.timezone;
      if start_at at time zone business.timezone<>local_start then
        raise exception using errcode='PT422',message='BOOKING_NONEXISTENT_LOCAL_TIME'; end if;
      if (start_at-interval '1 hour') at time zone business.timezone=local_start
        or (start_at+interval '1 hour') at time zone business.timezone=local_start then
        raise exception using errcode='PT422',message='BOOKING_AMBIGUOUS_LOCAL_TIME'; end if;
    end if;
    end_at:=start_at+(saved.ends_at-saved.starts_at);
    perform go_reservation_negotiation.validate_slot(saved,start_at,end_at);
    if proposal is not null then
      event:=jsonb_build_object('proposal',proposal,'outcome','countered','actor',actor,'actorId',caller,'at',floor(extract(epoch from now())*1000),'requestId',p_request_id);
      saved.change_history:=saved.change_history||jsonb_build_array(event);
    end if;
    proposal:=jsonb_build_object('id',p_request_id,'proposedBy',actor,'actorId',caller,'dateISO',p_date_iso,
      'date',to_char(local_start,'DD/MM/YYYY'),'time',p_time,'duration',round(extract(epoch from(saved.ends_at-saved.starts_at))/60)::text||'min',
      'proposedAt',floor(extract(epoch from now())*1000),'startsAt',start_at,'endsAt',end_at,'originalStartsAt',saved.starts_at,'originalEndsAt',saved.ends_at,
      'originalDateISO',to_char(saved.starts_at at time zone business.timezone,'YYYY-MM-DD'),
      'originalDate',to_char(saved.starts_at at time zone business.timezone,'DD/MM/YYYY'),
      'originalTime',to_char(saved.starts_at at time zone business.timezone,'HH24:MI'),
      'originalDuration',round(extract(epoch from(saved.ends_at-saved.starts_at))/60)::text||'min',
      'originalStartDatetime',to_char(saved.starts_at at time zone business.timezone,'YYYY-MM-DD"T"HH24:MI:SS'),
      'originalEndDatetime',to_char(saved.ends_at at time zone business.timezone,'YYYY-MM-DD"T"HH24:MI:SS'),
      'financialAcceptanceRequired',true,'proposerAcceptedFinancialTerms',true,'financialSettlement','unchanged_pending_external_review');
    update public.bookings set change_proposal=proposal,change_history=saved.change_history,change_revision=change_revision+1 where id=saved.id;
  else
    if proposal is null or proposal->>'id' is distinct from p_proposal_id::text then
      raise exception using errcode='PT409',message='BOOKING_PROPOSAL_CHANGED'; end if;
    -- Same human cannot represent both sides to accept their own request.
    if proposal->>'actorId'=caller::text or proposal->>'proposedBy'=actor then
      raise exception using errcode='42501',message='BOOKING_OTHER_PARTICIPANT_REQUIRED'; end if;
    if p_operation='accept' then
      if p_financial_consent is distinct from true or proposal->>'proposerAcceptedFinancialTerms'<>'true' then
        raise exception using errcode='PT422',message='BOOKING_FINANCIAL_ACCEPTANCE_REQUIRED'; end if;
      if saved.starts_at is distinct from (proposal->>'originalStartsAt')::timestamptz
        or saved.ends_at is distinct from (proposal->>'originalEndsAt')::timestamptz then
        raise exception using errcode='PT409',message='BOOKING_ORIGINAL_CHANGED'; end if;
      start_at:=(proposal->>'startsAt')::timestamptz;
      end_at:=(proposal->>'endsAt')::timestamptz;
      perform go_reservation_negotiation.validate_slot(saved,start_at,end_at);
    else start_at:=saved.starts_at; end_at:=saved.ends_at; end if;
    event:=jsonb_build_object('proposal',proposal,'outcome',case when p_operation='accept' then 'accepted' else 'rejected' end,
      'actor',actor,'actorId',caller,'at',floor(extract(epoch from now())*1000),'requestId',p_request_id,'financialConsent',p_financial_consent);
    update public.bookings set starts_at=start_at,ends_at=end_at,change_proposal=null,
      change_history=change_history||jsonb_build_array(event),change_revision=change_revision+1 where id=saved.id;
  end if;
  insert into go_reservation_negotiation.requests(actor_id,request_id,booking_id,command) values(caller,p_request_id,saved.id,command);
  return go_reservation_negotiation.receipt(saved.id);
end;
$$;
revoke all on function go_reservation_negotiation.act(uuid,text,uuid,bigint,uuid,text,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function go_reservation_negotiation.act(uuid,text,uuid,bigint,uuid,text,text,timestamptz,boolean) to authenticated;

-- Keep existing direct-cancellation and verified-business behavior. The only
-- extra branch runs under the trusted core's owner, never under authenticated.
-- No client-settable GUC, editable metadata, or broad UPDATE(date) grant is used.
create or replace function public.guard_customer_booking_update()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then return new; end if;
  if current_user=(select pg_catalog.pg_get_userbyid(p.proowner) from pg_catalog.pg_proc p
      where p.oid='go_reservation_negotiation.act(uuid,text,uuid,bigint,uuid,text,text,timestamptz,boolean)'::regprocedure)
    and old.customer_id=auth.uid()
    and (to_jsonb(new)-array['starts_at','ends_at','status','change_proposal','change_history','change_revision','updated_at','resource_id','timing_snapshot'])
      is not distinct from(to_jsonb(old)-array['starts_at','ends_at','status','change_proposal','change_history','change_revision','updated_at','resource_id','timing_snapshot']) then
    return new;
  end if;
  if exists(select 1 from public.businesses b where b.id=old.business_id and b.owner_id=auth.uid() and b.verified) then return new; end if;
  if old.customer_id<>auth.uid() or old.status not in ('PENDING','CONFIRMED','CANCELLED') or new.status<>'CANCELLED'
    or(to_jsonb(new)-'status'-'updated_at'-'resource_id') is distinct from(to_jsonb(old)-'status'-'updated_at'-'resource_id') then
    raise exception using errcode='42501',message='Customers may only cancel their own active bookings'; end if;
  return new;
end;
$$;
revoke all on function public.guard_customer_booking_update() from public,anon,authenticated;

create function go_reservation_negotiation.audit_terminal_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor text;
begin
  if new.status is distinct from old.status then
    new.change_revision:=old.change_revision+1;
    if new.status not in ('PENDING','CONFIRMED') and old.change_proposal is not null then
      actor:=case when old.customer_id=auth.uid() then 'customer' else 'business' end;
      new.change_history:=old.change_history||jsonb_build_array(jsonb_build_object('proposal',old.change_proposal,
        'outcome','cancelled','actor',actor,'actorId',auth.uid(),'at',floor(extract(epoch from now())*1000),'reason','booking_'||new.status::text));
      new.change_proposal:=null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function go_reservation_negotiation.audit_terminal_status() from public,anon,authenticated;
-- After the existing caller guard; legacy cancellations may not inject history.
create trigger z_go_negotiation_terminal before update on public.bookings
  for each row execute function go_reservation_negotiation.audit_terminal_status();

create function public.go_negotiate_booking(p_booking_id uuid,p_operation text,p_request_id uuid,p_expected_revision bigint,
  p_proposal_id uuid default null,p_date_iso text default null,p_time text default null,p_starts_at timestamptz default null,p_financial_consent boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
  select go_reservation_negotiation.act(p_booking_id,p_operation,p_request_id,p_expected_revision,p_proposal_id,p_date_iso,p_time,p_starts_at,p_financial_consent);
$$;
revoke all on function public.go_negotiate_booking(uuid,text,uuid,bigint,uuid,text,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.go_negotiate_booking(uuid,text,uuid,bigint,uuid,text,text,timestamptz,boolean) to authenticated;

create function go_reservation_negotiation.list_receipts(p_business_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  return coalesce((select jsonb_agg(go_reservation_negotiation.receipt(r.id) order by r.starts_at desc,r.id)
    from public.bookings r join public.businesses b on b.id=r.business_id
    where (p_business_id is null or r.business_id=p_business_id)
      and (r.customer_id=auth.uid() or (b.owner_id=auth.uid() and b.verified))), '[]'::jsonb);
end;
$$;
revoke all on function go_reservation_negotiation.list_receipts(uuid) from public,anon,authenticated;
grant execute on function go_reservation_negotiation.list_receipts(uuid) to authenticated;
create function public.go_booking_receipts(p_business_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select go_reservation_negotiation.list_receipts(p_business_id); $$;
revoke all on function public.go_booking_receipts(uuid) from public,anon,authenticated;
grant execute on function public.go_booking_receipts(uuid) to authenticated;
commit;
