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
function bookingPhotoFunctions(){
  const file="data/booking.ts",source=readFileSync(file,"utf8"),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const names=["serviceBody","mapRemoteService"],declarations=names.map(name=>ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name));
  assert.ok(declarations.every(Boolean));
  const code=ts.transpileModule(declarations.map(node=>node.getText(ast)).join("\n")+"\n"+names.map(name=>`exports.${name}=${name};`).join("\n"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,isCatalogReferenceSyntax:value=>typeof value==="string"&&/^demo-catalog:[a-z0-9-]{1,64}$/.test(value),isCatalogStorageReference:value=>typeof value==="string"&&/^go-storage:[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png)$/i.test(value),BookingApiError:Error});return exports;
}

test("real catalogue stores shared and business-owned Storage references in existing service metadata",()=>{
  const {serviceBody,mapRemoteService}=bookingPhotoFunctions(),reference=photos.demoCatalogExampleReference("salon-rulos");
  const item={businessId:"business-1",title:"Peinado",type:"peluqueria",catalogKind:"service",durationMinutes:30,price:20,active:true,visible:true,photoUri:reference};
  const body=serviceBody(item);assert.equal(body.ui_metadata.photoUri,reference);
  const restored=mapRemoteService({id:"service-1",business_id:item.businessId,name:body.name,duration_minutes:body.duration_minutes,price:body.price,currency:"EUR",active:true,ui_metadata:body.ui_metadata});
  assert.equal(restored.photoUri,reference);
  assert.match(photos.catalogPhotoSource(restored),/salon-rulos/);
  assert.equal(serviceBody({...item,photoUri:"none"}).ui_metadata.photoUri,"none");
  assert.throws(()=>serviceBody({...item,photoUri:"data:image/jpeg;base64,/9j/PRIVATE"}),/no pertenece a esta empresa/);
  const businessId="11111111-1111-4111-8111-111111111111",photoUri=`go-storage:${businessId}/22222222-2222-4222-8222-222222222222.jpg`;
  assert.equal(serviceBody({...item,businessId,photoUri}).ui_metadata.photoUri,photoUri);
  assert.equal(mapRemoteService({...restored,business_id:businessId,name:item.title,duration_minutes:30,price:20,ui_metadata:{photoUri}}).photoUri,photoUri);
  assert.throws(()=>serviceBody({...item,businessId,photoUri:photoUri.replace(businessId,"33333333-3333-4333-8333-333333333333")}),/no pertenece a esta empresa/);
  assert.equal(mapRemoteService({...restored,business_id:item.businessId,name:item.title,duration_minutes:30,price:20,ui_metadata:{photoUri:"https://other.example/private.jpg"}}).photoUri,undefined);
});

test("original and added JPEGs resolve from one bundled library for DEMO and real companies",()=>{
  for(const name of names){const file=`assets/catalog-demo/${name}.jpg`,data=readFileSync(file);assert.equal(data[0],0xff);assert.equal(data[1],0xd8);assert.ok(statSync(file).size<150_000);}
  for(let i=0;i<names.length;i++) assert.match(photos.demoCatalogPhotoSource({id:`demo_business_owner_item_${i}`,businessId:"demo_business_owner",title:titles[i],type:i<5?"peluqueria":"restaurante"}),new RegExp(names[i]));
  const item={id:"demo_business_owner_service",businessId:"demo_business_owner",title:"Paella valenciana",type:"restaurante"};
  assert.match(photos.demoCatalogPhotoSource(item),/paella-valenciana/);
  assert.equal(photos.demoCatalogPhotoSource({...item,businessId:"real-company"}),undefined);
  assert.equal(photos.demoCatalogPhotoSource({...item,photoUri:"none"}),undefined);
  assert.equal(photos.demoCatalogPhotoSource({...item,title:"Sin foto"}),undefined);
  assert.equal(photos.demoCatalogPhotoSource({...item,photoUri:"https://example.com/other.jpg"}),undefined);
  assert.equal(photos.demoCatalogPhotoSource({...item,photoUri:"data:image/jpeg;base64,/9j/TEST"}).uri,"data:image/jpeg;base64,/9j/TEST");
  assert.equal(photos.demoCatalogPhotoExamples.length,80);
  assert.equal(new Set(photos.demoCatalogPhotoExamples.map(example=>example.id)).size,80);
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
  assert.equal(photos.demoCatalogPhotoExamples.filter(example=>example.group==="Restaurantes").length,60);
  assert.equal(photos.demoCatalogPhotoExamples.filter(example=>example.group==="Peluquerías").length,20);
  for(let i=0;i<names.length;i++) assert.match(photos.demoCatalogPhotoSource({...item,title:"Otro servicio",photoUri:photos.demoCatalogExampleReference(names[i])}),new RegExp(names[i]));
  assert.equal(photos.demoCatalogPhotoSource({...item,photoUri:"demo-catalog:missing"}),undefined);
  assert.match(photos.catalogPhotoSource({...item,businessId:"real-company",photoUri:photos.demoCatalogExampleReference("gazpacho")}),/gazpacho/);
  assert.equal(photos.catalogPhotoSource({...item,businessId:"real-company",photoUri:"data:image/jpeg;base64,/9j/TEST"}),undefined);
  assert.equal(photos.isSharedCatalogPhotoReference("demo-catalog:gazpacho"),true);
  assert.equal(photos.isSharedCatalogPhotoReference("demo-catalog:missing"),false);
});

