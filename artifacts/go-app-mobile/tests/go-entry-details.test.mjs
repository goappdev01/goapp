import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fixture} from './helpers/calendar-fixture.mjs';
const require=createRequire(path.join(process.cwd(),'package.json')),ts=require('typescript');
const scope={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('data/goEntryPresentation.ts','utf8'),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);
const presentation=scope.exports;
const nodes=(tree,p)=>tree&&typeof tree==='object'?[...(p(tree)?[tree]:[]),...(tree.children??[]).flatMap(n=>nodes(n,p))]:[];
const texts=tree=>nodes(tree,n=>n.type==='Text').flatMap(n=>n.children).filter(x=>typeof x==='string'||typeof x==='number').join(' ');
const base={id:'one-reservation',reservationId:'11111111-1111-4111-8111-111111111111',businessId:'salon',type:'GO_BOOKING',customerBooking:true,slotKey:'slot',kind:'received',contactName:'Peluquería Nemesi',professionalName:'María José',phone:'+34 600 123 456',whatsapp:'0034 611 123 456',date:'26/10/2030',dateISO:'2030-10-26',time:'12:00',duration:'60min',estado:'aceptado',bookingStatus:'confirmada',color:'#00e5ff',place:'Dirección vigente'};
const sheet=(entry,extra={},fixtureOptions={})=>{const f=fixture(fixtureOptions),c=f.load('components/GoEntryDetails.tsx');return {...f,components:c,tree:f.render(c.GoEntryDetailsSheet,{entry,onClose(){},...extra})};};

test('only awaiting response becomes vivid yellow in the detail and shared change actions',()=>{
 const f=fixture(),c=f.load('components/GoEntryDetails.tsx');
 for(const estado of ['propuesta_pendiente','propuesto']){
  const entry={...base,estado,changeProposal:{dateISO:'2030-10-27',time:'13:00'}};
  const tree=f.render(c.GoEntryDetailsSheet,{entry,onClose(){}}),state=nodes(tree,n=>n.props.testID==='entry-proposal-state')[0];
  assert.equal(texts(state),estado==='propuesto'?'CAMBIO RECIBIDO':'ESPERANDO RESPUESTA');
  assert.equal(state.props.style.color,estado==='propuesto'?'#D1A166':'#FFD700');
  const quick=f.render(c.GoEntryQuickActions,{entry});
  assert.equal(nodes(quick,n=>n.type==='Text'&&texts(n).startsWith('Cambio'))[0].props.style.color,estado==='propuesto'?'#FF8C00':'#FFD700');
 }
});

test('accepted status and professional share a flexible row while date keeps its own row',()=>{
 for(const fontScale of [1,2.8]){
  const entry={...base,professionalName:'Profesional de prueba con un nombre excepcionalmente largo'};
  const f=sheet(entry,{}, {viewport:{width:320,height:568,fontScale}}),row=nodes(f.tree,n=>n.props.testID==='entry-status-professional')[0];
  const dateRow=nodes(f.tree,n=>n.props.testID==='entry-date-professional')[0];
  const date=nodes(dateRow,n=>n.props.testID==='entry-original-date-time')[0],professional=nodes(row,n=>n.props.testID==='entry-professional')[0];
  assert.ok(date&&professional);assert.equal(row.props.style.flexDirection,'row');assert.equal(row.props.style.flexWrap,'wrap');
  assert.equal(nodes(row,n=>n.type==='Text').length,2);
  assert.equal(nodes(dateRow,n=>n.props.testID==='entry-professional').length,0);
  assert.equal(Object.assign({},...professional.props.style).maxWidth,'100%');
  for(const text of [date,professional]){assert.equal(text.props.numberOfLines,undefined);assert.equal(text.props.adjustsFontSizeToFit,undefined);}
  assert.equal(texts(professional).replace(/\s+/g,' '),'Profesional: '+entry.professionalName);assert.equal(texts(date),'Sáb 26/10/2030 · 12:00');
  assert.equal(texts(nodes(f.tree,n=>n.props.testID==='entry-duration')[0]),'Duración: 60 min');
 }
});

test('other reservation states keep the professional beside the date',()=>{
 const entry={...base,estado:'pendiente',bookingStatus:'pendiente'};
 const f=sheet(entry),dateRow=nodes(f.tree,n=>n.props.testID==='entry-date-professional')[0];
 assert.equal(nodes(dateRow,n=>n.props.testID==='entry-professional').length,1);
 assert.equal(nodes(f.tree,n=>n.props.testID==='entry-professional').length,1);
});

test('compact discard stays left of message in both hands and all controls fit a narrow safe width',()=>{
 for(const handedness of ['right','left']){
  let discarded=0;
  const f=sheet(base,{handedness,onDiscard:()=>discarded++,onMessage(){},onGoToLanding(){}},{viewport:{width:320,height:568,fontScale:2.8},insets:{top:47,bottom:34,left:0,right:0}});
  const nav=nodes(f.tree,n=>n.props.testID==='entry-detail-floating-navigation')[0],scroll=nodes(f.tree,n=>n.props.testID==='entry-details-scroll')[0];
  const group=nodes(nav,n=>n.props.testID==='entry-detail-follow-up-controls')[0],trash=nodes(group,n=>n.props.testID==='entry-discard')[0],message=nodes(group,n=>n.props.testID==='entry-message-go')[0];
  assert.equal(group.props.style.flexDirection,'row');assert.equal(group.props.style.gap,8);
  assert.deepEqual(group.children.map(n=>n.props.testID),['entry-discard','entry-message-go']);
  assert.equal(trash.props.style.width,44);assert.equal(trash.props.style.height,44);assert.equal(trash.props.hitSlop,0);assert.equal(trash.props.accessibilityLabel,'Ocultar mi ficha');
  assert.equal(nodes(trash,n=>n.type==='Feather')[0].props.name,'eye-off');assert.equal(nodes(trash,n=>n.type==='Text').length,0);
  assert.equal(nodes(scroll,n=>['entry-discard','entry-message-go'].includes(n.props.testID)).length,0);
  assert.ok(nav.props.width<=285);assert.equal(nav.props.width,44+message.props.style.width+64*2+8*3);
  assert.equal(nav.props.initialTop,undefined);assert.equal(nav.props.initialBottom,11);
  assert.equal(nodes(nav,n=>['Cerrar detalle','Ir directamente al Landing'].includes(n.props.accessibilityLabel)).length,2);
  const controls=f.render(nav.type,{...nav.props,children:nav.children}),outer=nodes(controls,n=>n.type==='View'&&n.props.style?.alignItems==='flex-end'&&n.props.style?.gap===8)[0];
  assert.equal(outer.props.style.flexDirection,handedness==='left'?'row-reverse':'row');
  trash.props.onPress({stopPropagation(){}});assert.equal(discarded,1);
  const actions=f.render(f.components.GoEntryMicroActions,{entry:base,layout:'detail',onDiscard(){},onDone(){},onPending(){}});
  assert.deepEqual(nodes(actions,n=>n.type==='TouchableOpacity').map(n=>n.props.accessibilityLabel),['Mi seguimiento: PENDIENTE','Mi seguimiento: REALIZADA']);
 }
 const absent=sheet(base);assert.equal(nodes(absent.tree,n=>n.props.testID==='entry-discard').length,0);
 let calls=0;const disabled=sheet(base,{onDiscard:()=>calls++,discardDisabled:true}),button=nodes(disabled.tree,n=>n.props.testID==='entry-discard')[0];
 button.props.onPress({stopPropagation(){}});assert.equal(calls,0);assert.equal(button.props.disabled,true);
 const closing=sheet(base,{onDiscard:()=>calls++});nodes(closing.tree,n=>n.props.accessibilityLabel==='Cerrar detalle')[0].props.onPress();nodes(closing.tree,n=>n.props.testID==='entry-discard')[0].props.onPress({stopPropagation(){}});assert.equal(calls,0);
});

