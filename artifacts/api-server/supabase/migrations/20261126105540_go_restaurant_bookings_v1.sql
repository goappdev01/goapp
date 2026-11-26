-- Additive restaurant capacity layer over the existing timeline/catalogue engine.
-- Apply only after the existing booking_timeline_v1 and catalog_associations_v1.
-- Restaurant table geometry/capacity lives in the existing owner-scoped
-- business_settings.payload.floorPlan. No second booking queue is introduced.

alter table public.bookings add column if not exists party_size integer;
alter table public.bookings add column if not exists restaurant_table_id text;
alter table public.bookings add constraint bookings_restaurant_party_shape
  check ((party_size is null and restaurant_table_id is null) or
         (party_size between 1 and 40 and restaurant_table_id is not null and length(restaurant_table_id) between 1 and 100));
create index if not exists bookings_restaurant_table_interval
  on public.bookings (business_id, restaurant_table_id, starts_at, ends_at)
  where status in ('PENDING','CONFIRMED') and restaurant_table_id is not null;

create schema if not exists go_restaurant_private;
revoke all on schema go_restaurant_private from public, anon, authenticated;
grant usage on schema go_restaurant_private to authenticated;

create function go_restaurant_private.is_restaurant(p_business uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.businesses b where b.id=p_business
  and b.ui_metadata->>'category'='restaurante');
$$;

create function go_restaurant_private.table_for(p_business uuid,p_party integer,p_start timestamptz,p_end timestamptz,p_exclude uuid default null)
returns text language plpgsql stable security definer set search_path='' as $$
declare chosen text; room_limit integer; occupied integer; plan jsonb;
begin
 if p_party is null or p_party not between 1 and 40 or p_end<=p_start then
  raise exception using errcode='22023',message='RESTAURANT_INVALID_PARTY_SIZE';end if;
 select s.payload->'floorPlan' into plan from public.business_settings s where s.business_id=p_business;
 if jsonb_typeof(plan->'elements') is distinct from 'array' then
  raise exception using errcode='PT422',message='RESTAURANT_TABLES_UNCONFIGURED';end if;
 if (plan->>'occupancyLimit') ~ '^[0-9]{1,4}$' then room_limit:=(plan->>'occupancyLimit')::integer;end if;
 if room_limit is not null then
  select coalesce(sum(b.party_size),0) into occupied from public.bookings b
   where b.business_id=p_business and b.id is distinct from p_exclude
    and b.status in ('PENDING','CONFIRMED') and b.starts_at<p_end and b.ends_at>p_start;
  if occupied+p_party>room_limit then return null;end if;
 end if;
 select e->>'id' into chosen from jsonb_array_elements(plan->'elements') e
  where e->>'type'='mesa' and e->>'reservable'='true' and e->>'status'='disponible'
   and (e->>'capacity')~'^[0-9]{1,2}$' and (e->>'capacity')::integer>=p_party
   and not exists(select 1 from public.bookings b where b.business_id=p_business
    and b.id is distinct from p_exclude and b.restaurant_table_id=e->>'id'
    and b.status in ('PENDING','CONFIRMED') and b.starts_at<p_end and b.ends_at>p_start)
  order by (e->>'capacity')::integer,e->>'id' limit 1;
 return chosen;
end; $$;

-- A table already claimed by one restaurant booking is not a business-wide
-- staff conflict. The table selector above remains the capacity authority.
-- Legacy bookings without a table keep the conservative old conflict rule.
create or replace function go_booking_timeline_private.work_free(p_business uuid,p_staff uuid,p_start timestamptz,
 p_end timestamptz,p_exclude uuid)
returns boolean language sql stable set search_path='' as $$
 select not exists(select 1 from public.bookings b
 where b.business_id=p_business and b.id is distinct from p_exclude and b.status in ('PENDING','CONFIRMED')
 and b.starts_at<p_end and b.ends_at>p_start
 and not (p_staff is null and b.restaurant_table_id is not null)
 and ((b.timing_snapshot is null and (p_staff is null or b.staff_id is null or b.staff_id=p_staff))
  or (b.timing_snapshot is not null and exists(select 1 from jsonb_array_elements(b.timing_snapshot->'workIntervals') w
   where (p_staff is null or w->>'staffId' is null or w->>'staffId'=p_staff::text)
   and (w->>'startsAt')::timestamptz<p_end and (w->>'endsAt')::timestamptz>p_start))));
$$;

