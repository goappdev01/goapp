-- GO Eventos Deportivos ADMIN-only, V1.
-- DRAFT ONLY: do not apply to any hosted database without a separate, exact approval.
-- Contains no payment, transfer, escrow, QR or organizer-integration operation.
-- It creates only new, dedicated objects and aborts if any target object already exists.
begin;
do $preflight$
begin
  if to_regclass('public.go_sports_event_records') is not null
    or to_regprocedure('public.go_sports_record_save(jsonb,integer)') is not null
    or to_regprocedure('public.go_sports_record_withdraw(uuid,integer)') is not null then
    raise exception 'GO sports target already exists; inspect it and prepare a reviewed migration instead of replacing it';
  end if;
end;
$preflight$;

create table public.go_sports_event_records (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  record_type text not null check (record_type in ('offer','season_pass','saved_search')),
  version integer not null check (version > 0),
  document jsonb not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (document->>'id' = id::text and document->>'ownerUserId' = owner_user_id::text
    and document->>'profile' = 'ADMIN' and document->>'recordType' = record_type
    and (document->>'accessStatus') = 'unverified')
);
create index go_sports_owner_updated on public.go_sports_event_records(owner_user_id, updated_at desc, id);
create index go_sports_owner_type on public.go_sports_event_records(owner_user_id, record_type, deleted);
alter table public.go_sports_event_records enable row level security;
revoke all on public.go_sports_event_records from public, anon, authenticated;
grant select on public.go_sports_event_records to authenticated;
create policy go_sports_event_records_select_admin_owner on public.go_sports_event_records
  for select to authenticated using (owner_user_id = (select auth.uid()) and exists (
    select 1 from public.admin_memberships m where m.user_id=(select auth.uid()) and m.active
      and (m.level='owner' or m.permissions @> array['admin.access']::text[])));

