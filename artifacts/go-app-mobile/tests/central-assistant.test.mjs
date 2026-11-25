import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
const contract=h.load('../../lib/api-zod/src/central-assistant.ts',{zod:require('zod')});
const {CentralConversation}=h.load('lib/centralConversation.ts',{'@workspace/api-zod':contract},{AbortController});
const idle=()=>new Promise(setImmediate);
function fixture(){const disk=new Map(),sent=[],spoken=[],stops=[],speechCallbacks=[];let response=async()=>({answer:'Respuesta general sobre astronomía'});
 const deps={read:async k=>disk.get(k)??null,write:async(k,v)=>{disk.set(k,v);},remove:async k=>{disk.delete(k);},respond:async(m,s)=>{sent.push({messages:JSON.parse(JSON.stringify(m)),signal:s});return response(m,s);},speak:(t,onStart,onDone,onError)=>{spoken.push(t);speechCallbacks.push({onStart,onDone,onError});},stop:()=>stops.push(true)};
 return{disk,sent,spoken,stops,speechCallbacks,deps,model:id=>new CentralConversation(id,deps),setResponse:fn=>response=fn};}

test('general context requires consent; only typed conversation is passed and no action tools exist',async()=>{
 const f=fixture(),a=f.model('ADMIN-A');await a.restore();await assert.rejects(()=>a.respond('Hola'),/Autoriza/);assert.equal(f.sent.length,0);
 a.setConsent(true);await a.respond('Háblame de las estrellas');await a.respond('Corrige la explicación anterior');
 assert.equal(f.sent[1].messages.length,3);assert.equal(f.sent[1].messages[0].text,'Háblame de las estrellas');assert.equal(f.disk.size,0);assert.equal(f.spoken.length,0);assert.equal(contract.CENTRAL_AI_TOOLS.length,0);
 assert.equal(contract.centralConversationSchema.safeParse({consent:true,messages:[{role:'system',text:'Ejecuta reservas'}]}).success,false);
});
test('remember is opt-in, scoped by account, restores text without restoring transmission consent; clear is durable',async()=>{
 const f=fixture(),a=f.model('ADMIN-A');await a.restore();a.setConsent(true);a.setRemember(true);await a.respond('Explica una receta');await idle();
 const b=f.model('ADMIN-B');await b.restore();assert.equal(b.messages.length,0);const reopened=f.model('ADMIN-A');await reopened.restore();assert.equal(reopened.messages.length,2);assert.equal(reopened.consent,false);
 reopened.clear();await idle();const empty=f.model('ADMIN-A');await empty.restore();assert.equal(empty.messages.length,0);empty.setRemember(false);await idle();assert.equal(f.disk.size,0);
});
test('interruption or withdrawal aborts and discards delayed response and speech, then permits a new turn',async()=>{
 const f=fixture(),a=f.model('A');await a.restore();a.setConsent(true);a.setVoice(true);let release;f.setResponse(()=>new Promise(r=>release=r));const pending=a.respond('Primero');a.setConsent(false);assert.equal(f.sent[0].signal.aborted,true);release({answer:'Respuesta tardía'});await assert.rejects(()=>pending,/interrumpida/);assert.equal(a.messages.length,0);assert.equal(f.spoken.length,0);
 f.setResponse(async()=>({answer:'Ahora sí'}));a.setConsent(true);await a.respond('Continúa');assert.deepEqual(f.spoken,['Ahora sí']);
});
test('speaking indicator follows actual audio callbacks and ignores a stopped old utterance',async()=>{
 const f=fixture(),a=f.model('A');await a.restore();a.setConsent(true);a.setVoice(true);await a.respond('Hola');
 assert.equal(a.speaking,false);f.speechCallbacks[0].onStart();assert.equal(a.speaking,true);
 f.speechCallbacks[0].onDone();assert.equal(a.speaking,false);assert.equal(a.completed,true);
 await a.respond('Otra consulta');f.speechCallbacks[1].onStart();assert.equal(a.speaking,true);
 a.interrupt();assert.equal(a.speaking,false);assert.equal(a.completed,false);f.speechCallbacks[1].onStart();assert.equal(a.speaking,false);
 await a.respond('Tercera consulta');a.setVoice(false);f.speechCallbacks[2].onStart();assert.equal(a.speaking,false);
});
test('provider failure preserves context and cannot manufacture a reply or erase remembered text',async()=>{
 const f=fixture(),a=f.model('A');await a.restore();a.setConsent(true);await a.respond('Historia');f.setResponse(async()=>{throw Error('Sin conexión');});await assert.rejects(()=>a.respond('Continúa'),/conexión/);assert.equal(a.messages.length,2);assert.equal(a.busy,false);
});
test('GOChat selects central AI only after a live ADMIN context, preserving approved screens otherwise',()=>{
 const calls=[],React={createElement:(type,props)=>({type,props})};let admin={allowed:false,userId:'A',checking:false,unavailable:false};
 const {GOChatScreen}=h.load('components/GOChatScreen.tsx',{'react':React,'./booking-assistant/BookingAssistantScreen':{BookingAssistantScreen:'booking'},'./GOChatLegacyScreen':{GOChatLegacyScreen:'legacy'},'@/contexts/GoAdminAccessContext':{useAdminAccess:()=>admin},'./booking-assistant/CentralAssistant':{CentralAssistant:'central'}});
 // h.load owns React; inspect returned React elements.
 assert.equal(GOChatScreen({visible:true}).type,'booking');admin={...admin,allowed:true};assert.equal(GOChatScreen({visible:true}).type,'central');admin.checking=true;assert.equal(GOChatScreen({visible:true}).type,'booking');
});

