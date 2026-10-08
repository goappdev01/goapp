-- NOT EXECUTED. Isolated Supabase database only, after applying the draft.
-- A trusted operator must explicitly SET go.admin_test_environment = 'isolated'
-- in this connection first. No production identities or credentials are used.
-- Run with stop-on-error; all fixture writes are rolled back.
begin;
do $$ begin
  if current_setting('go.admin_test_environment', true) is distinct from 'isolated' then
    raise exception 'Isolated database opt-in required';
  end if;
  if exists (select 1 from public.admin_memberships) then
    raise exception 'Test requires empty isolated admin tables';
  end if;
end $$;

select set_config('go.test_owner', gen_random_uuid()::text, true);
select set_config('go.test_technical', gen_random_uuid()::text, true);
select set_config('go.test_normal', gen_random_uuid()::text, true);
insert into auth.users(id, email_confirmed_at) values
  (current_setting('go.test_owner')::uuid, now()),
  (current_setting('go.test_technical')::uuid, now()),
  (current_setting('go.test_normal')::uuid, now());

-- Public identity cannot elect itself as the first owner or grant permissions.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('go.test_normal'), true);
do $$ begin
  begin
    perform go_admin_private.bootstrap_owner(auth.uid(), 'unauthorized bootstrap');
    raise exception 'Unexpected public bootstrap';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_set_membership(auth.uid(), array['admin.access'], true, 'unauthorized grant');
    raise exception 'Unexpected public grant';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.admin_memberships(user_id,level,permissions)
      values (auth.uid(), 'owner', '{}');
    raise exception 'Unexpected direct write';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true);
select go_admin_private.bootstrap_owner(current_setting('go.test_owner')::uuid, 'isolated test owner approval');

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('go.test_owner'), true);
select public.admin_set_membership(current_setting('go.test_technical')::uuid,
  array['admin.access','diagnostics'], true, 'isolated technical grant');
do $$ begin
  begin
    perform public.admin_set_membership(auth.uid(), array['admin.access'], false, 'try owner revoke');
    raise exception 'Unexpected owner modification';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', current_setting('go.test_technical'), true);
do $$ begin
  if (select count(*) from public.admin_memberships) <> 1 then
    raise exception 'RLS disclosed another membership';
  end if;
  begin
    perform public.admin_set_membership(current_setting('go.test_owner')::uuid,
      array['admin.access'], false, 'technical cannot revoke owner');
    raise exception 'Unexpected technical management';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_list_memberships();
    raise exception 'Unexpected membership listing';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_list_audit();
    raise exception 'Unexpected audit listing';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', current_setting('go.test_owner'), true);
select public.admin_set_membership(current_setting('go.test_technical')::uuid,
  array['admin.access','diagnostics'], false, 'isolated technical revocation');
do $$ begin
  if (select count(*) from public.admin_list_audit()) <> 3 then
    raise exception 'Grant/revocation audit missing';
  end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('go.test_technical'), true);
do $$ begin
  if exists (select 1 from public.admin_memberships where user_id = auth.uid() and active) then
    raise exception 'Revocation did not take effect';
  end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('go.test_normal'), true);
do $$ begin
  if exists (select 1 from public.admin_memberships) then
    raise exception 'Normal identity can read memberships';
  end if;
end $$;
reset role;
rollback;
