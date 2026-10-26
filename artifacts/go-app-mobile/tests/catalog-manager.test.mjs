import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,createRoot,document,ts}=require('./tests/helpers/react-lifecycle.cjs');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{ alwaysStrict: false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
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

function contrastOnWhite(hex){const values=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);return 1.05/(values[0]*0.2126+values[1]*0.7152+values[2]*0.0722+0.05);}
async function catalogueFixture({lang='es',catalogue=[],failure,beforeFailure,delay=false}={}){
 const props=new Map(),calls={reads:0,writes:0},gates=[];
 const native=name=>p=>{const id=React.useId();props.set(id,{...p,native:name});return React.createElement('div',{'data-prop-id':id},p.children);};
 const api={isCloudId:()=>true,getOwnedBookableItems:async()=>{calls.reads++;if(delay)await new Promise(resolve=>gates.push(resolve));if(failure)throw Error(failure);return catalogue;},
  createBookableItem:async()=>{calls.writes++;throw Error('Unexpected write');},saveBookableItem:async()=>{calls.writes++;throw Error('Unexpected write');}};
 const {CatalogAssociationManager}=load('components/empresa/CatalogAssociationManager.tsx',{'react':React,'react-native':Object.fromEntries(['View','Text','TextInput','TouchableOpacity'].map(name=>[name,native(name)])),
  '@/data/booking':api,'@/data/catalogAssociations':{manageAssociations:async()=>[],associationMode:value=>value},'@/data/demoBookingRepository':{},
  '@/contexts/GoBusinessConfigContext':{useBusinessConfig:()=>({demo:null})},'@/contexts/LanguageContext':{useLanguage:()=>({lang})},'@/lib/sessionEvents':{onSessionChanged:()=>()=>{}}});
 const container=document.createElement('div'),root=createRoot(container),descendants=node=>[node,...node.childNodes.flatMap(descendants)];
 const visible=()=>descendants(container).filter(node=>node.attributes?.['data-prop-id']).map(node=>props.get(node.attributes['data-prop-id']));
 const settle=async(fn=()=>{})=>React.act(async()=>{await fn();for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));});
 const getButton=title=>visible().find(p=>p.native==='TouchableOpacity'&&text(p.children)===title);
 await settle(()=>root.render(React.createElement(CatalogAssociationManager,{businessId:'11111111-1111-4111-8111-111111111111',demo:false,beforeOpen:async()=>{if(beforeFailure)throw Error(beforeFailure);}})));
 return {container,visible,calls,gates,settle,getButton,async open(){await settle(()=>visible().find(p=>p.native==='TouchableOpacity').onPress());},async close(){for(const done of gates)done();await settle(()=>root.unmount());}};
}

for(const lang of ['es','en'])test(lang+': real catalogue choices and editable product fields remain readable on the white business card',async()=>{
 const catalogue=[{id:'cut',title:'Corte con un nombre de servicio largo',active:true,price:20},{id:'wash',title:'Lavado',active:true,price:10},{id:'product',title:'Mascarilla',catalogKind:'product',active:true,price:5}];
 const f=await catalogueFixture({lang,catalogue});try{
  await f.open();assert.equal(f.calls.reads,2);
  for(const node of f.visible().filter(p=>p.native==='Text'&&text(p.children).trim()))assert.ok(contrastOnWhite(node.style.color)>=4.5,'Visible text must contrast with the white card: '+text(node.children));
  const choice=f.getButton('Corte con un nombre de servicio largo · '+(lang==='es'?'Servicio':'Service'));assert.ok(choice);assert.equal(choice.accessibilityRole,'button');assert.ok(choice.style.minHeight>=44);assert.equal(choice.style.maxWidth,'100%');
  await f.settle(()=>choice.onPress());assert.equal(f.getButton('Corte con un nombre de servicio largo · '+(lang==='es'?'Servicio':'Service')).accessibilityState.selected,true);
  for(const title of lang==='es'?['Incluido','Opcional','Recomendado']:['Included','Optional','Recommended'])assert.ok(f.getButton(title));
  const inputs=f.visible().filter(p=>p.native==='TextInput');assert.equal(inputs.length,2);
  const field=inputs.find(p=>p.accessibilityLabel===(lang==='es'?'Nombre del producto':'Product name'));assert.equal(field.editable,undefined);assert.equal(field.autoFocus,undefined);
  await f.settle(()=>field.onChangeText('Producto escrito'));assert.equal(f.visible().find(p=>p.accessibilityLabel===field.accessibilityLabel).value,'Producto escrito');
  for(const input of inputs){assert.ok(contrastOnWhite(input.style.color)>=4.5);assert.ok(contrastOnWhite(input.placeholderTextColor)>=4.5);assert.ok(input.style.minHeight>=44);}
  assert.equal(f.calls.writes,0,'Selecting and typing must never invent a save');
 }finally{await f.close();}
});

test('an empty catalogue displays an explicit message while a slow catalogue displays loading instead of fake empty options',async()=>{
 const f=await catalogueFixture({delay:true});try{
  await f.open();assert.match(f.container.textContent,/Cargando catálogo/);assert.doesNotMatch(f.container.textContent,/No hay productos ni servicios/);
  await f.settle(()=>{for(const done of f.gates)done();});assert.match(f.container.textContent,/No hay productos ni servicios en el catálogo/);assert.doesNotMatch(f.container.textContent,/Cargando catálogo/);assert.equal(f.calls.writes,0);
 }finally{await f.close();}
});

test('a server load failure is visible and cannot be presented as an empty or successfully saved catalogue',async()=>{
 const f=await catalogueFixture({failure:'Servidor no disponible'});try{
  await f.open();assert.match(f.container.textContent,/No se pudo cargar o guardar el catálogo del servidor.*Servidor no disponible/);
  assert.doesNotMatch(f.container.textContent,/No hay productos ni servicios/);assert.doesNotMatch(f.container.textContent,/Cargando catálogo/);assert.ok(f.visible().some(p=>p.accessibilityRole==='alert'));assert.equal(f.calls.writes,0);
 }finally{await f.close();}
});

test('failure to flush the real service form is visible even when the association panel could not open',async()=>{
 const f=await catalogueFixture({beforeFailure:'Revisa los tiempos guardados'});try{
  await f.open();assert.match(f.container.textContent,/Revisa los tiempos guardados/);assert.equal(f.calls.reads,0);assert.equal(f.calls.writes,0);assert.equal(f.visible().filter(p=>p.native==='TextInput').length,0);
 }finally{await f.close();}
});
