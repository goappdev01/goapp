import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json')),{React,createRoot,document,ts}=require('./tests/helpers/react-lifecycle.cjs');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const projection={exports:{}};vm.runInNewContext(compile(fs.readFileSync('data/customerBookingProjection.ts','utf8')),projection);
const presentation={exports:{}};vm.runInNewContext(compile(fs.readFileSync('data/goEntryPresentation.ts','utf8')),presentation);
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',company='33333333-3333-4333-8333-333333333333',secondCompany='44444444-4444-4444-8444-444444444444',bookingId='55555555-5555-4555-8555-555555555555';
const booking={id:bookingId,businessId:company,bookableItemId:'cut',customerId:other,startDatetime:'2035-01-07T10:00:00',endDatetime:'2035-01-07T11:00:00',status:'CONFIRMED',paymentStatus:'none',changeRevision:3,changeProposal:{id:'proposal',proposedBy:'customer',dateISO:'2035-01-07',time:'12:00'},receipt:{serviceName:'Corte',staffName:'Ana'}};
async function fixture(){
 let user=owner,business=company,model,session,update,revision=0,setVersion;
 const calls=[],listeners=new Set(),businesses=[company,secondCompany].map(id=>({id,name:'Test company',timezone:'UTC',location:'Test street',phone:''}));
 const api={getAuthenticatedUserId:async()=>user,getOwnedBusinesses:async()=>user===owner?businesses:[],getLiveBusinessBookings:async id=>[{...booking,businessId:id}],changeBookingRequest:async(...args)=>{calls.push(args);},subscribeBookingUpdates:fn=>{update=fn;return()=>update=undefined;}};
 const scope={exports:{},Error,console,setInterval:()=>1,clearInterval(){},require:key=>key==='@/data/goEntryPresentation'?presentation.exports:key==='react'?React:key==='react-native'?{AppState:{addEventListener:(_event,fn)=>{listeners.add(fn);return{remove:()=>listeners.delete(fn)};}}}:key==='@/data/booking'?api:key==='@/data/customerBookingProjection'?projection.exports:key==='@/lib/sessionEvents'?{onSessionChanged:fn=>{session=fn;return()=>session=undefined;}}:undefined};
 vm.runInNewContext(compile(fs.readFileSync('hooks/useBusinessBookings.ts','utf8')),scope);
 const settle=async fn=>React.act(async()=>{await fn?.();for(let i=0;i<15;i++)await new Promise(resolve=>setImmediate(resolve));});
 function Fixture(){const [v,set]=React.useState(revision);setVersion=set;model=scope.exports.useBusinessBookings(business,true);return React.createElement('div',null,v);}
 const root=createRoot(document.createElement('div'));await settle(()=>root.render(React.createElement(Fixture)));
 return {get model(){return model},calls,module:scope.exports,settle,async switchCompany(id){business=id;await settle(()=>setVersion(++revision));},async switchUser(id){user=id;await settle(()=>session?.());},async close(){await settle(()=>root.unmount());assert.equal(listeners.size,0);},async update(){await settle(()=>update?.());}};
}
test('business calendar uses the one canonical ID, incoming proposal, current revision and existing server command',async()=>{
 const f=await fixture();try{const entry=f.model.entries[0];assert.equal(entry.reservationId,bookingId);assert.equal(entry.customerBooking,false);assert.equal(entry.businessBooking,true);assert.equal(entry.estado,'propuesto');assert.equal(entry.professionalName,'Ana');assert.equal(entry.bookingChangeRevision,3);
 await f.settle(()=>f.model.mutate(entry,'accept',{acceptFinancialTerms:true}));assert.equal(f.calls.length,1);const [id,op,input,user]=f.calls[0];assert.equal(id,bookingId);assert.equal(op,'accept');assert.equal(input.expectedRevision,3);assert.equal(input.proposalId,'proposal');assert.equal(user,owner);
 }finally{await f.close();}
});
test('business/account changes reject retained callbacks without a write and remove the prior scope',async()=>{
 const f=await fixture();try{const previous=f.model,entry=previous.entries[0];await f.switchCompany(secondCompany);assert.ok(f.model.entries.every(e=>e.businessId===secondCompany));await assert.rejects(previous.mutate(entry,'cancel'),/identidad|empresa/);assert.equal(f.calls.length,0);
 const old=f.model,otherEntry=old.entries[0];await f.switchUser(other);assert.equal(f.model.entries.length,0);await assert.rejects(old.mutate(otherEntry,'cancel'),/identidad|empresa/);assert.equal(f.calls.length,0);
 }finally{await f.close();}
});
test('business canonical merge drops stale cloud mirrors but keeps unrelated GO actions; it writes no local booking copy',async()=>{
 const f=await fixture();try{const canonical=f.model.entries[0],task={id:'task',type:'TAREA'},legacy={id:'go_booking_old',type:'GO_BOOKING',reservationId:bookingId},foreign={...legacy,id:'foreign',reservationId:'66666666-6666-4666-8666-666666666666'};
 const merged=f.module.mergeBusinessBookingEntries([task,legacy,foreign],f.model.entries);assert.equal(merged.length,2);assert.equal(merged[0].id,'task');assert.equal(merged[1].id,canonical.id);assert.equal(f.calls.length,0);
 }finally{await f.close();}
});

test('canonical duration uses elapsed instants across DST, rather than subtracting equal local clock labels',()=>{
 const entry=projection.exports.customerBookingEntry({...booking,startDatetime:'2027-10-31T02:30:00',endDatetime:'2027-10-31T02:30:00',startInstant:'2027-10-31T00:30:00Z',endInstant:'2027-10-31T01:30:00Z'},{id:company,name:'Test',timezone:'Europe/Madrid',location:'',phone:''},{title:'Corte'});
 assert.equal(entry.time,'02:30');assert.equal(entry.endTime,'02:30');assert.equal(entry.duration,'60min');
});
