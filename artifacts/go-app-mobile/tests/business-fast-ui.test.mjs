import{test}from'node:test';import assert from'node:assert/strict';import{createRequire}from'node:module';
import{modulePublicationPolicy}from'./helpers/module-publication-fixture.mjs';
const require=createRequire(import.meta.url),{React,createRoot,document,evaluate}=require('./helpers/react-lifecycle.cjs');
const{fixture}=require('./helpers/business-fast-fixture.cjs');const tick=()=>new Promise(setImmediate);
async function mount(){
 const f=fixture(),controls=new Map(),buttons=[],received=[],shareCalls=[],sessionListeners=new Set();let closed=0;
 const host=name=>({children,...props})=>{if(props.testID)controls.set(props.testID,props);if(name==='TouchableOpacity')buttons.push({props,children});return React.createElement('div',{'data-native':name,'data-testid':props.testID},children);};
 class Value{constructor(value){this.value=value;}setValue(value){this.value=value;}interpolate(){return 0;}stopAnimation(){}}
 const animation={start(fn){fn?.({finished:true});},stop(){}};
 const native=new Proxy({Platform:{OS:'ios'},Dimensions:{get:()=>({width:390,height:844})},StyleSheet:{create:v=>v,absoluteFillObject:{}},
  Keyboard:{addListener:()=>({remove(){}}),dismiss(){}},PanResponder:{create:config=>({panHandlers:config})},
  Alert:{alert(){}},Animated:{Value,View:host('Animated.View'),spring:()=>animation,timing:()=>animation,add:()=>0},
  Share:{share:async value=>{shareCalls.push(value);return{action:'dismissedAction'};}},Linking:{openURL:async value=>{shareCalls.push(value);}}},
  {get:(target,key)=>target[key]??host(key)});
 const never=()=>{throw Error('No ordinary customer HOLD/booking/agenda writes in FAST');};
 const booking={...f.bookingApi,getBookableItems:async()=>[f.service],getStaff:async()=>[f.professional],getActivebusinesses:never,searchBusinesses:never,createHold:never,claimSlot:never,cancelBooking:never,computeRefundInfo:()=>({isFree:true}),BookingApiError:Error};
 const services=evaluate('data/bookingServices.ts'),catalog=evaluate('data/catalogAssociations.ts',{'./booking':booking});
 const Selector=({rootIds,onChange})=>{React.useEffect(()=>{onChange(rootIds.length?f.quote:null);},[rootIds.join(',')]);return null;};
 const publication=modulePublicationPolicy.defaultGoModulePublication();
 const{BookingSearchOverlay}=evaluate('components/booking/BookingSearchOverlay.tsx',{
  'react-native':native,'@workspace/api-zod':modulePublicationPolicy,
  '@/hooks/useBookingModulePublication':{useBookingModulePublication:()=>({publication,internalAccess:true})},
  '@react-native-async-storage/async-storage':{default:{getItem:never,setItem:never}},'expo-linear-gradient':{LinearGradient:host('Gradient')},'@expo/vector-icons':{Feather:host('Icon')},
  'expo-haptics':{selectionAsync:async()=>{},impactAsync:async()=>{},notificationAsync:async()=>{},ImpactFeedbackStyle:{Medium:'medium'},NotificationFeedbackType:{Success:'success'}},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})},
  '@/data/booking':booking,'@/data/bookingServices':services,'@/data/bookingTimeline':evaluate('data/bookingTimeline.ts'),
  '@/data/catalogAssociations':catalog,'./CatalogComplementSelector':{CatalogComplementSelector:Selector},
  '@/data/businessFastBooking':f.api,'@/data/bookingConfirmationShare':{officialGoDiscoveryLink:()=>null,bookingConfirmationMessage:()=> 'RESERVA CONFIRMADA',whatsappConfirmationURL:()=>null},
  '@/lib/sessionEvents':{onSessionChanged:fn=>{sessionListeners.add(fn);return()=>sessionListeners.delete(fn);}},
  '@/data/customerBookingProjection':{customerBookingEntry:never},'@/lib/goLogBridge':{syncBookingToGoLog:never},
  '@/data/goRecentBusinesses':{getRecentBusinessIds:never,recordBusinessVisit:never},
  '@/data/goSectorData':{SECTORS:[{id:'belleza',label:'Belleza',color:'#eab308',subs:[{id:'peluqueria',name:'Peluquería'}]}]},'@/data/goSectorTranslations':{trSector:v=>v},
  '@/lib/time':{getToday:()=>new Date('2030-01-07T08:00:00'),formatISODate:d=>d.toISOString().slice(0,10)},
  '@/contexts/LanguageContext':{useLanguage:()=>({lang:'es',t:key=>key})},
 });
 const fast={entry:f.entry,gateway:f.gateway,onConfirmed:booking=>received.push(booking)};
 const element=React.createElement(BookingSearchOverlay,{visible:true,fast,onClose:()=>closed++});
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 await React.act(async()=>{root.render(element);for(let i=0;i<5;i++)await tick();});
 const act=async fn=>React.act(async()=>{fn();for(let i=0;i<5;i++)await tick();});
 const press=async id=>act(()=>controls.get(id).onPress());
 const confirm=()=>buttons.findLast(button=>button.props.onPress?.name==='handleConfirm').props.onPress();
 return{...f,controls,received,shareCalls,press,act,confirm,sessionListeners,get closed(){return closed;},text:()=>container.textContent,
  async close(){await React.act(async()=>root.unmount());document.body.removeChild(container);}};
}
test('FAST renders the EXISTING services, confirmation and confirmed views; no professional/date selection or local HOLD',async()=>{
 const f=await mount();try{
  assert.ok(f.controls.has('booking-service-'+f.serviceId));assert.equal(f.text().includes('NOMBRE DEL CLIENTE'),false);
  await f.press('booking-service-'+f.serviceId);await f.press('booking-save-services');
  assert.ok(f.controls.has('fast-customer-fields'));assert.match(f.text(),/45 min/);assert.match(f.text(),/23/);
  await f.act(()=>f.controls.get('fast-customer-name').onChangeText('Cliente sintético'));
  await f.act(()=>f.confirm());assert.equal(f.received.length,1);assert.equal(f.received[0].customerId,null);
  assert.ok(f.controls.has('booking-confirmed-state'));assert.equal(f.received[0].staffId,f.staffId);
  assert.equal(f.shareCalls.length,0);await f.press('fast-share-confirmation');assert.equal(f.shareCalls.length,1);
 }finally{await f.close();}
});
test('name validation retains the review and optional phone remains optional',async()=>{
 const f=await mount();try{await f.press('booking-service-'+f.serviceId);await f.press('booking-save-services');
  await f.act(()=>f.confirm());assert.equal(f.received.length,0);assert.equal(f.calls.some(c=>c[0]==='commit'),false);
  assert.ok(f.controls.has('fast-booking-error'));assert.ok(f.controls.has('fast-customer-name'));
 }finally{await f.close();}
});
test('private autocomplete fills only a selected business contact and preserves corrected values',async()=>{
 const f=await mount();try{f.setCustomers([{id:f.receiptId,businessId:f.businessId,name:'Ana sintética',phone:'+34000000000'}]);
  await f.press('booking-service-'+f.serviceId);await f.press('booking-save-services');
  await f.act(()=>f.controls.get('fast-customer-name').onChangeText('Ana'));
  await f.press('fast-customer-'+f.receiptId);assert.equal(f.controls.get('fast-customer-phone').value,'+34000000000');
  await f.act(()=>f.controls.get('fast-customer-phone').onChangeText('+34000000001'));
  await f.press('fast-remember-customer');await f.act(()=>f.confirm());
  const saved=f.calls.find(c=>c[0]==='commit')[1];assert.equal(saved.customer.phone,'+34000000001');assert.equal(saved.customer.remember,true);
 }finally{await f.close();}
});
test('server conflict does not show confirmation or clear the customer; a session change removes private data',async()=>{
 const f=await mount();try{await f.press('booking-service-'+f.serviceId);await f.press('booking-save-services');
  await f.act(()=>f.controls.get('fast-customer-name').onChangeText('Conservar'));
  f.setFailure(true);await f.act(()=>f.confirm());assert.equal(f.received.length,0);assert.equal(f.controls.get('fast-customer-name').value,'Conservar');
  await f.act(()=>{f.setIdentity('another-session');for(const listener of f.sessionListeners)listener();});assert.equal(f.closed,1);
  assert.equal(f.text().includes('Conservar'),false);
 }finally{await f.close();}
});