test('detail trash retains the existing confirmation and only dispatches personal discard after explicit confirmation',async()=>{
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let resolve;const find=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='resolveEntry')resolve=node.getText(ast);ts.forEachChild(node,find);};find(ast);assert.ok(resolve);
 const alerts=[],discarded=[],closed=[],scope={exports:{},lang:'es',canResolveEntry:()=>true,goLog:[base],Alert:{alert:(...args)=>alerts.push(args)},setLandingDetailsId:id=>closed.push(id),actionCompletion:{discard:async(entry,read)=>discarded.push([entry,read()]),decide(){assert.fail('must not change contractual or follow-up status');}}};
 vm.runInNewContext(ts.transpileModule('const '+resolve+';exports.resolve=resolveEntry;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);
 const f=sheet(base,{onDiscard:()=>scope.exports.resolve(base,'discard')}),trash=nodes(f.tree,n=>n.props.testID==='entry-discard')[0];
 trash.props.onPress({stopPropagation(){}});assert.equal(discarded.length,0);assert.equal(alerts[0][0],'Ocultar mi ficha');assert.match(alerts[0][1],/No se cancela la reserva/);
 assert.equal(alerts[0][2][0].style,'cancel');assert.equal(alerts[0][2][0].onPress,undefined);
 const confirm=alerts[0][2][1];assert.equal(confirm.text,'Ocultar mi ficha');assert.equal(confirm.style,'destructive');confirm.onPress();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(discarded.length,1);assert.equal(discarded[0][0],base);assert.equal(discarded[0][1],base);assert.deepEqual(closed,[null]);
});

test('maps opening errors display the existing error and missing places never invent a destination',async()=>{
 const f=sheet(base,{}, {openURL:async()=>{throw Error('unavailable');}}),go=nodes(f.tree,n=>n.props.testID==='entry-maps-go')[0];
 go.props.onPress();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.urls.length,1);assert.equal(f.alerts.length,1);assert.equal(f.alerts[0][1],'toast_cannot_open_maps');
 for(const place of [undefined,'','  ']){
  const empty=sheet({...base,place});assert.equal(nodes(empty.tree,n=>n.props.testID==='entry-maps-go').length,0);assert.equal(empty.urls.length,0);
 }
 let opened=0;await assert.rejects(presentation.openEntryMaps({place:''},async()=>opened++));assert.equal(opened,0);
});

test('older and new receipts expose the same compact accepted actions, including receipts with only server status',()=>{
 const f=fixture(),c=f.load('components/GoEntryDetails.tsx');
 for(const variant of [{...base,createdAt:1},{...base,createdAt:Date.now()},{...base,bookingStatus:undefined,bookingServerStatus:'CONFIRMED'},{...base,bookingStatus:undefined}]){
  const tree=f.render(c.GoEntryQuickActions,{entry:variant,compact:true,onCancel(){},onPropose(){}});
  assert.deepEqual(nodes(tree,n=>n.type==='TouchableOpacity').map(n=>n.props.accessibilityLabel),['CANCELAR','PROPONER CAMBIO']);
  assert.ok(texts(tree).includes('booking_state_accepted'));assert.equal(nodes(tree,n=>n.props.accessibilityLabel==='ACEPTAR').length,0);
  for(const button of nodes(tree,n=>n.type==='TouchableOpacity')){assert.equal(button.props.style[1].minWidth,0);assert.equal(button.props.style[1].minHeight,36);assert.equal(nodes(button,n=>n.type==='Text')[0].props.numberOfLines,1);}
  for(const button of nodes(tree,n=>n.type==='TouchableOpacity')){assert.equal(button.props.activeOpacity,0.72);assert.ok(button.props.style.at(-1).backgroundColor);assert.equal(button.props.style[0].elevation,2);}
 }
 const terminal=f.render(c.GoEntryQuickActions,{entry:{...base,bookingServerStatus:'REJECTED'},onCancel(){},onPropose(){}});assert.equal(nodes(terminal,n=>n.type==='TouchableOpacity').length,0);
});

