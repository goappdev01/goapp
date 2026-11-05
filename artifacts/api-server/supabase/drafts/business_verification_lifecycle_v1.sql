-- Pending migration. Deployment requires explicit approval after isolated validation.
-- Requires committed business verification plus the deployed admin_memberships schema.
-- Reuses businesses.verified as the operational authority already checked by GO.
begin;
create temporary table go_business_verification_legacy_snapshot on commit drop as
select b.id,b.verified,r.status from public.businesses b
left join public.business_verification_requests r on r.business_id=b.id;
create schema if not exists go_business_verification_private;
revoke all on schema go_business_verification_private from public, anon, authenticated;

alter table public.business_verification_requests drop constraint business_verification_requests_status_check;
-- A provisional record may be incomplete. Submission still requires full data.
alter table public.business_verification_requests
  drop constraint business_verification_requests_legal_name_check,
  drop constraint business_verification_requests_tax_id_check,
  drop constraint business_verification_requests_address_check,
  add constraint business_verification_requests_legal_name_check check(length(legal_name)<=200),
  add constraint business_verification_requests_tax_id_check check(length(tax_id)<=32),
  add constraint business_verification_requests_address_check check(length(address)<=4000),
  add constraint business_verification_submission_complete check(status<>'pending' or
    (length(trim(legal_name))>=2 and length(trim(tax_id))>=3 and length(trim(address))>0));
alter table public.business_verification_requests
  add column activity text not null default '',
  add column revision integer not null default 0,
  add column requirements jsonb,
  add column requirements_version integer,
  add column submitted_at timestamptz,
  add constraint business_verification_requests_status_check
    check (status in ('draft','documents_pending','pending','correction','rejected','authorized','suspended','revoked'));

-- Honor explicit pre-existing approval only. Unverified businesses stay unverified.
-- Do not overwrite an ambiguous existing request with an approval.
insert into public.business_verification_requests(business_id,legal_name,tax_id,trading_name,address,status)
select b.id,left(b.name,200),'',left(b.name,200),coalesce(b.address,''),
  case when b.verified then 'authorized' else 'draft' end
from public.businesses b where not exists (
  select 1 from public.business_verification_requests r where r.business_id=b.id);
-- Contradictory legacy requests require review, never automatic approval.
update public.business_verification_requests r set status='correction',rejection_reason='Revisión del estado anterior necesaria'
from public.businesses b where b.id=r.business_id and b.verified and r.status<>'authorized';
update public.businesses b set verified=false,booking_enabled=false
from public.business_verification_requests r where r.business_id=b.id and r.status='correction' and b.verified;

create table public.business_verification_requirements (
  activity text primary key check (activity ~ '^[a-z0-9_-]{1,80}$'),
  version integer not null default 1,
  documents jsonb not null check (jsonb_typeof(documents)='array'),
  updated_at timestamptz not null default now()
);
create table public.business_verification_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  requirement_key text not null,
  object_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  status text not null default 'uploading' check (status in ('uploading','provided','accepted','rejected','superseded')),
  rejection_reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index business_verification_documents_business on public.business_verification_documents(business_id);
create table public.business_verification_audit (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete restrict,
  actor_id uuid references auth.users(id),
  operation text not null,
  from_status text,
  to_status text,
  reason text,
  request_id uuid not null,
  revision integer not null,
  database_actor text not null default current_user,
  created_at timestamptz not null default now(),
  unique(business_id,request_id),
  check(actor_id is not null or operation in ('legacy_authority_preserved','legacy_review_required','legacy_registration_pending'))
);
insert into public.business_verification_audit(business_id,actor_id,operation,from_status,to_status,reason,request_id,revision)
select s.id,null,case when r.status='authorized' then 'legacy_authority_preserved'
  when s.verified then 'legacy_review_required' else 'legacy_registration_pending' end,
  s.status,r.status,'Transición de registros anteriores. No constituye una nueva aprobación.',gen_random_uuid(),r.revision
from go_business_verification_legacy_snapshot s join public.business_verification_requests r on r.business_id=s.id;
create table go_business_verification_private.commands (
  actor_id uuid not null, request_id uuid not null, command jsonb not null,
  business_id uuid, result jsonb not null, primary key(actor_id,request_id)
);
revoke all on all tables in schema go_business_verification_private from public,anon,authenticated;

