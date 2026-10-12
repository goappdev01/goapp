import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
const ts=createRequire(import.meta.url)("typescript");
const compiled=new Map();
const compile=file=>{if(compiled.has(file))return compiled.get(file);let source=readFileSync(file,"utf8");
 if(file.endsWith('.tsx')){const req=createRequire(import.meta.url),babel=req('@babel/core'),expoReq=createRequire(req.resolve('babel-preset-expo'));source=babel.transformSync(source,{filename:file,babelrc:false,configFile:false,parserOpts:{sourceType:'module',plugins:['typescript','jsx']},plugins:[[expoReq('babel-plugin-react-compiler'),{target:'19'}]]}).code;}
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;compiled.set(file,code);return code;};
function module(file,imports={}){const exports={};vm.runInNewContext(compile(file),{exports,require:key=>{if(key in imports)return imports[key];throw Error("Unexpected dependency "+key);},Date,Intl,Set,Map});return exports;}
const storeAPI=module("data/businessDemoStore.ts"),catalogAPI=module("data/businessDemoCatalog.ts",{"./businessDemoStore":storeAPI});
const initial={businessName:"",address:"",cartaUrl:"",sectorId:null,subId:null,plantillaItems:[],activeDays:[],openFrom:"09:00",openTo:"20:00",daySchedules:{},services:[],paymentPolicy:0,approvalPolicy:0,cancelPolicy:0,bookingEnabled:false,completedSteps:[],paymentMethod:null,isBusinessActive:false};
const turn=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
function fixture(copy = async () => true, options = {}){let cursor=0,open=true,lang="es",authorized=true;const slots=[],memory=new Map(),shares=[],alerts=[],copies=[];
 const storage={getItem:async key=>memory.get(key)??null,setItem:async(key,value)=>memory.set(key,value)};
 const catalog=catalogAPI.createBusinessDemoCatalog({ownerUserId:"11111111-1111-4111-8111-111111111111",initialConfig:initial,canUse:()=>authorized,storage});
 const React={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},useRef:value=>React.useState(()=>({current:value}))[0]};
 const native={Keyboard:{dismiss(){}},Text:'Text',TextInput:'TextInput',ScrollView:'ScrollView',View:'View',TouchableOpacity:'TouchableOpacity',Share:{share:async value=>shares.push(value)},Alert:{alert:(...args)=>alerts.push(args)}};
 const {DemoCompanyManager}=module("components/empresa/DemoCompanyManager.tsx",{react:{default:React,...React},'react/compiler-runtime':{c:size=>React.useState(()=>new Array(size).fill(Symbol.for('react.memo_cache_sentinel')))[0]},'react-native':native,'expo-clipboard':{setStringAsync:async value=>{copies.push(value);return await copy(value);}},'@/contexts/OwnerBusinessDemoContext':{useOwnerBusinessDemo:()=>authorized?{catalog,demo:catalog.getSelectedStore()}:{}},'@/contexts/LanguageContext':{useLanguage:()=>({lang})}});
 return{catalog,shares,alerts,copies,memory,storage,setLang:value=>lang=value,setAuthorized:value=>authorized=value,render:()=>{cursor=0;return DemoCompanyManager({open,onOpenChange:value=>open=value,...options});}};
}
const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...(tree.children??[]).flatMap(nodes)];
const byID=(tree,id)=>nodes(tree).find(node=>node.props.testID===id);
const content=tree=>typeof tree==='string'?tree:(tree?.children??[]).map(content).join(' ');
const button=(tree,label)=>nodes(tree).find(node=>node.type==='TouchableOpacity'&&content(node)===label);
const tools=f=>{let tree=f.render();if(!byID(tree,'demo-company-tools')){byID(tree,'demo-company-tools-toggle').props.onPress();tree=f.render();}return tree;};
const newForm=f=>{byID(f.render(),'demo-company-new').props.onPress();return f.render();};
test('actual manager creates a named company once even with two immediate taps, then selects the previous company',async()=>{const f=fixture();let tree=newForm(f);byID(tree,'demo-company-name').props.onChangeText('GO PELUQUERÍA');tree=f.render();assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'GO PELUQUERÍA');const create=byID(tree,'demo-company-create');create.props.onPress();create.props.onPress();await turn();assert.equal(f.catalog.getCompanies().length,2);assert.equal(f.catalog.getSelectedStore().getSnapshot().config.businessName,'GO PELUQUERÍA');tree=tools(f);byID(tree,'demo-company-legacy').props.onPress();await turn();assert.equal(f.catalog.getSelectedId(),'legacy');});
test('actual archive confirmation removes only the selected DEMO from active lists and recovery returns its saved data',async()=>{const f=fixture();await f.catalog.create('Recover');const id=f.catalog.getSelectedId();await f.catalog.getSelectedStore().updateConfig({address:'Ficticia'});let tree=tools(f);byID(tree,'demo-company-archive-current').props.onPress();f.alerts.at(-1)[2].find(action=>action.onPress).onPress();await turn();assert.equal(f.catalog.getCompanies().find(c=>c.id===id).archived,true);tree=tools(f);byID(tree,'demo-company-'+id).props.onPress();await turn();assert.equal(f.catalog.getSelectedStore().getSnapshot().config.address,'Ficticia');});
test('backup export uses the native share action and UI stays hidden without current owner authority',async()=>{const f=fixture();await f.catalog.create('Backup');byID(tools(f),'demo-company-backup').props.onPress();await turn();assert.equal(JSON.parse(f.shares[0].message).format,'go-demo-backup');assert.equal(f.alerts.length,0);f.setAuthorized(false);assert.equal(f.render(),null);});
test('changing interface language keeps company names and IDs intact',async()=>{const f=fixture();await f.catalog.create('GO PELUQUERÍA');const id=f.catalog.getSelectedId();f.setLang('en');const tree=newForm(f);assert.ok(content(tree).includes('Create business'));assert.ok(content(tree).includes('GO PELUQUERÍA'));assert.equal(f.catalog.getSelectedId(),id);});

