import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import {catalogDatabase} from './helpers/prepare-catalog-db.mjs';
const listen=async server=>{await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes)});return server.address().port};
const port=async()=>{const s=createServer(),p=await listen(s);await new Promise(r=>s.close(r));return p};

test('Shared catalogue associations: real PostgreSQL, JWT, PostgREST and Express (isolated)',{skip:!process.env.GO_CATALOG_TEST_URL},async t=>{
 const db=await catalogDatabase(),temp=await mkdtemp(path.join(tmpdir(),'go-catalog-api-'));
 const original={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY};
 let rest,proxy,server,logs='';
 try{
  assert.equal((await db.query("select current_setting('go.catalog_test_draft_sha') hash")).rows[0].hash,createHash('sha256').update(await readFile('supabase/drafts/catalog_associations_v1.sql')).digest('hex'));
  const binary=process.env.GO_BOOKING_POSTGREST_BINARY;assert.ok(binary);
  const secret=randomBytes(48).toString('base64url'),restPort=await port();
  const uri=new URL(process.env.GO_CATALOG_TEST_URL);uri.username='go_test_authenticator';
  rest=spawn(binary,[],{windowsHide:true,env:{...process.env,PGRST_DB_URI:String(uri),PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(restPort),PGRST_LOG_LEVEL:'error',PGRST_DB_CHANNEL_ENABLED:'false'}});
  rest.stderr.on('data',x=>{logs+=x});
  for(let n=0;n<80;n++){try{if((await fetch(`http://127.0.0.1:${restPort}/`)).ok)break}catch{}if(n===79||rest.exitCode!==null)throw Error('PostgREST not ready: '+logs);await new Promise(r=>setTimeout(r,100))}
  proxy=createServer(async(req,res)=>{try{
   const chunks=[];for await(const x of req)chunks.push(x);const body=Buffer.concat(chunks);
   const r=await fetch(`http://127.0.0.1:${restPort}`+req.url.replace(/^\/rest\/v1/,''),{method:req.method,headers:{'Content-Type':'application/json',...(req.headers.authorization?{Authorization:req.headers.authorization}:{})},...(body.length?{body}:{})});
   res.writeHead(r.status,{'Content-Type':'application/json'}).end(await r.text());
  }catch{res.writeHead(502).end()}});
  process.env.SUPABASE_URL=`http://127.0.0.1:${await listen(proxy)}`;process.env.SUPABASE_PUBLISHABLE_KEY='isolated-publishable-key';
  const {default:express}=await import('express');const app=express();app.use(express.json());
  for(const name of ['catalogAssociations','bookingTimeline','bookingNegotiation']){
   const file=path.join(temp,name+'.mjs');await build({entryPoints:[`src/routes/${name}.ts`],outfile:file,bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
   app.use('/supabase',(await import(pathToFileURL(file).href)).default);
  }
  server=createServer(app);const base=`http://127.0.0.1:${await listen(server)}/supabase`;
  const jwt=uid=>{const v=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({role:'authenticated',sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return v+'.'+createHmac('sha256',secret).update(v).digest('base64url')};
  const http=async(uid,route,body,method='POST')=>{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(uid?{Authorization:'Bearer '+jwt(uid)}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
  let ids;
  const reset=async()=>{
   await db.query('truncate go_catalog_private.booking_commands,go_catalog_private.associations,public.bookings,public.availability,public.staff,public.services,public.businesses,auth.users cascade');
   ids=Object.fromEntries(['owner','foreignOwner','customer','otherCustomer','business','foreignBusiness','staff'].map(x=>[x,randomUUID()]));
   for(const role of ['owner','foreignOwner','customer','otherCustomer'])await db.query('insert into auth.users(id,email) values($1,$2)',[ids[role],role+'@example.invalid']);
   await db.query("insert into public.businesses(id,owner_id,name,timezone,verified,booking_enabled) values($1,$2,'Test hairdresser','UTC',true,true),($3,$4,'Other sector','UTC',true,true)",[ids.business,ids.owner,ids.foreignBusiness,ids.foreignOwner]);
   await db.query("insert into public.staff(id,business_id,display_name) values($1,$2,'Fictitious professional')",[ids.staff,ids.business]);
   await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone) select $1,d,'09:00','20:00','UTC' from generate_series(0,6) d",[ids.business]);
  };
  const item=async(name='Tinte',price=30,kind='service',business=ids.business)=>{const id=randomUUID();await db.query('insert into public.services(id,business_id,name,duration_minutes,price,currency,ui_metadata) values($1,$2,$3,$4,$5,\'EUR\',$6)',[id,business,name,kind==='product'?0:30,price,JSON.stringify({catalogKind:kind})]);return id};
  const manage=(operation,input={},actor=ids.owner,business=ids.business)=>http(actor,'/catalog/associations',{businessId:business,operation,input});
  const associate=async(sourceId,targetId,mode='optional')=>{const r=await manage('create',{sourceId,targetId,mode:mode==='required'?'included':mode});assert.equal(r.status,200,JSON.stringify(r));return r.body};
  const quote=(rootIds,selectedIds=[],actor=ids.customer,business=ids.business)=>http(actor,'/catalog/quote',{businessId:business,rootIds,selectedIds});
  const create=(q,extra={},actor=ids.customer)=>http(actor,'/bookings/catalog',{business_id:ids.business,root_ids:q.rootIds,selected_ids:q.selectedAssociationIds,expected_quote:q,
    starts_at:'2035-01-08T10:00:00Z',staff_id:ids.staff,request_key:randomUUID(),...extra});

  await t.test('Tinte with ampolla optional: never selected or priced until explicitly accepted; reject returns original total',async()=>{
   await reset();const s=await item(),p=await item('Ampolla',7.25,'product'),a=await associate(s,p);
   const no=await quote([s]);assert.equal(no.status,200);assert.equal(no.body.totalPrice,30);assert.equal(no.body.lines.length,1);assert.equal(no.body.options[0].selected,false);
   const yes=await quote([s],[a.id]);assert.equal(yes.body.totalPrice,37.25);assert.equal(yes.body.lines.length,2);assert.equal((await quote([s])).body.totalPrice,30);
  });
  await t.test('several complements; included items and diamond references are charged at most once',async()=>{
   await reset();const s=await item(),p=await item('Mascarilla',9,'product'),b=await item('Hidratación',12),c=await item('Ampolla',7,'product');
   await associate(s,p,'included');const a=await associate(s,b),a2=await associate(s,c);await associate(b,p,'included');
   const r=await quote([s],[a.id,a2.id]);assert.equal(r.body.totalPrice,49);assert.equal(r.body.lines.length,4);assert.equal(r.body.lines.find(x=>x.itemId===p).charge,0);assert.equal(r.body.lines.find(x=>x.itemId===p).unitPrice,9);
  });
  await t.test('recommended associations are voluntary in the server contract and can be booked without acceptance',async()=>{
   await reset();const service=await item(),product=await item('Recommended',8,'product'),edge=await associate(service,product,'recommended');
   const no=(await quote([service])).body;assert.equal(no.ready,true);assert.equal(no.totalPrice,30);assert.equal(no.options[0].mode,'recommended');assert.equal(no.options[0].selected,false);
   const yes=(await quote([service],[edge.id])).body;assert.equal(yes.totalPrice,38);assert.equal((await create(no)).status,201);
  });
  await t.test('legacy required components are included without consent or a surcharge; new required associations are rejected',async()=>{
   await reset();const s=await item(),p=await item('Required',5,'product'),a=await associate(s,p,'required');
   const q=(await quote([s])).body;assert.equal(q.ready,true);assert.deepEqual(q.missingRequired,[]);assert.equal(q.totalPrice,30);assert.equal(q.options[0].mode,'included');assert.equal((await create(q)).status,201);
   const yes=(await quote([s],[a.id])).body;assert.equal(yes.ready,true);assert.equal(yes.totalPrice,30);assert.equal(yes.lines.find(line=>line.itemId===p).charge,0);assert.equal((await manage('create',{sourceId:p,targetId:s,mode:'required'})).status,400);
  });
  await t.test('all four relationship kinds use the same catalogue; products never add fictitious service time',async()=>{
   await reset();const s=await item(),s2=await item('Acabado',10),p=await item('Ampolla',7,'product'),p2=await item('Mascarilla',9,'product');
   const a=await associate(s,p),b=await associate(p,p2),c=await associate(p2,s2);
   const q=(await quote([s],[a.id,b.id,c.id])).body;assert.deepEqual(q.serviceIds,[s,s2]);const r=await create(q);assert.equal(r.status,201,JSON.stringify(r));assert.equal(r.body[0].timing_snapshot.totalClientMinutes,60);assert.equal(r.body[0].catalog_snapshot.totalPrice,56);
  });
  await t.test('server tariff changes invalidate stale quotes; prior reservations retain accepted prices and names',async()=>{
   await reset();const s=await item(),p=await item('Ampolla',7,'product'),a=await associate(s,p);const q=(await quote([s],[a.id])).body;
   await db.query('update public.services set price=9 where id=$1',[p]);assert.equal((await create(q)).status,409);assert.equal((await db.query('select * from public.bookings')).rowCount,0);
   const fresh=(await quote([s],[a.id])).body;const b=await create(fresh);assert.equal(b.status,201);await db.query("update public.services set name='Renamed',price=15 where id=$1",[p]);
   const receipt=await http(ids.customer,'/bookings?negotiation=1',null,'GET');assert.equal(receipt.status,200);assert.equal(receipt.body[0].catalog_snapshot.totalPrice,39);assert.equal(receipt.body[0].catalog_snapshot.lines[1].name,'Ampolla');
  });
  await t.test('update, deactivate, reactivate and delete with optimistic revision checks',async()=>{
   await reset();const s=await item(),p=await item('Ampolla',7,'product'),a=await associate(s,p);
   const changed=await manage('update',{id:a.id,revision:a.revision,mode:'included'});assert.equal(changed.status,200);assert.equal((await manage('update',{id:a.id,revision:a.revision,active:false})).status,409);
   const off=await manage('update',{id:a.id,revision:changed.body.revision,active:false});assert.equal((await quote([s])).body.options.length,0);
   const on=await manage('update',{id:a.id,revision:off.body.revision,active:true});assert.equal((await quote([s])).body.lines.length,2);
   assert.equal((await manage('delete',{id:a.id,revision:on.body.revision})).status,200);assert.equal((await quote([s])).body.options.length,0);
  });
  await t.test('cycles, duplicate edges, nonexistent, disabled and cross-company targets fail',async()=>{
   await reset();const s=await item(),p=await item('Ampolla',7,'product');await associate(s,p);
   assert.equal((await manage('create',{sourceId:p,targetId:s,mode:'optional'})).status,422);
   assert.equal((await manage('create',{sourceId:s,targetId:p,mode:'included'})).status,409);
   assert.equal((await manage('create',{sourceId:s,targetId:randomUUID(),mode:'optional'})).status,422);
   const foreign=await item('Foreign',3,'product',ids.foreignBusiness);assert.equal((await manage('create',{sourceId:s,targetId:foreign,mode:'optional'})).status,422);
   await db.query('update public.services set active=false where id=$1',[p]);assert.equal((await manage('create',{sourceId:p,targetId:s,mode:'included'})).status,422);
  });
  await t.test('owners from another company and customers cannot manage associations; unauthenticated calls fail',async()=>{
   await reset();const s=await item(),p=await item('Ampolla',7,'product');
   for(const actor of [ids.customer,ids.foreignOwner])assert.equal((await manage('create',{sourceId:s,targetId:p,mode:'optional'},actor)).status,403);
   assert.equal((await http(null,'/catalog/quote',{businessId:ids.business,rootIds:[s]})).status,401);
   await db.query('update public.businesses set booking_enabled=false where id=$1',[ids.business]);assert.equal((await quote([s])).status,403);
  });
  await t.test('request retries and simultaneous identical confirmations return one canonical booking',async()=>{
   await reset();const s=await item(),p=await item('Ampolla',7,'product'),a=await associate(s,p),q=(await quote([s],[a.id])).body,key=randomUUID();
   const both=await Promise.all([create(q,{request_key:key}),create(q,{request_key:key})]);assert.ok(both.every(x=>x.status===201),JSON.stringify(both));assert.equal(both[0].body[0].id,both[1].body[0].id);
   assert.equal((await db.query('select * from public.bookings')).rowCount,1);await db.query('update public.services set price=99 where id=$1',[p]);assert.equal((await create(q,{request_key:key})).body[0].id,both[0].body[0].id);
  });
  await t.test('incompatible concurrent clients cannot both occupy the staff; failures leave no catalogue receipt',async()=>{
   await reset();const s=await item(),p=await item('Ampolla',7,'product'),a=await associate(s,p),q=(await quote([s],[a.id])).body;
   const responses=await Promise.all([create(q),create(q,{},ids.otherCustomer)]);assert.deepEqual(responses.map(x=>x.status).sort(),[201,409]);
   assert.equal((await db.query('select * from public.bookings')).rowCount,1);assert.equal((await db.query('select * from go_catalog_private.booking_commands')).rowCount,1);
  });
  await t.test('legacy booking route cannot bypass the canonical catalogue snapshot',async()=>{
   await reset();const s=await item(),p=await item('Ampolla',7,'product');await associate(s,p,'required');
   const r=await http(ids.customer,'/bookings/timeline',{business_id:ids.business,service_ids:[s],staff_id:ids.staff,starts_at:'2035-01-08T10:00:00Z',request_key:randomUUID()});assert.equal(r.status,409);assert.equal((await db.query('select * from public.bookings')).rowCount,0);
  });
  await t.test('unrelated legacy booking, cancellation, history and immutable catalogue snapshot survive',async()=>{
   await reset();const s=await item();const plain=await http(ids.customer,'/bookings/timeline',{business_id:ids.business,service_ids:[s],staff_id:ids.staff,starts_at:'2035-01-08T10:00:00Z',request_key:randomUUID()});assert.equal(plain.status,201);
   const q=(await quote([s])).body;const r=await create(q,{starts_at:'2035-01-08T11:00:00Z'});assert.equal(r.status,201);const b=r.body[0];
   const cancel=await http(ids.customer,`/bookings/${b.id}/change`,{operation:'cancel',expectedRevision:0,requestId:randomUUID()});assert.equal(cancel.status,200,JSON.stringify(cancel));
   const persisted=(await db.query('select catalog_snapshot,status from public.bookings where id=$1',[b.id])).rows[0];assert.deepEqual(persisted.catalog_snapshot,q);assert.equal(persisted.status,'CANCELLED');
  });
  await t.test('no invented stock; stale/removed selections and forged quotes rejected',async()=>{
   await reset();const s=await item(),p=await item('Stock controlled',7,'product'),a=await associate(s,p);
   await db.query("update public.services set ui_metadata=ui_metadata||'{\"stockManaged\":true}'::jsonb where id=$1",[p]);assert.equal((await quote([s],[a.id])).status,422);
   await db.query("update public.services set ui_metadata=ui_metadata-'stockManaged' where id=$1",[p]);const q=(await quote([s],[a.id])).body;
   assert.equal((await create({...q,totalPrice:0})).status,409);await manage('delete',{id:a.id,revision:a.revision});assert.equal((await quote([s],[a.id])).status,422);
  });
  await t.test('schema and permissions: private relations/commands, no anonymous RPC, no snapshot writes',async()=>{
   const unsafe=await db.query("select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='go_catalog_private' or p.proname in ('go_catalog_associations','go_catalog_quote','go_create_catalog_booking')) and has_function_privilege('anon',p.oid,'execute')");assert.equal(unsafe.rowCount,0);
   assert.equal((await db.query("select has_table_privilege('authenticated','go_catalog_private.associations','insert') value")).rows[0].value,false);
   assert.equal((await db.query("select has_table_privilege('authenticated','go_catalog_private.booking_commands','insert') value")).rows[0].value,false);
  });
  await t.test('included service keeps real duration without a second charge; negotiation preserves its accepted catalogue',async()=>{
   await reset();const s=await item(),extra=await item('Acabado incluido',15);await associate(s,extra,'included');
   const q=(await quote([s])).body;assert.equal(q.totalPrice,30);const created=await create(q);assert.equal(created.status,201,JSON.stringify(created));const booking=created.body[0];assert.equal(booking.timing_snapshot.totalClientMinutes,60);
   const proposal=await http(ids.customer,`/bookings/${booking.id}/change`,{operation:'propose',expectedRevision:0,requestId:randomUUID(),dateISO:'2035-01-09',time:'12:17',acceptFinancialTerms:true});assert.equal(proposal.status,200,JSON.stringify(proposal));
   const accepted=await http(ids.owner,`/bookings/${booking.id}/change`,{operation:'accept',expectedRevision:1,requestId:randomUUID(),proposalId:proposal.body.change_proposal.id,acceptFinancialTerms:true});assert.equal(accepted.status,200,JSON.stringify(accepted));
   const persisted=(await db.query('select to_jsonb(b) value from public.bookings b where id=$1',[booking.id])).rows[0].value;assert.deepEqual(persisted.catalog_snapshot,q);assert.equal(Date.parse(persisted.starts_at),Date.parse('2035-01-09T12:17:00Z'));
   if('total_price' in persisted)assert.equal(Number(persisted.total_price),30,'existing financial snapshot must use accepted quote, including zero-charge service');
   assert.equal((await db.query('select * from public.bookings')).rowCount,1);
  });
  await t.test('the identical contract works for another business/sector and a product as main item',async()=>{
   await reset();const p=await item('Producto de taller',12,'product',ids.foreignBusiness),s=await item('Montaje',8,'service',ids.foreignBusiness);
   const a=await manage('create',{sourceId:p,targetId:s,mode:'optional'},ids.foreignOwner,ids.foreignBusiness);assert.equal(a.status,200);
   const q=await quote([p],[a.body.id],ids.customer,ids.foreignBusiness);assert.equal(q.status,200);assert.equal(q.body.totalPrice,20);assert.deepEqual(q.body.serviceIds,[s]);
   assert.equal((await quote([p],[a.body.id],ids.customer,ids.business)).status,422);
  });
  await t.test('combined catalogue, phases and resources preserve consent, exact totals, safe simultaneous work and one receipt',async()=>{
   await reset();const s=await item('Tinte por fases',30),extra=await item('Acabado',10),required=await item('Ampolla obligatoria',5,'product'),optional=await item('Tratamiento opcional',3,'product'),included=await item('Mascarilla incluida',2,'product'),resourceId=randomUUID();
   await db.query('update public.businesses set ui_metadata=$1 where id=$2',[JSON.stringify({bookingResources:[{id:resourceId,name:'Puesto de prueba',capacity:1,active:true}]}),ids.business]);
   const phase=(name,durationMinutes,kind)=>({id:randomUUID(),name,durationMinutes,kind,resources:kind==='work'?[{resourceId,quantity:1,occupancy:'phase'}]:[]});
   await db.query('update public.services set duration_minutes=75,ui_metadata=ui_metadata||$1::jsonb where id=$2',[JSON.stringify({timing:{version:1,mode:'phases',resourcesConfigured:true,phases:[phase('Aplicación',15,'work'),phase('Espera',30,'wait'),phase('Finalización',30,'work')]}}),s]);
   await db.query('update public.services set duration_minutes=15,ui_metadata=ui_metadata||$1::jsonb where id=$2',[JSON.stringify({timing:{version:1,mode:'simple',resourcesConfigured:true,phases:[{id:randomUUID(),name:'Acabado',durationMinutes:15,kind:'work',resources:[]}]}}),extra]);
   const requiredEdge=await associate(s,required,'required'),optionalEdge=await associate(s,optional);await associate(s,included,'included');
   const pending=(await quote([s,extra])).body;assert.equal(pending.ready,true);assert.equal(pending.totalPrice,40);
   const declined=(await quote([s,extra],[requiredEdge.id])).body;assert.equal(declined.totalPrice,40);assert.equal(declined.lines.some(line=>line.itemId===optional),false);
   const q=(await quote([s,extra],[requiredEdge.id,optionalEdge.id])).body;assert.equal(q.ready,true);assert.equal(q.totalPrice,43);assert.deepEqual(q.serviceIds,[s,extra]);
   const key=randomUUID(),created=await create(q,{request_key:key});assert.equal(created.status,201,JSON.stringify(created));
   const b=created.body[0];assert.equal(b.timing_snapshot.totalClientMinutes,90);assert.equal(Date.parse(b.ends_at)-Date.parse(b.starts_at),90*60000);assert.equal(b.catalog_snapshot.totalPrice,43);
   assert.equal(b.timing_snapshot.workIntervals.reduce((sum,value)=>sum+(Date.parse(value.endsAt)-Date.parse(value.startsAt))/60000,0),60);
   assert.deepEqual((await create(q,{request_key:key})).body[0].id,b.id);assert.equal((await db.query('select * from public.bookings')).rowCount,1);
   const short=await item('Servicio durante espera',8);await db.query('update public.services set duration_minutes=15,ui_metadata=ui_metadata||$1::jsonb where id=$2',[JSON.stringify({timing:{version:1,mode:'phases',resourcesConfigured:true,phases:[phase('Trabajo breve',15,'work')]}}),short]);
   const simultaneous=await http(ids.otherCustomer,'/bookings/timeline',{business_id:ids.business,service_ids:[short],staff_id:ids.staff,starts_at:'2035-01-08T10:15:00Z',request_key:randomUUID()});assert.equal(simultaneous.status,201,JSON.stringify(simultaneous));
   const collision=await http(ids.otherCustomer,'/bookings/timeline',{business_id:ids.business,service_ids:[short],staff_id:ids.staff,starts_at:'2035-01-08T10:37:00Z',request_key:randomUUID()});assert.equal(collision.status,409,JSON.stringify(collision));
   const original=(await db.query('select catalog_snapshot,timing_snapshot from public.bookings where id=$1',[b.id])).rows[0];assert.deepEqual(original.catalog_snapshot,q);assert.equal(original.timing_snapshot.totalClientMinutes,90);
  });
  await t.test('simultaneous reverse associations cannot commit a cycle',async()=>{
   await reset();const a=await item(),b=await item('Other service',4);
   const responses=await Promise.all([manage('create',{sourceId:a,targetId:b,mode:'optional'}),manage('create',{sourceId:b,targetId:a,mode:'optional'})]);
   assert.deepEqual(responses.map(x=>x.status).sort(),[200,422]);assert.equal((await db.query('select * from go_catalog_private.associations')).rowCount,1);
  });
 }finally{
  if(server)await new Promise(r=>server.close(r));if(proxy)await new Promise(r=>proxy.close(r));if(rest&&rest.exitCode===null){rest.kill();await new Promise(r=>rest.once('exit',r))}
  if(original.url==null)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=original.url;
  if(original.key==null)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=original.key;
  await db.end();assert.equal(path.dirname(temp),path.resolve(tmpdir()));assert.ok(path.basename(temp).startsWith('go-catalog-api-'));await rm(temp,{recursive:true,force:true});
 }
});