-- Only OWNER or a specifically delegated verifier. Existing technical grants stay unchanged.
alter table public.admin_memberships drop constraint admin_grants;
alter table public.admin_memberships add constraint admin_grants check (
  array_position(permissions,null) is null and
  ((level='owner' and permissions='{}'::text[]) or
   (level='technical' and permissions @> array['admin.access']::text[] and
    permissions <@ array['admin.access','development','diagnostics','maintenance','businesses.verify']::text[])));

create or replace function go_admin_private.set_membership(p_user_id uuid, p_permissions text[], p_active boolean, p_reason text)
returns public.admin_memberships
language plpgsql security definer set search_path = '' as $$
declare result public.admin_memberships;
begin
  -- Shared lock with bootstrap and other writes closes the owner-check/write race.
  perform pg_catalog.pg_advisory_xact_lock(714082601);
  if not exists (select 1 from public.admin_memberships where user_id = auth.uid() and level = 'owner' and active) then
    raise exception 'Owner required' using errcode = '42501';
  end if;
  if exists (select 1 from public.admin_memberships where user_id = p_user_id and level = 'owner') then
    raise exception 'Owner cannot be modified by this operation' using errcode = '42501';
  end if;
  if p_user_id is null or p_active is null or p_permissions is null
    or array_position(p_permissions, null) is not null
    or not p_permissions @> array['admin.access']::text[]
    or not p_permissions <@ array['admin.access','development','diagnostics','maintenance','businesses.verify']::text[] then
    raise exception 'Invalid technical permissions' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null) then
    raise exception 'Verified identity required' using errcode = '22023';
  end if;
  if not p_active and not exists (select 1 from public.admin_memberships where user_id = p_user_id) then
    raise exception 'Membership does not exist' using errcode = '22023';
  end if;
  perform pg_catalog.set_config('go.admin_change_reason', p_reason, true);
  insert into public.admin_memberships(user_id, level, permissions, active)
    values (p_user_id, 'technical', p_permissions, p_active)
  on conflict (user_id) do update set permissions = excluded.permissions, active = excluded.active, updated_at = now()
  returning * into result;
  return result;
end;
$$;

create function public.go_can_verify_businesses() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.admin_memberships where user_id=auth.uid() and active
    and (level='owner' or (level='technical' and permissions @> array['admin.access','businesses.verify']::text[])));
$$;
create function public.go_business_operational(p_business_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.businesses b where b.id=p_business_id and b.owner_id=auth.uid() and b.verified
    and exists(select 1 from public.business_verification_requests r where r.business_id=b.id and r.status='authorized'));
$$;
create function public.go_business_dossier_access(p_business_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (public.go_can_verify_businesses()
    or exists(select 1 from public.businesses where id=p_business_id and owner_id=auth.uid()));
$$;

alter table public.business_verification_requirements enable row level security;
alter table public.business_verification_documents enable row level security;
alter table public.business_verification_audit enable row level security;
revoke all on public.business_verification_requirements,public.business_verification_documents,public.business_verification_audit from public,anon,authenticated;
revoke all on sequence public.business_verification_audit_id_seq from public,anon,authenticated;
grant select on public.business_verification_requirements,public.business_verification_documents,public.business_verification_audit to authenticated;
create policy requirements_read on public.business_verification_requirements for select to authenticated using (true);
create policy dossier_documents_read on public.business_verification_documents for select to authenticated using(public.go_business_dossier_access(business_id));
create policy dossier_audit_read on public.business_verification_audit for select to authenticated using(public.go_business_dossier_access(business_id));
create policy verification_verifier_read on public.business_verification_requests for select to authenticated using(public.go_can_verify_businesses());

create function go_business_verification_private.dossier(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select to_jsonb(r) || jsonb_build_object('name',b.name,'verified',b.verified,
    'documents',coalesce((select jsonb_agg(to_jsonb(d)-'object_path' order by d.created_at) from public.business_verification_documents d where d.business_id=b.id),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(a) order by a.id desc) from public.business_verification_audit a where a.business_id=b.id),'[]'::jsonb))
  from public.business_verification_requests r join public.businesses b on b.id=r.business_id where b.id=p_id;
$$;
revoke all on function go_business_verification_private.dossier(uuid) from public,anon,authenticated;