create function go_restaurant_private.guard_booking() returns trigger
language plpgsql security definer set search_path='' as $$
declare restaurant boolean; requested text; chosen text;
begin
 restaurant:=go_restaurant_private.is_restaurant(new.business_id);
 if tg_op='UPDATE' and old.party_size is not null then restaurant:=true;end if;
 if not restaurant then
  if new.party_size is not null or new.restaurant_table_id is not null then
   raise exception using errcode='22023',message='RESTAURANT_BOOKING_ONLY';end if;
  return new;
 end if;
 if tg_op='UPDATE' and (new.party_size is distinct from old.party_size
   or new.restaurant_table_id is distinct from old.restaurant_table_id) then
  raise exception using errcode='42501',message='RESTAURANT_CAPACITY_SERVER_OWNED';end if;
 if tg_op='INSERT' then
  requested:=nullif(pg_catalog.current_setting('go.restaurant_party_size',true),'');
  if requested is null or requested!~'^[0-9]{1,2}$' then
   raise exception using errcode='PT422',message='RESTAURANT_PARTY_REQUIRED';end if;
  new.party_size:=requested::integer;
 end if;
 if new.party_size is null or new.party_size not between 1 and 40 then
  raise exception using errcode='PT422',message='RESTAURANT_INVALID_PARTY_SIZE';end if;
 if new.status not in ('PENDING','CONFIRMED') then return new;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||new.business_id::text,0));
 if tg_op='UPDATE' and new.starts_at=old.starts_at and new.ends_at=old.ends_at
  and new.status=old.status then return new;end if;
 chosen:=go_restaurant_private.table_for(new.business_id,new.party_size,new.starts_at,new.ends_at,
   case when tg_op='UPDATE' then new.id else null end);
 if chosen is null then raise exception using errcode='PT409',message='RESTAURANT_CAPACITY_UNAVAILABLE';end if;
 new.restaurant_table_id:=chosen;
 return new;
end; $$;
create trigger zzz_restaurant_booking before insert or update on public.bookings
 for each row execute function go_restaurant_private.guard_booking();

-- Preserve the existing participant-scoped receipt; expose only the booked
-- party and assigned table in addition to the fields already returned.
create or replace function go_reservation_negotiation.receipt(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'business_id',r.business_id,'service_id',r.service_id,'staff_id',r.staff_id,
  'customer_id',r.customer_id,'starts_at',r.starts_at,'ends_at',r.ends_at,'status',r.status,'notes',r.notes,
  'created_at',r.created_at,'updated_at',r.updated_at,'change_proposal',r.change_proposal,
  'change_history',r.change_history,'change_revision',r.change_revision,
  'service_ids',to_jsonb(r)->'service_ids','service_details',to_jsonb(r)->'service_details',
  'total_duration_minutes',to_jsonb(r)->'total_duration_minutes','total_price',to_jsonb(r)->'total_price',
  'currency',to_jsonb(r)->'currency','request_key',to_jsonb(r)->'request_key',
  'timing_snapshot',to_jsonb(r)->'timing_snapshot','catalog_snapshot',to_jsonb(r)->'catalog_snapshot',
  'party_size',r.party_size,'restaurant_table_id',r.restaurant_table_id) || jsonb_build_object(
  'business_name',b.name,'business_address',b.address,'business_timezone',b.timezone,
  'service_name',s.name,'staff_name',p.display_name,
  'customer_name',case when c.full_name not like '%@%' then nullif(btrim(c.full_name),'') else null end,
  'customer_phone',case when b.verified and b.owner_id=auth.uid() then nullif(btrim(c.phone),'') else null end,
  'business_phone',coalesce(nullif(b.ui_metadata->>'phoneE164',''),nullif(b.ui_metadata->>'mobileE164',''),nullif(b.ui_metadata->>'phone',''),nullif(b.ui_metadata->>'mobile','')),
  'business_whatsapp',coalesce(nullif(b.ui_metadata->>'whatsappE164',''),nullif(b.ui_metadata->>'whatsapp','')))
 from public.bookings r join public.businesses b on b.id=r.business_id
 join public.services s on s.id=r.service_id left join public.staff p on p.id=r.staff_id
 left join public.profiles c on c.id=r.customer_id where r.id=p_id;
$$;

