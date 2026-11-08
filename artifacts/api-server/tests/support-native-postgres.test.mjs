import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
const run=promisify(execFile),bin=process.env.GO_SUPPORT_TEST_PG_BIN;
test('native isolated PostgreSQL preserves the thread after process restart and disables access without deleting data',{skip:!bin},async()=>{
 // Auth identities and Storage schemas below are synthetic. This is NOT a hosted backup or hosted E2E test.
 const dir=await mkdtemp(path.join(tmpdir(),'go-support-native-')),data=path.join(dir,'data');
 const exe=name=>path.join(bin,name+(process.platform==='win32'?'.exe':''));
 const command=(name,args)=>run(exe(name),args,{windowsHide:true,timeout:60000,maxBuffer:2e6});
 const listener=net.createServer();await new Promise(done=>listener.listen(0,'127.0.0.1',done));
 const port=listener.address().port;await new Promise(done=>listener.close(done));
 const sql=async text=>{const file=path.join(dir,'step.sql');await writeFile(file,text);
  return (await command('psql',['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1','-f',file])).stdout.trim();};
 const admin='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',third='33333333-3333-4333-8333-333333333333',business='44444444-4444-4444-8444-444444444444';
 const key=n=>'55555555-5555-4555-8555-'+String(n).padStart(12,'0');
 const as=async(actor,query)=>{const out=await sql("begin;set local role authenticated;select set_config('request.jwt.claim.sub','"+actor+"',true);"+query+";commit;");return JSON.parse(out.split(/\r?\n/).filter(line=>line.startsWith('{')||line.startsWith('[')).at(-1));};
 let started=false;
 try{
  await command('initdb',['-D',data,'-U','postgres','-A','trust','--locale=C','-E','UTF8']);
  const start=()=>command('pg_ctl',['-D',data,'-l',path.join(dir,'postgres.log'),'-w','-o','-h 127.0.0.1 -p '+port,'start']);
  await start();started=true;
  await sql("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);"+
   "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;"+
   "grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;"+
   "create table public.profiles(id uuid primary key,full_name text);create table public.businesses(id uuid primary key,owner_id uuid not null,verified boolean not null,name text);"+
   "create table public.admin_memberships(user_id uuid primary key,level text,active boolean);"+
   "create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);"+
   "create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));"+
   "alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;"+
   "insert into auth.users values('"+admin+"'),('"+user+"'),('"+third+"');insert into public.admin_memberships values('"+admin+"','owner',true);"+
   "insert into public.businesses values('"+business+"','"+user+"',true,'Synthetic business');");
  await sql(await readFile('supabase/drafts/go_support_v1.sql','utf8'));
  const tickets=[];
  for(const [index,kind] of ['incident','improvement','help'].entries()){
   const ticket=await as(user,"select public.go_support_create('"+kind+"','Synthetic "+kind+"','"+key(index+1)+"',"+(index===1?"'"+business+"'":"null")+")");
   assert.equal(ticket.status,'received');tickets.push(ticket);
   const again=await as(user,"select public.go_support_create('"+kind+"','Synthetic "+kind+"','"+key(index+1)+"',"+(index===1?"'"+business+"'":"null")+")");
   assert.equal(again.id,ticket.id);
  }
  assert.equal((await as(user,"select public.go_support_list(false,null,null,false,0,30,null,null,null,'personal',null)")).total,2);
  assert.equal((await as(user,"select public.go_support_list(false,null,null,false,0,30,null,null,null,'business','"+business+"')")).total,1);
  assert.equal((await as(admin,"select public.go_support_list(true)")).total,3);
  await assert.rejects(as(third,"select public.go_support_detail('"+tickets[0].id+"')"));
  await assert.rejects(as(third,"select public.go_support_list(false,null,null,false,0,30,null,null,null,'business','"+business+"')"));
  const noted=await as(admin,"select public.go_support_act('"+tickets[0].id+"','"+key(10)+"','internal_note','Synthetic private note',null,1)");
  const answered=await as(admin,"select public.go_support_act('"+tickets[0].id+"','"+key(11)+"','reply','Synthetic public reply',null,"+noted.revision+")");
  const own=await as(user,"select public.go_support_detail('"+answered.id+"')");
  assert.deepEqual(own.messages.map(m=>m.body),['Synthetic public reply']);
  await as(user,"select public.go_support_act('"+own.id+"','"+key(12)+"','reply','Synthetic follow-up',null,"+own.revision+")");
  await command('pg_ctl',['-D',data,'-w','-m','fast','stop']);started=false;await start();started=true;
  const recovered=await as(user,"select public.go_support_detail('"+own.id+"')");
  assert.deepEqual(recovered.messages.map(m=>m.body),['Synthetic public reply','Synthetic follow-up']);
  await sql(await readFile('supabase/drafts/go_support_disable.sql','utf8'));
  await assert.rejects(as(user,"select public.go_support_detail('"+own.id+"')"));
  assert.equal((await sql('select count(*) from public.go_support_requests')).split(/\r?\n/).at(-1),'3');
  assert.equal((await sql('select count(*) from public.go_support_messages')).split(/\r?\n/).at(-1),'3');
 }finally{if(started)await command('pg_ctl',['-D',data,'-w','-m','fast','stop']);}
});
