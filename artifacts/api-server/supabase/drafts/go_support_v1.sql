-- GO AYUDA. Additive schema; no existing account, business or booking is changed.
begin;
create schema go_support_private;
revoke all on schema go_support_private from public, anon, authenticated;

create table public.go_support_requests (
  id uuid primary key default gen_random_uuid(),
  ticket_no bigint generated always as identity unique,
  sender_id uuid not null references auth.users(id) on delete restrict,
  business_id uuid references public.businesses(id) on delete restrict,
  kind text not null check (kind in ('incident','improvement','help')),
  body text not null check (length(btrim(body)) between 1 and 4000),
  status text not null default 'received' check (status in ('received','in_review','pending','solved','rejected')),
  archived_at timestamptz,
  request_key uuid not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The 12-month clock starts on archive, never on submission.
  retention_until timestamptz,
  unique(sender_id, request_key)
);
create index go_support_requests_owner on public.go_support_requests(sender_id,created_at desc);
create index go_support_requests_queue on public.go_support_requests(archived_at,status,created_at desc);
create index go_support_requests_retention on public.go_support_requests(retention_until) where retention_until is not null;
create table public.go_support_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.go_support_requests(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (length(btrim(body)) between 1 and 4000),
  internal boolean not null default false,
  request_key uuid not null,
  created_at timestamptz not null default now(),
  unique(request_id,author_id,request_key)
);
create index go_support_messages_thread on public.go_support_messages(request_id,created_at,id);
create table public.go_support_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.go_support_requests(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  from_status text,
  to_status text,
  reason text,
  created_at timestamptz not null default now()
);
create index go_support_events_thread on public.go_support_events(request_id,id);
create table public.go_support_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.go_support_requests(id) on delete restrict,
  client_id text not null check (client_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  object_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 180),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/heic','image/heif','image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  status text not null default 'uploading' check (status in ('uploading','ready','removed')),
  created_at timestamptz not null default now(),
  unique(request_id,client_id)
);
create index go_support_files_thread on public.go_support_files(request_id,status);
-- Aggregate data remains after lawful expiry; it contains no sender, business, body or file identifier.
create table public.go_support_monthly_totals (
  month date not null, kind text not null, status text not null, request_count integer not null,
  primary key(month,kind,status)
);
create table go_support_private.commands (
  actor_id uuid not null,
  request_key uuid not null,
  payload jsonb not null,
  request_id uuid not null,
  primary key(actor_id,request_key)
);
-- A durable claim prevents reopening after private object deletion has begun.
create table go_support_private.retention_claims (
  request_id uuid primary key references public.go_support_requests(id) on delete restrict,
  started_at timestamptz not null default now()
);
alter table go_support_private.commands enable row level security;
alter table go_support_private.retention_claims enable row level security;
revoke all on all tables in schema go_support_private from public,anon,authenticated;

create function public.go_support_readiness() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  return jsonb_build_object('ready',true,'version',1,'retentionMonths',12);
end;
$$;

create function public.go_support_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.admin_memberships
    where user_id=auth.uid() and active and level='owner');
