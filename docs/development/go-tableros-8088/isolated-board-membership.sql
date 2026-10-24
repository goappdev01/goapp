-- Local 8088 adapter only. Never apply this view to hosted Supabase/production.
begin;
do $$ begin
  if current_database()<>'go_peluquerias_github_20261023' or inet_server_addr()<>'127.0.0.1'::inet
    or inet_server_port()<>65439 then raise exception 'Not the isolated development database'; end if;
  if to_regclass('public.admin_memberships') is not null then raise exception 'Preserve the existing membership relation'; end if;
end $$;
create view public.admin_memberships with (security_invoker=true,security_barrier=true) as
  select auth.uid() as user_id, 'technical'::text as level, array['admin.access']::text[] as permissions, true as active
  where auth.uid() is not null
    and coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'go_boards_scope'='ADMIN'
    and coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'iss'='http://127.0.0.1:65441/auth/v1';
revoke all on public.admin_memberships from public,anon,authenticated;
grant select on public.admin_memberships to authenticated;
commit;
