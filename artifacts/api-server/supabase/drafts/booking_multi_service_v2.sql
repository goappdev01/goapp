-- DRAFT ONLY. Not applied. Review against the target schema before authorization.
-- Prerequisites: initial GO schema, owner security, generated resource guard,
-- isolated btree_gist, mobile ui_metadata, business verification migrations.
-- Existing rows are not rewritten. Existing single-service insert/cancel stays valid.
begin;
alter table public.bookings
  add column service_ids uuid[],
  add column service_details jsonb,
  add column total_duration_minutes integer,
  add column total_price numeric(14,2),
  add column currency text,
  add column request_key text;

alter table public.bookings add constraint booking_service_snapshot_shape check (
  (service_ids is null and service_details is null and total_duration_minutes is null
    and total_price is null and currency is null and request_key is null)
  or (service_ids is not null and cardinality(service_ids) between 1 and 32
    and service_id = service_ids[1] and jsonb_typeof(service_details) = 'array'
    and jsonb_array_length(service_details) = cardinality(service_ids)
    and total_duration_minutes > 0 and char_length(currency) = 3
    and (total_price is null or total_price >= 0)
    and request_key ~ '^[a-zA-Z0-9_-]{1,128}$')
);
create unique index booking_customer_request_unique on public.bookings(customer_id, request_key)
  where request_key is not null;

-- No grant to insert/update calculated snapshots. The INVOKER trigger resolves
-- canonical services under caller RLS, so direct REST inserts cannot forge totals.
grant insert (service_ids, request_key) on public.bookings to authenticated;
-- Minimal privileged lookup: customer RLS must not hide another customer's busy
-- interval. Only a boolean is returned, only for a published/owned business.
-- Keep DEFINER code outside the exposed public schema; no user/profile changes.
create schema go_booking_private;
revoke all on schema go_booking_private from public, anon, authenticated;
grant usage on schema go_booking_private to authenticated;
create function go_booking_private.interval_busy(p_business uuid,p_staff uuid,p_start timestamptz,p_end timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.businesses b where b.id=p_business
    and ((b.verified and b.booking_enabled) or b.owner_id=auth.uid())) then
    raise exception 'Business unavailable' using errcode='42501';
  end if;
  return exists(select 1 from public.bookings b where b.business_id=p_business and b.status in ('PENDING','CONFIRMED')
    and (b.staff_id is null or p_staff is null or b.staff_id=p_staff)
    and b.starts_at < p_end and b.ends_at > p_start);
