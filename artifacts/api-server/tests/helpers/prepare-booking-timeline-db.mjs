import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';

const requireDatabase=createRequire(createRequire(import.meta.url).resolve('@workspace/db'));
const {Client}=requireDatabase('pg');
export function isolatedTimelineUrl(value=process.env.GO_BOOKING_TIMELINE_TEST_URL){
 assert.ok(value,'GO_BOOKING_TIMELINE_TEST_URL is an explicit opt-in; no environment/database fallback.');
 const url=new URL(value);
 assert.equal(url.protocol,'postgresql:');assert.equal(url.hostname,'127.0.0.1');
 assert.equal(url.username,'go_booking_test_owner');assert.equal(url.pathname,'/go_booking_timeline_test');
 assert.equal(process.env.GO_BOOKING_TEST_CONFIRM,'isolated');return url;
}
export async function connectTimelineDatabase(value){
 const url=isolatedTimelineUrl(value),db=new Client({connectionString:String(url)});await db.connect();
 try{
  const {rows:[row]}=await db.query("select current_user actor,current_database() name,current_setting('listen_addresses') host,current_setting('go.booking_test_environment',true) marker,pg_get_userbyid(datdba) owner from pg_database where datname=current_database()");
  assert.equal(row.actor,'go_booking_test_owner');assert.equal(row.owner,'go_booking_test_owner');
  assert.equal(row.name,'go_booking_timeline_test');assert.equal(row.host,'127.0.0.1');assert.equal(row.marker,'isolated');return db;
 }catch(error){await db.end();throw error;}
}
export async function prepareTimelineDatabase({rebuild=false,multiReference=process.env.GO_BOOKING_TIMELINE_MULTI_REFERENCE}={}){
 const db=await connectTimelineDatabase();
 try{
  const present=await db.query("select to_regclass('public.bookings') existing");
  if(!rebuild)assert.equal(present.rows[0].existing,null,'Refuse to overwrite an existing fixture schema; inspect it before reprovisioning.');
  const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../supabase');
  const names=(await readdir(path.join(base,'migrations'))).filter(name=>name.endsWith('.sql')).sort();
  // Read every input before mutating the dedicated database; missing drafts leave it empty.
  const scripts=await Promise.all([...names.map(name=>path.join(base,'migrations',name)),...(multiReference?[multiReference]:[]),...['booking_negotiation_v1.sql','booking_verification_v1.sql','booking_timeline_v1.sql'].map(name=>path.join(base,'drafts',name))].map(file=>readFile(file,'utf8')));
  // Rebuild is separately explicit and cannot escape the database/owner guard.
  if(rebuild)await db.query('drop schema if exists go_booking_timeline_private,go_booking_private,go_reservation_verification,go_reservation_negotiation,auth,public cascade;create schema public');
  await db.query('begin');
  await db.query(`create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
   create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
   grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const sql of scripts)await db.query(sql);
  await db.query('commit');
  const timelineSha256=createHash('sha256').update(scripts.at(-1)).digest('hex');
  await db.query("alter database go_booking_timeline_test set go.booking_timeline_test_draft_sha='"+timelineSha256+"'");
  return {migrations:names.length,drafts:multiReference?4:3,variant:multiReference?'Agent1 compatibility':'committed baseline',database:'go_booking_timeline_test',timelineSha256};
 }catch(error){await db.query('rollback');throw error;}finally{await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(await prepareTimelineDatabase({rebuild:process.argv.includes('--rebuild')}));
