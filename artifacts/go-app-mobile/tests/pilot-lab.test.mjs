import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const domain={exports:{}};vm.runInNewContext(compile('lib/pilotLab.ts'),domain);const api=domain.exports;
test('no result is supplied and incomplete validation is refused',()=>{
 const r=api.newPilot('one');assert.equal(r.result,'');assert.equal(r.evidence,'');assert.equal(r.knowledge,'Dato faltante');
 r.name='P-01';r.status='Validado';assert.throws(()=>api.savePilot(api.emptyPilotStore(),r,'now'),/Para validar/);
 Object.assign(r,{module:'Notas',device:'Dispositivo de prueba',version:'test',tasks:'Crear nota',result:'Nota recuperada',evidence:'Referencia de prueba local',responsible:'Responsable de prueba',testedAt:'2026-02-30',knowledge:'Hecho confirmado'});
 assert.throws(()=>api.savePilot(api.emptyPilotStore(),r,'now'),/Para validar/);
 r.testedAt='2026-11-09';assert.equal(api.savePilot(api.emptyPilotStore(),r,'now').records[0].status,'Validado');
 r.knowledge='Hipótesis';assert.throws(()=>api.savePilot(api.emptyPilotStore(),r,'now'),/Para validar/);
});
test('history preserves prior evidence and repetitions require a fresh result',()=>{
 const r={...api.newPilot('one'),name:'P-01',result:'Observación original',evidence:'Original',version:'v1',checks:[{text:'Legibilidad',done:true}]};
 let store=api.savePilot(api.emptyPilotStore(),r,'first');store=api.savePilot(store,{...r,observations:'Segunda observación'},'second');
 assert.equal(store.history[0].before.observations,'');assert.equal(store.history[0].after.observations,'Segunda observación');
 const repeated=api.repeatPilot(r,'two');assert.equal(repeated.parentId,'one');assert.equal(repeated.result,'');assert.equal(repeated.evidence,'');assert.equal(repeated.version,'');assert.equal(repeated.checks[0].done,false);assert.equal(r.checks[0].done,true);assert.equal(store.records.length,1);
});
const nodes=t=>!t||typeof t!=='object'?[]:[t,...(t.children??[]).flatMap(nodes)];
function harness(){let cursor=0,effects=[];const slots=[];const writes=[];let reject=false;let owner=true;let user='owner-a';
 const React={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),Fragment:'fragment',useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,j)=>v!==slots[i].deps[j])){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn();});}}};
 const native={Modal:'Modal',View:'View',Text:'Text',TextInput:'TextInput',TouchableOpacity:'TouchableOpacity',ScrollView:'ScrollView',KeyboardAvoidingView:'KeyboardAvoidingView',StyleSheet:{create:x=>x},Platform:{OS:'ios'},Keyboard:{isVisible:()=>false}};
 const scope={exports:{},require(name){if(name==='react')return {...React,default:React};if(name==='react-native')return native;if(name==='@react-native-async-storage/async-storage')return{__esModule:true,default:{getItem:async()=>null,setItem:async(k,v)=>{if(reject)throw Error();writes.push([k,v]);}}};if(name==='react-native-safe-area-context')return{useSafeAreaInsets:()=>({top:0,bottom:0})};if(name==='@/contexts/GoAdminAccessContext')return{useAdminAccess:()=>({isOwner:owner,userId:user})};if(name==='@/lib/pilotLab')return api;if(name==='@/lib/supportRequests')return{newSupportRequestKey:()=> 'test-id'};if(name.includes('GoCloseButton'))return{GoCloseButton:'GoCloseButton'};if(name.includes('GoNavigationFloating'))return{GoNavigationFloating:'GoNavigationFloating'};throw Error(name);}};
 vm.runInNewContext(compile('components/pilots/PilotLabPanel.tsx'),scope);
 return{writes,set reject(v){reject=v;},set owner(v){owner=v;},set user(v){user=v;},render(){cursor=0;effects=[];const tree=scope.exports.PilotLabPanel({visible:true,onClose(){},gateway:{},backendReady:false});effects.forEach(fn=>fn());return tree;}};
}
const tick=()=>new Promise(setImmediate);
const findButton=(tree,label)=>nodes(tree).find(n=>n.type==='TouchableOpacity'&&nodes(n).some(x=>x.type==='Text'&&x.children.includes(label)));
test('native screen persists under account key, keeps failed draft, hides on lost permission',async()=>{
 const h=harness();h.render();await tick();let tree=h.render();findButton(tree,'Nueva ficha').props.onPress();tree=h.render();
 nodes(tree).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Nombre o código de ficha').props.onChangeText('P-01');tree=h.render();
 h.reject=true;findButton(tree,'Guardar ficha').props.onPress();await tick();tree=h.render();assert.ok(findButton(tree,'Guardar ficha'));assert.equal(h.writes.length,0);
 h.reject=false;findButton(tree,'Guardar ficha').props.onPress();await tick();tree=h.render();assert.equal(h.writes.length,1);assert.equal(h.writes[0][0],'go_pilot_lab_v1:owner-a');assert.equal(JSON.parse(h.writes[0][1]).records[0].name,'P-01');
 h.owner=false;assert.equal(h.render(),null);h.owner=true;h.user='owner-b';h.render();await tick();tree=h.render();assert.equal(JSON.stringify(tree).includes('P-01'),false);
});
