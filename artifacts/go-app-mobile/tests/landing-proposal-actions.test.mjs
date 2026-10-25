import {originalGoProposalContract} from "./helpers/booking-go-contract.mjs";
import {entryPhone,renderEntryQuickActions} from './helpers/entry-details-fixture.mjs';
import { priorLandingPosition } from './helpers/landing-anchor-baseline.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json')),ts=require('typescript');
const {React,createRoot,document,rn}=require('./tests/helpers/react-lifecycle.cjs');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const approved=JSON.parse(fs.readFileSync(new URL('./helpers/landing-proposal-baselines.json',import.meta.url),'utf8')).actions;
function find(n,p){if(p(n))return n;let r;ts.forEachChild(n,c=>{if(!r)r=find(c,p)});return r;}
const decl=(a,name)=>find(a,n=>ts.isVariableDeclaration(n)&&n.name.getText(a)===name);
const compact=s=>s.replace(/\s+/g,' ').trim();
function load(file){const context={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}
const policy=load('components/landing/landingPanels.ts'),layout=load('components/landing/landingResponsiveLayout.ts');
function entry(type='GO_BOOKING',estado='propuesta_pendiente',moved=true){return {id:'original-1',type,estado,kind:'sent',dateISO:moved?'2032-03-21':'2032-03-20',date:moved?'21 marzo':'20 marzo',time:moved?'16:00':'10:00',duration:'30',place:'Dirección vigente',phone:'+34600111222',whatsapp:'+34600333444',intentLabel:'Cita de prueba',intentKey:'reserva',color:'#60a5fa',reservationId:'booking-1',bookingStatus:'confirmada',paymentStatus:'pagada',changeProposal:{originalDateISO:'2032-03-20',originalDate:'20 marzo',originalTime:'10:00',originalDuration:'30',dateISO:'2032-03-21',date:'21 marzo',time:'16:00',place:'Dirección propuesta',duration:'60',proposedAt:1}};}
for(const type of ['GO','GO_BOOKING','TAREA','TAREA_INTERNA'])for(const estado of ['propuesto','propuesta_pendiente'])
 test(`${type} / ${estado}: operations use the current entity, without applying the proposal or changing payment`,()=>{
  for(const moved of [false,true]){
   const g=entry(type,estado,moved),original=JSON.stringify(g);Object.freeze(g.changeProposal);Object.freeze(g);
   const current=policy.landingCurrentEntry(g);
   assert.equal(current.id,g.id);assert.equal(current.type,type);assert.equal(current.estado,estado);
   assert.equal(current.dateISO,'2032-03-20');assert.equal(current.date,'20 marzo');assert.equal(current.time,'10:00');assert.equal(current.duration,'30');assert.equal(current.place,'Dirección vigente');
   assert.equal(current.reservationId,g.reservationId);assert.equal(current.bookingStatus,'confirmada');assert.equal(current.paymentStatus,'pagada');assert.equal(current.changeProposal,g.changeProposal);
   assert.equal(JSON.stringify(g),original,'projection never mutates persisted data');
  }
 });
test('ordinary/accepted entries preserve identity, and missing original values never apply proposed fields',()=>{
 for(const estado of ['pendiente','aceptado','rechazado']){const g=entry('GO_BOOKING',estado,false);assert.equal(policy.landingCurrentEntry(g),g);}
 const noProposal={...entry(),changeProposal:undefined};assert.equal(policy.landingCurrentEntry(noProposal),noProposal);
 const g={...entry('TAREA','propuesto',false),changeProposal:{dateISO:'2099-01-01',date:'Futuro',time:'23:00',place:'Destino propuesto'}};
 const current=policy.landingCurrentEntry(g);for(const field of ['dateISO','date','time','duration','place'])assert.equal(current[field],g[field]);
 const blank={...entry(),changeProposal:{...entry().changeProposal,originalTime:'',originalDate:'',originalDateISO:'',originalPlace:''}};
 const empty=policy.landingCurrentEntry(blank);assert.equal(empty.time,'');assert.equal(empty.dateISO,'');assert.equal(empty.place,'','an empty original is not replaced with the proposed destination');
});
const labels={here:'Aquí',late:'Tarde',change:'Cambiar',go_nav:'Ir',call:'Llamar',whatsapp_intro:'GO',at_time:'a las __TIME__'};
const text=node=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
async function mountOperations(g,stacked=false){
 const buttons=new Map(),urls=[],sheets=[],calendar=[],gps=[],toasts=[],refs={current:null};
 const TouchableOpacity=props=>{const label=props.accessibilityLabel||text(props.children);buttons.set(label,props);return React.createElement('button',{'data-testid':label,disabled:!!props.accessibilityState?.disabled},props.children)};
 const context={exports:{},React,entryPhone,renderEntryQuickActions,View:rn.View,Text:rn.Text,TouchableOpacity,LinearGradient:rn.View,Feather:()=>null,
  landingCurrentEntry:policy.landingCurrentEntry,landingActionGrid:layout.landingActionGrid,
  landingPanels:{region:{width:stacked?220:354}},landingPanelInsets:{left:0,right:0},landingStackTransport:stacked,landingFrame:{virtual:stacked},uiScaleFactor:1,uiScale:'estandar',handedness:'right',
  aquiSendingId:null,setAquiSendingId:id=>gps.push(id),Location:{getForegroundPermissionsAsync:async()=>({status:'granted'}),getLastKnownPositionAsync:async()=>({coords:{latitude:1,longitude:2}})},
  Linking:{openURL:async url=>urls.push(url)},normalizePhoneForWhatsApp:n=>n.replace(/\D/g,''),resolveIntentLabel:e=>e.intentLabel,t:k=>labels[k]??k,
  Haptics:{selectionAsync:()=>Promise.resolve()},setLateSheetGo:e=>sheets.push(e),snoozeGoReminder(){throw Error('Must not change a reminder during render')},currentReceivedIdRef:refs,proposalReturnRef:{current:null},setCalOpen(){},calFlow:{open:v=>calendar.push(v)},formatISODate:()=>{throw Error('Must use the original date')},getToday(){},sendSuggestChangeFromCal(){},setTransportPanelH(){},showToast:msg=>toasts.push(msg)};
 const code=`const ${decl(ast,'buildNextAptActions').getText(ast)};const ${decl(ast,'renderLandingOperations').getText(ast)};exports.render=renderLandingOperations;`;
 vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,context);
 const container=document.createElement('div'),root=createRoot(container);
 await React.act(()=>root.render(context.exports.render(g).content));
 return {buttons,urls,sheets,calendar,gps,toasts,refs,container,press:async label=>{const button=buttons.get(label);assert.ok(button,label);await React.act(async()=>{button.onPress();await new Promise(resolve=>setImmediate(resolve));})},close:async()=>React.act(()=>root.unmount())};
}
for(const type of ['GO_BOOKING','TAREA','TAREA_INTERNA'])for(const estado of ['propuesto','propuesta_pendiente'])
 test(`${type} / ${estado}: real rendered callbacks use current date, time and destination`,async()=>{
 const g=entry(type,estado),persisted=JSON.stringify(g),f=await mountOperations(g);try{
  assert.deepEqual(Array.from(f.buttons.keys()),['WhatsApp','Cambiar','Aquí','Llamar','Tarde','Ir','Taxi','Uber','Bolt','T.pub']);
  await f.press('WhatsApp');assert.ok(decodeURIComponent(f.urls.at(-1)).includes('a las 10:00'));assert.ok(!decodeURIComponent(f.urls.at(-1)).includes('16:00'));
  await f.press('Cambiar');assert.equal(f.refs.current,g.id);assert.equal(f.calendar[0].initialDateISO,'2032-03-20');assert.equal(f.calendar[0].initialTime,'10:00');assert.equal(f.calendar[0].initialDuration,'30');assert.equal(f.calendar[0].startAt,'date');
  await f.press('Aquí');assert.ok(decodeURIComponent(f.urls.at(-1)).includes('Cita: Dirección vigente'));assert.ok(!decodeURIComponent(f.urls.at(-1)).includes('Dirección propuesta'));assert.deepEqual(f.gps,[g.id,null]);
  await f.press('Llamar');assert.equal(f.urls.at(-1),'tel:34600111222');
  await f.press('Tarde');assert.equal(f.sheets[0].time,'10:00');assert.equal(f.sheets[0].dateISO,'2032-03-20');assert.equal(f.sheets[0].place,'Dirección vigente');assert.equal(f.sheets[0].id,g.id);
  await f.press('Ir');assert.equal(new URL(f.urls.at(-1)).searchParams.get('query'),'Dirección vigente');
  await f.press('Uber');assert.equal(f.urls.at(-1),'https://m.uber.com');await f.press('Bolt');assert.equal(f.urls.at(-1),'https://bolt.eu');
  await f.press('Taxi');await f.press('T.pub');assert.deepEqual(f.toasts.slice(-2),['toast_taxi_looking','toast_routes_showing']);
  assert.equal(JSON.stringify(g),persisted,'neither mounting nor operating applies the proposed slot or changes payment');
 }finally{await f.close()}
});
test('visits and tasks without proposals keep the same controls; missing contact/destination stays protected',async()=>{
 for(const type of ['GO_BOOKING','TAREA'])for(const stacked of [false,true]){
  const g={...entry(type,'aceptado',false),changeProposal:undefined},f=await mountOperations(g,stacked);try{
   assert.equal(f.buttons.size,10);await f.press('Ir');assert.equal(new URL(f.urls[0]).searchParams.get('query'),g.place);
  }finally{await f.close()}
 }
 const g={...entry('TAREA','propuesto',false),phone:'',whatsapp:'',place:''},f=await mountOperations(g);try{
  assert.ok(!f.buttons.has('WhatsApp')&&!f.buttons.has('Llamar'));assert.equal(f.buttons.get('Ir').accessibilityState.disabled,true);await f.press('Ir');assert.equal(f.urls.length,0);
 }finally{await f.close()}
});
test('one shared operational UI preserves all approved button styles and transport handlers',()=>{
 for(const name of ['renderActBtn','transportControls','row1Btns','row2Btns','actionRows']){assert.equal(typeof approved.declarations[name],'string',name);assert.equal(compact(decl(ast,name).getText(ast)),compact(approved.declarations[name]),name);}
 const grid=a=>find(a,n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(a)==='View'&&n.openingElement.getText(a).includes('landingStackTransport')&&n.getText(a).includes('actionRows.map'));
 assert.equal(compact(grid(ast).getText(ast)),compact(approved.operationsGrid));
 const ops=decl(ast,'renderLandingOperations');assert.ok(ops.getText(ast).includes('landingCurrentEntry(entry)'));
 assert.equal((source.match(/label: "Taxi"/g)||[]).length,1);
 assert.ok(source.includes('const operations = renderLandingOperations(g);'));
 assert.ok(source.includes('{item.kind === "cambio" && renderLandingOperations(item.g).content}'),'unconfirmed HOLD stays in its existing flow');
});
test('approved geometry, controls, authentication and proposal resolution remain unchanged',()=>{
 for(const name of ['landingCloseRect','landingBaseline','landingOrbitTop','landingPanels','humanityBlocks','humanityPlacement','inlineHumanityRect','buildNextAptActions','acceptProposal','rejectProposal','setReservationStatus','sendSuggestChangeFromCal','sendProposalFromList','nextCardPanRef','cambiosCardPanRef','wrapOrbital']){
  const now=decl(ast,name);assert.ok(now,name);assert.equal(typeof approved.declarations[name],'string',name);assert.equal(originalGoProposalContract(priorLandingPosition(now.getText(ast))),approved.declarations[name],name);
 }
 const commands=a=>find(a,n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(a)==='LandingPanelCommands');
 // Only the three explicitly authorized toggles may differ from the approved controls.
 // Mounted lifecycle tests exercise their open/close behavior; keep everything else frozen.
 let currentCommands=commands(ast).getText(ast);
 for(const kind of ['visit','task']){
  const toggle='setNextAptMinimized(!cambiosOpen && !nextAptMinimized && nextPanelKind === "'+kind+'");';
  assert.equal(currentCommands.split(toggle).length,2,'exactly one toggle for '+kind);
  currentCommands=currentCommands.replace(toggle,'setNextAptMinimized(false);');
 }
 assert.equal(currentCommands.split('setCambiosOpen(open => !open);').length,2);
 currentCommands=currentCommands.replace('setCambiosOpen(open => !open);','setCambiosOpen(true);');
 assert.equal(currentCommands,approved.panelCommands,'labels, colors, counts, long press and all other controls stay unchanged');
 const changes=decl(ast,'cardOrigDate');assert.ok(changes);assert.ok(source.includes('[current.date, current.time]'));assert.ok(source.includes('[cp?.date, cp?.time]'));
});