test('copy preserves the complete backup byte for byte without writing company data',async()=>{
 const f=fixture();await f.catalog.create('GO PELUQUERÍA');const store=f.catalog.getSelectedStore();
 await store.updateConfig({address:'Dirección ficticia · áéíóú',services:[{name:'Corte DEMO',duration:30,price:12}],plantillaItems:[{id:'post',label:'Profesional',count:1,staffNames:['Profesional ficticio']}],activeDays:[0],openFrom:'09:00',openTo:'18:00'});
 await store.saveFloorPlan({id:store.planId,businessId:store.businessId,updatedAt:1,elements:Array.from({length:4},(_,i)=>({id:'space-'+i,type:'silla',label:'Raul '+(i+1)+' GO PRUEBA',x:10+i*100,y:20,width:90,height:52,capacity:1,status:'disponible',reservable:true}))});
 await store.saveReservations(store.planId,[{id:'test-reservation',planId:store.planId,elementId:'space-0',customerName:'Cliente ficticio',dateISO:'2030-01-07',date:'Prueba',time:'12:00',status:'pendiente',createdAt:1}]);
 await f.catalog.create('GO RESTAURANTE');await f.catalog.getSelectedStore().updateConfig({address:'Otra dirección ficticia'});
 const expected=await f.catalog.exportBackup(),before=Array.from(f.memory);byID(tools(f),'demo-company-copy-backup').props.onPress();await turn();
 assert.deepEqual(f.copies,[expected]);assert.deepEqual(Array.from(f.memory),before);assert.equal(f.shares.length,0);
 const backup=JSON.parse(f.copies[0]),company=backup.companies.find(record=>record.company.name==='GO PELUQUERÍA');
 assert.equal(backup.format,'go-demo-backup');assert.equal(backup.companies.length,3);assert.equal(company.data.config.services[0].name,'Corte DEMO');
 assert.equal(company.data.plan.elements.length,5);assert.deepEqual(company.data.plan.elements.slice(0,4).map(element=>[element.id,element.x,element.y]),Array.from({length:4},(_,i)=>['space-'+i,10+i*100,20]));assert.equal(company.data.plan.elements[4].demoKind,'professional');assert.equal(company.data.reservations[0].id,'test-reservation');
 assert.doesNotMatch(f.copies[0],/access_token|refresh_token|password|service_role/);assert.equal(f.alerts.length,1);assert.equal(f.alerts[0][0],'Copia copiada');
});

test('confirmation waits for clipboard completion and repeated taps copy only once',async()=>{
 let complete;const pending=new Promise(resolve=>complete=resolve),f=fixture(()=>pending);await f.catalog.create('Pending');
 const control=byID(tools(f),'demo-company-copy-backup');control.props.onPress();control.props.onPress();await turn();
 assert.equal(f.copies.length,1);assert.equal(f.alerts.length,0);assert.equal(byID(tools(f),'demo-company-copy-backup').props.disabled,true);
 complete(true);await turn();assert.equal(f.alerts.length,1);assert.equal(f.alerts[0][0],'Copia copiada');assert.equal(byID(tools(f),'demo-company-copy-backup').props.disabled,false);
});

