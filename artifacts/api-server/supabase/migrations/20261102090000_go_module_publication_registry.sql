-- Phase 1: database authority for GO module publication.
-- This migration intentionally does not alter existing RLS policies or booking RPCs.
begin;

create schema if not exists go_module_publication_private;
revoke all on schema go_module_publication_private from public, anon, authenticated;

create table go_module_publication_private.current_policy (
  singleton boolean primary key default true check (singleton),
  version integer not null default 1 check (version = 1),
  audience text not null check (audience in ('pilot', 'general')),
  stages jsonb not null check (jsonb_typeof(stages) = 'object'),
  updated_at timestamptz not null default now()
);

-- Unknown modules resolve to development.  The seed therefore fails closed while
-- preserving the currently intended pilot access for Peluquerias.
insert into go_module_publication_private.current_policy(singleton, version, audience, stages)
values (true, 1, 'pilot',
  '{
    "reservas.belleza": "internal",
    "reservas.restauracion": "internal",
    "reservas.deportes": "internal",
    "reservas.salud": "internal",
    "reservas.actividades": "internal",
    "reservas.servicios": "internal",
    "reservas.hogar": "internal",
    "reservas.hoteles": "internal",
    "reservas.otros": "internal",
    "reservas.peluqueria": "pilot",
    "go.imprimir": "development"
  }'::jsonb
);

revoke all on go_module_publication_private.current_policy from public, anon, authenticated;

create function public.go_module_publication_stage(
  p_module_id text,
  p_parent_id text default null
) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  policy go_module_publication_private.current_policy;
  resolved text;
begin
  if p_module_id !~ '^(reservas\.[a-z0-9_]+|go\.imprimir)$'
    or (p_parent_id is not null and p_parent_id !~ '^reservas\.[a-z0-9_]+$') then
    return 'development';
  end if;

  select * into policy from go_module_publication_private.current_policy where singleton;
  if not found then return 'development'; end if;

  resolved := coalesce(policy.stages ->> p_module_id, policy.stages ->> p_parent_id, 'development');
  if resolved not in ('development', 'internal', 'pilot', 'public') then return 'development'; end if;
  return resolved;
end;
$$;

create function public.go_module_publication_allows_public(
  p_module_id text,
  p_parent_id text default null
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  policy go_module_publication_private.current_policy;
  stage text;
begin
  select * into policy from go_module_publication_private.current_policy where singleton;
  if not found then return false; end if;
  stage := public.go_module_publication_stage(p_module_id, p_parent_id);
  return stage = 'public' or (stage = 'pilot' and policy.audience = 'pilot');
end;
$$;

create function public.go_module_publication_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('version', version, 'audience', audience, 'stages', stages)
  from go_module_publication_private.current_policy
  where singleton
$$;

revoke all on function public.go_module_publication_stage(text,text),
  public.go_module_publication_allows_public(text,text),
  public.go_module_publication_contract() from public;
grant execute on function public.go_module_publication_stage(text,text),
  public.go_module_publication_allows_public(text,text),
  public.go_module_publication_contract() to anon, authenticated;

commit;
