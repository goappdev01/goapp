import{test}from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import vm from'node:vm';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),{fixture}=require('./helpers/business-fast-fixture.cjs');
const scope={exports:{},URL,process:{env:{}}};vm.runInNewContext(ts.transpileModule(readFileSync('data/bookingConfirmationShare.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);
const api=scope.exports;
async function confirmed(){const f=fixture(),context=await f.api.resolveFastContext(f.gateway,f.entry),review=await f.api.prepareFastReview(context,f.entry,[f.service],f.quote,f.service);return{...f,booking:(await f.gateway.commit(f.api.fastCommand(review,{name:'Cliente sintético',phone:'',contactId:null,remember:false}),'key')).booking};}
test('no configured official download means no fake link, QR payload or installation demand',async()=>{
 assert.equal(api.officialGoDiscoveryLink(),null);const f=await confirmed();const message=api.bookingConfirmationMessage(f.booking,f.business,f.professional.name,null);
 assert.match(message,/RESERVA CONFIRMADA/);assert.match(message,/Lavado \+ Corte/);assert.match(message,/11:15–12:00/);assert.match(message,/23\.00 EUR/);
 assert.equal(message.includes('http'),false);assert.ok(message.includes('Referencia: '+f.receiptId));
});
test('an explicitly reviewed public HTTPS URL can be clickable; it contains no booking or customer claims',async()=>{
 const link='https://go.example.com/app';const f=await confirmed(),message=api.bookingConfirmationMessage(f.booking,f.business,f.professional.name,link);
 assert.match(message,/https:\/\/go\.example\.com\/app/);assert.ok(message.includes('Referencia: '+f.receiptId));
 for(const value of['go-app://download','http://insecure.example.com','https://user:password@example.com','https://example.com/?phone=private','https://example.com/#token','https://127.0.0.1/app','https://download.invalid'])assert.equal(api.officialGoDiscoveryLink(value),null);
});
test('unconfirmed/foreign reservations cannot generate successful messages',async()=>{
 const f=await confirmed();assert.throws(()=>api.bookingConfirmationMessage({...f.booking,status:'PENDING'},f.business,'',null));
 assert.throws(()=>api.bookingConfirmationMessage({...f.booking,businessId:f.staffId},f.business,'',null));
});
test('WhatsApp prepares a composer URL only for explicit international numbers and never sends',()=>{
 const message='RESERVA CONFIRMADA\n11:15 & 23 €';const url=api.whatsappConfirmationURL('+34 000 000 000',message);
 assert.equal(new URL(url).hostname,'wa.me');assert.equal(new URL(url).searchParams.get('text'),message);
 for(const phone of['000000000','', 'malformed'])assert.equal(api.whatsappConfirmationURL(phone,message),null);
});
test('PNG preparation shares the actual image and text, then cleans only its temporary directory on cancellation',async()=>{
 const calls=[],png='iVBORw0KGgoAAA==',renderer={toDataURL:callback=>callback(png)};
 const deps={cacheDirectory:'file:///private/',makeDirectoryAsync:async dir=>calls.push(['mkdir',dir]),writeAsStringAsync:async(...args)=>calls.push(['write',...args]),deleteAsync:async dir=>calls.push(['delete',dir]),share:async content=>{calls.push(['share',content]);return{action:'dismissedAction'}},stillCurrent:()=>true};
 await api.shareConfirmationImage(renderer,'RESERVA CONFIRMADA',deps);
 assert.equal(calls[1][2],png);assert.equal(calls[1][3].encoding,'base64');assert.equal(calls[2][1].url,calls[1][1]);assert.equal(calls[2][1].message,'RESERVA CONFIRMADA');assert.equal(calls[3][1],calls[0][1]);
});
test('invalid images, revoked context and native share errors cannot claim delivery or keep temporary files',async()=>{
 const calls=[];let current=true;
 const deps={cacheDirectory:'file:///private/',makeDirectoryAsync:async()=>{},writeAsStringAsync:async()=>{current=false;},deleteAsync:async()=>calls.push('delete'),share:async()=>calls.push('share'),stillCurrent:()=>current};
 await assert.rejects(api.shareConfirmationImage({toDataURL:cb=>cb('not-png')},'text',deps));assert.equal(calls.length,0);
 await assert.rejects(api.shareConfirmationImage({toDataURL:cb=>cb('iVBORw0KGgoAAA==')},'text',deps));assert.deepEqual(calls,['delete']);
 current=true;deps.writeAsStringAsync=async()=>{};deps.share=async()=>{throw Error('cancelled')};await assert.rejects(api.shareConfirmationImage({toDataURL:cb=>cb('iVBORw0KGgoAAA==')},'text',deps));assert.deepEqual(calls,['delete','delete']);
});