test("DEMO photo control offers filtered local examples without requesting personal permissions",async()=>{
  const alerts=[],changes=[],calls=[];
  let open=false;
  const React={createElement:(type,props,...children)=>({type,props:{...props,children:children.flat(Infinity)}}),useState:initial=>typeof initial==="boolean"?[open,value=>{open=value;}]:[initial,()=>{}]};
  const nodes=tree=>!tree||typeof tree!=="object"?[]:[tree,...(tree.props?.children??[]).flatMap(nodes)];
  let asset={base64:"/9j/PHOTO",mimeType:"image/jpeg"};
  const picker={requestCameraPermissionsAsync:async()=>{calls.push("camera permission");return{granted:true};},requestMediaLibraryPermissionsAsync:async()=>{calls.push("gallery permission");return{granted:true};},launchCameraAsync:async()=>{calls.push("camera");return{canceled:false,assets:[asset]};},launchImageLibraryAsync:async()=>{calls.push("gallery");return{canceled:false,assets:[asset]};}};
  const {CatalogPhotoButton,CatalogExampleGallery}=load("components/empresa/CatalogPhotoButton.tsx",{react:React,"react-native":{Alert:{alert:(...args)=>alerts.push(args)},TouchableOpacity:"button",View:"view",Text:"text",TextInput:"input",FlatList:"flat-list",Modal:"modal",ScrollView:"scroll"},"@expo/vector-icons":{Feather:"icon"},"expo-image":{Image:"image"},"expo-image-picker":picker,"@/data/demoCatalogPhotos":photos,"@/data/booking":{uploadCatalogPhoto:async()=>"go-storage:11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg"},"@/components/booking/CatalogPhotoView":{useCatalogPhotoSource:item=>photos.catalogPhotoSource(item)}});
  const props={id:"service",businessId:"demo_business_owner",title:"Corte",type:"peluqueria",demo:true,onChange:value=>changes.push(value)};
  const button=tree=>nodes(tree).find(node=>node.props.testID==="catalog-photo-service");
  button(CatalogPhotoButton(props)).props.onPress();
  assert.deepEqual(Array.from(alerts.at(-1)[2],option=>option.text),["Imágenes de ejemplo","Galería","Cámara","Cancelar"]);
  alerts.at(-1)[2][0].onPress();assert.equal(open,true);assert.deepEqual(calls,[]);
  assert.equal(nodes(CatalogPhotoButton(props)).some(node=>node.type===CatalogExampleGallery),true);
  const gallery=CatalogExampleGallery({visible:true,onSelect:value=>changes.push(value),onClose:()=>{open=false;}});
  assert.equal(gallery.props.visible,true);
  const list=nodes(gallery).find(node=>node.type==="flat-list");
  assert.equal(list.props.data.length,80);
  assert.equal(list.props.initialNumToRender,12);
  const choices=list.props.data.map(item=>list.props.renderItem({item}));
  assert.equal(choices.length,80);
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
  button(CatalogPhotoButton({...props,businessId:"real-company",demo:false})).props.onPress();
  assert.deepEqual(Array.from(alerts.at(-1)[2],option=>option.text),["Imágenes de ejemplo","Galería","Cámara","Cancelar"]);
  assert.deepEqual(calls,["gallery permission","gallery","camera permission","camera","gallery permission","gallery"]);
  button(CatalogPhotoButton({...props,businessId:"real-company",demo:false,photoUri:"demo-catalog:gazpacho"})).props.onPress();
  assert.deepEqual(Array.from(alerts.at(-1)[2],option=>option.text),["Imágenes de ejemplo","Galería","Cámara","Eliminar","Cancelar"]);
  alerts.at(-1)[2][3].onPress();await new Promise(setImmediate);assert.equal(changes.at(-1),"none");
});

test("example search and category filters keep restaurant and hair photos separate",()=>{
  assert.equal(photos.demoCatalogPhotoCategories("Restaurantes").includes("Paellas"),true);
  assert.equal(photos.demoCatalogPhotoCategories("Peluquerías").includes("Paellas"),false);
  assert.equal(photos.filterDemoCatalogPhotoExamples("Restaurantes","Paellas","").every(example=>example.group==="Restaurantes"&&example.category==="Paellas"),true);
  assert.deepEqual(Array.from(photos.filterDemoCatalogPhotoExamples("Peluquerías","Alisados","planchas"),example=>example.id),["salon-planchas"]);
  assert.deepEqual(Array.from(photos.filterDemoCatalogPhotoExamples("Restaurantes","Verduras","ratatouille"),example=>example.id),["ratatouille-plato"]);
  assert.equal(photos.filterDemoCatalogPhotoExamples("Restaurantes","Todas","salon").length,0);
});