$$;
create function public.go_support_can_read(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (public.go_support_admin() or exists(
    select 1 from public.go_support_requests r where r.id=p_id and r.sender_id=auth.uid()
      and (r.business_id is null or exists(select 1 from public.businesses b
        where b.id=r.business_id and b.owner_id=auth.uid() and b.verified))));
$$;
alter table public.go_support_requests enable row level security;
alter table public.go_support_messages enable row level security;
alter table public.go_support_events enable row level security;
alter table public.go_support_files enable row level security;
alter table public.go_support_monthly_totals enable row level security;
revoke all on public.go_support_requests,public.go_support_messages,public.go_support_events,public.go_support_files from public,anon,authenticated;
grant select on public.go_support_requests,public.go_support_messages,public.go_support_events,public.go_support_files to authenticated;
revoke all on public.go_support_monthly_totals from public,anon,authenticated;
grant select on public.go_support_monthly_totals to authenticated;
create policy go_support_totals_admin on public.go_support_monthly_totals for select to authenticated using(public.go_support_admin());
create policy go_support_request_read on public.go_support_requests for select to authenticated using(public.go_support_can_read(id));
create policy go_support_message_read on public.go_support_messages for select to authenticated
  using(public.go_support_can_read(request_id) and (not internal or public.go_support_admin()));
create policy go_support_event_read on public.go_support_events for select to authenticated
  using(public.go_support_can_read(request_id) and (action<>'internal_note' or public.go_support_admin()));
create policy go_support_file_read on public.go_support_files for select to authenticated
  using(public.go_support_can_read(request_id) and status='ready');

create function public.go_support_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.go_support_requests;
begin
  if not public.go_support_can_read(p_id) then raise exception using errcode='42501',message='SUPPORT_ACCESS_DENIED'; end if;
  select * into r from public.go_support_requests where id=p_id;
  if r.id is null then raise exception using errcode='P0002',message='SUPPORT_NOT_FOUND'; end if;
  return to_jsonb(r) || jsonb_build_object('reference','AY-'||lpad(r.ticket_no::text,8,'0'),
    'sender_name',(select p.full_name from public.profiles p where p.id=r.sender_id),
    'business_name',(select b.name from public.businesses b where b.id=r.business_id),
    'messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at,m.id) from public.go_support_messages m
      where m.request_id=p_id and (not m.internal or public.go_support_admin())),'[]'::jsonb),
    'files',coalesce((select jsonb_agg(to_jsonb(f)-'object_path' order by f.created_at,f.id)
      from public.go_support_files f where f.request_id=p_id and f.status='ready'),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.go_support_events e
      where e.request_id=p_id and (e.action<>'internal_note' or public.go_support_admin())),'[]'::jsonb));
end;
$$;
create function public.go_support_list(p_admin boolean default false,p_status text default null,p_kind text default null,
  p_archived boolean default false,p_offset integer default 0,p_limit integer default 30,
  p_from date default null,p_to date default null,p_sender text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or (p_admin and not public.go_support_admin()) then
    raise exception using errcode='42501',message='SUPPORT_ACCESS_DENIED'; end if;
  if p_offset not between 0 and 100000 or p_limit not between 1 and 50
    or (p_status is not null and p_status not in ('received','in_review','pending','solved','rejected'))
    or (p_kind is not null and p_kind not in ('incident','improvement','help'))
    or (p_from is not null and p_to is not null and p_from>p_to)
    or length(coalesce(p_sender,''))>80 then
    raise exception using errcode='22023',message='SUPPORT_FILTER_INVALID'; end if;
  return jsonb_build_object(
    'total',(select count(*) from public.go_support_requests r where (p_admin or public.go_support_can_read(r.id))
      and (p_status is null or r.status=p_status) and (p_kind is null or r.kind=p_kind)
      and (r.archived_at is not null)=p_archived
      and (p_from is null or r.created_at>=p_from) and (p_to is null or r.created_at<p_to+1)
      and (p_sender is null or exists(select 1 from public.profiles p where p.id=r.sender_id
        and p.full_name ilike '%'||p_sender||'%'))),
    'items',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc) from (
      select r.id,r.ticket_no,r.kind,r.body,r.status,r.sender_id,r.business_id,r.revision,r.created_at,r.updated_at,r.archived_at,
        (select p.full_name from public.profiles p where p.id=r.sender_id) as sender_name,
        (select b.name from public.businesses b where b.id=r.business_id) as business_name,
        'AY-'||lpad(r.ticket_no::text,8,'0') as reference,
        exists(select 1 from public.go_support_messages m where m.request_id=r.id and m.author_id<>r.sender_id and not m.internal) as has_response
      from public.go_support_requests r where (p_admin or public.go_support_can_read(r.id))
        and (p_status is null or r.status=p_status) and (p_kind is null or r.kind=p_kind)
        and (r.archived_at is not null)=p_archived
        and (p_from is null or r.created_at>=p_from) and (p_to is null or r.created_at<p_to+1)
        and (p_sender is null or exists(select 1 from public.profiles p where p.id=r.sender_id
          and p.full_name ilike '%'||p_sender||'%'))
      order by r.created_at desc,r.id desc limit p_limit offset p_offset) q),'[]'::jsonb));
