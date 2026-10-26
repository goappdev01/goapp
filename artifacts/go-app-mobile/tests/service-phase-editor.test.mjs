import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,createRoot,document,rn,evaluate,ts}=require('./tests/helpers/react-lifecycle.cjs');
const timing=evaluate('data/serviceTiming.ts'),adapter=evaluate('data/serviceWorkWait.ts',{'./serviceTiming':timing});
const plain=value=>JSON.parse(JSON.stringify(value));
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',chair='33333333-3333-4333-8333-333333333333';
const work=(id,durationMinutes,patch={})=>({id,name:'',kind:'work',durationMinutes,resources:[],...patch});
const tint=(released=true)=>({name:'Tinte',duration:60,price:30,capacity:1,timing:{version:1,mode:'phases',resourcesConfigured:true,phases:[work('apply',15),{...work('process',30),kind:'wait',releaseProfessional:released},work('finish',15)]}});
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,alwaysStrict:false,esModuleInterop:false}}).outputText;
const ast=ts.createSourceFile('config.tsx',readFileSync('components/empresa/EmpresaConfigScreen.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=['useConfigArrayDraft','useStepSave','ServiceTimingEditor','StepServicios'].map(name=>ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name));
const descendants=node=>node?[node,...node.childNodes.flatMap(descendants)]:[];
async function fixture(service=tint(),{lang='es',resources=[],delay=false}={}){
 const Context=React.createContext(null),props=new Map(),calls=[],gates=[],alerts=[];let stored=JSON.stringify({businessId:a,services:[service],bookingResources:resources}),snapshot;
 const native=name=>p=>{const id=React.useId();props.set(id,{...p,native:name});return React.createElement('div',{'data-prop-id':id,'data-native':name},p.children);};
 const components=Object.fromEntries(['Text','View','TextInput','TouchableOpacity','Switch','ScrollView'].map(name=>[name,native(name)]));
 const scope={exports:{},React,useState:React.useState,useRef:React.useRef,useEffect:React.useEffect,useCallback:React.useCallback,...components,
  useBusinessConfig:()=>React.useContext(Context),useLanguage:()=>({lang,t:key=>key}),...timing,...adapter,newTimingId:(()=>{let n=0;return()=>`new-${++n}`;})(),
  BLUE:'#1D4ED8',TEXT:'#111827',GRAY:'#374151',DIM:'#4B5563',RED:'#B91C1C',PURPLE:'#7E22CE',GREEN:'#166534',GOLD:'#C9A84C',c:{},trSector:value=>value,Feather:native('Feather'),
  CatalogAssociationManager:()=>null,BookingResourcesEditor:()=>null,GoOcrImportSheet:()=>null,Haptics:{selectionAsync:async()=>{}},Alert:{alert:(...args)=>alerts.push(args)},
 };
 vm.runInNewContext(compile(declarations.map(node=>node.getText(ast)).join('\n')+';exports.StepServicios=StepServicios;'),scope);
 const saveRef={current:null},container=document.createElement('div');let root=createRoot(container);
 const settle=async(fn=()=>{})=>React.act(async()=>{fn();for(let i=0;i<10;i++)await Promise.resolve();});
 function Host(){const[config,setConfig]=React.useState(()=>JSON.parse(stored));snapshot=config;
  const persist=patch=>{calls.push(plain(patch));const commit=()=>{stored=JSON.stringify({...JSON.parse(stored),...patch});setConfig(current=>({...current,...patch}));};
   if(!delay){commit();return Promise.resolve();}return new Promise(resolve=>gates.push(()=>{commit();resolve();}));};
  return React.createElement(Context.Provider,{value:{config,updateConfig:persist,demo:null}},React.createElement(scope.exports.StepServicios,{currentSector:null,saveRef}));}
 const visible=()=>descendants(container).filter(node=>node.attributes?.['data-prop-id']).map(node=>props.get(node.attributes['data-prop-id']));
 const get=id=>{const node=visible().find(p=>p.testID===id);assert.ok(node,'Missing '+id);return node;};
 await settle(()=>root.render(React.createElement(Host)));
 return {container,calls,alerts,gates,saveRef,visible,get,settle,get saved(){return JSON.parse(stored);},get config(){return snapshot;},
  async edit(index,text){await settle(()=>get('service-work-wait-'+index).onChangeText(text));},
  async toggle(){await settle(()=>get('service-work-wait-toggle').onPress());},
  async reload(){await settle(()=>root.unmount());root=createRoot(container);await settle(()=>root.render(React.createElement(Host)));},
  async close(){await settle(()=>root.unmount());}};
}

for(const lang of ['es','en'])test(`${lang}: the optional compact section contains exactly three side-by-side minute fields and one total, with no phase controls`,async()=>{
 const f=await fixture({name:'Corte',duration:27,price:15},{lang});try{
  assert.equal(f.get('service-work-wait-toggle').accessibilityState.expanded,false);assert.equal(f.visible().filter(p=>p.testID?.match(/^service-work-wait-[012]$/)).length,0);await f.toggle();
  assert.equal(f.get('service-work-wait-fields').style.flexDirection,'row');for(let i=0;i<3;i++){const input=f.get('service-work-wait-'+i);assert.equal(input.style.minHeight,44);assert.equal(input.keyboardType,'number-pad');assert.equal(input.style.minWidth,0);}
  const body=f.container.textContent;assert.match(body,lang==='en'?/WORK WITH CLIENT WAIT/:/TRABAJO CON ESPERA DEL CLIENTE/);for(const title of lang==='en'?['INITIAL WORK','CLIENT WAIT','FINAL WORK']:['TRABAJO INICIAL','ESPERA DEL CLIENTE','TRABAJO FINAL'])assert.ok(body.includes(title));assert.match(body,/27 min/);
  assert.doesNotMatch(body,/Fase [123]|Guardar tiempos|Añadir fase|Eliminar fase|Subir|Bajar|SERVICIO POR FASES|Distribución del tiempo|Tiempos para/);assert.equal(f.calls.length,0,'Opening cannot change configuration');
  assert.equal(f.visible().some(p=>p.native==='TextInput'&&!p.testID&&p.value==='27'),false,'The duplicate scalar minute field is hidden while the three-field form is open');
  await f.toggle();assert.equal(f.visible().some(p=>p.native==='TextInput'&&!p.testID&&p.value==='27'),true);assert.equal(f.calls.length,0);
 }finally{await f.close();}
});

for(const released of [true,false])test(`three values sum automatically, persist through the existing service writer, and preserve wait consent=${released}`,async()=>{
 const original=tint(released);original.timing.professionalTimings={[a]:{...tint().timing,durationMinutes:60},[b]:{...tint(false).timing,durationMinutes:60}};
 const f=await fixture(original);try{
  assert.equal(f.get('service-work-wait-toggle').accessibilityState.expanded,true);await f.edit(0,'13');await f.edit(1,'30');await f.edit(2,'27');await f.saveRef.current();
  assert.match(f.container.textContent,/TOTAL DEL SERVICIO: 70 min/);const saved=f.saved.services[0];assert.equal(saved.duration,70);assert.equal(saved.price,30);assert.deepEqual(saved.timing.phases.map(p=>p.durationMinutes),[13,30,27]);assert.equal(saved.timing.phases[1].releaseProfessional,released);assert.deepEqual(saved.timing.professionalTimings,original.timing.professionalTimings);
  await f.reload();for(const[index,value]of ['13','30','27'].entries())assert.equal(f.get('service-work-wait-'+index).value,value);assert.match(f.container.textContent,/70 min/);
 }finally{await f.close();}
});

test('rapid input and older queued acknowledgements never overwrite the newest three values',async()=>{
 const f=await fixture(tint(),{delay:true});try{
  const inputs=[0,1,2].map(i=>f.get('service-work-wait-'+i));await f.settle(()=>{inputs[0].onChangeText('20');inputs[1].onChangeText('25');inputs[2].onChangeText('20');});
  assert.equal(f.gates.length,3);assert.match(f.container.textContent,/65 min/);await f.settle(()=>f.gates[0]());assert.equal(f.get('service-work-wait-1').value,'25');assert.equal(f.get('service-work-wait-2').value,'20');
  await f.settle(()=>f.gates[1]());await f.settle(()=>f.gates[2]());await f.saveRef.current();assert.deepEqual(f.saved.services[0].timing.phases.map(p=>p.durationMinutes),[20,25,20]);
 }finally{for(const done of f.gates)done();await f.close();}
});

test('invalid input stays visible, cannot overwrite persisted data, and blocks Next until corrected',async()=>{
 const f=await fixture();try{
  await f.edit(1,'30.5');assert.equal(f.get('service-work-wait-1').value,'30.5');assert.equal(f.calls.length,0);assert.match(f.container.textContent,/minutos enteros/);await assert.rejects(f.saveRef.current(),/minutos enteros/);assert.equal(f.saved.services[0].duration,60);
  await f.edit(1,'35');await f.saveRef.current();assert.equal(f.saved.services[0].duration,65);assert.equal(f.saved.services[0].timing.phases[1].durationMinutes,35);assert.equal(f.alerts.length,0);
 }finally{await f.close();}
});

test('prices, resource quantities, fixed professionals and accepted configuration are retained when only minutes change',()=>{
 const original=tint();original.timing.phases[0]={...original.timing.phases[0],staffId:a,resources:[{resourceId:chair,quantity:1,occupancy:'booking'}]};const snapshot=plain(original);
 const updated=adapter.updateServiceWorkWait(original,['13','30','27'],[{id:chair,name:'Silla',capacity:1}],()=> 'unused');assert.equal(updated.duration,70);assert.equal(updated.timing.phases[0].id,'apply');assert.equal(updated.timing.phases[0].staffId,a);assert.deepEqual(plain(updated.timing.phases[0].resources),snapshot.timing.phases[0].resources);assert.deepEqual(original,snapshot);
 assert.throws(()=>adapter.updateServiceWorkWait(original,['0','30','15'],[{id:chair,name:'Silla',capacity:1}],()=> 'unused'),/conservar/);
});
test('zero-minute unbound parts are omitted instead of inventing invalid zero-duration engine phases',()=>{
 const updated=adapter.updateServiceWorkWait(tint(),['13','0','27'],[],()=> 'unused');assert.equal(updated.duration,40);assert.equal(updated.timing.phases.length,2);assert.ok(updated.timing.phases.every(p=>p.kind==='work'&&p.durationMinutes>0));assert.deepEqual(plain(adapter.readServiceWorkWait(updated).values),['13','0','27']);
 assert.throws(()=>adapter.updateServiceWorkWait(tint(),['0','0','0'],[],()=> 'unused'));assert.throws(()=>adapter.updateServiceWorkWait(tint(),['1440','30','15'],[],()=> 'unused'));
});
test('legacy complex sequences remain intact instead of being silently flattened or losing metadata',()=>{
 const old=tint();old.timing.phases.push({id:'extra',name:'Waiting again',kind:'wait',durationMinutes:10,releaseProfessional:false,resources:[]});old.duration=70;const before=plain(old);
 assert.equal(adapter.readServiceWorkWait(old).editable,false);assert.throws(()=>adapter.updateServiceWorkWait(old,['15','40','15'],[],()=> 'unused'),/configuración guardada/);assert.deepEqual(old,before);
});
test('the visual simplification cannot silently grant unknown resources or release an unauthorized wait',()=>{
 assert.throws(()=>adapter.updateServiceWorkWait({duration:60},['15','30','15'],[],()=> 'new'),/recursos/);
 const noWait={duration:60,timing:{version:1,mode:'simple',resourcesConfigured:true,phases:[work('work',60)]}};let id=0;
 const next=adapter.updateServiceWorkWait(noWait,['15','30','15'],[],()=> 'new-'+(++id));assert.equal(next.timing.phases[1].releaseProfessional,false);
 const bad=tint();bad.timing.phases[0].releaseProfessional=true;assert.throws(()=>timing.validateServiceTiming(bad));
});
