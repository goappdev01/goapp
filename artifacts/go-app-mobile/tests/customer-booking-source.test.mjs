import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json')),{React,createRoot,document,ts}=require('./tests/helpers/react-lifecycle.cjs');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const projection={exports:{}};vm.runInNewContext(compile(fs.readFileSync('data/customerBookingProjection.ts','utf8')),projection);
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const booking={id:'reservation',businessId:'company',bookableItemId:'cut',customerId:owner,startDatetime:'2030-01-07T10:00:00',endDatetime:'2030-01-07T10:30:00',status:'CONFIRMED',paymentStatus:'none'};
async function fixture({demo=true,error=false,missingBusiness=false}={}){
 let user=owner,enabled=true,model,sessionListener,updates,repoListener,revision=0,change;
 const calls=[],nativeListeners=new Set(),rows=[{...booking}],repo={ownerUserId:owner,store:{subscribe:fn=>{repoListener=fn;return()=>repoListener=undefined;}},getMyBookings:async()=>rows,getCustomerEntries:()=>rows.map(b=>({...projection.exports.customerBookingEntry(b,{name:'GO PELUQUERÍA',phone:'',location:'Murcia',timezone:'Europe/Madrid'},{title:'Corte'}),id:'demo_customer_'+b.id})),cancelBooking:async id=>{calls.push(['demo-cancel',id]);rows[0]={...rows[0],status:'CANCELLED'};repoListener?.();},changeBooking:async(...args)=>calls.push(['demo-change',...args])};
 const api={getAuthenticatedUserId:async()=>user,getLiveCustomerBookings:async()=>{calls.push(['live-read']);if(error)throw Error('Network unavailable');return rows;},getBusinesses:async()=>missingBusiness?[]:[{id:'company',name:'GO PELUQUERÍA',phone:'',location:'Murcia',timezone:'Europe/Madrid'}],getBookableItems:async()=>[{id:'cut',title:'Corte'}],getStaff:async()=>[],cancelBooking:async id=>calls.push(['live-cancel',id]),changeBookingRequest:async(...args)=>calls.push(['live-change',...args]),subscribeBookingUpdates:fn=>{updates=fn;return()=>updates=undefined;}};
 const context={exports:{},Error,console,setInterval:()=>1,clearInterval(){},require:key=>key==='react'?React:key==='react-native'?{AppState:{addEventListener:(_event,fn)=>{nativeListeners.add(fn);return{remove:()=>nativeListeners.delete(fn)};}}}:key==='@/data/booking'?api:key==='@/data/customerBookingProjection'?projection.exports:key==='@/lib/sessionEvents'?{onSessionChanged:fn=>{sessionListener=fn;return()=>sessionListener=undefined;}}:undefined};
 vm.runInNewContext(compile(fs.readFileSync('hooks/useCustomerBookings.ts','utf8')),context);
 const settle=async run=>React.act(async()=>{await run?.();for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));});
 function Fixture(){const [version,set]=React.useState(revision);change=set;model=context.exports.useCustomerBookings(demo?repo:undefined,enabled);return React.createElement('div',null,version);}
 const root=createRoot(document.createElement('div'));await settle(()=>root.render(React.createElement(Fixture)));
 return {get model(){return model},calls,rows,repo,async switchUser(id){user=id;await settle(()=>sessionListener?.());},async disable(){enabled=false;await settle(()=>change(++revision));},async refresh(){await settle(()=>updates?.());},async close(){await settle(()=>root.unmount());assert.equal(nativeListeners.size,0);},settle};
}
test('DEMO client views use the original repository and update after cancellation without touching live APIs',async()=>{
 const f=await fixture();try{assert.equal(f.model.entries.length,1);assert.equal(f.model.entries[0].bookingId,booking.id);assert.equal(f.model.entries[0].contactName,'GO PELUQUERÍA');await f.settle(()=>f.model.mutate(f.model.entries[0],'cancel'));assert.equal(f.model.entries[0].bookingStatus,'cancelada');assert.deepEqual(f.calls,[['demo-cancel',booking.id]]);}finally{await f.close();}
});
test('account/context changes clear the projection and reject an old retained button callback',async()=>{
 const f=await fixture();try{const retained=f.model,entry=f.model.entries[0];await f.switchUser(other);assert.equal(f.model.entries.length,0);await assert.rejects(retained.mutate(entry,'cancel'),/identidad|contexto/);assert.equal(f.calls.length,0);}finally{await f.close();}
 const g=await fixture();try{const retained=g.model,entry=g.model.entries[0];await g.disable();assert.equal(g.model.entries.length,0);await assert.rejects(retained.mutate(entry,'cancel'),/identidad|contexto/);assert.equal(g.calls.length,0);}finally{await g.close();}
});
test('live reads fail visibly instead of adopting a local/demo booking cache',async()=>{
 const f=await fixture({demo:false,error:true});try{assert.equal(f.model.entries.length,0);assert.equal(f.model.error,'Network unavailable');assert.equal(f.calls.filter(c=>c[0]==='demo-cancel').length,0);}finally{await f.close();}
});

test('live reservations keep their canonical ID/card type and do not disappear if the business is no longer public',async()=>{
 for(const missingBusiness of [false,true]){const f=await fixture({demo:false,missingBusiness});try{assert.equal(f.model.entries.length,1);const entry=f.model.entries[0];assert.equal(entry.bookingId,booking.id);assert.equal(entry.type,'GO_BOOKING');assert.equal(entry.kind,'received');assert.equal(entry.contactName,missingBusiness?'Establecimiento no disponible':'GO PELUQUERÍA');await f.settle(()=>f.model.mutate(entry,'cancel'));assert.equal(f.calls.filter(c=>c[0]==='live-change'&&c[2]==='cancel').length,1);assert.equal(f.calls.find(c=>c[0]==='live-change')[3].expectedRevision,0);assert.equal(f.calls.filter(c=>c[0]==='demo-cancel').length,0);}finally{await f.close();}}
});
