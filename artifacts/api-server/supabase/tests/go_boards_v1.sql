-- Run in a rollback-only isolated transaction after installing go_boards_v1.sql.
create function pg_temp.board_assert(ok boolean, message text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception '%',message; end if; end $$;
grant execute on function pg_temp.board_assert(boolean,text) to authenticated,anon;
insert into auth.users(id,email) values
 ('a1111111-1111-4111-8111-111111111111','board-admin-a@example.invalid'),
 ('b2222222-2222-4222-8222-222222222222','board-admin-b@example.invalid'),
 ('c3333333-3333-4333-8333-333333333333','board-user@example.invalid');
insert into public.admin_memberships(user_id,level,permissions,active) values
 ('a1111111-1111-4111-8111-111111111111','technical',array['admin.access'],true),
 ('b2222222-2222-4222-8222-222222222222','technical',array['admin.access'],true);
set local role authenticated;
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
select public.go_board_save(jsonb_build_object(
 'id','d4444444-4444-4444-8444-444444444444','ownerUserId',auth.uid(),'profile','ADMIN','name','Primero',
 'description','','archived',false,'position',1,'version',0,'columns',jsonb_build_array(jsonb_build_object('id','col1','title','Trabajo','archived',false)),
 'cards',jsonb_build_array(jsonb_build_object('columnId','col1','calendarLinked',true,'archived',false,'entry',jsonb_build_object(
 'id','stable-task','ownerUserId',auth.uid(),'taskContext','ADMIN','actionContext','ADMIN','kind','sent','type','TAREA','notes','Sin fecha','dateISO','','time','')))),0);
select pg_temp.board_assert((select version=1 from public.go_board_documents where id='d4444444-4444-4444-8444-444444444444'),'First revision');
do $$ begin
  for n in 1..50 loop
    perform public.go_board_save(jsonb_build_object('id',md5('go-board-test-'||n)::uuid,'ownerUserId',auth.uid(),
      'profile','ADMIN','name','Proyecto '||n,'description','','archived',false,'position',n+10,'version',0,
      'columns','[]'::jsonb,'cards','[]'::jsonb),0);
  end loop;
end $$;
select pg_temp.board_assert((select count(*)=51 from public.go_board_documents),'Fifty boards persist without an artificial limit');
do $$ begin
  perform public.go_board_save((select document from public.go_board_documents limit 1),0);
  raise exception 'A stale write succeeded';
exception when sqlstate 'PT409' then null; end $$;
select public.go_board_save(jsonb_build_object(
 'id','e5555555-5555-4555-8555-555555555555','ownerUserId',auth.uid(),'profile','ADMIN','name','Destino',
 'description','','archived',false,'position',2,'version',0,'columns',jsonb_build_array(jsonb_build_object('id','col2','title','Terminadas','archived',false)), 'cards','[]'::jsonb),0);
select public.go_board_move_task('d4444444-4444-4444-8444-444444444444','e5555555-5555-4555-8555-555555555555','stable-task','col2',1,1);
select pg_temp.board_assert((select jsonb_array_length(document->'cards')=0 from public.go_board_documents where id='d4444444-4444-4444-8444-444444444444'),'Source detached');
select pg_temp.board_assert((select document->'cards'->0->'entry'->>'id'='stable-task'
 and document->'cards'->0->'entry'->>'time'='' from public.go_board_documents where id='e5555555-5555-4555-8555-555555555555'),'Stable ID and no invented midnight');
select public.go_board_delete('e5555555-5555-4555-8555-555555555555',2);
select pg_temp.board_assert(exists(select 1 from (select public.go_board_calendar(0) d union all select public.go_board_calendar(30) d) pages where d->>'id'='e5555555-5555-4555-8555-555555555555'
 and d->'cards'->0->'entry'->>'id'='stable-task'),'Deleting a board retains the linked task for Calendar synchronization');
select set_config('go.boards_rpc','',true);
do $$ begin
  update public.go_board_documents set version=version+1 where id='d4444444-4444-4444-8444-444444444444';
  raise exception 'Direct write bypassed the board operation';
exception when insufficient_privilege then null; end $$;
do $$ begin
  delete from public.go_board_documents where id='d4444444-4444-4444-8444-444444444444';
  raise exception 'Direct delete bypassed task preservation';
exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claim.sub','b2222222-2222-4222-8222-222222222222',true);
select pg_temp.board_assert((select count(*)=0 from public.go_board_documents),'Other admin cannot read private boards');
do $$ begin
  perform public.go_board_save(jsonb_build_object('id','f6666666-6666-4666-8666-666666666666','ownerUserId','a1111111-1111-4111-8111-111111111111','profile','ADMIN'),0);
  raise exception 'Foreign owner accepted';
exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claim.sub','c3333333-3333-4333-8333-333333333333',true);
do $$ begin
  perform public.go_board_save(jsonb_build_object('id','f6666666-6666-4666-8666-666666666666','ownerUserId',auth.uid(),'profile','ADMIN'),0);
  raise exception 'Non-admin accepted';
exception when insufficient_privilege then null; end $$;
reset role;
update public.admin_memberships set active=false where user_id='a1111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
select pg_temp.board_assert((select count(*)=0 from public.go_board_documents),'Revoked admin denied by database');
reset role;
set local role anon;
do $$ begin
  perform * from public.go_board_documents;
  raise exception 'Anonymous read accepted';
exception when insufficient_privilege then null; end $$;
reset role;
select 'GO_BOARDS_SQL_SECURITY_OK';
