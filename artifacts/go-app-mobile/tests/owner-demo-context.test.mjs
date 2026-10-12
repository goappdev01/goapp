import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
const ts = createRequire(path.join(process.cwd(), "package.json"))("typescript");
const compile = p => ts.transpileModule(readFileSync(p,"utf8"),{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,
}}).outputText;
const ownerId="11111111-1111-4111-8111-111111111111";
function fixture(dev=true,{realCatalog=false,memory=new Map()}={}) {
  let admin={isOwner:true,userId:ownerId,checking:false},view={view:"BUSINESS"},hook;
  const instances=new Map(),effects=[],stores=[],alerts=[],ownerChecks=[],timers=new Map(),stateListeners=new Set();
  let ownerResult=true,deferredCheck,deferredResolve,deferredWrite,writeResolve,timerId=0;
  const React={
    createContext:value=>({value,Provider:"Provider"}), useContext:context=>context.value,
    createElement:(type,props,...children)=>({type,props:props??{},children}),
    useRef:value=>{const i=hook.cursor++;return hook.slots[i]??=( {current:value});},
    useState:value=>{const i=hook.cursor++;hook.slots[i]??={value};
      return [hook.slots[i].value,next=>{hook.slots[i].value=typeof next==="function"?next(hook.slots[i].value):next;}];},
    useMemo:(fn,deps)=>{const i=hook.cursor++,old=hook.slots[i];if(!old||!same(old.deps,deps))hook.slots[i]={deps,value:fn()};return hook.slots[i].value;},
    useCallback:(fn,deps)=>React.useMemo(()=>fn,deps),
    useEffect:(fn,deps)=>{const i=hook.cursor++,old=hook.slots[i];if(!old||!same(old.deps,deps)){const slot={deps};hook.slots[i]=slot;effects.push(()=>{old?.cleanup?.();slot.cleanup=fn();});}},
  };
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const AppState={currentState:"active",addEventListener:(_event,listener)=>{stateListeners.add(listener);return {remove:()=>stateListeners.delete(listener)}}};
  admin.refreshOwner=async expected=>{ownerChecks.push(expected);return deferredCheck ? await deferredCheck : ownerResult;};
  const load=(file,imports)=>{const exports={};vm.runInNewContext(compile(file),{exports,__DEV__:dev,console,
    setTimeout:(fn,ms)=>{assert.equal(ms,30000);const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    require:name=>{if(name in imports)return imports[name];throw Error("Unexpected import: "+name);}});return exports;};
  const storage={getItem:async key=>memory.get(key)??null,setItem:async(key,value)=>memory.set(key,value)};
  const storeModule=realCatalog?load("data/businessDemoStore.ts",{}):undefined;
  const catalogModule=realCatalog?load("data/businessDemoCatalog.ts",{"./businessDemoStore":storeModule}):undefined;
  const provider=load("contexts/OwnerBusinessDemoContext.tsx",{
    react:{default:React,...React},"react-native":{AppState,Alert:{alert:(...args)=>alerts.push(args)}},
    "@react-native-async-storage/async-storage":{default:storage},
    "./GoAdminAccessContext":{useAdminAccess:()=>admin},
    "@/data/businessDemoCatalog":{createBusinessDemoCatalog:options=>{
      if(realCatalog)return catalogModule.createBusinessDemoCatalog(options);
      const config={businessName:"GO Prueba",completedSteps:[]},listeners=new Set();
      const store={owner:options.ownerUserId,canUse:options.canUse,getSnapshot:()=>({config,ownerUserId:options.ownerUserId}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
        load:async()=>{assert.equal(options.canUse(),true);store.loads++;},loads:0,
        writes:[],updateConfig:async patch=>{assert.equal(options.canUse(),true);if(deferredWrite)await deferredWrite;assert.equal(options.canUse(),true);store.writes.push(patch);Object.assign(config,patch);for(const listener of listeners)listener();}};stores.push(store);return {getSelectedStore:()=>store,subscribe:store.subscribe,load:async()=>{},getStores:()=>[store]};
    }},
  });
  let context={loaded:false};
  const indicator=load("components/debug/OwnerContextIndicator.tsx",{
    react:{default:React,...React},
    "react-native":{Modal:"NativeModal",Platform:{OS:"ios"},View:"View",Text:"Text",StyleSheet:{create:v=>v}},
    "react-native-screens":{FullWindowOverlay:"FullWindowOverlay"},
    "react-native-safe-area-context":{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})},
    "@/contexts/GoViewContext":{useGoView:()=>view},
    "@/contexts/GoAdminAccessContext":{useAdminAccess:()=>admin},
    "@/contexts/OwnerBusinessDemoContext":{useOwnerBusinessDemo:()=>context},
  });
  const render=(component,props={})=>{
    hook=instances.get(component)??{slots:[],cursor:0};instances.set(component,hook);hook.cursor=0;
    const tree=component(props);for(const effect of effects.splice(0))effect();
    if(component===provider.OwnerBusinessDemoProvider)context=tree.props.value;return tree;
  };
  return {provider,indicator,stores,alerts,AppState,render,ownerChecks,timers,memory,storage,storeModule,
    setOwnerResult:result=>{ownerResult=result;},
    deferStoreWrite:()=>{deferredWrite=new Promise(resolve=>writeResolve=resolve);}, resolveStoreWrite:()=>writeResolve(),
    deferOwnerCheck:()=>{deferredCheck=new Promise(resolve=>deferredResolve=resolve);},
    resolveOwnerCheck:result=>deferredResolve(result),
    emitState:state=>{AppState.currentState=state;for(const listener of stateListeners)listener(state);},
    expireTimers:()=>{for(const fn of [...timers.values()])fn();},
    unmount:component=>{for(const slot of instances.get(component).slots)slot?.cleanup?.();instances.delete(component);},
    setAdmin:next=>{admin={...admin,...next};},setView:next=>{view={view:next};},
    get value(){return context;},flush:async()=>{for(let i=0;i<8;i++)await Promise.resolve();}};
}
const nodes=tree=>!tree||typeof tree!=="object"?[]:[tree,...(tree.children??[]).flatMap(child=>Array.isArray(child)?child.flatMap(nodes):nodes(child))];
const base={children:"Existing stack",initialConfig:{businessName:""}};
test("one authorized owner store persists across all three visual contexts",async()=>{
  const f=fixture();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();
  f.render(f.provider.OwnerBusinessDemoProvider,base);const first=f.value.demo;assert.ok(first);
  for(const next of ["USER","ADMIN","BUSINESS"]){f.setView(next);f.render(f.provider.OwnerBusinessDemoProvider,base);assert.equal(f.value.demo,first);assert.equal(first.canUse(),true);}
  assert.equal(f.stores.length,1);
});
test("revalidation/revocation and background immediately block the DEMO, without reading another owner",async()=>{
  const f=fixture();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  const first=f.value.demo;f.AppState.currentState="background";assert.equal(first.canUse(),false);f.AppState.currentState="active";
  f.setAdmin({isOwner:false,checking:true});f.render(f.provider.OwnerBusinessDemoProvider,base);
  assert.equal(first.canUse(),false);assert.equal(f.value.demo,undefined);
  f.setAdmin({checking:false});f.render(f.provider.OwnerBusinessDemoProvider,base);assert.equal(f.value.demo,undefined);
});
test("normal users and changed UUID never receive the previous owner's store",async()=>{
  const f=fixture();f.setAdmin({isOwner:false});f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();
  assert.equal(f.value.demo,undefined);assert.equal(f.stores[0].loads,0);
  f.setAdmin({isOwner:true});f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  const first=f.value.demo;f.setAdmin({userId:"22222222-2222-4222-8222-222222222222",isOwner:false});
  f.render(f.provider.OwnerBusinessDemoProvider,base);assert.equal(first.canUse(),false);assert.equal(f.value.demo,undefined);
});
test("a single iOS window label follows ADMIN/EMPRESA/USUARIO and never consumes touches",async()=>{
  const f=fixture();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  for(const [context,label]of [["ADMIN","ADMIN"],["BUSINESS","EMPRESA DEMO · DEMO LOCAL"],["USER","USUARIO · DEMO LOCAL"]]){
    f.setView(context);const tree=f.render(f.indicator.OwnerContextSurface,{children:"Original navigator"});
    const overlays=nodes(tree).filter(node=>node.type==="FullWindowOverlay");assert.equal(overlays.length,1);
    assert.equal(overlays[0].props.unstable_accessibilityContainerViewIsModal,false);
    const indicator=overlays[0].children[0];assert.equal(indicator.props.label,label);
    const badge=f.render(indicator.type,indicator.props);assert.equal(badge.props.pointerEvents,"none");
    assert.equal(badge.props.style[1].top,49);
    const modal=f.render(f.indicator.OwnerContextModal,{visible:true,children:"Original contents",onRequestClose(){}});
    assert.equal(nodes(modal).filter(node=>node.props?.testID==="owner-context-indicator").length,0);
  }
});
test("debug labels stay hidden in release and for public accounts",()=>{
  for(const dev of [false,true]){const f=fixture(dev);if(dev)f.setAdmin({isOwner:false});
    assert.equal(nodes(f.render(f.indicator.OwnerContextSurface,{children:"Public UI"})).filter(node=>node.type==="FullWindowOverlay").length,0);}
});
test("native modal callbacks, visibility and public contents are preserved",()=>{
  const f=fixture();f.setAdmin({isOwner:false});let called=0;const onClose=()=>called++;
  const modal=f.render(f.indicator.OwnerContextModal,{visible:true,onRequestClose:onClose,children:"Existing screen"});
  assert.equal(modal.type,"NativeModal");assert.equal(modal.props.visible,true);modal.props.onRequestClose();
  assert.equal(called,1);assert.equal(modal.children[0],"Existing screen");
});

