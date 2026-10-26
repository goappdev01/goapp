import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,createRoot,document,rn,evaluate,ts}=require('./tests/helpers/react-lifecycle.cjs');
const timing=evaluate('data/serviceTiming.ts'),adapter=evaluate('data/serviceWorkWait.ts',{'./serviceTiming':timing});
const plain=value=>JSON.parse(JSON.stringify(value));
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',chair='33333333-3333-4333-8333-333333333333';
const work=(id,durationMinutes,patch={})=>({id,name:'',kind:'work',durationMinutes,resources:[],...patch});
const tint=(released=true)=>({name:'Tinte',duration:60,price:30,capacity:1,timing:{version:1,mode:'phases',resourcesConfigured:true,phases:[work('apply',15),{...work('process',30),kind:'wait',releaseProfessional:released},work('finish',15)]}});
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,alwaysStrict:false,esModuleInterop:false}}).outputText;
const ast=ts.createSourceFile('config.tsx',readFileSync('components/empresa/EmpresaConfigScreen.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=['useConfigArrayDraft','useStepSave','ServiceTimingEditor','StepServicios'].map(name=>ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name));
const styles=ast.statements.flatMap(node=>ts.isVariableStatement(node)?[...node.declarationList.declarations]:[]).find(node=>node.name.getText(ast)==='c').initializer.arguments[0];
const serviceCardStyle=vm.runInNewContext('('+styles.properties.find(node=>node.name?.getText(ast)==='svcRow').initializer.getText(ast)+')',{CARD:'#FFFFFF'});
const presentationStyles=Object.fromEntries(['svcNameInput','importCard','importBtn','importBtnsRow','importUrlBtn','importBtnLabel','importDividerTxt'].map(name=>[name,vm.runInNewContext('('+styles.properties.find(node=>node.name?.getText(ast)===name).initializer.getText(ast)+')',{CARD:'#FFFFFF',BORDER:'rgba(0,0,0,0.08)',TEXT:'#111827',GRAY:'#6B7280',DIM:'#9CA3AF',GREEN:'#3D9A84'})]));
const translations=evaluate('i18n/translations.ts').translations;
const descendants=node=>node?[node,...node.childNodes.flatMap(descendants)]:[];
async function fixture(service=tint(),{lang='es',resources=[],delay=false}={}){
 const Context=React.createContext(null),props=new Map(),calls=[],gates=[],alerts=[],imports={image:0,pdf:0};let stored=JSON.stringify({businessId:a,services:Array.isArray(service)?service:[service],bookingResources:resources}),snapshot;
 const native=name=>p=>{const id=React.useId();props.set(id,{...p,native:name});return React.createElement('div',{'data-prop-id':id,'data-native':name},p.children);};
 const components=Object.fromEntries(['Text','View','TextInput','TouchableOpacity','Switch','ScrollView'].map(name=>[name,native(name)]));
 const scope={exports:{},React,useState:React.useState,useRef:React.useRef,useEffect:React.useEffect,useCallback:React.useCallback,...components,
  useBusinessConfig:()=>React.useContext(Context),useLanguage:()=>({lang,t:key=>translations[lang][key]??key}),...timing,...adapter,newTimingId:(()=>{let n=0;return()=>`new-${++n}`;})(),
  BLUE:'#1D4ED8',TEXT:'#111827',GRAY:'#374151',DIM:'#4B5563',RED:'#B91C1C',PURPLE:'#7E22CE',GREEN:'#166534',GOLD:'#C9A84C',c:{svcRow:serviceCardStyle,...presentationStyles},trSector:value=>value,Feather:native('Feather'),
  CatalogAssociationManager:()=>null,BookingResourcesEditor:()=>null,GoOcrImportSheet:native('GoOcrImportSheet'),Haptics:{selectionAsync:async()=>{}},Alert:{alert:(...args)=>alerts.push(args)},
  ImagePicker:{requestMediaLibraryPermissionsAsync:async()=>({status:'granted'}),launchImageLibraryAsync:async()=>{imports.image++;return{canceled:true};}},DocumentPicker:{getDocumentAsync:async()=>{imports.pdf++;return{canceled:true};}},
 };
 vm.runInNewContext(compile(declarations.map(node=>node.getText(ast)).join('\n')+';exports.StepServicios=StepServicios;'),scope);
 const saveRef={current:null},container=document.createElement('div');let root=createRoot(container);
 const settle=async(fn=()=>{})=>React.act(async()=>{fn();for(let i=0;i<10;i++)await Promise.resolve();});
 function Host(){const[config,setConfig]=React.useState(()=>JSON.parse(stored));snapshot=config;
  const persist=patch=>{calls.push(plain(patch));const commit=()=>{stored=JSON.stringify({...JSON.parse(stored),...patch});setConfig(current=>({...current,...patch}));};
   if(!delay){commit();return Promise.resolve();}return new Promise(resolve=>gates.push(()=>{commit();resolve();}));};
  return React.createElement(Context.Provider,{value:{config,updateConfig:persist,demo:null}},React.createElement(scope.exports.StepServicios,{currentSector:null,saveRef}));}
 const visible=(parent=container)=>descendants(parent).filter(node=>node.attributes?.['data-prop-id']).map(node=>props.get(node.attributes['data-prop-id']));
 const get=id=>{const node=visible().find(p=>p.testID===id);assert.ok(node,'Missing '+id);return node;};
 await settle(()=>root.render(React.createElement(Host)));
 return {container,calls,alerts,gates,imports,saveRef,visible,get,settle,get saved(){return JSON.parse(stored);},get config(){return snapshot;},
  card(index){const node=descendants(container).find(node=>props.get(node.attributes?.['data-prop-id'])?.testID==='service-card-'+index);assert.ok(node);return visible(node);},
  async edit(index,text){await settle(()=>get('service-work-wait-'+index).onChangeText(text));},
  async toggle(){await settle(()=>get('service-work-wait-toggle').onPress());},
  async reload(){await settle(()=>root.unmount());root=createRoot(container);await settle(()=>root.render(React.createElement(Host)));},
  async close(){await settle(()=>root.unmount());}};
}

for(const lang of ['es','en'])test(`${lang}: the optional compact section contains exactly three side-by-side minute fields and one total, with no phase controls`,async()=>{
 const f=await fixture({name:'Corte',duration:27,price:15},{lang});try{
  assert.equal(f.get('service-work-wait-toggle').accessibilityState.expanded,false);assert.equal(f.visible().filter(p=>p.testID?.match(/^service-work-wait-[012]$/)).length,0);await f.toggle();
  assert.equal(f.get('service-work-wait-fields').style.flexDirection,'row');for(let i=0;i<3;i++){const input=f.get('service-work-wait-'+i);assert.equal(input.style.minHeight,44);assert.equal(input.keyboardType,'number-pad');assert.equal(input.style.minWidth,0);}
  const body=f.container.textContent;assert.match(body,lang==='en'?/WORK WITH CLIENT WAIT/:/TRABAJO CON ESPERA DEL CLIENTE/);for(const title of lang==='en'?['INITIAL WORK','CLIENT WAIT','FINAL WORK']:['TRABAJO INICIAL','ESPERA DEL CLIENTE','TRABAJO FINAL'])assert.ok(body.includes(title));assert.match(body,/27 min/);
  assert.doesNotMatch(body,/Fase [123]|Guardar tiempos|Añadir fase|Eliminar fase|Subir|Bajar|SERVICIO POR FASES|Distribución del tiempo|Tiempos para/);assert.equal(f.calls.length,0,'Opening cannot change configuration');
  assert.equal(f.visible().some(p=>p.native==='TextInput'&&!p.testID&&p.value==='27'),false,'The duplicate scalar minute field is hidden while the three-field form is open');
  await f.toggle();assert.equal(f.visible().some(p=>p.native==='TextInput'&&!p.testID&&p.value==='27'),true);assert.equal(f.calls.length,0);
 }finally{await f.close();}
});

for(const released of [true,false])test(`three values sum automatically, persist through the existing service writer, and preserve wait consent=${released}`,async()=>{
 const original=tint(released);original.timing.professionalTimings={[a]:{...tint().timing,durationMinutes:60},[b]:{...tint(false).timing,durationMinutes:60}};
 const f=await fixture(original);try{
  assert.equal(f.get('service-work-wait-toggle').accessibilityState.expanded,false);await f.toggle();await f.edit(0,'13');await f.edit(1,'30');await f.edit(2,'27');await f.saveRef.current();
  assert.match(f.container.textContent,/TOTAL DEL SERVICIO: 70 min/);const saved=f.saved.services[0];assert.equal(saved.duration,70);assert.equal(saved.price,30);assert.deepEqual(saved.timing.phases.map(p=>p.durationMinutes),[13,30,27]);assert.equal(saved.timing.phases[1].releaseProfessional,released);assert.deepEqual(saved.timing.professionalTimings,original.timing.professionalTimings);
  await f.reload();assert.equal(f.get('service-work-wait-toggle').accessibilityState.expanded,false);await f.toggle();for(const[index,value]of ['13','30','27'].entries())assert.equal(f.get('service-work-wait-'+index).value,value);assert.match(f.container.textContent,/70 min/);
 }finally{await f.close();}
});

test('rapid input and older queued acknowledgements never overwrite the newest three values',async()=>{
 const f=await fixture(tint(),{delay:true});try{
  await f.toggle();
  const inputs=[0,1,2].map(i=>f.get('service-work-wait-'+i));await f.settle(()=>{inputs[0].onChangeText('20');inputs[1].onChangeText('25');inputs[2].onChangeText('20');});
  assert.equal(f.gates.length,3);assert.match(f.container.textContent,/65 min/);await f.settle(()=>f.gates[0]());assert.equal(f.get('service-work-wait-1').value,'25');assert.equal(f.get('service-work-wait-2').value,'20');
  await f.settle(()=>f.gates[1]());await f.settle(()=>f.gates[2]());await f.saveRef.current();assert.deepEqual(f.saved.services[0].timing.phases.map(p=>p.durationMinutes),[20,25,20]);
 }finally{for(const done of f.gates)done();await f.close();}
});

test('invalid input stays visible, cannot overwrite persisted data, and blocks Next until corrected',async()=>{
 const f=await fixture();try{
  await f.toggle();
  await f.edit(1,'30.5');assert.equal(f.get('service-work-wait-1').value,'30.5');assert.equal(f.calls.length,0);assert.match(f.container.textContent,/minutos enteros/);await assert.rejects(f.saveRef.current(),/minutos enteros/);assert.equal(f.saved.services[0].duration,60);
  await f.edit(1,'35');await f.saveRef.current();assert.equal(f.saved.services[0].duration,65);assert.equal(f.saved.services[0].timing.phases[1].durationMinutes,35);assert.equal(f.alerts.length,0);
 }finally{await f.close();}
});

test('prices, resource quantities, fixed professionals and accepted configuration are retained when only minutes change',()=>{
 const original=tint();original.timing.phases[0]={...original.timing.phases[0],staffId:a,resources:[{resourceId:chair,quantity:1,occupancy:'booking'}]};const snapshot=plain(original);
 const updated=adapter.updateServiceWorkWait(original,['13','30','27'],[{id:chair,name:'Silla',capacity:1}],()=> 'unused');assert.equal(updated.duration,70);assert.equal(updated.timing.phases[0].id,'apply');assert.equal(updated.timing.phases[0].staffId,a);assert.deepEqual(plain(updated.timing.phases[0].resources),snapshot.timing.phases[0].resources);assert.deepEqual(original,snapshot);
 assert.throws(()=>adapter.updateServiceWorkWait(original,['0','30','15'],[{id:chair,name:'Silla',capacity:1}],()=> 'unused'),/conservar/);
});
test('zero-minute unbound parts are omitted instead of inventing invalid zero-duration engine phases',()=>{
 const updated=adapter.updateServiceWorkWait(tint(),['13','0','27'],[],()=> 'unused');assert.equal(updated.duration,40);assert.equal(updated.timing.phases.length,2);assert.ok(updated.timing.phases.every(p=>p.kind==='work'&&p.durationMinutes>0));assert.deepEqual(plain(adapter.readServiceWorkWait(updated).values),['13','0','27']);
 assert.throws(()=>adapter.updateServiceWorkWait(tint(),['0','0','0'],[],()=> 'unused'));assert.throws(()=>adapter.updateServiceWorkWait(tint(),['1440','30','15'],[],()=> 'unused'));
});
test('legacy complex sequences remain intact instead of being silently flattened or losing metadata',()=>{
 const old=tint();old.timing.phases.push({id:'extra',name:'Waiting again',kind:'wait',durationMinutes:10,releaseProfessional:false,resources:[]});old.duration=70;const before=plain(old);
 assert.equal(adapter.readServiceWorkWait(old).editable,false);assert.throws(()=>adapter.updateServiceWorkWait(old,['15','40','15'],[],()=> 'unused'),/configuración guardada/);assert.deepEqual(old,before);
});
test('the visual simplification cannot silently grant unknown resources or release an unauthorized wait',()=>{
 let pendingId=0;const pending=adapter.updateServiceWorkWait({duration:60},['15','30','15'],[],()=> 'pending-'+(++pendingId));
 assert.equal(pending.duration,60);assert.equal(pending.timing.configurationStatus,'pending');assert.equal(pending.timing.resourcesConfigured,false);assert.throws(()=>timing.validateServiceTiming(pending.timing),/habilitados/);
 const noWait={duration:60,timing:{version:1,mode:'simple',resourcesConfigured:true,phases:[work('work',60)]}};let id=0;
 const next=adapter.updateServiceWorkWait(noWait,['15','30','15'],[],()=> 'new-'+(++id));assert.equal(next.timing.phases[1].releaseProfessional,false);
 const bad=tint();bad.timing.phases[0].releaseProfessional=true;assert.throws(()=>timing.validateServiceTiming(bad));
});

for(const existing of [false,true])test('15+30+15 on '+(existing?'an existing':'a new')+' service saves the full 60 minutes despite unverified resources, then reloads and edits coherently',async()=>{
 const original={name:existing?'Corte existente':'Tinte nuevo',duration:30,price:25,capacity:1};if(existing)original.timing={version:1,mode:'simple',resourcesConfigured:false,phases:[work('original',30)]};
 const f=await fixture(original);try{
  await f.toggle();await f.edit(0,'15');await f.edit(1,'30');await f.edit(2,'15');await f.saveRef.current();
  assert.equal(f.config.services[0].duration,60);assert.equal(f.saved.services[0].duration,60);assert.deepEqual(f.saved.services[0].timing.phases.map(p=>p.durationMinutes),[15,30,15]);assert.match(f.container.textContent,/TOTAL DEL SERVICIO: 60 min/);assert.match(f.container.textContent,/Pendiente de habilitar reservas/);assert.equal(f.alerts.length,0);
  await f.toggle();const main=f.visible().find(p=>p.native==='TextInput'&&!p.testID&&p.value==='60');assert.ok(main,'Main service duration must show 60, never the initial work of 15');
  await f.reload();await f.toggle();for(const[index,value]of ['15','30','15'].entries())assert.equal(f.get('service-work-wait-'+index).value,value);
  await f.edit(1,'40');await f.saveRef.current();assert.equal(f.saved.services[0].duration,70);await f.reload();await f.toggle();assert.equal(f.get('service-work-wait-1').value,'40');assert.match(f.container.textContent,/70 min/);assert.equal(f.saved.services[0].price,25);
 }finally{await f.close();}
});
test('pending settings keep unknown or unavailable resources for later review without granting their use',()=>{
 const source=tint();source.timing.phases[0].resources=[{resourceId:chair,quantity:1,occupancy:'booking'}];
 const pending=adapter.updateServiceWorkWait(source,['15','30','15'],[],()=> 'unused');assert.equal(pending.duration,60);assert.equal(pending.timing.resourcesConfigured,true,'Existing confirmation must not be invented or removed');assert.equal(pending.timing.configurationStatus,'pending');assert.equal(pending.timing.phases[0].resources[0].resourceId,chair);
 assert.throws(()=>timing.validateServiceTiming(pending.timing,{resources:[]}));
 const approved=adapter.updateServiceWorkWait(pending,['15','30','15'],[{id:chair,name:'Silla',capacity:1}],()=> 'unused');assert.equal(approved.timing.configurationStatus,undefined);assert.equal(approved.duration,60);assert.equal(approved.timing.phases[1].releaseProfessional,true);
});
test('continuous services retain their current save path and never acquire a false wait or authorization',()=>{
 const next=adapter.updateServiceWorkWait({duration:30},['43','0','0'],[],()=> 'unused');assert.equal(next.duration,43);assert.equal(next.timing,undefined);
});

test('Corte, Lavado, Tinte and Peinado own their complete form and independent collapsed timing without mutating saved services',async()=>{
 const originals=['CORTE','LAVADO','TINTE','PEINADO'].map((name,index)=>({...tint(index%2===0),name,description:'Complemento '+index,price:10+index}));
 const f=await fixture(originals);try{
  for(let index=0;index<4;index++){
   const card=f.card(index),frame=card[0];assert.equal(frame.style[0].borderWidth,1.5);assert.equal(frame.style[0].borderRadius,14);assert.ok(frame.style[0].padding>0);
   assert.equal(card.filter(p=>p.native==='TextInput'&&p.value===originals[index].name).length,1);assert.equal(card.filter(p=>p.value==='Complemento '+index).length,1);
   assert.equal(card.filter(p=>p.testID==='service-work-wait-toggle').length,1);assert.equal(card.find(p=>p.testID==='service-work-wait-toggle').accessibilityState.expanded,false);
   assert.equal(card.filter(p=>p.testID?.match(/^service-work-wait-[012]$/)).length,0);
  }
  assert.equal(f.calls.length,0);
  await f.settle(()=>f.card(2).find(p=>p.testID==='service-work-wait-toggle').onPress());
  assert.equal(f.card(2).filter(p=>p.testID?.match(/^service-work-wait-[012]$/)).length,3);
  assert.equal(f.card(0).find(p=>p.testID==='service-work-wait-toggle').accessibilityState.expanded,false);
  const extra=f.card(2).find(p=>p.accessibilityLabel==='Servicio complementario (opcional)');assert.equal(extra.placeholder,extra.accessibilityLabel);
  await f.settle(()=>extra.onChangeText('Complemento editado'));await f.saveRef.current();
  assert.equal(f.saved.services.length,4);assert.equal(f.saved.services[2].description,'Complemento editado');
  for(let index=0;index<4;index++){assert.equal(f.saved.services[index].price,originals[index].price);assert.equal(f.saved.services[index].duration,60);assert.deepEqual(f.saved.services[index].timing,originals[index].timing);}
  await f.reload();for(let index=0;index<4;index++)assert.equal(f.card(index).find(p=>p.testID==='service-work-wait-toggle').accessibilityState.expanded,false);
  assert.equal(f.saved.services[2].description,'Complemento editado');
 }finally{await f.close();}
});

for(const lang of ['es','en'])test(lang+': timing disclosure keeps the full one-line label and a larger chevron inside a 44-point touch target',async()=>{
 const f=await fixture({...tint(),name:'Servicio con un nombre muy largo que debe conservarse completo'},{lang});try{
  const toggle=f.get('service-work-wait-toggle');assert.ok(toggle.style.minHeight>=44);
  const title=f.visible().find(p=>p.native==='Text'&&p.children===(lang==='en'?'WORK WITH CLIENT WAIT':'TRABAJO CON ESPERA DEL CLIENTE'));
  assert.equal(title.numberOfLines,1);assert.equal(title.adjustsFontSizeToFit,true);assert.equal(title.style.minWidth,0);
  assert.equal(f.visible().find(p=>p.native==='Feather'&&p.name==='chevron-down').size,24);
  await f.toggle();assert.equal(f.get('service-work-wait-toggle').accessibilityState.expanded,true);await f.toggle();assert.equal(f.calls.length,0);
 }finally{await f.close();}
});

test('only service names are centered and remain editable and persisted without changing service frames or configuration',async()=>{
 const originals=['CORTE','LAVADO','TINTE','PEINADO','TRATAMIENTO'].map(name=>({...tint(),name,description:'Complemento guardado'}));
 const f=await fixture(originals);try{
  for(let index=0;index<originals.length;index++){
   const name=f.get('service-name-'+index),extra=f.card(index).find(p=>p.accessibilityLabel==='Servicio complementario (opcional)');
   assert.equal(name.style[1].textAlign,'center');assert.equal(name.editable,undefined);assert.equal(typeof name.onChangeText,'function');assert.equal(typeof name.onBlur,'function');
   assert.equal(name.style[0].paddingVertical,9);assert.equal(name.style[0].fontSize,14);assert.equal(extra.style.some(style=>style?.textAlign==='center'),false);
  }
  await f.settle(()=>f.get('service-name-4').onChangeText('TRATAMIENTO PERSONALIZADO'));await f.saveRef.current();await f.reload();
  assert.equal(f.get('service-name-4').value,'TRATAMIENTO PERSONALIZADO');
  for(let index=0;index<originals.length;index++){const saved=f.saved.services[index];assert.equal(saved.description,originals[index].description);assert.equal(saved.duration,originals[index].duration);assert.equal(saved.price,originals[index].price);assert.deepEqual(saved.timing,originals[index].timing);}
 }finally{await f.close();}
});

for(const lang of ['es','en'])test(lang+': exactly three spaced import buttons retain their icons, titles and original handlers without secondary explanations',async()=>{
 const f=await fixture(tint(),{lang});try{
  const buttons=['image','pdf','web'].map(kind=>f.get('service-import-'+kind));assert.ok(buttons.every(button=>typeof button.onPress==='function'));
  const body=f.container.textContent;for(const key of ['biz_import_image_label','biz_import_pdf_label','biz_import_link_label'])assert.ok(body.includes(translations[lang][key]));
  for(const key of ['biz_import_image_sub','biz_import_pdf_sub','biz_import_link_sub'])assert.ok(!body.includes(translations[lang][key]));
  assert.doesNotMatch(body,/GO detectará nombres, precios y duraciones automáticamente/);
  assert.equal(f.visible().filter(p=>p.native==='Feather'&&p.name==='camera').length,1);assert.equal(f.visible().filter(p=>p.native==='Feather'&&p.name==='file-text').length,1);assert.equal(f.visible().filter(p=>p.native==='Feather'&&p.name==='globe').length,1);
  assert.ok(buttons[0].style.borderWidth>0);assert.equal(buttons[0].style,buttons[1].style);assert.ok(presentationStyles.importBtnsRow.gap>=10);assert.ok(presentationStyles.importBtnsRow.marginHorizontal>0);assert.ok(presentationStyles.importUrlBtn.marginHorizontal>0);
  await f.settle(()=>buttons[0].onPress());const menu=f.alerts.at(-1)[2];await f.settle(()=>menu.find(choice=>choice.text.includes('Galería')).onPress());assert.equal(f.imports.image,1);
  await f.settle(()=>buttons[1].onPress());assert.equal(f.imports.pdf,1);
  await f.settle(()=>buttons[2].onPress());const sheet=f.visible().find(p=>p.native==='GoOcrImportSheet');assert.equal(sheet.visible,true);assert.equal(sheet.isUrl,true);assert.equal(sheet.sourceUri,null);
  await f.settle(()=>sheet.onClose());assert.equal(f.visible().find(p=>p.native==='GoOcrImportSheet').visible,false);assert.equal(f.calls.length,0,'Opening import options must not alter services');
 }finally{await f.close();}
});

test('the import heading starts with uppercase O and its text and all three independent borders have sufficient contrast',async()=>{
 const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;};
 const contrast=(a,b)=>{const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(values[0]+0.05)/(values[1]+0.05);};
 const f=await fixture();try{
  assert.equal(translations.es.biz_import_from_price_list,'O importar desde tarifa');assert.ok(f.container.textContent.includes('O importar desde tarifa'));
  assert.ok(contrast(presentationStyles.importDividerTxt.color,'#FFFFFF')>=4.5);
  for(const kind of ['image','pdf','web']){const button=f.get('service-import-'+kind);assert.ok(button.style.borderWidth>=1.5);for(const background of ['#FFFFFF','#FAFAFA','#F7F8FA'])assert.ok(contrast(button.style.borderColor,background)>=3);}
  assert.equal(f.calls.length,0);
 }finally{await f.close();}
});