test('clipboard rejection or false result never reports success and permits retry',async()=>{
 for(const outcome of [false,new Error('Fallo ficticio de portapapeles')]){
  let retry=false;const f=fixture(async()=>{if(retry)return true;if(outcome instanceof Error)throw outcome;return outcome;});await f.catalog.create('Keep');
  const before=Array.from(f.memory);byID(tools(f),'demo-company-copy-backup').props.onPress();await turn();
  assert.equal(f.alerts.length,1);assert.equal(f.alerts[0][0],'DEMO');assert.deepEqual(Array.from(f.memory),before);assert.equal(byID(tools(f),'demo-company-copy-backup').props.disabled,false);
  retry=true;byID(tools(f),'demo-company-copy-backup').props.onPress();await turn();assert.equal(f.alerts.at(-1)[0],'Copia copiada');assert.deepEqual(Array.from(f.memory),before);
 }
});


test('New business is always visible and creation/selection open the existing configuration by company name',async()=>{
 const opened=[];let f;f=fixture(undefined,{onOpenConfiguration:()=>opened.push(f.catalog.getSelectedId())});
 const keep=f.catalog.getSelectedStore();await keep.updateConfig({businessName:'GO PELUQUERÍA',address:'Dirección del negocio original',services:[{name:'Corte original',duration:30,price:12}]});const original=JSON.stringify(keep.getSnapshot());
 for(const name of ['Segundo negocio','Tercer negocio']){
  byID(f.render(),'demo-company-new').props.onPress();let tree=f.render();assert.ok(byID(tree,'demo-company-name').props.autoFocus);
  byID(tree,'demo-company-name').props.onChangeText(name);tree=f.render();const create=byID(tree,'demo-company-create');create.props.onPress();create.props.onPress();await turn();
  assert.equal(f.catalog.getSelectedStore().getSnapshot().config.businessName,name);assert.equal(byID(f.render(),'demo-company-name'),undefined);
 }
 assert.equal(f.catalog.getCompanies().length,3);assert.equal(opened.length,2);assert.equal(new Set(opened).size,2);assert.equal(JSON.stringify(keep.getSnapshot()),original);
 assert.ok(content(byID(f.render(),'demo-selected-company')).includes('Tercer negocio'));
 byID(f.render(),'demo-company-toggle').props.onPress();assert.ok(content(byID(f.render(),'demo-company-legacy')).includes('GO PELUQUERÍA'));
 byID(f.render(),'demo-company-legacy').props.onPress();await turn();assert.equal(opened.at(-1),'legacy');assert.equal(JSON.stringify(f.catalog.getSelectedStore().getSnapshot()),original);
 const reload=catalogAPI.createBusinessDemoCatalog({ownerUserId:f.catalog.ownerUserId,initialConfig:initial,canUse:()=>true,storage:f.storage});await reload.load();assert.equal(reload.getSelectedId(),'legacy');assert.equal(reload.getSelectedStore().getSnapshot().config.businessName,'GO PELUQUERÍA');
});

test('manager waits for pending company writes before changing selection or opening its wizard',async()=>{
 let opened=0;const f=fixture(undefined,{onOpenConfiguration:()=>opened++});const next=await f.catalog.create('Second');await f.catalog.select('legacy');
 const current=f.catalog.getSelectedStore(),setItem=f.storage.setItem;let release;const gate=new Promise(resolve=>release=resolve);
 f.storage.setItem=async(key,value)=>{if(key===storeAPI.businessDemoStorageKey(f.catalog.ownerUserId))await gate;await setItem(key,value)};
 const write=current.updateConfig({businessName:'Pending name',address:'Pending address'});await turn();
 const target=byID(f.render(),'demo-company-'+next);target.props.onPress();target.props.onPress();await turn();assert.equal(f.catalog.getSelectedId(),'legacy');assert.equal(opened,0);
 release();await write;await turn();assert.equal(f.catalog.getSelectedId(),next);assert.equal(opened,1);await f.catalog.select('legacy');assert.equal(f.catalog.getSelectedStore().getSnapshot().config.address,'Pending address');
});

test('failed creation never opens a wizard or changes the selected company',async()=>{
 let opened=0;const f=fixture(undefined,{onOpenConfiguration:()=>opened++});await f.catalog.getSelectedStore().updateConfig({businessName:'Keep'});const selected=f.catalog.getSelectedId();
 f.storage.setItem=async()=>{throw Error('disk failure')};newForm(f);byID(f.render(),'demo-company-name').props.onChangeText('Fail');byID(f.render(),'demo-company-create').props.onPress();await turn();
 assert.equal(opened,0);assert.equal(f.catalog.getSelectedId(),selected);assert.equal(f.catalog.getCompanies().length,1);assert.ok(f.alerts.some(row=>String(row[1]).includes('disk failure')));
});