create function public.go_sports_record_save(p_record jsonb, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); rid uuid; old_version integer; next_version integer; result jsonb; allowed_keys text[];
begin
  if uid is null or p_record is null or jsonb_typeof(p_record) is distinct from 'object'
    or p_record->>'ownerUserId' is distinct from uid::text or p_record->>'profile' is distinct from 'ADMIN'
    or p_record->>'accessStatus' is distinct from 'unverified'
    or coalesce(p_record->>'recordType','') not in ('offer','season_pass','saved_search')
    or coalesce(p_record->>'status','') not in ('draft','available','paused','cancelled')
    or not exists(select 1 from public.admin_memberships m where m.user_id=uid and m.active
      and (m.level='owner' or m.permissions @> array['admin.access']::text[])) then
    raise exception 'Access or record denied' using errcode='42501';
  end if;
  allowed_keys := case p_record->>'recordType'
    when 'offer' then array['id','ownerUserId','profile','version','recordType','status','accessStatus','policy','event','seat','mode','price','faceValue','currency','exchange','ownerStatement']
    when 'season_pass' then array['id','ownerUserId','profile','version','recordType','status','accessStatus','policy','title','sport','competition','season','venue','seat','coveredEvents','ownerStatement']
    else array['id','ownerUserId','profile','version','recordType','status','accessStatus','policy','title','sport','city','region','team','competition','venue','fromDate','toDate','maxPrice','modes']
  end;
  if exists(select 1 from jsonb_object_keys(p_record) as k(key) where k.key <> all(allowed_keys))
    or jsonb_typeof(p_record->'policy') is distinct from 'object'
    or p_record->'policy'->>'status' is distinct from 'unverified'
    or exists(select 1 from jsonb_object_keys(p_record->'policy') as k(key) where k.key not in ('status','sourceUrl','checkedAt')) then
    raise exception 'Unsupported record fields' using errcode='22023';
  end if;
  if p_record->>'recordType'='offer' and (
       jsonb_typeof(p_record->'event') is distinct from 'object' or jsonb_typeof(p_record->'seat') is distinct from 'object'
       or exists(select 1 from jsonb_object_keys(p_record->'event') as k(key) where k.key not in ('key','title','sport','competition','homeTeam','awayTeam','startsAt','timeZone','city','region','venue','officialEventUrl'))
       or exists(select 1 from jsonb_object_keys(p_record->'seat') as k(key) where k.key not in ('stand','section','row','seat','quantity'))
       or (p_record ? 'exchange' and (jsonb_typeof(p_record->'exchange') is distinct from 'object'
         or exists(select 1 from jsonb_object_keys(p_record->'exchange') as k(key) where k.key not in ('sport','competition','team','fromDate','toDate','zones','minCashDifference','maxCashDifference','compatibleModes'))))
       or coalesce(p_record->'event'->>'key','')='' or length(p_record->'event'->>'key')>180
       or coalesce(p_record->'event'->>'title','')='' or length(p_record->'event'->>'title')>180
       or coalesce(p_record->'event'->>'sport','') not in ('football','basketball','tennis','padel','motorsport','rugby','handball','volleyball','other')
       or coalesce(p_record->'seat'->>'quantity','') !~ '^([1-9]|1[0-9]|20)$'
       or coalesce(p_record->>'mode','') not in ('sale','exchange','sale_or_exchange','free','share')
       or p_record->>'ownerStatement' is distinct from 'self_declared'
       or coalesce(p_record->>'currency','')<>'EUR'
       or (coalesce(p_record->'event'->>'startsAt','')<>'' and p_record->'event'->>'startsAt' !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$')
       or (p_record ? 'price' and (p_record->>'price')::numeric < 0)
       or (p_record ? 'faceValue' and (p_record->>'faceValue')::numeric < 0)
       or (p_record->'exchange' ? 'minCashDifference' and (p_record->'exchange'->>'minCashDifference')::numeric < 0)
       or (p_record->'exchange' ? 'maxCashDifference' and (p_record->'exchange'->>'maxCashDifference')::numeric < 0)
       or ((p_record->'exchange'->>'fromDate')<>'' and (p_record->'exchange'->>'toDate')<>'' and p_record->'exchange'->>'fromDate' > p_record->'exchange'->>'toDate')
       or ((p_record->'exchange' ? 'minCashDifference') and (p_record->'exchange' ? 'maxCashDifference') and
         (p_record->'exchange'->>'minCashDifference')::numeric > (p_record->'exchange'->>'maxCashDifference')::numeric)
       or ((p_record->'exchange' ? 'fromDate') and coalesce(p_record->'exchange'->>'fromDate','') !~ '^$|^\d{4}-\d{2}-\d{2}$')
       or ((p_record->'exchange' ? 'toDate') and coalesce(p_record->'exchange'->>'toDate','') !~ '^$|^\d{4}-\d{2}-\d{2}$')
       or (p_record->'exchange' ? 'compatibleModes' and (jsonb_typeof(p_record->'exchange'->'compatibleModes') is distinct from 'array'
         or jsonb_array_length(p_record->'exchange'->'compatibleModes')>4
         or exists(select 1 from jsonb_array_elements_text(p_record->'exchange'->'compatibleModes') as m(value) where m.value not in ('ticket','ticket_plus_cash','cash_plus_ticket','multiple'))))
       or (p_record->>'mode' in ('sale','sale_or_exchange') and not (p_record ? 'price'))
       or (p_record->>'mode' in ('exchange','sale_or_exchange') and not (p_record ? 'exchange'))
       or (p_record->>'mode'='sale' and p_record ? 'exchange')
       or (p_record->>'mode'='exchange' and p_record ? 'price')
       or (p_record->>'mode' in ('free','share') and (p_record ? 'price' or p_record ? 'exchange'))) then
    raise exception 'Invalid offer or unsupported fields' using errcode='22023';
  end if;
  if p_record->>'recordType'='season_pass' and (
       jsonb_typeof(p_record->'seat') is distinct from 'object' or jsonb_typeof(p_record->'coveredEvents') is distinct from 'array'
       or exists(select 1 from jsonb_object_keys(p_record->'seat') as k(key) where k.key not in ('stand','section','row','seat','quantity'))
       or jsonb_array_length(p_record->'coveredEvents')>100
       or exists(select 1 from jsonb_array_elements(p_record->'coveredEvents') as e(value) where jsonb_typeof(e.value) is distinct from 'object'
         or exists(select 1 from jsonb_object_keys(e.value) as k(key) where k.key not in ('key','title','startsAt','attendance'))
         or coalesce(e.value->>'key','')='' or coalesce(e.value->>'title','')=''
         or coalesce(e.value->>'attendance','unknown') not in ('attend','offer','excluded','unknown')
         or (coalesce(e.value->>'startsAt','')<>'' and e.value->>'startsAt' !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$'))
       or coalesce(p_record->>'title','')='' or coalesce(p_record->>'season','')=''
       or coalesce(p_record->'seat'->>'quantity','') !~ '^([1-9]|1[0-9]|20)$'
       or p_record->>'ownerStatement' is distinct from 'self_declared') then
    raise exception 'Invalid season pass or unsupported fields' using errcode='22023';
  end if;
  if p_record->>'recordType'='saved_search' and (
       coalesce(p_record->>'title','')='' or length(p_record->>'title')>180
       or jsonb_typeof(p_record->'modes') is distinct from 'array' or jsonb_array_length(p_record->'modes')>5
       or exists(select 1 from jsonb_array_elements_text(p_record->'modes') as m(value) where m.value not in ('sale','exchange','sale_or_exchange','free','share'))
       or (p_record ? 'sport' and p_record->>'sport' not in ('football','basketball','tennis','padel','motorsport','rugby','handball','volleyball','other'))
       or coalesce(p_record->>'fromDate','') !~ '^$|^\d{4}-\d{2}-\d{2}$'
       or coalesce(p_record->>'toDate','') !~ '^$|^\d{4}-\d{2}-\d{2}$'
       or (p_record ? 'maxPrice' and (p_record->>'maxPrice')::numeric < 0)
       or ((coalesce(p_record->>'fromDate','')<>'' and coalesce(p_record->>'toDate','')<>'') and p_record->>'fromDate' > p_record->>'toDate')) then
    raise exception 'Invalid saved search or unsupported fields' using errcode='22023';
  end if;
  rid := (p_record->>'id')::uuid;
  if p_expected_version is null or p_expected_version < 0 then raise exception 'Invalid version' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 1209));
  select version into old_version from public.go_sports_event_records where id=rid and owner_user_id=uid for update;
  if coalesce(old_version,0) <> p_expected_version then raise exception 'Record changed' using errcode='PT409'; end if;
  if p_record->>'recordType'='offer' then
    if coalesce(p_record->'seat'->>'seat','')<>'' and exists (
      select 1 from public.go_sports_event_records b where b.owner_user_id=uid and b.id<>rid and not b.deleted
        and b.record_type='offer' and b.document->>'status' not in ('cancelled')
        and b.document->'event'->>'key'=p_record->'event'->>'key'
        and lower(coalesce(b.document->'seat'->>'stand',''))=lower(coalesce(p_record->'seat'->>'stand',''))
        and lower(coalesce(b.document->'seat'->>'section',''))=lower(coalesce(p_record->'seat'->>'section',''))
        and lower(coalesce(b.document->'seat'->>'row',''))=lower(coalesce(p_record->'seat'->>'row',''))
        and lower(b.document->'seat'->>'seat')=lower(p_record->'seat'->>'seat')) then
      raise exception 'Duplicate seat offer' using errcode='23505';
    end if;
  end if;
  next_version := p_expected_version + 1;
  result := jsonb_set(p_record,'{version}',to_jsonb(next_version));
  insert into public.go_sports_event_records(id,owner_user_id,record_type,version,document)
    values(rid,uid,result->>'recordType',next_version,result)
    on conflict(id) do update set record_type=excluded.record_type,version=excluded.version,document=excluded.document,updated_at=now()
    where go_sports_event_records.owner_user_id=uid;
  if not found then raise exception 'Access denied' using errcode='42501'; end if;
  return result;
end; $$;
revoke all on function public.go_sports_record_save(jsonb,integer) from public, anon;
grant execute on function public.go_sports_record_save(jsonb,integer) to authenticated;

create function public.go_sports_record_withdraw(p_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null or not exists(select 1 from public.admin_memberships m where m.user_id=uid and m.active
    and (m.level='owner' or m.permissions @> array['admin.access']::text[])) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 1209));
  update public.go_sports_event_records set deleted=true,version=version+1,
    document=jsonb_set(jsonb_set(document,'{version}',to_jsonb(version+1)),'{status}','"cancelled"'::jsonb),updated_at=now()
    where id=p_id and owner_user_id=uid and version=p_expected_version and not deleted returning document into result;
  if result is null then raise exception 'Record changed or unavailable' using errcode='PT409'; end if;
  return result;
end; $$;
revoke all on function public.go_sports_record_withdraw(uuid,integer) from public, anon;
grant execute on function public.go_sports_record_withdraw(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
