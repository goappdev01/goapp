import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
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

test("original and added DEMO JPEGs are bundled locally and resolve only for DEMO companies",()=>{
  for(const name of names){const file=`assets/catalog-demo/${name}.jpg`,data=readFileSync(file);assert.equal(data[0],0xff);assert.equal(data[1],0xd8);assert.ok(statSync(file).size<150_000);}
  for(let i=0;i<names.length;i++) assert.match(photos.demoCatalogPhotoSource({id:`demo_business_owner_item_${i}`,businessId:"demo_business_owner",title:titles[i],type:i<5?"peluqueria":"restaurante"}),new RegExp(names[i]));
  const item={id:"demo_business_owner_service",businessId:"demo_business_owner",title:"Paella valenciana",type:"restaurante"};
  assert.match(photos.demoCatalogPhotoSource(item),/paella-valenciana/);
  assert.equal(photos.demoCatalogPhotoSource({...item,businessId:"real-company"}),undefined);
  assert.equal(photos.demoCatalogPhotoSource({...item,photoUri:"none"}),undefined);
  assert.equal(photos.demoCatalogPhotoSource({...item,title:"Sin foto"}),undefined);
  assert.equal(photos.demoCatalogPhotoSource({...item,photoUri:"https://example.com/other.jpg"}),undefined);
  assert.equal(photos.demoCatalogPhotoSource({...item,photoUri:"data:image/jpeg;base64,/9j/TEST"}).uri,"data:image/jpeg;base64,/9j/TEST");
  assert.equal(photos.demoCatalogPhotoExamples.length,54);
  assert.equal(new Set(photos.demoCatalogPhotoExamples.map(example=>example.id)).size,54);
  const sources=readFileSync("assets/catalog-demo/SOURCES.md","utf8");
  for(const example of photos.demoCatalogPhotoExamples){
    const file=`assets/catalog-demo/${example.id}.jpg`,data=readFileSync(file);
    assert.equal(data[0],0xff);assert.equal(data[1],0xd8);assert.ok(data.length<200_000,example.id);
    assert.ok(example.category);assert.ok(["Peluquerías","Restaurantes"].includes(example.group));
    if(!names.includes(example.id)){
      const sourceLine=sources.split("\n").find(line=>line.includes(`\`${example.id}.jpg\``));
      assert.ok(sourceLine,`Missing source for ${example.id}`);
      assert.match(sourceLine,/CC0 1\.0/);
      assert.ok(sourceLine.includes(createHash("sha256").update(data).digest("hex")));
    }
  }
  assert.equal(photos.demoCatalogPhotoExamples.filter(example=>example.group==="Restaurantes").length,42);
  assert.equal(photos.demoCatalogPhotoExamples.filter(example=>example.group==="Peluquerías").length,12);
  for(let i=0;i<names.length;i++) assert.match(photos.demoCatalogPhotoSource({...item,title:"Otro servicio",photoUri:photos.demoCatalogExampleReference(names[i])}),new RegExp(names[i]));
  assert.equal(photos.demoCatalogPhotoSource({...item,photoUri:"demo-catalog:missing"}),undefined);
  assert.equal(photos.demoCatalogPhotoSource({...item,businessId:"real-company",photoUri:photos.demoCatalogExampleReference("gazpacho")}),undefined);
});

