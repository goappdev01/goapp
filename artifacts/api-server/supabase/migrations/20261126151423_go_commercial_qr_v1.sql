-- Prepared additive contract. Production activation and authenticated
-- end-to-end verification are tracked in GO_COMMERCIAL_QR_CHECKPOINT.md.
-- The immutable businesses.id is the automatic commercial identifier.

create schema if not exists go_commercial_private;
revoke all on schema go_commercial_private from public, anon, authenticated;

create sequence go_commercial_private.inventory_sequence;

create table go_commercial_private.qr_batches (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  quantity integer not null check (quantity between 1 and 1000),
  request_id uuid not null,
  unique (created_by,request_id)
);
create table go_commercial_private.supplier_settings (
  id boolean primary key default true check (id),
  url text not null,
  enabled boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into go_commercial_private.supplier_settings(id,url,enabled) values
  (true,'https://www.abarnom.com/portacartel-de-sobremesa-metacrilato-doble-posicion-a6-verticalhorizontal',true);
create table go_commercial_private.physical_qr (
  code text primary key default replace(pg_catalog.gen_random_uuid()::text,'-','') || replace(pg_catalog.gen_random_uuid()::text,'-',''),
  inventory_id text not null unique default 'GO-' || lpad(nextval('go_commercial_private.inventory_sequence')::text,8,'0'),
  batch_id uuid not null references go_commercial_private.qr_batches(id),
  state text not null default 'unassigned' check (state in ('unassigned','authorized','assigned','revoked')),
  authorized_business_id uuid references public.businesses(id),
  business_id uuid references public.businesses(id),
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  check (state <> 'assigned' or business_id is not null)
);
create index physical_qr_business_idx on go_commercial_private.physical_qr(business_id) where state='assigned';
create table go_commercial_private.qr_audit (
  id bigint generated always as identity primary key,
  code text not null references go_commercial_private.physical_qr(code),
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('authorize','assign','revoke')),
  old_business_id uuid,
  new_business_id uuid,
  reason text,
  occurred_at timestamptz not null default now()
);
create table go_commercial_private.visits (
  token text primary key default replace(pg_catalog.gen_random_uuid()::text,'-','') || replace(pg_catalog.gen_random_uuid()::text,'-',''),
  source text not null check (source in ('business','direct','general')),
  capturing_business_id uuid references public.businesses(id),
  issued_at timestamptz not null default now(),
  claimed_user_id uuid unique references auth.users(id),
  check ((source='business')=(capturing_business_id is not null))
);
create index visits_issued_idx on go_commercial_private.visits(issued_at);
create index visits_source_window_idx on go_commercial_private.visits(source,capturing_business_id,issued_at);
create table go_commercial_private.acquisitions (
  user_id uuid primary key references auth.users(id),
  source text not null check (source in ('business','direct','general')),
  capturing_business_id uuid references public.businesses(id),
  visit_token text not null unique references go_commercial_private.visits(token),
  recorded_at timestamptz not null default now(),
  check ((source='business')=(capturing_business_id is not null))
);
create table go_commercial_private.booking_attribution (
  booking_id uuid primary key references public.bookings(id),
  customer_id uuid not null references auth.users(id),
  acquisition_source text not null check (acquisition_source in ('business','direct','general','unknown')),
  capturing_business_id uuid references public.businesses(id),
  beneficiary_business_id uuid not null references public.businesses(id),
  eligible boolean,
  reason text not null,
  booking_status text not null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((acquisition_source='unknown')=(eligible is null))
);
create index booking_attribution_beneficiary_idx on go_commercial_private.booking_attribution(beneficiary_business_id,recorded_at);

alter table go_commercial_private.qr_batches enable row level security;
alter table go_commercial_private.supplier_settings enable row level security;
alter table go_commercial_private.physical_qr enable row level security;
alter table go_commercial_private.qr_audit enable row level security;
alter table go_commercial_private.visits enable row level security;
alter table go_commercial_private.acquisitions enable row level security;
alter table go_commercial_private.booking_attribution enable row level security;
revoke all on all tables in schema go_commercial_private from public, anon, authenticated;
revoke all on all sequences in schema go_commercial_private from public, anon, authenticated;

create function go_commercial_private.require_owner() returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not exists(select 1 from public.admin_memberships m
    where m.user_id=actor and m.active and m.level='owner') then
    raise exception using errcode='42501',message='GO_QR_ADMIN_REQUIRED';
  end if;
  return actor;
end; $$;