-- A single transactional command boundary handles revisions, retries and audit.
create function public.go_business_verification(p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); operation text:=p_command->>'operation';
  command_id uuid:=(p_command->>'requestId')::uuid;
  target uuid:=(p_command->>'businessId')::uuid;
  data jsonb:=p_command->'data'; prior go_business_verification_private.commands;
  company public.businesses; dossier public.business_verification_requests;
  document public.business_verification_documents; policy public.business_verification_requirements;
  state text; result jsonb; reason text:=nullif(trim(p_command->>'reason'),'');
  required_document jsonb; document_id uuid; filename text; mime text; bytes integer;
  created boolean:=false;
begin
  if actor is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if operation is null or command_id is null or length(p_command::text)>100000 then
    raise exception using errcode='22023',message='INVALID_COMMAND'; end if;
  -- Same lock used by membership revocation prevents a verifier revocation race.
  if operation in ('decide','review_document','requirements') then
    perform pg_advisory_xact_lock(714082601);
    if not public.go_can_verify_businesses() then raise exception using errcode='42501',message='VERIFIER_REQUIRED'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||command_id::text,51105));
  select * into prior from go_business_verification_private.commands c where c.actor_id=actor and c.request_id=command_id;
  if found then
    if prior.command<>p_command then raise exception using errcode='PT409',message='REQUEST_ID_REUSED'; end if;
    if prior.business_id is not null and not public.go_business_dossier_access(prior.business_id) then
      raise exception using errcode='42501',message='BUSINESS_ACCESS_DENIED'; end if;
    if prior.business_id is not null then
      return prior.result || jsonb_build_object('dossier',go_business_verification_private.dossier(prior.business_id));
    end if;
    return prior.result;
  end if;
  if operation='requirements' then
    if data->>'activity' !~ '^[a-z0-9_-]{1,80}$' or data->>'activity' is null
      or jsonb_typeof(data->'documents') is distinct from 'array' or jsonb_array_length(data->'documents')>30 then
      raise exception using errcode='22023',message='INVALID_REQUIREMENTS'; end if;
    for required_document in select * from jsonb_array_elements(data->'documents') loop
      if required_document->>'key' is null or required_document->>'key' !~ '^[a-z0-9_-]{1,60}$'
        or length(coalesce(required_document->>'label','')) not between 1 and 180
        or jsonb_typeof(required_document->'required') is distinct from 'boolean' then
        raise exception using errcode='22023',message='INVALID_REQUIREMENT'; end if;
    end loop;
    if (select count(*) from jsonb_array_elements(data->'documents')) <>
      (select count(distinct x->>'key') from jsonb_array_elements(data->'documents') x) then
      raise exception using errcode='22023',message='DUPLICATE_REQUIREMENT'; end if;
    perform pg_advisory_xact_lock(hashtextextended('requirements:'||(data->>'activity'),51105));
    select * into policy from public.business_verification_requirements where activity=data->>'activity' for update;
    if coalesce(policy.version,0) is distinct from (data->>'expectedVersion')::integer then
      raise exception using errcode='PT409',message='REQUIREMENTS_CHANGED'; end if;
    insert into public.business_verification_requirements(activity,documents) values(data->>'activity',data->'documents')
    on conflict(activity) do update set documents=excluded.documents,version=public.business_verification_requirements.version+1,updated_at=now()
    returning to_jsonb(public.business_verification_requirements.*) into result;
  else
    if operation='draft' and target is null then
      insert into public.businesses(owner_id,name,verified,booking_enabled)
        values(actor,coalesce(nullif(trim(data->>'trading_name'),''),nullif(trim(data->>'legal_name'),''),'Nuevo negocio'),false,false)
        returning * into company;
      target:=company.id;
      created:=true;
      insert into public.business_verification_requests(business_id,legal_name,tax_id,trading_name,address,status)
        values(target,'','','','','draft') on conflict(business_id) do nothing;
    end if;
    if target is null then raise exception using errcode='22023',message='BUSINESS_REQUIRED'; end if;
    perform pg_advisory_xact_lock(hashtextextended('go-booking:'||target::text,0));
    select * into company from public.businesses where id=target for update;
    select * into dossier from public.business_verification_requests where business_id=target for update;
    if company.id is null or dossier.business_id is null or not public.go_business_dossier_access(target)
      or (operation not in ('decide','review_document') and company.owner_id<>actor) then
      raise exception using errcode='42501',message='BUSINESS_ACCESS_DENIED'; end if;
    if (p_command->>'expectedRevision')::integer is distinct from dossier.revision and not created then
      raise exception using errcode='PT409',message='DOSSIER_CHANGED'; end if;
    state:=dossier.status;
    if operation='draft' then
      if state not in ('draft','documents_pending','correction','rejected') then raise exception using errcode='42501',message='DOSSIER_LOCKED'; end if;
      if jsonb_typeof(data) is distinct from 'object' or length(coalesce(data->>'legal_name',''))>200
        or length(coalesce(data->>'tax_id',''))>32 or length(coalesce(data->>'address',''))>4000
        or length(coalesce(data->>'trading_name',''))>200 or coalesce(data->>'activity','') !~ '^[a-z0-9_-]{0,80}$' then
        raise exception using errcode='22023',message='INVALID_ENROLLMENT'; end if;
      update public.business_verification_requests set
        legal_name=coalesce(trim(data->>'legal_name'),''),tax_id=coalesce(trim(data->>'tax_id'),''),
        trading_name=coalesce(trim(data->>'trading_name'),''),address=coalesce(trim(data->>'address'),''),activity=coalesce(data->>'activity','')
        where business_id=target;
      update public.businesses set name=coalesce(nullif(trim(data->>'trading_name'),''),nullif(trim(data->>'legal_name'),''),'Nuevo negocio') where id=target;
      state:=case when state in ('correction','rejected') then state
        when length(trim(coalesce(data->>'legal_name','')))>=2 and length(trim(coalesce(data->>'tax_id','')))>=3
          and length(trim(coalesce(data->>'address','')))>0 and coalesce(data->>'activity','')<>'' then 'documents_pending' else 'draft' end;
    elsif operation='reserve_document' then
      if state not in ('draft','documents_pending','correction','rejected') then raise exception using errcode='42501',message='DOSSIER_LOCKED'; end if;
      select * into policy from public.business_verification_requirements where activity=dossier.activity;
      if not exists(select 1 from jsonb_array_elements(coalesce(policy.documents,'[]')) x where x->>'key'=data->>'requirementKey') then
        raise exception using errcode='22023',message='DOCUMENT_NOT_REQUESTED'; end if;
      filename:=data->>'fileName'; mime:=data->>'mimeType'; bytes:=(data->>'byteSize')::integer;
      if filename is null or length(filename) not between 1 and 180 or filename ~ '[/\\\x00-\x1f]'
        or mime is null or mime not in ('application/pdf','image/jpeg','image/png') or bytes is null or bytes not between 1 and 10485760 then
        raise exception using errcode='22023',message='INVALID_FILE'; end if;
      document_id:=gen_random_uuid();
      insert into public.business_verification_documents(id,business_id,requirement_key,object_path,file_name,mime_type,byte_size,created_by)
      values(document_id,target,data->>'requirementKey',target::text||'/'||document_id::text,filename,mime,bytes,actor);
      result:=jsonb_build_object('documentId',document_id,'businessId',target);
    elsif operation='complete_document' then
      if state not in ('draft','documents_pending','correction','rejected') then raise exception using errcode='42501',message='DOSSIER_LOCKED'; end if;
      select * into document from public.business_verification_documents where id=(data->>'documentId')::uuid and business_id=target for update;
      if document.id is null or document.status<>'uploading' or not exists(select 1 from storage.objects o
        where o.bucket_id='business-verification' and o.name=document.object_path
          and (o.metadata->>'size')::bigint=document.byte_size and o.metadata->>'mimetype'=document.mime_type) then
        raise exception using errcode='22023',message='UPLOAD_NOT_CONFIRMED'; end if;
      update public.business_verification_documents set status='superseded' where business_id=target
        and requirement_key=document.requirement_key and status in ('provided','accepted');
      update public.business_verification_documents set status='provided' where id=document.id;
    elsif operation='submit' then
      if state not in ('draft','documents_pending','correction','rejected') then raise exception using errcode='42501',message='DOSSIER_LOCKED'; end if;
      if length(trim(dossier.legal_name))<2 or length(trim(dossier.tax_id))<3 or length(trim(dossier.address))=0 then
        raise exception using errcode='22023',message='ENROLLMENT_INCOMPLETE'; end if;
      select * into policy from public.business_verification_requirements where activity=dossier.activity for share;
      if policy.activity is null then raise exception using errcode='PT409',message='REQUIREMENTS_NOT_CONFIGURED'; end if;
      for required_document in select * from jsonb_array_elements(policy.documents) loop
        if (required_document->>'required')::boolean and not exists(select 1 from public.business_verification_documents d
          where d.business_id=target and d.requirement_key=required_document->>'key' and d.status in ('provided','accepted')) then
          raise exception using errcode='22023',message='DOCUMENTS_INCOMPLETE'; end if;
      end loop;
      update public.business_verification_requests set requirements=policy.documents,requirements_version=policy.version,submitted_at=now(),rejection_reason=null where business_id=target;
      state:='pending';
    elsif operation='review_document' then
      if state<>'pending' or length(coalesce(reason,'')) not between 1 and 1000 or data->>'status' not in ('accepted','rejected') then
        raise exception using errcode='22023',message='INVALID_DOCUMENT_REVIEW'; end if;
      update public.business_verification_documents set status=data->>'status',rejection_reason=case when data->>'status'='rejected' then reason end
        where id=(data->>'documentId')::uuid and business_id=target and status in ('provided','accepted','rejected');
      if not found then raise exception using errcode='22023',message='DOCUMENT_NOT_REVIEWABLE'; end if;
    elsif operation='decide' then
      if length(coalesce(reason,'')) not between 1 and 1000 or p_command->>'status' is null or not (
        (state='pending' and p_command->>'status' in ('correction','rejected','authorized')) or
        (state='authorized' and p_command->>'status' in ('suspended','revoked')) or
        (state='suspended' and p_command->>'status' in ('authorized','revoked','correction')) or
        (state='revoked' and p_command->>'status'='correction')) then
        raise exception using errcode='22023',message='INVALID_DECISION'; end if;
      if p_command->>'status'='authorized' and state='pending' then
        if dossier.requirements is null or exists(select 1 from jsonb_array_elements(dossier.requirements) x where
          (x->>'required')::boolean and not exists(select 1 from public.business_verification_documents d where d.business_id=target
            and d.requirement_key=x->>'key' and d.status='accepted')) then
          raise exception using errcode='22023',message='DOCUMENT_REVIEW_INCOMPLETE'; end if;
      end if;
      state:=p_command->>'status';
      update public.businesses set verified=state='authorized',booking_enabled=false where id=target;
      update public.business_verification_requests set rejection_reason=case when state<>'authorized' then reason end where business_id=target;
    else raise exception using errcode='22023',message='UNKNOWN_OPERATION';
    end if;
    update public.business_verification_requests set status=state,revision=revision+1,updated_at=now() where business_id=target;
    insert into public.business_verification_audit(business_id,actor_id,operation,from_status,to_status,reason,request_id,revision)
      values(target,actor,operation,dossier.status,state,reason,command_id,dossier.revision+1);
    result:=coalesce(result,'{}')||jsonb_build_object('dossier',go_business_verification_private.dossier(target));
  end if;
  insert into go_business_verification_private.commands values(actor,command_id,p_command,target,result);
  return result;
