import {test} from 'node:test';
import assert from 'node:assert/strict';
import {supportFiles} from './helpers/support-files.mjs';
test('verified private copies preview locally and removing one preserves originals and other stores',async()=>{
 const f=supportFiles(),a=f.create(),b=f.create(),source=f.asset();
 const first=await a.importAsset(source),second=await b.importAsset(source);
 assert.ok(first.uri.startsWith('file:///private/cache/go-support/'));assert.notEqual(first.uri,second.uri);
 assert.equal(first.size,128);await a.remove(first.id);assert.equal(f.data.has(first.uri),false);assert.equal(f.data.has(source.uri),true);assert.equal(f.data.has(second.uri),true);
 await a.remove(second.id);assert.equal(f.data.has(second.uri),true);await b.dispose();assert.equal(f.data.has(second.uri),false);assert.equal(f.data.has(source.uri),true);
});
test('native file types, names, actual sizes and limits are checked before import',async()=>{
 const f=supportFiles(),s=f.create();
 for(const asset of [{...f.asset(),uri:'https://example.org/a.jpg'},f.asset('bad.exe',1,'image/jpeg'),f.asset('a.pdf',0,'application/pdf'),f.asset('a.pdf',10*1024*1024+1,'application/pdf'),{...f.asset(),size:1},f.asset('x.gif',2,'image/gif')])await assert.rejects(s.importAsset(asset));
 assert.equal(f.copied.length,0);
 for(let i=0;i<5;i++)await s.importAsset(f.asset(i+'.jpg'));
 await assert.rejects(s.importAsset(f.asset('six.jpg')));await s.dispose();await assert.rejects(s.importAsset(f.asset()));
 const total=f.create();await total.importAsset(f.asset('1.pdf',10*1024*1024,'application/pdf'));await total.importAsset(f.asset('2.pdf',10*1024*1024,'application/pdf'));
 await assert.rejects(total.importAsset(f.asset('3.pdf',6*1024*1024,'application/pdf')));
});
test('failed copy verification and account disposal cannot retain imported content',async()=>{
 const f=supportFiles(),s=f.create(),source=f.asset();const copy=f.fs.copyAsync;
 f.fs.copyAsync=async args=>{await copy(args);f.data.set(args.to,3);};await assert.rejects(s.importAsset(source));assert.equal([...f.data.keys()].filter(k=>k.includes('/go-support/')).length,0);
 f.fs.copyAsync=async args=>{await copy(args);await s.dispose();};await assert.rejects(s.importAsset(source));assert.equal([...f.data.keys()].filter(k=>k.includes('/go-support/')).length,0);assert.equal(f.data.has(source.uri),true);
});