test("GPS waits for fresh owner revalidation and provider render acknowledgement", async () => {
  const f=fixture();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  const sameStore=f.value.demo;let complete=false;
  f.deferOwnerCheck();
  const saved=f.value.saveDeviceCoordinates({latitude:40.4,longitude:-3.7},ownerId,"ES").then(()=>{complete=true});
  f.render(f.provider.OwnerBusinessDemoProvider,base);
  assert.equal(f.ownerChecks.length,1);assert.equal(f.ownerChecks[0],ownerId);assert.equal(sameStore.writes.length,0);
  f.setAdmin({isOwner:false,checking:true});f.render(f.provider.OwnerBusinessDemoProvider,base);
  f.resolveOwnerCheck(true);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  assert.equal(complete,false);assert.equal(sameStore.writes.length,0);assert.equal(sameStore.canUse(),false);
  f.setAdmin({isOwner:true,checking:false});f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();
  f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();await saved;
  assert.equal(complete,true);assert.equal(sameStore.writes.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(sameStore.writes[0])),{coordinates:{latitude:40.4,longitude:-3.7},countryCode:"ES"});
  assert.equal(f.timers.size,0);
});
test("GPS foreground wait preserves store guards and performs a real owner check after returning",async()=>{
  const f=fixture();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  const store=f.value.demo;
  f.emitState("inactive");f.setAdmin({isOwner:false,checking:true});f.render(f.provider.OwnerBusinessDemoProvider,base);
  const saved=f.value.saveDeviceCoordinates({latitude:1,longitude:2},ownerId);
  f.render(f.provider.OwnerBusinessDemoProvider,base);assert.equal(f.ownerChecks.length,0);assert.equal(store.canUse(),false);assert.equal(store.writes.length,0);
  f.emitState("active");f.setAdmin({isOwner:true,checking:false});f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();
  f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();await saved;
  assert.equal(f.ownerChecks.length,1);assert.equal(store.writes.length,1);assert.equal(f.timers.size,0);
});
test("a denied fresh owner check rejects GPS and never writes",async()=>{
  const f=fixture();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  const store=f.value.demo;f.setOwnerResult(false);
  const saved=f.value.saveDeviceCoordinates({latitude:1,longitude:2},ownerId);
  const rejected=assert.rejects(saved,/servidor no autoriza/);
  f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();await rejected;
  assert.equal(store.writes.length,0);assert.equal(f.timers.size,0);
});
test("a changed UUID cancels pending GPS without writing either owner's data",async()=>{
  const f=fixture();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  const store=f.value.demo;f.deferOwnerCheck();
  const saved=f.value.saveDeviceCoordinates({latitude:1,longitude:2},ownerId),rejected=assert.rejects(saved,/identidad propietaria/);
  f.render(f.provider.OwnerBusinessDemoProvider,base);f.setAdmin({userId:"22222222-2222-4222-8222-222222222222",isOwner:false,checking:false});
  f.render(f.provider.OwnerBusinessDemoProvider,base);f.resolveOwnerCheck(true);await f.flush();await rejected;
  assert.ok(f.stores.every(store=>store.writes.length===0));assert.equal(store.canUse(),false);assert.equal(f.timers.size,0);
});
test("revocation, unmount and bounded timeout settle queued GPS without publishing fake success",async()=>{
  for(const stop of ["revoked","unmount","timeout"]){
    const f=fixture();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
    const store=f.value.demo;f.deferOwnerCheck();
    const saved=f.value.saveDeviceCoordinates({latitude:1,longitude:2},ownerId),rejected=assert.rejects(saved);
    f.render(f.provider.OwnerBusinessDemoProvider,base);
    if(stop==="revoked"){
      f.setAdmin({isOwner:false,checking:false});f.resolveOwnerCheck(false);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
    }else if(stop==="unmount")f.unmount(f.provider.OwnerBusinessDemoProvider);
    else f.expireTimers();
    await rejected;assert.equal(store.writes.length,0);assert.equal(f.timers.size,0);
  }
});
test("GPS refuses malformed coordinates and a UUID different from the currently authenticated owner",async()=>{
  const f=fixture();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  await assert.rejects(f.value.saveDeviceCoordinates({latitude:99,longitude:2},ownerId),/no son válidos/);
  await assert.rejects(f.value.saveDeviceCoordinates({latitude:1,longitude:2},"22222222-2222-4222-8222-222222222222"),/identidad/);
  assert.equal(f.ownerChecks.length,0);assert.equal(f.stores[0].writes.length,0);assert.equal(f.timers.size,0);
});