test('expanded sheet reserves bottom navigation outside the scroll and places GO message beside Back',()=>{
 let closed=0,message=0;const f=sheet(base,{onClose:()=>closed++,onMessage:()=>message++});
 const modal=nodes(f.tree,n=>n.type==='Modal')[0],footer=nodes(f.tree,n=>n.props.testID==='entry-detail-close-footer')[0],scroll=nodes(f.tree,n=>n.props.testID==='entry-details-scroll')[0];
 assert.equal(modal.props.animationType,'none');assert.equal(footer.props.style.position,undefined);assert.equal(footer.props.style.flexShrink,0);assert.equal(footer.props.style.height,76);assert.equal(footer.props.style.paddingBottom,11);assert.equal(footer.props.style.flexDirection,'row');assert.equal(nodes(scroll,n=>n.props.testID==='entry-detail-close-footer').length,0);assert.equal(scroll.props.contentContainerStyle.paddingBottom,8);assert.equal(scroll.props.keyboardShouldPersistTaps,'handled');assert.equal(nodes(scroll,n=>n.props.testID==='entry-message-go').length,0);
 const nav=nodes(f.tree,n=>n.props.testID==='entry-detail-floating-navigation')[0],close=nodes(f.tree,n=>n.props.accessibilityLabel==='Cerrar detalle')[0],msg=nodes(nav,n=>n.props.testID==='entry-message-go')[0];assert.equal(nav.props.screenKey,'entry-details');assert.equal(nav.props.buttonKey,'navigation-with-message-inset');assert.equal(nav.props.initialTop,undefined,'the reserved footer anchors the group below the scroll');assert.equal(nav.props.initialBottom,11);assert.equal(nav.props.boundsVerticalInset,11);assert.ok(msg);assert.equal(msg.props.accessibilityLabel,'MENSAJE GO');assert.equal(msg.props.accessibilityRole,'button');assert.equal(msg.props.style.height,64);assert.equal(msg.props.activeOpacity,0.82);assert.equal(msg.props.style.borderColor,'#93c5fd');assert.equal(msg.props.style.backgroundColor,'rgba(147,197,253,0.14)');assert.equal(close.props.hitSlop,0);const touch=f.render(close.type,close.props);assert.equal(Object.assign({},...touch.props.style.filter(Boolean)).width,64);assert.equal(Object.assign({},...touch.props.style.filter(Boolean)).height,64);assert.equal(touch.props.delayPressIn,0);touch.props.onPress({stopPropagation(){}});assert.equal(closed,0);modal.props.onDismiss();assert.equal(closed,1);
 for(const handedness of ['right','left']){
  const side=sheet(base,{handedness,onMessage(){},onGoToLanding(){}}, {viewport:{width:320,height:568,fontScale:1}}),sideNav=nodes(side.tree,n=>n.props.testID==='entry-detail-floating-navigation')[0];
  const labels=nodes(sideNav,n=>n.props.testID==='entry-message-go'||['Cerrar detalle','Ir directamente al Landing'].includes(n.props.accessibilityLabel)).map(n=>n.props.testID==='entry-message-go'?'MENSAJE GO':n.props.accessibilityLabel);
  const host=side.render(sideNav.type,{...sideNav.props,children:sideNav.children});
  const row=nodes(host,n=>n.type==='View'&&n.props.style?.alignItems==='flex-end'&&n.props.style?.gap===8)[0];
  assert.equal(row.props.style.flexDirection,handedness==='left'?'row-reverse':'row');
  const visualOrder=handedness==='left'?[...labels].reverse():labels;
  assert.deepEqual(visualOrder,handedness==='right'?['MENSAJE GO','Cerrar detalle','Ir directamente al Landing']:['Ir directamente al Landing','Cerrar detalle','MENSAJE GO']);
  assert.equal(sideNav.props.handedness,handedness);
  assert.ok(sideNav.props.width<=304,'the three controls fit the usable width of a compact iPhone');
 }
 const fresh=sheet(base,{onMessage:()=>message++}),freshMsg=nodes(fresh.tree,n=>n.props.testID==='entry-message-go')[0];freshMsg.props.onPress();fresh.render(fresh.components.GoEntryDetailsSheet,{entry:base,onClose(){},onMessage:()=>message++});nodes(fresh.tree,n=>n.props.testID==='entry-details-modal')[0]?.props.onDismiss();assert.equal(message,1);
});

test('original and proposed booking dates show full local year without changing persisted values',()=>{
 const entry={...base,estado:'propuesta_pendiente',date:'16/11/26',dateISO:'2026-11-16',time:'11:00',bookingTimeline:{timezone:'Pacific/Kiritimati',workMinutes:0,waitMinutes:0,phases:[]},changeProposal:{originalDateISO:'2026-11-16',originalTime:'11:00',date:'20/11/26',dateISO:'2026-11-20',time:'11:11',note:'Cambiar horario',proposedAt:1}};
 const snapshot=JSON.stringify(entry),f=sheet(entry),summary=nodes(f.tree,n=>n.props.testID==='entry-original-date-time')[0],proposal=nodes(f.tree,n=>n.props.testID==='entry-proposed-date-time')[0];
 assert.equal(texts(summary),'Lun 16/11/2026 · 11:00');assert.equal(texts(nodes(f.tree,n=>n.props.testID==='entry-duration')[0]),'Duración: 60 min');assert.equal(texts(proposal).replace(/\s+/g,' '),'Vie 20/11/2026 · 11:11');assert.equal(JSON.stringify(entry),snapshot);
 const info=nodes(f.tree,n=>n.props.testID==='entry-proposal')[0];assert.equal(info.type,'View');assert.equal(info.props.onPress,undefined);assert.equal(info.props.accessibilityRole,undefined);assert.equal(info.props.style.elevation,undefined);assert.ok(info.props.style.borderColor.startsWith('rgba('));
 const presentation=f.load('data/goEntryPresentation.ts');assert.equal(presentation.formatBookingLocalDate('2026-11-16','16/11/26','es','Pacific/Kiritimati'),'Lun 16/11/2026');
 assert.equal(presentation.formatBookingLocalDate(undefined,'','es','America/Los_Angeles','2026-11-16T00:30:00Z'),'Dom 15/11/2026');
});

test('duration adds a readable unit once and never invents an unknown booking duration',()=>{
 for(const raw of ['30','30m','30min','30 min','30 minutos'])assert.equal(presentation.entryDurationLabel(raw),'Duración: 30 min');
 assert.equal(presentation.entryDurationLabel('1h 30min'),'Duración: 1 h 30 min');
 for(const raw of ['', '0', 'unknown'])assert.equal(presentation.entryDurationLabel(raw),null);
 const f=sheet({...base,duration:'unknown'}),summary=nodes(f.tree,n=>n.props.testID==='entry-original-date-time')[0];assert.ok(!texts(summary).includes('Duración:'));
});

test('a proposal from the reservation detail waits for native dismissal before opening the shared flow',()=>{
 for(const source of ['calendar','list']){
  const f=fixture({platform:'ios'}),c=f.load('components/GoEntryDetails.tsx');let closed=0,proposed=0;
  const props={entry:base,onClose:()=>closed++,children:dismissThen=>({type:c.GoEntryQuickActions,props:{entry:base,onPropose:()=>dismissThen(()=>proposed++)},children:[]})};
  let tree=f.render(c.GoEntryDetailsSheet,props);
  const propose=nodes(tree,n=>n.props.accessibilityLabel==='PROPONER CAMBIO')[0];assert.ok(propose,source);
  propose.props.onPress({stopPropagation(){}});
  tree=f.render(c.GoEntryDetailsSheet,props);
  const modal=nodes(tree,n=>n.props.testID==='entry-details-modal')[0];assert.equal(modal.props.visible,false);
  assert.equal(proposed,0,'the calendar cannot open underneath the native detail');
  modal.props.onDismiss();assert.equal(closed,1);assert.equal(proposed,1);
  modal.props.onDismiss();assert.equal(proposed,1,'a duplicate native callback cannot reopen the proposal');
 }
});