test('compact selector counts actual businesses once and places all recovery tools in secondary administration',async()=>{
 const f=fixture();await f.catalog.load();let tree=f.render();assert.match(content(byID(tree,'demo-company-toggle')),/Mis negocios · 0/);assert.equal(byID(tree,'demo-company-legacy'),undefined);
 assert.equal(byID(tree,'demo-company-name'),undefined);assert.equal(byID(tree,'demo-company-tools'),undefined);assert.equal(byID(tree,'demo-company-copy-backup'),undefined);assert.equal(byID(tree,'demo-company-archive-current'),undefined);
 for(const name of ['GO PELUQUERÍA','GO RESTAURANTE'])await f.catalog.create(name);
 tree=f.render();assert.match(content(byID(tree,'demo-company-toggle')),/Mis negocios · 2/);
 const list=byID(tree,'demo-company-list');assert.ok(list.props.style.maxHeight<=150);
 for(const company of f.catalog.getCompanies().filter(company=>!company.placeholder)){assert.equal(nodes(tree).filter(node=>node.props.testID==='demo-company-'+company.id).length,1);assert.ok(content(byID(tree,'demo-company-'+company.id)).includes(company.name));}
 assert.equal(button(tree,'GO PELUQUERÍA').props.testID.startsWith('demo-company-'),true,'A business name is a real selector row, never a preset name input');
 tree=tools(f);assert.ok(byID(tree,'demo-company-backup'));assert.ok(byID(tree,'demo-company-copy-backup'));assert.ok(byID(tree,'demo-company-import-toggle'));assert.ok(byID(tree,'demo-company-previous-save'));assert.ok(byID(tree,'demo-company-archive-current'));assert.ok(byID(tree,'demo-company-legacy'));
 const current=f.catalog.getSelectedId();byID(tree,'demo-company-archive-current').props.onPress();f.alerts.at(-1)[2].find(action=>action.onPress).onPress();await turn();tree=tools(f);assert.match(content(byID(tree,'demo-company-toggle')),/Mis negocios · 1/);assert.ok(byID(tree,'demo-company-'+current));
 byID(tree,'demo-company-'+current).props.onPress();await turn();assert.match(content(byID(f.render(),'demo-company-toggle')),/Mis negocios · 2/);
});

test('an unnamed legacy business with saved data remains selectable and cancelling New business writes nothing',async()=>{
 const f=fixture();await f.catalog.getSelectedStore().updateConfig({address:'Dirección existente sin nombre'});const bytes=Array.from(f.memory);
 let tree=f.render();assert.match(content(byID(tree,'demo-company-toggle')),/Mis negocios · 1/);assert.ok(byID(tree,'demo-company-legacy'));
 tree=newForm(f);byID(tree,'demo-company-name').props.onChangeText('No crear');byID(f.render(),'demo-company-create-cancel').props.onPress();tree=f.render();assert.equal(byID(tree,'demo-company-create-form'),undefined);assert.deepEqual(Array.from(f.memory),bytes);assert.equal(f.catalog.getSelectedId(),'legacy');
});


test('empty business name has visible validation and remains a draft, never a counted company',async()=>{
 const f=fixture(),before=Array.from(f.memory);let tree=newForm(f);
 byID(tree,'demo-company-create').props.onPress();await turn();tree=f.render();
 assert.match(content(byID(tree,'demo-company-create-error')),/nombre del negocio/);
 assert.match(content(byID(tree,'demo-company-toggle')),/Mis negocios · 0/);
 assert.deepEqual(Array.from(f.memory),before);assert.ok(byID(tree,'demo-company-name'));
});
test('keyboard submission uses the latest name, creates once, and opens the independent wizard',async()=>{
 let opened=0;const f=fixture(undefined,{onOpenConfiguration:()=>opened++});const tree=newForm(f);
 const form=byID(tree,'demo-company-create-form');assert.equal(form.type,'ScrollView');assert.equal(form.props.keyboardShouldPersistTaps,'always');
 assert.equal(byID(tree,'demo-company-list'),undefined,'creation does not compete with the list for keyboard space');
 const input=byID(tree,'demo-company-name');assert.equal(input.props.returnKeyType,'go');
 input.props.onChangeText('  GO RESTAURANTE  ');input.props.onSubmitEditing();byID(tree,'demo-company-create').props.onPress();await turn();
 assert.equal(opened,1);assert.equal(f.catalog.getSelectedStore().getSnapshot().config.businessName,'GO RESTAURANTE');
 assert.match(content(byID(f.render(),'demo-company-toggle')),/Mis negocios · 1/);assert.equal(f.catalog.getSelectedStore().getSnapshot().config.completedSteps.length,0);
});
