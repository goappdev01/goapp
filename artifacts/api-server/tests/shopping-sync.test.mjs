import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

test('shopping API checks the authenticated owner, isolates reads and uses revisioned Supabase writes',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'go-shopping-api-')),outfile=path.join(dir,'route.mjs');
  const original={fetch:globalThis.fetch,url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY};
  let server;
  try{
    await build({entryPoints:['src/routes/shopping.ts'],outfile,bundle:true,platform:'node',format:'esm',
      banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
    const {default:router}=await import(pathToFileURL(outfile));
    const {default:express}=await import('express');
    const app=express();app.use(express.json());app.use('/shopping',router);
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}/shopping`,owner='11111111-1111-4111-8111-111111111111';
    process.env.SUPABASE_URL='https://supabase.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='public-key';
    const calls=[];globalThis.fetch=async(url,init)=>{
      const target=new URL(url);calls.push({target,init});
      if(target.pathname==='/auth/v1/user')return Response.json({id:owner});
      if(target.pathname==='/rest/v1/go_shopping_snapshots')return Response.json([]);
      if(target.pathname==='/rest/v1/rpc/go_shopping_save')return Response.json(1);
      throw Error('Unexpected remote request');
    };
    assert.equal((await original.fetch(base+'?context=demo%3AUSER')).status,401);
    const auth={Authorization:'Bearer fake-jwt','Content-Type':'application/json'};
    const read=await original.fetch(base+'?context=demo%3AUSER',{headers:auth});
    assert.deepEqual(await read.json(),{revision:0,lists:[],activeListId:null});
    const select=calls.find(call=>call.target.pathname==='/rest/v1/go_shopping_snapshots');
    assert.equal(select.target.searchParams.get('user_id'),`eq.${owner}`);
    assert.equal(select.target.searchParams.get('context'),'eq.demo:USER');
    assert.equal(select.init.headers.Authorization,auth.Authorization);
    const row={id:'list-1',ownerUserId:owner,taskContext:'demo:USER',note:{shopping:{version:1}}};
    const write=body=>original.fetch(base,{method:'PUT',headers:auth,body:JSON.stringify(body)});
    assert.equal((await write({context:'demo:USER',expectedRevision:0,lists:[{...row,ownerUserId:'other'}],activeListId:'list-1'})).status,400);
    assert.equal((await write({context:'demo:USER',expectedRevision:0,lists:[row],activeListId:'list-1'})).status,200);
    const rpc=calls.find(call=>call.target.pathname==='/rest/v1/rpc/go_shopping_save');
    assert.equal(rpc.init.headers.Authorization,auth.Authorization);
    assert.equal(JSON.parse(rpc.init.body).p_expected,0);
    assert.equal((await write({context:'demo:USER',expectedRevision:0,lists:[row,row],activeListId:'list-1'})).status,400);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));globalThis.fetch=original.fetch;
    if(original.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=original.url;
    if(original.key===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=original.key;
    await rm(dir,{recursive:true,force:true});
  }
});

test('shopping migration gives each owner private RLS and rejects destructive SQL',async()=>{
  const sql=await readFile('supabase/migrations/20261125190000_go_shopping_snapshots.sql','utf8');
  assert.match(sql,/enable row level security/);
  assert.match(sql,/user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql,/security invoker/);
  assert.match(sql,/revision = p_expected/);
  assert.doesNotMatch(sql,/drop table|truncate|delete from/i);
});
