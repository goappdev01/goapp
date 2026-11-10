-- Review draft. Apply after calendar exceptions, canonical timeline and catalog_voluntary_v1.
begin;
do $$
begin
 if pg_catalog.to_regclass('go_catalog_private.booking_commands') is null
  or pg_catalog.to_regprocedure('public.go_booking_calendar_exceptions(uuid,date,uuid,date)') is null then
  raise exception 'Booking discounts require the reviewed catalogue and calendar exceptions';
 end if;
end $$;

create schema go_booking_discounts_private;
revoke all on schema go_booking_discounts_private from public, anon, authenticated;
grant usage on schema go_booking_discounts_private to authenticated;

create table go_booking_discounts_private.promotions (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 business_id uuid not null references public.businesses(id),
 date_iso date not null check (pg_catalog.isfinite(date_iso)),
 start_minute integer not null check (start_minute >= 0),
 end_minute integer not null check (end_minute <= 1440 and end_minute > start_minute),
 basis_points integer not null check (basis_points between 0 and 10000),
 service_ids uuid[] check (service_ids is null or cardinality(service_ids) between 1 and 64),
 active boolean not null,
 revision integer not null default 1,
 created_by uuid not null, updated_by uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted_at timestamptz
);
alter table go_booking_discounts_private.promotions enable row level security;
revoke all on go_booking_discounts_private.promotions from public, anon, authenticated;
create index go_booking_discount_dates on go_booking_discounts_private.promotions(business_id,date_iso);

