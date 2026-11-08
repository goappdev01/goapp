import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
test('draft repository serializes durable snapshots, isolates account/company and preserves explicit empty text',async()=>{
 const disk=new Map();let fail=false;const scope={exports:{},require(name){if(name==='@react-native-async-storage/async-storage')return{__esModule:true,default:{
  getItem:async key=>disk.get(key)??null,setItem:async(key,value)=>{await new Promise(setImmediate);if(fail)throw Error('disk unavailable');disk.set(key,value);}}};throw Error(name);}};
 vm.runInNewContext(ts.transpileModule(readFileSync('data/supportDrafts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,scope);
 const {saveSupportDraft:save,loadSupportDraft:load,supportDraftScope:key}=scope.exports;
 const snapshot={drafts:{incident:'draft',improvement:'',help:''},files:{incident:[],improvement:[],help:[]},pending:{}};
 const personal=key('alice'),business=key('alice','company');
 const first=save(personal,snapshot);snapshot.drafts.incident='';const second=save(personal,snapshot);
 await Promise.all([first,second]);assert.equal((await load(personal)).drafts.incident,'');
 assert.equal(await load(business),null);assert.equal(await load(key('bob')),null);
 fail=true;await assert.rejects(save(personal,snapshot),/disk unavailable/);fail=false;
 snapshot.drafts.incident='recovered';await save(personal,snapshot);assert.equal((await load(personal)).drafts.incident,'recovered');
 snapshot.files.incident=[{id:'../outside',uri:'file:///other',name:'bad.pdf',mime:'application/pdf',size:1}];
 await assert.rejects(save(personal,snapshot),/inválido/);assert.equal((await load(personal)).drafts.incident,'recovered');
});
