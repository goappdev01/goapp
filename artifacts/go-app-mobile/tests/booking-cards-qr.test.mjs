import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';
import {fixture} from './helpers/calendar-fixture.mjs';
const require=createRequire(path.join(process.cwd(),'package.json')),{React,createRoot,document,ts,evaluate}=require('./tests/helpers/react-lifecycle.cjs');
const transpile=s=>ts.transpileModule(s,{compilerOptions:{ alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const policyScope={exports:{}};vm.runInNewContext(transpile(fs.readFileSync('data/reservationCardPolicy.ts','utf8')),policyScope);const {reservationCardPolicy:policy}=policyScope.exports;
const base={id:'go_booking_a',reservationId:'11111111-1111-4111-8111-111111111111',businessId:'22222222-2222-4222-8222-222222222222',businessBooking:true,type:'GO_BOOKING',staffId:'professional',slotKey:'slot',contactName:'MARÍA JOSÉ',dateISO:'2030-01-07',date:'2030-01-07',time:'10:00',estado:'aceptado',bookingStatus:'confirmada',notes:'Corte',professionalName:'Ana'};
const nodes=(tree,predicate)=>!tree||typeof tree!=='object'?[]:[...(predicate(tree)?[tree]:[]),...(tree.children??[]).flatMap(c=>nodes(c,predicate))];
test('both participants see four canonical controls; a customer cannot confirm the company or invent pending state',()=>{
 for(const businessBooking of [false,true]){
  let proposed,mutated=0;const entry={...base,businessBooking,customerBooking:!businessBooking};
  const card=opened(entry,{onProposeItem:id=>proposed=id,onChangeEstado:()=>mutated++});const {tree}=card;
  for(const label of ['booking_state_pending','booking_state_accepted','booking_state_rejected','tasks_propose_change'])assert.ok(nodes(tree,n=>n.type==='TouchableOpacity' && n.props.accessibilityLabel===label).length);
  const pending=nodes(tree,n=>n.type==='TouchableOpacity' && n.props.accessibilityLabel==='booking_state_pending').at(-1);assert.equal(pending.props.disabled,true);pending.props.onPress();assert.equal(mutated,0);
  nodes(tree,n=>n.type==='TouchableOpacity' && n.props.accessibilityLabel==='tasks_propose_change').at(-1).props.onPress();assert.equal(proposed,undefined);
  nodes(card.render(),n=>n.props.testID==='entry-details-modal')[0].props.onDismiss();assert.equal(proposed,entry.id);
 }
});
const texts=tree=>nodes(tree,n=>n.type==='Text').flatMap(n=>n.children).filter(v=>typeof v==='string');
function opened(entry,callbacks={}){const f=fixture({now:'2030-01-07T08:00:00',platform:'ios'}),{AgendaBoard}=f.load('components/AgendaOperativa.tsx'),props={goLog:[entry],viewMode:'dia',selectedDateISO:'2030-01-07',...callbacks};let tree=f.render(AgendaBoard,props);const body=nodes(tree,n=>n.props.testID==='calendar-entry-open-'+entry.id && texts(n).includes(entry.contactName || 'booking_customer_unknown'))[0];assert.ok(body,'actual booking card is present');body.props.onAccessibilityTap();tree=f.render(AgendaBoard,props);return{tree,render:()=>f.render(AgendaBoard,props),props};}
test('accepted reservations display a green status and never offer initial acceptance twice',()=>{const p=policy(base);assert.equal(p.stateKey,'booking_state_accepted');assert.equal(p.stateColor,'#22c55e');assert.equal(p.canConfirm,false);const {tree}=opened(base,{onConfirmBooking(){}});assert.ok(texts(tree).includes('booking_state_accepted'));assert.ok(nodes(tree,n=>n.props.accessibilityLabel==='booking_state_accepted').filter(n=>n.type==='TouchableOpacity').every(n=>n.props.disabled));});
test('booking detail dispatches orange change and cancellation to existing callbacks, preserving canonical ID',()=>{let proposal,cancel;let card=opened(base,{onProposeItem:id=>proposal=id,onDeleteItem:id=>cancel=id});const button=nodes(card.tree,n=>n.props.accessibilityLabel==='tasks_propose_change').at(-1);assert.equal(button.props.disabled,false);button.props.onPress();assert.equal(proposal,undefined);nodes(card.render(),n=>n.props.testID==='entry-details-modal')[0].props.onDismiss();assert.equal(proposal,base.id);card=opened(base,{onDeleteItem:id=>cancel=id});const cancelButton=nodes(card.tree,n=>n.props.accessibilityLabel==='booking_state_rejected').at(-1);assert.ok(cancelButton);cancelButton.props.onPress();assert.equal(cancel,base.id);});
test('only incoming proposals offer accept/reject, while both sides retain propose-change',()=>{for(const businessBooking of [true,false]){const received={...base,businessBooking,customerBooking:!businessBooking,estado:'propuesto',changeProposal:{id:'p',proposedBy:businessBooking?'customer':'business'}};let accepted,rejected;let card=opened(received,{onAcceptProposal:id=>accepted=id,onRejectProposal:id=>rejected=id,onProposeItem(){}});nodes(card.tree,n=>n.props.accessibilityLabel==='booking_state_accepted').at(-1).props.onPress();assert.equal(accepted,base.id);card=opened(received,{onRejectProposal:id=>rejected=id});nodes(card.tree,n=>n.props.accessibilityLabel==='booking_state_rejected').at(-1).props.onPress();assert.equal(rejected,base.id);assert.equal(policy({...received,estado:'propuesta_pendiente'}).received,false);}});
test('only pending business reservations offer initial acceptance; cancelled/completed cards cannot mutate',()=>{assert.equal(policy({...base,bookingStatus:'pendiente'}).canConfirm,true);assert.equal(policy({...base,businessBooking:false,customerBooking:true,bookingStatus:'pendiente'}).canConfirm,false);let accepted;const {tree}=opened({...base,bookingStatus:'pendiente'},{onConfirmBooking:id=>accepted=id});nodes(tree,n=>n.props.accessibilityLabel==='booking_state_accepted')[0].props.onPress();assert.equal(accepted,base.id);for(const status of ['cancelada','completada']){const p=policy({...base,bookingStatus:status});assert.equal(p.canPropose,false);assert.equal(p.canCancel,false);assert.equal(p.canConfirm,false);}});
test('real customer QR and professional verification are role-scoped; DEMO gets no real credential',()=>{assert.equal(policy({...base,businessBooking:false,customerBooking:true}).canShowQr,true);assert.equal(policy(base).canVerify,true);assert.equal(policy({...base,reservationId:'demo-local'}).canVerify,false);assert.equal(policy({...base,businessBooking:false,customerBooking:true,bookingStatus:'cancelada'}).canShowQr,false);});
test('name is read from authorized receipt, never professional/business labels, with truthful missing-name fallback',()=>{const f=fixture(),{businessBookingEntry}=f.load('hooks/useBusinessBookings.ts'),booking={id:base.reservationId,customerId:'customer',businessId:base.businessId,bookableItemId:'cut',startDatetime:'2030-01-07T10:00:00',endDatetime:'2030-01-07T11:00:00',status:'CONFIRMED'},business={id:base.businessId,name:'Salon',timezone:'UTC',location:''};for(const name of ['RAÚL','MARÍA JOSÉ']){const row=businessBookingEntry({...booking,receipt:{customerName:name,staffName:'Ana',serviceName:'Cut'}},business,'owner');assert.equal(row.contactName,name);assert.equal(row.professionalName,'Ana');assert.equal(row.reservationId,booking.id);}assert.equal(businessBookingEntry(booking,business,'owner').contactName,'');assert.ok(texts(opened({...base,contactName:''}).tree).includes('booking_customer_unknown'));});
test('all booking state and verification labels are translated using the existing ES/EN dictionary',()=>{const scope={exports:{}};vm.runInNewContext(transpile(fs.readFileSync('i18n/translations.ts','utf8')),scope);for(const lang of ['es','en'])for(const key of ['booking_state_accepted','booking_customer_unknown','verification_title','verification_show','verification_confirm_arrival','verification_accept_right'])assert.equal(typeof scope.exports.translations[lang][key],'string');assert.equal(scope.exports.translations.es.booking_state_accepted,'ACEPTADA');});

async function panelFixture({professional=false,granted=true,delay=false,stacked=false,insets={top:47,bottom:34,left:0,right:0},handedness="right"}={}){
 const actions=new Map(),inputs=new Map(),hosts=new Map(),calls=[],timers=[];let camera,session,background,modal,detail,open,user='signed-user',deferred,closed=0;
 const native=name=>props=>{if(name==='Button')actions.set(props.children?.props?.children,props);if(name==='Input')inputs.set(props.accessibilityLabel,props);if(name==='Modal')modal=props;hosts.set(props.testID??name,props);return React.createElement('div',{'data-testid':props.testID},props.children);};
 const nativeModule={View:native('View'),Text:native('Text'),Modal:native('Modal'),KeyboardAvoidingView:native('Keyboard'),ScrollView:native('Scroll'),TouchableOpacity:native('Button'),TextInput:native('Input'),ActivityIndicator:native('Spinner'),StyleSheet:{create:x=>x},Platform:{OS:'ios'},AppState:{addEventListener:(_event,fn)=>{background=fn;return{remove(){}};}},Alert:{alert:(_title,_message,buttons)=>buttons.at(-1).onPress?.()},Share:{share:async()=>{}}};
 const screen=evaluate('components/ui/GoScreenModal.tsx',{'react-native':{...nativeModule,StyleSheet:{absoluteFill:{}}}});
 const scope={exports:{},console,Date,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},require(name){if(name==='react')return React;if(name==='react-native')return nativeModule;if(name==='expo-camera')return{useCameraPermissions:()=>[{granted},async()=>({granted})],CameraView:props=>{camera=props;return React.createElement('div');}};if(name==='react-native-qrcode-svg')return props=>React.createElement('div',null,props.value);if(name==='react-native-safe-area-context')return{useSafeAreaInsets:()=>insets};if(name==='@/contexts/LanguageContext')return{useLanguage:()=>({lang:'es',t:key=>key})};if(name==='@/data/booking')return{getAuthenticatedUserId:async()=>user};if(name==='@/lib/sessionEvents')return{onSessionChanged:fn=>{session=fn;return()=>{};}};if(name==='@/components/ui/GoCloseButton')return{GO_NAVIGATION_SIZE:64,GoCloseButton:native('Close')};if(name==='@/components/ui/GoNavigationFloating')return{GoNavigationFloating:native('Floating')};if(name==='@/components/ui/GoScreenModal')return screen;if(name==='@/data/bookingVerification')return{bookingVerification:async(command,actor)=>{calls.push({command,actor});if(delay)return new Promise(resolve=>{deferred=resolve;});if(command.operation==='preview')return{valid:true,challenge:'ephemeral-challenge',canConfirmArrival:true,customerName:'MARÍA JOSÉ',businessName:'Salon',serviceName:'Cut',startsAt:'2030-01-07T10:00:00Z',timezone:'UTC',arrivalVerified:false};if(command.operation==='arrive')return{valid:true,arrivalVerified:true,customerName:'MARÍA JOSÉ',businessName:'Salon',serviceName:'Cut',startsAt:'2030-01-07T10:00:00Z',timezone:'UTC'};return command.operation==='issue'?{qrPayload:'ephemeral-qr',manualCode:'0123456789ABCDEF0123456789ABCDEF',expiresAt:new Date(Date.now()+600000).toISOString()}:{items:[]};}};throw Error('Unexpected import '+name);}};
 vm.runInNewContext(transpile(fs.readFileSync('components/booking/ReservationVerificationPanel.tsx','utf8')),scope);const container=document.createElement('div'),root=createRoot(container),onClose=()=>closed++;
 const settle=async fn=>React.act(async()=>{await fn?.();for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));});
 function BookingStack(){
  const [details,setDetails]=React.useState(true),[qr,setQr]=React.useState(true);
  open=()=>setQr(true);
  return React.createElement(screen.GoScreenModal,{onRequestClose:()=>{}},details&&React.createElement(screen.GoScreenModal,{onRequestClose:()=>setDetails(false)},
    React.createElement('div',{ref:node=>{if(node)detail=node;}},'DETAIL '+base.reservationId),
    qr&&React.createElement(scope.exports.ReservationVerificationPanel,{bookingId:base.reservationId,handedness,onClose:()=>{onClose();setQr(false);}})));
 }
 await settle(()=>root.render(stacked?React.createElement(BookingStack):React.createElement(scope.exports.ReservationVerificationPanel,{bookingId:professional?undefined:base.reservationId,businessId:professional?base.businessId:undefined,handedness,onClose})));
 return{actions,inputs,hosts,calls,timers,get modal(){return modal;},get detail(){return detail;},open:()=>open(),get content(){return container.textContent;},get camera(){return camera;},get closed(){return closed;},settle,session:()=>session?.(),background:()=>background?.('background'),resolve:response=>deferred?.(response),async close(){await settle(()=>root.unmount());}};
}
test('the actual reservation detail stays selected when its QR is opened, closed and reopened',()=>{
 const entry={...base,businessBooking:false,customerBooking:true}, landing=[];
 const card=opened(entry,{handedness:"left",onGoToLanding:()=>landing.push(true)});
 const show=tree=>nodes(tree,n=>n.props.accessibilityLabel==='verification_show')[0];
 for(let i=0;i<2;i++){
  show(card.render()).props.onPress();
  const tree=card.render(),detail=nodes(tree,n=>n.props.testID==='entry-details-modal')[0];
  const qr=nodes(detail,n=>n.type==='ReservationVerificationPanel')[0];
  assert.ok(qr,'QR is presented from the same detail session');
  assert.equal(qr.props.bookingId,entry.reservationId);assert.equal(qr.props.handedness,'left');
  assert.ok(texts(detail).includes('booking_state_accepted'));
  qr.props.onClose();
  assert.ok(show(card.render()));assert.equal(nodes(card.render(),n=>n.type==='ReservationVerificationPanel').length,0);
 }
 const detail=nodes(card.render(),n=>n.props.testID==='entry-details-modal')[0];
 detail.props.onRequestClose();
 nodes(card.render(),n=>n.props.testID==='entry-details-modal')[0].props.onDismiss();
 assert.equal(nodes(card.render(),n=>n.props.testID==='entry-details-modal').length,0);
 assert.deepEqual(landing,[]);
});

