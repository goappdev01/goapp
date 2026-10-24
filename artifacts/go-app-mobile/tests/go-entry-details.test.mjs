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