test("a same-owner GPS return survives two revalidations and is removed only after wizard resume plus finish",async()=>{
  const f=fixture();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  const token=f.value.beginLocationReturn(ownerId);f.render(f.provider.OwnerBusinessDemoProvider,base);
  assert.deepEqual(JSON.parse(JSON.stringify(f.value.locationReturn)),{token,userId:ownerId,module:"empresa_config",phase:"steps",step:1,claimed:false,finished:false});
  f.emitState("inactive");f.setAdmin({isOwner:false,checking:true});f.render(f.provider.OwnerBusinessDemoProvider,base);
  assert.equal(f.value.locationReturn,undefined);assert.equal(f.value.consumeLocationReturn(token),false);
  f.emitState("active");f.setAdmin({isOwner:true,checking:false});f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  assert.equal(f.value.locationReturn.step,1);assert.equal(f.value.consumeLocationReturn(token),true);
  // The GPS write performs another real owner check; that second unmount still has a return path.
  f.setAdmin({isOwner:false,checking:true});f.render(f.provider.OwnerBusinessDemoProvider,base);
  f.setAdmin({isOwner:true,checking:false});f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  assert.equal(f.value.locationReturn.module,"empresa_config");assert.equal(f.value.locationReturn.phase,"steps");
  f.value.finishLocationReturn(token);f.render(f.provider.OwnerBusinessDemoProvider,base);
  assert.equal(f.value.locationReturn,undefined);assert.equal(f.value.consumeLocationReturn(token),false);
});

