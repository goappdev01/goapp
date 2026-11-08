-- READ ONLY. Inventory only: this does not authorize or activate the migration.
begin read only;
select jsonb_build_object(
 'postgres_version',current_setting('server_version'),
 'roles',(select jsonb_agg(rolname order by rolname) from pg_roles where rolname in ('anon','authenticated')),
 'dependencies',(select jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name,'column',column_name,'type',data_type) order by table_schema,table_name,column_name)
  from information_schema.columns where
  (table_schema='auth' and table_name='users' and column_name='id') or
  (table_schema='public' and ((table_name='profiles' and column_name in ('id','full_name')) or
   (table_name='businesses' and column_name in ('id','owner_id','verified','name')) or
   (table_name='admin_memberships' and column_name in ('user_id','level','active')))) or
  (table_schema='storage' and table_name in ('buckets','objects'))),
 'support_tables',(select coalesce(jsonb_agg(schemaname||'.'||tablename),'[]'::jsonb) from pg_tables where schemaname='go_support_private' or tablename like 'go_support_%'),
 'support_functions',(select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl)),'[]'::jsonb)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'go_support_%'),
 'storage_policies',(select coalesce(jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',roles,'using',qual,'check',with_check)),'[]'::jsonb)
  from pg_policies where schemaname='storage' and tablename='objects'),
 'support_bucket',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'public',public,'limit',file_size_limit,'mime',allowed_mime_types)),'[]'::jsonb)
  from storage.buckets where id='go-support-private'),
 'support_objects',(select count(*) from storage.objects where bucket_id='go-support-private'),
 'extensions',(select jsonb_agg(jsonb_build_object('name',extname,'version',extversion)) from pg_extension where extname in ('pgcrypto','pg_cron','pg_net'))
) as support_preflight;
rollback;
