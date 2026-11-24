import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";

const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");
const compile = file => ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
const load = (file,imports) => {const exports={};vm.runInNewContext(compile(file),{exports,require:key=>key in imports?imports[key]:key.startsWith("../assets/catalog-demo/")?key:(()=>{throw Error("Unexpected dependency "+key)})(),console});return exports;};
const photos=load("data/demoCatalogPhotos.ts",{});
const names=["corte-caballero","corte-senora","tinte-coloracion","peinado-secado","mechas-tratamiento","paella-valenciana","tortilla-patatas","croquetas","patatas-bravas","gazpacho","churros-chocolate"];
const titles=["Corte caballero","Corte señora","Tinte / coloración","Peinado y secado","Mechas / tratamiento","Paella valenciana","Tortilla de patatas","Croquetas","Patatas bravas","Gazpacho","Churros con chocolate"];

test("eleven verified DEMO JPEGs are bundled locally and resolve only for DEMO companies",()=>{
  for(const name of names){const file=`assets/catalog-demo/${name}.jpg`,data=readFileSync(file);assert.equal(data[0],0xff);assert.equal(data[1],0xd8);assert.ok(statSync(file).size<150_000);}
  for(let i=0;i<names.length;i++) assert.match(photos.demoCatalogPhotoSource({id:`demo_business_owner_item_${i}`,businessId:"demo_business_owner",title:titles[i],type:i<5?"peluqueria":"restaurante"}),new RegExp(names[i]));
  const item={id:"demo_business_owner_service",businessId:"demo_business_owner",title:"Paella valenciana",type:"restaurante"};
  assert.match(photos.demoCatalogPhotoSource(item),/paella-valenciana/);
  assert.equal(photos.demoCatalogPhotoSource({...item,businessId:"real-company"}),undefined);
  assert.equal(photos.demoCatalogPhotoSource({...item,photoUri:"none"}),undefined);
  assert.equal(photos.demoCatalogPhotoSource({...item,title:"Sin foto"}),undefined);
  assert.equal(photos.demoCatalogPhotoSource({...item,photoUri:"https://example.com/other.jpg"}),undefined);
  assert.equal(photos.demoCatalogPhotoSource({...item,photoUri:"data:image/jpeg;base64,/9j/TEST"}).uri,"data:image/jpeg;base64,/9j/TEST");
});

test("DEMO photo control accepts gallery and camera, replaces and removes without a server call",async()=>{
  const alerts=[],changes=[],calls=[];
  const React={createElement:(type,props,...children)=>({type,props:{...props,children}})};
  let asset={base64:"/9j/PHOTO",mimeType:"image/jpeg"};
  const picker={requestCameraPermissionsAsync:async()=>({granted:true}),requestMediaLibraryPermissionsAsync:async()=>({granted:true}),launchCameraAsync:async()=>{calls.push("camera");return{canceled:false,assets:[asset]};},launchImageLibraryAsync:async()=>{calls.push("gallery");return{canceled:false,assets:[asset]};}};
  const {CatalogPhotoButton}=load("components/empresa/CatalogPhotoButton.tsx",{react:React,"react-native":{Alert:{alert:(...args)=>alerts.push(args)},TouchableOpacity:"button",View:"view"},"@expo/vector-icons":{Feather:"icon"},"expo-image":{Image:"image"},"expo-image-picker":picker,"@/data/demoCatalogPhotos":{demoCatalogPhotoSource:item=>item.photoUri&&item.photoUri!=="none"?{uri:item.photoUri}:undefined}});
  const props={id:"service",businessId:"demo_business_owner",title:"Corte",type:"peluqueria",demo:true,onChange:value=>changes.push(value)};
  CatalogPhotoButton(props).props.onPress();alerts.at(-1)[2][0].onPress();await new Promise(setImmediate);assert.deepEqual(calls,["gallery"]);assert.deepEqual(changes,["data:image/jpeg;base64,/9j/PHOTO"]);
  CatalogPhotoButton({...props,photoUri:changes[0]}).props.onPress();alerts.at(-1)[2][1].onPress();await new Promise(setImmediate);assert.deepEqual(calls,["gallery","camera"]);
  alerts.at(-1)[2][2].onPress();assert.equal(changes.at(-1),"none");
  asset={base64:"/9j/PHOTO",mimeType:"image/png"};CatalogPhotoButton(props).props.onPress();alerts.at(-1)[2][0].onPress();await new Promise(setImmediate);assert.match(alerts.at(-1)[1],/JPEG o PNG/);
  assert.equal(changes.length,3);
  assert.equal(CatalogPhotoButton({...props,demo:false}).props.disabled,true);
});

test("client photo toggle keeps its device preference and leaves cards without images compact",async()=>{
  const memory=new Map(),React={createElement:(type,props,...children)=>({type,props:{...props,children}})};
  let value=false;
  React.useState=()=>[value,next=>{value=next;}];React.useEffect=effect=>effect();
  const module=load("components/booking/CatalogPhotoView.tsx",{react:React,"react-native":{Text:"text",TouchableOpacity:"button",View:"view"},"@react-native-async-storage/async-storage":{__esModule:true,default:{getItem:async key=>memory.get(key)??null,setItem:async(key,next)=>{memory.set(key,next);}}},"expo-image":{Image:"image"},"@/data/demoCatalogPhotos":{demoCatalogPhotoSource:photos.demoCatalogPhotoSource}});
  const pref=module.useCatalogPhotoPreference();assert.equal(pref.showPhotos,false);
  pref.choose(true);await new Promise(setImmediate);assert.equal(memory.get("go_customer_catalog_photos_v1"),"yes");
  const buttons=module.CatalogPhotoToggle({showPhotos:true,choose:pref.choose}).props.children.flat();
  assert.equal(buttons.length,2);assert.equal(buttons[0].props.accessibilityState.selected,true);
  buttons[1].props.onPress();await new Promise(setImmediate);assert.equal(memory.get("go_customer_catalog_photos_v1"),"no");
  const item={id:"missing",businessId:"demo_business_owner",title:"Sin foto",type:"restaurante"};
  assert.equal(module.CatalogItemPhoto({item,enabled:true}),null);
  assert.equal(module.CatalogItemPhoto({...{item,enabled:false}}),null);
  assert.equal(module.CatalogItemPhoto({item:{...item,title:"Croquetas"},enabled:true}).type,"image");
});