test("GPS completion before wizard remount keeps its target until the authorized wizard consumes it",async()=>{
  const f=fixture();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  const token=f.value.beginLocationReturn(ownerId);f.value.finishLocationReturn(token);f.render(f.provider.OwnerBusinessDemoProvider,base);
  assert.equal(f.value.locationReturn.step,1);assert.equal(f.value.consumeLocationReturn(token),true);
  f.render(f.provider.OwnerBusinessDemoProvider,base);assert.equal(f.value.locationReturn,undefined);
});

test("manual close, owner denial and a changed UUID clear the transient return and never authorize a write",async()=>{
  for(const stop of ["close","denied","uuid"]){
    const f=fixture();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
    const token=f.value.beginLocationReturn(ownerId);f.render(f.provider.OwnerBusinessDemoProvider,base);
    if(stop==="close")f.value.clearLocationReturn();
    else f.setAdmin(stop==="denied"?{isOwner:false,checking:false}:{userId:"22222222-2222-4222-8222-222222222222",isOwner:false,checking:false});
    f.render(f.provider.OwnerBusinessDemoProvider,base);
    assert.equal(f.value.locationReturn,undefined);assert.equal(f.value.consumeLocationReturn(token),false);
    await assert.rejects(f.value.saveDeviceCoordinates({latitude:1,longitude:2},ownerId,"ES",token));
    assert.equal(f.ownerChecks.length,0);assert.ok(f.stores.every(store=>store.writes.length===0));
  }
});