end;
$$;
revoke all on function go_booking_private.interval_busy(uuid,uuid,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function go_booking_private.interval_busy(uuid,uuid,timestamptz,timestamptz) to authenticated;
create function public.go_guard_booking_services() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  selected public.services;
  professional public.staff;
  current_id uuid;
  minutes integer := 0;
  amount numeric := 0;
  known_price boolean := true;
  money text;
  details jsonb := '[]';
begin
  -- Serialize legacy and v2 insert paths together. The private busy lookup
  -- also covers unassigned legacy bookings which use a different resource_id.
  if auth.uid() is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:' || new.business_id::text, 0));
    if new.status in ('PENDING','CONFIRMED') and go_booking_private.interval_busy(new.business_id,new.staff_id,new.starts_at,new.ends_at) then
      raise exception 'Interval occupied' using errcode='23P01';
    end if;
  end if;
  if new.service_ids is null then
    if new.request_key is not null then raise exception 'Invalid request key' using errcode='22023'; end if;
    return new;
  end if;
  if auth.uid() is null or new.customer_id is distinct from auth.uid() then
    raise exception 'Customer identity mismatch' using errcode='42501';
  end if;
  if cardinality(new.service_ids) not between 1 and 32
    or array_ndims(new.service_ids) <> 1 or array_lower(new.service_ids,1) <> 1
    or new.service_id is distinct from new.service_ids[1]
    or (select count(distinct x) from unnest(new.service_ids) x) <> cardinality(new.service_ids)
    or new.request_key is null or new.request_key !~ '^[a-zA-Z0-9_-]{1,128}$'
    or new.status not in ('PENDING','CONFIRMED') or new.starts_at <= now()
    or length(coalesce(new.notes,'')) > 4000 then
    raise exception 'Invalid service booking' using errcode='22023';
  end if;
  if not exists(select 1 from public.businesses b where b.id=new.business_id and b.verified and b.booking_enabled) then
    raise exception 'Business unavailable' using errcode='22023';
  end if;
  if new.staff_id is not null then
    select * into professional from public.staff s where s.id=new.staff_id and s.business_id=new.business_id and s.active
      and coalesce(s.ui_metadata->>'archived','false') <> 'true';
    if not found then raise exception 'Professional unavailable' using errcode='22023'; end if;
  elsif exists(select 1 from public.staff s where s.business_id=new.business_id and s.active) then
    raise exception 'Assign a professional through the booking RPC' using errcode='22023';
  end if;

  foreach current_id in array new.service_ids loop
    select * into selected from public.services s where s.id=current_id and s.business_id=new.business_id and s.active
      and coalesce(s.ui_metadata->>'visible','true') <> 'false'
      and coalesce(s.ui_metadata->>'archived','false') <> 'true';
    if not found then raise exception 'Service unavailable' using errcode='22023'; end if;
    if money is not null and money <> selected.currency then raise exception 'Mixed currency' using errcode='22023'; end if;
    money := selected.currency;
    minutes := minutes + selected.duration_minutes;
    if selected.price is null then known_price:=false; else amount:=amount+selected.price; end if;
    details := details || jsonb_build_array(jsonb_build_object('id', selected.id, 'title', selected.name,
      'durationMinutes', selected.duration_minutes, 'price', selected.price, 'currency', money, 'priceKnown', selected.price is not null));
    if new.staff_id is not null and professional.ui_metadata ? 'serviceIds' then
      if jsonb_typeof(professional.ui_metadata->'serviceIds') <> 'array' then
        raise exception 'Invalid professional services' using errcode='22023';
      end if;
      if jsonb_array_length(professional.ui_metadata->'serviceIds') > 0
        and not (professional.ui_metadata->'serviceIds' @> jsonb_build_array(current_id::text)) then
        raise exception 'Professional does not provide all services' using errcode='22023';
      end if;
    end if;
  end loop;
  if new.ends_at - new.starts_at <> minutes * interval '1 minute' then
    raise exception 'Service duration mismatch' using errcode='22023';
  end if;

  -- Every selected service must fit the full interval in a matching active
  -- shift. Explicit staff shifts override business shifts, as on the client.
  -- Interpret each shift in its stored IANA timezone, including DST changes.
  foreach current_id in array new.service_ids loop
    if not exists(select 1 from public.availability a where a.business_id=new.business_id and a.active
      and coalesce(a.ui_metadata->>'archived','false') <> 'true'
      and (not (a.ui_metadata ? 'bookableItemId') or a.ui_metadata->>'bookableItemId' is null or a.ui_metadata->>'bookableItemId'=current_id::text)
      and (case when new.staff_id is not null and exists(select 1 from public.availability personal
          where personal.business_id=new.business_id and personal.staff_id=new.staff_id and personal.active
          and personal.weekday=extract(dow from new.starts_at at time zone personal.timezone))
        then a.staff_id=new.staff_id else a.staff_id is null end)
      and a.weekday=extract(dow from new.starts_at at time zone a.timezone)
      and new.starts_at >= (((new.starts_at at time zone a.timezone)::date + a.start_time) at time zone a.timezone)
      and new.ends_at <= (((new.starts_at at time zone a.timezone)::date + a.end_time) at time zone a.timezone)) then
      raise exception 'Outside service availability' using errcode='22023';
    end if;
  end loop;
  new.service_details:=details;
  new.total_duration_minutes:=minutes;
  new.total_price:=case when known_price then amount else null end;
  new.currency:=money;
  return new;
end;
$$;
revoke all on function public.go_guard_booking_services() from public, anon, authenticated;
create trigger bookings_service_snapshot before insert on public.bookings
  for each row execute function public.go_guard_booking_services();

-- Caller-scoped idempotency and the EXISTING exclusion constraint guarantee one
-- logical booking with one full interval; no partial writes or service child calls.
create function public.go_create_service_booking(p_business_id uuid, p_service_ids uuid[], p_staff_id uuid,
  p_starts_at timestamptz, p_ends_at timestamptz, p_notes text, p_status public.booking_status, p_request_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  caller uuid := auth.uid();
  saved public.bookings;
  resource record;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_request_key is null or p_request_key !~ '^[a-zA-Z0-9_-]{1,128}$' then
    raise exception 'Invalid request key' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text || ':' || p_request_key, 0));
  select * into saved from public.bookings where customer_id=caller and request_key=p_request_key;
  if found then
    if saved.business_id is distinct from p_business_id or saved.service_ids is distinct from p_service_ids
      or saved.starts_at is distinct from p_starts_at or saved.ends_at is distinct from p_ends_at
      or saved.notes is distinct from p_notes or (p_staff_id is not null and saved.staff_id is distinct from p_staff_id)
      or saved.status not in ('PENDING','CONFIRMED') then
      raise exception 'Request key already used for another operation' using errcode='22023';
    end if;
    return to_jsonb(saved);
  end if;
  for resource in
    select s.id from public.staff s where s.business_id=p_business_id and s.active
      and coalesce(s.ui_metadata->>'archived','false') <> 'true' and (p_staff_id is null or s.id=p_staff_id)
    union all select null::uuid where p_staff_id is null
      and not exists(select 1 from public.staff s where s.business_id=p_business_id and s.active)
    order by 1 nulls last
  loop
    begin
      insert into public.bookings(business_id,service_id,staff_id,customer_id,starts_at,ends_at,status,notes,service_ids,request_key)
      values(p_business_id,p_service_ids[1],resource.id,caller,p_starts_at,p_ends_at,p_status,p_notes,p_service_ids,p_request_key)
      returning * into saved;
      return to_jsonb(saved);
    exception
      when exclusion_violation or invalid_parameter_value then
        if p_staff_id is not null then raise; end if;
        -- Roll back only this attempted assignment; try the next real professional.
    end;
  end loop;
  raise exception 'No professional available for the full interval' using errcode='23P01';
end;
$$;
revoke all on function public.go_create_service_booking(uuid,uuid[],uuid,timestamptz,timestamptz,text,public.booking_status,text) from public, anon, authenticated;
grant execute on function public.go_create_service_booking(uuid,uuid[],uuid,timestamptz,timestamptz,text,public.booking_status,text) to authenticated;

create function public.go_booking_contract() returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  return jsonb_build_object('version',2,'multiService',true);
end;
$$;
revoke all on function public.go_booking_contract() from public, anon, authenticated;
grant execute on function public.go_booking_contract() to authenticated;
-- No policy is widened; all calls retain caller JWT + existing RLS and column grants.
commit;