test('reservation QR close lane stays outside scrolling content and button and Back return to the same mounted detail',async()=>{
 for(const handedness of ['left','right']){
  const insets={top:47,bottom:34,left:12,right:19};
  const f=await panelFixture({stacked:true,insets,handedness});
  try{
   const detail=f.detail;
   const lane=f.hosts.get('reservation-qr-close-lane'),floating=f.hosts.get('Floating'),close=f.hosts.get('Close');
   assert.equal(lane.style.height,96);assert.equal(floating.initialTop+64+8,lane.style.height);
   assert.equal(floating.handedness,handedness);assert.equal(floating.safeArea,false);
   assert.equal(f.hosts.get('Keyboard').style.paddingBottom,34);
   assert.equal(f.hosts.get('Keyboard').style.paddingRight,19);
   const [header,scroll,footer]=f.hosts.get('Keyboard').children;
   assert.equal(header.props.children.filter(Boolean).length,1,'only the title remains in the header');
   assert.equal(scroll.props.keyboardShouldPersistTaps,'handled');
   assert.equal(footer.props.testID,'reservation-qr-close-lane');
   assert.equal(footer.props.children.props.children.props.accessibilityLabel,close.accessibilityLabel);
   assert.equal(close.accessibilityLabel,'Cerrar QR de reserva');
   assert.ok(f.content.includes('ephemeral-qr'));
   await f.settle(()=>close.onPress());
   assert.equal(f.detail,detail);assert.ok(f.content.includes('DETAIL'));assert.ok(!f.content.includes('ephemeral-qr'));
   await f.settle(()=>f.open());assert.ok(f.content.includes('ephemeral-qr'));assert.equal(f.detail,detail);
   await f.settle(()=>f.modal.onRequestClose({nativeEvent:{}}));
   assert.equal(f.detail,detail);assert.equal(f.closed,2);assert.ok(!f.content.includes('ephemeral-qr'));assert.ok(f.content.includes('DETAIL'));
   await f.settle(()=>f.modal.onRequestClose({nativeEvent:{}}));
   assert.ok(!f.content.includes('DETAIL'));assert.equal(f.closed,2);
  }finally{await f.close();}
 }
});

