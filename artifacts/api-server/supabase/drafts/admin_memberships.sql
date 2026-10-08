-- DRAFT: not applied. Register with `supabase migration new admin_memberships`
-- after review, then validate against an isolated database before deployment.
begin;

create schema go_admin_private;
revoke all on schema go_admin_private from public, anon, authenticated, service_role;

create table public.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete restrict,
  level text not null check (level in ('owner', 'technical')),
  permissions text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_grants check (
    array_position(permissions, null) is null and
    ((level = 'owner' and permissions = '{}'::text[]) or
     (level = 'technical' and permissions @> array['admin.access']::text[] and
      permissions <@ array['admin.access','development','diagnostics','maintenance']::text[]))
  )
);
create unique index admin_single_owner on public.admin_memberships(level) where level = 'owner';

create table public.admin_membership_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  target_user_id uuid not null,
  action text not null check (action in ('grant','modify','revoke','delete')),
  previous_value jsonb,
  new_value jsonb,
  reason text not null,
  database_actor text not null,
  created_at timestamptz not null default now()
);
alter table public.admin_memberships enable row level security;
alter table public.admin_membership_audit enable row level security;
revoke all on public.admin_memberships, public.admin_membership_audit from public, anon, authenticated, service_role;
revoke all on sequence public.admin_membership_audit_id_seq from public, anon, authenticated, service_role;
grant select on public.admin_memberships to authenticated;
create policy admin_read_own_membership on public.admin_memberships for select to authenticated
  using (user_id = (select auth.uid()));

create function go_admin_private.audit_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  reason_value text := current_setting('go.admin_change_reason', true);
begin
  if reason_value is null or length(btrim(reason_value)) = 0 or length(reason_value) > 1000 then
    raise exception 'An authorized change reason is required' using errcode = '22023';
  end if;
  insert into public.admin_membership_audit
    (actor_user_id, target_user_id, action, previous_value, new_value, reason, database_actor)
  values (auth.uid(), coalesce(new.user_id, old.user_id),
    case when tg_op = 'DELETE' then 'delete' when tg_op = 'INSERT' then 'grant'
      when old.active and not new.active then 'revoke' else 'modify' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    btrim(reason_value), session_user);
  return null;
end;
$$;
revoke all on function go_admin_private.audit_membership() from public, anon, authenticated, service_role;
create trigger admin_membership_changes after insert or update or delete on public.admin_memberships
  for each row execute function go_admin_private.audit_membership();

-- Only a trusted database operator can bootstrap, with explicit owner approval.
-- No automatic call, public RPC, email matching or first-user election.
create function go_admin_private.bootstrap_owner(p_user_id uuid, p_reason text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(714082601);
  if exists (select 1 from public.admin_memberships where level = 'owner') then
    raise exception 'Owner already established' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null) then
    raise exception 'Verified identity required' using errcode = '22023';
  end if;
  perform pg_catalog.set_config('go.admin_change_reason', p_reason, true);
  insert into public.admin_memberships(user_id, level, permissions) values (p_user_id, 'owner', '{}');
end;
$$;
revoke all on function go_admin_private.bootstrap_owner(uuid, text) from public, anon, authenticated, service_role;

create function go_admin_private.set_membership(p_user_id uuid, p_permissions text[], p_active boolean, p_reason text)
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
    or not p_permissions <@ array['admin.access','development','diagnostics','maintenance']::text[] then
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

create function go_admin_private.list_memberships() returns setof public.admin_memberships
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.admin_memberships where user_id = auth.uid() and level = 'owner' and active) then
    raise exception 'Owner required' using errcode = '42501';
  end if;
  return query select * from public.admin_memberships order by created_at, user_id;
end;
$$;
create function go_admin_private.list_audit() returns setof public.admin_membership_audit
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.admin_memberships where user_id = auth.uid() and level = 'owner' and active) then
    raise exception 'Owner required' using errcode = '42501';
  end if;
  return query select * from public.admin_membership_audit order by id desc limit 200;
end;
$$;
-- Only thin SECURITY INVOKER wrappers are exposed through PostgREST.
create function public.admin_set_membership(p_user_id uuid, p_permissions text[], p_active boolean, p_reason text)
returns public.admin_memberships language sql security invoker set search_path = '' as $$
  select go_admin_private.set_membership(p_user_id, p_permissions, p_active, p_reason);
$$;
create function public.admin_list_memberships() returns setof public.admin_memberships
language sql security invoker set search_path = '' as $$
  select * from go_admin_private.list_memberships();
$$;
create function public.admin_list_audit() returns setof public.admin_membership_audit
language sql security invoker set search_path = '' as $$
  select * from go_admin_private.list_audit();
$$;
revoke all on function go_admin_private.set_membership(uuid,text[],boolean,text),
  go_admin_private.list_memberships(), go_admin_private.list_audit() from public, anon, authenticated, service_role;
grant usage on schema go_admin_private to authenticated;
grant execute on function go_admin_private.set_membership(uuid,text[],boolean,text),
  go_admin_private.list_memberships(), go_admin_private.list_audit() to authenticated;
revoke all on function public.admin_set_membership(uuid,text[],boolean,text),
  public.admin_list_memberships(), public.admin_list_audit() from public, anon, authenticated, service_role;
grant execute on function public.admin_set_membership(uuid,text[],boolean,text),
  public.admin_list_memberships(), public.admin_list_audit() to authenticated;

commit;