test("DEMO photo control offers filtered local examples without requesting personal permissions",async()=>{
  const alerts=[],changes=[],calls=[];
  let open=false;
  const React={createElement:(type,props,...children)=>({type,props:{...props,children:children.flat(Infinity)}}),useState:initial=>typeof initial==="boolean"?[open,value=>{open=value;}]:[initial,()=>{}]};
  const nodes=tree=>!tree||typeof tree!=="object"?[]:[tree,...(tree.props?.children??[]).flatMap(nodes)];
  let asset={base64:"/9j/PHOTO",mimeType:"image/jpeg"};
  const picker={requestCameraPermissionsAsync:async()=>{calls.push("camera permission");return{granted:true};},requestMediaLibraryPermissionsAsync:async()=>{calls.push("gallery permission");return{granted:true};},launchCameraAsync:async()=>{calls.push("camera");return{canceled:false,assets:[asset]};},launchImageLibraryAsync:async()=>{calls.push("gallery");return{canceled:false,assets:[asset]};}};
  const {CatalogPhotoButton,CatalogExampleGallery}=load("components/empresa/CatalogPhotoButton.tsx",{react:React,"react-native":{Alert:{alert:(...args)=>alerts.push(args)},TouchableOpacity:"button",View:"view",Text:"text",TextInput:"input",FlatList:"flat-list",Modal:"modal",ScrollView:"scroll"},"@expo/vector-icons":{Feather:"icon"},"expo-image":{Image:"image"},"expo-image-picker":picker,"@/data/demoCatalogPhotos":photos});
  const props={id:"service",businessId:"demo_business_owner",title:"Corte",type:"peluqueria",demo:true,onChange:value=>changes.push(value)};
  const button=tree=>nodes(tree).find(node=>node.props.testID==="catalog-photo-service");
  button(CatalogPhotoButton(props)).props.onPress();
  assert.deepEqual(Array.from(alerts.at(-1)[2],option=>option.text),["Imágenes de ejemplo","Galería","Cámara","Cancelar"]);
  alerts.at(-1)[2][0].onPress();assert.equal(open,true);assert.deepEqual(calls,[]);
  assert.equal(nodes(CatalogPhotoButton(props)).some(node=>node.type===CatalogExampleGallery),true);
  const gallery=CatalogExampleGallery({visible:true,onSelect:value=>changes.push(value),onClose:()=>{open=false;}});
  assert.equal(gallery.props.visible,true);
  const list=nodes(gallery).find(node=>node.type==="flat-list");
  assert.equal(list.props.data.length,54);
  assert.equal(list.props.initialNumToRender,12);
  const choices=list.props.data.map(item=>list.props.renderItem({item}));
  assert.equal(choices.length,54);
  assert.equal(nodes(gallery).filter(node=>node.type==="text").some(node=>node.props.children.includes("Peluquerías")),true);
  assert.equal(nodes(gallery).filter(node=>node.type==="text").some(node=>node.props.children.includes("Restaurantes")),true);
  for(const name of names)assert.ok(choices.some(node=>node.props.testID===`catalog-example-${name}`));
  assert.equal(nodes(gallery).some(node=>node.props.testID==="catalog-examples-search"),true);
  choices.find(node=>node.props.testID==="catalog-example-gazpacho").props.onPress();assert.equal(changes.at(-1),"demo-catalog:gazpacho");
  nodes(gallery).find(node=>node.props.testID==="catalog-examples-close").props.onPress();assert.equal(open,false);
  assert.equal(nodes(CatalogPhotoButton(props)).some(node=>node.type===CatalogExampleGallery),false);
  const selected=CatalogPhotoButton({...props,photoUri:changes.at(-1)});button(selected).props.onPress();
  assert.deepEqual(Array.from(alerts.at(-1)[2],option=>option.text),["Imágenes de ejemplo","Galería","Cámara","Eliminar","Cancelar"]);
  alerts.at(-1)[2][1].onPress();await new Promise(setImmediate);assert.deepEqual(calls,["gallery permission","gallery"]);assert.equal(changes.at(-1),"data:image/jpeg;base64,/9j/PHOTO");
  button(CatalogPhotoButton({...props,photoUri:changes.at(-1)})).props.onPress();alerts.at(-1)[2][2].onPress();await new Promise(setImmediate);assert.deepEqual(calls,["gallery permission","gallery","camera permission","camera"]);
  alerts.at(-1)[2][3].onPress();await new Promise(setImmediate);assert.equal(changes.at(-1),"none");
  asset={base64:"/9j/PHOTO",mimeType:"image/png"};button(CatalogPhotoButton(props)).props.onPress();alerts.at(-1)[2][1].onPress();await new Promise(setImmediate);assert.match(alerts.at(-1)[1],/JPEG o PNG/);
  assert.equal(button(CatalogPhotoButton({...props,demo:false})).props.disabled,true);
});

test("example search and category filters keep restaurant and hair photos separate",()=>{
  assert.equal(photos.demoCatalogPhotoCategories("Restaurantes").includes("Paellas"),true);
  assert.equal(photos.demoCatalogPhotoCategories("Peluquerías").includes("Paellas"),false);
  assert.equal(photos.filterDemoCatalogPhotoExamples("Restaurantes","Paellas","").every(example=>example.group==="Restaurantes"&&example.category==="Paellas"),true);
  assert.deepEqual(Array.from(photos.filterDemoCatalogPhotoExamples("Peluquerías","Alisados","planchas"),example=>example.id),["salon-planchas"]);
  assert.deepEqual(Array.from(photos.filterDemoCatalogPhotoExamples("Restaurantes","Verduras","ratatouille"),example=>example.id),["ratatouille-plato"]);
  assert.equal(photos.filterDemoCatalogPhotoExamples("Restaurantes","Todas","salon").length,0);
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
  assert.match(module.CatalogItemPhoto({item:{...item,photoUri:"demo-catalog:churros-chocolate"},enabled:true}).props.source,/churros-chocolate/);
  assert.equal(module.CatalogItemPhoto({item:{...item,photoUri:"demo-catalog:churros-chocolate"},enabled:false}),null);
});