test("closing a return cancels queued GPS but an older completion cannot clear a newer return",async()=>{
  const f=fixture();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  const old=f.value.beginLocationReturn(ownerId);f.deferOwnerCheck();
  const saved=f.value.saveDeviceCoordinates({latitude:1,longitude:2},ownerId,"ES",old),rejected=assert.rejects(saved,/ruta.*cerrado/);
  f.render(f.provider.OwnerBusinessDemoProvider,base);f.value.clearLocationReturn();await rejected;
  const next=f.value.beginLocationReturn(ownerId);f.value.finishLocationReturn(old);f.value.clearLocationReturn(old);
  f.resolveOwnerCheck(true);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  assert.equal(f.value.locationReturn.token,next);assert.equal(f.stores[0].writes.length,0);assert.equal(f.timers.size,0);
});

test("the GPS deadline stops before an authorized native storage write starts",async()=>{
  const f=fixture();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);
  f.deferStoreWrite();let completed=false;
  const saved=f.value.saveDeviceCoordinates({latitude:1,longitude:2},ownerId).then(()=>{completed=true});
  f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();f.render(f.provider.OwnerBusinessDemoProvider,base);await f.flush();
  assert.equal(f.timers.size,0);f.expireTimers();assert.equal(completed,false);
  f.resolveStoreWrite();await f.flush();await saved;assert.equal(completed,true);assert.equal(f.stores[0].writes.length,1);
});

test('actual owner provider never pairs a selected business label with a different business configuration during creation and switch',async()=>{
 const initial={businessName:'',address:'',cartaUrl:'',sectorId:null,subId:null,plantillaItems:[],activeDays:[0,1,2,3,4],openFrom:'09:00',openTo:'20:00',daySchedules:{},services:[],paymentPolicy:0,approvalPolicy:0,cancelPolicy:0,bookingEnabled:false,completedSteps:[],paymentMethod:null,isBusinessActive:false,staffSchedules:{}};
 const memory=new Map(),props={children:'Original screens',initialConfig:initial},f=fixture(true,{realCatalog:true,memory});
 const settle=async fixture=>{for(let i=0;i<12;i++){fixture.render(fixture.provider.OwnerBusinessDemoProvider,props);if(fixture.value.loaded){assert.equal(fixture.value.config,fixture.value.demo.getSnapshot().config);assert.equal(fixture.value.demo,fixture.value.catalog.getSelectedStore());assert.equal(fixture.value.config.businessId,fixture.value.demo.businessId);}await fixture.flush();}};
 await settle(f);const catalog=f.value.catalog,prior=[];
 for(const name of ['GO PELUQUERÍA','GO RESTAURANTE']){const id=await catalog.create(name);await settle(f);assert.equal(f.value.config.businessName,name);assert.equal(f.storeModule.getBusinessDemoSetupState(f.value.config,null).completed,0);
   await f.value.demo.updateConfig({address:'Dirección de '+name,sectorId:'belleza',subId:'peluqueria',completedSteps:[0,1,2,3,4,5,6,7],services:[{name:'Servicio de '+name,duration:30,price:12}],plantillaItems:[{id:'puestos',label:'Profesional',count:1,staffNames:['Profesional de '+name]}]});await settle(f);prior.push([id,JSON.stringify(f.value.demo.getSnapshot())]);}
 const id=await catalog.create('Tercer negocio');await settle(f);assert.equal(f.value.config.address,'');assert.equal(f.value.config.services.length,0);assert.equal(f.value.config.plantillaItems.length,0);assert.equal(f.storeModule.getBusinessDemoSetupState(f.value.config,null).completed,0);
 await f.value.demo.updateConfig({sectorId:'belleza',subId:'peluqueria',services:[{name:'Servicio tercero',duration:45,price:20}],plantillaItems:[{id:'puestos',label:'Profesional',count:1,staffNames:['Profesional tercero']}]});await settle(f);prior.push([id,JSON.stringify(f.value.demo.getSnapshot())]);
 for(const [companyId,expected] of prior){await catalog.select(companyId);await settle(f);assert.equal(JSON.stringify(f.value.demo.getSnapshot()),expected);assert.equal(f.value.catalog.getCompanies().filter(company=>!company.placeholder&&!company.archived).length,3);}
 f.unmount(f.provider.OwnerBusinessDemoProvider);const bytes=Array.from(memory),reopened=fixture(true,{realCatalog:true,memory});await settle(reopened);assert.equal(reopened.value.catalog.getSelectedId(),id);assert.equal(JSON.stringify(reopened.value.demo.getSnapshot()),prior[2][1]);assert.deepEqual(Array.from(memory),bytes);
 assert.equal(f.alerts.length,0);assert.equal(reopened.alerts.length,0);
});
