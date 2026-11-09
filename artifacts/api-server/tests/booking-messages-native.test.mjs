import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {ids,schema} from './helpers/booking-messages-fixture.mjs';
const run=promisify(execFile),bin=process.env.GO_MESSAGES_TEST_PG_BIN;
test('native isolated PostgreSQL: two-way booking messages survive a server restart without changing bookings',{skip:!bin},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'go-messages-native-')),data=path.join(dir,'database');
 const exe=name=>path.join(bin,name+(process.platform==='win32'?'.exe':''));
 const command=(name,args)=>run(exe(name),args,{windowsHide:true,timeout:60000,maxBuffer:2e6});
 const listener=net.createServer();await new Promise(done=>listener.listen(0,'127.0.0.1',done));
 const port=listener.address().port;await new Promise(done=>listener.close(done));
 const sql=async text=>{const file=path.join(dir,'step.sql');await writeFile(file,text);
  return(await command('psql',['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1','-f',file])).stdout.trim();};
 const as=async(actor,query)=>{const out=await sql("begin;set local role authenticated;select set_config('request.jwt.claim.sub','"+actor+"',true);"+query+";commit;");
  return JSON.parse(out.split(/\r?\n/).filter(line=>line.startsWith('{')||line.startsWith('[')).at(-1));};
 const key=n=>'99999999-9999-4999-8999-'+String(n).padStart(12,'0');
 const send=(actor,n,text)=>as(actor,"select public.go_send_booking_message('"+ids.booking+"','"+key(n)+"','"+text+"')");
 let started=false;
 try{
  await command('initdb',['-D',data,'-U','postgres','-A','trust','--locale=C','-E','UTF8']);
  const start=()=>command('pg_ctl',['-D',data,'-l',path.join(dir,'postgres.log'),'-w','-o','-h 127.0.0.1 -p '+port,'start']);
  await start();started=true;await sql(schema);await sql(await readFile('supabase/drafts/booking_messages_v1.sql','utf8'));
  const before=await sql('select jsonb_agg(to_jsonb(b) order by id) from public.bookings b');
  await send(ids.customer,1,'Synthetic message A');await send(ids.owner,2,'Synthetic message B');
  assert.equal((await send(ids.customer,1,'Synthetic message A')).messages.length,2);
  await assert.rejects(send(ids.customer,1,'Changed retry'));
  for(const actor of [ids.third,ids.employee]){
   await assert.rejects(as(actor,"select public.go_booking_conversations('"+ids.booking+"')"));await assert.rejects(send(actor,3,'Forbidden'));
  }
  await assert.rejects(sql("set role anon;select public.go_booking_conversations('"+ids.booking+"')"));
  await command('pg_ctl',['-D',data,'-w','-m','fast','stop']);started=false;await start();started=true;
  const restored=await as(ids.customer,"select public.go_booking_conversations('"+ids.booking+"')");
  assert.deepEqual(restored[0].messages.map(message=>message.text),['Synthetic message A','Synthetic message B']);
  assert.equal(await sql('select jsonb_agg(to_jsonb(b) order by id) from public.bookings b'),before);
 }finally{if(started)await command('pg_ctl',['-D',data,'-w','-m','fast','stop']);}
});
