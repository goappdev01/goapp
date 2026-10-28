-- Existing 8088 identity/data bridge only. Never apply to hosted Supabase or production.
begin;
do $$ begin
 if current_database()<>'go_peluquerias_github_20261023' or inet_server_addr()<>'127.0.0.1'::inet or inet_server_port()<>65439 then
  raise exception 'Not the isolated development database'; end if;
 if not exists(select 1 from pg_class where oid=to_regclass('public.admin_memberships') and relkind='v')
  or position('go_boards_scope' in pg_get_viewdef('public.admin_memberships'::regclass,true))=0 then
  raise exception 'Preserve the existing membership authority'; end if;
end $$;
create or replace view public.admin_memberships with (security_invoker=true,security_barrier=true) as
 select auth.uid() as user_id,
   case when request.claims->>'go_finance_scope'='OWNER' then 'owner'::text else 'technical'::text end as level,
   array['admin.access']::text[] as permissions, true as active
 from (select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb as claims) request
 where auth.uid() is not null and request.claims->>'iss'='http://127.0.0.1:65441/auth/v1'
   and (request.claims->>'go_boards_scope'='ADMIN' or request.claims->>'go_finance_scope'='OWNER');
revoke all on public.admin_memberships from public,anon,authenticated;
grant select on public.admin_memberships to authenticated;
commit;
