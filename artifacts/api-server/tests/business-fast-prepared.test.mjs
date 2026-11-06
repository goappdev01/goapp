import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('../../../artifacts/go-app-mobile/node_modules/typescript');
const scope={exports:{},Error};vm.runInNewContext(ts.transpileModule(readFileSync('src/prepared/businessFast.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,actor=id(1),business=id(2),staff=id(3),service=id(4),contact=id(5);
function fixture(){let state={operations:[],contacts:[],bookings:[]},queue=Promise.resolve(),badReceipt=false,deny=false,changed=false,fail=false;const calls=[];
 const plan={serviceIds:[service],staffId:staff,startsAt:'2030-01-07T10:15:00Z',endsAt:'2030-01-07T11:00:00Z',totalPrice:23,totalClientMinutes:45};
 const command={businessId:business,staffId:staff,serviceIds:[service],startsAt:plan.startsAt,expectedPlan:plan,customer:{name:'Cliente sintético',phone:null,contactId:null,remember:false}};
 const store={transaction(body){const operation=queue.then(async()=>{const before=structuredClone(state);
  const tx={lockBusiness:async value=>{calls.push(['lock',value]);},mayManage:async(a,b,s)=>!deny&&a===actor&&b===business&&(!s||s===staff),
   operation:async(a,b,k)=>state.operations.find(o=>o.actorId===a&&o.businessId===b&&o.requestId===k)||null,saveOperation:async o=>state.operations.push(o),
   contact:async(b,k)=>state.contacts.find(c=>c.businessId===b&&c.id===k)||null,searchContacts:async(b,q)=>state.contacts.filter(c=>c.businessId===b&&c.name.includes(q)),
   saveContact:async(b,k,name,phone)=>{const row={id:k||contact,businessId:b,name,phone};state.contacts=state.contacts.filter(c=>c.id!==row.id);state.contacts.push(row);return row;},
   plan:async(...args)=>{calls.push(['canonical-plan',...args]);if(state.bookings.some(b=>b.staffId===staff&&b.startsAt===plan.startsAt))throw Error('BOOKING_CONFLICT');return changed?{...plan,totalPrice:25}:plan;},
   insertGuest:async(c,p,contactId,requestId)=>{if(fail)throw Error('PERSISTENCE_FAILED');const receipt={id:id(20),businessId:c.businessId,staffId:c.staffId,customerId:null,status:'CONFIRMED',contactId,requestId,plan:p};state.bookings.push({...receipt,startsAt:c.startsAt});return badReceipt?{...receipt,customerId:actor}:receipt;}};
  try{return await body(tx);}catch(error){state=before;throw error;}});queue=operation.catch(()=>{});return operation;}};
 return{api:scope.exports.createGuestBookingService(store),store,command,plan,calls,get state(){return state;},setFail:v=>fail=v,setDeny:v=>deny=v,setChanged:v=>changed=v,setBadReceipt:v=>badReceipt=v};
}
test('prepared service uses canonical planner in the write transaction, reuses one receipt and recovers after interruption',async()=>{
 const f=fixture();const [a,b]=await Promise.all([f.api.confirm(actor,f.command,'same'),f.api.confirm(actor,f.command,'same')]);assert.equal(a.id,b.id);assert.equal(f.state.bookings.length,1);assert.equal(f.calls.filter(c=>c[0]==='canonical-plan').length,1);assert.equal(a.customerId,null);
 const reopened=scope.exports.createGuestBookingService(f.store);assert.equal((await reopened.recover(actor,business,'same')).id,a.id);await assert.rejects(reopened.confirm(actor,{...f.command,customer:{...f.command.customer,name:'Otra persona'}},'same'),/REQUEST_REUSED/);
});
test('permission, contacts and recovery are scoped to server actor/business, never name or phone',async()=>{
 const f=fixture();for(const a of ['',id(90)])await assert.rejects(f.api.confirm(a,f.command,'x'));
 await assert.rejects(f.api.confirm(actor,{...f.command,businessId:id(80)},'x'),/FORBIDDEN/);
 await assert.rejects(f.api.confirm(actor,{...f.command,customer:{...f.command.customer,contactId:id(99)}},'x'),/CONTACT_UNAVAILABLE/);assert.equal(f.state.bookings.length,0);
 await assert.rejects(f.api.findCustomers(id(90),business,'Cliente'),/FORBIDDEN/);await assert.rejects(f.api.recover(id(90),business,'x'),/FORBIDDEN/);
});
test('price/duration are revalidated, transaction rollback preserves contacts and creates no partial reservation',async()=>{
 const f=fixture();f.setChanged(true);await assert.rejects(f.api.confirm(actor,f.command,'x'),/SELECTION_STALE/);assert.equal(f.state.bookings.length,0);
 f.setChanged(false);f.setFail(true);await assert.rejects(f.api.confirm(actor,{...f.command,customer:{...f.command.customer,remember:true}},'x'),/PERSISTENCE_FAILED/);assert.equal(f.state.contacts.length,0);assert.equal(f.state.operations.length,0);
 f.setFail(false);f.setBadReceipt(true);await assert.rejects(f.api.confirm(actor,f.command,'x'),/INVALID_RECEIPT/);assert.equal(f.state.bookings.length,0);
});
test('competing commands use shared occupancy; remembering is explicit and retries do not duplicate contact',async()=>{
 const f=fixture(),command={...f.command,customer:{...f.command.customer,remember:true}};await f.api.confirm(actor,command,'one');await f.api.confirm(actor,command,'one');assert.equal(f.state.contacts.length,1);
 const rows=await f.api.findCustomers(actor,business,'Cliente');assert.equal(rows[0].phone,null);assert.equal(rows[0].businessId,business);
 await assert.rejects(f.api.confirm(actor,command,'another'),/CONFLICT/);assert.equal(f.state.bookings.length,1);
});
