import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,createRoot,document,ts}=require('./tests/helpers/react-lifecycle.cjs');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
function load(file,imports={}){const scope={exports:{},Date,console,require:key=>{if(key in imports)return imports[key];throw Error('Forbidden dependency '+key);}};vm.runInNewContext(compile(file),scope);return scope.exports;}
const stores=load('data/businessDemoStore.ts'),services=load('data/bookingServices.ts'),repositories=load('data/demoBookingRepository.ts',{'./businessDemoStore':stores,'./bookingServices':services});
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):text(node?.props?.children??'');
test('the existing service-step manager creates, edits and deletes voluntary associations with the existing persisted catalogue',async()=>{
 const memory=new Map(),buttons=new Map(),inputs=new Map();let flushed=0;
 const store=stores.createBusinessDemoStore({ownerUserId:'11111111-1111-4111-8111-111111111111',storage:{getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>memory.set(k,v)},canUse:()=>true,initialConfig:{services:[],plantillaItems:[],activeDays:[],completedSteps:[],staffSchedules:{}}});
 await store.updateConfig({services:[{name:'Corte',duration:30,price:20}]});
 const native={View:props=>React.createElement('div',null,props.children),Text:props=>React.createElement('span',null,props.children),TextInput:props=>{inputs.set(props.accessibilityLabel,props);return React.createElement('input',{value:props.value,readOnly:true});},TouchableOpacity:props=>{buttons.set(text(props.children),props);return React.createElement('button',{disabled:props.disabled},props.children);}};
 const api={isCloudId:()=>false,createBookableItem:()=>{throw Error('No cloud writes');},saveBookableItem:()=>{throw Error('No cloud writes');}};
 const associations=load('data/catalogAssociations.ts',{'./booking':api});
 const {CatalogAssociationManager}=load('components/empresa/CatalogAssociationManager.tsx',{'react':React,'react-native':native,'@/data/booking':api,'@/data/catalogAssociations':associations,'@/data/demoBookingRepository':repositories,'@/contexts/GoBusinessConfigContext':{useBusinessConfig:()=>({demo:store})},'@/contexts/LanguageContext':{useLanguage:()=>({lang:'es'})},'@/lib/sessionEvents':{onSessionChanged:()=>()=>{}}});
 const container=document.createElement('div'),root=createRoot(container);
 const settle=async fn=>React.act(async()=>{await fn?.();for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));});
 try{
  await settle(()=>root.render(React.createElement(CatalogAssociationManager,{businessId:store.businessId,demo:true,beforeOpen:async()=>{flushed++;}})));
  await settle(()=>buttons.get('Asociaciones de productos y servicios').onPress());assert.equal(flushed,1);
  await settle(()=>inputs.get('Nombre del producto').onChangeText('Mascarilla'));await settle(()=>inputs.get('Precio del producto').onChangeText('5,00'));
  await settle(()=>buttons.get('Guardar producto').onPress());assert.equal(store.getSnapshot().config.catalogProducts.length,1);
  await settle(()=>buttons.get('Corte · Servicio').onPress());await settle(()=>buttons.get('Recomendado').onPress());
  let relation=store.getSnapshot().config.catalogAssociations[0];assert.equal(relation.mode,'recommended');assert.equal(relation.business_id,store.businessId);assert.ok(!container.textContent.includes('Obligatorio'));
  await settle(()=>buttons.get('Incluido').onPress());assert.equal(store.getSnapshot().config.catalogAssociations[0].mode,'included');
  const repo=repositories.createDemoBookingRepository(store),items=await repo.getBookableItems(store.businessId);assert.equal((await repo.quoteCatalog(store.businessId,[items[0].id])).totalPrice,20);
  await settle(()=>buttons.get('Eliminar asociación').onPress());assert.equal(store.getSnapshot().config.catalogAssociations.length,0);
  assert.equal(JSON.parse([...memory.values()][0]).config.catalogProducts[0].title,'Mascarilla');
 }finally{await settle(()=>root.unmount());}
});
