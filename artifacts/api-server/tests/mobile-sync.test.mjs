import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('mobile saves cloud records, preserves form fields, archives and reports failures', async () => {
 const dir=await mkdtemp(path.join(tmpdir(),'go-mobile-sync-'));
 const outfile=path.join(dir,'booking.mjs');
 const storage=new Map();globalThis.__storageMock={getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v)};
 await build({entryPoints:['../go-app-mobile/data/booking.ts'],outfile,bundle:true,platform:'node',format:'esm',plugins:[{name:'storage-mock',setup(b){b.onResolve({filter:/^@react-native-async-storage\/async-storage$/},()=>({path:'storage',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export default globalThis.__storageMock;',loader:'js'}));}}]});
 const api=await import(pathToFileURL(outfile));const original=globalThis.fetch;
 const user='11111111-1111-4111-8111-111111111111',business='22222222-2222-4222-8222-222222222222',service='33333333-3333-4333-8333-333333333333';
 storage.set('go_supabase_session_v1',JSON.stringify({access_token:'test',user:{id:user}}));
 let fail=false;let serviceRow;let writes=0,maxWrites=0;const requests=[];
 globalThis.fetch=async(url,init)=>{
  const route=String(url).replace(/^.*\/supabase\/manage/,'');requests.push({route,init});
  assert.equal(init.headers.get('Authorization'),'Bearer test');
  if(fail)return Response.json({error:'Sin conexión al servicio'},{status:503});
  const body=init.body?JSON.parse(init.body):null;
  if(init.method==='POST'||init.method==='PATCH'){
   writes++;maxWrites=Math.max(maxWrites,writes);await new Promise(r=>setTimeout(r,5));writes--;
  }
  if(route==='/businesses')return Response.json([{id:business,name:'Piloto',timezone:'Europe/Madrid',...(body??{}),ui_metadata:body?.ui_metadata??{phone:'123',bookingColor:'#123456'}}]);
  if(route.endsWith('/services')&&init.method==='POST'){serviceRow={id:service,business_id:business,...body};return Response.json([serviceRow]);}
  if(route.endsWith('/services')&&!init.method)return Response.json(serviceRow?[serviceRow]:[]);
  if(route.endsWith('/services/'+service)){serviceRow={...serviceRow,...body};return Response.json([serviceRow]);}
  if(route.endsWith('/availability'))return Response.json([{id:service,business_id:business,...body}]);
  if(route.endsWith('/staff'))return Response.json([{id:service,business_id:business,...body}]);
  if(route==='/configuration')return Response.json([{business_id:business,payload:{businessName:'Piloto'}}]);
  if(route.endsWith('/configuration'))return Response.json([{business_id:business,...body}]);
  if(route==='/businesses/'+business)return Response.json([{id:business,...body}]);
  throw new Error('Unexpected route '+route);
 };
 try{
  const data={name:'Piloto',category:'Salón',location:'Madrid',phone:'123',bookingActive:false,bookingColor:'#123456',timezone:'Europe/Madrid'};
  const b=await api.createOwnedBusiness(data,user);assert.equal(b.id,business);assert.equal(b.phone,'123');
  await assert.rejects(api.createOwnedBusiness(data,'different-account'),api.BookingAuthenticationError);
  const item=await api.createBookableItem({businessId:business,title:'Corte',type:'hair',durationMinutes:30,customerCapacity:1,unitQuantity:1,price:25,paymentRequired:false,active:true,visible:true});
  assert.equal(item.id,service);assert.equal(item.type,'hair');
  await Promise.all([api.saveBookableItem({...item,price:26}),api.saveBookableItem({...item,price:27})]);
  assert.equal(maxWrites,1);assert.equal(serviceRow.price,27);
  await api.deleteBookableItem(item.id,business);assert.equal(serviceRow.active,false);assert.equal(serviceRow.ui_metadata.archived,true);assert.equal(serviceRow.ui_metadata.type,'hair');
  assert.deepEqual(await api.getOwnedBookableItems(business),[]);
  const w=await api.createAvailabilityWindow({businessId:business,weekday:1,shiftIndex:1,visibleStartHour:15,visibleStartMinute:30,visibleEndHour:18,active:true});
  assert.equal(w.shiftIndex,1);assert.equal(w.visibleStartMinute,30);
  const staff=await api.createStaff({businessId:business,name:'Ana',active:true,serviceIds:[service],emoji:'A'});assert.deepEqual(staff.serviceIds,[service]);
  assert.equal((await api.getCloudConfiguration()).businessId,business);
  await api.saveCloudConfiguration(business,{businessName:'Piloto'});
  fail=true;await assert.rejects(api.saveBusiness(b),e=>e.status===503);assert.equal(storage.has('go_businesses_v1'),false);
  storage.delete('go_supabase_session_v1');await assert.rejects(api.getOwnedBusinesses(),api.BookingAuthenticationError);
 }finally{globalThis.fetch=original;delete globalThis.__storageMock;await rm(dir,{recursive:true,force:true});}
});