end;
$$;

create function public.go_business_dossiers(p_business_id uuid default null,p_admin boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or (p_admin and not public.go_can_verify_businesses()) then raise exception using errcode='42501',message='ACCESS_DENIED'; end if;
  if p_business_id is not null and not public.go_business_dossier_access(p_business_id) then raise exception using errcode='42501',message='ACCESS_DENIED'; end if;
  return coalesce((select jsonb_agg(go_business_verification_private.dossier(b.id) order by b.created_at,b.id)
    from public.businesses b where (p_admin or b.owner_id=auth.uid()) and (p_business_id is null or b.id=p_business_id)),'[]');
end;
$$;

-- The existing operational APIs and reservation RPCs already require verified.
-- Keep that server-owned authority in step with every administrative decision.
create function go_business_verification_private.guard_business() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op='DELETE' then raise exception using errcode='42501',message='BUSINESS_HISTORY_PROTECTED'; end if;
    if tg_op='UPDATE' and (new.owner_id<>old.owner_id or new.verified<>old.verified or not public.go_business_operational(old.id)) then
      raise exception using errcode='42501',message='BUSINESS_AUTHORIZATION_REQUIRED'; end if;
    if tg_op='INSERT' and (new.verified or new.booking_enabled or new.owner_id<>auth.uid()) then
      raise exception using errcode='42501',message='BUSINESS_AUTHORIZATION_REQUIRED'; end if;
  end if;
  return new;
end;
$$;
create trigger go_business_authorization_guard before insert or update or delete on public.businesses
for each row execute function go_business_verification_private.guard_business();
create function go_business_verification_private.start_dossier() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.business_verification_requests(business_id,legal_name,tax_id,trading_name,address,status)
  values(new.id,left(new.name,200),'',left(new.name,200),coalesce(new.address,''),'draft');
  return new;
end;
$$;
create trigger go_business_start_dossier after insert on public.businesses
for each row execute function go_business_verification_private.start_dossier();

-- Recheck after the shared business lock, including writes issued directly to
-- PostgREST. An authorization decision cannot race an already-started write.
create function go_business_verification_private.guard_operation() returns trigger
language plpgsql security invoker set search_path='' as $$
declare business uuid; customer uuid;
begin
  if current_user='authenticated' then
    business:=case when tg_op='DELETE' then old.business_id else new.business_id end;
    perform pg_advisory_xact_lock(hashtextextended('go-booking:'||business::text,0));
    if exists(select 1 from public.businesses where id=business and owner_id=auth.uid())
      and not public.go_business_operational(business) then
      -- Personal cancellation remains governed by the existing immutable-field guard.
      if tg_table_name='bookings' and tg_op='UPDATE' then
        customer:=old.customer_id;
        if customer=auth.uid() and new.status::text='CANCELLED' then return new; end if;
      end if;
      raise exception using errcode='42501',message='BUSINESS_AUTHORIZATION_REQUIRED';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger go_service_authorization before insert or update or delete on public.services for each row execute function go_business_verification_private.guard_operation();
create trigger go_staff_authorization before insert or update or delete on public.staff for each row execute function go_business_verification_private.guard_operation();
create trigger go_availability_authorization before insert or update or delete on public.availability for each row execute function go_business_verification_private.guard_operation();
create trigger go_settings_authorization before insert or update or delete on public.business_settings for each row execute function go_business_verification_private.guard_operation();
create trigger go_booking_authorization before insert or update or delete on public.bookings for each row execute function go_business_verification_private.guard_operation();

-- Retire the legacy implicit "last business" submission path. It cannot bypass documents.
create or replace function public.submit_business_verification(p_business_id uuid,p_legal_name text,p_tax_id text,p_trading_name text,p_address text) returns setof public.businesses
language plpgsql security definer set search_path='' as $$
begin raise exception using errcode='PT409',message='USE_BUSINESS_DOSSIER'; end;
$$;

-- Explicitly private. No public URLs, overwrite, move or delete privileges.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('business-verification','business-verification',false,10485760,array['application/pdf','image/jpeg','image/png']);
create function public.go_business_document_access(p_path text,p_upload boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
declare d public.business_verification_documents; r public.business_verification_requests;
begin
  select * into d from public.business_verification_documents where object_path=p_path;
  if d.id is null or not public.go_business_dossier_access(d.business_id) then return false; end if;
  if not p_upload then return d.status<>'uploading'; end if;
  perform pg_advisory_xact_lock(hashtextextended('go-booking:'||d.business_id::text,0));
  select * into r from public.business_verification_requests where business_id=d.business_id for update;
  select * into d from public.business_verification_documents where object_path=p_path;
  return d.created_by=auth.uid() and d.status='uploading' and r.status in ('draft','documents_pending','correction','rejected')
    and exists(select 1 from public.businesses b where b.id=d.business_id and b.owner_id=auth.uid());
end;
$$;
create policy go_verification_upload on storage.objects for insert to authenticated
  with check(bucket_id='business-verification' and public.go_business_document_access(name,true));
create policy go_verification_download on storage.objects for select to authenticated
  using(bucket_id='business-verification' and public.go_business_document_access(name,false));

create function public.go_business_document(p_id uuid,p_upload boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.business_verification_documents;
begin
  select * into d from public.business_verification_documents where id=p_id;
  if d.id is null or not public.go_business_document_access(d.object_path,p_upload) then
    raise exception using errcode='42501',message='DOCUMENT_ACCESS_DENIED'; end if;
  return to_jsonb(d);
end;
$$;
revoke all on all functions in schema go_business_verification_private from public,anon,authenticated;
revoke all on function public.go_can_verify_businesses(),public.go_business_operational(uuid),public.go_business_dossier_access(uuid),
  public.go_business_verification(jsonb),public.go_business_dossiers(uuid,boolean),public.go_business_document_access(text,boolean),public.go_business_document(uuid,boolean) from public,anon;
grant execute on function public.go_can_verify_businesses(),public.go_business_operational(uuid),public.go_business_dossier_access(uuid),
  public.go_business_verification(jsonb),public.go_business_dossiers(uuid,boolean),public.go_business_document_access(text,boolean),public.go_business_document(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