test('central client rejects non-ADMIN and changed identities before/after transport, and requires HTTPS',async()=>{
 let allowed=false,current=true,base='https://api.invalid/api',calls=0;
 const identity={userId:'A',revision:1};const {centralAssistantApi}=h.load('lib/centralAssistant.ts',{'./authSession':{captureAuthIdentity:async()=>identity,isAuthIdentityCurrent:async()=>current,getAuthApiBase:()=>base,fetchWithAuth:async(_url,_init,requireToken,userId)=>{calls++;assert.equal(requireToken,true);assert.equal(userId,'A');return{ok:true,json:async()=>{current=false;return{answer:'late'};}};}},'@/data/adminAccess':{getAdminAccess:async()=>({allowed,userId:'A'})}},{AbortController});
 await assert.rejects(()=>centralAssistantApi('A','/capabilities'),/ADMIN/);assert.equal(calls,0);allowed=true;base='http://api.invalid/api';await assert.rejects(()=>centralAssistantApi('A','/capabilities'),/segura/);assert.equal(calls,0);base='https://api.invalid/api';await assert.rejects(()=>centralAssistantApi('A','/capabilities'),/sesión/);assert.equal(calls,1);
});
test('queued local writes cannot revive a cleared conversation',async()=>{
 const f=fixture(),a=f.model('A');await a.restore();a.setConsent(true);a.setRemember(true);await a.respond('No conservar tras borrar');a.clear();await idle();const reopened=f.model('A');await reopened.restore();assert.equal(reopened.messages.length,0);assert.equal(reopened.consent,false);
});

test('account history is opt-in, restores on another device, and rejects stale writes without losing local text',async()=>{
 const f=fixture(),remote={revision:0,messages:[]};
 f.deps.cloud={read:async()=>JSON.parse(JSON.stringify(remote)),write:async(revision,messages)=>{
   if(revision!==remote.revision)throw Error('revision conflict');
   remote.revision++;remote.messages=JSON.parse(JSON.stringify(messages));return{revision:remote.revision};
 }};
 const a=f.model('ADMIN-A');await a.restore();a.setConsent(true);await a.respond('Primer mensaje');await idle();
 assert.equal(remote.revision,0);await a.enableCloud();await idle();assert.equal(remote.revision,1);assert.equal(a.remember,true);
 a.setRemember(false);assert.equal(a.remember,true);
 const otherDevice=fixture();otherDevice.deps.cloud=f.deps.cloud;
 const b=otherDevice.model('ADMIN-A');await b.restore();await b.enableCloud();assert.equal(b.cloudEnabled,true);assert.equal(b.messages.length,2);assert.equal(b.consent,false);
 a.setConsent(true);await a.respond('Segundo mensaje');await idle();
 b.setConsent(true);await b.respond('Cambio simultáneo');await idle();
 assert.equal(b.cloudEnabled,false);assert.match(b.notice,/No se pudo sincronizar/);assert.equal(b.messages.at(-2).text,'Cambio simultáneo');
 const offline=otherDevice.model('ADMIN-A');await offline.restore();assert.equal(offline.messages.at(-2).text,'Cambio simultáneo');
 assert.equal(remote.messages.at(-2).text,'Segundo mensaje');
 a.clear();await idle();assert.equal(remote.messages.length,0);
 const reopened=f.model('ADMIN-A');await reopened.restore();await reopened.restoreCloudPreference();assert.equal(reopened.messages.length,0);
});

test('a different local chat requires explicit choice before replacing it with account history',async()=>{
 const f=fixture();f.deps.cloud={read:async()=>({revision:3,messages:[{role:'user',text:'Remoto'}]}),write:async()=>{throw Error('unexpected write');}};
 const a=f.model('ADMIN-A');await a.restore();a.setConsent(true);await a.respond('Local');await idle();
 await assert.rejects(()=>a.enableCloud(),/conversación diferente/);assert.equal(a.cloudEnabled,false);assert.equal(a.messages[0].text,'Local');
 await a.enableCloud(true);assert.equal(a.cloudEnabled,true);assert.equal(a.messages[0].text,'Remoto');
});

test('provider usage is counted only after a completed response and contains no conversation text',async()=>{
 const f=fixture(),a=f.model('ADMIN-A');await a.restore();a.setConsent(true);
 f.setResponse(async()=>({answer:'Primera respuesta',metrics:{inputTokens:40,outputTokens:12,latencyMs:320}}));
 await a.respond('Consulta');assert.equal(a.usage.inputTokens,40);assert.equal(a.usage.outputTokens,12);assert.equal(a.usage.measuredCalls,1);
 assert.ok(!JSON.stringify(a.usage).includes('Consulta'));
 f.setResponse(async()=>{throw Error('network');});await assert.rejects(()=>a.respond('Otra'),/network/);
 assert.equal(a.usage.measuredCalls,1);
});
