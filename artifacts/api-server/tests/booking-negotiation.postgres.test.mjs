import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
// Reuse pg from the existing @workspace/db dependency; no new package or lock change.
const requireDatabase=createRequire(createRequire(import.meta.url).resolve('@workspace/db'));
const {Client}=requireDatabase('pg');
import {build} from 'esbuild';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

// Explicit opt-in only; never inspect .env or fall back to DATABASE_URL.
const configured=process.env.GO_BOOKING_TEST_URL;
function safeUrl(value){
 const url=new URL(value);
 assert.equal(url.protocol,'postgresql:'); assert.equal(url.hostname,'127.0.0.1');
 assert.match(url.pathname,/^\/go_booking_negotiation_test_(legacy|multi)$/);
 assert.equal(process.env.GO_BOOKING_TEST_CONFIRM,'isolated');return url;
}
async function connect(url){const db=new Client({connectionString:String(url)});await db.connect();
 const mark=await db.query("select current_setting('go.booking_test_environment',true) marker,current_database() name,current_setting('listen_addresses') host");
 assert.equal(mark.rows[0].marker,'isolated');assert.match(mark.rows[0].name,/^go_booking_negotiation_test_(legacy|multi)$/);assert.equal(mark.rows[0].host,'127.0.0.1');return db;}
async function listen(server){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return server.address().port;}
async function port(){const server=createServer();const value=await listen(server);await new Promise(resolve=>server.close(resolve));return value;}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const savedEnv={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY};

