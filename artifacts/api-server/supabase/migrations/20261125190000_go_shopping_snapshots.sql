-- GO Compras: one versioned, private snapshot per authenticated account and context.
-- Local GO logs are imported by the client with their original list and product IDs.
create table public.go_shopping_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  context text not null check (context ~ '^(live:ADMIN|(live|demo):USER|live:BUSINESS|demo:BUSINESS:[^:]+)$'),
  revision bigint not null default 1 check (revision > 0),
  lists jsonb not null default '[]'::jsonb check (jsonb_typeof(lists) = 'array'),
  active_list_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, context)
);

alter table public.go_shopping_snapshots enable row level security;
revoke all on public.go_shopping_snapshots from public, anon;
grant select, insert, update on public.go_shopping_snapshots to authenticated;

create policy go_shopping_read_self on public.go_shopping_snapshots
  for select to authenticated using (user_id = (select auth.uid()));
create policy go_shopping_insert_self on public.go_shopping_snapshots
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy go_shopping_update_self on public.go_shopping_snapshots
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create function public.go_shopping_save(p_context text, p_expected bigint, p_lists jsonb, p_active_list_id text)
returns bigint language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_revision bigint;
begin
  if v_user is null or p_context is null or p_context !~ '^(live:ADMIN|(live|demo):USER|live:BUSINESS|demo:BUSINESS:[^:]+)$'
    or p_expected is null or p_expected < 0 or p_lists is null or jsonb_typeof(p_lists) <> 'array'
    or (p_active_list_id is not null and length(p_active_list_id) > 160) then
    raise exception 'Invalid shopping snapshot' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lists) > 100 or length(p_lists::text) > 4000000 then
    raise exception 'Shopping snapshot too large' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lists) as elements(value)
    where jsonb_typeof(value) <> 'object' or coalesce(value->>'id','') = '' or length(value->>'id') > 160
      or value->>'ownerUserId' is distinct from v_user::text
      or coalesce(value->>'taskContext', value->>'actionContext', 'live:USER') is distinct from p_context
      or value->'note'->'shopping'->>'version' is distinct from '1')
    or (select count(*) from jsonb_array_elements(p_lists))
      <> (select count(distinct value->>'id') from jsonb_array_elements(p_lists) as elements(value))
    or (p_active_list_id is not null and not exists
      (select 1 from jsonb_array_elements(p_lists) as elements(value) where value->>'id' = p_active_list_id)) then
    raise exception 'Invalid shopping list ownership or identity' using errcode = '22023';
  end if;
  if p_expected = 0 then
    insert into public.go_shopping_snapshots(user_id, context, lists, active_list_id)
    values (v_user, p_context, p_lists, p_active_list_id)
    on conflict do nothing returning revision into v_revision;
  else
    update public.go_shopping_snapshots set lists = p_lists, active_list_id = p_active_list_id,
      revision = revision + 1, updated_at = now()
    where user_id = v_user and context = p_context and revision = p_expected
    returning revision into v_revision;
  end if;
  if v_revision is null then
    select revision into v_revision from public.go_shopping_snapshots
    where user_id = v_user and context = p_context and lists = p_lists
      and active_list_id is not distinct from p_active_list_id and revision = p_expected + 1;
  end if;
  if v_revision is null then
    raise exception 'Shopping snapshot changed' using errcode = '40001';
  end if;
  return v_revision;
end $$;

revoke all on function public.go_shopping_save(text,bigint,jsonb,text) from public, anon;
grant execute on function public.go_shopping_save(text,bigint,jsonb,text) to authenticated;