test("DEMO stores its view locally while real accounts persist it through the API",async()=>{
  const memory=new Map(),remote=[],effects=[];let states=[],cursor=0;
  const React={Fragment:"fragment",createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return[states[index],value=>{states[index]=value}]},
    useEffect:effect=>{effects.push(effect)}};
  const module=load("components/booking/CatalogPhotoView.tsx",{react:React,"react-native":{Alert:{alert(){}},Modal:"modal",Text:"text",TouchableOpacity:"button",View:"view"},
    "@react-native-async-storage/async-storage":{__esModule:true,default:{getItem:async key=>memory.get(key)??null,setItem:async(key,next)=>{memory.set(key,next);}}},
    "expo-image":{Image:"image"},"@/data/demoCatalogPhotos":{catalogPhotoSource:photos.catalogPhotoSource},"@/lib/sessionEvents":{onSessionChanged:()=>()=>{}},
    "@/data/booking":{getAuthenticatedUserId:async()=>"user-1",getCatalogPhotoPreference:async id=>{remote.push(["read",id]);return true;},
      saveCatalogPhotoPreference:async(value,id)=>{remote.push(["write",id,value]);},getCatalogPhotoUrl:async()=>"https://example.test/signed",
      isCatalogStorageReference:value=>typeof value==="string"&&value.startsWith("go-storage:")}});
  const render=demo=>{cursor=0;return module.useCatalogPhotoPreference(demo)};
  render(true);for(const effect of effects.splice(0))effect();await new Promise(setImmediate);
  let pref=render(true);assert.equal(pref.ready,true);pref.choose(true);await new Promise(setImmediate);
  assert.equal(memory.get("go_customer_catalog_photos_v1"),"yes");assert.deepEqual(remote,[]);
  states=[];render(false);for(const effect of effects.splice(0))effect();await new Promise(setImmediate);
  pref=render(false);assert.equal(pref.ready,true);assert.equal(pref.showPhotos,true);pref.choose(false);await new Promise(setImmediate);
  assert.deepEqual(remote,[["read","user-1"],["write","user-1",false]]);
  const item={id:"missing",businessId:"demo_business_owner",title:"Sin foto",type:"restaurante"};
  assert.equal(module.hasCatalogPhoto(item),false);
  assert.equal(module.hasCatalogPhoto({...item,photoUri:"demo-catalog:churros-chocolate"}),true);
  assert.equal(module.hasCatalogPhoto({...item,photoUri:"go-storage:11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg"}),true);
  const buttons=module.CatalogPhotoToggle({showPhotos:true,choose:pref.choose}).props.children.flat();
  assert.equal(buttons[0].props.accessibilityState.selected,true);
});

test("tapping a catalogue photograph enlarges it without selecting its parent service",()=>{
  let states=[],cursor=0,stopped=0;
  const React={Fragment:"fragment",createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return[states[index],value=>{states[index]=value}]},useEffect:()=>{}};
  const component=load("components/booking/CatalogPhotoView.tsx",{react:React,"react-native":{Alert:{alert(){}},Modal:"modal",Text:"text",TouchableOpacity:"button",View:"view"},
    "@react-native-async-storage/async-storage":{__esModule:true,default:{}},"expo-image":{Image:"image"},
    "@/data/demoCatalogPhotos":{catalogPhotoSource:photos.catalogPhotoSource},"@/lib/sessionEvents":{onSessionChanged:()=>()=>{}},"@/data/booking":{isCatalogStorageReference:()=>false}});
  const item={id:"service",businessId:"11111111-1111-4111-8111-111111111111",title:"Tinte",type:"peluqueria",photoUri:"demo-catalog:salon-rulos"};
  const render=()=>{cursor=0;return component.CatalogItemPhoto({item,enabled:true,size:108})};
  const nodes=tree=>!tree||typeof tree!=="object"?[]:[tree,...(tree.props?.children??[]).flatMap(nodes)];
  let tree=render(),photo=nodes(tree).find(node=>node.props?.testID==="catalog-photo-service");
  assert.equal(photo.props.style[0].width,108);photo.props.onPress({stopPropagation:()=>stopped++});assert.equal(stopped,1);
  tree=render();assert.equal(nodes(tree).find(node=>node.type==="modal").props.visible,true);
  nodes(tree).find(node=>node.props?.testID==="catalog-photo-close").props.onPress();
  assert.equal(nodes(render()).find(node=>node.type==="modal").props.visible,false);
});