test('camera scans only QR, suppresses repeated frames, and explicit arrival is a separate request',async()=>{const f=await panelFixture({professional:true});try{await f.settle(()=>f.actions.get('verification_scan').onPress());assert.deepEqual(Array.from(f.camera.barcodeScannerSettings.barcodeTypes),['qr']);await f.settle(()=>{f.camera.onBarcodeScanned({data:'opaque-token'});f.camera.onBarcodeScanned({data:'opaque-token'});});assert.equal(f.calls.filter(c=>c.command.operation==='preview').length,1);assert.equal(f.calls.filter(c=>c.command.operation==='arrive').length,0);await f.settle(()=>f.actions.get('verification_confirm_arrival').onPress());assert.equal(f.calls.at(-1).command.operation,'arrive');assert.equal(f.calls.at(-1).command.secret,undefined);}finally{await f.close();}});
test('denied camera permission retains the manual alternative without pretending to scan',async()=>{const f=await panelFixture({professional:true,granted:false});try{await f.settle(()=>f.actions.get('verification_scan').onPress());assert.equal(f.camera,undefined);await f.settle(()=>f.inputs.get('verification_manual').onChangeText('0123 4567 89AB CDEF 0123 4567 89AB CDEF'));await f.settle(()=>f.actions.get('verification_check').onPress());assert.equal(f.calls.at(-1).command.operation,'preview');}finally{await f.close();}});
test('temporary QR is removed on expiry/background and late responses cannot restore it after account change',async()=>{let f=await panelFixture();try{assert.ok(f.timers.some(t=>t.ms>590000));assert.ok(f.content.includes('ephemeral-qr'));await f.settle(()=>f.timers.at(-1).fn());assert.ok(!f.content.includes('ephemeral-qr'));await f.settle(()=>f.actions.get('verification_show').onPress());assert.ok(f.content.includes('ephemeral-qr'));await f.settle(()=>f.background());assert.ok(!f.content.includes('ephemeral-qr'));assert.equal(f.inputs.get('verification_invitation').value,'');}finally{await f.close();}f=await panelFixture({delay:true});try{await f.settle(()=>f.session());assert.equal(f.closed,1);await f.settle(()=>f.resolve({qrPayload:'must-not-return'}));assert.equal(f.calls.length,1);assert.ok(!f.content.includes('must-not-return'));}finally{await f.close();}});
test('verification adapter uses current JWT scope and POST body, never URL credentials or storage',async()=>{let user='a',calls=[];const scope={exports:{},Error,require:key=>{assert.equal(key,'./booking');return{getAuthenticatedUserId:async()=>user,supabaseApiRequest:async(...args)=>{calls.push(args);return{valid:true};}};}};vm.runInNewContext(transpile(fs.readFileSync('data/bookingVerification.ts','utf8')),scope);const command={operation:'preview',businessId:base.businessId,secret:'private-capability'};await scope.exports.bookingVerification(command,'a');assert.equal(calls[0][0],'/supabase/booking-verification');assert.equal(calls[0][1].method,'POST');assert.equal(calls[0][3],'a');assert.equal(JSON.parse(calls[0][1].body).secret,'private-capability');user='b';await assert.rejects(scope.exports.bookingVerification(command,'a'),/cuenta/);assert.equal(calls.length,1);});

test('unassigned canonical bookings still open their real booking detail and retain truthful customer identity',()=>{const {tree}=opened({...base,staffId:undefined});assert.ok(texts(tree).includes('MARÍA JOSÉ'));assert.ok(texts(tree).includes('booking_state_accepted'));});

test('display preserves actual terminal server states without changing existing inactive/cancellation semantics',()=>{for(const [server,state] of [['NO_SHOW','booking_state_no_show'],['EXPIRED','booking_state_expired'],['REJECTED','booking_state_rejected']]){const p=policy({...base,bookingStatus:'cancelada',bookingServerStatus:server});assert.equal(p.stateKey,state);assert.equal(p.canCancel,false);assert.equal(p.canPropose,false);}});
