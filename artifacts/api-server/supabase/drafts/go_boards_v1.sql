-- GO Tableros V1. Additive; apply only to the existing isolated development DB.
-- Production requires its own reviewed authorization. No existing GO row changes.
begin;
create table if not exists public.go_board_documents (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  profile text not null default 'ADMIN' check (profile = 'ADMIN'),
  version integer not null check (version > 0),
  document jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  check (document->>'id' = id::text and document->>'ownerUserId' = owner_user_id::text
    and document->>'profile' = profile and jsonb_typeof(document->'cards') = 'array'
    and jsonb_typeof(document->'columns') = 'array')
);
create index if not exists go_boards_owner_order on public.go_board_documents
  (owner_user_id, ((document->>'archived')::boolean), ((document->>'position')::double precision), id);
alter table public.go_board_documents enable row level security;
revoke all on public.go_board_documents from public, anon, authenticated;
grant select, insert, update on public.go_board_documents to authenticated;
drop policy if exists go_boards_own_admin on public.go_board_documents;
create policy go_boards_own_admin on public.go_board_documents for all to authenticated
  using (owner_user_id = (select auth.uid()) and exists (select 1 from public.admin_memberships m
    where m.user_id = (select auth.uid()) and m.active
      and (m.level = 'owner' or m.permissions @> array['admin.access']::text[])))
  with check (owner_user_id = (select auth.uid()) and exists (select 1 from public.admin_memberships m
    where m.user_id = (select auth.uid()) and m.active
      and (m.level = 'owner' or m.permissions @> array['admin.access']::text[])));

create or replace function public.go_board_save(p_document jsonb, p_expected integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); old_version integer; board_id uuid; next_doc jsonb;
begin
  if uid is null or p_document->>'ownerUserId' is distinct from uid::text
    or p_document->>'profile' is distinct from 'ADMIN'
    or not exists(select 1 from public.admin_memberships m where m.user_id=uid and m.active
      and (m.level='owner' or m.permissions @> array['admin.access']::text[])) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  board_id := (p_document->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 47));
  select version into old_version from public.go_board_documents where id=board_id and owner_user_id=uid;
  -- A business revision conflict is not a retryable serialization failure.
  if coalesce(old_version,0) <> p_expected then raise exception 'Board changed' using errcode='PT409'; end if;
  if length(btrim(p_document->>'name')) not between 1 and 160
    or jsonb_typeof(p_document->'cards') is distinct from 'array'
    or jsonb_typeof(p_document->'columns') is distinct from 'array'
    or exists(select 1 from jsonb_array_elements(p_document->'cards') c
      where c->'entry'->>'ownerUserId' is distinct from uid::text
        or c->'entry'->>'taskContext' is distinct from 'ADMIN'
        or c->'entry'->>'actionContext' is distinct from 'ADMIN'
        or c->'entry'->>'type' is distinct from 'TAREA'
        or c->'entry'->>'kind' is distinct from 'sent'
        or c->'entry' ? 'reservationId'
        or (coalesce(c->'entry'->>'dateISO','')='' and coalesce(c->'entry'->>'time','')<>'')
        or not exists(select 1 from jsonb_array_elements(p_document->'columns') col where col->>'id'=c->>'columnId'))
    or (select count(*)<>count(distinct c->'entry'->>'id') from jsonb_array_elements(p_document->'cards') c)
    or exists(select 1 from public.go_board_documents b, jsonb_array_elements(b.document->'cards') existing
      join jsonb_array_elements(p_document->'cards') incoming on incoming->'entry'->>'id'=existing->'entry'->>'id'
      where b.owner_user_id=uid and b.id<>board_id) then
    raise exception 'Invalid or duplicated task' using errcode='22023';
  end if;
  next_doc := jsonb_set(p_document,'{version}',to_jsonb(p_expected+1));
  perform set_config('go.boards_rpc','save',true);
  insert into public.go_board_documents(id,owner_user_id,profile,version,document)
    values(board_id,uid,'ADMIN',p_expected+1,next_doc)
    on conflict(id) do update set version=excluded.version,document=excluded.document,updated_at=now()
      where go_board_documents.owner_user_id=uid;
  if not found then raise exception 'Access denied' using errcode='42501'; end if;
  return next_doc;
end; $$;
revoke all on function public.go_board_save(jsonb,integer) from public,anon;
grant execute on function public.go_board_save(jsonb,integer) to authenticated;

