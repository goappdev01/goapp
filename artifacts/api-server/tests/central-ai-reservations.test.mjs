import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import vm from 'node:vm';import fs from 'node:fs';import {fileURLToPath} from 'node:url';import path from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../go-app-mobile/package.json',import.meta.url));
const ts=require('typescript');
function load(file,imports,globals){const context={exports:{},Date,Intl,URL,URLSearchParams,Error,console,setTimeout,clearTimeout,Promise,Buffer,AbortController,AbortSignal,...globals,
 require:name=>{if(name in imports)return imports[name];throw Error('Unexpected '+name);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);return context.exports;}
const B='11111111-1111-4111-8111-111111111111',S='22222222-2222-4222-8222-222222222222',R='33333333-3333-4333-8333-333333333333',K='44444444-4444-4444-8444-444444444444';
function fixture(){const calls=[],ledger=[],providers=[],reserved=new Set();let proposal=null,exhausted=false,unknown=false,openingError=0,providerReply=null;
 const secret='local-only-ledger-fixture'.repeat(4),authorization='Bearer local-only-caller';
 const globals={process:{env:{SUPABASE_URL:'https://auth.invalid',SUPABASE_PUBLISHABLE_KEY:'local-public-key',OPENAI_API_KEY:'local-only-provider-secret',OPENAI_PROJECT_ID:'proj_LocalTest',OPENAI_ORGANIZATION_ID:'org-LocalTest',GO_CENTRAL_AI_ENABLED:'true',GO_CENTRAL_AI_TEST_MODE:'true',GO_CENTRAL_AI_MODEL:'gpt-5.4-mini',GO_CENTRAL_AI_LEDGER_SECRET:secret,PORT:'8123'}},fetch:async(url,init)=>{
  const body=init.body?JSON.parse(init.body):null;const target=String(url);
  if(target.includes('/rpc/go_ai_test_control')){assert.equal(body.p_secret,secret);ledger.push(body);
   const p=body.p_payload;switch(body.p_operation){
    case 'status':return Response.json({enabled:true,authorizedBusinesses:[B],remainingMicroUsd:3900000});
    case 'invalidate':if(proposal?.status==='submitting')return Response.json({message:'AI_CONCURRENT_REQUEST'},{status:400});proposal=null;break;
    case 'reserve':if(exhausted)return Response.json({message:'AI_BUDGET_EXHAUSTED'},{status:403});if(reserved.has(p.id))return Response.json({message:'AI_REQUEST_EXISTS'},{status:409});reserved.add(p.id);break;
    case 'prepare':proposal={...p,status:'prepared'};break;
    case 'claim':if(!proposal||proposal.id!==p.id)return Response.json({message:'AI_PROPOSAL_STALE'},{status:409});
     if(proposal.status==='submitted')return Response.json({status:'submitted',bookingId:K,bookingStatus:'PENDING'});
     proposal.status='submitting';return Response.json({status:'submitting',command:proposal.command});
    case 'submitted':proposal.status='submitted';break;
    case 'rejected':proposal=null;break;
    case 'settle':return Response.json({chargedMicroUsd:p.certain?p.cost:200000,remainingMicroUsd:3700000});
   }return Response.json({});
  }
  if(target.startsWith('https://api.openai.com/')){providers.push(body);assert.equal(init.headers.Authorization,'Bearer local-only-provider-secret');
   assert.equal(init.headers['OpenAI-Project'],'proj_LocalTest');assert.equal(init.headers['OpenAI-Organization'],'org-LocalTest');
   if(unknown)throw Error('provider connection lost');
   if(providerReply)return Response.json(typeof providerReply==='function'?providerReply(body,providers.length):providerReply);
   const count=providers.length;
   return Response.json({status:'completed',usage:{input_tokens:200,output_tokens:30},output:[{type:'function_call',name:count===1?'read_catalog':count===2?'read_availability':'prepare_booking',call_id:'call_'+count,
    arguments:JSON.stringify(count===1?{query:''}:{business_id:B,service_ids:[S],date:'2026-12-02',staff_id:null,...(count===3?{starts_at:'2026-12-02T09:00:00Z'}:{})})}]});
  }
  assert.ok(target.startsWith('http://127.0.0.1:8123/api/supabase/'),'No arbitrary external GO/tool URL');assert.equal(init.headers.Authorization,authorization);calls.push({url:target,body});
  if(target.endsWith('/businesses'))return Response.json([{id:B,name:'Peluquería María',verified:true,booking_enabled:true,timezone:'Europe/Madrid',ui_metadata:{category:'peluqueria'}}]);
  if(target.endsWith('/services'))return Response.json([{id:S,name:'Corte',active:true,duration_minutes:30,price:12,currency:'EUR'}]);
  if(target.endsWith('/catalog/quote'))return Response.json({ready:true,serviceIds:[S],lines:[{name:'Corte'}],totalPrice:12,currency:'EUR'});
  if(target.includes('/booking-availability?'))return Response.json({timezone:'Europe/Madrid',slots:[
   {startsAt:'2026-12-02T09:00:00Z',endsAt:'2026-12-02T09:30:00Z',staffId:null},
   {startsAt:'2026-12-02T10:30:00Z',endsAt:'2026-12-02T11:00:00Z',staffId:null}]});
  if(target.endsWith('/bookings/catalog')){if(openingError)return Response.json({error:'Horario ocupado'},{status:openingError});return Response.json([{id:K,status:'PENDING'}],{status:201});}
  throw Error('Unexpected request');
 }};
 const supabase=load('artifacts/api-server/src/lib/supabase.ts',{},globals);
 const contract={...load('lib/api-zod/src/central-assistant.ts',{zod:require('zod')},globals),...load('lib/api-zod/src/module-publication.ts',{},globals)};
 globals.process.env.GO_CENTRAL_AI_BOOKINGS_ENABLED='true';
 const budget=load('artifacts/api-server/src/lib/centralAiBudget.ts',{'node:crypto':require('node:crypto'),'./supabase':supabase},globals);
 const tools=load('artifacts/api-server/src/lib/centralAiBookingTools.ts',{'node:crypto':require('node:crypto'),'./supabase':supabase,'./centralAiBudget':budget,'@workspace/api-zod':contract},globals);
 const temporal=load('artifacts/api-server/src/lib/centralAiTemporal.ts',{},globals);
 const response=load('artifacts/api-server/src/lib/centralAiResponse.ts',{'./centralAiBudget':budget,'./centralAiBookingTools':tools,'./centralAiTemporal':temporal},globals);
 return {calls,ledger,providers,budget,tools,response,authorization,setBookingsEnabled:value=>{globals.process.env.GO_CENTRAL_AI_BOOKINGS_ENABLED=value;},setExhausted:v=>exhausted=v,setUnknown:v=>unknown=v,setOpeningError:v=>openingError=v,setReply:v=>providerReply=v};
}

test('conversation keeps read-only catalogue tools when booking execution is disabled',async()=>{
 const f=fixture();f.setBookingsEnabled('false');
 f.setReply({status:'completed',usage:{input_tokens:100,output_tokens:10},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Podemos conversar. Las reservas siguen deshabilitadas.'}]}]});
 const reply=await f.response.respondCentral(f.authorization,[{role:'user',text:'Hola'}],new AbortController().signal,R);
 assert.ok(reply.answer.includes('Podemos conversar'));assert.equal(f.providers.length,1);assert.equal(f.providers[0].tools.map(t=>t.name).join(','),'read_catalog,read_services,read_availability');
 assert.equal(f.calls.length,0);
 const catalog=await f.tools.centralBookingTools(f.authorization,R,[B],new AbortController().signal).run('read_catalog','{"query":""}');assert.equal(catalog.businesses.length,1);
 await assert.rejects(()=>f.tools.centralBookingTools(f.authorization,R,[B],new AbortController().signal).run('prepare_booking','{}'),/no está habilitada/);
 await assert.rejects(()=>f.tools.confirmCentralBooking(f.authorization,K),/no están habilitadas/);
 assert.equal(f.ledger.some(entry=>entry.p_operation==='claim'),false);
});

test('server time context crosses month, year and daylight-saving changes without asking for tomorrow',()=>{
 const t=load('artifacts/api-server/src/lib/centralAiTemporal.ts',{},{});
 assert.equal(t.centralAiTimeZone('Europe/Madrid'),'Europe/Madrid');assert.equal(t.centralAiTimeZone('Mars/Unknown'),null);
 const year=t.centralAiTemporalContext(new Date('2026-12-31T23:30:00Z'),'Europe/Madrid');
 assert.match(year,/Hoy 2027-01-01, mañana 2027-01-02, pasado mañana 2027-01-03/);
 assert.match(year,/próximo lunes 2027-01-04/);
 const dst=t.centralAiTemporalContext(new Date('2026-03-29T00:30:00Z'),'Europe/Madrid');
 assert.match(dst,/Dentro de dos horas: 2026-03-29T02:30:00.000Z UTC/);
 assert.match(dst,/04:30 en Europe\/Madrid/);
});

test('accent and one-character variants identify a single published business without exposing a full catalogue',async()=>{
 const f=fixture(),tool=f.tools.centralBookingTools(f.authorization,R,[],new AbortController().signal);
 for(const query of ['Peluqueria Maria','Maria','Mara']){
  const result=await tool.run('read_catalog',JSON.stringify({query}));
  assert.equal(result.source,'REAL');assert.equal(result.businesses.length,1);assert.equal(result.businesses[0].name,'Peluquería María');
 }
 assert.equal((await tool.run('read_catalog',JSON.stringify({query:'Negocio inexistente'}))).businesses.length,0);
 const services=await tool.run('read_services',JSON.stringify({business_id:B,query:'corte'}));
 assert.equal(services.services.length,1);assert.equal(services.services[0].name,'Corte');
 await assert.rejects(()=>tool.run('read_services',JSON.stringify({business_id:K,query:'corte'})));
});

test('read-only availability offers one real slot and price without a second model call or execution',async()=>{
 const f=fixture();f.setBookingsEnabled('false');
 const args={business_id:B,service_ids:[S],date:'2026-12-02',staff_id:null,time_from:'09:00',time_to:'11:59'};
 const tool=f.tools.centralBookingTools(f.authorization,R,[],new AbortController().signal);
 const result=await tool.run('read_availability',JSON.stringify(args));
 assert.equal(result.source,'REAL');assert.equal(result.recommended.startsAt,'2026-12-02T09:00:00Z');assert.equal(result.total,12);
 assert.equal(result.reservationCreated,false);assert.equal(f.calls.some(call=>call.url.endsWith('/bookings/catalog')),false);
 await assert.rejects(()=>tool.run('prepare_booking',JSON.stringify({...args,starts_at:result.recommended.startsAt})),/no está habilitada/);
 f.setReply({status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{type:'function_call',name:'read_availability',call_id:'slot',arguments:JSON.stringify(args)}]});
 const answer=await f.response.respondCentral(f.authorization,[{role:'user',text:'¿Hay hueco para mañana?'}],new AbortController().signal,R,'Europe/Madrid');
 assert.match(answer.answer,/Te propongo/);assert.match(answer.answer,/Peluquería María/);assert.match(answer.answer,/12.00 EUR/);
 assert.match(answer.answer,/no una reserva/);assert.equal(f.providers.length,1);
 assert.match(f.providers[0].instructions,/Zona del usuario: Europe\/Madrid/);
 assert.equal(f.calls.some(call=>call.url.endsWith('/bookings/catalog')),false);
});

test('a sufficiently defined request resolves through business, service and live availability to one suggestion',async()=>{
 const f=fixture();f.setBookingsEnabled('false');
 const args={business_id:B,service_ids:[S],date:'2026-12-02',staff_id:null,time_from:'09:00',time_to:'11:59'};
 const requests=[['read_catalog',{query:'Peluqueria Maria'}],['read_services',{business_id:B,query:'corte'}],['read_availability',args]];
 f.setReply((_body,count)=>({status:'completed',usage:{input_tokens:100,output_tokens:20},
  output:[{type:'function_call',name:requests[count-1][0],call_id:'call_'+count,arguments:JSON.stringify(requests[count-1][1])}]}));
 const result=await f.response.respondCentral(f.authorization,[{role:'user',text:'Quiero cortarme el pelo el 2 de diciembre por la mañana en Peluquería María'}],new AbortController().signal,R,'Europe/Madrid');
 assert.equal(f.providers.length,3);assert.match(result.answer,/Te propongo/);assert.match(result.answer,/Peluquería María/);
 assert.match(result.answer,/Corte/);assert.match(result.answer,/12.00 EUR/);
 assert.equal(f.calls.some(call=>call.url.endsWith('/bookings/catalog')),false);
});

test('a later alternative reuses conversation context and requests a later real slot',async()=>{
 const f=fixture();f.setBookingsEnabled('false');
 f.setReply({status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{type:'function_call',name:'read_availability',call_id:'later',
  arguments:JSON.stringify({business_id:B,service_ids:[S],date:'2026-12-02',staff_id:null,time_from:'10:01',time_to:null})}]});
 const reply=await f.response.respondCentral(f.authorization,[
  {role:'user',text:'Quiero cortarme el pelo el 2 de diciembre en Peluquería María'},
  {role:'assistant',text:'Te propongo a las 10:00 en Peluquería María. Es un hueco consultado, no una reserva: GO IA todavía no puede confirmarla.'},
  {role:'user',text:'No, mejor un poco más tarde'},
 ],new AbortController().signal,R,'Europe/Madrid');
 assert.match(reply.answer,/11:30/);assert.equal(f.providers.length,1);
 assert.equal(f.providers[0].input.length,3);assert.equal(f.providers[0].input[0].content.includes('Peluquería María'),true);
});

test('read-only mode rejects a provider claim that a requested list confirmed a booking',async()=>{
 const f=fixture();f.setBookingsEnabled('false');
 const args={business_id:B,service_ids:[S],date:'2026-12-02',staff_id:null,time_from:null,time_to:null};
 f.setReply((_body,count)=>count===1?{status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{type:'function_call',name:'read_availability',call_id:'slot',arguments:JSON.stringify(args)}]}
   :{status:'completed',usage:{input_tokens:120,output_tokens:20},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Ya está confirmada tu reserva.'}]}]});
 const answer=await f.response.respondCentral(f.authorization,[{role:'user',text:'Muéstrame varias opciones'}],new AbortController().signal,R,'Europe/Madrid');
 assert.match(answer.answer,/No se ha realizado ninguna reserva/);assert.equal(f.providers.length,2);
});

test('a plain yes to a read-only suggestion never spends tokens or writes a booking',async()=>{
 const f=fixture();f.setBookingsEnabled('false');
 const reply=await f.response.respondCentral(f.authorization,[
  {role:'user',text:'Quiero un corte mañana'},
  {role:'assistant',text:'Te propongo mañana a las once. Es un hueco consultado, no una reserva: GO IA todavía no puede confirmarla.'},
  {role:'user',text:'Sí'},
 ],new AbortController().signal,R,'Europe/Madrid');
 assert.match(reply.answer,/no puedo ejecutar ni confirmar reservas/);
 assert.equal(f.providers.length,0);assert.equal(f.ledger.some(entry=>entry.p_operation==='reserve'),false);
 assert.equal(f.calls.some(call=>call.url.endsWith('/bookings/catalog')),false);
});

test('a DEMO request never silently substitutes a real establishment or spends tokens',async()=>{
 const f=fixture();f.setBookingsEnabled('false');
 const reply=await f.response.respondCentral(f.authorization,[{role:'user',text:'Busca una cita en Peluquería María DEMO'}],new AbortController().signal,R,'Europe/Madrid');
 assert.match(reply.answer,/no está conectado/);assert.equal(f.providers.length,0);assert.equal(f.calls.length,0);
});
test('natural-language tool loop prepares real GO-route data; only explicit confirmation writes, with stable idempotency and truthful PENDING',async()=>{
 const f=fixture(),reply=await f.response.respondCentral(f.authorization,[{role:'user',text:'Reserva un corte el 2 de diciembre a las 10 en mi establecimiento autorizado'}],new AbortController().signal,R);
 assert.equal(f.providers.length,3);assert.equal(reply.metrics.actualMicroUsd,855);assert.equal(reply.proposal.summary.total,12);
 assert.equal(f.calls.filter(c=>c.url.endsWith('/bookings/catalog')).length,0);
 assert.equal(f.ledger.filter(r=>r.p_operation==='reserve').length,1);
 for(const body of f.providers){assert.equal(body.model,'gpt-5.4-mini');assert.equal(body.store,false);assert.equal(body.service_tier,'default');assert.equal(body.max_output_tokens,1200);
  assert.equal(body.tools.map(t=>t.name).join(','),'read_catalog,read_services,read_availability,prepare_booking');assert.equal(body.parallel_tool_calls,false);}
 const result=await f.tools.confirmCentralBooking(f.authorization,reply.proposal.id);assert.equal(result.status,'PENDING');
 await f.tools.confirmCentralBooking(f.authorization,reply.proposal.id);
 const writes=f.calls.filter(c=>c.url.endsWith('/bookings/catalog'));assert.equal(writes.length,1);assert.equal(writes[0].body.request_key,'central_'+reply.proposal.id);
 assert.equal(writes[0].body.customer_id,undefined,'Never impersonate another customer');
});
test('exhausted cumulative budget prevents every provider call; no fallback or automatic retry',async()=>{
 const f=fixture();f.setExhausted(true);await assert.rejects(()=>f.response.respondCentral(f.authorization,[{role:'user',text:'Hola'}],new AbortController().signal,R),/límite acumulado/);assert.equal(f.providers.length,0);
});
test('unknown provider outcome retains maximum reservation; missing usage is not treated as zero cost',async()=>{
 for(const absentUsage of [false,true]){const f=fixture();if(absentUsage)f.setReply({status:'completed',output:[]});else f.setUnknown(true);
  await assert.rejects(()=>f.response.respondCentral(f.authorization,[{role:'user',text:'Hola'}],new AbortController().signal,R));
  const settlement=f.ledger.find(r=>r.p_operation==='settle');assert.equal(settlement.p_payload.certain,false);assert.equal(f.providers.length,1);}
});
test('correction cancels previous draft even before a blocked inference; foreign business IDs never reach GO',async()=>{
 const f=fixture(),reply=await f.response.respondCentral(f.authorization,[{role:'user',text:'Quiero reservar'}],new AbortController().signal,R);
 f.setExhausted(true);await assert.rejects(()=>f.response.respondCentral(f.authorization,[{role:'user',text:'Mejor otro día'}],new AbortController().signal,S));
 await assert.rejects(()=>f.tools.confirmCentralBooking(f.authorization,reply.proposal.id));
 assert.equal(f.calls.filter(c=>c.url.endsWith('/bookings/catalog')).length,0);
 const tool=f.tools.centralBookingTools(f.authorization,R,[B],new AbortController().signal),before=f.calls.length;
 await assert.rejects(()=>tool.run('prepare_booking',JSON.stringify({business_id:K,service_ids:[S],date:'2026-12-02',staff_id:null,starts_at:'2026-12-02T09:00:00Z'})));assert.equal(f.calls.length,before);
 await assert.rejects(()=>tool.run('execute_booking','{}'));
});
test('definite canonical rejection invalidates draft, uncertain submission retains same command for retry',async()=>{
 for(const status of [409,503]){const f=fixture(),reply=await f.response.respondCentral(f.authorization,[{role:'user',text:'Reservar'}],new AbortController().signal,R);
  f.setOpeningError(status);await assert.rejects(()=>f.tools.confirmCentralBooking(f.authorization,reply.proposal.id));
  assert.equal(f.ledger.some(r=>r.p_operation==='rejected'),status===409);
  if(status===503){f.setOpeningError(0);await f.tools.confirmCentralBooking(f.authorization,reply.proposal.id);
   const commands=f.calls.filter(c=>c.url.endsWith('/bookings/catalog')).map(c=>c.body.request_key);assert.equal(commands[0],commands[1]);}}
});
