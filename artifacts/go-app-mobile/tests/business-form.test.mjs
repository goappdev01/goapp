import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
const ts = createRequire(path.join(process.cwd(),"package.json"))("typescript");
const src = name => readFileSync(name,"utf8");
const transpile = name => ts.transpileModule(src(name),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
function moduleFrom(name, imports = {}) {
  const exports = {};
  vm.runInNewContext(transpile(name),{exports,require:key => imports[key] ?? {},console,Set,Map});
  return exports;
}
const country = moduleFrom("utils/countryConfig.ts");
const api = moduleFrom("components/empresa/EmpresaConfigScreen.tsx",{
  "@/utils/countryConfig":country,
  "react-native": { StyleSheet:{create:styles=>styles},Dimensions:{get:()=>({width:390,height:844})}},
});
const plain = value => JSON.parse(JSON.stringify(value));
test("phone country comes from explicit business country or device region, never interface language",()=>{
  assert.equal(api.resolveBusinessPhoneCountry("GB","es-ES"),"GB");
  assert.equal(api.resolveBusinessPhoneCountry(undefined,"en-ES"),"ES");
  assert.equal(api.resolveBusinessPhoneCountry(undefined,"es-US"),"US");
  assert.equal(api.resolveBusinessPhoneCountry(undefined,"pt_BR"),"BR");
  assert.equal(api.resolveBusinessPhoneCountry(undefined,"fr-FR"),"FR");
  assert.equal(api.resolveBusinessPhoneCountry(undefined,"unknown"),"ES");
  assert.equal(api.resolveBusinessPhoneCountry("constructor","en-ES"),"ES");
});
test("Spanish landline/mobile/WhatsApp formatting remains distinct",()=>{
  assert.equal(api.validateBusinessPhone("912345678","ES","landline").international,"+34912345678");
  assert.equal(api.validateBusinessPhone("612345678","ES","mobile").international,"+34612345678");
  assert.equal(api.validateBusinessPhone("612345678","ES","landline").valid,false);
  assert.equal(api.validateBusinessPhone("912345678","ES","mobile").valid,false);
  // A valid landline format is not proof that this number is registered with WhatsApp.
  assert.equal(api.validateBusinessPhone("912345678","ES","whatsapp").valid,true);
});
test("existing five markets use their own lengths, prefixes and trunk digits",()=>{
  for(const [value,country,kind,e164] of [
    ["+34 612 345 678","ES","mobile","+34612345678"],
    ["2025550100","US","mobile","+12025550100"],
    ["07400123456","GB","mobile","+447400123456"],
    ["0612345678","FR","mobile","+33612345678"],
    ["11912345678","BR","mobile","+5511912345678"],
    ["1134567890","BR","landline","+551134567890"],
  ])assert.equal(api.validateBusinessPhone(value,country,kind).international,e164);
});
test("invalid, foreign-prefix and oversized numbers never produce an international contact",()=>{
  for(const value of ["12","+1 2025550100","9999999999999999","612abc456","!612345678"]){
    const result=api.validateBusinessPhone(value,"ES","mobile");
    assert.equal(result.valid,false);assert.equal(result.international,"");
  }
  assert.deepEqual(plain(api.validateBusinessPhone("","ES","mobile")),{valid:true,empty:true,national:"",international:""});
});
function gpsFixture({permission="granted",geoFails=false,positionFails=false}={}){
  const calls=[];
  return {calls,adapter:{Accuracy:{Balanced:3},
    async requestForegroundPermissionsAsync(){calls.push("permission");return {status:permission}},
    async getCurrentPositionAsync(options){calls.push("position");assert.equal(options.accuracy,3);if(positionFails)throw Error("GPS unavailable");return {coords:{latitude:40.4168,longitude:-3.7038}}},
    async reverseGeocodeAsync(){calls.push("address");if(geoFails)throw Error("Address unavailable");return [{street:"Fictitious street",streetNumber:"1",city:"Test city"}]},
  }};
}
test("DEMO GPS asks permission only when invoked and persists coordinates without address API",async()=>{
  const f=gpsFixture();assert.deepEqual(f.calls,[]);
  let saved;
  const result=await api.readBusinessDeviceLocation(f.adapter,{allowAddressLookup:false,onCoordinates:async coords=>{f.calls.push("save");saved=plain(coords)}});
  assert.deepEqual(f.calls,["permission","position","save"]);assert.deepEqual(saved,{latitude:40.4168,longitude:-3.7038});
  assert.equal(result.status,"coordinates");assert.equal(result.address,undefined);
});
test("denied location permission neither reads device position nor writes data",async()=>{
  const f=gpsFixture({permission:"denied"});let writes=0;
  const result=await api.readBusinessDeviceLocation(f.adapter,{allowAddressLookup:false,onCoordinates:()=>{writes++}});
  assert.equal(result.status,"denied");assert.deepEqual(f.calls,["permission"]);assert.equal(writes,0);
});
test("address lookup failure keeps coordinates and never invents an address",async()=>{
  const f=gpsFixture({geoFails:true});let saved;
  const result=await api.readBusinessDeviceLocation(f.adapter,{allowAddressLookup:true,onCoordinates:async coords=>{f.calls.push("save");saved=plain(coords)}});
  assert.deepEqual(f.calls,["permission","position","save","address"]);assert.equal(result.status,"coordinates");assert.equal(result.address,undefined);assert.ok(saved);
});
test("existing real lookup runs after coordinates persist; failed save does not claim success",async()=>{
  const f=gpsFixture();
  const result=await api.readBusinessDeviceLocation(f.adapter,{allowAddressLookup:true,onCoordinates:()=>{f.calls.push("save")}});
  assert.deepEqual(f.calls,["permission","position","save","address"]);assert.equal(result.status,"address");
  const fail=gpsFixture();await assert.rejects(api.readBusinessDeviceLocation(fail.adapter,{allowAddressLookup:false,onCoordinates:()=>{throw Error("disk failure")}}),/disk failure/);
  assert.deepEqual(fail.calls,["permission","position"]);
});
test("position failure is reported before any write or address lookup",async()=>{
  const f=gpsFixture({positionFails:true});let writes=0;
  await assert.rejects(api.readBusinessDeviceLocation(f.adapter,{allowAddressLookup:true,onCoordinates:()=>writes++}),/GPS unavailable/);
  assert.deepEqual(f.calls,["permission","position"]);assert.equal(writes,0);
});
test("wizard uses saved data for completion, awaits writes and does not flag skipped pages",()=>{
  const source=src("components/empresa/EmpresaConfigScreen.tsx");
  assert.match(source,/await demo\.transformConfig\(current =>/);
  assert.match(source,/getBusinessDemoSetupState\(next, demo\.getSnapshot\(\)\.plan\)/);
  assert.match(source,/if \(!progress\.steps\[currentStep\] \|\| \(isLast && !progress\.ready\)\)/);
  assert.doesNotMatch(source,/const isDone\s*=\s*i < currentStep/);
  assert.match(source,/ScrollView horizontal[\s\S]*contentContainerStyle=\{c\.stepsBar\}/);
  assert.match(source,/stepPill:\s*\{ width: 92/);
  assert.match(source,/showBackButton=\{true\}/);
  assert.match(source,/textContentType="telephoneNumber" autoComplete="tel"/);
  assert.match(source,/maxLength=\{64\}/);
});
test("company DEMO does not present subscription, renewal or numeric mocks as actual data",()=>{
  const source=src("components/empresa/EmpresaPanel.tsx");
  const hero=source.slice(source.indexOf("{!demo ? ("),source.indexOf("{currentSuite === null",source.indexOf("{!demo ? (")));
  assert.match(hero,/MOCK_EMPRESA\.proximaRenovacion/);
  const demoBranch=hero.slice(hero.indexOf(") : ("));
  assert.match(demoBranch,/DEMO LOCAL · sin suscripción ni facturación real/);
  assert.doesNotMatch(demoBranch,/MOCK_EMPRESA|MetricCard|value="4"/);
  assert.match(source,/OwnerContextModal as Modal/);
});

test("DEMO GPS hands coordinates to the persistent owner provider bound to the same UUID",()=>{
  const source=src("components/empresa/EmpresaConfigScreen.tsx");
  assert.match(source,/useOwnerBusinessDemo/);
  assert.match(source,/saveDeviceCoordinates\(coordinates, demo\.getSnapshot\(\)\.ownerUserId, country, returnToken\)/);
  assert.match(source,/allowAddressLookup: !demo/);
});

function wizardReturnFixture(returnRoute) {
  let cursor=0;const slots=[],effects=[],consumed=[];
  const React={
    createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),
    useState:initial=>{const i=cursor++;slots[i]??={value:typeof initial==="function"?initial():initial};return [slots[i].value,next=>{slots[i].value=typeof next==="function"?next(slots[i].value):next}]},
    useRef:value=>React.useState(()=>({current:value}))[0],useEffect:fn=>effects.push(fn),
    useCallback:fn=>fn,useMemo:fn=>fn(),
  };
  class Value {setValue(){} interpolate(){return 1}}
  const native=new Proxy({StyleSheet:{create:styles=>styles},Dimensions:{get:()=>({width:390,height:844})},
    Animated:{Value,View:"Animated.View"},Platform:{OS:"ios"},Keyboard:{addListener:()=>({remove(){}})},
  },{get:(target,key)=>target[key]??key});
  const owner="11111111-1111-4111-8111-111111111111";
  const config={sectorId:"beauty",subId:"hair",businessName:"Local demo",plantillaItems:[],services:[],completedSteps:[]};
  const module=moduleFrom("components/empresa/EmpresaConfigScreen.tsx",{
    react:{default:React,...React},"react-native":native,"@/utils/countryConfig":country,
    "@/contexts/LanguageContext":{useLanguage:()=>({lang:"es",t:key=>key})},
    "react-native-safe-area-context":{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})},
    "@/contexts/GoBusinessConfigContext":{useBusinessConfig:()=>({config,demo:{getSnapshot:()=>({ownerUserId:owner,config})},updateConfig(){},resetToSubActivity(){}})},
    "@/contexts/OwnerBusinessDemoContext":{useOwnerBusinessDemo:()=>({locationReturn:returnRoute,consumeLocationReturn:token=>consumed.push(token)})},
    "@/data/businessDemoStore":{getBusinessDemoSetupState:()=>({steps:Array(8).fill(false),completed:0,ready:false,nextStep:0})},
    "@/data/goSectorData":{SECTORS:[],SUB_TO_SECTOR:{},PEOPLE_SECTORS:new Set()},
    "@/components/empresa/EmpresaSetupGuide":{Step0Actividad:"ActivitySelect"},
  });
  const tree=module.EmpresaConfigScreen({onBack(){},initialStep:6});
  for(const effect of effects)effect();
  const nodes=root=>!root||typeof root!=="object"?[]:[root,...root.children.flatMap(nodes)];
  return {tree,nodes:nodes(tree),consumed};
}

