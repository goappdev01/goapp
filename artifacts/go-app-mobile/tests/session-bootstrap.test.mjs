import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
const source=readFileSync('app/index.tsx','utf8');
const ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let effect;
function visit(node){
 if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'
  &&node.arguments[0]?.getText(ast).includes('restoreStoredAuthentication()'))effect=node.arguments[0];
 ts.forEachChild(node,visit);
}
visit(ast);assert.ok(effect);
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const identity={session:{user:{id:'test-only-user'}},role:'usuario'};
function fixture(){
 const requests=[],events=new Set(),activity=new Set(),changes=[],alerts=[];
 const state={complete:false,error:null};let notice=null;
 const context={authBootstrapRetryRef:{current:null},
  restoreStoredAuthentication:()=>{const r=deferred();requests.push(r);return r.promise;},
  commitAccountType:(role,changeContext)=>changes.push({role,changeContext}),
  setGoAuthOpen:value=>changes.push({open:value}),
  setAuthBootstrapComplete:value=>{state.complete=value;},setAuthBootstrapError:value=>{state.error=value;},
  consumeAuthRecoveryNotice:()=>{const next=notice;notice=null;return next;},
  Alert:{alert:(...args)=>alerts.push(args)},
  onSessionChanged:listener=>{events.add(listener);return ()=>events.delete(listener);},
  AppState:{addEventListener:(_event,listener)=>{activity.add(listener);return {remove:()=>activity.delete(listener)};}},
 };
 vm.runInNewContext(compile('globalThis.cleanup = ('+effect.getText(ast)+')();'),context);
 return {requests,state,changes,alerts,context,
  signal:()=>{for(const fn of events)fn();},foreground:()=>{for(const fn of activity)fn('active');},
  background:()=>{for(const fn of activity)fn('background');},notice:value=>{notice=value;},
  unmount:()=>context.cleanup(),events,activity};
}
async function settle(){for(let i=0;i<15;i++)await Promise.resolve();}

test('keychain/storage read failure offers recovery without completing bootstrap or requesting credentials',async()=>{
 const f=fixture();f.requests[0].reject(Error('temporary storage failure'));await settle();
 assert.equal(f.state.complete,false);assert.match(f.state.error,/recuperar la sesión/);assert.deepEqual(f.changes,[]);
 f.context.authBootstrapRetryRef.current();f.requests[1].resolve(identity);await settle();
 assert.equal(f.state.complete,true);assert.equal(f.state.error,null);
 assert.deepEqual(f.changes,[{role:'usuario',changeContext:false}]);f.unmount();
});

test('unlock/foreground retries an interrupted bootstrap and restores context without a role-driven reset',async()=>{
 const f=fixture();f.requests[0].reject(Error('device locked'));await settle();
 f.background();assert.equal(f.requests.length,1);f.foreground();assert.equal(f.requests.length,2);
 f.requests[1].resolve({...identity,role:'empresa'});await settle();
 assert.deepEqual(f.changes,[{role:'empresa',changeContext:false}]);assert.equal(f.state.complete,true);
 f.foreground();assert.equal(f.requests.length,2,'Successful bootstrap does not reopen/close working panels on app changes');f.unmount();
});

test('late bootstrap responses cannot restore the old account after a logout or new login',async()=>{
 const f=fixture();f.signal();assert.equal(f.requests.length,2);
 f.requests[1].resolve({session:null,role:null});await settle();
 f.requests[0].resolve(identity);await settle();
 assert.deepEqual(f.changes,[{role:null,changeContext:undefined}]);assert.equal(f.state.complete,true);f.unmount();
});

test('confirmed invalid authentication explains reauthentication once and voluntary logout produces no notice',async()=>{
 const f=fixture();f.notice('La sesión ya no es válida. Inicia sesión de nuevo.');
 f.requests[0].resolve({session:null,role:null});await settle();
 assert.deepEqual(f.alerts,[['Sesión finalizada','La sesión ya no es válida. Inicia sesión de nuevo.']]);
 f.signal();f.requests[1].resolve({session:null,role:null});await settle();assert.equal(f.alerts.length,1);f.unmount();
 const logout=fixture();logout.requests[0].resolve({session:null,role:null});await settle();assert.deepEqual(logout.alerts,[]);logout.unmount();
});

test('a transient read failure during a mounted session retains the working screen and later recovers',async()=>{
 const f=fixture();f.requests[0].resolve(identity);await settle();
 f.signal();f.requests[1].reject(Error('storage not available'));await settle();
 assert.equal(f.state.complete,true);assert.deepEqual(f.changes,[{role:'usuario',changeContext:false}]);assert.equal(f.state.error,null);
 f.foreground();f.requests[2].resolve(identity);await settle();assert.equal(f.state.complete,true);f.unmount();
});

test('stored ADMIN account type is mapped to Usuario and never grants a server permission',async()=>{
 const f=fixture();f.requests[0].resolve({...identity,role:'admin'});await settle();
 assert.deepEqual(f.changes,[{role:'usuario',changeContext:false}]);f.unmount();
});

test('unmount removes foreground and identity listeners and ignores unfinished storage reads',async()=>{
 const f=fixture();f.unmount();assert.equal(f.events.size,0);assert.equal(f.activity.size,0);
 assert.equal(f.context.authBootstrapRetryRef.current,null);f.requests[0].resolve(identity);await settle();assert.deepEqual(f.changes,[]);
});