end;
$$;
create function public.go_support_create(p_kind text,p_body text,p_request_key uuid,p_business_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r public.go_support_requests;
begin
  if actor is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_kind not in ('incident','improvement','help') or length(btrim(coalesce(p_body,''))) not between 1 and 4000 or p_request_key is null then
    raise exception using errcode='22023',message='SUPPORT_INVALID'; end if;
  if p_business_id is not null and not exists(select 1 from public.businesses b
    where b.id=p_business_id and b.owner_id=actor and b.verified) then
    raise exception using errcode='42501',message='BUSINESS_ACCESS_DENIED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_key::text,707));
  select * into r from public.go_support_requests where sender_id=actor and request_key=p_request_key;
  if found then
    if r.kind<>p_kind or r.body<>btrim(p_body) or r.business_id is distinct from p_business_id then
      raise exception using errcode='PT409',message='SUPPORT_REQUEST_KEY_REUSED'; end if;
    return public.go_support_detail(r.id);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,709));
  if (select count(*) from public.go_support_requests where sender_id=actor and created_at>now()-interval '1 day')>=20 then
    raise exception using errcode='22023',message='SUPPORT_DAILY_LIMIT'; end if;
  insert into public.go_support_requests(sender_id,business_id,kind,body,request_key)
    values(actor,p_business_id,p_kind,btrim(p_body),p_request_key) returning * into r;
  insert into public.go_support_events(request_id,actor_id,action,to_status) values(r.id,actor,'create','received');
  return public.go_support_detail(r.id);
end;
$$;
create function public.go_support_act(p_id uuid,p_key uuid,p_action text,p_body text default null,
  p_status text default null,p_revision integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r public.go_support_requests; prior go_support_private.commands; next_status text;
  command jsonb:=jsonb_build_object('id',p_id,'action',p_action,'body',p_body,'status',p_status,'revision',p_revision);
begin
  if actor is null or p_key is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||p_key::text,708));
  select * into prior from go_support_private.commands where actor_id=actor and request_key=p_key;
  if found then
    if prior.payload<>command then raise exception using errcode='PT409',message='SUPPORT_ACTION_KEY_REUSED'; end if;
    if not public.go_support_can_read(prior.request_id) then raise exception using errcode='42501',message='SUPPORT_ACCESS_DENIED'; end if;
    return public.go_support_detail(prior.request_id);
  end if;
  select * into r from public.go_support_requests where id=p_id for update;
  if r.id is null or not public.go_support_can_read(p_id) then raise exception using errcode='42501',message='SUPPORT_ACCESS_DENIED'; end if;
  if exists(select 1 from go_support_private.retention_claims where request_id=p_id) then
    raise exception using errcode='PT409',message='SUPPORT_RETENTION_IN_PROGRESS'; end if;
  if p_revision is distinct from r.revision then raise exception using errcode='PT409',message='SUPPORT_CHANGED'; end if;
  if p_action='reply' then
    if r.archived_at is not null or length(btrim(coalesce(p_body,''))) not between 1 and 4000 then
      raise exception using errcode='22023',message='SUPPORT_REPLY_INVALID'; end if;
    if (select count(*) from public.go_support_messages where request_id=p_id and author_id=actor
      and created_at>now()-interval '1 day')>=50 then
      raise exception using errcode='22023',message='SUPPORT_DAILY_LIMIT'; end if;
    insert into public.go_support_messages(request_id,author_id,body,internal,request_key)
      values(p_id,actor,btrim(p_body),false,p_key);
  elsif p_action='internal_note' and public.go_support_admin() then
    if length(btrim(coalesce(p_body,''))) not between 1 and 4000 then raise exception using errcode='22023',message='SUPPORT_NOTE_INVALID'; end if;
    insert into public.go_support_messages(request_id,author_id,body,internal,request_key)
      values(p_id,actor,btrim(p_body),true,p_key);
  elsif p_action='status' and public.go_support_admin() then
    if p_status not in ('received','in_review','pending','solved','rejected') or r.archived_at is not null
      or (p_status in ('solved','rejected') and length(btrim(coalesce(p_body,''))) not between 1 and 1000) then
      raise exception using errcode='22023',message='SUPPORT_STATUS_INVALID'; end if;
    next_status:=p_status;
    update public.go_support_requests set status=next_status where id=p_id;
    if p_body is not null and length(btrim(p_body))>0 then
      insert into public.go_support_messages(request_id,author_id,body,internal,request_key)
        values(p_id,actor,btrim(p_body),false,p_key);
    end if;
  elsif p_action in ('archive','reopen') and public.go_support_admin() then
    if p_action='archive' and r.archived_at is not null or p_action='reopen' and r.archived_at is null then
      raise exception using errcode='PT409',message='SUPPORT_ARCHIVE_CHANGED'; end if;
    update public.go_support_requests set
      archived_at=case when p_action='archive' then now() else null end,
      retention_until=case when p_action='archive' then now()+interval '12 months' else null end
      where id=p_id;
  else raise exception using errcode='42501',message='SUPPORT_ACTION_DENIED'; end if;
  update public.go_support_requests set revision=revision+1,updated_at=now() where id=p_id;
  insert into public.go_support_events(request_id,actor_id,action,from_status,to_status,reason)
    values(p_id,actor,p_action,r.status,coalesce(next_status,r.status),case when p_action='status' then p_body end);
  insert into go_support_private.commands(actor_id,request_key,payload,request_id) values(actor,p_key,command,p_id);
  return public.go_support_detail(p_id);
