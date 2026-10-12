import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const require=createRequire(path.join(process.cwd(),"package.json")), ts=require("typescript");
function load(file,deps={}){
 const exports={};
 const code=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,require:key=>{if(!(key in deps))throw Error("Unexpected import "+key);return deps[key];}});
 return exports;
}
const catalog=load("components/landing/landingVariant.ts");
const model=load("components/landing/landingVisualPreference.ts",{"./landingVariant":catalog});
const alice="f50bb5f1-d5c9-47c0-a60b-66e7a23933b4",bob="11111111-1111-4111-8111-111111111111";
function storage(initial){
 const data=new Map(initial||[]),writes=[];
 return {data,writes,getItem:async key=>data.get(key)||null,setItem:async(key,value)=>{writes.push({key,value});data.set(key,value);}};
}
async function store(s=storage(),id=alice){
 const changes=[],key=model.landingVisualStorageKey(id);
 const api=model.createLandingVisualPreference(s,key,state=>changes.push(state));await api.load();
 return {api,s,key,changes};
}
test("four appearances retain A and require an exact USER context",()=>{
 assert.deepEqual(Array.from(catalog.LANDING_VISUAL_VARIANTS,v=>v.key),["actual","marca","identidad","planeta"]);
 for(const variant of ["actual","marca","identidad","planeta"]){
  for(const view of ["ADMIN","BUSINESS",null,undefined])assert.equal(catalog.resolveUserLandingVariant(view,true,true,variant,variant),"actual");
  assert.equal(catalog.resolveUserLandingVariant("USER",false,true,variant,null),"actual");
  assert.equal(catalog.resolveUserLandingVariant("USER",true,false,variant,null),"actual");
  assert.equal(catalog.resolveUserLandingVariant("USER",true,true,variant,null),variant);
 }
});
test("only an identity-scoped appearance key is used; no historical global theme is imported",()=>{
 assert.equal(model.landingVisualStorageKey(alice.toUpperCase()),model.landingVisualStorageKey(alice));
 assert.notEqual(model.landingVisualStorageKey(alice),model.landingVisualStorageKey(bob));
 for(const id of ["","../auth","admin","owner@example.com"])assert.equal(model.landingVisualStorageKey(id),null);
});
test("first open retains A without writing any preference",async()=>{
 const {api,s}=await store();assert.equal(api.snapshot().active,"actual");assert.equal(s.writes.length,0);
});
test("B, C and D previews never activate or persist until explicit confirmation",async()=>{
 const {api,s}=await store();
 for(const v of ["marca","identidad","planeta"]){assert.equal(api.preview(v),true);assert.equal(api.snapshot().preview,v);assert.equal(api.snapshot().active,"actual");}
 api.cancel();assert.equal(api.snapshot().preview,null);assert.equal(s.writes.length,0);
 const reopened=await store(s);assert.equal(reopened.api.snapshot().active,"actual");
});
test("confirmation waits for persistence and blocks rapid duplicate requests",async()=>{
 let release;const gate=new Promise(r=>release=r),s=storage(),set=s.setItem;s.setItem=async(k,v)=>{await gate;await set(k,v);};
 const {api}=await store(s);api.preview("marca");const first=api.confirm();
 assert.equal(api.snapshot().active,"actual");assert.equal(api.snapshot().busy,true);
 assert.equal(await api.confirm(),false);assert.equal(api.preview("identidad"),false);
 release();assert.equal(await first,true);assert.equal(api.snapshot().active,"marca");assert.equal(s.writes.length,1);
});
test("selection survives reload and reopening independently from draft",async()=>{
 const {api,s}=await store();api.preview("marca");await api.confirm();api.preview("identidad");await api.confirm();api.preview("planeta");
 api.dispose();const reopened=await store(s);assert.equal(reopened.api.snapshot().active,"identidad");assert.equal(reopened.api.snapshot().preview,null);
 assert.equal(reopened.api.snapshot().previous,"marca");
});
test("previous presentation and preserved A require explicit confirmation to restore",async()=>{
 const {api}=await store();api.preview("marca");await api.confirm();api.preview("identidad");await api.confirm();
 api.preview(api.snapshot().previous);assert.equal(api.snapshot().active,"identidad");await api.confirm();assert.equal(api.snapshot().active,"marca");
 api.preview("actual");assert.equal(api.snapshot().active,"marca");await api.confirm();assert.equal(api.snapshot().active,"actual");
});
test("failed writes retain active presentation and recoverable draft",async()=>{
 const {api,s}=await store();s.setItem=async()=>{throw Error("disk");};api.preview("marca");
 assert.equal(await api.confirm(),false);assert.equal(api.snapshot().active,"actual");assert.equal(api.snapshot().preview,"marca");
 assert.equal(api.snapshot().busy,false);assert.ok(api.snapshot().error);api.cancel();
});
test("read failures preserve A without erasing any storage",async()=>{
 const s=storage();s.getItem=async()=>{throw Error("read");};const {api}=await store(s);
 assert.equal(api.snapshot().active,"actual");assert.equal(api.snapshot().ready,true);assert.equal(s.writes.length,0);
});
test("malformed or unconfirmed preferences cannot activate a new variant",async()=>{
 for(const raw of ["bad","{}",'{"version":1,"active":"marca"}','{"version":2,"confirmed":true,"active":"planeta"}']){
  const s=storage([[model.landingVisualStorageKey(alice),raw]]),{api}=await store(s);
  assert.equal(api.snapshot().active,"actual");assert.equal(s.writes.length,0);
 }
 const raw=JSON.stringify({version:1,confirmed:true,active:"unknown",lastGood:"marca",previous:"actual"});
 const {api}=await store(storage([[model.landingVisualStorageKey(alice),raw]]));assert.equal(api.snapshot().active,"marca");
});
test("two accounts keep independent variants without touching any other storage",async()=>{
 const s=storage([["demo-business","keep"],["session","keep"]]),a=await store(s),b=await store(s,bob);
 a.api.preview("marca");await a.api.confirm();b.api.preview("planeta");await b.api.confirm();
 assert.equal((await store(s)).api.snapshot().active,"marca");assert.equal((await store(s,bob)).api.snapshot().active,"planeta");
 assert.equal(s.data.get("demo-business"),"keep");assert.equal(s.data.get("session"),"keep");
 assert.ok(s.writes.every(w=>w.key.startsWith("go_user_landing_visual_v2:")));
});
test("preview rendering failure returns to active without changing the saved choice",async()=>{
 const {api,s}=await store();api.preview("marca");await api.confirm();const count=s.writes.length;
 api.preview("identidad");await api.recover();assert.equal(api.snapshot().active,"marca");assert.equal(api.snapshot().preview,null);assert.equal(s.writes.length,count);
});
test("active rendering failure restores the previous functional appearance and persists recovery",async()=>{
 const {api,s}=await store();api.preview("marca");await api.confirm();api.preview("identidad");await api.confirm();await api.recover();
 assert.equal(api.snapshot().active,"marca");assert.equal((await store(s)).api.snapshot().active,"marca");
 await api.recover();assert.equal(api.snapshot().active,"actual");
});
test("recovery cannot be overwritten by a late confirmation",async()=>{
 let release;const gate=new Promise(r=>release=r),s=storage(),set=s.setItem;let calls=0;
 s.setItem=async(k,v)=>{if(++calls===1)await gate;await set(k,v);};
 const {api}=await store(s);api.preview("marca");const confirmation=api.confirm();
 const recovery=api.recover();release();await recovery;
 assert.equal(await confirmation,false);assert.equal(api.snapshot().active,"actual");assert.equal((await store(s)).api.snapshot().active,"actual");
});
test("a disposed controller never updates a new identity after a delayed read",async()=>{
 let release;const gate=new Promise(r=>release=r),s=storage(),changes=[];
 s.getItem=()=>gate;const api=model.createLandingVisualPreference(s,model.landingVisualStorageKey(alice),v=>changes.push(v));
 const read=api.load();api.dispose();release(JSON.stringify({version:1,confirmed:true,active:"marca"}));await read;assert.equal(changes.length,0);
});
const react={createElement:(type,props,...children)=>({type,props:props||{},children}),Fragment:"Fragment",
 useWindowDimensions:()=>({width:390,height:844}),Component:class{},Children:{map:(children,fn)=>(Array.isArray(children)?children:[children]).map(fn)},
 isValidElement:v=>!!v?.props,cloneElement:(child,props)=>({...child,props:{...child.props,...props}})};
