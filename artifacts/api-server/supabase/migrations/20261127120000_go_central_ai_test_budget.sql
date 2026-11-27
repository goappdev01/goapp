-- Cumulative test envelope: no calendar reset, automatic refill or client write grants.
-- Activation and the server capability hash are configured only after provider ownership/balance review.
create schema go_ai_private;
revoke all on schema go_ai_private from public, anon, authenticated;
create table go_ai_private.test_budget (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  secret_hash bytea,
  limit_micro_usd bigint not null default 4000000 check(limit_micro_usd between 0 and 4000000),
  charged_micro_usd bigint not null default 0 check(charged_micro_usd >= 0),
  safety_micro_usd bigint not null default 100000 check(safety_micro_usd >= 100000),
  authorized_users uuid[] not null default '{}',
  authorized_businesses uuid[] not null default '{}'
);
insert into go_ai_private.test_budget(id) values(true);
create table go_ai_private.requests (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  reserved bigint not null check(reserved = 200000),
  charged bigint not null,
  actual bigint,
  input_tokens bigint,
  output_tokens bigint,
  calls integer,
  status text not null default 'reserved' check(status in ('reserved','settled','uncertain')),
  created_at timestamptz not null default now()
);
create table go_ai_private.proposals (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  request_id uuid not null references go_ai_private.requests(id),
  command jsonb not null check(octet_length(command::text) <= 24000),
  summary jsonb not null check(octet_length(summary::text) <= 4000),
  status text not null default 'prepared' check(status in ('prepared','invalidated','submitting','submitted')),
  booking_id uuid,
  booking_status text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);
alter table go_ai_private.test_budget enable row level security;
alter table go_ai_private.requests enable row level security;
alter table go_ai_private.proposals enable row level security;
revoke all on all tables in schema go_ai_private from public, anon, authenticated;