end;
$$;
create function public.go_support_file_access(p_path text,p_mode text default 'read') returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.go_support_files f join public.go_support_requests r on r.id=f.request_id
    where f.object_path=p_path and public.go_support_can_read(r.id) and
      ((p_mode='read' and f.status='ready') or
       (p_mode='upload' and f.status='uploading' and f.created_by=auth.uid() and r.sender_id=auth.uid()) or
       (p_mode='delete' and ((f.status='removed' and (f.created_by=auth.uid() or public.go_support_admin()))
         or (public.go_support_admin() and r.retention_until<=now())))));
$$;
create function public.go_support_reserve_file(p_id uuid,p_client_id text,p_name text,p_mime text,p_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.go_support_requests; f public.go_support_files; file_id uuid:=gen_random_uuid();
begin
  select * into r from public.go_support_requests where id=p_id for update;
  if r.id is null or r.sender_id<>auth.uid() or not public.go_support_can_read(p_id) or r.archived_at is not null then
    raise exception using errcode='42501',message='SUPPORT_ACCESS_DENIED'; end if;
  if p_client_id !~ '^[a-zA-Z0-9_-]{1,80}$' or length(p_name) not between 1 and 180 or p_name ~ '[/\\]'
    or p_mime not in ('application/pdf','image/jpeg','image/png','image/heic','image/heif','image/webp')
    or (p_mime='application/pdf' and p_name !~* '\.pdf$')
    or (p_mime='image/jpeg' and p_name !~* '\.(jpg|jpeg)$')
    or (p_mime='image/png' and p_name !~* '\.png$')
    or (p_mime='image/heic' and p_name !~* '\.heic$')
    or (p_mime='image/heif' and p_name !~* '\.heif$')
    or (p_mime='image/webp' and p_name !~* '\.webp$')
    or p_size not between 1 and 10485760 then raise exception using errcode='22023',message='SUPPORT_FILE_INVALID'; end if;
  select * into f from public.go_support_files where request_id=p_id and client_id=p_client_id;
  if found then
    if f.file_name<>p_name or f.mime_type<>p_mime or f.byte_size<>p_size or f.status='removed' then
      raise exception using errcode='PT409',message='SUPPORT_FILE_CHANGED'; end if;
  else
    if (select count(*) from public.go_support_files where request_id=p_id and status<>'removed')>=5
      or (select coalesce(sum(byte_size),0) from public.go_support_files where request_id=p_id and status<>'removed')+p_size>26214400 then
      raise exception using errcode='22023',message='SUPPORT_FILE_LIMIT'; end if;
    insert into public.go_support_files(id,request_id,client_id,created_by,object_path,file_name,mime_type,byte_size)
      values(file_id,p_id,p_client_id,auth.uid(),p_id::text||'/'||file_id::text,p_name,p_mime,p_size) returning * into f;
  end if;
  return jsonb_build_object('id',f.id,'status',f.status,'clientId',f.client_id,'fileName',f.file_name);
end;
$$;
create function public.go_support_file(p_id uuid,p_mode text default 'read') returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.go_support_files;
begin
  select * into f from public.go_support_files where id=p_id;
  if f.id is null or not public.go_support_file_access(f.object_path,p_mode) then
    raise exception using errcode='42501',message='SUPPORT_FILE_DENIED'; end if;
  return to_jsonb(f);
end;
$$;
create function public.go_support_confirm_file(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.go_support_files;
begin
  select * into f from public.go_support_files where id=p_id for update;
  if f.id is null or f.created_by<>auth.uid() or not public.go_support_can_read(f.request_id) then
    raise exception using errcode='42501',message='SUPPORT_FILE_DENIED'; end if;
  if f.status='ready' then return to_jsonb(f)-'object_path'; end if;
  if f.status<>'uploading' or not exists(select 1 from storage.objects o where o.bucket_id='go-support-private'
    and o.name=f.object_path and (o.metadata->>'size')::bigint=f.byte_size
    and o.metadata->>'mimetype'=f.mime_type) then
    raise exception using errcode='22023',message='SUPPORT_UPLOAD_UNCONFIRMED'; end if;
  update public.go_support_files set status='ready' where id=p_id;
  return to_jsonb(f)-'object_path'||jsonb_build_object('status','ready');
end;
$$;
create function public.go_support_remove_file(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.go_support_files;
begin
  select * into f from public.go_support_files where id=p_id for update;
  if f.id is null or not public.go_support_can_read(f.request_id)
    or (f.created_by<>auth.uid() and not public.go_support_admin()) then
    raise exception using errcode='42501',message='SUPPORT_FILE_DENIED'; end if;
  if f.status<>'removed' then
    update public.go_support_files set status='removed' where id=p_id;
    insert into public.go_support_events(request_id,actor_id,action) values(f.request_id,auth.uid(),'remove_file');
  end if;
  return jsonb_build_object('id',f.id,'status','removed');
end;
$$;

-- Storage objects are removed through the Storage API before the database purge is committed.
create function public.go_support_expired(p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.go_support_admin() then raise exception using errcode='42501',message='SUPPORT_ACCESS_DENIED'; end if;
  if p_limit is null or p_limit not between 1 and 50 then raise exception using errcode='22023',message='SUPPORT_LIMIT_INVALID'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'files',coalesce((
    select jsonb_agg(jsonb_build_object('id',f.id,'path',f.object_path)) from public.go_support_files f
    where f.request_id=r.id),'[]'::jsonb)))
    from (select id from public.go_support_requests where retention_until<=now() order by retention_until,id limit p_limit) r),'[]'::jsonb);