test('calendar expanded reservation uses its existing proposal callback after detail dismissal',()=>{
 const f=fixture({now:'2030-10-26T08:00:00',platform:'ios'}),{AgendaBoard}=f.load('components/AgendaOperativa.tsx');let proposed=[];
 const props={goLog:[base],viewMode:'dia',selectedDateISO:base.dateISO,onProposeItem:id=>proposed.push(id)};
 let tree=f.render(AgendaBoard,props);
 nodes(tree,n=>n.props.testID?.startsWith('calendar-entry-open-'))[0].props.onAccessibilityTap();
 tree=f.render(AgendaBoard,props);
 const envelope=nodes(tree,n=>n.props.accessibilityLabel==='booking_state_pending').at(-1);assert.ok(envelope);assert.equal(nodes(envelope,n=>n.type==='Feather')[0].props.name,'mail','the yellow envelope controls Pending status, not GO messaging');
 const proposal=nodes(tree,n=>n.props.accessibilityLabel==='tasks_propose_change').at(-1);
 assert.ok(proposal,'expanded reservation proposal is available');assert.equal(proposal.props.style[1].borderColor,'#FF8C0080');assert.equal(proposal.props.style[1].shadowColor,'#FF8C00');assert.equal(proposal.props.style[1].minHeight,44);proposal.props.onPress();
 tree=f.render(AgendaBoard,props);
 const modal=nodes(tree,n=>n.props.testID==='entry-details-modal')[0];assert.equal(modal.props.visible,false);assert.deepEqual(proposed,[]);
 modal.props.onDismiss();assert.deepEqual(proposed,[base.id]);
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
 const booking={id:base.reservationId,businessId:'salon',customerId:'client',bookableItemId:'cut',startDatetime:'2030-10-26T12:00:00Z',endDatetime:'2030-10-26T13:00:00Z',status:'CONFIRMED',paymentStatus:'none',paymentTermsSnapshot:{totalCents:2500,bookingPercent:10,venuePercent:90,dueAtBookingCents:250,dueAtVenueCents:2250,requestedCents:0,confirmedCents:0},receipt:{customerName:'María López',customerPhone:'+34600123456',businessName:'Peluquería Nemesi',staffName:'Raúl 2'},services:[{id:'cut',title:'Corte',durationMinutes:60,price:25,currency:'EUR'}]};
 const business={id:'salon',name:'Peluquería Nemesi',phone:'+34910123456',whatsapp:'+34699123456',timezone:'UTC',location:'Calle registrada'};
 const user=project(booking,business,{title:'Corte'}),company=biz(booking,business,'owner');
 assert.equal(user.contactName,business.name);assert.equal(company.contactName,'María López');
 assert.equal(company.phone,booking.receipt.customerPhone);assert.notEqual(company.phone,business.phone);
 assert.equal(user.phone,business.phone);assert.equal(user.whatsapp,business.whatsapp);
 assert.equal(user.professionalName,'Raúl 2');assert.equal(user.time,company.time);assert.equal(user.dateISO,company.dateISO);
 assert.equal(company.reservationId,user.reservationId);assert.equal(company.bookingServices[0].title,'Corte');
 assert.equal(user.bookingPaymentTerms.totalCents,2500);assert.equal(company.bookingPaymentTerms.totalCents,2500);assert.equal(user.bookingPaymentStatus,'none');
 assert.equal(biz({...booking,receipt:{customerName:'María López'}},business,'owner').phone,'','no authorized customer phone means no fallback to company');
 assert.equal(project(booking,{...business,phone:'+34910123457'},{title:'Corte'}).phone,'+34910123457');
});
test('WhatsApp and Call open the authorized numbers only on press, never transmit a message automatically',async()=>{
 const f=fixture(),c=f.load('components/GoEntryDetails.tsx'),tree=f.render(c.GoEntryCommunication,{entry:base});
 assert.equal(f.urls.length,0);
  const contacts=['WhatsApp','Llamar'].map(label=>nodes(tree,n=>n.type==='TouchableOpacity'&&n.props.accessibilityLabel===label)[0]);
  assert.ok(contacts.every(Boolean));
  assert.equal(tree.props.style.flexDirection,'row');
  for(const button of contacts){assert.equal(button.props.style[0].flex,1);assert.equal(button.props.style[0].flexBasis,0);assert.equal(button.props.style[0].minHeight,44);assert.equal(button.props.style[1].backgroundColor,'#008754');assert.equal(button.props.style[1].shadowColor,'#000000');assert.equal(nodes(button,n=>n.type==='Text')[0].props.style.color,'#FFFFFF');assert.ok(button.props.onPressIn&&button.props.onPressOut);await button.props.onPress();}
  assert.deepEqual(contacts[0].props.style,contacts[1].props.style,'contact actions share width, border, surface and relief');
 assert.deepEqual(f.urls,['https://wa.me/34611123456','tel:+34600123456']);
 assert.equal(f.render(c.GoEntryCommunication,{entry:{...base,phone:'bad',whatsapp:''}}),null);
});

