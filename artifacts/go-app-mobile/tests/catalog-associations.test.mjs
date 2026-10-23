import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
const ts=createRequire(path.join(process.cwd(),'package.json'))('typescript');
const plain=v=>JSON.parse(JSON.stringify(v));
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
function fixture(){
 const calls=[],listeners=new Set();let business='business-A',roots=['tinte'];
 const sample=selected=>({version:1,businessId:business,rootIds:roots,selectedAssociationIds:selected,ready:!roots.includes('required')||selected.includes('ampolla-link'),missingRequired:[],currency:'EUR',totalPrice:selected.includes('ampolla-link')?37:30,serviceIds:['tinte'],
  lines:[{itemId:'tinte',name:'Tinte',kind:'service',quantity:1,durationMinutes:30,unitPrice:30,charge:30,currency:'EUR'}],
  options:[{associationId:'ampolla-link',sourceId:roots[0],itemId:'ampolla',name:'Ampolla',kind:'product',price:7,currency:'EUR',mode:roots.includes('required')?'required':'optional',selected:selected.includes('ampolla-link')}]});
 const api={supabaseApiRequest:async(route,init,token)=>{const body=JSON.parse(init.body);calls.push({route,body,token});return sample(body.selectedIds??[])}};
 const dataScope={exports:{},require:n=>{if(n==='./booking')return api;throw Error(n)}};vm.runInNewContext(compile('data/catalogAssociations.ts'),dataScope);const data=dataScope.exports;
 let cursor=0,dirty=true,effects=[],tree;const hooks=[];
 const React={Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),useState(initial){const i=cursor++;if(!hooks[i]){hooks[i]={value:typeof initial==='function'?initial():initial};hooks[i].set=value=>{const next=typeof value==='function'?value(hooks[i].value):value;if(!Object.is(next,hooks[i].value)){hooks[i].value=next;dirty=true}}}return[hooks[i].value,hooks[i].set]},useEffect(effect,deps){const i=cursor++,old=hooks[i];if(!old||!deps.every((x,n)=>Object.is(x,old.deps[n]))){hooks[i]={deps};effects.push(()=>{old?.cleanup?.();hooks[i].cleanup=effect()})}}};
 const native={View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',ActivityIndicator:'ActivityIndicator'};
 const scope={exports:{},require:n=>{if(n==='react')return {...React,default:React};if(n==='react-native')return native;if(n==='@/data/catalogAssociations')return data;if(n==='@/contexts/LanguageContext')return{useLanguage:()=>({lang:'es'})};if(n==='@/lib/sessionEvents')return{onSessionChanged:cb=>{listeners.add(cb);return()=>listeners.delete(cb)}};throw Error(n)}};
 vm.runInNewContext(compile('components/booking/CatalogComplementSelector.tsx'),scope);
 let latest;const changed=q=>{latest=q};
 const render=()=>{cursor=0;dirty=false;tree=scope.exports.CatalogComplementSelector({businessId:business,rootIds:roots,onChange:changed});const pending=effects;effects=[];for(const e of pending)e()};
 const settle=async()=>{for(let n=0;n<10;n++){if(dirty)render();await new Promise(r=>setImmediate(r));if(!dirty)return}throw Error('Non-settling selector')};
 const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children??[]).flatMap(walk)];
 return {data,calls,sample,start:settle,settle,tree:()=>tree,latest:()=>latest,nodes:()=>walk(tree),press:async()=>{walk(tree).find(n=>n.props.accessibilityRole==='checkbox').props.onPress();await settle()},change:async(b,r)=>{business=b;roots=r;dirty=true;await settle()},session:async()=>{for(const cb of listeners)cb();await settle()}};
}
test('real selector never adds an optional product until its checkbox is pressed',async()=>{const f=fixture();await f.start();assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].body.selectedIds,[]);assert.equal(f.latest().totalPrice,30);assert.equal(f.nodes().find(n=>n.props.accessibilityRole==='checkbox').props.accessibilityState.checked,false);await f.press();assert.deepEqual(f.calls.at(-1).body.selectedIds,['ampolla-link']);assert.equal(f.latest().totalPrice,37);await f.press();assert.deepEqual(f.calls.at(-1).body.selectedIds,[]);assert.equal(f.latest().totalPrice,30)});
test('required extra remains unaccepted until user action; controls retain touch target',async()=>{const f=fixture();await f.change('business-A',['required']);assert.equal(f.latest().ready,false);assert.equal(f.nodes().find(n=>n.props.accessibilityRole==='checkbox').props.style.minHeight,44);await f.press();assert.equal(f.latest().ready,true)});
test('changing business, root or account clears prior optional choices',async()=>{const f=fixture();await f.start();await f.press();await f.change('business-B',['tinte-B']);assert.deepEqual(f.calls.at(-1).body.selectedIds,[]);assert.equal(f.latest().businessId,'business-B');await f.press();await f.session();assert.deepEqual(f.calls.at(-1).body.selectedIds,[])});
test('included service uses server charge once and keeps its exact time; product does not create a service',()=>{const f=fixture();const q={...f.sample([]),lines:[{itemId:'s',name:'Tinte',kind:'service',durationMinutes:27,charge:30,currency:'EUR'},{itemId:'s2',name:'Acabado',kind:'service',durationMinutes:13,charge:0,currency:'EUR'},{itemId:'p',name:'Ampolla',kind:'product',durationMinutes:0,charge:0,currency:'EUR'}]};assert.deepEqual(plain(f.data.catalogBookingServices(q)),[{id:'s',title:'Tinte',durationMinutes:27,price:30,currency:'EUR'},{id:'s2',title:'Acabado',durationMinutes:13,price:0,currency:'EUR'}])});
test('removing an optional parent prunes its now unreachable descendants',()=>{const f=fixture(),q={...f.sample(['parent','child']),rootIds:['root'],options:[{associationId:'parent',sourceId:'root',itemId:'second',mode:'optional'},{associationId:'child',sourceId:'second',itemId:'third',mode:'required'}]};assert.deepEqual(plain(f.data.toggleCatalogOption(q,'parent')),[])});
test('association writes reuse the authenticated API transport and selected existing IDs',async()=>{const f=fixture();await f.data.manageAssociations('business-A','create',{sourceId:'tinte',targetId:'ampolla',mode:'optional'});assert.equal(f.calls[0].route,'/supabase/catalog/associations');assert.equal(f.calls[0].token,true);assert.deepEqual(f.calls[0].body.input,{sourceId:'tinte',targetId:'ampolla',mode:'optional'})});