-- Configuration writes hold the same lock as booking creation and may not
-- remove, block or shrink a table that a future live booking has claimed.
create function go_restaurant_private.guard_plan() returns trigger
language plpgsql security definer set search_path='' as $$
declare b record; table_after jsonb; item jsonb; ids text[]:='{}'; cap integer;
begin
 if not exists(select 1 from public.businesses x where x.id=new.business_id
   and x.ui_metadata->>'category'='restaurante') then return new;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||new.business_id::text,0));
 if new.payload ? 'floorPlan' then
  if jsonb_typeof(new.payload->'floorPlan'->'elements') is distinct from 'array'
   or jsonb_array_length(new.payload->'floorPlan'->'elements')>200
   or new.payload->'floorPlan'->>'businessId' is distinct from new.business_id::text then
   raise exception using errcode='22023',message='RESTAURANT_INVALID_FLOOR_PLAN';end if;
  if new.payload->'floorPlan' ? 'occupancyLimit' and
   ((new.payload->'floorPlan'->>'occupancyLimit')!~'^[0-9]{1,4}$'
    or (new.payload->'floorPlan'->>'occupancyLimit')::integer<1) then
   raise exception using errcode='22023',message='RESTAURANT_INVALID_AFORO';end if;
  for item in select value from jsonb_array_elements(new.payload->'floorPlan'->'elements') loop
   if item->>'type'='mesa' then
    if coalesce(item->>'id','')='' or length(item->>'id')>100 or item->>'id'=any(ids)
     or (item->>'capacity')!~'^[0-9]{1,2}$' or (item->>'capacity')::integer not between 1 and 40 then
     raise exception using errcode='22023',message='RESTAURANT_INVALID_TABLE';end if;
    ids:=array_append(ids,item->>'id');
   end if;
  end loop;
  if new.payload->'floorPlan' ? 'occupancyLimit' then
   cap:=(new.payload->'floorPlan'->>'occupancyLimit')::integer;
   for b in select starts_at,ends_at from public.bookings where business_id=new.business_id
    and status in ('PENDING','CONFIRMED') and ends_at>now() loop
    if cap < (select coalesce(sum(party_size),0) from public.bookings x
      where x.business_id=new.business_id and x.status in ('PENDING','CONFIRMED')
       and x.starts_at<b.ends_at and x.ends_at>b.starts_at) then
     raise exception using errcode='PT409',message='RESTAURANT_AFORO_IN_USE';end if;
   end loop;
  end if;
 end if;
 for b in select distinct restaurant_table_id,party_size from public.bookings
  where business_id=new.business_id and status in ('PENDING','CONFIRMED')
   and ends_at>now() and restaurant_table_id is not null loop
  select value into table_after from jsonb_array_elements(coalesce(new.payload->'floorPlan'->'elements','[]'::jsonb))
   where value->>'id'=b.restaurant_table_id and value->>'type'='mesa';
  if table_after is null or table_after->>'reservable'<>'true'
   or table_after->>'status'<>'disponible' or (table_after->>'capacity')::integer<b.party_size then
   raise exception using errcode='PT409',message='RESTAURANT_TABLE_IN_USE';end if;
 end loop;
 return new;
end; $$;
create trigger z_restaurant_plan before insert or update of payload on public.business_settings
 for each row execute function go_restaurant_private.guard_plan();

