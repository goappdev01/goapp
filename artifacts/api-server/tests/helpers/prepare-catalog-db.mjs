import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const requireDb=createRequire(createRequire(import.meta.url).resolve('@workspace/db'));
export const {Client}=requireDb('pg');
export async function catalogDatabase(){
 assert.equal(process.env.GO_BOOKING_TEST_CONFIRM,'isolated');
 const url=new URL(process.env.GO_CATALOG_TEST_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'65439');
 assert.equal(url.protocol,'postgresql:');assert.equal(url.username,'go_booking_test_owner');assert.equal(url.pathname,'/go_catalog_association_test');
 const db=new Client({connectionString:String(url)});await db.connect();
 const {rows:[s]}=await db.query("select current_user actor,current_database() db,current_setting('listen_addresses') host,current_setting('go.booking_test_environment',true) marker");
 try{assert.equal(s.actor,'go_booking_test_owner');assert.equal(s.db,'go_catalog_association_test');assert.equal(s.host,'127.0.0.1');assert.equal(s.marker,'isolated');return db}catch(e){await db.end();throw e}
}
export async function prepareCatalogDatabase({rebuild=false}={}){
 const db=await catalogDatabase();
 try{
  const existing=(await db.query("select to_regclass('public.bookings') item")).rows[0].item;
  assert.ok(!existing||rebuild,'Existing fixture preserved. Rebuild must be explicit.');
  const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../supabase');
  const names=(await readdir(path.join(base,'migrations'))).filter(x=>x.endsWith('.sql')).sort();
  const files=[...names.map(x=>path.join(base,'migrations',x)),...(process.env.GO_CATALOG_MULTI_REFERENCE?[path.resolve(process.env.GO_CATALOG_MULTI_REFERENCE)]:[]),...['booking_negotiation_v1.sql','booking_verification_v1.sql','booking_timeline_v1.sql','catalog_associations_v1.sql'].map(x=>path.join(base,'drafts',x))];
  const sql=await Promise.all(files.map(x=>readFile(x,'utf8')));
  if(rebuild)await db.query('drop schema if exists go_catalog_private,go_booking_timeline_private,go_booking_private,go_reservation_verification,go_reservation_negotiation,auth,public cascade;create schema public');
  await db.query(`create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
   create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
   grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const s of sql)await db.query(s);
  const hash=createHash('sha256').update(sql.at(-1)).digest('hex');
  await db.query("alter database go_catalog_association_test set go.catalog_test_draft_sha='"+hash+"'");
  return {database:'go_catalog_association_test',catalogSha256:hash};
 }finally{await db.end()}
}
if(process.argv[1]&&import.meta.url===new URL('file:///'+path.resolve(process.argv[1]).replace(/\\/g,'/')).href)console.log(await prepareCatalogDatabase({rebuild:process.argv.includes('--rebuild')}));
