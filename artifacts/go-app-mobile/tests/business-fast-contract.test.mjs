import{test}from'node:test';import assert from'node:assert/strict';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),{fixture}=require('./helpers/business-fast-fixture.cjs');
const guest={name:'Cliente sintético',phone:'',contactId:null,remember:false};
async function review(f){const context=await f.api.resolveFastContext(f.gateway,f.entry);return f.api.prepareFastReview(context,f.entry,[f.service],f.quote,f.service);}

test('FAST preserves professional/date/minute and delegates the complete service sequence to the existing availability API',async()=>{
 const f=fixture(),r=await review(f);assert.equal(r.slot.startDatetime,'2030-01-07T11:15:00');
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls.find(c=>c[0]==='availability'))),['availability',f.businessId,[f.serviceId],'2030-01-07',f.staffId,{days:1,visualStepMinutes:1}]);
 assert.equal(r.quote.totalPrice,23);assert.equal(r.slot.timingSnapshot.totalClientMinutes,45);
});
test('unavailable exact minute cannot become a neighbouring or invented reservation',async()=>{
 const f=fixture();f.setUnavailable(true);await assert.rejects(review(f),/franja/);assert.equal(f.calls.some(c=>c[0]==='commit'),false);
});
test('a private customer is not a GO identity and duplicate names remain distinct records',async()=>{
 const f=fixture(),context=await f.api.resolveFastContext(f.gateway,f.entry);
 f.setCustomers([{id:f.receiptId,businessId:f.businessId,name:'Ana',phone:'+34000000000'},{id:f.serviceId,businessId:f.businessId,name:'Ana',phone:null}]);
 const rows=await f.api.findFastCustomers(f.gateway,context,'Ana');assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);
 assert.equal((await f.api.findFastCustomers(f.gateway,context,'A')).length,0);
 f.setCustomers([{id:f.receiptId,businessId:f.staffId,name:'Ajena',phone:null}]);await assert.rejects(f.api.findFastCustomers(f.gateway,context,'Ana'),/agenda privada/);
});
test('scope and session changes deny private business context and customer lookups',async()=>{
 const f=fixture();const context=await f.api.resolveFastContext(f.gateway,f.entry);f.setIdentity('other-session');
 await assert.rejects(f.api.findFastCustomers(f.gateway,context,'Ana'),/sesión/);
 f.gateway.resolveContext=async()=>({business:{...f.business,id:f.receiptId},professional:f.professional});
 await assert.rejects(f.api.resolveFastContext(f.gateway,f.entry));
});
test('name is mandatory, phone optional, directory retention opt-in and no owner customer id is fabricated',async()=>{
 const f=fixture(),r=await review(f);assert.throws(()=>f.api.fastCommand(r,{...guest,name:''}),/nombre/);
 const command=f.api.fastCommand(r,guest);assert.equal(command.customer.phone,null);assert.equal(command.customer.remember,false);
 assert.equal('customerId'in command,false);assert.equal('customer_id'in command,false);
 assert.equal(command.quote.totalPrice,23);assert.equal(command.expectedPlan.endsAt,r.slot.endInstant);
});
test('confirmed guest receipt is server-owned, duplicate taps share a request and lost responses retry the same key',async()=>{
 const f=fixture(),r=await review(f),command=f.api.fastCommand(r,guest);let generated=0;
 const commit=f.api.createFastCommitter(f.gateway,()=>`fast_${++generated}`);f.setFailure(true);
 await assert.rejects(commit(command),/CONFLICT/);f.setFailure(false);
 const[a,b]=await Promise.all([commit(command),commit(command)]);assert.equal(a.id,b.id);assert.equal(a.booking.customerId,null);
 const calls=f.calls.filter(c=>c[0]==='commit');assert.equal(calls.length,2);assert.equal(calls[0][2],calls[1][2]);
 await commit(command);assert.equal(f.calls.filter(c=>c[0]==='commit').length,2);
});
test('a result assigned to the owner, another professional or an unconfirmed status is not accepted as a guest success',async()=>{
 for(const change of[{customerId:'owner'},{staffId:null},{status:'PENDING'}]){
  const f=fixture(),r=await review(f),original=f.gateway.commit;f.gateway.commit=async(...args)=>{const result=await original(...args);return{...result,booking:{...result.booking,...change}};};
  await assert.rejects(f.api.createFastCommitter(f.gateway,()=> 'key')(f.api.fastCommand(r,guest)),/confirmar/);
 }
});
