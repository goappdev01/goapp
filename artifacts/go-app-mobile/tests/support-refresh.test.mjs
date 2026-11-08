import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
test('support lifecycle refreshes only active visible screens and invalidates identity before refresh',()=>{
 let ref,cleanup,listener,session,timer,removed=0;const calls=[];
 const scope={exports:{},require(name){
  if(name==='react')return{useRef:value=>ref??={current:value},useEffect:fn=>{if(!cleanup)cleanup=fn();}};
  if(name==='react-native')return{AppState:{currentState:'active',addEventListener:(event,fn)=>{listener=fn;return{remove:()=>removed++};}}};
  if(name==='@/lib/sessionEvents')return{onSessionChanged:fn=>{session=fn;return()=>removed++;}};throw Error(name);
 },setInterval:(fn,ms)=>{assert.equal(ms,30000);timer=fn;return 17;},clearInterval:id=>{assert.equal(id,17);removed++;}};
 vm.runInNewContext(ts.transpileModule(readFileSync('hooks/useSupportRefresh.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,scope);
 const render=enabled=>scope.exports.useSupportRefresh(enabled,()=>calls.push('refresh'),()=>calls.push('invalidate'));
 render(true);timer();listener('background');timer();listener('active');listener('active');
 assert.deepEqual(calls,['refresh','refresh']);
 session();assert.deepEqual(calls.slice(-2),['invalidate','refresh']);
 render(false);listener('background');listener('active');timer();session();
 assert.deepEqual(calls,['refresh','refresh','invalidate','refresh','invalidate']);
 render(true);timer();cleanup();assert.equal(calls.at(-1),'refresh');assert.equal(removed,3);
});