const native={Text:"Text",View:"View",StyleSheet:{absoluteFill:{position:"absolute",top:0,bottom:0,left:0,right:0}},
 useWindowDimensions:()=>({width:390,height:844})};
const art=load("components/landing/LandingVisualArtwork.tsx",{react,"react-native":native,"react-native-svg":{default:"Svg",Circle:"Circle",Path:"Path",__esModule:true}});
test("A has no decorative layer and D retains the existing planet",()=>{
 assert.equal(art.LandingVisualArtwork({variant:"actual"}),null);assert.equal(art.LandingVisualArtwork({variant:"planeta"}),null);
});
test("new watermarks never participate in touches or accessibility",()=>{
 for(const v of ["marca","identidad"]){
  const result=art.LandingVisualArtwork({variant:v});
  assert.equal(result.props.pointerEvents,"none");assert.equal(result.props.accessibilityElementsHidden,true);
  assert.equal(result.props.importantForAccessibility,"no-hide-descendants");assert.equal(result.props.style[0],native.StyleSheet.absoluteFill);
 }
});
test("minimalism preserves children, data and native geometry; A does not clone its contents",()=>{
 const child={type:"Text",props:{style:{color:"#ff8800",fontSize:14,width:65,height:65},children:"COMIDA"}};
 const original=art.UserLandingInk({minimal:false,children:child});assert.equal(original.children[0],child);
 const hidden=art.UserLandingInk({minimal:true,children:child}).children[0][0];
 assert.equal(hidden.type,child.type);assert.equal(hidden.props.children,"COMIDA");
 assert.equal(hidden.props.style[0],child.props.style);assert.equal(hidden.props.style[1].opacity,0);
 assert.equal(child.props.style.opacity,undefined);assert.equal(hidden.props.accessibilityElementsHidden,true);
});
function flatten(n){return Array.isArray(n)?n.flatMap(flatten):n&&typeof n==="object"?[n,...(n.children||[]).flatMap(flatten)]:[];}
test("Herramientas selection previews first and activation requires the Alert confirmation",async()=>{
 const {api,s}=await store();const dialogs=[];let inspected=0;
 const selector=load("components/landing/LandingVariantSelector.tsx",{react,"react-native":{...native,TouchableOpacity:"Button",Alert:{alert:(...args)=>dialogs.push(args)}},
 "./landingVariant":catalog});
 const render=()=>selector.LandingVariantSelector({visual:{...api.snapshot(),startPreview:api.preview,cancelPreview:api.cancel,confirm:api.confirm},
 onPreviewLanding:()=>inspected++,lang:"es"});
 let nodes=flatten(render());const choose=nodes.find(n=>n.props.accessibilityLabel==="Previsualizar B · GO con marca de agua");choose.props.onPress();
 assert.equal(api.snapshot().active,"actual");assert.equal(s.writes.length,0);
 nodes=flatten(render());nodes.find(n=>n.props.accessibilityLabel==="Ver vista previa en el Landing").props.onPress();assert.equal(inspected,1);
 nodes.find(n=>n.props.accessibilityLabel==="Confirmar activación").props.onPress();
 assert.equal(dialogs.length,1);assert.equal(s.writes.length,0);
 await dialogs[0][2].find(b=>b.text==="Activar").onPress();await new Promise(r=>setImmediate(r));
 assert.equal(api.snapshot().active,"marca");assert.equal(s.writes.length,1);
});
test("selector offers only disabled actions before preferences are loaded",()=>{
 const selector=load("components/landing/LandingVariantSelector.tsx",{react,"react-native":{...native,TouchableOpacity:"Button",Alert:{}},
 "./landingVariant":catalog});
 const nodes=flatten(selector.LandingVariantSelector({visual:{...model.initialLandingVisualState(),startPreview:()=>false,cancelPreview:()=>{},confirm:async()=>false},
 onPreviewLanding:()=>{},lang:"es"}));
 assert.ok(nodes.filter(n=>n.type==="Button").every(n=>n.props.disabled===true&&n.props.style.minHeight>=44));
});
test("decorative error boundary recovers without owning the interactive Landing",()=>{
 const instance=new art.LandingVisualBoundary();let recovered=0;instance.props={children:"decoration",onFailure:()=>recovered++};
 assert.equal(instance.render(),"decoration");instance.state=art.LandingVisualBoundary.getDerivedStateFromError();assert.equal(instance.render(),null);
 instance.componentDidCatch();assert.equal(recovered,1);
});
test("original orbit geometry, colors, swipe recognizers and core GO handlers match the preserved main baseline",()=>{
 const expected=JSON.parse(readFileSync("tests/fixtures/landing-visual-baseline.json","utf8"));
 const source=readFileSync("app/index.tsx","utf8"),ast=ts.createSourceFile("index.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const found={};function visit(n){
  if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&Object.hasOwn(expected,n.name.text))found[n.name.text]=n.getText(ast);
  if(ts.isFunctionDeclaration(n)&&n.name&&Object.hasOwn(expected,n.name.text))found[n.name.text]=n.getText(ast);
  ts.forEachChild(n,visit);
 }visit(ast);
 for(const [name,hash] of Object.entries(expected))assert.equal(createHash("sha256").update(found[name].replace(/\s+/g,"")).digest("hex"),hash,name);
 assert.ok(source.includes('userLandingVisualEnabled = goView.loaded && goView.view === "USER"'));
 assert.ok(source.includes('accessibilityLabel={goView.view === "USER" ? (displayLabel ?? s.key) : undefined}'));
 assert.equal(source.match(/<UserLandingInk minimal=\{userLandingMinimal\}/g).length,4);
 assert.ok(source.includes('const userLandingMinimal = userLandingVariant !== "actual" && orbitSecondLevel === null && activeSatCtx === null;'));
});