test('detail contact visibly depresses while held and returns to its neutral shadow on release',()=>{
 const f=fixture(),c=f.load('components/GoEntryDetails.tsx'),props={entry:base};
 let button=nodes(f.render(c.GoEntryCommunication,props),n=>n.props.accessibilityLabel==='WhatsApp')[0];
 button.props.onPressIn();button=nodes(f.render(c.GoEntryCommunication,props),n=>n.props.accessibilityLabel==='WhatsApp')[0];
  assert.equal(button.props.style[1].transform[0].translateY,1);assert.equal(button.props.style[1].elevation,0);
 button.props.onPressOut();button=nodes(f.render(c.GoEntryCommunication,props),n=>n.props.accessibilityLabel==='WhatsApp')[0];
  assert.equal(button.props.style[1].transform[0].translateY,0);assert.equal(button.props.style[1].elevation,1);
});
test('accepted visits offer cancellation and proposal without another acceptance',()=>{
 let cancelled=0,proposed=0,accepted=0;const f=fixture(),c=f.load('components/GoEntryDetails.tsx');
 const tree=f.render(c.GoEntryQuickActions,{entry:base,onCancel:()=>cancelled++,onPropose:()=>proposed++,onAccept:()=>accepted++});
 assert.ok(texts(tree).includes('booking_state_accepted'));assert.equal(accepted,0);
 const buttons=nodes(tree,n=>n.type==='TouchableOpacity');assert.deepEqual(buttons.map(n=>n.props.accessibilityLabel),['CANCELAR','PROPONER CAMBIO']);
 buttons.forEach(b=>b.props.onPress());assert.equal(cancelled,1);assert.equal(proposed,1);assert.equal(accepted,0);
});
test('opened and listed actions share solid semantic surfaces and white labels',()=>{
 const f=fixture(),c=f.load('components/GoEntryDetails.tsx');
 const received={...base,estado:'propuesto',changeProposal:{dateISO:'2030-10-27',date:'27/10/2030',time:'13:30',originalDateISO:base.dateISO,originalTime:base.time}};
 const open=f.render(c.GoEntryQuickActions,{entry:received,onReject(){},onPropose(){},onAccept(){}});
 const listed=f.render(c.GoListActionRow,{actions:[{key:'reject',label:'RECHAZAR',tone:'negative',onPress(){}},{key:'propose',label:'PROPONER',tone:'intermediate',onPress(){}},{key:'accept',label:'ACEPTAR',tone:'positive',onPress(){}}]});
  const actual=nodes(open,n=>n.type==='TouchableOpacity').map(n=>[n.props.style.at(-1).backgroundColor,n.props.style.at(-1).borderColor,n.props.style.at(-1).shadowColor,n.props.style.at(-1).shadowRadius]);
  const expected=nodes(listed,n=>n.type==='TouchableOpacity').map(n=>[n.props.style.backgroundColor,n.props.style.borderColor,n.props.style.shadowColor,n.props.style.shadowRadius]);
 assert.deepEqual(actual,expected);
  assert.deepEqual(actual.map(row=>row[0]),['#D92D32','#C25300','#008754']);
  assert.ok(actual.every(row=>row[2]==='#000000'),'all action shadows remain neutral');
 assert.ok(nodes(open,n=>n.type==='TouchableOpacity').every(n=>nodes(n,x=>x.type==='Text')[0].props.style.color==='#FFFFFF'));
 const pending=f.render(c.GoEntryMicroActions,{entry:{...base,localResolutionStatus:'pending'},onDone(){},onPending(){},onDiscard(){}});
 const done=f.render(c.GoEntryMicroActions,{entry:{...base,localResolutionStatus:'done'},onDone(){},onPending(){},onDiscard(){}});
  assert.equal(nodes(pending,n=>n.props.accessibilityLabel==='Mi seguimiento: PENDIENTE')[0].props.style.backgroundColor,'#D9AD00');
   assert.equal(nodes(nodes(pending,n=>n.props.accessibilityLabel==='Mi seguimiento: PENDIENTE')[0],n=>n.type==='Text')[0].props.style.color,'#181818');
  assert.equal(nodes(done,n=>n.props.accessibilityLabel==='Mi seguimiento: REALIZADA')[0].props.style.backgroundColor,'#008754');
});
test('PENDIENTE uses readable yellow in selected and muted states while PROPONER remains orange',()=>{
  const f=fixture(),c=f.load('components/GoEntryDetails.tsx');
  const luminance=hex=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b;};
  for(const selected of [true,false]){
    const row=f.render(c.GoListActionRow,{actions:[{key:'pending',label:'PENDIENTE',tone:'pending',selectable:true,selected,onPress(){}}]});
    const button=nodes(row,n=>n.type==='TouchableOpacity')[0],text=nodes(button,n=>n.type==='Text')[0];
    assert.equal(button.props.style.backgroundColor,'#FACC15');
    assert.equal(text.props.style.color,'#FFFFFF');
    assert.equal(text.props.style.backgroundColor,'#4A3800');
    assert.ok((luminance(text.props.style.color)+.05)/(luminance(text.props.style.backgroundColor)+.05)>=4.5);
  }
  const landing=f.render(c.GoEntryMicroActions,{entry:{...base,localResolutionStatus:'pending'},pendingYellow:true,onDone(){},onPending(){},onDiscard(){}});
  const landingPending=nodes(landing,n=>n.props.accessibilityLabel==='Mi seguimiento: PENDIENTE')[0];
  assert.equal(landingPending.props.style.backgroundColor,'#FACC15');
  const landingLabel=nodes(landingPending,n=>n.type==='Text')[0];
  assert.equal(landingLabel.props.style.color,'#FFFFFF');
  assert.equal(landingLabel.props.style.backgroundColor,'#4A3800');
  const proposal=f.render(c.GoListActionRow,{actions:[{key:'propose',label:'PROPONER',tone:'intermediate',onPress(){}}]});
  assert.equal(nodes(proposal,n=>n.type==='TouchableOpacity')[0].props.style.backgroundColor,'#C25300');
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
 const gesture=nodes(f.tree,n=>n.props.testID==='entry-details-sheet')[0];assert.equal(scroll.props.onResponderRelease,undefined);assert.ok(gesture.props.onClose);assert.equal(gesture.props.scrollRefs.length,1);
});
test('accepted booking separates verified paid amount from agreed advance and moves IR beside the total',async()=>{
 const quote={totalPrice:75,currency:'EUR',lines:[{itemId:'main',name:'Tinte',charge:65,currency:'EUR'},{itemId:'extra',name:'Ampolla',charge:10,currency:'EUR'}]};
 const terms={totalCents:7500,bookingPercent:10,venuePercent:90,dueAtBookingCents:750,dueAtVenueCents:6750,requestedCents:0,confirmedCents:0};
 const entry={...base,bookingCatalog:quote,bookingPaymentTerms:terms,bookingPaymentStatus:'none'};
 const f=sheet(entry),contract=nodes(f.tree,n=>n.props.testID==='entry-contract')[0],total=nodes(contract,n=>n.props.testID==='entry-contract-total-row')[0],summary=nodes(contract,n=>n.props.testID==='entry-contract-payment-summary')[0];
 assert.ok(total&&summary);assert.equal(nodes(f.tree,n=>n.props.testID==='entry-maps-go').length,1);
 assert.ok(nodes(total,n=>n.props.testID==='entry-maps-go').length===1,'IR sits on the total row');
 assert.match(texts(total),/Total\s*·\s*75,00\s*€/);assert.match(texts(summary),/Pagado\s*·\s*0\s*%\s*·\s*0,00\s*€/);assert.match(texts(summary),/Pendiente\s*·\s*100\s*%\s*·\s*75,00\s*€/);
 const rows=nodes(summary,n=>n.type==='Text');assert.equal(rows[0].props.style.color,'#FFFFFF');assert.equal(rows[1].props.style.color,'#FACC15');
 nodes(total,n=>n.props.testID==='entry-maps-go')[0].props.onPress();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.urls.length,1);
 const unverified=sheet({...entry,bookingPaymentStatus:'paid'});assert.match(texts(nodes(unverified.tree,n=>n.props.testID==='entry-contract-payment-summary')[0]),/Pagado\s*·\s*0\s*%/,'status alone does not prove collection');
 const verified=sheet({...entry,bookingPaymentStatus:'paid',bookingPaymentTerms:{...terms,confirmedCents:750}});
 const settled=nodes(verified.tree,n=>n.props.testID==='entry-contract-payment-summary')[0],amounts=nodes(settled,n=>n.type==='Text');
 assert.match(texts(settled),/Pagado\s*·\s*10\s*%\s*·\s*7,50\s*€/);assert.match(texts(settled),/Pendiente\s*·\s*90\s*%\s*·\s*67,50\s*€/);
 assert.equal(amounts[0].props.style.color,'#22C55E');assert.equal(amounts[1].props.style.color,'#FACC15');
 const mismatched=sheet({...entry,bookingPaymentStatus:'paid',bookingPaymentTerms:{...terms,totalCents:7400,confirmedCents:750}});
 assert.match(texts(nodes(mismatched.tree,n=>n.props.testID==='entry-contract-payment-summary')[0]),/Pagado\s*·\s*0\s*%/);
 const free=sheet({...entry,bookingCatalog:{...quote,totalPrice:0}});assert.equal(nodes(free.tree,n=>n.props.testID==='entry-contract-payment-summary').length,0);
 for(const bookingPercent of [0,100]){
  const mode=sheet({...entry,bookingPaymentTerms:{...terms,bookingPercent,venuePercent:100-bookingPercent,dueAtBookingCents:7500*bookingPercent/100,dueAtVenueCents:7500*(100-bookingPercent)/100}});
  assert.match(texts(nodes(mode.tree,n=>n.props.testID==='entry-contract-payment-summary')[0]),/Pagado\s*·\s*0\s*%.*Pendiente\s*·\s*100\s*%/);
 }
});
test('accepted detail groups heading and three service lines without shrinking text or removing scroll',()=>{
 const entry={...base,bookingCatalog:{totalPrice:85,currency:'EUR',lines:[
  {itemId:'dye',name:'Tinte',charge:45,currency:'EUR'},
  {itemId:'treatment',name:'Tratamiento',charge:30,currency:'EUR'},
  {itemId:'extra',name:'Ampolla',charge:10,currency:'EUR'}]}};
 for(const viewport of [{width:320,height:568,fontScale:1},{width:390,height:844,fontScale:1},{width:390,height:844,fontScale:2.8}]){
  const f=sheet(entry,{}, {viewport}),tree=f.tree;
  const summary=nodes(tree,n=>n.props.testID==='entry-summary')[0],contract=nodes(tree,n=>n.props.testID==='entry-contract')[0];
  const info=nodes(tree,n=>n.props.testID==='entry-details-information')[0],scroll=nodes(tree,n=>n.props.testID==='entry-details-scroll')[0];
  assert.equal(summary.props.style.gap,3);assert.equal(info.props.style.gap,4);assert.equal(contract.props.style.gap,4);
  assert.equal(scroll.props.style.flex,1);assert.equal(scroll.props.alwaysBounceVertical,false);
  const labels=nodes(contract,n=>n.type==='Text');for(const name of ['Tinte','Tratamiento','Ampolla'])assert.ok(texts(contract).includes(name));
  assert.equal(labels.filter(node=>node.props.style===undefined).length,0);
  assert.equal(nodes(contract,n=>n.props.testID==='entry-contract-total-row')[0].props.style.marginTop,4);
  const go=nodes(contract,n=>n.props.testID==='entry-maps-go')[0];assert.ok(go);
  assert.equal(go.props.style.minWidth,76);assert.equal(go.props.style.minHeight,48);
  assert.equal(nodes(tree,n=>n.props.testID==='entry-maps-go').length,1);
  assert.ok(labels.every(node=>node.props.numberOfLines===undefined),'long names remain readable at large text sizes');
 }
 const unrelated=sheet({...entry,bookingStatus:'pendiente'});assert.equal(nodes(unrelated.tree,n=>n.props.testID==='entry-summary')[0].props.style.gap,6);assert.equal(nodes(unrelated.tree,n=>n.props.testID==='entry-contract')[0].props.style.gap,8);
});
for(const type of ['GO_BOOKING','TAREA_INTERNA'])test(`${type}: opening/closing repeatedly preserves closed card geometry, day and canonical record`,()=>{
 const f=fixture({now:'2030-10-26T08:00:00'}),{AgendaBoard}=f.load('components/AgendaOperativa.tsx');
 const entry={...base,type,...(type==='TAREA_INTERNA'?{customerBooking:false,kind:'sent',phone:'',contactName:'',notes:'Tarea registrada'}:{})};
 const saved=JSON.stringify(entry),props={goLog:[entry],viewMode:'dia',selectedDateISO:entry.dateISO};let tree=f.render(AgendaBoard,props);
 const card=t=>nodes(t,n=>n.props.testID?.startsWith('calendar-entry-open-'))[0];const style=JSON.stringify(card(tree).props.style);
 for(let i=0;i<4;i++){
   card(tree).props.onAccessibilityTap();tree=f.render(AgendaBoard,props);assert.ok(nodes(tree,n=>n.props.testID==='entry-details-overlay').length);
   assert.equal(JSON.stringify(card(tree).props.style),style);const close=nodes(tree,n=>n.props.accessibilityLabel==='Cerrar detalle')[0];assert.ok(close);close.props.onPress();nodes(tree,n=>n.props.testID==='entry-details-modal')[0].props.onDismiss();tree=f.render(AgendaBoard,props);
   assert.equal(nodes(tree,n=>n.props.testID==='entry-details-overlay').length,0);assert.equal(props.selectedDateISO,entry.dateISO);assert.equal(props.goLog.length,1);assert.equal(JSON.stringify(entry),saved);
 }
});