create function public.go_ai_test_control(p_secret text, p_operation text, p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b go_ai_private.test_budget; r go_ai_private.requests; p go_ai_private.proposals;
  caller uuid := auth.uid(); request_id uuid; charge bigint; current_status text;
begin
  select * into b from go_ai_private.test_budget where id for update;
  if caller is null or b.secret_hash is null or length(p_secret) < 64
    or pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8')) is distinct from b.secret_hash
    or not exists(select 1 from public.admin_memberships where user_id = caller and active = true)
    or not(caller = any(b.authorized_users)) then
    raise exception 'AI_ACCESS_DENIED' using errcode='42501';
  end if;
  if p_operation = 'status' then
    return jsonb_build_object('enabled',b.enabled,'limitMicroUsd',b.limit_micro_usd,
      'chargedMicroUsd',b.charged_micro_usd,'remainingMicroUsd',greatest(0,b.limit_micro_usd-b.charged_micro_usd-b.safety_micro_usd),
      'authorizedBusinesses',b.authorized_businesses,'model','gpt-5.4-mini');
  end if;
  if p_operation='current' then
    select * into p from go_ai_private.proposals where user_id=caller
      and (status='submitting' or status='prepared' and expires_at>now()) order by created_at desc limit 1;
    if p.id is null then return 'null'::jsonb;end if;
    return jsonb_build_object('id',p.id,'summary',p.summary,'state',p.status);
  end if;
  if p_operation = 'reserve' then
    if not b.enabled then raise exception 'AI_TEST_DISABLED' using errcode='42501';end if;
    request_id := (p_payload->>'id')::uuid;
    if exists(select 1 from go_ai_private.requests where id=request_id) then
      raise exception 'AI_REQUEST_EXISTS' using errcode='23505';end if;
    if exists(select 1 from go_ai_private.requests where user_id=caller and status='reserved')
      or exists(select 1 from go_ai_private.proposals where user_id=caller and status='submitting') then
      raise exception 'AI_CONCURRENT_REQUEST' using errcode='40001';end if;
    if (select count(*) from go_ai_private.requests where status='reserved') >= 2 then
      raise exception 'AI_CONCURRENT_REQUEST' using errcode='40001';end if;
    if (p_payload->>'maximum')::bigint is distinct from 200000
      or b.charged_micro_usd+200000+b.safety_micro_usd > b.limit_micro_usd then
      raise exception 'AI_BUDGET_EXHAUSTED' using errcode='42501';end if;
    update go_ai_private.proposals set status='invalidated' where user_id=caller and status='prepared';
    insert into go_ai_private.requests(id,user_id,reserved,charged) values(request_id,caller,200000,200000);
    update go_ai_private.test_budget set charged_micro_usd=charged_micro_usd+200000 where id;
    return jsonb_build_object('reservedMicroUsd',200000);
  end if;
  if p_operation = 'settle' then
    select * into r from go_ai_private.requests where id=(p_payload->>'id')::uuid and user_id=caller for update;
    if r.id is null then raise exception 'AI_ACCESS_DENIED' using errcode='42501';end if;
    if r.status='reserved' then
      charge := (p_payload->>'cost')::bigint;
      if coalesce((p_payload->>'certain')::boolean,false) and charge >= 0 and charge <= r.reserved
        and (p_payload->>'input')::bigint >= 0 and (p_payload->>'output')::bigint >= 0
        and (p_payload->>'calls')::integer between 0 and 4
        and ((p_payload->>'calls')::integer > 0 or charge=0 and (p_payload->>'input')::bigint=0 and (p_payload->>'output')::bigint=0) then
        update go_ai_private.requests set charged=charge,actual=charge,input_tokens=(p_payload->>'input')::bigint,
          output_tokens=(p_payload->>'output')::bigint,calls=(p_payload->>'calls')::integer,status='settled' where id=r.id;
        update go_ai_private.test_budget set charged_micro_usd=charged_micro_usd-r.reserved+charge where id;
      else
        update go_ai_private.requests set status='uncertain' where id=r.id;
        -- Keep the complete reservation after timeout, process death or unknown usage.
      end if;
    end if;
    select * into b from go_ai_private.test_budget where id;
    return jsonb_build_object('chargedMicroUsd',b.charged_micro_usd,
      'remainingMicroUsd',greatest(0,b.limit_micro_usd-b.charged_micro_usd-b.safety_micro_usd));
  end if;
  if p_operation = 'prepare' then
    if not b.enabled or not exists(select 1 from go_ai_private.requests where id=(p_payload->>'requestId')::uuid
      and user_id=caller and status='reserved') then raise exception 'AI_ACCESS_DENIED' using errcode='42501';end if;
    if not((p_payload->'command'->>'business_id')::uuid = any(b.authorized_businesses)) then
      raise exception 'AI_ACCESS_DENIED' using errcode='42501';end if;
    update go_ai_private.proposals set status='invalidated' where user_id=caller and status='prepared';
    insert into go_ai_private.proposals(id,user_id,request_id,command,summary)
      values((p_payload->>'id')::uuid,caller,(p_payload->>'requestId')::uuid,p_payload->'command',p_payload->'summary') returning * into p;
    return jsonb_build_object('id',p.id,'summary',p.summary,'status',p.status);
  end if;
  if p_operation='invalidate' then
    if exists(select 1 from go_ai_private.proposals where user_id=caller and status='submitting') then
      raise exception 'AI_CONCURRENT_REQUEST' using errcode='40001';end if;
    update go_ai_private.proposals set status='invalidated' where user_id=caller and status='prepared';
    return '{}'::jsonb;
  end if;
  select * into p from go_ai_private.proposals where id=(p_payload->>'id')::uuid and user_id=caller for update;
  if p.id is null then raise exception 'AI_ACCESS_DENIED' using errcode='42501';end if;
  if p_operation='claim' then
    if not b.enabled or p.status='invalidated' or p.status='prepared' and p.expires_at <= now() then
      raise exception 'AI_PROPOSAL_STALE' using errcode='40001';end if;
    if p.status='prepared' then
      update go_ai_private.proposals set status='submitting' where id=p.id;
    end if;
    -- Retrying an uncertain submission always reuses the same immutable GO request_key.
    return jsonb_build_object('id',p.id,'command',p.command,'status',p.status,'bookingId',p.booking_id,'bookingStatus',p.booking_status);
  end if;
  if p_operation='submitted' and p.status in ('submitting','submitted') then
    update go_ai_private.proposals set status='submitted',booking_id=(p_payload->>'bookingId')::uuid,
      booking_status=p_payload->>'bookingStatus' where id=p.id and status='submitting';
    return jsonb_build_object('id',p.id,'status','submitted');
  end if;
  if p_operation='rejected' and p.status='submitting' then
    update go_ai_private.proposals set status='invalidated' where id=p.id;
    return '{}'::jsonb;
  end if;
  raise exception 'AI_OPERATION_INVALID' using errcode='22023';
end; $$;
revoke all on function public.go_ai_test_control(text,text,jsonb) from public,anon;
grant execute on function public.go_ai_test_control(text,text,jsonb) to authenticated;
