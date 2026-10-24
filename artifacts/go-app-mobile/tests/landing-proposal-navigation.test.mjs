import {originalGoProposalContract} from "./helpers/booking-go-contract.mjs";
import { priorLandingPosition } from './helpers/landing-anchor-baseline.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json')),ts=require('typescript');
const {React,createRoot,document,rn}=require('./tests/helpers/react-lifecycle.cjs');
const parse=(file)=>ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const ast=parse('app/index.tsx'),agenda=parse('components/AgendaOperativa.tsx');
const approved=JSON.parse(fs.readFileSync(new URL('./helpers/landing-proposal-baselines.json',import.meta.url),'utf8')).navigation;
function find(n,p){if(p(n))return n;let r;ts.forEachChild(n,c=>{if(!r)r=find(c,p)});return r;}
const decl=(a,name)=>find(a,n=>ts.isVariableDeclaration(n)&&n.name.getText(a)===name);
function load(file,imports={}){const ctx={exports:{},setTimeout:()=>{throw Error('No save or mutation during navigation')},require:n=>n==='react'?React:imports[n]};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx.exports;}
const p=load('components/landing/landingPanels.ts');
class Value{setValue(){} interpolate(){return 0}}
const haptics={selectionAsync:async()=>{},impactAsync:async()=>{},ImpactFeedbackStyle:{Light:'light'}};
const flow=load('hooks/useGoCalendarFlow.tsx',{'react-native':{Animated:{Value,timing:()=>({start:fn=>fn?.()}),spring:()=>({start(){}})}},'expo-haptics':haptics,'@/lib/time':{getToday:()=>new Date('2030-01-01T00:00:00'),formatISODate:()=> '2030-01-01',formatDayLabel:()=>''}});
const proposal=find(ast,n=>ts.isJsxOpeningElement(n)&&n.attributes.properties.some(a=>a.name?.getText(ast)==='testID'&&a.initializer?.getText(ast)==='"landing-proposal-card"'));
const next=find(ast,n=>ts.isJsxOpeningElement(n)&&n.tagName.getText(ast)==='Pressable'&&n.attributes.properties.some(a=>a.name?.getText(ast)==='accessibilityLabel'&&a.initializer?.getText(ast)==='"Tarjeta próxima cita — mantén para opciones avanzadas"'));
assert.ok(proposal&&next);
const attr=(n,name)=>n.attributes.properties.find(a=>a.name?.getText(ast)===name)?.initializer.expression.getText(ast);
const board=find(ast,n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='AgendaBoard');assert.ok(board);
const records=attr(board,'goLog');
const dateSync=find(ast,n=>ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('if (!calFlow.isActive || pendingMoveCtxRef.current) return;')&&n.arguments[0].getText(ast).includes('setDateISODraft'));
assert.ok(dateSync);
const dayNode=find(agenda,n=>ts.isFunctionDeclaration(n)&&n.name?.text==='isInDay');const dayCtx={};vm.runInNewContext(ts.transpileModule(dayNode.getText(agenda),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,dayCtx);
function entry(type='GO_BOOKING',pending=false,moved=false,estado='propuesta_pendiente'){
 return {id:'action-1',type,kind:'sent',estado:pending?estado:'aceptado',dateISO:pending&&moved?'2035-02-22':'2035-01-18',date:pending&&moved?'22 febrero':'18 enero',time:pending&&moved?'16:00':'10:00',duration:'30',place:'Dirección vigente',staffId:'staff-1',slotKey:'slot-1',reservationId:'booking-1',bookingStatus:'confirmada',paymentStatus:'pagada',changeProposal:pending?{dateISO:'2035-02-22',date:'22 febrero',time:'16:00',originalDateISO:'2035-01-18',originalDate:'18 enero',originalTime:'10:00',originalDuration:'30',proposedAt:1}:undefined};
}
async function mountRoute(route,g,kind='cambio'){
 let pressable,snapshot;const writes=[];
 const Pressable=props=>{pressable=props;return React.createElement('button',{disabled:props.disabled},'Ficha')};
 const ctx={exports:{},React,useState:React.useState,useRef:React.useRef,useEffect:React.useEffect,useGoCalendarFlow:flow.useGoCalendarFlow,Pressable,Haptics:haptics,landingCurrentEntry:p.landingCurrentEntry,
  aquiSendingId:null,t:k=>k,formatISODate:()=>{throw Error('Must use the confirmed date')},getToday(){},sendSuggestChangeFromCal:()=>writes.push('save'),capture:v=>snapshot=v,isInDay:dayCtx.isInDay,uiScaleFactor:1,
  goLog:[g,{id:'unrelated',dateISO:'2035-01-19',estado:'aceptado'},{id:'go_booking_prv_forbidden',dateISO:'2035-01-18',estado:'aceptado'}],isUserMode:true,isBusinessMode:false};
 const fixture=`function Fixture(){
 const [calOpen,setCalOpen]=useState(false),[dateISODraft,setDateISODraft]=useState(''),[dateDraft,setDateDraft]=useState(''),[detailsId,setLandingDetailsId]=useState(null);
 const calFlow=useGoCalendarFlow(),currentReceivedIdRef=useRef(null),proposalReturnRef=useRef(null),pendingMoveCtxRef=useRef(null);
 const g=goLog[0],item={kind:${JSON.stringify(kind)},g},cambiosOpen=${route==='changes'};
 const ${decl(ast,'buildNextAptActions').getText(ast)};
 const aChange=buildNextAptActions(landingCurrentEntry(g)).find(a=>a.k==='change');
 ${dateSync.getText(ast)};
 const entries=${records};
 capture({calOpen,detailsId,openCalendar:aChange.fn,dateISODraft,dateDraft,entryId:currentReceivedIdRef.current,flow:calFlow,entries,hits:entries.filter(e=>isInDay(e,dateISODraft))});
 return React.createElement(Pressable,{onPress:${attr(route==='changes'?proposal:next,'onPress')},disabled:${route==='changes'?attr(proposal,'disabled'):'false'}});
 }exports.Fixture=Fixture;`;
 vm.runInNewContext(ts.transpileModule(fixture,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,ctx);
 const container=document.createElement('div'),root=createRoot(container);await React.act(()=>root.render(React.createElement(ctx.exports.Fixture)));
 return {get state(){return snapshot},get disabled(){return pressable.disabled},writes,press:async()=>React.act(()=>pressable.onPress()),calendar:async()=>React.act(()=>snapshot.openCalendar()),close:async()=>React.act(()=>root.unmount())};
}
for(const [route,type,pending] of [['visit','GO_BOOKING',false],['task','TAREA',false],['changes','GO_BOOKING',true]])
 test(route+': card opens detail; existing Calendar action retains confirmed day without saving',async()=>{
 const g=entry(type,pending),saved=JSON.stringify(g);Object.freeze(g);const f=await mountRoute(route,g);try{
  assert.equal(f.state.calOpen,false);await f.press();assert.equal(f.state.calOpen,false);assert.equal(f.state.detailsId,g.id);await f.calendar();assert.equal(f.state.calOpen,true);assert.equal(f.state.entryId,g.id);
  assert.equal(f.state.dateISODraft,'2035-01-18');assert.equal(f.state.flow.dateISO,'2035-01-18');assert.equal(f.state.flow.monthGridYear,2035);assert.equal(f.state.flow.monthGridMonth,0);
  assert.equal(f.state.hits.length,1);assert.equal(f.state.hits[0].id,g.id);assert.equal(f.writes.length,0);assert.equal(JSON.stringify(g),saved);
 }finally{await f.close()}
});
for(const type of ['GO_BOOKING','TAREA'])for(const estado of ['propuesto','propuesta_pendiente'])for(const moved of [false,true])
 test(`${type} / ${estado} / legacy moved=${moved}: original action remains discoverable and opens its existing calendar card`,async()=>{
 const g=entry(type,true,moved,estado),saved=JSON.stringify(g);Object.freeze(g.changeProposal);Object.freeze(g);const f=await mountRoute('changes',g);try{
  await f.press();assert.equal(f.state.detailsId,g.id);assert.equal(f.state.calOpen,false);await f.calendar();assert.equal(f.state.dateISODraft,g.changeProposal.originalDateISO);assert.equal(f.state.flow.monthGridMonth,0);assert.equal(f.state.flow.time,'10:00');
  const found=f.state.hits[0];assert.ok(found);assert.equal(found.id,g.id);assert.equal(found.changeProposal,g.changeProposal);assert.equal(found.estado,estado);assert.equal(found.bookingStatus,'confirmada');assert.equal(found.paymentStatus,'pagada');
  assert.equal(f.state.entries.length,2,'mode filter retained and no duplicate created');assert.equal(f.state.entries[1].id,'unrelated');
  const tap=decl(agenda,'tapThis').initializer.getText(agenda);let expanded=null,detail=null;
  vm.runInNewContext(`(${tap})()`,{Haptics:haptics,item:found,isSelecting:false,isBookingCard:type==='GO_BOOKING',expandedCardId:null,setExpandedCardId:v=>{expanded=typeof v==='function'?v(null):v},setExpandedBookingItem:v=>detail=v});
  assert.equal(expanded,null);assert.equal(detail,found);assert.equal(detail.dateISO,'2035-01-18');
  assert.equal(f.writes.length,0);assert.equal(JSON.stringify(g),saved);
 }finally{await f.close()}
});
test('unconfirmed HOLD is not a navigation target',async()=>{
 const f=await mountRoute('changes',entry(),'hold');try{assert.equal(f.disabled,true);await f.press();assert.equal(f.state.calOpen,false);assert.equal(f.writes.length,0);}finally{await f.close()}
});
test('read projection is restricted to the proposal navigation target; other entries keep identity and permissions',()=>{
 const g=entry('GO_BOOKING',true,true),other={...entry('TAREA',true,true),id:'other-owner',ownerUserId:'owner-2'};
 for(const active of [false,true]){const result=vm.runInNewContext(ts.transpileModule('('+records+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{goLog:[g,other],cambiosOpen:active,currentReceivedIdRef:{current:g.id},landingCurrentEntry:p.landingCurrentEntry,isUserMode:false,isBusinessMode:false});
  assert.equal(result[1],other);assert.equal(result[1].ownerUserId,'owner-2');assert.equal(result[0].dateISO,active?'2035-01-18':g.dateISO);if(!active)assert.equal(result[0],g);
 }
});
test('approved next card, geometry and proposal buttons remain exact; the new tap excludes acceptance controls',()=>{
 const opening = next.getText(ast);
 assert.ok(opening.includes('testID="landing-information-frame"'));
 const frameStyle = vm.runInNewContext('(' + attr(next, 'style') + ')', { uiScaleFactor: 1, nextCardDeleteConfirm: null, g: { id: '1' }, tint: '#60a5fa' })({ pressed: false });
 assert.equal(frameStyle.flexShrink, 0); assert.equal(frameStyle.minHeight, 0);
 assert.equal(opening.replace('setLandingDetailsId(g.id);','if (aChange) aChange.fn();').replace(/^[ \t]*testID="landing-information-frame"\r?\n/m, '').replace(/^[ \t]*flexShrink: 0,\r?\n[ \t]*minHeight: 0,\r?\n/m, '').replace(/\r\n/g, '\n'), approved.nextCardOpening.replace(/\r\n/g, '\n'), 'approved new detail tap is the only change to the existing card opening');
 for(const name of ['buildNextAptActions','landingPanels','landingBaseline','landingCloseRect','humanityPlacement','wrapOrbital','acceptProposal','rejectProposal']){assert.equal(typeof approved.declarations[name],'string',name);assert.equal(originalGoProposalContract(priorLandingPosition(decl(ast,name).getText(ast))),approved.declarations[name],name);}
 const childText=proposal.parent.getText(ast);assert.ok(!childText.includes('<TouchableOpacity'));for(const fn of ['acceptProposal','rejectProposal','openProposalFromList'])assert.ok(!childText.includes(fn));
 const buttons=a=>{const result=[];function walk(n){if(ts.isJsxAttribute(n)&&n.name.getText(a)==='onPress'&&['acceptProposal(item.g.id)','rejectProposal(item.g.id)','setReservationStatus(item.booking.id'].some(fn=>n.initializer?.getText(a).includes(fn)))result.push(n.getText(a));ts.forEachChild(n,walk)}walk(a);return result};assert.deepEqual(buttons(ast),approved.proposalButtonPresses.filter(text=>text.includes('setReservationStatus(item.booking.id')));assert.ok(fs.readFileSync('app/index.tsx','utf8').includes('item.kind === "cambio" && renderEntryQuickActions(item.g, true, true)'),'proposals reuse the tested shared action component');
 const style=vm.runInNewContext('('+attr(proposal,'style')+')',{uiScaleFactor:1});assert.equal(style.gap,2);assert.equal(Object.keys(style).length,1,'no new padding, size, position, color or pressed opacity');
});
