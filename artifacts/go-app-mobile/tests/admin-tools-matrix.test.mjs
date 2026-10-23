import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import lifecycle from './helpers/react-lifecycle.cjs';
const {React,createRoot,document,ts,native,rn,evaluate}=lifecycle;
const homeSource=fs.readFileSync('app/index.tsx','utf8');
const home=ts.createSourceFile('home.tsx',homeSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let homeBody,selectorExpression,toolsCallback;
function visit(n){
 if(ts.isFunctionDeclaration(n)&&n.name?.text==='HomeScreenContent')homeBody=n.body;
 if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(home)==='HerramientasPanel'){
  selectorExpression=n.attributes.properties.find(p=>p.name?.getText(home)==='landingVariantControls')?.initializer?.expression?.getText(home);
 }
 if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(home)==='GoAdminDashboard'){
  toolsCallback=n.attributes.properties.find(p=>p.name?.getText(home)==='onOpenTools')?.initializer?.expression?.getText(home);
 }
 ts.forEachChild(n,visit);
}visit(home);
const statement=name=>homeBody.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(home)===name));
assert.ok(statement('userLandingVisualEnabled')&&statement('openUserLandingPreviewFromTools')&&selectorExpression&&toolsCallback);
// Exercise the actual Home connection block and JSX props, rather than a second policy implementation.
const block=homeSource.slice(statement('userLandingVisualEnabled').getStart(home),statement('openUserLandingPreviewFromTools').end);
const scope={exports:{}};
vm.runInNewContext(ts.transpileModule(`exports.make=({React,env,capture,useGoView,useLandingVisualVariant,LandingVariantSelector})=>function FixtureHome(){
const {useState,useEffect,useRef}=React;
const adminAccess=env.admin,goView=useGoView(),authBootstrapComplete=env.authReady,goAuthOpen=env.loginOpen,lang='es';
const [optionsOpen,setOptionsOpen]=useState(true),[adminDashOpen,setAdminDashOpen]=useState(false);
const commitUserPhone=()=>env.commits++,showToast=(message,kind)=>env.toasts.push({message,kind});
const handleOpenOptions=()=>setOptionsOpen(true);
${block}
capture({landingVisual,userLandingVisualEnabled,landingVariantToolsEnabled,landingPreviewOpening,optionsOpen,adminDashOpen,goView,
openUserLandingPreviewFromTools,setOptionsOpen,setAdminDashOpen,onOpenTools:${toolsCallback}});
useEffect(()=>{env.mounts++;return()=>env.unmounts++;},[]);
return <div>{optionsOpen?(${selectorExpression}):null}</div>;
};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,scope);
const settle=async operation=>React.act(async()=>{if(operation)await operation();for(let i=0;i<45;i++)await Promise.resolve();});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
const catalog=evaluate('components/landing/landingVariant.ts');
const model=evaluate('components/landing/landingVisualPreference.ts',{'./landingVariant':catalog});
const policy=evaluate('data/goViewPolicy.ts');
const variants=['actual','marca','identidad','planeta'];
const variantLabel=key=>'Previsualizar '+catalog.LANDING_VISUAL_VARIANTS.find(v=>v.key===key).label;
function text(children){return Array.isArray(children)?children.map(text).join(''):React.isValidElement(children)?text(children.props.children):children==null?'':String(children);}
const auth=(id=alice,level=null)=>({userId:id,allowed:!!level,isOwner:level==='owner',checking:false,unavailable:false});
async function fixture({level=null,id=alice,business=false,selected='ADMIN',active='actual',writeGate=null,failWrite=false}={}){
 const buttons=new Set(),dialogs=[],requests=[],reads=[],writes=[],attempts=[];
 const data=new Map([['demo-preserved','keep'],['go_auth_session_v2','fictional-marker']]);
 if(level==='owner')data.set(policy.ownerViewStorageKey(id),selected);
 if(active!=='actual')data.set(model.landingVisualStorageKey(id),JSON.stringify({version:1,confirmed:true,active,previous:'actual',lastGood:'actual'}));
 const storage={getItem:async k=>{reads.push(k);return data.get(k)??null;},setItem:async(k,v)=>{
  attempts.push([k,v]);if(k.startsWith('go_owner_view_context_v1:')&&writeGate)await writeGate.promise;
  if(k.startsWith('go_owner_view_context_v1:')&&failWrite)throw Error('simulated storage denial');
  writes.push([k,v]);data.set(k,v);
 }};
 const env={admin:auth(id,level),authReady:true,loginOpen:false,commits:0,toasts:[],mounts:0,unmounts:0};
 let live,root,Root;
 const render=()=>root.render(React.createElement(Root));
 const refreshOwner=async expected=>{
  const request=deferred();requests.push({...request,expected});
  env.admin={...env.admin,allowed:false,isOwner:false,checking:true};render();
  const result=await request.promise;
  if(env.admin.userId!==expected)return false;
  env.admin={...result,refreshOwner};render();
  return result.userId===expected&&result.allowed&&result.isOwner;
 };
 env.admin.refreshOwner=refreshOwner;
 const Touch=props=>{
  const ref=React.useRef();ref.current=props;
  React.useEffect(()=>{buttons.add(ref);return()=>buttons.delete(ref);},[]);
  return React.createElement('div',{'data-button':props.accessibilityLabel??text(props.children)},props.children);
 };
 const mockNative={...rn,TouchableOpacity:Touch,Alert:{alert:(...args)=>dialogs.push(args)}};
 const view=evaluate('contexts/GoViewContext.tsx',{
  '@react-native-async-storage/async-storage':storage,'./GoAdminAccessContext':{useAdminAccess:()=>env.admin},
  './GoModeContext':{useGoMode:()=>({isBusinessMode:business})},'@/data/goViewPolicy':policy,
 });
 const visual=evaluate('hooks/useLandingVisualVariant.ts',{'@react-native-async-storage/async-storage':storage,
  '@/components/landing/landingVisualPreference':model});
 const selector=evaluate('components/landing/LandingVariantSelector.tsx',{'react-native':mockNative,'./landingVariant':catalog});
 const FixtureHome=scope.exports.make({React,env,capture:v=>live=v,useGoView:view.useGoView,
  useLandingVisualVariant:visual.useLandingVisualVariant,LandingVariantSelector:selector.LandingVariantSelector});
 Root=()=>React.createElement(view.GoViewProvider,null,React.createElement(FixtureHome));
 root=createRoot(document.createElement('div'));await settle(render);
 const button=label=>{
  const found=Array.from(buttons,x=>x.current).find(p=>p.accessibilityLabel===label);
  assert.ok(found,'Missing button '+label);return found;
 };
 return{env,data,reads,writes,attempts,dialogs,requests,get live(){return live;},get buttons(){return Array.from(buttons,x=>x.current);},button,
  async press(label){let result;await settle(()=>{const p=button(label);assert.equal(!!p.disabled,false,label);result=p.onPress();});return{result};},
  async choose(v){return this.press(variantLabel(v));},
  async openTools(){await settle(()=>live.setOptionsOpen(true));},
  async confirm(){await this.press('Confirmar activación');assert.equal(dialogs.at(-1)[0],'Activar variante del Landing');
   await settle(()=>dialogs.at(-1)[2].find(b=>b.text==='Activar').onPress());},
  async resolveOwner(result=auth(env.admin.userId,'owner')){await settle(()=>requests.at(-1).resolve(result));},
  async update(next){await settle(()=>{Object.assign(env,next);env.admin.refreshOwner=refreshOwner;render();});},
  async switchView(next){let result;await settle(()=>{result=live.goView.selectOwnerView(next);});await this.resolveOwner();return result;},
  async flush(){await settle();},async close(){await settle(()=>root.unmount());},
 };
}

for(const active of variants)for(const settings of [{},{level:'owner',selected:'USER'},{business:true},{level:'owner',selected:'BUSINESS'}])
test('only assigned appearance, no variant Tools: '+JSON.stringify({...settings,active}),async()=>{
 const f=await fixture({...settings,active});try{
  const view=settings.business||settings.selected==='BUSINESS'?'BUSINESS':'USER';
  assert.equal(f.live.goView.view,view);assert.equal(f.live.landingVariantToolsEnabled,false);
  assert.equal(f.buttons.length,0,'no variant selection, preview or activation controls outside ADMIN');
  await settle(()=>f.live.openUserLandingPreviewFromTools());
  assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);assert.equal(f.env.commits,0);
  assert.equal(f.live.landingVisual.preview,null);assert.equal(f.live.landingVisual.active,active);
  assert.equal(catalog.resolveUserLandingVariant(view,f.live.landingVisual.ready,true,active,null),view==='USER'?active:'actual');
  await f.openTools();assert.equal(f.buttons.length,0);
 }finally{await f.close();}
});

test('owner ADMIN manages the same UUID-scoped preference without changing the ADMIN appearance',async()=>{
 const f=await fixture({level:'owner'});try{
  assert.equal(f.live.goView.isAdminView,true);assert.equal(f.live.userLandingVisualEnabled,false);
  assert.equal(f.live.landingVariantToolsEnabled,true);
  for(const key of variants){await f.choose(key);assert.equal(f.live.landingVisual.preview,key);
   assert.equal(catalog.resolveUserLandingVariant('ADMIN',true,true,f.live.landingVisual.active,key),'actual');}
  assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);await f.confirm();
  assert.equal(f.live.landingVisual.active,'planeta');assert.equal(f.writes.length,1);
  await f.choose('marca');await f.press('Cancelar vista previa');assert.equal(f.live.landingVisual.preview,null);
  assert.equal(f.live.landingVisual.active,'planeta');await f.press('Recuperar A · Landing conservado');await f.confirm();
  assert.equal(f.live.landingVisual.active,'actual');assert.equal(f.env.mounts,1);
  assert.ok(f.writes.every(([k])=>k===model.landingVisualStorageKey(alice)));
  assert.equal(f.data.get('demo-preserved'),'keep');assert.equal(f.data.get('go_auth_session_v2'),'fictional-marker');
 }finally{await f.close();}
});

for(const key of variants)test('owner preview '+key+' survives real context revalidation and opens USER once',async()=>{
 const f=await fixture({level:'owner'});try{
  await f.choose(key);const {result}=await f.press('Ver vista previa en el Landing');
  assert.equal(f.requests.length,1);assert.equal(f.live.landingPreviewOpening,true);
  assert.equal(f.live.landingVariantToolsEnabled,false,'no ADMIN control while authorization is being checked');
  await f.resolveOwner();await result;await f.flush();
  assert.equal(f.live.goView.view,'USER');assert.equal(f.live.landingVisual.preview,key);
  assert.equal(f.live.landingVisual.active,'actual');assert.equal(f.live.optionsOpen,false);
  assert.equal(f.env.mounts,1);assert.equal(f.env.unmounts,0);assert.equal(f.env.commits,1);
  assert.deepEqual(f.writes,[[policy.ownerViewStorageKey(alice),'USER']]);
  await f.openTools();assert.equal(f.buttons.length,0,'USER has no variant configuration, including the owner USER context');
  await settle(()=>f.live.openUserLandingPreviewFromTools());assert.equal(f.requests.length,1);
  assert.equal(await f.switchView('ADMIN'),true);await f.flush();
  await f.choose(key);await f.confirm();assert.equal(f.live.landingVisual.active,key);
  assert.equal(f.live.landingVisual.active,key);assert.equal(f.live.landingVariantToolsEnabled,true);
  assert.equal(catalog.resolveUserLandingVariant('ADMIN',true,true,key,null),'actual');
 }finally{await f.close();}
});

test('technical ADMIN configures its own USER preference without acquiring owner context rights',async()=>{
 const f=await fixture({level:'technical'});try{
  assert.equal(f.live.goView.isAdminView,true);assert.equal(f.live.goView.isOwner,false);
  for(const key of variants){await f.choose(key);assert.equal(f.button('Ver vista previa en el Landing').disabled,true);}
  await f.confirm();assert.equal(f.live.landingVisual.active,'planeta');assert.equal(f.requests.length,0);
  assert.equal(f.live.goView.view,'ADMIN');assert.deepEqual(f.writes.map(([k])=>k),[model.landingVisualStorageKey(alice)]);
 }finally{await f.close();}
});

test('business and unhydrated access do not expose or activate the USER selector',async()=>{
 for(const settings of [{business:true},{level:'owner',selected:'BUSINESS'}]){
  const f=await fixture(settings);try{
   assert.equal(f.live.goView.view,'BUSINESS');assert.equal(f.live.landingVariantToolsEnabled,false);assert.equal(f.buttons.length,0);
   assert.equal(f.live.landingVisual.startPreview('marca'),false);assert.equal(await f.live.landingVisual.confirm(),false);
   assert.equal(f.writes.length,0);
  }finally{await f.close();}
 }
 const f=await fixture({level:'owner'});try{
  await f.update({authReady:false});assert.equal(f.live.landingVariantToolsEnabled,false);
  await f.update({authReady:true,loginOpen:true});assert.equal(f.live.landingVariantToolsEnabled,false);
  await f.update({loginOpen:false,admin:auth(null)});assert.equal(f.live.landingVariantToolsEnabled,false);
  assert.equal(f.writes.length,0);
 }finally{await f.close();}
});

test('slow context persistence disables the selector and rejects duplicate preview requests',async()=>{
 const gate=deferred(),f=await fixture({level:'owner',writeGate:gate});try{
  await f.choose('marca');const staleAction=f.live.openUserLandingPreviewFromTools;
  const {result}=await f.press('Ver vista previa en el Landing');await f.resolveOwner();
  assert.equal(f.live.goView.view,'ADMIN');assert.equal(f.live.landingPreviewOpening,true);
  assert.ok(f.buttons.length>0&&f.buttons.every(p=>p.disabled===true));
  await settle(()=>staleAction());assert.equal(f.requests.length,1);
  await settle(()=>gate.resolve());await result;await f.flush();
  assert.equal(f.live.goView.view,'USER');assert.equal(f.live.landingVisual.preview,'marca');
  assert.equal(f.live.landingPreviewOpening,false);assert.equal(f.env.mounts,1);
 }finally{gate.resolve();await f.close();}
});

test('failed context persistence releases controls without activating a variant or closing Tools',async()=>{
 const f=await fixture({level:'owner',failWrite:true});try{
  await f.choose('identidad');const {result}=await f.press('Ver vista previa en el Landing');await f.resolveOwner();await result;await f.flush();
  assert.equal(f.live.goView.view,'ADMIN');assert.equal(f.live.optionsOpen,true);assert.equal(f.live.landingPreviewOpening,false);
  assert.equal(f.live.landingVisual.active,'actual');assert.equal(f.writes.length,0);
  assert.equal(f.env.toasts.at(-1).kind,'error');await f.choose('planeta');assert.equal(f.live.landingVisual.preview,'planeta');
 }finally{await f.close();}
});

test('revoked owner access denies USER preview and never activates or writes a draft',async()=>{
 const f=await fixture({level:'owner'});try{
  await f.choose('marca');const {result}=await f.press('Ver vista previa en el Landing');
  await f.resolveOwner(auth(alice));await result;await f.flush();
  assert.equal(f.live.goView.isAdminView,false);assert.equal(f.live.goView.isOwner,false);
  assert.equal(f.live.landingVisual.preview,null);assert.equal(f.live.landingVisual.active,'actual');assert.equal(f.writes.length,0);
  assert.equal(f.live.optionsOpen,true);assert.equal(f.env.toasts.at(-1).kind,'error');
 }finally{await f.close();}
});

test('identity change releases the new account without restoring the old account preview',async()=>{
 const f=await fixture({level:'owner'});try{
  await f.choose('marca');const {result}=await f.press('Ver vista previa en el Landing');
  await f.update({admin:auth(bob)});
  assert.equal(f.live.landingPreviewOpening,false);assert.equal(f.live.goView.view,'USER');
  assert.equal(f.buttons.length,0,'new non-ADMIN identity has no access to variants');
  assert.equal(f.live.landingVariantToolsEnabled,false);assert.equal(f.live.landingVisual.active,'actual');
  await f.resolveOwner(auth(alice,'owner'));await result;await f.flush();
  assert.equal(f.live.landingVisual.preview,null);assert.equal(f.live.landingVisual.active,'actual');
  assert.deepEqual(f.writes,[]);
  assert.equal(f.data.has(model.landingVisualStorageKey(alice)),false);assert.equal(f.env.commits,0);
 }finally{await f.close();}
});

test('a pending old write cannot unlock a new identity preview transition',async()=>{
 const gate=deferred(),f=await fixture({level:'owner',writeGate:gate});try{
  await f.choose('marca');const first=(await f.press('Ver vista previa en el Landing')).result;await f.resolveOwner();
  f.data.set(policy.ownerViewStorageKey(bob),'ADMIN');await f.update({admin:auth(bob,'owner')});
  assert.equal(f.live.landingPreviewOpening,false);await f.choose('planeta');
  const second=(await f.press('Ver vista previa en el Landing')).result;assert.equal(f.live.landingPreviewOpening,true);
  await settle(()=>gate.resolve());await first;await f.flush();assert.equal(f.live.landingPreviewOpening,true);
  assert.equal(f.requests.length,2);await f.resolveOwner(auth(bob,'owner'));await second;await f.flush();
  assert.equal(f.live.goView.view,'USER');assert.equal(f.live.landingVisual.preview,'planeta');
  assert.equal(f.live.landingPreviewOpening,false);assert.equal(f.data.has(model.landingVisualStorageKey(alice)),false);
 }finally{gate.resolve();await f.close();}
});

test('ADMIN dashboard Tools opens the single existing Herramientas connection, with permission guards',async()=>{
 const buttons=new Set();let currentAdmin=auth(alice,'owner'),currentView={isAdminView:true,isOwner:true},opened=0;
 const Touch=props=>{const ref=React.useRef();ref.current=props;React.useEffect(()=>{buttons.add(ref);return()=>buttons.delete(ref);},[]);
  return React.createElement('div',null,props.children);};
 const imports={
  'react-native':{...rn,TouchableOpacity:Touch,SafeAreaView:native('SafeAreaView'),ScrollView:native('ScrollView'),Dimensions:{get:()=>({width:390})}},
  '@/components/debug/OwnerContextIndicator':{OwnerContextModal:({visible,children})=>visible?React.createElement('div',null,children):null},
  '@expo/vector-icons':{Feather:native('Icon')},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:44,bottom:34})},
  'expo-status-bar':{StatusBar:native('StatusBar')},'../DraggableFAB':{DraggableFAB:native('Fab')},
  '@/contexts/LanguageContext':{useLanguage:()=>({lang:'es'})},'@/contexts/GoAdminAccessContext':{useAdminAccess:()=>currentAdmin},
  '@/contexts/GoViewContext':{useGoView:()=>currentView},
 };
 for(const name of ['AdminScreen','PartnersScreen','PublicidadScreen','FacturacionScreen','ZonasScreen','ConsumoScreen','GoRoadmapScreen'])
  imports['./'+name]={[name]:native(name)};
 imports['./GoModulePublicationPanel']={GoModulePublicationPanel:native('GoModulePublicationPanel')};
 const Dashboard=evaluate('components/empresa/GoAdminDashboard.tsx',imports).GoAdminDashboard;
 const root=createRoot(document.createElement('div'));
 const render=callback=>root.render(React.createElement(Dashboard,{visible:true,onClose(){},onOpenTools:callback}));
 const cards=()=>Array.from(buttons,r=>r.current).filter(p=>text(p.children).startsWith('Herramientas'));
 try{
  await settle(()=>render(()=>opened++));assert.equal(cards().length,1);await settle(()=>cards()[0].onPress());assert.equal(opened,1);
  currentAdmin=auth(alice,'technical');currentView={isAdminView:true,isOwner:false};await settle(()=>render(()=>opened++));
  await settle(()=>cards()[0].onPress());assert.equal(opened,2);
  await settle(()=>render(undefined));assert.equal(cards()[0].disabled,true);
  currentView={isAdminView:false,isOwner:false};await settle(()=>render(()=>opened++));assert.equal(cards().length,0);
  currentView={isAdminView:true,isOwner:false};currentAdmin=auth(alice);await settle(()=>render(()=>opened++));assert.equal(cards().length,0);
 }finally{await settle(()=>root.unmount());}
 const f=await fixture({level:'owner'});try{
  await settle(()=>{f.live.setOptionsOpen(false);f.live.setAdminDashOpen(true);});
  await settle(()=>f.live.onOpenTools());assert.equal(f.live.adminDashOpen,false);assert.equal(f.live.optionsOpen,true);
  assert.ok(f.button(variantLabel('marca')));assert.equal((homeSource.match(/<HerramientasPanel\b/g)||[]).length,1);
 }finally{await f.close();}
});
