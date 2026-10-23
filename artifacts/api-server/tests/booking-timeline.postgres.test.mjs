import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {randomUUID,randomBytes,createHmac,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {connectTimelineDatabase,isolatedTimelineUrl} from './helpers/prepare-booking-timeline-db.mjs';

const configured=process.env.GO_BOOKING_TIMELINE_TEST_URL;
const minute=value=>Date.parse(value)/60000;
const at=(time,date='2035-01-08')=>`${date}T${time}:00Z`;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function listen(server){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return server.address().port;}
async function freePort(){const s=createServer(),p=await listen(s);await new Promise(resolve=>s.close(resolve));return p;}
const work=(durationMinutes,extra={})=>({id:randomUUID(),name:'Work',durationMinutes,kind:'work',resources:[],...extra});
const wait=(durationMinutes,extra={})=>({id:randomUUID(),name:'Wait',durationMinutes,kind:'wait',resources:[],...extra});

test('REAL PostgreSQL + JWT PostgREST + Express phased booking timeline A–T (isolated only)',{skip:!configured},async t=>{
 const url=isolatedTimelineUrl(configured),db=await connectTimelineDatabase(String(url));
 const binary=process.env.GO_BOOKING_POSTGREST_BINARY;assert.ok(binary,'A real PostgREST executable is required.');
 const dir=await mkdtemp(path.join(tmpdir(),'go-booking-timeline-'));
 const saved={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY};
 let rest,gateway,server,logs='';const upstreamFailures=[];
 try{
  const routers=[];
  const draftHash=async()=>createHash('sha256').update(await readFile('supabase/drafts/booking_timeline_v1.sql')).digest('hex');
  const installedHash=(await db.query("select current_setting('go.booking_timeline_test_draft_sha',true) hash")).rows[0].hash;
  assert.equal(installedHash,await draftHash(),'The fixture must be rebuilt after changes to the SQL draft.');
  for(const name of ['bookingTimeline','bookingNegotiation']){
   const output=path.join(dir,name+'.mjs');
   await build({entryPoints:[`src/routes/${name}.ts`],outfile:output,bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
   routers.push((await import(pathToFileURL(output).href)).default);
  }
  const secret=randomBytes(48).toString('base64url'),restPort=await freePort(),authenticator=new URL(url);authenticator.username='go_test_authenticator';
  rest=spawn(binary,[],{windowsHide:true,env:{...process.env,PGRST_DB_URI:String(authenticator),PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(restPort),PGRST_LOG_LEVEL:'error',PGRST_DB_CHANNEL_ENABLED:'false',PGRST_DB_POOL:'8'}});
  rest.stderr.on('data',chunk=>{logs+=chunk;});rest.stdout.on('data',chunk=>{logs+=chunk;});
  const jwt=(uid,key=secret)=>{const text=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({role:'authenticated',sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return text+'.'+createHmac('sha256',key).update(text).digest('base64url');};
  gateway=createServer(async(req,res)=>{try{
   if(!req.url.startsWith('/rest/v1/')){res.writeHead(404).end();return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   const upstream=await fetch(`http://127.0.0.1:${restPort}`+req.url.slice('/rest/v1'.length),{method:req.method,headers:{'Content-Type':'application/json',...(req.headers.authorization?{Authorization:req.headers.authorization}:{})},...(body.length?{body}:{})});
   const text=await upstream.text();if(!upstream.ok)upstreamFailures.push(text);res.writeHead(upstream.status,{'Content-Type':'application/json'}).end(text);
  }catch{res.writeHead(502).end();}});
  const gatewayPort=await listen(gateway);process.env.SUPABASE_URL=`http://127.0.0.1:${gatewayPort}`;process.env.SUPABASE_PUBLISHABLE_KEY='isolated-test-public-key';
  const {default:express}=await import('express');const app=express();app.use(express.json());for(const router of routers)app.use('/supabase',router);
  server=createServer(app);const base=`http://127.0.0.1:${await listen(server)}/supabase`;
  for(let n=0;n<80;n++){try{if((await fetch(`http://127.0.0.1:${restPort}/`)).ok)break;}catch{}if(rest.exitCode!==null)throw Error(`PostgREST exited ${rest.exitCode}: ${logs}. On Windows its existing PostgreSQL DLL directory must be on the test process PATH.`);if(n===79)throw Error('PostgREST readiness failed: '+logs);await pause(100);}
  let ids;const fixtureDurations=new Map();
  const http=async(uid,route,{method='GET',body,token}={})=>{const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...((token??(uid?jwt(uid):null))?{Authorization:'Bearer '+(token??jwt(uid))}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await response.text();let value;try{value=JSON.parse(text);}catch{value={raw:text};}return {status:response.status,body:value,...(response.status>=400?{isolatedDiagnostic:upstreamFailures.at(-1)}:{})};};
  const reset=async()=>{
   assert.equal((await db.query("select current_setting('go.booking_test_environment') marker")).rows[0].marker,'isolated');
   await db.query('truncate public.bookings,public.availability,public.staff,public.services,public.businesses,auth.users cascade');
   fixtureDurations.clear();ids=Object.fromEntries(['customer','other','owner','foreignOwner','business','foreignBusiness','staff','otherStaff','resource'].map(key=>[key,randomUUID()]));
   for(const key of ['customer','other','owner','foreignOwner'])await db.query('insert into auth.users(id,email) values($1,$2)',[ids[key],key+'@example.invalid']);
   await db.query("insert into public.businesses(id,owner_id,name,address,timezone,verified,booking_enabled,ui_metadata) values($1,$2,'Timeline salon','Fictitious street','UTC',true,true,'{}'),($3,$4,'Other business','Other street','UTC',true,true,'{}')",[ids.business,ids.owner,ids.foreignBusiness,ids.foreignOwner]);
   await db.query("insert into public.staff(id,business_id,display_name) values($1,$2,'Ana'),($3,$2,'Luis')",[ids.staff,ids.business,ids.otherStaff]);
   await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone) select $1,d,'00:00','23:59','UTC' from generate_series(0,6) d",[ids.business]);
  };
  const service=async(duration=27,phases=null,name='Service')=>{const id=randomUUID();await db.query('insert into public.services(id,business_id,name,duration_minutes,price,currency,ui_metadata) values($1,$2,$3,$4,20,\'EUR\',$5)',[id,ids.business,name,duration,JSON.stringify(phases?{timing:{version:1,mode:'phases',phases,resourcesConfigured:true}}:{})]);fixtureDurations.set(id,duration);return id;};
  const list=async(serviceIds,from,to,{staff=ids.staff,customer=ids.customer,...extra}={})=>{
   // Server ranges contain the entire appointment. Extend by fixture duration,
   // then inspect only requested starts; SQL alone decides their availability.
   const end=new Date(Date.parse(to)+serviceIds.reduce((sum,id)=>sum+fixtureDurations.get(id),0)*60000).toISOString();
   const r=await http(customer,'/booking-availability?'+new URLSearchParams({business_id:ids.business,service_ids:serviceIds.join(','),...(staff?{staff_id:staff}:{}),from,to:end,...extra}));
   if(Array.isArray(r.body.slots))r.body.slots=r.body.slots.filter(slot=>minute(slot.startsAt)<minute(to));return r;
  };
  const create=async(serviceIds,start,{staff=ids.staff,customer=ids.customer,key=randomUUID(),...extra}={})=>{const r=await http(customer,'/bookings/timeline',{method:'POST',body:{business_id:ids.business,service_ids:serviceIds,starts_at:start,staff_id:staff,request_key:key,...extra}});if(Array.isArray(r.body)&&r.body.length===1)r.body=r.body[0];return r;};
  const created=async(...args)=>{const r=await create(...args);assert.ok([200,201].includes(r.status),JSON.stringify(r));assert.ok(r.body.id,JSON.stringify(r));return r.body;};
  const slots=r=>{assert.equal(r.status,200,JSON.stringify(r));assert.ok(Array.isArray(r.body.slots),JSON.stringify(r));return r.body.slots;};
  const present=(r,start)=>slots(r).find(p=>minute(p.startsAt)===minute(start));
  const booking=async id=>(await db.query('select * from public.bookings where id=$1',[id])).rows[0];
  const receipts=uid=>http(uid,'/bookings?negotiation=1');
  const phased=()=>[work(15),wait(30),work(30)];
  const resource=async(capacity=1)=>db.query('update public.businesses set ui_metadata=$1 where id=$2',[JSON.stringify({bookingResources:[{id:ids.resource,name:'Shared cabin',capacity,active:true}]}),ids.business]);
  const change=async(uid,id,operation,extra={})=>http(uid,`/bookings/${id}/change`,{method:'POST',body:{operation,requestId:randomUUID(),expectedRevision:0,acceptFinancialTerms:true,...extra}});
  const asUser=async(uid,sql,args=[])=>{const c=await connectTimelineDatabase(String(url));try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);const r=await c.query(sql,args);await c.query('commit');return r;}catch(error){await c.query('rollback');throw error;}finally{await c.end();}};
  const legacyBooking=async(s,start,end,{staff=ids.staff}={})=>{
   // Reproduce a row committed before the new trigger existed. This guarded
   // fixture connection alone suppresses triggers within this transaction.
   const id=randomUUID();await db.query('begin');try{await db.query('set local session_replication_role=replica');await db.query("insert into public.bookings(id,business_id,service_id,staff_id,customer_id,starts_at,ends_at,status) values($1,$2,$3,$4,$5,$6,$7,'CONFIRMED')",[id,ids.business,s,staff,ids.customer,start,end]);await db.query('commit');}catch(error){await db.query('rollback');throw error;}assert.equal((await booking(id)).timing_snapshot,null);return id;
  };

  await t.test('A: 27 minutes at 10:00 ends at 10:27, with the identical server plan in availability and creation',async()=>{
   await reset();const s=await service(),p=present(await list([s],at('10:00'),at('10:01')),at('10:00'));assert.ok(p);assert.equal(minute(p.endsAt)-minute(p.startsAt),27);
   const b=await created([s],at('10:00'));assert.deepEqual(b.timing_snapshot,p);assert.equal(minute(b.ends_at),minute(at('10:27')));
  });
  await t.test('B: a 13-minute appointment can start exactly at the preceding 10:27 boundary',async()=>{
   await reset();await created([await service(27)],at('10:00'));const s=await service(13),p=present(await list([s],at('10:27'),at('10:28')),at('10:27'));assert.ok(p);const b=await created([s],at('10:27'));assert.equal(minute(b.ends_at),minute(at('10:40')));
  });
  await t.test('C: free time at 11:37 offers 11:37 rather than a fixed grid',async()=>{
   await reset();await created([await service(37)],at('11:00'));const s=await service(13),r=await list([s],at('11:36'),at('11:39'));assert.equal(minute(slots(r)[0].startsAt),minute(at('11:37')));assert.ok(present(r,at('11:38')));
  });
  await t.test('visual 15-minute spacing retains the exact first free boundary and subsequent alternatives',async()=>{
   await reset();await created([await service(37)],at('11:00'));const s=await service(13),r=await list([s],at('11:30'),at('12:01'),{customer:ids.other,step_minutes:'15'});assert.ok(present(r,at('11:37')));assert.ok(present(r,at('11:45')));assert.ok(present(r,at('12:00')));assert.equal(present(r,at('11:38')),undefined);
  });
  await t.test('D: a continuous 45-minute service cannot fit a 38-minute gap',async()=>{
   await reset();await created([await service(22)],at('10:38'));const s=await service(45);assert.equal(present(await list([s],at('10:00'),at('10:01')),at('10:00')),undefined);assert.equal((await create([s],at('10:00'))).status,409);
  });
  await t.test('E: two professionals retain independent work availability',async()=>{
   await reset();const s=await service(27);await created([s],at('10:00'));assert.ok(present(await list([s],at('10:00'),at('10:01'),{staff:ids.otherStaff,customer:ids.other}),at('10:00')));await created([s],at('10:00'),{staff:ids.otherStaff,customer:ids.other});
  });
  await t.test('F: changing date recalculates occupancy without carrying yesterday’s exclusions',async()=>{
   await reset();const s=await service();await created([s],at('10:00'));assert.equal(slots(await list([s],at('10:00'),at('10:01'))).length,0);assert.ok(present(await list([s],at('10:00','2035-01-09'),at('10:01','2035-01-09')),at('10:00','2035-01-09')));
  });
  await t.test('G: changing service removes a start whose full duration no longer fits',async()=>{
   await reset();await db.query("update public.availability set start_time='10:00',end_time='10:38' where business_id=$1",[ids.business]);const small=await service(27),large=await service(45);assert.ok(present(await list([small],at('10:00'),at('10:01')),at('10:00')));assert.equal(slots(await list([large],at('10:00'),at('10:01'))).length,0);assert.equal((await create([large],at('10:00'))).status,422);
  });
  await t.test('H: simultaneous clients can commit only one conflicting creation; same-key retry returns that booking',async()=>{
   await reset();const s=await service(),key=randomUUID(),results=await Promise.all([create([s],at('10:00'),{key}),create([s],at('10:00'),{customer:ids.other})]);assert.equal(results.filter(r=>[200,201].includes(r.status)).length,1,JSON.stringify(results));assert.equal(results.filter(r=>r.status===409).length,1);assert.equal(Number((await db.query('select count(*) from public.bookings')).rows[0].count),1);
   const winner=results.find(r=>r.body.customer_id===ids.customer);if(winner)assert.equal((await create([s],at('10:00'),{key})).body.id,winner.body.id);
  });
  await t.test('I: cancellation releases the same appointment’s staff availability',async()=>{
   await reset();const s=await service(),b=await created([s],at('10:00'));assert.equal((await change(ids.customer,b.id,'cancel')).status,200);assert.ok(present(await list([s],at('10:00'),at('10:01')),at('10:00')));assert.equal((await booking(b.id)).status,'CANCELLED');
  });
  await t.test('J: old committed booking dates and absent timing snapshot survive unrelated reads and service edits',async()=>{
   await reset();const s=await service(60),id=await legacyBooking(s,at('10:03'),at('11:03')),before=await booking(id);await db.query('update public.services set duration_minutes=17 where id=$1',[s]);await list([s],at('12:00'),at('12:01'));await receipts(ids.customer);assert.deepEqual(await booking(id),before);
  });
  await t.test('K: 15 work + 30 wait + 30 work is one 75-minute client booking with 45 work minutes',async()=>{
   await reset();const s=await service(75,phased()),b=await created([s],at('11:00')),p=b.timing_snapshot;assert.equal(p.totalClientMinutes,75);assert.equal(p.workMinutes,45);assert.equal(p.waitMinutes,30);assert.equal(p.workIntervals.length,2);assert.equal(minute(p.workIntervals[1].startsAt),minute(at('11:45')));assert.equal(minute(b.ends_at),minute(at('12:15')));
  });
  await t.test('L: another 25-minute service fits entirely inside the professional’s wait',async()=>{
   await reset();await created([await service(75,phased())],at('11:00'));const s=await service(25);assert.ok(present(await list([s],at('11:15'),at('11:16'),{customer:ids.other}),at('11:15')));await created([s],at('11:15'),{customer:ids.other});
  });
  await t.test('M: a second service ending 11:50 conflicts with work resuming at 11:45',async()=>{
   await reset();await created([await service(75,phased())],at('11:00'));const s=await service(25);assert.equal(slots(await list([s],at('11:25'),at('11:26'),{customer:ids.other})).length,0);assert.equal((await create([s],at('11:25'),{customer:ids.other})).status,409);
  });
  await t.test('N: compatible client spans overlap while professional work intervals remain disjoint',async()=>{
   await reset();const a=await created([await service(75,phased())],at('11:00')),b=await created([await service(30,[work(10),wait(20)])],at('11:15'),{customer:ids.other});assert.ok(minute(a.starts_at)<minute(b.ends_at)&&minute(b.starts_at)<minute(a.ends_at));assert.equal(Number((await db.query('select count(*) from public.bookings')).rows[0].count),2);
  });
  await t.test('O: a resource retained for the full booking remains occupied throughout staff wait',async()=>{
   await reset();await resource();const demand={resourceId:ids.resource,quantity:1,occupancy:'booking'};await created([await service(75,[work(15,{resources:[demand]}),wait(30),work(30)])],at('11:00'));const s=await service(25,[work(25,{resources:[{...demand,occupancy:'phase'}]})]);assert.equal((await create([s],at('11:15'),{staff:ids.otherStaff,customer:ids.other})).status,409);
  });
  await t.test('P: the customer remains busy for all 75 minutes although the professional is released during wait',async()=>{
   await reset();await created([await service(75,phased())],at('11:00'));const s=await service(25);assert.equal(slots(await list([s],at('11:15'),at('11:16'),{staff:ids.otherStaff})).length,0);assert.equal((await create([s],at('11:15'),{staff:ids.otherStaff})).status,409);
  });
  await t.test('Q: availability, persisted booking and both calendar receipts expose the complete phase sequence',async()=>{
   await reset();const s=await service(75,phased()),p=present(await list([s],at('11:07'),at('11:08')),at('11:07')),b=await created([s],at('11:07'));assert.deepEqual(b.timing_snapshot,p);for(const uid of [ids.customer,ids.owner]){const r=await receipts(uid);assert.equal(r.status,200);const row=r.body.find(row=>row.id===b.id);assert.ok(row);assert.deepEqual(row.timing_snapshot,p);assert.equal(minute(row.ends_at)-minute(row.starts_at),75);}
  });
  await t.test('R: accepted modification moves resource occupation; cancellation releases the new interval',async()=>{
   await reset();await resource();const demand={resourceId:ids.resource,quantity:1,occupancy:'booking'},s=await service(75,[work(15,{resources:[demand]}),wait(30),work(30)]),b=await created([s],at('10:00'));
   const p=await change(ids.customer,b.id,'propose',{dateISO:'2035-01-08',time:'14:07'});assert.equal(p.status,200,JSON.stringify(p));assert.equal(minute((await booking(b.id)).starts_at),minute(at('10:00')));const a=await change(ids.owner,b.id,'accept',{expectedRevision:1,proposalId:p.body.change_proposal.id});assert.equal(a.status,200,JSON.stringify(a));assert.equal(minute(a.body.starts_at),minute(at('14:07')));assert.equal(a.body.timing_snapshot.phases.length,3);
   const other=await service(20,[work(20,{resources:[demand]})]);await created([other],at('10:00'),{staff:ids.otherStaff,customer:ids.other});assert.equal((await create([other],at('14:07'),{staff:ids.otherStaff,customer:ids.other})).status,409);assert.equal((await change(ids.customer,b.id,'cancel',{expectedRevision:2})).status,200);await created([other],at('14:07'),{staff:ids.otherStaff,customer:ids.other});
  });
  await t.test('S: a legacy service without timing remains continuous even after another phased service is configured',async()=>{
   await reset();const old=await service(75);await service(75,phased());const b=await created([old],at('11:00'));assert.equal(b.timing_snapshot.workMinutes,75);assert.equal(b.timing_snapshot.waitMinutes,0);assert.equal((await create([await service(25)],at('11:15'),{customer:ids.other})).status,409);
  });
  await t.test('T: combined services retain selection order and sequential phase dependencies in one booking',async()=>{
   await reset();const first=await service(27,null,'Cut'),second=await service(75,phased(),'Colour'),b=await created([first,second],at('10:00')),p=b.timing_snapshot;assert.deepEqual(p.serviceIds,[first,second]);assert.equal(p.totalClientMinutes,102);assert.equal(p.workMinutes,72);assert.equal(p.phases.length,4);assert.equal(p.phases[1].offsetMinutes,27);assert.equal(p.phases[2].offsetMinutes,42);assert.equal(p.phases[3].offsetMinutes,72);assert.equal(minute(b.ends_at),minute(at('11:42')));
  });
  await t.test('capacity counts peak simultaneous demand and release at exact boundaries',async()=>{
   await reset();await resource(2);const demand={resourceId:ids.resource,quantity:1,occupancy:'phase'},s=await service(20,[work(20,{resources:[demand]})]);await created([s],at('10:00'));await created([s],at('10:00'),{staff:ids.otherStaff,customer:ids.other});const third=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[third,'third@example.invalid']);const pro=randomUUID();await db.query("insert into public.staff(id,business_id,display_name) values($1,$2,'Third')",[pro,ids.business]);assert.equal((await create([s],at('10:00'),{staff:pro,customer:third})).status,409);await created([s],at('10:20'),{staff:pro,customer:third});
  });
  await t.test('resource peak checking catches a later start boundary inside an otherwise free candidate',async()=>{
   await reset();await resource(2);const demand={resourceId:ids.resource,quantity:1,occupancy:'phase'},small=await service(10,[work(10,{resources:[demand]})]);await created([small],at('10:10'));await created([small],at('10:10'),{staff:ids.otherStaff,customer:ids.other});const third=randomUUID(),pro=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[third,'peak@example.invalid']);await db.query("insert into public.staff(id,business_id,display_name) values($1,$2,'Peak professional')",[pro,ids.business]);const long=await service(30,[work(30,{resources:[demand]})]);assert.equal((await create([long],at('10:00'),{staff:pro,customer:third})).status,409);await created([small],at('10:20'),{staff:pro,customer:third});
  });
  await t.test('phase-only resources release during wait, while repeated whole-booking demands occupy one unit',async()=>{
   await reset();await resource();const demand={resourceId:ids.resource,quantity:1,occupancy:'phase'},a=await service(75,[work(15,{resources:[demand]}),wait(30),work(30,{resources:[demand]})]);await created([a],at('11:00'));await created([await service(25,[work(25,{resources:[demand]})])],at('11:15'),{staff:ids.otherStaff,customer:ids.other});
   await reset();await resource();const held={resourceId:ids.resource,quantity:1,occupancy:'booking'},s=await service(75,[work(15,{resources:[held]}),wait(30),work(30,{resources:[held]})]),b=await created([s],at('11:00'));assert.equal(b.timing_snapshot.resourceIntervals.length,1);assert.equal(b.timing_snapshot.resourceIntervals[0].quantity,1);
  });
  await t.test('active resource snapshots prevent deletion or capacity reduction until cancellation',async()=>{
   await reset();await resource(2);const held={resourceId:ids.resource,quantity:1,occupancy:'booking'},s=await service(75,[work(15,{resources:[held]}),wait(30),work(30)]),b=await created([s],at('11:00'));await assert.rejects(resource(1),error=>error.code==='PT409');await assert.rejects(db.query("update public.businesses set ui_metadata='{}' where id=$1",[ids.business]),error=>error.code==='PT409');assert.equal((await change(ids.customer,b.id,'cancel')).status,200);await resource(1);await db.query("update public.businesses set ui_metadata='{}' where id=$1",[ids.business]);assert.equal((await booking(b.id)).timing_snapshot.resourceIntervals[0].resourceId,ids.resource);
  });
  await t.test('unknown legacy resources block explicit resource bookings in either insertion order',async()=>{
   await reset();await resource();const s=await service(20,[work(20,{resources:[{resourceId:ids.resource,quantity:1,occupancy:'phase'}]})]),old=await service(20);await legacyBooking(old,at('10:00'),at('10:20'));assert.equal((await create([s],at('10:00'),{staff:ids.otherStaff,customer:ids.other})).status,409);
   await reset();await resource();const held=await service(20,[work(20,{resources:[{resourceId:ids.resource,quantity:1,occupancy:'phase'}]})]);await created([held],at('10:00'));assert.equal((await create([await service(20)],at('10:00'),{staff:ids.otherStaff,customer:ids.other})).status,409);
  });
  await t.test('a stale selected plan cannot silently change duration, phases or price; safe retry is idempotent',async()=>{
   for(const field of ['duration','phases','price']){
    await reset();const s=await service(27),p=present(await list([s],at('10:00'),at('10:01')),at('10:00')),key=randomUUID();assert.ok(p);
    if(field==='duration')await db.query('update public.services set duration_minutes=43 where id=$1',[s]);
    if(field==='price')await db.query('update public.services set price=99 where id=$1',[s]);
    if(field==='phases')await db.query('update public.services set ui_metadata=$1 where id=$2',[JSON.stringify({timing:{version:1,mode:'phases',resourcesConfigured:true,phases:[work(13),wait(14)]}}),s]);
    const stale=await create([s],at('10:00'),{key,expected_plan:p,ends_at:p.endsAt});assert.equal(stale.status,409,JSON.stringify(stale));assert.equal(stale.body.code,'BOOKING_SELECTION_STALE');assert.equal((await db.query('select count(*)::int n from public.bookings')).rows[0].n,0);
    const fresh=present(await list([s],at('10:00'),at('10:01')),at('10:00')),b=await created([s],at('10:00'),{key,expected_plan:fresh,ends_at:fresh.endsAt});await db.query('update public.services set price=101 where id=$1',[s]);const retry=await create([s],at('10:00'),{key,expected_plan:fresh,ends_at:fresh.endsAt});assert.equal(retry.body.id,b.id);assert.equal((await create([s],at('10:00'),{key,expected_plan:p})).status,409);
   }
  });
  await t.test('confirmed phase, price and resource snapshots survive catalogue edits and rescheduling',async()=>{
   await reset();await resource();const held={resourceId:ids.resource,quantity:1,occupancy:'booking'},s=await service(75,[work(15,{resources:[held]}),wait(30),work(30)]),b=await created([s],at('09:00')),before=b.timing_snapshot;
   await db.query("update public.services set name='Changed catalogue',duration_minutes=17,price=999,ui_metadata='{}' where id=$1",[s]);const p=await change(ids.customer,b.id,'propose',{dateISO:'2035-01-08',time:'13:17'});assert.equal(p.status,200,JSON.stringify(p));assert.deepEqual((await booking(b.id)).timing_snapshot,before);
   const a=await change(ids.owner,b.id,'accept',{expectedRevision:1,proposalId:p.body.change_proposal.id});assert.equal(a.status,200,JSON.stringify(a));const after=a.body.timing_snapshot;for(const key of ['totalClientMinutes','totalDurationMinutes','workMinutes','waitMinutes','serviceIds','serviceDetails','totalPrice','currency'])assert.deepEqual(after[key],before[key],key);assert.equal(after.phases.length,3);assert.equal(minute(after.phases[2].startsAt)-minute(after.startsAt),45);assert.equal(after.resourceIntervals[0].resourceId,ids.resource);
  });
  await t.test('accepted phase rescheduling revokes its old QR atomically without changing payment or completion state',async()=>{
   await reset();const s=await service(75,phased()),b=await created([s],at('10:00')),issued=(await asUser(ids.customer,"select public.go_verify_booking('issue',$1) result",[b.id])).rows[0].result;assert.ok(issued.qrPayload);const before=(await db.query('select version,token_hash from go_reservation_verification.rights where booking_id=$1',[b.id])).rows[0];assert.ok(before.token_hash);const p=await change(ids.customer,b.id,'propose',{dateISO:'2035-01-08',time:'14:07'});assert.equal(p.status,200);const a=await change(ids.owner,b.id,'accept',{expectedRevision:1,proposalId:p.body.change_proposal.id});assert.equal(a.status,200,JSON.stringify(a));const after=(await db.query('select version,token_hash,arrived_at from go_reservation_verification.rights where booking_id=$1',[b.id])).rows[0];assert.equal(after.token_hash,null);assert.equal(after.arrived_at,null);assert.ok(Number(after.version)>Number(before.version));assert.equal((await booking(b.id)).status,'CONFIRMED');const denied=(await asUser(ids.owner,"select public.go_verify_booking('preview',null,$1,$2) result",[ids.business,issued.qrPayload])).rows[0].result;assert.equal(denied.valid,undefined);assert.equal(denied.error,'VERIFICATION_INVALID');
  });
  await t.test('advanced timing requires an explicit resource decision and validates staff qualification for every service',async()=>{
   await reset();const s=await service(75,phased());await db.query("update public.services set ui_metadata=jsonb_set(ui_metadata,'{timing,resourcesConfigured}','false') where id=$1",[s]);const rejected=await create([s],at('10:00'));assert.equal(rejected.status,422);assert.equal(rejected.body.code,'BOOKING_RESOURCE_CONFIGURATION_REQUIRED');
   const first=await service(13),second=await service(27);await db.query('update public.staff set ui_metadata=$1 where id=$2',[JSON.stringify({serviceIds:[first]}),ids.staff]);assert.equal((await create([first,second],at('10:00'))).status,409);const any=await created([first,second],at('10:00'),{staff:null});assert.equal(any.staff_id,ids.otherStaff);
  });
  await t.test('explicit simple timing retains its professional and resource requirements; malformed simple phases fail closed',async()=>{
   await reset();await resource();const demand={resourceId:ids.resource,quantity:1,occupancy:'phase'},s=await service(27),phase=work(27,{staffId:ids.otherStaff,resources:[demand]});await db.query('update public.services set ui_metadata=$1 where id=$2',[JSON.stringify({timing:{version:1,mode:'simple',resourcesConfigured:true,phases:[phase]}}),s]);const b=await created([s],at('10:00'));assert.equal(b.staff_id,ids.otherStaff);assert.equal(b.timing_snapshot.resourceIntervals[0].resourceId,ids.resource);const second=await service(27,[work(27,{resources:[demand]})]);assert.equal((await create([second],at('10:00'),{customer:ids.other})).status,409);
   for(const phases of [[wait(27)],[work(13),work(14)],[work(28)]]){await db.query('update public.services set ui_metadata=$1 where id=$2',[JSON.stringify({timing:{version:1,mode:'simple',resourcesConfigured:true,phases}}),s]);const r=await create([s],at('12:00'));assert.equal(r.status,422,JSON.stringify(r));assert.equal(r.body.code,'BOOKING_INVALID_TIMING');}
  });
  await t.test('explicit phase staff handoffs survive canonical insertion and never silently reassign later work',async()=>{
   await reset();const s=await service(75,[work(15,{staffId:ids.otherStaff}),wait(30),work(30)]);await created([await service(30)],at('11:45'),{staff:ids.otherStaff,customer:ids.other});assert.ok(present(await list([s],at('11:00'),at('11:01'),{staff:null}),at('11:00')));const b=await created([s],at('11:00'),{staff:null});assert.equal(b.timing_snapshot.workIntervals[0].staffId,ids.otherStaff);assert.equal(b.timing_snapshot.workIntervals[1].staffId,ids.staff);assert.equal(b.staff_id,ids.otherStaff);
  });
  await t.test('availability pruning preserves an initial wait and an explicitly different first professional',async()=>{
   await reset();await created([await service(15)],at('11:00'),{customer:ids.other});const startsWithWait=await service(30,[wait(15),work(15)]);assert.ok(present(await list([startsWithWait],at('11:00'),at('11:01')),at('11:00')));const explicit=await service(15,[work(15,{staffId:ids.otherStaff})]);assert.ok(present(await list([explicit],at('11:00'),at('11:01')),at('11:00')));
  });
  await t.test('business/staff breaks and absences are checked against the required intervals',async()=>{
   await reset();const s=await service(27);await db.query('update public.staff set ui_metadata=$1 where id=$2',[JSON.stringify({bookingBlocks:[{startsAt:at('10:17'),endsAt:at('10:31')}]}),ids.staff]);assert.ok([409,422].includes((await create([s],at('10:00'))).status));await created([s],at('10:31'));await db.query('update public.businesses set ui_metadata=$1 where id=$2',[JSON.stringify({bookingBlocks:[{startsAt:at('13:00'),endsAt:at('14:00')}]}),ids.business]);assert.equal((await create([s],at('13:10'),{staff:ids.otherStaff,customer:ids.other})).status,422);
  });
  await t.test('split shifts require the whole client sequence to remain in an allowed company window',async()=>{
   await reset();await db.query('delete from public.availability where business_id=$1',[ids.business]);await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone) select $1,d,s,e,'UTC' from generate_series(0,6)d cross join(values('09:00'::time,'12:00'::time),('14:00'::time,'18:00'::time))v(s,e)",[ids.business]);const s=await service(75,phased());assert.equal((await create([s],at('11:30'))).status,422);await created([s],at('14:03'));
  });
  await t.test('overnight work includes prior-day windows and collisions across midnight',async()=>{
   await reset();await db.query("update public.availability set start_time='22:00',end_time='06:00',ui_metadata='{\"endNextDay\":true}' where business_id=$1",[ids.business]);const s=await service(75,phased()),b=await created([s],at('23:30'));assert.equal(minute(b.ends_at),minute(at('00:45','2035-01-09')));assert.equal((await create([await service(20)],at('00:30','2035-01-09'),{customer:ids.other})).status,409);await created([await service(20)],at('01:01','2035-01-09'),{customer:ids.other});
  });
  await t.test('Madrid DST uses elapsed minute instants and distinguishes both repeated local starts',async()=>{
   await reset();await db.query("update public.businesses set timezone='Europe/Madrid' where id=$1",[ids.business]);await db.query("update public.availability set timezone='Europe/Madrid' where business_id=$1",[ids.business]);const s=await service(75,phased()),spring=await created([s],'2035-03-25T01:30:00+01:00');assert.equal(minute(spring.ends_at)-minute(spring.starts_at),75);assert.equal(spring.timing_snapshot.timezone,'Europe/Madrid');
   const small=await service(13),first=await created([small],'2035-10-28T02:10:00+02:00'),second=await created([small],'2035-10-28T02:10:00+01:00');assert.equal(minute(second.starts_at)-minute(first.starts_at),60);assert.equal((await create([small],'2035-10-28T02:10:00')).status,400);
  });
  await t.test('double accept is idempotent, and competing bookings cannot accept the same work interval',async()=>{
   await reset();const s=await service(27),a=await created([s],at('09:00')),b=await created([s],at('15:00'),{customer:ids.other});const [pa,pb]=await Promise.all([change(ids.customer,a.id,'propose',{dateISO:'2035-01-08',time:'12:17'}),change(ids.other,b.id,'propose',{dateISO:'2035-01-08',time:'12:17'})]);assert.equal(pa.status,200);assert.equal(pb.status,200);
   const acceptA={requestId:randomUUID(),expectedRevision:1,proposalId:pa.body.change_proposal.id},acceptB={requestId:randomUUID(),expectedRevision:1,proposalId:pb.body.change_proposal.id};const results=await Promise.all([change(ids.owner,a.id,'accept',acceptA),change(ids.owner,b.id,'accept',acceptB)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const win=results.find(r=>r.status===200);assert.equal((await change(ids.owner,win.body.id,'accept',win.body.id===a.id?acceptA:acceptB)).status,200);
  });
  await t.test('caller JWT, ownership, snapshot forgery, cross-business services and private helpers fail closed',async()=>{
   await reset();const s=await service(),payload={business_id:ids.business,service_ids:[s],starts_at:at('10:00'),staff_id:ids.staff,request_key:randomUUID()};assert.equal((await http(null,'/bookings/timeline',{method:'POST',body:payload})).status,401);assert.equal((await http(ids.customer,'/bookings/timeline',{method:'POST',body:payload,token:jwt(ids.customer,'invalid-secret-long-enough-for-signing')})).status,401);assert.equal((await create([s],at('10:00'),{customer_id:ids.other})).status,403);assert.equal((await create([s],at('10:00'),{timing_snapshot:{workMinutes:0}})).status,400);
   const b=await created([s],at('10:00'));assert.equal((await change(ids.foreignOwner,b.id,'cancel')).status,404);assert.deepEqual((await receipts(ids.other)).body,[]);await assert.rejects(asUser(ids.customer,'update public.bookings set timing_snapshot=$1 where id=$2',['{}',b.id]),e=>e.code==='42501');await assert.rejects(asUser(ids.other,'select go_reservation_negotiation.receipt($1)',[b.id]),e=>e.code==='42501');
   const foreign=await service();await db.query('update public.services set business_id=$1 where id=$2',[ids.foreignBusiness,foreign]);assert.equal((await create([foreign],at('12:00'))).status,422);
   await assert.rejects(asUser(ids.other,'select go_booking_timeline_private.plan($1,$2,$3,$4,null,null,$5)',[ids.business,[s],at('12:00'),ids.staff,ids.customer]),e=>e.code==='42501');
   await assert.rejects(asUser(ids.other,'select go_booking_timeline_private.plan($1,$2,$3,$4,$5,$6,$7)',[ids.business,[s],at('12:00'),ids.staff,b.timing_snapshot,b.id,ids.other]),e=>e.code==='42501');
   await assert.rejects(asUser(ids.customer,'select go_booking_timeline_private.plan($1,$2,$3,$4,$5,$6,$7)',[ids.business,[s],at('12:00'),ids.staff,{...b.timing_snapshot,totalPrice:0},b.id,ids.customer]),e=>e.code==='42501');
   await assert.rejects(asUser(ids.customer,'select go_booking_timeline_private.plan($1,$2,$3,$4,$5,null,null)',[ids.business,[s],at('12:00'),ids.staff,b.timing_snapshot]),e=>e.code==='42501');
  });
  await t.test('a verified owner books for an existing customer through the same customer-conflict authority',async()=>{
   await reset();const s=await service(27),manual=await created([s],at('10:00'),{customer:ids.owner,customer_id:ids.customer});assert.equal(manual.customer_id,ids.customer);const r=await receipts(ids.customer);assert.ok(r.body.some(row=>row.id===manual.id));assert.equal((await create([s],at('10:00'),{staff:ids.otherStaff,customer:ids.owner,customer_id:ids.customer})).status,409);assert.equal((await create([s],at('12:00'),{customer:ids.foreignOwner,customer_id:ids.customer})).status,403);
  });
  await t.test('a pre-existing continuous wildcard reservation blocks every professional and remains cancellable',async()=>{
   await reset();const s=await service(75),id=await legacyBooking(s,at('11:00'),at('12:15'),{staff:null}),before=await booking(id);for(const staff of [ids.staff,ids.otherStaff])assert.equal((await create([await service(25)],at('11:15'),{staff,customer:ids.other})).status,409);assert.deepEqual(await booking(id),before);assert.equal((await change(ids.customer,id,'cancel')).status,200);assert.equal((await booking(id)).timing_snapshot,null);await created([await service(25)],at('11:15'),{customer:ids.other});
  });
  if(process.env.GO_BOOKING_TIMELINE_MULTI_REFERENCE)await t.test('Agent1-installed service snapshots stay compatible with timeline create, reload, negotiation and cancellation',async()=>{
   await reset();const a=await service(27,null,'Cut'),b=await service(75,phased(),'Colour'),r=await created([a,b],at('10:00')),old=await booking(r.id);assert.deepEqual(old.service_ids,[a,b]);assert.equal(old.service_details.length,2);assert.equal(old.total_duration_minutes,102);assert.equal(Number(old.total_price),40);assert.equal(old.currency,'EUR');
   await db.query('update public.services set duration_minutes=13,price=999 where business_id=$1',[ids.business]);const p=await change(ids.customer,r.id,'propose',{dateISO:'2035-01-09',time:'10:17'});assert.equal(p.status,200,JSON.stringify(p));const accepted=await change(ids.owner,r.id,'accept',{expectedRevision:1,proposalId:p.body.change_proposal.id});assert.equal(accepted.status,200,JSON.stringify(accepted));const persisted=await booking(r.id);for(const key of ['service_ids','service_details','total_duration_minutes','total_price','currency','request_key'])assert.deepEqual(persisted[key],old[key],key);assert.equal((await change(ids.customer,r.id,'cancel',{expectedRevision:2})).status,200);assert.equal((await booking(r.id)).timing_snapshot.phases.length,4);
   const oldA=await service(13),oldB=await service(27),args=[ids.business,[oldA,oldB],ids.staff,at('15:00'),at('15:40'),null,'CONFIRMED',randomUUID()];const legacyCreate=()=>asUser(ids.customer,'select public.go_create_service_booking($1,$2,$3,$4,$5,$6,$7,$8) booking',args);const initial=(await legacyCreate()).rows[0].booking,retry=(await legacyCreate()).rows[0].booking;assert.equal(initial.id,retry.id);assert.equal(initial.timing_snapshot.totalClientMinutes,40);assert.deepEqual(initial.service_ids,[oldA,oldB]);assert.equal(initial.timing_snapshot.phases.length,2);
   const legacySingle=await asUser(ids.customer,"insert into public.bookings(business_id,service_id,staff_id,customer_id,starts_at,ends_at,status) values($1,$2,$3,$4,$5,$6,'CONFIRMED') returning id,timing_snapshot",[ids.business,oldA,ids.staff,ids.customer,at('16:00'),at('16:13')]);assert.equal(legacySingle.rows[0].timing_snapshot.totalClientMinutes,13);
  });
  await t.test('the exercised SQL exactly matches the current review draft',async()=>assert.equal(await draftHash(),installedHash));
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));if(gateway)await new Promise(resolve=>gateway.close(resolve));
  if(rest){rest.kill();await new Promise(resolve=>rest.exitCode!==null?resolve():rest.once('exit',resolve));}
  await db.end();if(saved.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=saved.url;if(saved.key===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=saved.key;
  await rm(dir,{recursive:true,force:true});
 }
});