test('state colors and negative actions agree in compact and expanded cards without changing category colors',()=>{
 const f=fixture(),c=f.load('components/GoEntryDetails.tsx'),policy=f.load('data/reservationCardPolicy.ts'),original=JSON.stringify(base);
 for(const [status,key,color]of [['pendiente','booking_state_pending','#FFD700'],['confirmada','booking_state_accepted','#22c55e'],['completada','booking_state_completed','#22c55e'],['cancelada','booking_state_cancelled','#FF0000']]){
  const entry={...base,bookingStatus:status};assert.equal(policy.reservationCardPolicy(entry).stateColor,color);assert.equal(policy.reservationCardPolicy(entry).stateKey,key);
  for(const compact of [false,true]){const tree=f.render(c.GoEntryQuickActions,{entry,compact,onCancel(){},onPropose(){}});const state=nodes(tree,n=>n.type==='Text')[0];assert.equal(state.props.style.color,color);
    for(const action of nodes(tree,n=>n.props.accessibilityLabel==='CANCELAR')){assert.equal(action.props.style.at(-1).backgroundColor,'#D92D32');assert.equal(action.props.style.at(-1).borderColor,'rgba(255,255,255,0.22)');}}
 }
 const personal=f.render(c.GoEntryQuickActions,{entry:{...base,localResolutionStatus:'pending'}});assert.ok(texts(personal).includes('booking_state_accepted'));assert.ok(texts(personal).includes('Mi seguimiento:'));
 assert.equal(JSON.stringify(base),original);assert.equal(base.color,'#00e5ff');
});