test('REAL PostgreSQL + JWT PostgREST + Express booking negotiation (isolated only)',{skip:!configured},async t=>{
 const parsed=safeUrl(configured);const binary=process.env.GO_BOOKING_POSTGREST_BINARY;
 assert.ok(binary,'A real PostgREST executable is required; do not substitute mocks.');
 const dir=await mkdtemp(path.join(tmpdir(),'go-booking-negotiation-'));
 const output=path.join(dir,'router.mjs');
 await build({entryPoints:['src/routes/bookingNegotiation.ts'],outfile:output,bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
 const verifyOutput=path.join(dir,'verification-router.mjs');
 await build({entryPoints:['src/routes/bookingVerification.ts'],outfile:verifyOutput,bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
 const {default:verificationRouter}=await import(pathToFileURL(verifyOutput).href);
 const {default:router}=await import(pathToFileURL(output).href);const {default:express}=await import('express');
 try{for(const variant of ['legacy','multi'])await t.test(variant,async suite=>{
  const url=new URL(parsed);url.pathname='/go_booking_negotiation_test_'+variant;
  const db=await connect(url);
  await db.query(`alter table public.bookings add column if not exists test_payment_fixture jsonb not null default '{"paid":25,"reference":"fictitious-private-payment"}'`);
  const secret=randomBytes(48).toString('base64url');
  const restPort=await port();const authenticator=new URL(url);authenticator.username='go_test_authenticator';
  let dropRpcReply=false;
  let logs='';const rest=spawn(binary,[],{windowsHide:true,env:{...process.env,PGRST_DB_URI:String(authenticator),PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(restPort),PGRST_LOG_LEVEL:'error',PGRST_DB_CHANNEL_ENABLED:'false',PGRST_DB_POOL:'5'}});
  rest.stderr.on('data',chunk=>{logs+=chunk;});rest.stdout.on('data',chunk=>{logs+=chunk;});
  const jwt=(uid,alterSecret=secret)=>{const data=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({role:'authenticated',sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return data+'.'+createHmac('sha256',alterSecret).update(data).digest('base64url');};
  const gateway=createServer(async(req,res)=>{try{
    if(!req.url.startsWith('/rest/v1/')){res.writeHead(404).end();return;}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks);const headers={'Content-Type':'application/json'};
    if(req.headers.authorization)headers.Authorization=req.headers.authorization;
    const upstream=await fetch('http://127.0.0.1:'+restPort+req.url.slice('/rest/v1'.length),{method:req.method,headers,...(body.length?{body}:{})});
    const text=await upstream.text();
    if(dropRpcReply && req.url.includes('/rpc/go_negotiate_booking') && upstream.ok){dropRpcReply=false;res.destroy();return;}
    res.writeHead(upstream.status,{'Content-Type':'application/json'}).end(text);
  }catch{res.writeHead(502).end();}});
  const gatewayPort=await listen(gateway);
  process.env.SUPABASE_URL='http://127.0.0.1:'+gatewayPort;process.env.SUPABASE_PUBLISHABLE_KEY='isolated-test-publishable-key';
  const app=express();app.use(express.json());app.use("/supabase",verificationRouter);app.use(verificationRouter);app.use("/supabase",router);app.use(router);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  let ids;
  const instant=(hour,day=0)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+14+day);d.setUTCHours(hour,0,0,0);return d.toISOString();};
  const invoke=async(uid,command,booking=ids.booking)=>{const response=await fetch(base+'/bookings/'+booking+'/change',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt(uid)},body:JSON.stringify(command)});return {status:response.status,body:await response.json()};};
  const command=(operation,extra={})=>({operation,requestId:randomUUID(),expectedRevision:0,...extra});
  const propose=(extra={})=>command('propose',{dateISO:instant(11).slice(0,10),time:'11:00',acceptFinancialTerms:true,...extra});
  const row=async()=> (await db.query('select * from public.bookings where id=$1',[ids.booking])).rows[0];
  const asUser=async(uid,sql,parameters=[])=>{const connection=await connect(url);try{
   await connection.query('begin');await connection.query('set local role authenticated');
   await connection.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);
   const value=await connection.query(sql,parameters);await connection.query('commit');return value;
  }catch(error){await connection.query('rollback');throw error;}finally{await connection.end();}};
  const reset=async()=>{
    assert.equal((await db.query("select current_setting('go.booking_test_environment') marker")).rows[0].marker,'isolated');
    await db.query('truncate go_reservation_negotiation.requests,public.bookings,public.availability,public.staff,public.services,public.businesses,auth.users cascade');
    ids=Object.fromEntries(['customer','other','owner','foreignOwner','business','foreignBusiness','service','extraService','staff','otherStaff','booking'].map(key=>[key,randomUUID()]));
    for(const user of ['customer','other','owner','foreignOwner'])await db.query('insert into auth.users(id,email) values($1,$2)',[ids[user],user+'@example.invalid']);
    await db.query("insert into public.businesses(id,owner_id,name,address,timezone,verified,booking_enabled) values($1,$2,'Test salon','Test street','UTC',true,true),($3,$4,'Other salon','Other street','UTC',true,true)",[ids.business,ids.owner,ids.foreignBusiness,ids.foreignOwner]);
    await db.query("insert into public.services(id,business_id,name,duration_minutes,price,currency) values($1,$2,'Cut',60,20,'EUR'),($3,$2,'Wash',30,10,'EUR')",[ids.service,ids.business,ids.extraService]);
    await db.query("insert into public.staff(id,business_id,display_name) values($1,$2,'Test professional'),($3,$2,'Other professional')",[ids.staff,ids.business,ids.otherStaff]);
    await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone) select $1,d,'00:00','23:59','UTC' from generate_series(0,6) d",[ids.business]);
    await db.query("insert into public.bookings(id,business_id,service_id,staff_id,customer_id,starts_at,ends_at,status,notes) values($1,$2,$3,$4,$5,$6,$7,'CONFIRMED','Original notes')",[ids.booking,ids.business,ids.service,ids.staff,ids.customer,instant(9),instant(10)]);
  };
  try{
   for(let n=0;n<80;n++){try{const r=await fetch('http://127.0.0.1:'+restPort+'/');if(r.status===200)break;}catch{}if(rest.exitCode!==null)throw Error(logs);if(n===79)throw Error('PostgREST did not become ready: '+logs);await pause(100);}
   await suite.test('proposal keeps original; other participant accepts once; receipts survive fresh connections',async()=>{
    await reset();const original=await row(),request=propose();const proposed=await invoke(ids.customer,request);assert.equal(proposed.status,200,JSON.stringify(proposed.body));
    assert.equal(Date.parse(proposed.body.starts_at),Date.parse(original.starts_at));assert.equal(proposed.body.change_revision,1);assert.equal(proposed.body.status,'CONFIRMED');
    const proposalId=proposed.body.change_proposal.id;
    assert.equal((await invoke(ids.customer,command('accept',{expectedRevision:1,proposalId,acceptFinancialTerms:true}))).status,403);
    const accept=command('accept',{expectedRevision:1,proposalId,acceptFinancialTerms:true});const accepted=await invoke(ids.owner,accept);assert.equal(accepted.status,200,JSON.stringify(accepted.body));
    assert.equal(Date.parse(accepted.body.starts_at),Date.parse(instant(11)));assert.equal(accepted.body.change_proposal,null);assert.equal(accepted.body.change_history.length,1);assert.equal(accepted.body.notes,original.notes);assert.equal(accepted.body.test_payment_fixture,undefined);assert.deepEqual((await row()).test_payment_fixture,original.test_payment_fixture);
    assert.equal((await invoke(ids.owner,accept)).status,200);assert.equal((await row()).change_history.length,1);
    assert.equal(Number((await db.query('select count(*) from public.bookings')).rows[0].count),1);
    for(const identity of [ids.customer,ids.owner]){
      const r=await fetch(base+'/bookings?negotiation=1',{headers:{Authorization:'Bearer '+jwt(identity)}});assert.equal(r.status,200);
      const rows=await r.json();assert.equal(rows.length,1);assert.equal(rows[0].id,ids.booking);assert.equal(Date.parse(rows[0].starts_at),Date.parse(instant(11)));assert.equal(rows[0].business_name,'Test salon');
    }
    const fresh=await asUser(ids.customer,'select starts_at,change_history from public.bookings where id=$1',[ids.booking]);assert.equal(fresh.rows[0].change_history.length,1);
   });
   await suite.test('a lost HTTP response after COMMIT is recoverable with the same command, without another proposal',async()=>{
    await reset();const action=propose();dropRpcReply=true;
    const lost=await invoke(ids.customer,action);assert.equal(lost.status,503);assert.equal((await row()).change_revision,'1');
    const recovered=await invoke(ids.customer,action);assert.equal(recovered.status,200);assert.equal(recovered.body.change_revision,1);assert.equal(recovered.body.change_proposal.id,action.requestId);
    assert.equal(Number((await db.query('select count(*) from go_reservation_negotiation.requests')).rows[0].count),1);
   });
   await suite.test('rejection preserves schedule and history; counterproposal needs the other side',async()=>{
    await reset();let r=await invoke(ids.customer,propose());let id=r.body.change_proposal.id;
    r=await invoke(ids.owner,command('reject',{expectedRevision:1,proposalId:id}));assert.equal(r.status,200);assert.equal(r.body.change_history[0].outcome,'rejected');assert.equal(Date.parse(r.body.starts_at),Date.parse(instant(9)));
    r=await invoke(ids.customer,propose({expectedRevision:2}));id=r.body.change_proposal.id;
    r=await invoke(ids.owner,propose({operation:'counter',expectedRevision:3,proposalId:id,time:'12:00'}));assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.change_history.length,2);assert.equal(r.body.change_proposal.proposedBy,'business');assert.equal(Date.parse(r.body.starts_at),Date.parse(instant(9)));
    r=await invoke(ids.customer,command('accept',{expectedRevision:4,proposalId:r.body.change_proposal.id,acceptFinancialTerms:true}));assert.equal(r.status,200);assert.equal(Date.parse(r.body.starts_at),Date.parse(instant(12)));assert.equal(r.body.change_history.at(-1).actor,'customer');
   });
   await suite.test('scope, JWT, direct column privileges, private helpers and forged payload are protected',async()=>{
    await reset();assert.equal((await invoke(ids.other,propose())).status,404);assert.equal((await invoke(ids.foreignOwner,propose())).status,404);
    const noAuth=await fetch(base+'/bookings/'+ids.booking+'/change',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(propose())});assert.equal(noAuth.status,401);
    const forged=await fetch(base+'/bookings/'+ids.booking+'/change',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt(ids.customer,'wrong-test-secret-that-is-long-enough')},body:JSON.stringify(propose())});assert.equal(forged.status,401);
    assert.equal((await invoke(ids.customer,propose({customer_id:ids.owner}))).status,400);
    await assert.rejects(asUser(ids.customer,'update public.bookings set starts_at=$1 where id=$2',[instant(15),ids.booking]),e=>e.code==='42501');
    await assert.rejects(asUser(ids.owner,'update public.bookings set change_proposal=$1 where id=$2',['{}',ids.booking]),e=>e.code==='42501');
    await assert.rejects(asUser(ids.other,'select go_reservation_negotiation.receipt($1)',[ids.booking]),e=>e.code==='42501');
    assert.equal((await asUser(ids.other,'select id from public.bookings')).rowCount,0);
    const unauthorized=await fetch(base+'/bookings?negotiation=1',{headers:{Authorization:'Bearer '+jwt(ids.foreignOwner)}});assert.deepEqual(await unauthorized.json(),[]);
   });
   await suite.test('revoked owner loses access; a new owner cannot accept a proposal from their own business side',async()=>{
    await reset();const p=await invoke(ids.owner,propose());assert.equal(p.status,200);assert.equal(p.body.change_proposal.proposedBy,'business');
    await db.query('update public.businesses set owner_id=$1 where id=$2',[ids.foreignOwner,ids.business]);
    const decision=command('accept',{expectedRevision:1,proposalId:p.body.change_proposal.id,acceptFinancialTerms:true});
    assert.equal((await invoke(ids.owner,decision)).status,404);
    assert.equal((await invoke(ids.foreignOwner,decision)).status,403);
    const old=await fetch(base+'/bookings?negotiation=1',{headers:{Authorization:'Bearer '+jwt(ids.owner)}});assert.deepEqual(await old.json(),[]);
    assert.equal((await invoke(ids.customer,decision)).status,200);
   });
   await suite.test('financial consent is explicit and no prices, payment fixtures or snapshots change',async()=>{
    await reset();const before=await db.query('select price from public.services order by id');
    assert.equal((await invoke(ids.customer,propose({acceptFinancialTerms:false}))).status,422);
    const p=await invoke(ids.customer,propose());assert.equal((await invoke(ids.owner,command('accept',{expectedRevision:1,proposalId:p.body.change_proposal.id}))).status,422);
    assert.equal((await row()).change_revision,'1');assert.deepEqual((await row()).test_payment_fixture,{paid:25,reference:'fictitious-private-payment'});
    assert.deepEqual((await db.query('select price from public.services order by id')).rows,before.rows);
   });
   await suite.test('acceptance rechecks hidden conflicts and keeps proposal on rollback',async()=>{
    await reset();const p=await invoke(ids.customer,propose());assert.equal(p.status,200);
    await asUser(ids.other,"insert into public.bookings(business_id,service_id,staff_id,customer_id,starts_at,ends_at,status) values($1,$2,$3,$4,$5,$6,'CONFIRMED')",[ids.business,ids.service,ids.staff,ids.other,instant(11),instant(12)]);
    const r=await invoke(ids.owner,command('accept',{expectedRevision:1,proposalId:p.body.change_proposal.id,acceptFinancialTerms:true}));assert.equal(r.status,409);assert.equal(r.body.code,'BOOKING_CONFLICT');
    const current=await row();assert.equal(Date.parse(current.starts_at),Date.parse(instant(9)));assert.equal(current.change_proposal.id,p.body.change_proposal.id);assert.equal(current.change_history.length,0);
   });
   await suite.test('availability, duration, inactive services and professional eligibility are revalidated',async()=>{
    await reset();assert.equal((await invoke(ids.customer,propose({time:'23:30'}))).status,422);
    const p=await invoke(ids.customer,propose());await db.query('update public.services set active=false where id=$1',[ids.service]);
    const a=await invoke(ids.owner,command('accept',{expectedRevision:1,proposalId:p.body.change_proposal.id,acceptFinancialTerms:true}));assert.equal(a.status,422);assert.equal((await row()).change_history.length,0);
    await db.query('update public.services set active=true where id=$1',[ids.service]);await db.query('update public.staff set ui_metadata=$1 where id=$2',[JSON.stringify({serviceIds:[ids.extraService]}),ids.staff]);
    assert.equal((await invoke(ids.owner,command('accept',{expectedRevision:1,proposalId:p.body.change_proposal.id,acceptFinancialTerms:true}))).status,422);
   });
   await suite.test('two accepts, same-request retry and stale counter cannot duplicate or overwrite a decision',async()=>{
    await reset();let p=await invoke(ids.customer,propose());const accept=command('accept',{expectedRevision:1,proposalId:p.body.change_proposal.id,acceptFinancialTerms:true});
    let results=await Promise.all([invoke(ids.owner,accept),invoke(ids.owner,accept)]);assert.deepEqual(results.map(r=>r.status),[200,200]);assert.equal((await row()).change_history.length,1);
    await reset();p=await invoke(ids.customer,propose());results=await Promise.all([invoke(ids.owner,command('accept',{expectedRevision:1,proposalId:p.body.change_proposal.id,acceptFinancialTerms:true})),invoke(ids.owner,command('reject',{expectedRevision:1,proposalId:p.body.change_proposal.id}))]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await row()).change_history.length,1);
    assert.equal((await invoke(ids.owner,propose({operation:'counter',expectedRevision:1,proposalId:p.body.change_proposal.id}))).status,409);
   });
   await suite.test('two bookings cannot accept the same interval simultaneously',async()=>{
    await reset();const second=randomUUID();await db.query("insert into public.bookings(id,business_id,service_id,staff_id,customer_id,starts_at,ends_at,status) values($1,$2,$3,$4,$5,$6,$7,'CONFIRMED')",[second,ids.business,ids.service,ids.staff,ids.other,instant(14),instant(15)]);
    const p1=await invoke(ids.customer,propose()),p2=await invoke(ids.other,propose(),second);assert.equal(p2.status,200);
    const results=await Promise.all([invoke(ids.owner,command('accept',{expectedRevision:1,proposalId:p1.body.change_proposal.id,acceptFinancialTerms:true})),invoke(ids.owner,command('accept',{expectedRevision:1,proposalId:p2.body.change_proposal.id,acceptFinancialTerms:true}),second)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await db.query('select id from public.bookings where starts_at=$1',[instant(11)])).rowCount,1);
   });
   await suite.test('unassigned legacy intervals conflict with assigned staff; cancellation releases the interval',async()=>{
    await reset();await db.query("insert into public.bookings(business_id,service_id,customer_id,starts_at,ends_at,status) values($1,$2,$3,$4,$5,'CONFIRMED')",[ids.business,ids.service,ids.other,instant(11),instant(12)]);
    assert.equal((await invoke(ids.customer,propose())).status,409);
    await db.query("update public.bookings set status='CANCELLED' where customer_id=$1",[ids.other]);
    assert.equal((await invoke(ids.customer,propose())).status,200);
   });
   await suite.test('legacy cancellation clears proposal and journals it; cancel-vs-accept cannot resurrect',async()=>{
    await reset();let p=await invoke(ids.customer,propose());let r=await fetch('http://127.0.0.1:'+restPort+'/bookings?id=eq.'+ids.booking,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt(ids.customer)},body:JSON.stringify({status:'CANCELLED'})});assert.equal(r.status,204,await r.text());
    let current=await row();assert.equal(current.status,'CANCELLED');assert.equal(current.change_proposal,null);assert.equal(current.change_history.at(-1).outcome,'cancelled');
    assert.equal((await invoke(ids.owner,command('accept',{expectedRevision:1,proposalId:p.body.change_proposal.id,acceptFinancialTerms:true}))).status,409);
    await reset();p=await invoke(ids.customer,propose());const results=await Promise.all([invoke(ids.owner,command('accept',{expectedRevision:1,proposalId:p.body.change_proposal.id,acceptFinancialTerms:true})),invoke(ids.customer,command('cancel',{expectedRevision:1}))]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);current=await row();assert.equal(current.change_history.length,1);assert.equal(current.change_proposal,null);
   });
   await suite.test('DST invalid and repeated times are rejected; explicit valid instant and historical receipts are safe',async()=>{
    await reset();await db.query("update public.businesses set timezone='Europe/Madrid' where id=$1",[ids.business]);await db.query("update public.availability set timezone='Europe/Madrid' where business_id=$1",[ids.business]);
    const year=new Date().getUTCFullYear()+1;const lastSunday=month=>{const day=new Date(Date.UTC(year,month+1,0));day.setUTCDate(day.getUTCDate()-day.getUTCDay());return day.toISOString().slice(0,10);};
    let p=await invoke(ids.customer,propose({dateISO:lastSunday(2),time:'02:30'}));assert.equal(p.status,422);assert.equal(p.body.code,'BOOKING_NONEXISTENT_LOCAL_TIME');
    p=await invoke(ids.customer,propose({dateISO:lastSunday(9),time:'02:30'}));assert.equal(p.status,422);assert.equal(p.body.code,'BOOKING_AMBIGUOUS_LOCAL_TIME');
    p=await invoke(ids.customer,propose({dateISO:lastSunday(9),time:'02:30',startsAt:lastSunday(9)+'T00:30:00Z'}));assert.equal(p.status,200,JSON.stringify(p.body));
    await db.query('update public.businesses set booking_enabled=false where id=$1',[ids.business]);
    const receipt=await fetch(base+'/bookings?negotiation=1',{headers:{Authorization:'Bearer '+jwt(ids.customer)}});const rows=await receipt.json();assert.equal(rows[0].business_name,'Test salon');assert.equal(rows[0].change_proposal.id,p.body.change_proposal.id);
   });
   await suite.test('actual mobile adapter + Calendar/Listados/Next visit selectors share the real SQL reservation',async()=>{
    await reset();
    const mobile=path.resolve('../go-app-mobile');
    const evaluate=(file,imports={},extras={})=>{
      const scope={exports:{},Date,Intl,Map,Set,Headers,console,...extras,require:name=>{if(name in imports)return imports[name];throw Error('Unexpected mobile import '+name);}};
      vm.runInNewContext(ts.transpileModule(file,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,scope);return scope.exports;
    };
    const bookingSource=await readFile(path.join(mobile,'data/booking.ts'),'utf8');
    const apiFor=identity=>evaluate(bookingSource,{
      '@react-native-async-storage/async-storage':{default:{getItem:async()=>null,setItem:async()=>{throw Error('Real booking cannot write a local replica');}}},
      '@/lib/authSession':{readAuthSession:async()=>({access_token:jwt(identity),user:{id:identity}}),fetchWithAuth:async(url,init,_needed,expected)=>{assert.equal(expected,identity);return fetch(url,init);},AuthSessionRequiredError:class extends Error{}},
      './goSearchAliases':{normalize:x=>x,expandSearchTerms:x=>[x]},
    },{process:{env:{EXPO_PUBLIC_API_URL:base}}});
    const projection=evaluate(await readFile(path.join(mobile,'data/customerBookingProjection.ts'),'utf8'));
    const provider=evaluate(await readFile(path.join(mobile,'hooks/useBusinessBookings.ts'),'utf8'),{
      react:{},'react-native':{},'@/data/booking':{},'@/data/customerBookingProjection':projection,'@/lib/sessionEvents':{},
    });
    const home=await readFile(path.join(mobile,'app/index.tsx'),'utf8'),ast=ts.createSourceFile('home.tsx',home,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
    (function walk(n){nodes.push(n);ts.forEachChild(n,walk);})(ast);
    const declaration=name=>nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);
    const filtered=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='filtered'&&n.initializer?.getText(ast).startsWith('goLog.filter'));
    const surfaces=async()=>{
      const client=apiFor(ids.customer),businessApi=apiFor(ids.owner);
      const [bookings,businessBookings]=await Promise.all([client.getLiveCustomerBookings(),businessApi.getLiveBusinessBookings(ids.business)]);
      const entries=bookings.map(booking=>({...projection.customerBookingEntry(booking,{id:ids.business,name:booking.receipt.businessName,location:booking.receipt.address,timezone:booking.receipt.timezone,phone:''},{title:booking.receipt.serviceName}),type:'GO_BOOKING',kind:'received'}));
      const scope={goLog:entries,Date,__DEV__:false,isUserMode:true,isBusinessMode:false,useMemo:fn=>fn(),getToday:()=>new Date(),formatISODate:d=>d.toISOString().slice(0,10),listFilter:'reservas',customerBookings:{entries},isPapelaraView:false,activityFilter:'todas',typeFilter:'todos',llamadasListOpen:false};
      const selected=evaluate('const '+declaration('goDateTime').getText(ast)+';const '+declaration('nextAppointments').getText(ast)+';const '+filtered.getText(ast)+';exports.next=nextAppointments;exports.mine=filtered;',{},scope);
      const company=businessBookings.map(booking=>provider.businessBookingEntry(booking,{id:ids.business,name:'Test salon',timezone:'UTC',phone:'',location:'Test street'},ids.owner));
      return {entries,company,...selected};
    };
    let state=await surfaces();for(const rows of [state.entries,state.company,state.mine])assert.equal(rows.length,1);assert.equal(state.next.length,1);assert.equal(state.next[0].g.place,'Test street');
    const customer=apiFor(ids.customer),owner=apiFor(ids.owner);
    let changed=await customer.changeBookingRequest(ids.booking,'propose',{dateISO:instant(11).slice(0,10),time:'11:00',expectedRevision:0,acceptFinancialTerms:true},ids.customer);
    assert.equal(typeof changed.changeProposal.duration,'string');assert.equal(typeof changed.changeProposal.proposedAt,'number');
    const retried=await apiFor(ids.customer).changeBookingRequest(ids.booking,'propose',{dateISO:instant(11).slice(0,10),time:'11:00',expectedRevision:0,acceptFinancialTerms:true},ids.customer);
    assert.equal(retried.changeProposal.id,changed.changeProposal.id);assert.equal(retried.changeRevision,1);
    state=await surfaces();assert.equal(state.entries[0].time,'09:00');assert.equal(state.company[0].estado,'propuesto');
    changed=await owner.changeBookingRequest(ids.booking,'accept',{expectedRevision:1,proposalId:changed.changeProposal.id,acceptFinancialTerms:true},ids.owner);
    state=await surfaces();for(const entry of [state.entries[0],state.company[0],state.mine[0],state.next[0].g]){assert.equal(entry.time,'11:00');assert.equal(entry.reservationId,ids.booking);}
    assert.equal(state.company[0].bookingChangeRevision,2);
    await customer.changeBookingRequest(ids.booking,'cancel',{expectedRevision:2},ids.customer);
    state=await surfaces();assert.equal(state.next.length,0);for(const entry of [state.entries[0],state.company[0],state.mine[0]])assert.equal(entry.bookingStatus,'cancelada');
    assert.equal(Number((await db.query('select count(*) from public.bookings')).rows[0].count),1);
   });
   const verify=async(uid,operation,input={})=>{const response=await fetch(base+'/booking-verification',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt(uid)},body:JSON.stringify({operation,...input})});return{status:response.status,body:await response.json(),headers:response.headers};};
   const issue=()=>verify(ids.customer,'issue',{bookingId:ids.booking});
   const preview=(secret,uid=ids.owner,businessId=ids.business)=>verify(uid,'preview',{businessId,secret});
   const arrivalTime=async()=>{await db.query('update public.bookings set starts_at=now()+interval \'30 minutes\',ends_at=now()+interval \'90 minutes\' where id=$1',[ids.booking]);};
   await suite.test('customer identity is authorized, stable through negotiation and distinct for two real customers',async()=>{
    await reset();await db.query("update public.profiles set full_name='MARÍA JOSÉ',phone='private-phone' where id=$1",[ids.customer]);await db.query("update public.profiles set full_name='RAÚL' where id=$1",[ids.other]);
    const second=randomUUID();await db.query("insert into public.bookings(id,business_id,service_id,staff_id,customer_id,starts_at,ends_at,status) values($1,$2,$3,$4,$5,$6,$7,'CONFIRMED')",[second,ids.business,ids.service,ids.otherStaff,ids.other,instant(9),instant(10)]);
    const receipts=async uid=>{const r=await fetch(base+'/bookings?negotiation=1',{headers:{Authorization:'Bearer '+jwt(uid)}});assert.equal(r.status,200);return r.json();};
    const owner=await receipts(ids.owner);assert.equal(owner.length,2);assert.equal(owner.find(x=>x.id===ids.booking).customer_name,'MARÍA JOSÉ');assert.equal(owner.find(x=>x.id===second).customer_name,'RAÚL');assert.equal(owner[0].phone,undefined);assert.equal(owner[0].email,undefined);
    let r=await invoke(ids.customer,propose());r=await invoke(ids.owner,command('accept',{expectedRevision:1,proposalId:r.body.change_proposal.id,acceptFinancialTerms:true}));assert.equal(r.body.customer_name,'MARÍA JOSÉ');
    r=await invoke(ids.customer,command('cancel',{expectedRevision:2}));assert.equal(r.body.customer_name,'MARÍA JOSÉ');assert.equal((await receipts(ids.customer)).length,1);assert.deepEqual(await receipts(ids.foreignOwner),[]);
    await db.query("update public.profiles set full_name='private@example.invalid' where id=$1",[ids.customer]);assert.equal((await receipts(ids.owner)).find(x=>x.id===ids.booking).customer_name,null);
   });
   await suite.test('only the authorized business accepts an initial pending reservation, once, without payment changes',async()=>{
    await reset();await db.query("update public.bookings set status='PENDING' where id=$1",[ids.booking]);const revision=Number((await row()).change_revision);
    assert.equal((await invoke(ids.customer,command('confirm',{expectedRevision:revision}))).status,403);
    const original=(await row()).test_payment_fixture,c=command('confirm',{expectedRevision:revision});let r=await invoke(ids.owner,c);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.status,'CONFIRMED');assert.equal(r.body.change_history.at(-1).outcome,'reservation_confirmed');
    assert.equal((await invoke(ids.owner,c)).status,200);assert.equal((await invoke(ids.owner,command('confirm',{expectedRevision:r.body.change_revision}))).status,409);assert.deepEqual((await row()).test_payment_fixture,original);
   });
   await suite.test('confirmed booking gets opaque expiring QR and independent manual capability; only hashes are stored',async()=>{
    await reset();await db.query("update public.profiles set full_name='JUANA' where id=$1",[ids.customer]);const q=await issue();assert.equal(q.status,200,JSON.stringify(q.body));assert.match(q.body.qrPayload,/^GO:RESERVATION:1:[A-Za-z0-9_-]{43}$/);assert.match(q.body.manualCode,/^[0-9A-F]{32}$/);assert.ok(Date.parse(q.body.expiresAt)<=Date.now()+601000);
    assert.ok(!q.body.qrPayload.includes(ids.booking));assert.ok(!q.body.qrPayload.includes('JUANA'));assert.match(q.headers.get('cache-control'),/no-store/);
    const raw=(await db.query('select * from go_reservation_verification.rights where booking_id=$1',[ids.booking])).rows[0];assert.equal(Buffer.isBuffer(raw.token_hash),true);assert.equal(JSON.stringify(raw).includes(q.body.qrPayload),false);assert.equal(JSON.stringify(raw).includes(q.body.manualCode),false);
    let p=await preview(q.body.qrPayload);assert.equal(p.status,200,JSON.stringify(p.body));assert.equal(p.body.customerName,'JUANA');assert.equal(p.body.civilIdentityVerified,false);assert.equal(p.body.arrivalVerified,false);assert.equal(p.body.canConfirmArrival,false);assert.equal(p.body.customer_id,undefined);assert.equal(p.body.notes,undefined);assert.equal(p.body.test_payment_fixture,undefined);
    p=await preview(q.body.manualCode.match(/.{1,4}/g).join(' '));assert.equal(p.status,200);assert.equal((await row()).status,'CONFIRMED');assert.equal((await row()).change_history.length,0);
    assert.equal(Number((await db.query('select count(*) from public.bookings')).rows[0].count),1);
   });
   await suite.test('forged, guessed, wrong-establishment and unauthorized verifier codes disclose no customer data',async()=>{
    await reset();const q=await issue();for(const r of [await preview('GO:RESERVATION:1:'+randomBytes(32).toString('base64url')),await preview(q.body.qrPayload,ids.foreignOwner,ids.foreignBusiness),await preview(q.body.qrPayload,ids.other),await preview('MARÍA JOSÉ'),await preview(q.body.qrPayload.slice(0,-1)+'!')]){assert.equal(r.status,404);assert.equal(r.body.customerName,undefined);assert.equal(r.body.summary,undefined);}
    const direct=await asUser(ids.other,'select id from public.profiles where id=$1',[ids.customer]);assert.equal(direct.rowCount,0);
    await assert.rejects(asUser(ids.other,'select * from go_reservation_verification.rights'),e=>e.code==='42501');
    const noAuth=await fetch(base+'/booking-verification',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'wallet'})});assert.equal(noAuth.status,401);
    const fake=await fetch(base+'/booking-verification',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt(ids.customer,'wrong-signing-secret-that-is-not-valid')},body:JSON.stringify({operation:'issue',bookingId:ids.booking})});assert.equal(fake.status,401);
    assert.equal((await verify(ids.customer,'issue',{bookingId:ids.booking,customerId:ids.owner})).status,400);
   });
   await suite.test('QR validity, explicit arrival and service performed are distinct; concurrent arrival inserts only one event',async()=>{
    await reset();await arrivalTime();await db.query('update public.staff set profile_id=$1 where id=$2',[ids.other,ids.staff]);const original=await row(),q=await issue();const [p1,p2]=await Promise.all([preview(q.body.qrPayload),preview(q.body.qrPayload,ids.other)]);assert.equal(p1.status,200);assert.equal(p2.status,200);assert.equal(p1.body.canConfirmArrival,true);
    assert.equal((await db.query('select arrived_at from go_reservation_verification.rights where booking_id=$1',[ids.booking])).rows[0].arrived_at,null);
    const results=await Promise.all([verify(ids.owner,'arrive',{businessId:ids.business,challenge:p1.body.challenge}),verify(ids.other,'arrive',{businessId:ids.business,challenge:p2.body.challenge})]);assert.ok(results.every(r=>r.status===200),JSON.stringify(results));assert.equal(results.filter(r=>r.body.arrivalAlreadyVerified===false).length,1);assert.ok(results.every(r=>r.body.servicePerformed===false));
    assert.equal(Number((await db.query("select count(*) from go_reservation_verification.events where booking_id=$1 and action='arrival_verified'",[ids.booking])).rows[0].count),1);
    const after=await row();assert.equal(after.status,'CONFIRMED');assert.equal(after.customer_id,original.customer_id);assert.deepEqual(after.test_payment_fixture,original.test_payment_fixture);assert.equal(after.change_history.length,0);
    assert.equal((await preview(q.body.qrPayload)).body.arrivalAlreadyVerified,true);assert.equal((await verify(ids.customer,'invite',{bookingId:ids.booking})).status,409);
   });
   await suite.test('a preview challenge is bound to verifier, business, lifetime and current trusted staff assignment',async()=>{
    await reset();await arrivalTime();await db.query('update public.staff set profile_id=$1 where id=$2',[ids.other,ids.staff]);const q=await issue(),p=await preview(q.body.qrPayload,ids.other);
    assert.equal((await verify(ids.owner,'arrive',{businessId:ids.business,challenge:p.body.challenge})).status,404);
    await db.query('update public.staff set active=false where id=$1',[ids.staff]);assert.equal((await verify(ids.other,'arrive',{businessId:ids.business,challenge:p.body.challenge})).status,404);
    const ownerPreview=await preview(q.body.qrPayload);await db.query("update go_reservation_verification.challenges set expires_at=now()-interval '1 second'");assert.equal((await verify(ids.owner,'arrive',{businessId:ids.business,challenge:ownerPreview.body.challenge})).status,404);
   });
   await suite.test('rotation, expiry, cancellation, reassignment and accepted reschedule invalidate prior QR and manual codes',async()=>{
    for(const operation of ['rotation','expiry','cancel','staff','change']){
     await reset();const q=await issue();
     if(operation==='rotation')assert.equal((await issue()).status,200);
     if(operation==='expiry')await db.query("update go_reservation_verification.rights set expires_at=now()-interval '1 second'");
     if(operation==='cancel')assert.equal((await invoke(ids.customer,command('cancel'))).status,200);
     if(operation==='staff')await db.query('update public.bookings set staff_id=$1 where id=$2',[ids.otherStaff,ids.booking]);
     if(operation==='change'){const p=await invoke(ids.customer,propose());assert.equal((await preview(q.body.qrPayload)).status,200,'mere proposal must not invalidate original booking');assert.equal((await invoke(ids.owner,command('accept',{expectedRevision:1,proposalId:p.body.change_proposal.id,acceptFinancialTerms:true}))).status,200);}
     assert.equal((await preview(q.body.qrPayload)).status,404,operation);assert.equal((await preview(q.body.manualCode)).status,404,operation);
    }
   });
   await suite.test('authorized handover requires explicit authenticated claim, keeps one entitlement and survives reload',async()=>{
    await reset();await db.query("update public.profiles set full_name=case when id=$1 then 'RAÚL' else 'MARÍA JOSÉ' end where id in ($1,$2)",[ids.customer,ids.other]);const original=await row(),q=await issue();const invitation=await verify(ids.customer,'invite',{bookingId:ids.booking});assert.equal(invitation.status,200);assert.match(invitation.body.invitation,/^GO:HANDOVER:1:[A-Za-z0-9_-]{43}$/);
    assert.equal((await preview(invitation.body.invitation)).status,404);assert.equal((await verify(ids.other,'issue',{bookingId:ids.booking})).status,404);
    const claim=await verify(ids.other,'claim',{secret:invitation.body.invitation});assert.equal(claim.status,200,JSON.stringify(claim.body));assert.equal(claim.body.summary.customerName,'RAÚL');assert.equal(claim.body.summary.authorizedPersonName,'MARÍA JOSÉ');assert.equal((await preview(q.body.qrPayload)).status,404);
    assert.equal((await verify(ids.customer,'issue',{bookingId:ids.booking})).status,404);assert.equal((await verify(ids.foreignOwner,'claim',{secret:invitation.body.invitation})).status,404);
    const wallet=await verify(ids.other,'wallet');assert.equal(wallet.body.items.length,1);assert.equal(wallet.body.items[0].bookingId,ids.booking);assert.equal((await verify(ids.foreignOwner,'wallet')).body.items.length,0);
    const recipient=await verify(ids.other,'issue',{bookingId:ids.booking});assert.equal(recipient.status,200);assert.equal((await preview(recipient.body.qrPayload)).body.authorizedPersonName,'MARÍA JOSÉ');assert.equal((await row()).customer_id,original.customer_id);assert.deepEqual((await row()).test_payment_fixture,original.test_payment_fixture);
    assert.equal((await verify(ids.customer,'revoke',{bookingId:ids.booking})).status,200);assert.equal((await preview(recipient.body.qrPayload)).status,404);assert.equal((await issue()).status,200);assert.equal(Number((await db.query('select count(*) from public.bookings')).rows[0].count),1);
   });
   await suite.test('simultaneous handover claims cannot produce two holders',async()=>{
    await reset();const invitation=await verify(ids.customer,'invite',{bookingId:ids.booking});const results=await Promise.all([verify(ids.other,'claim',{secret:invitation.body.invitation}),verify(ids.foreignOwner,'claim',{secret:invitation.body.invitation})]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===404).length,1);const holder=(await db.query('select holder_id from go_reservation_verification.rights where booking_id=$1',[ids.booking])).rows[0].holder_id;assert.ok([ids.other,ids.foreignOwner].includes(holder));
   });
   await suite.test('durable throttling also limits unsuccessful authenticated guesses without recording tokens',async()=>{
    await reset();for(let i=0;i<30;i++)assert.equal((await preview('not-a-valid-qr')).status,404);const last=await preview('not-a-valid-qr');assert.equal(last.status,429);assert.equal(last.headers.get('retry-after'),'60');assert.equal(Number((await db.query('select attempts from go_reservation_verification.throttle where actor_id=$1',[ids.owner])).rows[0].attempts),31);
   });

   await suite.test('pending/past/terminal bookings cannot issue credentials; expired invitations cannot transfer a right',async()=>{
    for(const status of ['PENDING','COMPLETED','NO_SHOW','CANCELLED']){await reset();await db.query('update public.bookings set status=$1 where id=$2',[status,ids.booking]);assert.equal((await issue()).status,409,status);}
    await reset();await db.query("update public.bookings set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=$1",[ids.booking]);assert.equal((await issue()).status,409);
    await reset();const invitation=await verify(ids.customer,'invite',{bookingId:ids.booking});await db.query("update go_reservation_verification.rights set invite_expires_at=now()-interval '1 second'");assert.equal((await verify(ids.other,'claim',{secret:invitation.body.invitation})).status,404);
   });
   await suite.test('revoked owner or business verification immediately invalidates a previously obtained preview challenge',async()=>{
    await reset();await arrivalTime();const q=await issue(),p=await preview(q.body.qrPayload);await db.query('update public.businesses set verified=false,booking_enabled=false where id=$1',[ids.business]);const result=await verify(ids.owner,'arrive',{businessId:ids.business,challenge:p.body.challenge});assert.equal(result.status,404);assert.equal(result.body.customerName,undefined);assert.equal((await row()).status,'CONFIRMED');
   });
   await suite.test('arrival and handover racing for the same entitlement cannot both succeed',async()=>{
    await reset();await arrivalTime();const q=await issue(),p=await preview(q.body.qrPayload),invitation=await verify(ids.customer,'invite',{bookingId:ids.booking});
    const [arrival,claim]=await Promise.all([verify(ids.owner,'arrive',{businessId:ids.business,challenge:p.body.challenge}),verify(ids.other,'claim',{secret:invitation.body.invitation})]);
    assert.equal([arrival,claim].filter(r=>r.status===200).length,1,JSON.stringify({arrival:arrival.status,claim:claim.status}));
    const right=(await db.query('select holder_id,arrived_at from go_reservation_verification.rights where booking_id=$1',[ids.booking])).rows[0];if(arrival.status===200){assert.equal(right.holder_id,ids.customer);assert.ok(right.arrived_at);}else{assert.equal(right.holder_id,ids.other);assert.equal(right.arrived_at,null);}assert.equal((await row()).status,'CONFIRMED');
   });
   if(variant==='multi')await suite.test('existing multi-service creation and immutable financial/duration snapshots remain compatible',async()=>{
    await reset();await db.query('delete from public.bookings where id=$1',[ids.booking]);
    const created=await asUser(ids.customer,"select public.go_create_service_booking($1,$2,$3,$4,$5,null,'CONFIRMED',$6) booking",[ids.business,[ids.service,ids.extraService],ids.staff,instant(9),new Date(Date.parse(instant(9))+90*60000).toISOString(),'negotiation_test_'+randomUUID().replaceAll('-','')]);
    ids.booking=created.rows[0].booking.id;const snapshot=created.rows[0].booking;assert.equal(snapshot.total_price,30);assert.equal(snapshot.total_duration_minutes,90);
    await db.query('update public.services set price=999,duration_minutes=15 where business_id=$1',[ids.business]);
    const qr=await issue();assert.equal(qr.status,200,JSON.stringify(qr.body));assert.equal(qr.body.summary.serviceName,'Cut · Wash');
    const p=await invoke(ids.customer,propose());assert.equal(p.status,200,JSON.stringify(p.body));const a=await invoke(ids.owner,command('accept',{expectedRevision:1,proposalId:p.body.change_proposal.id,acceptFinancialTerms:true}));assert.equal(a.status,200,JSON.stringify(a.body));
    for(const key of ['service_ids','service_details','total_price','currency','total_duration_minutes','request_key'])assert.deepEqual(a.body[key],snapshot[key]);
    assert.equal(Date.parse(a.body.ends_at)-Date.parse(a.body.starts_at),90*60000);
   });
  }finally{
   await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>gateway.close(resolve));
   rest.kill();await new Promise(resolve=>{if(rest.exitCode!==null)resolve();else rest.once('exit',resolve);});await db.end();
  }
 });}finally{
  if(savedEnv.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=savedEnv.url;
  if(savedEnv.key===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=savedEnv.key;
  await rm(dir,{recursive:true,force:true});
 }
});
