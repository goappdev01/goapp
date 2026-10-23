// Opt-in fixture provisioning ONLY. Does not create databases, delete schemas,
// inspect .env, contact Supabase, or run against existing GO data.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
// Reuse pg from the existing @workspace/db dependency; no new package or lock change.
const requireDatabase=createRequire(createRequire(import.meta.url).resolve('@workspace/db'));
const {Client}=requireDatabase('pg');

assert.equal(process.env.GO_BOOKING_TEST_CONFIRM,'isolated','Explicit isolated-test confirmation required');
assert.ok(process.env.GO_BOOKING_TEST_URL,'GO_BOOKING_TEST_URL required; DATABASE_URL is never used');
const url=new URL(process.env.GO_BOOKING_TEST_URL);
assert.equal(url.protocol,'postgresql:');assert.equal(url.hostname,'127.0.0.1');
assert.match(url.pathname,/^\/go_booking_negotiation_test_(legacy|multi|scratch|qr_clean)$/);
const db=new Client({connectionString:String(url)});await db.connect();
try{
 const {rows:[state]}=await db.query("select current_setting('go.booking_test_environment',true) marker,current_user,current_setting('listen_addresses') host,exists(select from pg_namespace where nspname='auth') initialized");
 assert.equal(state.marker,'isolated');assert.equal(state.host,'127.0.0.1');assert.equal(state.current_user,'go_booking_test_owner');
 assert.equal(state.initialized,false,'Existing schema: stop without deleting or replacing anything');
 assert.equal((await db.query("select to_regclass('public.bookings') is null as empty")).rows[0].empty,true);
 const api=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 // Resolve every input before any DDL, so a missing multi-service draft cannot
 // leave a partially provisioned database.
 const migrationDir=path.join(api,'supabase/migrations');
 const initial=[];for(const name of (await readdir(migrationDir)).filter(n=>n.endsWith('.sql')).sort())initial.push([name,await readFile(path.join(migrationDir,name),'utf8')]);
 let multi;
 if(url.pathname.endsWith('_multi')){
   assert.ok(process.env.GO_BOOKING_TEST_MULTI_SQL,'Provide the separately reviewed multi-service draft explicitly');
   multi=await readFile(process.env.GO_BOOKING_TEST_MULTI_SQL,'utf8');
 }
 const negotiation=await readFile(path.join(api,'supabase/drafts/booking_negotiation_v1.sql'),'utf8');
 await db.query(`do $$ begin
   if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
   if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
   if not exists(select from pg_roles where rolname='go_test_authenticator') then create role go_test_authenticator login noinherit; end if;
 end $$; grant anon,authenticated to go_test_authenticator;
 create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 grant usage on schema auth to anon,authenticated;
 grant execute on function auth.uid() to anon,authenticated;
 grant usage on schema public to anon,authenticated;`);
 for(const [name,sql] of initial){await db.query(sql);console.log('Fixture prerequisite: '+name);}
 if(multi){await db.query(multi);console.log('Multi-service reference SHA256: '+createHash('sha256').update(multi).digest('hex'));}
 await db.query(negotiation);
 await db.query(await readFile(path.join(api,'supabase/drafts/booking_verification_v1.sql'),'utf8'));
 console.log('Shared booking verification draft installed only in isolated test fixture.');
 console.log('Isolated test database prepared. Negotiation draft SHA256: '+createHash('sha256').update(negotiation).digest('hex'));
}finally{await db.end();}