test('three open microactions match Listados order in both hands without changing their commands',()=>{
  const f=fixture(),{GoEntryMicroActions}=f.load('components/GoEntryDetails.tsx'),saved=JSON.stringify(base);
  for(const handedness of ['right','left']){
    const calls=[];
    const tree=f.render(GoEntryMicroActions,{entry:base,handedness,onDone:()=>calls.push('done'),onPending:()=>calls.push('pending'),onDiscard:()=>calls.push('cancel')});
    const buttons=nodes(tree,n=>n.type==='TouchableOpacity');assert.equal(buttons.length,3);let stopped=0;
    assert.deepEqual(buttons.map(b=>b.props.accessibilityLabel.replace('Mi seguimiento: ','')),handedness==='right'?['ELIMINAR','PENDIENTE','REALIZADA']:['REALIZADA','PENDIENTE','ELIMINAR']);
    buttons.forEach(b=>{assert.equal(b.props.style.minHeight+b.props.hitSlop.top+b.props.hitSlop.bottom,44);assert.equal(b.props.hitSlop.left,0);assert.ok(nodes(b,n=>n.type==='Text').length);assert.equal(nodes(b,n=>n.type==='Feather').length,0);assert.equal(nodes(b,n=>n.type==='Text')[0].props.style.color,b.props.accessibilityLabel.endsWith('PENDIENTE')?'#181818':'#FFFFFF');b.props.onPress({stopPropagation(){stopped++;}});});
    assert.deepEqual(calls,handedness==='right'?['cancel','pending','done']:['done','pending','cancel']);assert.equal(stopped,3);
  }
  assert.equal(JSON.stringify(base),saved);assert.equal(f.render(GoEntryMicroActions,{entry:base}),null);
  const denied=f.render(GoEntryMicroActions,{entry:base,onDiscard(){}});assert.equal(nodes(denied,n=>n.type==='TouchableOpacity').length,1);
});

test('personal ELIMINAR and booking CANCELAR remain distinct destructive actions',()=>{
 const f=fixture(),c=f.load('components/GoEntryDetails.tsx'),calls=[];
 const personal=f.render(c.GoEntryMicroActions,{entry:base,onDiscard:()=>calls.push('hide-personal-card')}),discard=nodes(personal,n=>n.props.accessibilityLabel==='Mi seguimiento: ELIMINAR')[0];assert.ok(discard);assert.match(discard.props.accessibilityHint,/No cancela el compromiso/);
 const reservation=f.render(c.GoEntryQuickActions,{entry:base,onCancel:()=>calls.push('cancel-reservation')});nodes(reservation,n=>n.props.accessibilityLabel==='CANCELAR')[0].props.onPress({stopPropagation(){}});discard.props.onPress({stopPropagation(){}});
 assert.deepEqual(calls,['cancel-reservation','hide-personal-card']);
});

test('expanded short cards push actions towards the useful bottom; long cards still use a single scroll and handed close',()=>{
 for(const handedness of ['left','right']){const f=sheet({...base,detail:'Detail '.repeat(500)},{handedness,onMessage(){}});
  const scroll=nodes(f.tree,n=>n.props.testID==='entry-details-scroll')[0],actions=nodes(scroll,n=>n.props.testID==='entry-details-actions')[0],close=nodes(f.tree,n=>n.props.testID==='entry-detail-close-footer')[0];
  assert.equal(scroll.props.contentContainerStyle.flexGrow,1);assert.equal(actions.props.style.marginTop,'auto');assert.equal(close.props.style.justifyContent,handedness==='left'?'flex-start':'flex-end');assert.equal(scroll.props.contentContainerStyle.paddingBottom,8);assert.equal(close.props.style.flexShrink,0);
 }
 const personal={...base,type:'TAREA_INTERNA',customerBooking:false,kind:'sent',direction:'self',contactName:'',phone:'',whatsapp:''};
 assert.equal(nodes(sheet(personal,{onMessage(){}}).tree,n=>n.props.testID==='entry-message-go').length,0);
});

test('calendar reservation primary heading stays the real counterpart even when older slot metadata is missing',()=>{
 const f=fixture({now:'2030-10-26T08:00:00'}),{AgendaBoard}=f.load('components/AgendaOperativa.tsx');
 for(const entry of [{...base,slotKey:undefined,professionalName:'María',intentLabel:'Corte + Tinte'},{...base,businessBooking:true,customerBooking:false,contactName:'Cliente vinculado',intentLabel:'Corte + Tinte'}]){
  const tree=f.render(AgendaBoard,{goLog:[entry],viewMode:'dia',selectedDateISO:entry.dateISO});
  const card=nodes(tree,n=>n.props.testID?.startsWith('calendar-entry-open-'))[0];assert.ok(texts(card).includes(entry.contactName));assert.ok(!texts(card).includes('Corte + Tinte'));
 }
});