create function go_booking_discounts_private.hairdresser(p_category text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(regexp_replace(translate(lower(btrim(p_category)), 'áéíóú', 'aeiou'), '[[:space:]]+', ' ', 'g')
  in ('peluqueria','peluquerias','belleza peluqueria','belleza/peluqueria'), false);
$$;

create function go_booking_discounts_private.manage(p_business uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved go_booking_discounts_private.promotions; day date; a integer; z integer;
 points integer; services uuid[]; enabled boolean; actor uuid:=auth.uid(); business public.businesses;
begin
 if actor is null then raise exception using errcode='42501',message='BOOKING_DISCOUNT_FORBIDDEN'; end if;
 perform go_catalog_private.owner(p_business);
 select * into business from public.businesses where id=p_business;
 if p_action in ('create','update') and not go_booking_discounts_private.hairdresser(business.ui_metadata->>'category') then
  raise exception using errcode='42501',message='BOOKING_DISCOUNT_ACTIVITY_FORBIDDEN';end if;
 if p_action='list' then
  return jsonb_build_object('timezone',business.timezone,'promotions',coalesce((
   select jsonb_agg(jsonb_build_object('id',p.id,'dateISO',p.date_iso,'startMinute',p.start_minute,
    'endMinute',p.end_minute,'basisPoints',p.basis_points,'serviceIds',p.service_ids,'active',p.active,'revision',p.revision)
    order by p.date_iso,p.start_minute,p.id) from go_booking_discounts_private.promotions p
    where p.business_id=p_business and p.deleted_at is null),'[]'::jsonb),
   'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name,s.id)
    from public.services s where s.business_id=p_business and s.active
     and go_catalog_private.kind(s.ui_metadata)='service' and coalesce(s.ui_metadata->>'archived','false')<>'true'),'[]'::jsonb));
 end if;
 if p_action is null or p_action not in ('create','update','delete') or jsonb_typeof(p_input) is distinct from 'object' then
  raise exception using errcode='PT422',message='BOOKING_DISCOUNT_INVALID'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||p_business::text,0));
 if p_action<>'create' then
  select * into saved from go_booking_discounts_private.promotions where business_id=p_business and id=(p_input->>'id')::uuid and deleted_at is null;
  if not found then raise exception using errcode='PT404',message='BOOKING_DISCOUNT_NOT_FOUND';end if;
  if saved.revision is distinct from (p_input->>'revision')::integer then
   raise exception using errcode='PT409',message='BOOKING_DISCOUNT_STALE';end if;
 end if;
 if p_action='delete' then
  update go_booking_discounts_private.promotions set active=false,deleted_at=now(),updated_at=now(),updated_by=actor,revision=revision+1 where id=saved.id;
  return jsonb_build_object('id',saved.id);
 end if;
 if coalesce(p_input->>'dateISO','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  or jsonb_typeof(p_input->'active') is distinct from 'boolean'
  or coalesce(p_input->>'startMinute','') !~ '^[0-9]{1,4}$'
  or coalesce(p_input->>'endMinute','') !~ '^[0-9]{1,4}$'
  or coalesce(p_input->>'basisPoints','') !~ '^[0-9]{1,5}$'
  or (p_input ? 'serviceIds' and jsonb_typeof(p_input->'serviceIds') not in ('null','array')) then
  raise exception using errcode='PT422',message='BOOKING_DISCOUNT_INVALID'; end if;
 day:=(p_input->>'dateISO')::date;
 a:=(p_input->>'startMinute')::integer; z:=(p_input->>'endMinute')::integer;
 points:=(p_input->>'basisPoints')::integer; enabled:=(p_input->>'active')::boolean;
 if day::text<>p_input->>'dateISO' or z>1440 or z<=a or points>10000 then
  raise exception using errcode='PT422',message='BOOKING_DISCOUNT_INVALID'; end if;
 if jsonb_typeof(p_input->'serviceIds')='array' then
  if jsonb_array_length(p_input->'serviceIds') not between 1 and 64 then
   raise exception using errcode='PT422',message='BOOKING_DISCOUNT_INVALID_SERVICES';end if;
  select array_agg(x::uuid order by x::uuid) into services from jsonb_array_elements_text(p_input->'serviceIds') x;
  if cardinality(services)<>(select count(distinct x) from unnest(services) x)
   or cardinality(services)<>(select count(*) from public.services s where s.id=any(services)
    and s.business_id=p_business and go_catalog_private.kind(s.ui_metadata)='service') then
   raise exception using errcode='PT422',message='BOOKING_DISCOUNT_INVALID_SERVICES';end if;
 end if;
 if p_action='create' then
  select * into saved from go_booking_discounts_private.promotions p where p.business_id=p_business and p.date_iso=day
   and p.start_minute=a and p.end_minute=z and p.basis_points=points and p.service_ids is not distinct from services
   and p.active=enabled and p.deleted_at is null;
  if found then return jsonb_build_object('id',saved.id);end if;
 end if;
 if enabled and points>0 and exists(select 1 from go_booking_discounts_private.promotions p
   where p.business_id=p_business and p.date_iso=day and p.active and p.deleted_at is null
    and p.basis_points>0 and p.id is distinct from saved.id and p.start_minute<z and p.end_minute>a
    and (services is null or p.service_ids is null or p.service_ids&&services)) then
  raise exception using errcode='PT409',message='BOOKING_DISCOUNT_OVERLAP';
 end if;
 if p_action='create' then
  insert into go_booking_discounts_private.promotions(business_id,date_iso,start_minute,end_minute,basis_points,service_ids,active,created_by,updated_by)
   values(p_business,day,a,z,points,services,enabled,actor,actor) returning * into saved;
 else
  update go_booking_discounts_private.promotions set date_iso=day,start_minute=a,end_minute=z,basis_points=points,service_ids=services,
   active=enabled,revision=revision+1,updated_by=actor,updated_at=now() where id=saved.id returning * into saved;
 end if;
 return jsonb_build_object('id',saved.id);
end $$;

create function go_booking_discounts_private.rate(p_business uuid,p_service uuid,p_start timestamptz) returns integer
language sql stable security definer set search_path='' as $$
 select coalesce((select p.basis_points from go_booking_discounts_private.promotions p
  join public.businesses b on b.id=p.business_id
  cross join lateral (select p_start at time zone b.timezone local_start) l
  cross join lateral (select extract(hour from l.local_start)::integer*60+extract(minute from l.local_start)::integer m) t
  where p.business_id=p_business and go_booking_discounts_private.hairdresser(b.ui_metadata->>'category')
   and p.date_iso=l.local_start::date and p.active and p.deleted_at is null and p.basis_points>0
   and t.m>=p.start_minute and t.m<p.end_minute and (p.service_ids is null or p_service=any(p.service_ids))
  order by p.basis_points desc,p.id limit 1),0);
$$;

create function go_booking_discounts_private.price(p_business uuid,p_quote jsonb,p_start timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare line jsonb; lines jsonb:='[]'; base numeric; reduction numeric; points integer;
 original numeric:=0; discounted numeric:=0;
begin
 for line in select value from jsonb_array_elements(p_quote->'lines') loop
  base:=coalesce((line->>'originalCharge')::numeric,(line->>'charge')::numeric);
  points:=case when line->>'kind'='service' and line->>'included'='false' and base>0
   then go_booking_discounts_private.rate(p_business,(line->>'itemId')::uuid,p_start) else 0 end;
  reduction:=round(base*points/10000,2);
  original:=original+base; discounted:=discounted+reduction;
  line:=(line-array['originalCharge','discountAmount','discountBasisPoints'])||jsonb_build_object('charge',base-reduction);
  if points>0 then line:=line||jsonb_build_object('originalCharge',base,'discountAmount',reduction,'discountBasisPoints',points);end if;
  lines:=lines||jsonb_build_array(line);
 end loop;
 p_quote:=(p_quote-array['originalTotal','discountTotal'])||jsonb_build_object('lines',lines,'totalPrice',original-discounted);
 if exists(select 1 from jsonb_array_elements(lines) l where l ? 'discountBasisPoints') then
  p_quote:=p_quote||jsonb_build_object('originalTotal',original,'discountTotal',discounted);end if;
 return p_quote;
end $$;

create function go_booking_discounts_private.quote(p_business uuid,p_roots uuid[],p_selected uuid[],p_start timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_start is null or not pg_catalog.isfinite(p_start) then raise exception using errcode='PT422',message='BOOKING_DISCOUNT_INVALID';end if;
 return go_booking_discounts_private.price(p_business,go_catalog_private.quote(p_business,p_roots,p_selected),p_start);
end $$;

create function go_booking_discounts_private.prices(p_business uuid,p_roots uuid[],p_selected uuid[],p_starts timestamptz[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare base jsonb; result jsonb;
begin
 if p_starts is null or cardinality(p_starts) not between 1 and 112
  or exists(select 1 from unnest(p_starts) t where t is null or not pg_catalog.isfinite(t)) then
  raise exception using errcode='PT422',message='BOOKING_DISCOUNT_INVALID'; end if;
 base:=go_catalog_private.quote(p_business,p_roots,p_selected);
 select jsonb_object_agg(to_char(slot at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS".000Z"'),
   jsonb_build_object('totalPrice',q->'totalPrice','discountTotal',coalesce(q->'discountTotal','0'::jsonb)))
 into result from (select distinct x slot from unnest(p_starts) x) slots
 cross join lateral (select go_booking_discounts_private.price(p_business,base,slot) q) prices;
 return result;
end $$;

create function public.go_booking_discount_prices(p_business_id uuid,p_root_ids uuid[],p_selected_ids uuid[],p_starts_at timestamptz[]) returns jsonb
language sql security invoker set search_path='' as $$ select go_booking_discounts_private.prices(p_business_id,p_root_ids,p_selected_ids,p_starts_at) $$;

create function public.go_booking_discounts(p_business_id uuid,p_action text,p_input jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select go_booking_discounts_private.manage(p_business_id,p_action,p_input) $$;
create function public.go_booking_discount_quote(p_business_id uuid,p_root_ids uuid[],p_selected_ids uuid[],p_starts_at timestamptz) returns jsonb
language sql security invoker set search_path='' as $$ select go_booking_discounts_private.quote(p_business_id,p_root_ids,p_selected_ids,p_starts_at) $$;

-- Preserve the installed transaction, idempotency and canonical availability checks.
-- Fail the entire migration when the reviewed catalogue integration point differs.
do $$
declare definition text; original text:='q:=go_catalog_private.quote(p_business,p_roots,p_selected);';
begin
 definition:=pg_catalog.pg_get_functiondef('go_catalog_private.create_booking(uuid,uuid[],uuid[],timestamptz,uuid,text,jsonb,jsonb,timestamptz,text,uuid)'::regprocedure);
 if (length(definition)-length(replace(definition,original,'')))<>length(original) then
  raise exception 'Unexpected catalogue booking implementation';
 end if;
 execute replace(definition,original,'q:=go_booking_discounts_private.quote(p_business,p_roots,p_selected,p_start);');
end $$;

create function go_booking_discounts_private.guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare expected jsonb; service uuid; rates integer; old_rates integer; target timestamptz:=new.starts_at;
begin
 if tg_op='UPDATE' and new.starts_at is not distinct from old.starts_at then
  if new.change_proposal is null or new.change_proposal is not distinct from old.change_proposal then return new;end if;
  target:=(new.change_proposal->>'startsAt')::timestamptz;
  if target is null then return new;end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('go-booking:'||new.business_id::text,0));
 if new.catalog_snapshot is not null then
  expected:=go_booking_discounts_private.price(new.business_id,new.catalog_snapshot,target);
  if tg_op='INSERT' and expected is distinct from new.catalog_snapshot then
   raise exception using errcode='PT409',message='BOOKING_DISCOUNT_QUOTE_REQUIRED';
  elsif tg_op='UPDATE' and expected->'totalPrice' is distinct from old.catalog_snapshot->'totalPrice' then
   raise exception using errcode='PT409',message='BOOKING_DISCOUNT_RESCHEDULE_REVIEW_REQUIRED';
  end if;
 else
  for service in select value::uuid from jsonb_array_elements_text(coalesce(new.timing_snapshot->'serviceIds',jsonb_build_array(new.service_id))) loop
   rates:=go_booking_discounts_private.rate(new.business_id,service,target);
   if tg_op='INSERT' and rates>0 then raise exception using errcode='PT409',message='BOOKING_DISCOUNT_QUOTE_REQUIRED';end if;
   if tg_op='UPDATE' then
    old_rates:=go_booking_discounts_private.rate(old.business_id,service,old.starts_at);
    if rates>0 or old_rates>0 then
     raise exception using errcode='PT409',message='BOOKING_DISCOUNT_RESCHEDULE_REVIEW_REQUIRED';end if;
   end if;
  end loop;
 end if;
 return new;
end $$;
create trigger zzz_go_booking_discount_guard before insert or update on public.bookings
 for each row execute function go_booking_discounts_private.guard();

revoke all on all functions in schema go_booking_discounts_private from public,anon,authenticated;
revoke all on function public.go_booking_discount_prices(uuid,uuid[],uuid[],timestamptz[]),public.go_booking_discounts(uuid,text,jsonb), public.go_booking_discount_quote(uuid,uuid[],uuid[],timestamptz) from public,anon,authenticated;
grant execute on function public.go_booking_discount_prices(uuid,uuid[],uuid[],timestamptz[]),go_booking_discounts_private.prices(uuid,uuid[],uuid[],timestamptz[]),
 public.go_booking_discounts(uuid,text,jsonb), public.go_booking_discount_quote(uuid,uuid[],uuid[],timestamptz),
 go_booking_discounts_private.manage(uuid,text,jsonb), go_booking_discounts_private.quote(uuid,uuid[],uuid[],timestamptz) to authenticated;
commit;