test("the existing wizard resumes only the same owner's GPS step, while ordinary navigation still selects activity",()=>{
  const owner="11111111-1111-4111-8111-111111111111";
  const resumed=wizardReturnFixture({token:3,userId:owner,module:"empresa_config",phase:"steps",step:1});
  assert.ok(resumed.nodes.some(node=>node.type?.name==="StepUbicacion"));assert.deepEqual(resumed.consumed,[3]);
  for(const route of [undefined,{token:4,userId:"22222222-2222-4222-8222-222222222222",module:"empresa_config",phase:"steps",step:1}]){
    const normal=wizardReturnFixture(route);assert.ok(normal.nodes.some(node=>node.type==="ActivitySelect"));assert.deepEqual(normal.consumed,[]);
  }
});

test("the company panel keeps a consumed GPS module and clears return breadcrumbs on explicit navigation or closure",()=>{
  const panel=src("components/empresa/EmpresaPanel.tsx"),form=src("components/empresa/EmpresaConfigScreen.tsx");
  assert.match(panel,/const requested = demo && locationReturn && locationReturn\.userId === businessDemo\?\.getSnapshot\(\)\.ownerUserId/);
  assert.match(panel,/const closePanel = \(\) => \{ if \(demo\) clearLocationReturn\(\); onClose\(\); \}/);
  assert.match(panel,/onPress=\{closePanel\}/);assert.match(panel,/onRequestClose=\{closePanel\}/);
  assert.match(panel,/const goHome = \(\) => \{\s*if \(demo\) clearLocationReturn\(\)/);
  assert.match(form,/if \(demo\) returnToken = beginLocationReturn\(demo\.getSnapshot\(\)\.ownerUserId\)/);
  assert.match(form,/if \(stepMounted\.current\) consumeLocationReturn\(returnToken\);\s*finishLocationReturn\(returnToken\)/);
});
 test("Spanish pasted contacts keep all digits, accept national/+34/0034 and distinguish fixed/mobile",()=>{
  for (const [value,kind,international] of [["912345678","landline","+34912345678"],["+34 912 345 678","landline","+34912345678"],["0034 812 345 678","landline","+34812345678"],["+34 (612) 345-678","mobile","+34612345678"],["0034 712 345 678","mobile","+34712345678"]]) {
   const input=api.businessPhoneInput(value,"ES"),result=api.validateBusinessPhone(input,"ES",kind);assert.equal(result.international,international);assert.equal(api.businessPhoneError(input,"ES",kind,"es"),"");
  }
 });
 test("wrong contact type, foreign prefix, wrong length and invalid characters have precise persistent errors",()=>{
  for (const [value,kind,reason] of [["612345678","landline",/fijo/],["912345678","mobile",/móvil/],["+1 2025550100","mobile",/prefijo/],["61234","mobile",/9 cifras/],["612abc678","mobile",/cifras/]]) {
   const input=api.businessPhoneInput(value,"ES");assert.equal(api.validateBusinessPhone(input,"ES",kind).valid,false);assert.match(api.businessPhoneError(input,"ES",kind,"es"),reason);assert.ok(api.businessPhoneError(input,"ES",kind,"en"));
  }
 });