test('calendar compact cards omit follow-up; expanded personal actions and contextual message return to that same detail',()=>{
 const f=fixture({now:'2030-10-26T08:00:00'}),{AgendaBoard}=f.load('components/AgendaOperativa.tsx');let returnTo,resolved=[];
 const props={goLog:[base],viewMode:'dia',selectedDateISO:base.dateISO,canResolveEntry:()=>true,onResolveEntry:(entry,status,current)=>resolved.push([entry.id,status,current().id]),onOpenMessage:(entry,back)=>{assert.equal(entry.id,base.id);returnTo=back;}};
 let tree=f.render(AgendaBoard,props);assert.equal(nodes(tree,n=>n.props.testID==='entry-micro-actions').length,0);
 const card=nodes(tree,n=>n.props.testID?.startsWith('calendar-entry-open-'))[0];card.props.onAccessibilityTap();tree=f.render(AgendaBoard,props);
 const done=nodes(tree,n=>n.props.accessibilityLabel==='Mi seguimiento: REALIZADA')[0];assert.ok(done);done.props.onPress({stopPropagation(){}});assert.deepEqual(resolved,[[base.id,'done',base.id]]);
 nodes(tree,n=>n.props.testID==='entry-message-go')[0].props.onPress();
 tree=f.render(AgendaBoard,props);nodes(tree,n=>n.props.testID==='entry-details-modal')[0]?.props.onDismiss();f.runTimers();assert.equal(typeof returnTo,'function');tree=f.render(AgendaBoard,props);assert.equal(nodes(tree,n=>n.props.testID==='entry-details-overlay').length,0);
 returnTo();tree=f.render(AgendaBoard,props);assert.equal(nodes(tree,n=>n.props.testID==='entry-details-overlay').length,1);assert.equal(props.selectedDateISO,base.dateISO);
});

test('the existing proposal detail distinguishes changed services, professional, duration and price from the intact original',()=>{
 const original={...base,bookingServices:[{id:'cut',title:'Corte original',durationMinutes:30,price:12}],bookingTotalPrice:12,bookingCurrency:'EUR'};
 const selection={serviceIds:['colour','wash'],staffId:'another',professionalName:'Luis',durationMinutes:90,catalogSnapshot:{lines:[{name:'Tinte'},{name:'Lavado'}],totalPrice:32,currency:'EUR'}};
 const entry={...original,estado:'propuesto',changeProposal:{dateISO:'2030-10-27',date:'27/10/2030',time:'13:30',originalDateISO:base.dateISO,originalTime:base.time,selection}},before=JSON.stringify(entry),f=sheet(entry);
 const proposed=nodes(f.tree,n=>n.props.testID==='entry-proposed-selection')[0];assert.ok(proposed);assert.match(texts(proposed),/Tinte/);assert.match(texts(proposed),/Luis/);assert.match(texts(proposed),/90/);assert.match(texts(proposed),/32.00/);
 assert.match(texts(f.tree),/Corte original/);assert.match(texts(f.tree),/12.00/);assert.equal(JSON.stringify(entry),before);
});


test('proposal detail shows only its dynamic date and time below the existing status',()=>{
 for(const fontScale of [1,2.8]){
  const entry={...base,estado:'propuesta_pendiente',changeProposal:{dateISO:'2030-11-23',date:'23/11/2030',time:'10:30',originalDateISO:base.dateISO,originalTime:base.time}};
  const before=JSON.stringify(entry),f=sheet(entry,{}, {viewport:{width:320,height:568,fontScale}});
  const proposed=nodes(f.tree,n=>n.props.testID==='entry-proposed-date-time')[0];
  assert.equal(texts(proposed),'Sáb 23/11/2030 · 10:30');assert.equal(proposed.props.numberOfLines,undefined);
  assert.equal(texts(nodes(f.tree,n=>n.props.testID==='entry-proposal-state')[0]),'ESPERANDO RESPUESTA');
  assert.doesNotMatch(texts(proposed),/Propuesto:|Proposed:/);assert.equal(JSON.stringify(entry),before);
 }
});

test('cancelled Calendar detail keeps the eye-off personal action while follow-up and contractual cancellation stay unavailable',()=>{
 const f=fixture({now:'2030-10-26T08:00:00'}),core=f.load('lib/goActionCompletion.ts'),{AgendaBoard}=f.load('components/AgendaOperativa.tsx');
 const entry={...base,ownerUserId:'A',actionContext:'live:USER',bookingStatus:'cancelada',bookingServerStatus:'CANCELLED'},before=JSON.stringify(entry),scope={userId:'A',context:'live:USER'},resolved=[];
 const canResolveEntry=e=>core.ownedCompletionEntry(e,scope)&&core.completionHideEligible(e);
 const props={goLog:[entry],viewMode:'dia',selectedDateISO:entry.dateISO,canResolveEntry,onResolveEntry:(e,status,read)=>resolved.push([e.id,status,read().id])};
 let tree=f.render(AgendaBoard,props);nodes(tree,n=>n.props.testID?.startsWith('calendar-entry-open-'))[0].props.onAccessibilityTap();tree=f.render(AgendaBoard,props);
 const eye=nodes(tree,n=>n.props.testID==='entry-discard')[0];assert.ok(eye);assert.equal(nodes(eye,n=>n.type==='Feather')[0].props.name,'eye-off');
 assert.equal(nodes(tree,n=>n.props.accessibilityLabel==='Mi seguimiento: REALIZADA').length,0);assert.equal(nodes(tree,n=>n.props.accessibilityLabel==='Mi seguimiento: PENDIENTE').length,0);
 eye.props.onPress({stopPropagation(){}});assert.deepEqual(resolved,[[entry.id,'discard',entry.id]]);assert.equal(JSON.stringify(entry),before);
 assert.equal(canResolveEntry({...entry,ownerUserId:'B'}),false);
 props.goLog=[];tree=f.render(AgendaBoard,props);assert.equal(nodes(tree,n=>n.props.testID==='entry-details-overlay').length,0);
});

test('Deleted detail reuses its bottom control as personal retirement without changing the normal eye-off action',()=>{let retired=0;const entry={...base,deleted:true,bookingStatus:'cancelada'},before=JSON.stringify(entry),f=sheet(entry,{discardFromTrash:true,onDiscard:()=>retired++});const button=nodes(f.tree,n=>n.props.testID==='entry-discard')[0];assert.equal(button.props.accessibilityLabel,'Retirar de Eliminadas');assert.equal(nodes(button,n=>n.type==='Feather')[0].props.name,'trash-2');button.props.onPress({stopPropagation(){}});assert.equal(retired,1);assert.equal(JSON.stringify(entry),before);const normal=sheet(base,{onDiscard(){}});assert.equal(nodes(nodes(normal.tree,n=>n.props.testID==='entry-discard')[0],n=>n.type==='Feather')[0].props.name,'eye-off');});
