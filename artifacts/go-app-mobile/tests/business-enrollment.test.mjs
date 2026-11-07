import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
const plain = value => JSON.parse(JSON.stringify(value));
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { esModuleInterop: false, alwaysStrict: false, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const flush = async () => { for(let n=0;n<45;n++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const enrollment = { legal_name:'SYNTHETIC legal',tax_id:'TEST-123',trading_name:'SYNTHETIC salon',address:'SYNTHETIC address' };
const formKey = (owner='owner-a',id='new') => `go_verification_form:${owner}:${id}`;
function fixture(shared = new Map()) {
  let cursor=0,effects=[],tree;
  const slots=[],calls=[],events=[];
  const behavior={storageFailure:false,submitFailure:null,barrier:null};
  const access={snapshot:{userId:'owner-a',business:null},allowed:false,refresh:async()=>{events.push('refresh');},selectBusiness:async id=>events.push(id)};
  const storage={getItem:async key=>shared.get(key)??null,setItem:async(key,value)=>{if(behavior.storageFailure)throw Error('Disk failure');shared.set(key,value);},removeItem:async key=>{shared.delete(key);}};
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const React={createElement:(type,props,...children)=>({type,props:props??{},children}),useState(value){const n=cursor++;slots[n]??={value:typeof value==='function'?value():value};return[slots[n].value,value=>{slots[n].value=typeof value==='function'?value(slots[n].value):value;}];},useRef(value){return slots[cursor++]??={current:value};},useEffect(callback,deps){const n=cursor++;if(!slots[n]||!same(slots[n].deps,deps)){const old=slots[n];slots[n]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();slots[n].cleanup=callback();});}}};
  const load=(file,imports)=>{const scope={exports:{},console,Math,Error,require:imports};vm.createContext(scope);vm.runInContext(compile(file),scope);return scope.exports;};
  class APIError extends Error {}
  const auth={captureAuthIdentity:async()=>access.snapshot.userId?{userId:access.snapshot.userId}:null,isAuthIdentityCurrent:async identity=>identity.userId===access.snapshot.userId};
  const api=load('data/businessVerification.ts',name=>{
    if(name==='@/lib/authSession')return auth;
    if(name==='./booking')return{BookingApiError:APIError,isCloudId:value=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value),supabaseApiRequest:async(path,init)=>{
      if(path.endsWith('/dossiers'))return[];
      if(path.endsWith('/requirements'))return[];
      const command=JSON.parse(init.body);calls.push(plain(command));
      if(behavior.barrier)await behavior.barrier.promise;
      if(behavior.submitFailure)throw behavior.submitFailure;
      return{dossier:{business_id:'11111111-1111-4111-8111-111111111111',name:command.data.trading_name,...command.data,revision:1,status:'documents_pending',verified:false,documents:[],history:[],requirements:null}};
    }};
    throw Error(name);
  });
  const workspace=load('components/auth/BusinessDossierWorkspace.tsx',name=>{
    if(name==='react')return{default:React,...React};
    if(name==='react-native')return{ActivityIndicator:'spinner',ScrollView:'scroll',Text:'text',TextInput:'input',TouchableOpacity:'button',View:'view',StyleSheet:{create:v=>v}};
    if(name==='@/contexts/GoBusinessAccessContext')return{useBusinessAccess:()=>access};
    if(name==='@react-native-async-storage/async-storage')return{default:storage};
    if(name==='@/lib/authSession')return auth;
    if(name==='@/data/businessVerification')return api;
    if(name==='@/data/businessEnrollmentDraft')return load('data/businessEnrollmentDraft.ts',()=>({default:storage}));
    if(name==='expo-document-picker'||name==='expo-file-system')return{};
    throw Error(name);
  });
  const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...(node.children??[]).flatMap(nodes)];
  const render=()=>{cursor=0;effects=[];tree=workspace.BusinessDossierWorkspace({});for(const run of effects)run();return tree;};
  const fields=()=>nodes(tree).filter(n=>n.type==='input');
  const click=label=>{const b=nodes(tree).find(n=>n.type==='button'&&n.children[0]?.children.includes(label));assert.ok(b,label);return b.props.onPress();};
  const settle=async()=>{await flush();render();await flush();render();};
  return{shared,behavior,access,events,calls,render,fields,click,settle,tree:()=>tree,text:()=>nodes(tree).filter(n=>n.type==='text').flatMap(n=>n.children).join(' '),async fill(data=enrollment){render();for(const [n,key]of Object.keys(data).entries()){fields()[n].props.onChangeText(data[key]);render();}await settle();},unmount(){for(const slot of slots)slot?.cleanup?.();}};
}

