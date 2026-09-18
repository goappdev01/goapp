import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('owner management denies cross-business writes and preserves server-owned fields', async () => {
 const dir=await mkdtemp(path.join(tmpdir(),'go-manage-'));
 const outfile=path.join(dir,'router.mjs');
 await build({entryPoints:['src/routes/management.ts'],outfile,bundle:true,platform:'node',format:'esm',banner:{js:`import {createRequire} from 'node:module';const require=createRequire(import.meta.url);`}});
 const {default:router}=await import(pathToFileURL(outfile));
 const {default:express}=await import('express');const app=express();app.use(express.json());app.use(router);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const fetchOriginal=globalThis.fetch;process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='test';
 const id='11111111-1111-4111-8111-111111111111';let owner=true,writes=[];
 globalThis.fetch=async(url,init)=>{
  if(!String(url).startsWith('https://test.invalid'))return fetchOriginal(url,init);
  const u=new URL(url);
  if(u.pathname.endsWith('/user'))return Response.json({id});
  if(init.method==='GET'&&u.pathname.endsWith('/businesses')){assert.equal(u.searchParams.get('owner_id'),`eq.${id}`);return Response.json(owner?[{id,timezone:'Europe/Madrid'}]:[]);}
  if(init.method==='GET'&&u.pathname.endsWith('/staff'))return Response.json([]);
  writes.push(JSON.parse(init.body));return Response.json([{id,...writes.at(-1)}],{status:init.method==='POST'?201:200});
 };
 const req=(route,body,auth=true,method='POST')=>fetchOriginal(`http://127.0.0.1:${server.address().port}${route}`,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer test'}:{})},body:JSON.stringify(body)});
 try{
  assert.equal((await req('/businesses',{name:'Piloto'},false)).status,401);
  assert.equal((await req('/businesses',{name:'Piloto',owner_id:id})).status,400);
  assert.equal((await req('/businesses',{name:'Piloto',verified:true})).status,400);
  assert.equal((await req('/businesses',{name:'Piloto'})).status,201);
  assert.equal(writes[0].owner_id,id);assert.equal(writes[0].booking_enabled,false);
  assert.equal((await req(`/businesses/${id}/services`,{name:'Cita',duration_minutes:30,price:25})).status,201);
  assert.equal(writes.at(-1).currency,'EUR');assert.equal(writes.at(-1).business_id,id);
  assert.equal((await req(`/businesses/${id}/services`,{name:'Cita',duration_minutes:0,price:25})).status,400);
  assert.equal((await req(`/businesses/${id}/availability`,{weekday:1,start_time:'10:00',end_time:'09:00'})).status,400);
  assert.equal((await req(`/businesses/${id}/availability`,{weekday:1,start_time:'09:00',end_time:'10:00',staff_id:id})).status,400);
  owner=false;const count=writes.length;
  assert.equal((await req(`/businesses/${id}/services`,{name:'Cita',duration_minutes:30,price:25})).status,404);
  assert.equal((await req(`/businesses/${id}`,{name:'Intruso'},true,'PATCH')).status,404);
  assert.equal(writes.length,count);
 }finally{globalThis.fetch=fetchOriginal;await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
