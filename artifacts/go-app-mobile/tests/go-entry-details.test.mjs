import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fixture} from './helpers/calendar-fixture.mjs';
const require=createRequire(path.join(process.cwd(),'package.json')),ts=require('typescript');
const scope={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('data/goEntryPresentation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);
const presentation=scope.exports;
const nodes=(tree,p)=>tree&&typeof tree==='object'?[...(p(tree)?[tree]:[]),...(tree.children??[]).flatMap(n=>nodes(n,p))]:[];
const texts=tree=>nodes(tree,n=>n.type==='Text').flatMap(n=>n.children).filter(x=>typeof x==='string'||typeof x==='number').join(' ');
const base={id:'one-reservation',reservationId:'11111111-1111-4111-8111-111111111111',businessId:'salon',type:'GO_BOOKING',customerBooking:true,slotKey:'slot',kind:'received',contactName:'Peluquería Nemesi',professionalName:'María José',phone:'+34 600 123 456',whatsapp:'0034 611 123 456',date:'26/10/2030',dateISO:'2030-10-26',time:'12:00',duration:'60min',estado:'aceptado',bookingStatus:'confirmada',color:'#00e5ff',place:'Dirección vigente'};
const sheet=(entry,extra={})=>{const f=fixture(),c=f.load('components/GoEntryDetails.tsx');return {...f,components:c,tree:f.render(c.GoEntryDetailsSheet,{entry,onClose(){},...extra})};};

test('older and new receipts expose the same compact accepted actions, including receipts with only server status',()=>{
 const f=fixture(),c=f.load('components/GoEntryDetails.tsx');
 for(const variant of [{...base,createdAt:1},{...base,createdAt:Date.now()},{...base,bookingStatus:undefined,bookingServerStatus:'CONFIRMED'},{...base,bookingStatus:undefined}]){
  const tree=f.render(c.GoEntryQuickActions,{entry:variant,compact:true,onCancel(){},onPropose(){}});
  assert.deepEqual(nodes(tree,n=>n.type==='TouchableOpacity').map(n=>n.props.accessibilityLabel),['CANCELAR','PROPONER CAMBIO']);
  assert.ok(texts(tree).includes('booking_state_accepted'));assert.equal(nodes(tree,n=>n.props.accessibilityLabel==='ACEPTAR').length,0);
  for(const button of nodes(tree,n=>n.type==='TouchableOpacity')){assert.equal(button.props.style[1].minWidth,0);assert.equal(button.props.style[1].minHeight,36);assert.equal(nodes(button,n=>n.type==='Text')[0].props.numberOfLines,1);}
 }
 const terminal=f.render(c.GoEntryQuickActions,{entry:{...base,bookingServerStatus:'REJECTED'},onCancel(){},onPropose(){}});assert.equal(nodes(terminal,n=>n.type==='TouchableOpacity').length,0);
});

test('expanded sheet closes immediately from a larger floating target outside the scroll and keeps GO message compact',()=>{
 let closed=0,message=0;const f=sheet(base,{onClose:()=>closed++,onMessage:()=>message++,onExit(){}});
 const modal=nodes(f.tree,n=>n.type==='Modal')[0],floating=nodes(f.tree,n=>n.props.testID==='entry-detail-floating-close')[0],scroll=nodes(f.tree,n=>n.props.testID==='entry-details-scroll')[0];
 assert.equal(modal.props.animationType,'none');assert.equal(floating.props.style.position,'absolute');assert.equal(floating.props.style.right+floating.props.style.padding,12);assert.equal(floating.props.style.bottom+floating.props.style.padding,12);assert.equal(floating.props.style.padding,10,'parent bounds admit the full native hitSlop without moving the visible close icon');assert.equal(floating.props.style.flexDirection,'row');assert.equal(nodes(scroll,n=>n.props.testID==='entry-detail-floating-close').length,0);assert.equal(scroll.props.contentContainerStyle.paddingBottom,68);assert.equal(scroll.props.keyboardShouldPersistTaps,'handled');
 const close=nodes(floating,n=>n.props.accessibilityLabel==='Cerrar detalle')[0];assert.equal(close.props.hitSlop,10);const touch=f.render(close.type,close.props);assert.equal(touch.props.delayPressIn,0);touch.props.onPress({stopPropagation(){}});assert.equal(closed,1);
 const msg=nodes(f.tree,n=>n.props.testID==='entry-message-go')[0];assert.equal(msg.props.accessibilityLabel,'MENSAJE GO');assert.equal(msg.props.style.alignSelf,'flex-end');msg.props.onPress();assert.equal(message,1);
});

test('identity suppression is limited to historic placeholders; real business names are kept',()=>{
 assert.equal(presentation.entryIdentity('Cliente DEMO local'),'');assert.equal(presentation.entryIdentity('Cliente DEMO local '),'');
 assert.equal(presentation.entryIdentity('Peluquería DEMO S.L.'),'Peluquería DEMO S.L.');
 assert.equal(presentation.entryHeading({...base,contactName:''},'Reserva'),'Reserva');
});
test('international phones normalize + and 00; malformed or absent numbers offer no action',()=>{
 for(const raw of ['+34 600 123 456','0034 600 123 456','600123456'])assert.equal(presentation.entryPhone(raw),'34600123456');
 assert.equal(presentation.entryPhone('+44 (20) 7946 0123'),'442079460123');
 for(const raw of ['',null,'abc600123456','+000000000','123','+1;alert(1)'])assert.equal(presentation.entryPhone(raw),null);
});
test('the same receipt projects client vs business identity and never calls the company from its client card',()=>{
 const f=fixture(),project=f.load('data/customerBookingProjection.ts').customerBookingEntry,biz=f.load('hooks/useBusinessBookings.ts').businessBookingEntry;
 const booking={id:base.reservationId,businessId:'salon',customerId:'client',bookableItemId:'cut',startDatetime:'2030-10-26T12:00:00Z',endDatetime:'2030-10-26T13:00:00Z',status:'CONFIRMED',receipt:{customerName:'María López',customerPhone:'+34600123456',businessName:'Peluquería Nemesi',staffName:'Raúl 2'},services:[{id:'cut',title:'Corte',durationMinutes:60,price:25,currency:'EUR'}]};
 const business={id:'salon',name:'Peluquería Nemesi',phone:'+34910123456',whatsapp:'+34699123456',timezone:'UTC',location:'Calle registrada'};
 const user=project(booking,business,{title:'Corte'}),company=biz(booking,business,'owner');
 assert.equal(user.contactName,business.name);assert.equal(company.contactName,'María López');
 assert.equal(company.phone,booking.receipt.customerPhone);assert.notEqual(company.phone,business.phone);
 assert.equal(user.phone,business.phone);assert.equal(user.whatsapp,business.whatsapp);
 assert.equal(user.professionalName,'Raúl 2');assert.equal(user.time,company.time);assert.equal(user.dateISO,company.dateISO);
 assert.equal(company.reservationId,user.reservationId);assert.equal(company.bookingServices[0].title,'Corte');
 assert.equal(biz({...booking,receipt:{customerName:'María López'}},business,'owner').phone,'','no authorized customer phone means no fallback to company');
 assert.equal(project(booking,{...business,phone:'+34910123457'},{title:'Corte'}).phone,'+34910123457');
});
test('WhatsApp and Call open the authorized numbers only on press, never transmit a message automatically',async()=>{
 const f=fixture(),c=f.load('components/GoEntryDetails.tsx'),tree=f.render(c.GoEntryCommunication,{entry:base});
 assert.equal(f.urls.length,0);
 for(const label of ['WhatsApp','Llamar']){const button=nodes(tree,n=>n.type==='TouchableOpacity'&&n.props.accessibilityLabel===label)[0];assert.ok(button);await button.props.onPress();}
 assert.deepEqual(f.urls,['https://wa.me/34611123456','tel:+34600123456']);
 assert.equal(f.render(c.GoEntryCommunication,{entry:{...base,phone:'bad',whatsapp:''}}),null);
});
test('accepted visits offer cancellation and proposal without another acceptance',()=>{
 let cancelled=0,proposed=0,accepted=0;const f=fixture(),c=f.load('components/GoEntryDetails.tsx');
 const tree=f.render(c.GoEntryQuickActions,{entry:base,onCancel:()=>cancelled++,onPropose:()=>proposed++,onAccept:()=>accepted++});
 assert.ok(texts(tree).includes('booking_state_accepted'));assert.equal(accepted,0);
 const buttons=nodes(tree,n=>n.type==='TouchableOpacity');assert.deepEqual(buttons.map(n=>n.props.accessibilityLabel),['CANCELAR','PROPONER CAMBIO']);
 buttons.forEach(b=>b.props.onPress());assert.equal(cancelled,1);assert.equal(proposed,1);assert.equal(accepted,0);
});
test('received proposals keep orange identity and the original date until the existing acceptance command',()=>{
 const entry={...base,estado:'propuesto',changeProposal:{dateISO:'2030-10-27',date:'27/10/2030',time:'13:30',originalDateISO:base.dateISO,originalTime:base.time}};
 const saved=JSON.stringify(entry),f=sheet(entry);const frame=nodes(f.tree,n=>n.props.testID==='entry-details-sheet')[0];
 assert.equal(frame.props.style[1].borderColor,'#FF8C00');assert.ok(texts(f.tree).includes('12:00'));assert.ok(texts(f.tree).includes('13:30'));assert.equal(JSON.stringify(entry),saved);
 let accepted=0,rejected=0;const q=f.render(f.components.GoEntryQuickActions,{entry,onPropose(){},onAccept:()=>accepted++,onReject:()=>rejected++});
 nodes(q,n=>n.props.accessibilityLabel==='ACEPTAR')[0].props.onPress();nodes(q,n=>n.props.accessibilityLabel==='RECHAZAR')[0].props.onPress();assert.equal(accepted,1);assert.equal(rejected,1);assert.equal(JSON.stringify(entry),saved);
});
test('internal tasks edit directly; shared accepted tasks propose without marking work completed',()=>{
 const f=fixture(),c=f.load('components/GoEntryDetails.tsx');let edit=0,propose=0;
 const task={...base,type:'TAREA_INTERNA',customerBooking:false,reservationId:undefined,kind:'sent',direction:'self',contactName:'',phone:'',whatsapp:''};
 assert.equal(presentation.entryIsInternal(task),true);
 let tree=f.render(c.GoEntryQuickActions,{entry:task,onEdit:()=>edit++,onPropose:()=>propose++,onCancel(){}});
 nodes(tree,n=>n.props.accessibilityLabel==='MODIFICAR')[0].props.onPress();assert.equal(edit,1);assert.equal(propose,0);
 const shared={...task,type:'TAREA',direction:'outgoing',contactName:'Contacto registrado',phone:'+34600123456'};
 tree=f.render(c.GoEntryQuickActions,{entry:shared,onEdit:()=>edit++,onPropose:()=>propose++,onCancel(){}});
 assert.equal(nodes(tree,n=>n.props.accessibilityLabel==='ACEPTAR').length,0);
 nodes(tree,n=>n.props.accessibilityLabel==='PROPONER CAMBIO')[0].props.onPress();assert.equal(propose,1);assert.equal(shared.localResolutionStatus,undefined);
 assert.equal(presentation.internalEntryCommand('update','2030-10-27','14:15').operation,'update');
});
test('contract shows only booked snapshot lines, included items are not charged twice, long text remains scrollable',()=>{
 const entry={...base,detail:'Información larga '.repeat(300),bookingCatalog:{totalPrice:45,currency:'EUR',lines:[{itemId:'dye',name:'Tinte',charge:45,currency:'EUR'},{itemId:'included',name:'Mascarilla',included:true,charge:0,currency:'EUR'}],options:[{name:'No contratado'}]}};
 const f=sheet(entry),text=texts(f.tree);assert.ok(text.includes('Tinte'));assert.ok(text.includes('Mascarilla'));assert.ok(text.includes('Incluido'));assert.ok(text.includes('45.00 EUR'));assert.ok(!text.includes('No contratado'));
 assert.ok(text.includes(entry.detail));const scroll=nodes(f.tree,n=>n.props.testID==='entry-details-scroll')[0];assert.equal(scroll.props.bounces,false);assert.equal(scroll.props.alwaysBounceVertical,false);assert.equal(scroll.props.style.flex,1);
 const gesture=nodes(f.tree,n=>n.props.testID==='entry-detail-close-gesture')[0];assert.equal(scroll.props.onPanResponderRelease,undefined);assert.ok(gesture.props.onPanResponderRelease);
});
for(const type of ['GO_BOOKING','TAREA_INTERNA'])test(`${type}: opening/closing repeatedly preserves closed card geometry, day and canonical record`,()=>{
 const f=fixture({now:'2030-10-26T08:00:00'}),{AgendaBoard}=f.load('components/AgendaOperativa.tsx');
 const entry={...base,type,...(type==='TAREA_INTERNA'?{customerBooking:false,kind:'sent',phone:'',contactName:'',notes:'Tarea registrada'}:{})};
 const saved=JSON.stringify(entry),props={goLog:[entry],viewMode:'dia',selectedDateISO:entry.dateISO};let tree=f.render(AgendaBoard,props);
 const card=t=>nodes(t,n=>n.type==='TouchableOpacity'&&n.props.activeOpacity===0.85)[0];const style=JSON.stringify(card(tree).props.style);
 for(let i=0;i<4;i++){
   card(tree).props.onPress();tree=f.render(AgendaBoard,props);assert.ok(nodes(tree,n=>n.props.testID==='entry-details-overlay').length);
   assert.equal(JSON.stringify(card(tree).props.style),style);const close=nodes(tree,n=>n.props.accessibilityLabel==='Cerrar detalle')[0];assert.ok(close);close.props.onPress();tree=f.render(AgendaBoard,props);
   assert.equal(nodes(tree,n=>n.props.testID==='entry-details-overlay').length,0);assert.equal(props.selectedDateISO,entry.dateISO);assert.equal(props.goLog.length,1);assert.equal(JSON.stringify(entry),saved);
 }
});

test('state colors and negative actions agree in compact and expanded cards without changing category colors',()=>{
 const f=fixture(),c=f.load('components/GoEntryDetails.tsx'),policy=f.load('data/reservationCardPolicy.ts'),original=JSON.stringify(base);
 for(const [status,key,color]of [['pendiente','booking_state_pending','#FFD700'],['confirmada','booking_state_accepted','#22c55e'],['completada','booking_state_completed','#22c55e'],['cancelada','booking_state_cancelled','#FF0000']]){
  const entry={...base,bookingStatus:status};assert.equal(policy.reservationCardPolicy(entry).stateColor,color);assert.equal(policy.reservationCardPolicy(entry).stateKey,key);
  for(const compact of [false,true]){const tree=f.render(c.GoEntryQuickActions,{entry,compact,onCancel(){},onPropose(){}});const state=nodes(tree,n=>n.type==='Text')[0];assert.equal(state.props.style.color,color);
   for(const action of nodes(tree,n=>n.props.accessibilityLabel==='CANCELAR'))assert.equal(action.props.style.at(-1).borderColor,'#FF0000');}
 }
 const personal=f.render(c.GoEntryQuickActions,{entry:{...base,localResolutionStatus:'pending'}});assert.ok(texts(personal).includes('booking_state_accepted'));assert.ok(texts(personal).includes('Mi seguimiento:'));
 assert.equal(JSON.stringify(base),original);assert.equal(base.color,'#00e5ff');
});

test('three microactions stop propagation, honor supplied permissions and retain the reservation contract',()=>{
 const f=fixture(),{GoEntryMicroActions}=f.load('components/GoEntryDetails.tsx'),calls=[],saved=JSON.stringify(base);
 const tree=f.render(GoEntryMicroActions,{entry:base,onDone:()=>calls.push('done'),onPending:()=>calls.push('pending'),onDiscard:()=>calls.push('cancel')});
 const buttons=nodes(tree,n=>n.type==='TouchableOpacity');assert.equal(buttons.length,3);let stopped=0;
 buttons.forEach(b=>{assert.equal(b.props.hitSlop.top,6);assert.equal(b.props.hitSlop.left,0);b.props.onPress({stopPropagation(){stopped++;}});});
 assert.deepEqual(calls,['done','pending','cancel']);assert.equal(stopped,3);assert.equal(JSON.stringify(base),saved);
 assert.ok(buttons[0].props.accessibilityLabel.includes('Mi seguimiento'));assert.equal(f.render(GoEntryMicroActions,{entry:base}),null);
 const denied=f.render(GoEntryMicroActions,{entry:base,onDiscard(){}});assert.equal(nodes(denied,n=>n.type==='TouchableOpacity').length,1);
});

test('expanded short cards push actions towards the useful bottom; long cards still use a single scroll and handed close',()=>{
 for(const handedness of ['left','right']){const f=sheet({...base,detail:'Detail '.repeat(500)},{handedness,onMessage(){}});
  const scroll=nodes(f.tree,n=>n.props.testID==='entry-details-scroll')[0],actions=nodes(scroll,n=>n.props.testID==='entry-details-actions')[0],close=nodes(f.tree,n=>n.props.testID==='entry-detail-floating-close')[0];
  assert.equal(scroll.props.contentContainerStyle.flexGrow,1);assert.equal(actions.props.style.marginTop,'auto');assert.equal(close.props.style[handedness],2);assert.ok(scroll.props.contentContainerStyle.paddingBottom>=64);
 }
 const personal={...base,type:'TAREA_INTERNA',customerBooking:false,kind:'sent',direction:'self',contactName:'',phone:'',whatsapp:''};
 assert.equal(nodes(sheet(personal,{onMessage(){}}).tree,n=>n.props.testID==='entry-message-go').length,0);
});

test('calendar reservation primary heading stays the real counterpart even when older slot metadata is missing',()=>{
 const f=fixture({now:'2030-10-26T08:00:00'}),{AgendaBoard}=f.load('components/AgendaOperativa.tsx');
 for(const entry of [{...base,slotKey:undefined,professionalName:'María',intentLabel:'Corte + Tinte'},{...base,businessBooking:true,customerBooking:false,contactName:'Cliente vinculado',intentLabel:'Corte + Tinte'}]){
  const tree=f.render(AgendaBoard,{goLog:[entry],viewMode:'dia',selectedDateISO:entry.dateISO});
  const card=nodes(tree,n=>n.type==='TouchableOpacity'&&n.props.activeOpacity===0.85)[0];assert.ok(texts(card).includes(entry.contactName));assert.ok(!texts(card).includes('Corte + Tinte'));
 }
});

test('calendar microactions stay personal and reopening a contextual message returns to that same detail',()=>{
 const f=fixture({now:'2030-10-26T08:00:00'}),{AgendaBoard}=f.load('components/AgendaOperativa.tsx');let returnTo,resolved=[];
 const props={goLog:[base],viewMode:'dia',selectedDateISO:base.dateISO,canResolveEntry:()=>true,onResolveEntry:(entry,status,current)=>resolved.push([entry.id,status,current().id]),onOpenMessage:(entry,back)=>{assert.equal(entry.id,base.id);returnTo=back;}};
 let tree=f.render(AgendaBoard,props);const done=nodes(tree,n=>n.props.accessibilityLabel==='Mi seguimiento: REALIZADA')[0];assert.ok(done);done.props.onPress({stopPropagation(){}});assert.deepEqual(resolved,[[base.id,'done',base.id]]);
 const card=nodes(tree,n=>n.type==='TouchableOpacity'&&n.props.activeOpacity===0.85)[0];card.props.onPress();tree=f.render(AgendaBoard,props);
 nodes(tree,n=>n.props.testID==='entry-message-go')[0].props.onPress();
 f.runTimers();assert.equal(typeof returnTo,'function');tree=f.render(AgendaBoard,props);assert.equal(nodes(tree,n=>n.props.testID==='entry-details-overlay').length,0);
 returnTo();tree=f.render(AgendaBoard,props);assert.equal(nodes(tree,n=>n.props.testID==='entry-details-overlay').length,1);assert.equal(props.selectedDateISO,base.dateISO);
});
