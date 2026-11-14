-- READ ONLY. Run against the intended Supabase project with an authorized
-- administrative connection, save the result privately, and compare it with
-- the reviewed migration set before planning any production DDL.
-- This does not inspect customer rows or expose credentials.

select current_database() as database_name, current_user as inspecting_role,
       current_setting('server_version') as postgres_version,
       to_regclass('supabase_migrations.schema_migrations') is not null as migration_history_present;

with required(schema_name, object_name) as (values
  ('public','businesses'), ('public','business_verification_requests'),
  ('public','business_settings'), ('public','services'), ('public','staff'),
  ('public','availability'), ('public','bookings'),
  ('go_booking_timeline_private','calendar_business_links'),
  ('go_booking_timeline_private','calendar_booking_sources')
)
select r.schema_name, r.object_name, c.oid is not null as present,
       c.relrowsecurity as row_security_enabled,
       c.relforcerowsecurity as row_security_forced
from required r
left join pg_catalog.pg_namespace n on n.nspname=r.schema_name
left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname=r.object_name
order by r.schema_name,r.object_name;

with required(schema_name, table_name, column_name) as (values
  ('public','businesses','id'), ('public','businesses','owner_id'),
  ('public','businesses','verified'), ('public','businesses','booking_enabled'),
  ('public','businesses','timezone'), ('public','business_settings','business_id'),
  ('public','services','business_id'), ('public','services','ui_metadata'),
  ('public','staff','business_id'), ('public','staff','ui_metadata'),
  ('public','availability','business_id'), ('public','availability','timezone'),
  ('public','bookings','business_id'), ('public','bookings','customer_id'),
  ('public','bookings','starts_at'), ('public','bookings','ends_at'),
  ('public','bookings','timing_snapshot'), ('public','bookings','change_revision')
)
select r.schema_name,r.table_name,r.column_name,a.attname is not null as present,
       pg_catalog.format_type(a.atttypid,a.atttypmod) as data_type
from required r
left join pg_catalog.pg_namespace n on n.nspname=r.schema_name
left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname=r.table_name
left join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attname=r.column_name
  and a.attnum>0 and not a.attisdropped
order by r.table_name,r.column_name;

with required(name) as (values
  ('submit_business_verification'), ('go_booking_availability'),
  ('go_create_timeline_booking'), ('go_booking_receipts'),
  ('go_negotiate_booking'), ('go_booking_calendar_business'),
  ('go_set_booking_calendar_timezone'), ('go_booking_gap_policy_version'),
  ('go_booking_phase_policy_version'), ('go_create_catalog_booking')
), roles as (
  select max(oid) filter (where rolname='anon') as anon_oid,
         max(oid) filter (where rolname='authenticated') as authenticated_oid
  from pg_catalog.pg_roles
)
select r.name,p.oid is not null as present,
       p.oid::regprocedure::text as signature,p.prosecdef as security_definer,
       p.proconfig as function_settings,
       case when p.oid is not null and roles.anon_oid is not null
         then pg_catalog.has_function_privilege(roles.anon_oid,p.oid,'EXECUTE') end as anon_can_execute,
       case when p.oid is not null and roles.authenticated_oid is not null
         then pg_catalog.has_function_privilege(roles.authenticated_oid,p.oid,'EXECUTE') end as authenticated_can_execute,
       case when p.oid is not null then md5(pg_catalog.pg_get_functiondef(p.oid)) end as definition_fingerprint
from required r
left join pg_catalog.pg_namespace n on n.nspname='public'
left join pg_catalog.pg_proc p on p.pronamespace=n.oid and p.proname=r.name
cross join roles
order by r.name,signature;

select n.nspname as schema_name,c.relname as table_name,con.conname,
       pg_catalog.pg_get_constraintdef(con.oid) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid=con.conrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('businesses','services','staff','availability','bookings')
order by c.relname,con.conname;