create function public.go_commercial_create_batch(p_quantity integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; batch uuid; rows jsonb; inserted boolean:=false; recorded_quantity integer;
begin
  actor:=go_commercial_private.require_owner();
  if p_quantity is null or p_quantity not between 1 and 1000 or p_request_id is null then
    raise exception using errcode='22023',message='GO_QR_INVALID_QUANTITY';end if;
  insert into go_commercial_private.qr_batches(created_by,quantity,request_id)
    values(actor,p_quantity,p_request_id) on conflict (created_by,request_id) do nothing returning id into batch;
  if batch is null then
    select id,quantity into batch,recorded_quantity from go_commercial_private.qr_batches
      where created_by=actor and request_id=p_request_id;
    if recorded_quantity is distinct from p_quantity then
      raise exception using errcode='PT409',message='GO_QR_REQUEST_CHANGED';end if;
  else
    inserted:=true;
  end if;
  if inserted then
    insert into go_commercial_private.physical_qr(batch_id)
      select batch from pg_catalog.generate_series(1,p_quantity);
  end if;
  select jsonb_agg(jsonb_build_object('code',code,'inventoryId',inventory_id) order by inventory_id)
    into rows from go_commercial_private.physical_qr where batch_id=batch;
  return jsonb_build_object('batchId',batch,'quantity',p_quantity,'codes',rows);
end; $$;

create function public.go_commercial_get_batch(p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare batch record; rows jsonb;
begin
  perform go_commercial_private.require_owner();
  select * into batch from go_commercial_private.qr_batches where id=p_batch_id;
  if not found then raise exception using errcode='PT404',message='GO_QR_BATCH_NOT_FOUND';end if;
  select jsonb_agg(jsonb_build_object('code',code,'inventoryId',inventory_id,'state',state,'businessId',business_id) order by inventory_id)
    into rows from go_commercial_private.physical_qr where batch_id=p_batch_id;
  return jsonb_build_object('batchId',batch.id,'quantity',batch.quantity,'createdAt',batch.created_at,'codes',rows);
end; $$;

create function public.go_commercial_supplier() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('url',case when enabled then url else null end)
  from go_commercial_private.supplier_settings where id=true
$$;

create function public.go_commercial_admin_supplier() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform go_commercial_private.require_owner();
  select jsonb_build_object('url',url,'enabled',enabled) into result
    from go_commercial_private.supplier_settings where id=true;
  return result;
end; $$;

create function public.go_commercial_set_supplier(p_url text,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  actor:=go_commercial_private.require_owner();
  if p_url is null or length(p_url)>2048 or p_url !~ '^https://[A-Za-z0-9.-]+/[^[:space:]<>]*$'
    or p_url ~ '@' or p_enabled is null then
    raise exception using errcode='22023',message='GO_QR_SUPPLIER_INVALID';end if;
  update go_commercial_private.supplier_settings
    set url=p_url,enabled=p_enabled,updated_by=actor,updated_at=now() where id=true;
  return jsonb_build_object('url',case when p_enabled then p_url else null end,'enabled',p_enabled);
end; $$;

create function public.go_commercial_authorize(p_code text,p_business_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; item record;
begin
  actor:=go_commercial_private.require_owner();
  if p_reason is null or length(btrim(p_reason)) not between 3 and 500 or not exists
    (select 1 from public.businesses where id=p_business_id) then
    raise exception using errcode='22023',message='GO_QR_INVALID_ASSIGNMENT';end if;
  select * into item from go_commercial_private.physical_qr where code=p_code or inventory_id=upper(p_code) for update;
  if not found then raise exception using errcode='PT404',message='GO_QR_NOT_FOUND';end if;
  if item.state not in ('unassigned','revoked') then
    raise exception using errcode='PT409',message='GO_QR_ALREADY_RESERVED';end if;
  update go_commercial_private.physical_qr set state='authorized',business_id=null,
    authorized_business_id=p_business_id,assigned_at=null where code=item.code;
  insert into go_commercial_private.qr_audit(code,actor_id,action,old_business_id,new_business_id,reason)
    values(item.code,actor,'authorize',item.business_id,p_business_id,btrim(p_reason));
  return jsonb_build_object('inventoryId',item.inventory_id,'state','authorized','businessId',p_business_id);
end; $$;

create function public.go_commercial_assign(p_code text,p_business_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item record;
begin
  if actor is null or not exists(select 1 from public.businesses b
    where b.id=p_business_id and b.owner_id=actor) then
    raise exception using errcode='42501',message='GO_QR_OWNER_REQUIRED';end if;
  select * into item from go_commercial_private.physical_qr where code=p_code or inventory_id=upper(p_code) for update;
  if not found then raise exception using errcode='PT404',message='GO_QR_NOT_FOUND';end if;
  if item.state='assigned' and item.business_id=p_business_id then
    return jsonb_build_object('inventoryId',item.inventory_id,'state','assigned','businessId',p_business_id);end if;
  if item.state<>'authorized' or item.authorized_business_id is distinct from p_business_id then
    raise exception using errcode='PT409',message='GO_QR_NOT_AUTHORIZED';end if;
  update go_commercial_private.physical_qr set state='assigned',business_id=p_business_id,
    assigned_at=now() where code=item.code;
  insert into go_commercial_private.qr_audit(code,actor_id,action,old_business_id,new_business_id)
    values(item.code,actor,'assign',item.business_id,p_business_id);
  return jsonb_build_object('inventoryId',item.inventory_id,'state','assigned','businessId',p_business_id);
end; $$;

create function public.go_commercial_preview_assignment(p_code text,p_business_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item record;
begin
  if actor is null or not exists(select 1 from public.businesses b
    where b.id=p_business_id and b.owner_id=actor) then
    raise exception using errcode='42501',message='GO_QR_OWNER_REQUIRED';end if;
  select inventory_id,state,authorized_business_id,business_id into item
    from go_commercial_private.physical_qr where code=p_code or inventory_id=upper(p_code);
  if not found then raise exception using errcode='PT404',message='GO_QR_NOT_FOUND';end if;
  return jsonb_build_object('inventoryId',item.inventory_id,'state',item.state,
    'canAssign',item.state='authorized' and item.authorized_business_id=p_business_id,
    'assignedHere',item.state='assigned' and item.business_id=p_business_id);
end; $$;

create function public.go_commercial_revoke(p_code text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; item record;
begin
  actor:=go_commercial_private.require_owner();
  if p_reason is null or length(btrim(p_reason)) not between 3 and 500 then
    raise exception using errcode='22023',message='GO_QR_REASON_REQUIRED';end if;
  select * into item from go_commercial_private.physical_qr where code=p_code or inventory_id=upper(p_code) for update;
  if not found then raise exception using errcode='PT404',message='GO_QR_NOT_FOUND';end if;
  if item.state='revoked' then
    return jsonb_build_object('inventoryId',item.inventory_id,'state','revoked');end if;
  update go_commercial_private.physical_qr set state='revoked',authorized_business_id=null where code=item.code;
  insert into go_commercial_private.qr_audit(code,actor_id,action,old_business_id,reason)
    values(item.code,actor,'revoke',item.business_id,btrim(p_reason));
  return jsonb_build_object('inventoryId',item.inventory_id,'state','revoked');
end; $$;

create function public.go_commercial_resolve(p_code text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target uuid; item record; business record;
begin
  if p_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target:=p_code::uuid;
  elsif p_code ~* '^[0-9a-f]{64}$' then
    select business_id,state into item from go_commercial_private.physical_qr where code=p_code;
    if not found then return jsonb_build_object('state','unavailable');end if;
    if item.state<>'assigned' then return jsonb_build_object('state',item.state);end if;
    target:=item.business_id;
  else return jsonb_build_object('state','unavailable');end if;
  select id,name,ui_metadata->>'category' as category into business
    from public.businesses where id=target and verified and booking_enabled;
  if not found then return jsonb_build_object('state','not_published');end if;
  return jsonb_build_object('state','published','businessId',business.id,
    'name',business.name,'category',business.category);
end; $$;

create function public.go_commercial_owned_poster(p_business_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); business record;
begin
  if actor is null then raise exception using errcode='42501',message='GO_QR_AUTH_REQUIRED';end if;
  select id,name,verified,booking_enabled into business from public.businesses
    where id=p_business_id and owner_id=actor;
  if not found then raise exception using errcode='42501',message='GO_QR_OWNER_REQUIRED';end if;
  return jsonb_build_object('businessId',business.id,'name',business.name,
    'published',business.verified and business.booking_enabled);
end; $$;

create function public.go_commercial_issue_visit(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare resolved jsonb; source_kind text; target uuid; visit_token text;
begin
  if p_code in ('direct','go') then source_kind:=case p_code when 'direct' then 'direct' else 'general' end;
  else
    resolved:=public.go_commercial_resolve(p_code);
    if resolved->>'state'<>'published' then
      raise exception using errcode='PT404',message='GO_QR_NOT_PUBLISHED';end if;
    source_kind:='business';target:=(resolved->>'businessId')::uuid;
  end if;
  -- A public scanner cannot create an unbounded number of records or costs.
  -- Serialize issuance while checking the cap, including concurrent requests.
  perform pg_catalog.pg_advisory_xact_lock(71611001);
  if (select count(*) from (select 1 from go_commercial_private.visits
      where issued_at>now()-interval '1 hour' limit 5001) recent) >= 5000
    or (select count(*) from (select 1 from go_commercial_private.visits
      where source=source_kind and capturing_business_id is not distinct from target
        and issued_at>now()-interval '10 minutes' limit 101) recent) >= 100 then
    raise exception using errcode='PT429',message='GO_QR_VISIT_LIMIT';
  end if;
  insert into go_commercial_private.visits(source,capturing_business_id)
    values(source_kind,target) returning token into visit_token;
  return jsonb_build_object('token',visit_token,'source',source_kind,'businessId',target);
end; $$;

create function public.go_commercial_claim_acquisition(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); visit record; created timestamptz; existing record;
begin
  if actor is null then raise exception using errcode='42501',message='GO_QR_AUTH_REQUIRED';end if;
  select * into existing from go_commercial_private.acquisitions where user_id=actor;
  if found then return jsonb_build_object('source',existing.source,'businessId',existing.capturing_business_id);end if;
  select * into visit from go_commercial_private.visits where token=p_token for update;
  if not found or visit.claimed_user_id is not null or visit.issued_at<now()-interval '24 hours' then
    raise exception using errcode='PT409',message='GO_QR_VISIT_INVALID';end if;
  select created_at into created from auth.users where id=actor;
  if created is null or created<visit.issued_at-interval '10 seconds' then
    raise exception using errcode='PT409',message='GO_QR_EXISTING_ACCOUNT';end if;
  insert into go_commercial_private.acquisitions(user_id,source,capturing_business_id,visit_token)
    values(actor,visit.source,visit.capturing_business_id,visit.token) on conflict (user_id) do nothing;
  select * into existing from go_commercial_private.acquisitions where user_id=actor;
  if existing.visit_token is distinct from visit.token then
    return jsonb_build_object('source',existing.source,'businessId',existing.capturing_business_id);end if;
  update go_commercial_private.visits set claimed_user_id=actor where token=visit.token;
  return jsonb_build_object('source',visit.source,'businessId',visit.capturing_business_id);
end; $$;

create function go_commercial_private.attribute_booking() returns trigger
language plpgsql security definer set search_path='' as $$
declare acquired record; source_kind text; eligible_flag boolean; reason_code text;
begin
  select source,capturing_business_id into acquired from go_commercial_private.acquisitions where user_id=new.customer_id;
  if not found then source_kind:='unknown';eligible_flag:=null;reason_code:='origin_unverified';
  elsif acquired.source='business' and acquired.capturing_business_id=new.business_id then
    source_kind:='business';eligible_flag:=false;reason_code:='captor_booking_exempt';
  else source_kind:=acquired.source;eligible_flag:=true;reason_code:='other_business_or_direct';end if;
  insert into go_commercial_private.booking_attribution
    (booking_id,customer_id,acquisition_source,capturing_business_id,beneficiary_business_id,eligible,reason,booking_status)
    values(new.id,new.customer_id,source_kind,acquired.capturing_business_id,new.business_id,eligible_flag,reason_code,new.status::text)
    on conflict (booking_id) do update set customer_id=excluded.customer_id,
      acquisition_source=excluded.acquisition_source,capturing_business_id=excluded.capturing_business_id,
      beneficiary_business_id=excluded.beneficiary_business_id,eligible=excluded.eligible,
      reason=excluded.reason,booking_status=excluded.booking_status,updated_at=now();
  return new;
end; $$;
create trigger zzz_commercial_booking_attribution after insert or update of status,business_id,customer_id on public.bookings
  for each row execute function go_commercial_private.attribute_booking();

revoke all on all functions in schema go_commercial_private from public, anon, authenticated;
revoke all on function public.go_commercial_create_batch(integer,uuid),public.go_commercial_get_batch(uuid),
  public.go_commercial_authorize(text,uuid,text),public.go_commercial_assign(text,uuid),
  public.go_commercial_preview_assignment(text,uuid),
  public.go_commercial_revoke(text,text),public.go_commercial_resolve(text),
  public.go_commercial_owned_poster(uuid),
  public.go_commercial_supplier(),public.go_commercial_admin_supplier(),public.go_commercial_set_supplier(text,boolean),
  public.go_commercial_issue_visit(text),public.go_commercial_claim_acquisition(text)
  from public, anon, authenticated;
grant execute on function public.go_commercial_resolve(text),public.go_commercial_issue_visit(text),
  public.go_commercial_supplier() to anon,authenticated;
grant execute on function public.go_commercial_create_batch(integer,uuid),public.go_commercial_get_batch(uuid),
  public.go_commercial_authorize(text,uuid,text),public.go_commercial_assign(text,uuid),
  public.go_commercial_preview_assignment(text,uuid),
  public.go_commercial_revoke(text,text),public.go_commercial_claim_acquisition(text),
  public.go_commercial_owned_poster(uuid),
  public.go_commercial_admin_supplier(),public.go_commercial_set_supplier(text,boolean) to authenticated;