test('edits persist through background/remount and remain separated by identity and business',async()=>{
 const f=fixture();f.render();await f.settle();await f.fill();assert.deepEqual(JSON.parse(f.shared.get(formKey())),{...enrollment,activity:''});f.unmount();
 const resumed=fixture(f.shared);resumed.render();await resumed.settle();assert.deepEqual(resumed.fields().map(n=>n.props.value),Object.values(enrollment));
 resumed.access.snapshot={userId:'owner-b',business:null};resumed.render();await resumed.settle();assert.ok(resumed.fields().every(n=>n.props.value===''));assert.ok(resumed.shared.has(formKey()));
});

test('a failed command preserves drafts, a stable retry identity, and safe messages',async()=>{
 for(const message of ['Cannot POST /backend','SQL rpc missing']){
  const f=fixture();f.render();await f.settle();await f.fill();f.behavior.submitFailure=Error(message);f.click('Guardar progreso');await f.settle();
  assert.match(f.text(),/Tus datos se han conservado/);assert.doesNotMatch(f.text(),/SQL|Cannot POST/);assert.deepEqual(JSON.parse(f.shared.get(formKey())),{...enrollment,activity:''});
  const pending=JSON.parse(f.shared.get('go_verification_pending:owner-a'));assert.equal(pending.requestId,f.calls[0].requestId);assert.equal(f.access.allowed,false);assert.equal(f.events.length,0);
  f.unmount();const resumed=fixture(f.shared);resumed.render();await resumed.settle();resumed.click('Reintentar operación pendiente');await resumed.settle();
  assert.equal(resumed.calls[0].requestId,pending.requestId);assert.equal(resumed.shared.has('go_verification_pending:owner-a'),false);
 }
});

test('repeated taps produce one request, with deletion of local draft only after acknowledgement',async()=>{
 const f=fixture();f.render();await f.settle();await f.fill();f.behavior.barrier=deferred();f.click('Guardar progreso');f.click('Guardar progreso');await f.settle();
 assert.equal(f.calls.length,1);assert.ok(f.shared.has(formKey()));f.behavior.barrier.resolve();await f.settle();
 assert.equal(f.shared.has(formKey()),false);assert.equal(f.shared.has('go_verification_pending:owner-a'),false);assert.deepEqual(f.events,['refresh']);assert.equal(f.access.allowed,false);
});

test('storage failure stops sending and a changed account never receives the acknowledgement',async()=>{
 const f=fixture();f.render();await f.settle();await f.fill();f.behavior.storageFailure=true;f.click('Guardar progreso');await f.settle();assert.equal(f.calls.length,0);
 const g=fixture();g.render();await g.settle();await g.fill();g.behavior.barrier=deferred();g.click('Guardar progreso');await g.settle();g.access.snapshot.userId='other';g.behavior.barrier.resolve();await g.settle();assert.equal(g.events.length,0);assert.equal(g.access.allowed,false);
});

test('iPhone workspace keeps a scrollable form with keyboard tap support and existing field constraints',async()=>{
 const f=fixture();f.render();await f.settle();assert.equal(f.tree().type,'scroll');assert.equal(f.tree().props.keyboardShouldPersistTaps,'handled');assert.equal(f.tree().props.keyboardDismissMode,'on-drag');
 assert.deepEqual(f.fields().map(n=>n.props.maxLength),[200,32,200,4000]);assert.deepEqual(f.fields().map(n=>n.props.returnKeyType),['next','next','next','done']);assert.ok(f.fields().every(n=>n.props.editable));
});

test('draft utility serializes edits and cannot erase a newer edit when clearing an older submission',async()=>{
 const shared=new Map();const scope={exports:{},console,require:name=>({default:{getItem:async key=>shared.get(key)??null,setItem:async(key,value)=>{shared.set(key,value);},removeItem:async key=>{shared.delete(key);}}})};vm.createContext(scope);vm.runInContext(compile('data/businessEnrollmentDraft.ts'),scope);const draft=scope.exports,key=draft.businessEnrollmentDraftKey('owner');
 const newer={...enrollment,address:'Later edit'};await Promise.all([draft.saveBusinessEnrollmentDraft(key,enrollment),draft.saveBusinessEnrollmentDraft(key,newer)]);await draft.clearBusinessEnrollmentDraft(key,enrollment);assert.deepEqual(plain(await draft.loadBusinessEnrollmentDraft(key)),newer);await draft.clearBusinessEnrollmentDraft(key,newer);assert.equal(await draft.loadBusinessEnrollmentDraft(key),null);
});