create function public.go_create_restaurant_catalog_booking(p_business_id uuid,p_root_ids uuid[],p_selected_ids uuid[],
 p_starts_at timestamptz,p_staff_id uuid,p_request_key text,p_expected_quote jsonb,
 p_expected_plan jsonb default null,p_expected_end timestamptz default null,p_notes text default null,
 p_customer_id uuid default null,p_party_size integer default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not go_restaurant_private.is_restaurant(p_business_id) or p_party_size not between 1 and 40
  or not exists(select 1 from public.businesses b where b.id=p_business_id and b.verified and b.booking_enabled) then
  raise exception using errcode='PT422',message='RESTAURANT_BOOKING_UNAVAILABLE';end if;
 perform pg_catalog.set_config('go.restaurant_party_size',p_party_size::text,true);
 result:=public.go_create_catalog_booking(p_business_id,p_root_ids,p_selected_ids,p_starts_at,p_staff_id,
  p_request_key,p_expected_quote,p_expected_plan,p_expected_end,p_notes,p_customer_id);
 if (result->>'party_size')::integer is distinct from p_party_size then
  raise exception using errcode='PT409',message='CATALOG_REQUEST_REUSED';end if;
 return result;
end; $$;

create function public.go_create_restaurant_timeline_booking(p_business_id uuid,p_service_ids uuid[],p_starts_at timestamptz,
 p_staff_id uuid,p_request_key text,p_notes text default null,p_status public.booking_status default 'CONFIRMED',
 p_customer_id uuid default null,p_expected_plan jsonb default null,p_expected_end_at timestamptz default null,
 p_party_size integer default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not go_restaurant_private.is_restaurant(p_business_id) or p_party_size not between 1 and 40
  or not exists(select 1 from public.businesses b where b.id=p_business_id and b.verified and b.booking_enabled) then
  raise exception using errcode='PT422',message='RESTAURANT_BOOKING_UNAVAILABLE';end if;
 perform pg_catalog.set_config('go.restaurant_party_size',p_party_size::text,true);
 result:=public.go_create_timeline_booking(p_business_id,p_service_ids,p_starts_at,p_staff_id,p_request_key,p_notes,
  p_status,p_customer_id,p_expected_plan,p_expected_end_at);
 if (result->>'party_size')::integer is distinct from p_party_size then
  raise exception using errcode='PT409',message='BOOKING_REQUEST_REUSED';end if;
 return result;
end; $$;

create function public.go_restaurant_availability(p_business_id uuid,p_service_ids uuid[],p_from timestamptz default null,
 p_to timestamptz default null,p_staff_id uuid default null,p_step_minutes integer default 1,p_date_iso date default null,
 p_days integer default 1,p_dates_only boolean default false,p_party_size integer default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare zone text; tick timestamptz; stop_at timestamptz; result jsonb; slots jsonb:='[]'; dates jsonb:='[]';
 day text; last_day text; truncated boolean:=false; offered boolean; previous_valid boolean:=false;
begin
 if not go_restaurant_private.is_restaurant(p_business_id) or p_party_size not between 1 and 40
  or not exists(select 1 from public.businesses b where b.id=p_business_id and b.verified and b.booking_enabled) then
  raise exception using errcode='PT422',message='RESTAURANT_BOOKING_UNAVAILABLE';end if;
 if p_step_minutes is null or p_step_minutes not between 1 and 60 or p_days is null or p_days not between 1 and 31 then
  raise exception using errcode='22023',message='BOOKING_INVALID_RANGE';end if;
 select timezone into zone from public.businesses where id=p_business_id;
 tick:=coalesce(p_from,p_date_iso::timestamp at time zone zone);
 stop_at:=coalesce(p_to,(p_date_iso+p_days)::timestamp at time zone zone);
 if tick is null or stop_at is null or not isfinite(tick) or not isfinite(stop_at) or stop_at<=tick
  or stop_at-tick>interval '32 days' or date_trunc('minute',tick)<>tick or date_trunc('minute',stop_at)<>stop_at then
  raise exception using errcode='22023',message='BOOKING_INVALID_RANGE';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||p_business_id::text,0));
 while tick<stop_at loop
  offered:=false;
  begin
   result:=go_booking_timeline_private.plan(p_business_id,p_service_ids,tick,p_staff_id);
   if go_restaurant_private.table_for(p_business_id,p_party_size,tick,(result->>'endsAt')::timestamptz) is not null then
    offered:=true;
    day:=to_char(tick at time zone zone,'YYYY-MM-DD');
    if last_day is distinct from day then dates:=dates||jsonb_build_array(day);last_day:=day;end if;
    if p_dates_only then tick:=((tick at time zone zone)::date+1)::timestamp at time zone zone;continue;end if;
    if not previous_valid or p_step_minutes=1 or extract(minute from tick at time zone zone)::integer%p_step_minutes=0 then
     slots:=slots||jsonb_build_array(result);end if;
    if jsonb_array_length(slots)>=5000 then truncated:=true;tick:=tick+interval '1 minute';exit;end if;
   end if;
  exception when exclusion_violation then null;
   when sqlstate 'PT422' then
    if sqlerrm not in ('BOOKING_OUTSIDE_AVAILABILITY','BOOKING_STAFF_UNAVAILABLE','BOOKING_RESOURCE_UNAVAILABLE',
     'BOOKING_NO_ASSIGNED_SERVICES','BOOKING_GAP_NOT_MULTIPLE') then raise;end if;
  end;
  previous_valid:=offered;
  tick:=tick+interval '1 minute';
 end loop;
 return jsonb_build_object('version',1,'gapPolicyVersion',1,'phasePolicyVersion',1,'timezone',zone,
  'slots',slots,'availableDates',dates,'truncated',truncated,'nextFrom',case when truncated then tick else null end);
end; $$;

revoke all on all functions in schema go_restaurant_private from public,anon,authenticated;
grant execute on function go_restaurant_private.is_restaurant(uuid),
 go_restaurant_private.table_for(uuid,integer,timestamptz,timestamptz,uuid) to authenticated;
revoke all on function public.go_create_restaurant_catalog_booking(uuid,uuid[],uuid[],timestamptz,uuid,text,jsonb,jsonb,timestamptz,text,uuid,integer),
 public.go_create_restaurant_timeline_booking(uuid,uuid[],timestamptz,uuid,text,text,public.booking_status,uuid,jsonb,timestamptz,integer),
 public.go_restaurant_availability(uuid,uuid[],timestamptz,timestamptz,uuid,integer,date,integer,boolean,integer) from public,anon,authenticated;
grant execute on function public.go_create_restaurant_catalog_booking(uuid,uuid[],uuid[],timestamptz,uuid,text,jsonb,jsonb,timestamptz,text,uuid,integer),
 public.go_create_restaurant_timeline_booking(uuid,uuid[],timestamptz,uuid,text,text,public.booking_status,uuid,jsonb,timestamptz,integer),
 public.go_restaurant_availability(uuid,uuid[],timestamptz,timestamptz,uuid,integer,date,integer,boolean,integer) to authenticated;