create or replace function public.go_board_move_task(p_source uuid,p_target uuid,p_task text,p_column text,
 p_source_version integer,p_target_version integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare src jsonb; dst jsonb; card jsonb; uid uuid:=auth.uid();
begin
  if uid is null or p_source=p_target then raise exception 'Invalid transfer' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,47));
  select document into src from public.go_board_documents where id=p_source and owner_user_id=uid and version=p_source_version;
  select document into dst from public.go_board_documents where id=p_target and owner_user_id=uid and version=p_target_version;
  if src is null or dst is null then raise exception 'Board changed or unavailable' using errcode='PT409'; end if;
  if not exists(select 1 from jsonb_array_elements(dst->'columns') c where c->>'id'=p_column and not (c->>'archived')::boolean)
    then raise exception 'Column unavailable' using errcode='22023'; end if;
  select c into card from jsonb_array_elements(src->'cards') c where c->'entry'->>'id'=p_task;
  if card is null then raise exception 'Task unavailable' using errcode='22023'; end if;
  src:=jsonb_set(src,'{cards}',coalesce((select jsonb_agg(c) from jsonb_array_elements(src->'cards') c where c->'entry'->>'id'<>p_task),'[]'));
  src:=jsonb_set(src,'{version}',to_jsonb(p_source_version+1));
  dst:=jsonb_set(dst,'{cards}',(dst->'cards')||jsonb_build_array(jsonb_set(card,'{columnId}',to_jsonb(p_column))));
  dst:=jsonb_set(dst,'{version}',to_jsonb(p_target_version+1));
  perform set_config('go.boards_rpc','save',true);
  update public.go_board_documents set document=src,version=p_source_version+1,updated_at=now() where id=p_source and owner_user_id=uid;
  update public.go_board_documents set document=dst,version=p_target_version+1,updated_at=now() where id=p_target and owner_user_id=uid;
  return jsonb_build_object('source',src,'target',dst);
end; $$;
revoke all on function public.go_board_move_task(uuid,uuid,text,text,integer,integer) from public,anon;
grant execute on function public.go_board_move_task(uuid,uuid,text,text,integer,integer) to authenticated;

-- Calendar links outlive a logically deleted board. The task is still one GO ID.
create or replace function public.go_board_calendar(p_offset integer default 0) returns setof jsonb
language sql security invoker set search_path='' as $$
  select b.document from public.go_board_documents b
  where b.owner_user_id=auth.uid()
  order by b.id limit 30 offset greatest(0,p_offset)
$$;
revoke all on function public.go_board_calendar(integer) from public,anon;
grant execute on function public.go_board_calendar(integer) to authenticated;

create or replace function public.go_board_delete(p_id uuid,p_expected integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,47));
  perform set_config('go.boards_rpc','save',true);
  update public.go_board_documents set deleted=true,version=version+1,
    document=jsonb_set(jsonb_set(document,'{version}',to_jsonb(version+1)),'{removed}','true'),updated_at=now()
    where id=p_id and owner_user_id=auth.uid() and version=p_expected and not deleted returning document into result;
  if result is null then raise exception 'Board changed or unavailable' using errcode='PT409'; end if;
  return result;
end; $$;
revoke all on function public.go_board_delete(uuid,integer) from public,anon;
grant execute on function public.go_board_delete(uuid,integer) to authenticated;

-- Direct Data API writes must not bypass revision checks, ownership or unique task IDs.
create or replace function public.go_board_write_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_setting('go.boards_rpc',true) is distinct from 'save' then
    raise exception 'Use the authorized board operation' using errcode='42501';
  end if;
  if new.document->>'version' is distinct from new.version::text
    or (tg_op='UPDATE' and (new.owner_user_id<>old.owner_user_id or new.version<>old.version+1))
    or (tg_op='INSERT' and new.version<>1)
    or (select count(*)<>count(distinct c->>'id') from jsonb_array_elements(new.document->'columns') c)
    or exists(select 1 from jsonb_array_elements(new.document->'cards') c
      where c->'entry'->>'ownerUserId' is distinct from new.owner_user_id::text
      or c->'entry'->>'kind' is distinct from 'sent' or c->'entry'->>'type' is distinct from 'TAREA'
      or c->'entry'->>'taskContext' is distinct from 'ADMIN' or c->'entry'->>'actionContext' is distinct from 'ADMIN'
      or c->'entry' ? 'reservationId') then
    raise exception 'Invalid board record' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public.go_board_write_guard() from public,anon;
drop trigger if exists go_board_guard on public.go_board_documents;
create trigger go_board_guard before insert or update on public.go_board_documents
  for each row execute function public.go_board_write_guard();
notify pgrst,'reload schema';
commit;
