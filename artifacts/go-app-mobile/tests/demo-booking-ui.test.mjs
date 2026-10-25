import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { modulePublicationPolicy, loadModulePublicationHook } from "./helpers/module-publication-fixture.mjs";
const ts = createRequire(path.join(process.cwd(),"package.json"))("typescript");
const owner="11111111-1111-4111-8111-111111111111";
const turn=async()=>{for(let i=0;i<15;i++)await new Promise(resolve=>setTimeout(resolve,0));};
const compile=name=>ts.transpileModule(readFileSync(name,"utf8"),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
function pure(name,imports={}){const exports={};vm.runInNewContext(compile(name),{exports,require:key=>{if(key in imports)return imports[key];throw Error("Unexpected dependency "+key);},Date,Intl,Map,Set});return exports;}
const storeModule=pure("data/businessDemoStore.ts"),repoModule=pure("data/demoBookingRepository.ts",{"./businessDemoStore":storeModule,"./bookingServices":pure("data/bookingServices.ts")});
function fixture({real=false,sectors,context="USER",ownerAccess=false}={}){
  const keyboardEvents=new Map();
  const memory=new Map(),liveCalls=[],navigation=[],hooks=new Map(),cache=new Map();
  const initial={businessName:"",address:"",cartaUrl:"",sectorId:null,subId:null,plantillaItems:[],activeDays:[],openFrom:"09:00",openTo:"18:00",daySchedules:{},services:[],paymentPolicy:0,approvalPolicy:0,cancelPolicy:0,bookingEnabled:false,completedSteps:[],paymentMethod:null,isBusinessActive:false,staffSchedules:{}};
  const store=storeModule.createBusinessDemoStore({ownerUserId:owner,storage:{getItem:async key=>memory.get(key)??null,setItem:async(key,value)=>memory.set(key,value)},canUse:()=>true,initialConfig:initial});
  const repo=repoModule.createDemoBookingRepository(store,{now:()=>Date.parse("2030-01-07T08:00:00")});
  let current,cursor=0,effects=[];
  const hook=()=>[current,cursor++];
  const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
  const React={Fragment:"Fragment",createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),
    useState(initial){const [slots,i]=hook();slots[i]??={value:typeof initial==="function"?initial():initial};return[slots[i].value,value=>{slots[i].value=typeof value==="function"?value(slots[i].value):value;}];},
    useRef(value){return React.useState(()=>({current:value}))[0];},
    useMemo(fn,deps){const[slots,i]=hook();if(!slots[i]||!equal(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},
    useCallback(fn,deps){return React.useMemo(()=>fn,deps);},
    useEffect(fn,deps){const[slots,i]=hook(),old=slots[i];if(!old||!equal(old.deps,deps)){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}
  };
  class Value{constructor(value){this.value=value;}setValue(value){this.value=value;}interpolate(){return 0;}stopAnimation(){}}
  const animation={start(fn){fn?.({finished:true});},stop(){}};
  const native=new Proxy({Dimensions:{get:()=>({width:390,height:844})},Platform:{OS:"ios",select:x=>x.ios??x.default},
    StyleSheet:{create:x=>x,absoluteFillObject:{}},Alert:{alert(){}},Keyboard:{addListener:(event,fn)=>{keyboardEvents.set(event,fn);return{remove(){keyboardEvents.delete(event);}};},dismiss(){keyboardEvents.get("keyboardWillHide")?.();}},
    Animated:{Value,View:"Animated.View",spring:()=>animation,timing:()=>animation,add:()=>0},
    PanResponder:{create:config=>({panHandlers:config})}
  },{get:(target,key)=>target[key]??key});
  const live=async name=>{liveCalls.push(name);if(!real)throw Error("Forbidden live call "+name);return name==="getAuthenticatedUserId"?owner:[];};
  class BookingApiError extends Error{}
  const booking={BookingApiError,computeRefundInfo:()=>({isFree:true}),getAuthenticatedUserId:()=>live("getAuthenticatedUserId")};
  for(const name of ["cancelBooking","claimSlot","createHold","getAllSlots","getActivebusinesses","getBookableItems","getStaff","searchBusinesses","getMyBookings"])booking[name]=()=>live(name);
  const mocks={
    "@workspace/api-zod":modulePublicationPolicy,
    "@/hooks/useBookingModulePublication":loadModulePublicationHook(React,{context,owner:ownerAccess}),
    "./CatalogComplementSelector":{CatalogComplementSelector:()=>null},
    "@/data/catalogAssociations":pure("data/catalogAssociations.ts",{"./booking":booking}),
    react:{...React,default:React},"react-native":native,
    "@react-native-async-storage/async-storage":{default:{getItem:()=>live("storage read"),setItem:()=>live("storage write")}},
    "expo-linear-gradient":{LinearGradient:"LinearGradient"},"@expo/vector-icons":{Feather:"Feather"},
    "expo-haptics":{selectionAsync:async()=>{},impactAsync:async()=>{},notificationAsync:async()=>{},ImpactFeedbackStyle:{Medium:"medium"},NotificationFeedbackType:{Success:"success"}},
    "react-native-safe-area-context":{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})},
    "@/data/customerBookingProjection":pure("data/customerBookingProjection.ts"),
    "@/data/booking":booking,"@/data/goRecentBusinesses":{getRecentBusinessIds:()=>live("recent read"),recordBusinessVisit:()=>live("recent write")},
    "@/lib/goLogBridge":{syncBookingToGoLog:()=>live("agenda bridge")},
    "@/lib/time":{getToday:()=>new Date("2030-01-07T08:00:00"),formatISODate:d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")},
    "@/contexts/LanguageContext":{useLanguage:()=>({lang:"es",t:key=>key})},
    "@/data/goSectorData":{SECTORS:sectors??[{id:"belleza",label:"Belleza",subs:[{id:"peluqueria",name:"Peluquería"}]}]},
    "@/data/goSectorTranslations":{trSector:x=>x},
    "@/data/bookingServices":pure("data/bookingServices.ts"),
    "@/data/bookingTimeline":pure("data/bookingTimeline.ts")
  };
  function load(name){if(cache.has(name))return cache.get(name);const exports={};cache.set(name,exports);
    vm.runInNewContext(compile(name),{exports,require:key=>key in mocks?mocks[key]:key==="@/components/booking/MyBookingsList"?load("components/booking/MyBookingsList.tsx"):(()=>{throw Error("Unexpected UI dependency "+key);})(),
      console:{log(){},warn(){}},Date,Intl,Map,Set,setTimeout:fn=>setTimeout(fn,0),clearTimeout,setInterval,clearInterval});return exports;}
  let catalogueScope = "";
  function render(fn,props){current=hooks.get(fn)??[];hooks.set(fn,current);cursor=0;effects=[];const tree=fn(props);for(const effect of effects)effect();
    // The selector's async transport is exercised separately. Resolve its real
    // local pricing policy here so the parent flow uses the reviewed quote.
    const selector=nodes(tree).find(node=>node.props.repository && node.props.rootIds);
    const next=selector?selector.props.businessId+'|'+selector.props.rootIds.join(','):'';
    if(selector && next!==catalogueScope){catalogueScope=next;const config=store.getSnapshot().config;
      const ids=selector.props.rootIds,catalog=config.services.map(service=>({id:store.businessId+'_service_'+Array.from(service.name.normalize('NFKC').trim().toLowerCase()).map(c=>c.codePointAt(0).toString(16)).join('_'),businessId:store.businessId,title:service.name,durationMinutes:service.duration,price:service.price,active:true,visible:true,currency:'EUR'}));
      selector.props.onChange(ids.length?pure('data/bookingServices.ts').localCatalogQuote(store.businessId,[...catalog,...(config.catalogProducts??[])],config.catalogAssociations??[],ids):null);
      return render(fn,props);
    }return tree;}
  const Overlay=load("components/booking/BookingSearchOverlay.tsx").BookingSearchOverlay,MyList=load("components/booking/MyBookingsList.tsx").MyBookingsList;
  const props={visible:true,demoRepository:repo,initialBusinessId:store.businessId,onClose(){navigation.push("close");},onBookingConfirmed(){liveCalls.push("real confirmed callback");},onHoldCreated(){liveCalls.push("real hold callback");},onGoToBooking(){liveCalls.push("real calendar");},onProviderSelected(){liveCalls.push("real provider");},onDemoGoToBooking(...args){navigation.push(args);}};
  const configure=async()=>{await store.updateConfig({businessName:"GO Peluquería Prueba",sectorId:"belleza",subId:"peluqueria",address:"Dirección DEMO",activeDays:[0,1,2,3,4],services:[{name:"Corte DEMO",duration:30,price:12}],plantillaItems:[{id:"pro",count:1,label:"Puesto",staffNames:["Raul 1 GO PRUEBA"],staffServices:[["Corte DEMO"]]}],completedSteps:[0,1,2,3,4,5,6,7]});await store.saveFloorPlan({id:store.planId,businessId:store.businessId,updatedAt:1,elements:[{id:"puesto",label:"Raul 1 GO PRUEBA",type:"silla",reservable:true,status:"disponible",x:10,y:20,width:30,height:40,capacity:1}]});};
  return{store,repo,liveCalls,navigation,render,Overlay,MyList,props,configure,keyboardEvents,accent:load("components/booking/BookingSearchOverlay.tsx").bookingCategoryAccent};
}
// These positive scenarios require the selected professional to offer the
// exact services introduced by each fixture, not an implicit all-services grant.
async function setReservableServices(f,services,patch={}){
 const plantillaItems=f.store.getSnapshot().config.plantillaItems.map(item=>({...item,staffServices:(item.staffNames??[]).map(()=>services.map(service=>service.name))}));
 await f.store.updateConfig({...patch,services,plantillaItems});
}
function nodes(tree){if(!tree||typeof tree!=="object")return[];return[tree,...(tree.children??[]).flatMap(nodes)];}
function text(tree){if(typeof tree==="string"||typeof tree==="number")return String(tree);return(tree?.children??[]).map(text).join(" ");}
function button(tree,label){return nodes(tree).find(node=>node.type==="TouchableOpacity"&&text(node).includes(label));}
function input(tree){return nodes(tree).find(node=>node.type==="TextInput");}
async function services(f){f.render(f.Overlay,f.props);await turn();f.render(f.Overlay,f.props);await turn();return f.render(f.Overlay,f.props);}
async function selectSlot(f){let tree=await services(f);await button(tree,"Corte DEMO").props.onPress();tree=f.render(f.Overlay,f.props);await button(tree,"save").props.onPress();tree=f.render(f.Overlay,f.props);await button(tree,"Raul 1 GO PRUEBA").props.onPress();f.render(f.Overlay,f.props);await turn();tree=f.render(f.Overlay,f.props);assert.ok(button(tree,"09:00"),text(tree));await button(tree,"09:00").props.onPress();return f.render(f.Overlay,f.props);}

test("real overlay callbacks confirm DEMO and navigate only the isolated calendar with zero live side effects",async()=>{const f=fixture();await f.configure();let tree=await selectSlot(f);const confirm=nodes(tree).find(node=>node.props.onPress?.name==="handleConfirm");assert.ok(confirm);await confirm.props.onPress();tree=f.render(f.Overlay,f.props);assert.equal(f.store.getSnapshot().reservations.length,1);await button(tree,"biz_ok_view_calendar").props.onPress();await turn();assert.equal(f.store.getSnapshot().bookings[0].status,"CONFIRMED");assert.deepEqual(f.liveCalls,[]);assert.equal(f.navigation[0][0],"2030-01-07");assert.equal(f.navigation[0][1],"09:00");assert.match(f.navigation[0][2],/^demo_customer_/);assert.equal(f.navigation[1],"close");});
test("closing an interactive DEMO HOLD releases only local availability",async()=>{const f=fixture();await f.configure();const tree=await selectSlot(f),modal=nodes(tree).find(node=>node.type==="Modal");await modal.props.onRequestClose();await turn();assert.equal(f.store.getSnapshot().bookings[0].status,"CANCELLED");assert.deepEqual(f.liveCalls,[]);});
test("DEMO search and MyBookingsList use the injected owner document and reflect updates",async()=>{const f=fixture();await f.configure();const props={...f.props,initialBusinessId:undefined};let tree=f.render(f.Overlay,props);await turn();tree=f.render(f.Overlay,props);input(tree).props.onChangeText("peluquería");f.render(f.Overlay,props);await turn();tree=f.render(f.Overlay,props);assert.ok(button(tree,"GO Peluquería Prueba"));f.render(f.MyList,{visible:true,demoRepository:f.repo});await turn();assert.equal(f.render(f.MyList,{visible:true,demoRepository:f.repo}),null);const service=(await f.repo.getBookableItems(f.store.businessId))[0];const hold=await f.repo.createHold({businessId:f.store.businessId,bookableItemId:service.id,customerId:owner,startDatetime:"2030-01-07T10:00:00",endDatetime:"2030-01-07T10:30:00",unitsReserved:1,peopleCount:1});await f.repo.claimSlot({...hold.booking,status:"CONFIRMED"});await turn();assert.ok(text(f.render(f.MyList,{visible:true,demoRepository:f.repo})).includes("Confirmada"));assert.deepEqual(f.liveCalls,[]);});
test("the normal MyBookingsList keeps its existing authenticated backend path",async()=>{const f=fixture({real:true});f.render(f.MyList,{visible:true});await turn();assert.deepEqual(f.liveCalls,["getAuthenticatedUserId","getMyBookings"]);});


test("Landing search keeps the live activation/category filters and ignores late results", async()=>{
  const source=readFileSync("app/index.tsx","utf8"), ast=ts.createSourceFile("index.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let effect; function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==="useEffect"&&n.arguments[0]?.getText(ast).includes("const query = demoBookingRepository ?"))effect=n.arguments[0];ts.forEachChild(n,walk);}walk(ast);assert.ok(effect);
  const rows=[{id:"live",category:"peluqueria",bookingActive:true},{id:"off",category:"peluqueria",bookingActive:false},{id:"other",category:"hotel",bookingActive:true}];
  for(const demo of [false,true]){
    const calls=[],results=[];let resolve;
    const pending=new Promise(done=>{resolve=done;});
    const scope={exports:{},goSearchOpen:true,goSearchSub:{id:"peluqueria"},adminAccess:{checking:false},goSearchQuery:"GO",
      bookingPublication:modulePublicationPolicy.defaultGoModulePublication(),bookingInternalAccess:false,
      bookingActivityEnabled:modulePublicationPolicy.bookingActivityEnabled,canonicalBookingActivity:modulePublicationPolicy.canonicalBookingActivity,
      demoBookingRepository:demo?{searchBusinesses:()=>{calls.push("demo");return pending;}}:undefined,
      getBusinesses:()=>{calls.push("live");return pending;},setGoSearchBusinesses:rows=>results.push(rows)};
    vm.runInNewContext(ts.transpileModule("exports.run="+effect.getText(ast),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022}}).outputText,scope);
    scope.exports.run();resolve(rows);await turn();assert.deepEqual(calls,[demo?"demo":"live"]);assert.deepEqual(Array.from(results[0],r=>r.id),["live"]);
    let resolveLate; scope.getBusinesses=()=>new Promise(done=>{resolveLate=done;});scope.demoBookingRepository=undefined;
    const cancel=scope.exports.run();cancel();resolveLate(rows);await turn();assert.equal(results.length,1);
  }
});


test("rapid repeated confirmation invokes the DEMO commit only once",async()=>{const f=fixture();await f.configure();await selectSlot(f);await turn();const tree=f.render(f.Overlay,f.props);let commits=0;const claim=f.repo.claimSlot;f.repo.claimSlot=input=>{commits++;return claim(input);};const confirm=button(tree,"BIZ_CONFIRM_BOOKING_BTN").props.onPress;await Promise.all([confirm(),confirm()]);const final=f.render(f.Overlay,f.props);assert.equal(commits,1);assert.ok(text(final).includes("BIZ_BOOKING_CONFIRMED"));assert.equal(f.store.getSnapshot().bookings.length,1);assert.equal(f.store.getSnapshot().reservations.length,1);});

for(const context of ["USER","ADMIN"])test("New reservation keeps history separate, recents and search; publication categories for "+context,async()=>{
  const {SECTORS}=pure("data/goSectorData.ts",{react:{},"@react-native-async-storage/async-storage":{default:{}},"@/data/goSectorTranslations":{trSector:value=>value}});
  assert.equal(SECTORS.length,9);
  const f=fixture({sectors:SECTORS,context,ownerAccess:true});await f.configure();
  const service=(await f.repo.getBookableItems(f.store.businessId))[0];
  for(const time of ["10:00","11:00"]){const held=await f.repo.createHold({businessId:f.store.businessId,bookableItemId:service.id,customerId:owner,startDatetime:"2030-01-07T"+time+":00",endDatetime:"2030-01-07T"+time.slice(0,2)+":30:00",unitsReserved:1,peopleCount:1});await f.repo.claimSlot({...held.booking,status:"CONFIRMED"});if(time==="11:00")await f.repo.cancelBooking(held.booking.id);}
  const before=JSON.stringify(f.store.getSnapshot());
  const props={...f.props,initialBusinessId:undefined};
  f.render(f.Overlay,props);await turn();let tree=f.render(f.Overlay,props);
  assert.ok(text(tree).includes("Busca tu empresa"));assert.ok(text(tree).includes("biz_recent_label"));
  const expected=modulePublicationPolicy.visibleBookingSectors(SECTORS,modulePublicationPolicy.defaultGoModulePublication(),context==="ADMIN");
  assert.equal(expected.length,context==="ADMIN"?9:1);
  for(const sector of SECTORS)assert.equal(!!button(tree,sector.label),expected.some(row=>row.id===sector.id),sector.label);
  assert.equal(nodes(tree).some(node=>node.type===f.MyList),false);
  assert.equal(text(tree).includes("Confirmada"),false);assert.equal(text(tree).includes("Cancelada"),false);
  assert.equal(nodes(tree).filter(node=>node.type==="TextInput").length,1);
  input(tree).props.onChangeText("peluquería");f.render(f.Overlay,props);await turn();tree=f.render(f.Overlay,props);
  assert.ok(button(tree,"GO Peluquería Prueba"));assert.equal(nodes(tree).some(node=>node.type===f.MyList),false);
  assert.equal(JSON.stringify(f.store.getSnapshot()),before);assert.equal(f.store.getSnapshot().bookings.length,2);
  assert.equal(f.repo.getCustomerEntries().length,2);assert.deepEqual(f.liveCalls,[]);
});

test("New reservation removes only the history embed and reserves no history-specific layout height",()=>{
 const source=readFileSync("components/booking/BookingSearchOverlay.tsx","utf8");
 assert.equal(source.includes("MyBookingsList"),false);assert.ok(source.includes("visibleSectors.slice(rowIdx * 3, rowIdx * 3 + 3)"));
 assert.ok(source.includes("Busca tu empresa"));assert.ok(source.includes("biz_recent_label"));assert.ok(source.includes("biz_search_business_service_ph"));
 const ast=ts.createSourceFile("overlay.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let dock;
 (function walk(n){if(ts.isPropertyAssignment(n)&&n.name.getText(ast)==="actionDock")dock=n.initializer;ts.forEachChild(n,walk)})(ast);
 assert.ok(dock);assert.equal(dock.properties.some(p=>["height","minHeight","marginTop"].includes(p.name?.getText(ast))),false);
});

const control=(tree,id)=>nodes(tree).find(node=>node.props.testID===id);
test('the shared summary and saved selection use the reviewed voluntary product price with no extra minutes',async()=>{
 const f=fixture();await f.configure();const businessId=f.store.businessId,[service]=await f.repo.getBookableItems(businessId);
 await f.repo.saveCatalogProduct({id:businessId+'_product_extra',businessId,title:'Mascarilla',type:'product',catalogKind:'product',durationMinutes:0,price:7,currency:'EUR',active:true,visible:true,customerCapacity:1,unitQuantity:1,paymentRequired:false});
 await f.repo.manageAssociations('create',{sourceId:service.id,targetId:businessId+'_product_extra',mode:'recommended'});
 let tree=await services(f);control(tree,'booking-service-'+service.id).props.onPress();tree=f.render(f.Overlay,f.props);
 const q=await f.repo.quoteCatalog(businessId,[service.id],[(await f.repo.manageAssociations('list'))[0].id]);
 nodes(tree).find(node=>node.props.repository && node.props.rootIds).props.onChange(q);tree=f.render(f.Overlay,f.props);
 assert.match(text(control(tree,'booking-services-total')),/30\s+min/);assert.match(text(control(tree,'booking-services-total')),/19/);
 control(tree,'booking-save-services').props.onPress();tree=f.render(f.Overlay,f.props);button(tree,'Raul 1 GO PRUEBA').props.onPress();f.render(f.Overlay,f.props);await turn();tree=f.render(f.Overlay,f.props);
 await button(tree,'09:00').props.onPress();tree=f.render(f.Overlay,f.props);await button(tree,'BIZ_CONFIRM_BOOKING_BTN').props.onPress();
 assert.equal(f.store.getSnapshot().bookings[0].catalogSnapshot.totalPrice,19);assert.equal(f.store.getSnapshot().bookings[0].endDatetime,'2030-01-07T09:30:00');
});
test("multi-service UI keeps selection marked, supports deselection and waits for Guardar",async()=>{
  const f=fixture();await f.configure();await setReservableServices(f,[{name:"Corte DEMO",duration:30,price:12},{name:"Tinte DEMO",duration:60,price:20}]);
  let tree=await services(f);assert.equal(control(tree,"booking-save-services").props.disabled,true);
  const items=await f.repo.getBookableItems(f.store.businessId);
  control(tree,"booking-service-"+items[0].id).props.onPress();tree=f.render(f.Overlay,f.props);
  assert.equal(control(tree,"booking-service-"+items[0].id).props.accessibilityState.checked,true);assert.ok(control(tree,"booking-save-services"));assert.equal(button(tree,"Raul 1 GO PRUEBA"),undefined);
  control(tree,"booking-service-"+items[1].id).props.onPress();tree=f.render(f.Overlay,f.props);
  assert.match(text(control(tree,"booking-services-total")),/90\s+min/);assert.match(text(control(tree,"booking-services-total")),/32/);
  control(tree,"booking-service-"+items[0].id).props.onPress();tree=f.render(f.Overlay,f.props);
  assert.equal(control(tree,"booking-service-"+items[0].id).props.accessibilityState.checked,false);assert.equal(control(tree,"booking-service-"+items[1].id).props.accessibilityState.checked,true);
  assert.match(text(control(tree,"booking-services-total")),/60\s+min/);control(tree,"booking-save-services").props.onPress();tree=f.render(f.Overlay,f.props);assert.ok(button(tree,"Raul 1 GO PRUEBA"));assert.equal(f.store.getSnapshot().bookings.length,0);assert.deepEqual(f.liveCalls,[]);
});
test("multi-service UI confirms one reservation with all services, total duration and isolated calendar projections",async()=>{
  const f=fixture();await f.configure();await setReservableServices(f,[{name:"Corte DEMO",duration:30,price:12},{name:"Tinte DEMO",duration:60,price:20}]);
  let tree=await services(f);for(const item of await f.repo.getBookableItems(f.store.businessId)){control(tree,"booking-service-"+item.id).props.onPress();tree=f.render(f.Overlay,f.props);}
  control(tree,"booking-save-services").props.onPress();tree=f.render(f.Overlay,f.props);button(tree,"Raul 1 GO PRUEBA").props.onPress();f.render(f.Overlay,f.props);await turn();tree=f.render(f.Overlay,f.props);
  await button(tree,"09:00").props.onPress();tree=f.render(f.Overlay,f.props);assert.match(text(tree),/Corte DEMO \+ Tinte DEMO/);assert.match(text(tree),/90\s+min/);
  const confirm=button(tree,"BIZ_CONFIRM_BOOKING_BTN").props.onPress;await Promise.all([confirm(),confirm()]);tree=f.render(f.Overlay,f.props);
  const data=f.store.getSnapshot();assert.equal(data.bookings.length,1);assert.equal(data.bookings[0].services.length,2);assert.equal(data.bookings[0].startDatetime,"2030-01-07T09:00:00");assert.equal(data.bookings[0].endDatetime,"2030-01-07T10:30:00");assert.equal(data.reservations.length,1);assert.equal(data.entries.length,1);assert.equal(data.entries[0].duration,"90");assert.equal(data.entries[0].intentLabel,"Corte DEMO + Tinte DEMO");assert.equal(f.repo.getCustomerEntries().length,1);assert.deepEqual(f.liveCalls,[]);
});

test("multi-service UI confirms cut, colour and treatment as one reservation",async()=>{
 const f=fixture();await f.configure();await setReservableServices(f,[{name:"Corte DEMO",duration:30,price:12},{name:"Tinte DEMO",duration:60,price:20},{name:"Tratamiento DEMO",duration:15,price:8}]);
 let tree=await services(f);for(const item of await f.repo.getBookableItems(f.store.businessId)){control(tree,"booking-service-"+item.id).props.onPress();tree=f.render(f.Overlay,f.props);}
 assert.match(text(control(tree,"booking-services-total")),/105\s+min/);assert.match(text(control(tree,"booking-services-total")),/40/);control(tree,"booking-save-services").props.onPress();tree=f.render(f.Overlay,f.props);button(tree,"Raul 1 GO PRUEBA").props.onPress();f.render(f.Overlay,f.props);await turn();tree=f.render(f.Overlay,f.props);await button(tree,"09:00").props.onPress();tree=f.render(f.Overlay,f.props);await button(tree,"BIZ_CONFIRM_BOOKING_BTN").props.onPress();
 const data=f.store.getSnapshot();assert.equal(data.bookings.length,1);assert.equal(data.bookings[0].services.length,3);assert.equal(data.bookings[0].endDatetime,"2030-01-07T10:45:00");assert.equal(data.reservations.length,1);assert.equal(data.entries[0].intentLabel,"Corte DEMO + Tinte DEMO + Tratamiento DEMO");assert.equal(data.entries[0].duration,"105");assert.deepEqual(f.liveCalls,[]);
});

test('authorized internal preview retains the shared multi-service flow for an unpublished sector',async()=>{
 const f=fixture({context:"BUSINESS",ownerAccess:true});await f.configure();await setReservableServices(f,[{name:'Consulta',duration:30,price:35},{name:'Tratamiento',duration:30,price:25}],{sectorId:'salud',subId:'fisioterapia'});
 const before=JSON.stringify(f.store.getSnapshot().config.services);
 let tree=await services(f);for(const item of await f.repo.getBookableItems(f.store.businessId)){control(tree,'booking-service-'+item.id).props.onPress();tree=f.render(f.Overlay,f.props);}
 await control(tree,'booking-save-services').props.onPress();tree=f.render(f.Overlay,f.props);button(tree,'Raul 1 GO PRUEBA').props.onPress();f.render(f.Overlay,f.props);await turn();tree=f.render(f.Overlay,f.props);
 await button(tree,'09:00').props.onPress();tree=f.render(f.Overlay,f.props);await button(tree,'BIZ_CONFIRM_BOOKING_BTN').props.onPress();
 assert.equal(f.store.getSnapshot().bookings.length,1);assert.equal(f.store.getSnapshot().bookings[0].services.length,2);
 assert.equal(f.store.getSnapshot().bookings[0].endDatetime,'2030-01-07T10:00:00');assert.equal(JSON.stringify(f.store.getSnapshot().config.services),before);assert.deepEqual(f.liveCalls,[]);
});

const flattened=value=>Array.isArray(value)?Object.assign({},...value.map(flattened)):value??{};
test('beauty services use visible yellow borders/prices and retain multi-selection until Save',async()=>{
 const f=fixture();await f.configure();await setReservableServices(f,[{name:'Corte',duration:30,price:12},{name:'Tinte',duration:60,price:25}]);
 let tree=await services(f);const saved=JSON.stringify(f.store.getSnapshot().config.services),items=await f.repo.getBookableItems(f.store.businessId);
 for(const item of items){const option=control(tree,'booking-service-'+item.id);assert.equal(flattened(option.props.style).borderColor,'#eab30890');
  const price=nodes(option).find(n=>n.type==='Text'&&new RegExp('^'+item.price+'\\s*€$').test(text(n)));assert.ok(price,'the configured price is visible');assert.equal(flattened(price.props.style).color,'#eab308');
  option.props.onPress();tree=f.render(f.Overlay,f.props);assert.equal(control(tree,'booking-service-'+item.id).props.accessibilityState.checked,true);assert.ok(control(tree,'booking-save-services'));
 }
 assert.equal(JSON.stringify(f.store.getSnapshot().config.services),saved);assert.equal(f.store.getSnapshot().bookings.length,0);
});
test('professional heading, no preference and configured names use a clear selectable yellow presentation',async()=>{
 const f=fixture();await f.configure();let tree=await services(f);button(tree,'Corte DEMO').props.onPress();tree=f.render(f.Overlay,f.props);control(tree,'booking-save-services').props.onPress();tree=f.render(f.Overlay,f.props);
 const heading=control(tree,'booking-professional-heading');assert.equal(text(heading),'Elige tu profesional');assert.equal(flattened(heading.props.style).color,'#ffffff');assert.equal(flattened(heading.props.style).fontSize,22);
 const any=control(tree,'booking-professional-any');assert.equal(flattened(any.props.style).borderColor,'#eab30890');assert.equal(any.props.accessibilityState.disabled,false);
 const pro=nodes(tree).find(n=>n.props.testID?.startsWith('booking-professional-')&&n.props.testID!=='booking-professional-any'&&n.type==='TouchableOpacity');assert.ok(pro);assert.equal(pro.props.disabled,false);assert.ok(text(pro).includes('Raul 1 GO PRUEBA'));
 assert.equal(flattened(pro.props.style).borderColor,'#eab30890');assert.ok(nodes(pro).some(n=>n.type==='Feather'&&n.props.color==='#eab308'));
 const servicesText=nodes(pro).find(n=>n.type==='Text'&&flattened(n.props.style).fontSize===12);if(servicesText)assert.equal(flattened(servicesText.props.style).color,'rgba(255,255,255,0.9)');
});
test('pilot category is a compact button and keyboard preserves the search, title, results and existing close controls',async()=>{
 const sector={id:'belleza',label:'Belleza',emoji:'💇',color:'#eab308',subs:[{id:'peluqueria',name:'Peluquería',emoji:'✂️'}]},f=fixture({sectors:[sector]});await f.configure();const props={...f.props,initialBusinessId:undefined};
 let tree=f.render(f.Overlay,props);await turn();tree=f.render(f.Overlay,props);
 const category=control(tree,'booking-category-belleza');assert.equal(flattened(category.props.style).width,140);assert.equal(flattened(category.props.style).flex,0);assert.equal(flattened(category.props.style).borderColor,'#eab308');
 input(tree).props.onChangeText('Peluquería');f.keyboardEvents.get('keyboardWillShow')({endCoordinates:{height:300,screenY:544}});tree=f.render(f.Overlay,props);await turn();tree=f.render(f.Overlay,props);
 assert.equal(text(control(tree,'booking-search-heading')),'Busca tu empresa');assert.equal(flattened(control(tree,'booking-business-search').props.style).borderColor,'#ffffff');assert.equal(input(tree).props.value,'Peluquería');
 const back=control(tree,'booking-back'),exit=control(tree,'booking-exit');assert.ok(back&&exit);assert.ok(nodes(tree).find(n=>n.children?.includes(back))||back);
 assert.ok(button(tree,'GO Peluquería Prueba'));const results=control(tree,'booking-search-results');assert.equal(flattened(results.props.style).flex,1);
 input(tree).props.onSubmitEditing();tree=f.render(f.Overlay,props);assert.equal(input(tree).props.value,'Peluquería');assert.ok(control(tree,'booking-back'));
 input(tree).props.onChangeText('No such registered company');f.render(f.Overlay,props);await turn();tree=f.render(f.Overlay,props);assert.ok(text(tree).includes('No encontramos esa empresa.'));assert.deepEqual(f.liveCalls,[]);
});

test('beauty identity overrides only the category selection color and other sectors keep their configured color',()=>{
 const f=fixture();for(const category of ['peluqueria','Belleza Peluquería','belleza'])assert.equal(f.accent({category,bookingColor:'#123456'}),'#eab308');
 assert.equal(f.accent({category:'hotel',bookingColor:'#123456'}),'#123456');
});

test('a saved pending reservation keeps its real status, yellow presentation and unique ID when opening the calendar',async()=>{
 const f=fixture();await f.configure();let tree=await selectSlot(f);
 // Simulate the existing server returning a pending outcome instead of approval.
 const repo=f.props.demoRepository,claim=repo.claimSlot;repo.claimSlot=async input=>{const result=await claim(input);return result.ok?{...result,booking:{...result.booking,status:'HOLD'}}:result;};
 await button(tree,'BIZ_CONFIRM_BOOKING_BTN').props.onPress();tree=f.render(f.Overlay,f.props);
 const state=control(tree,'booking-confirmed-state');assert.equal(text(state),'BOOKING_STATE_PENDING');assert.equal(state.props.style.color,'#FFD700');
 await button(tree,'biz_ok_view_calendar').props.onPress();assert.ok(f.navigation[0][2]);assert.equal(f.store.getSnapshot().bookings.length,1);
});