end;
$$;
create function public.go_support_claim_expired(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.go_support_requests;
begin
  if not public.go_support_admin() then raise exception using errcode='42501',message='SUPPORT_ACCESS_DENIED'; end if;
  select * into r from public.go_support_requests where id=p_id for update;
  if r.id is null or r.archived_at is null or r.retention_until is null or r.retention_until>now() then
    raise exception using errcode='PT409',message='SUPPORT_RETENTION_NOT_DUE'; end if;
  insert into go_support_private.retention_claims(request_id) values(p_id) on conflict do nothing;
  return jsonb_build_object('id',p_id,'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'path',f.object_path))
    from public.go_support_files f where f.request_id=p_id),'[]'::jsonb));
end;
$$;
create function public.go_support_purge_expired(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.go_support_requests;
begin
  if not public.go_support_admin() then raise exception using errcode='42501',message='SUPPORT_ACCESS_DENIED'; end if;
  select * into r from public.go_support_requests where id=p_id for update;
  if r.id is null or r.archived_at is null or r.retention_until is null or r.retention_until>now() then
    raise exception using errcode='42501',message='SUPPORT_RETENTION_NOT_DUE'; end if;
  if not exists(select 1 from go_support_private.retention_claims where request_id=p_id) then
    raise exception using errcode='PT409',message='SUPPORT_RETENTION_NOT_CLAIMED'; end if;
  -- The API must remove each private object first; never orphan blob content.
  if exists(select 1 from storage.objects o join public.go_support_files f
    on f.object_path=o.name where f.request_id=p_id and o.bucket_id='go-support-private') then
    raise exception using errcode='PT409',message='SUPPORT_STORAGE_NOT_EMPTY'; end if;
  insert into public.go_support_monthly_totals(month,kind,status,request_count)
    values(date_trunc('month',r.created_at)::date,r.kind,r.status,1)
    on conflict(month,kind,status) do update set request_count=public.go_support_monthly_totals.request_count+1;
  delete from go_support_private.commands where request_id=p_id;
  delete from go_support_private.retention_claims where request_id=p_id;
  delete from public.go_support_files where request_id=p_id;
  delete from public.go_support_messages where request_id=p_id;
  delete from public.go_support_events where request_id=p_id;
  delete from public.go_support_requests where id=p_id;
  return true;
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('go-support-private','go-support-private',false,10485760,
  array['application/pdf','image/jpeg','image/png','image/heic','image/heif','image/webp']);
create policy go_support_upload on storage.objects for insert to authenticated
  with check(bucket_id='go-support-private' and public.go_support_file_access(name,'upload'));
create policy go_support_download on storage.objects for select to authenticated
  using(bucket_id='go-support-private' and public.go_support_file_access(name,'read'));
create policy go_support_delete on storage.objects for delete to authenticated
  using(bucket_id='go-support-private' and public.go_support_file_access(name,'delete'));

revoke all on function public.go_support_readiness(),public.go_support_admin(),public.go_support_can_read(uuid),public.go_support_detail(uuid),
  public.go_support_list(boolean,text,text,boolean,integer,integer,date,date,text),public.go_support_create(text,text,uuid,uuid),
  public.go_support_act(uuid,uuid,text,text,text,integer),public.go_support_file_access(text,text),
  public.go_support_reserve_file(uuid,text,text,text,integer),public.go_support_file(uuid,text),
  public.go_support_confirm_file(uuid),public.go_support_remove_file(uuid),
  public.go_support_expired(integer),public.go_support_claim_expired(uuid),public.go_support_purge_expired(uuid) from public,anon;
grant execute on function public.go_support_readiness(),public.go_support_admin(),public.go_support_can_read(uuid),public.go_support_detail(uuid),
  public.go_support_list(boolean,text,text,boolean,integer,integer,date,date,text),public.go_support_create(text,text,uuid,uuid),
  public.go_support_act(uuid,uuid,text,text,text,integer),public.go_support_file_access(text,text),
  public.go_support_reserve_file(uuid,text,text,text,integer),public.go_support_file(uuid,text),
  public.go_support_confirm_file(uuid),public.go_support_remove_file(uuid),
  public.go_support_expired(integer),public.go_support_claim_expired(uuid),public.go_support_purge_expired(uuid) to authenticated;
commit;
