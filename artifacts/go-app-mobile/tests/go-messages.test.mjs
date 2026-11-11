import {test} from 'node:test';
import assert from 'node:assert/strict';
import lifecycle from './helpers/react-lifecycle.cjs';
import assistantHarness from './helpers/assistant-tools-fixture.cjs';
const {React,createRoot,document,evaluate,rn,native}=lifecycle;
const bookingId='11111111-1111-4111-8111-111111111111';
const settle=async fn=>React.act(async()=>{await fn?.();for(let i=0;i<20;i++)await Promise.resolve();});
async function fixture({initial=true,context,offline=false,account='customer',platform='ios',contact,businessId,seed=[],handedness='right',height=300,photos,documents,initialMemory=[]}={}){
 const memory=new Map(initialMemory),storage={getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>{memory.set(k,v);},removeItem:async k=>{memory.delete(k);}};
 let owner=account,fail=offline,loseResponse=false,sending=0,attempts=0,closed=0,landings=0,aiOpens=0,keyboardVisible=false;const records=[...seed],events=new Set(),inputs=[],buttons=[],requests=[],appListeners=new Set(),keyboardEvents=new Map(),shares=[],copies=[],pickerCalls=[],scrolls=[];let modalProps,dismissed=0,malformed=false,holdRead=false,releaseRead,legacy=false,locationTools;
 const appState={currentState:'active',addEventListener:(event,fn)=>{appListeners.add(fn);return{remove:()=>appListeners.delete(fn)};}};
 const thread=()=>({id:'booking:'+bookingId,bookingId,businessId:businessId??'salon',counterpartId:owner==='customer'?'business-owner':'customer',contactName:owner==='customer'?'Registered salon':'Registered customer',lastUpdated:1,messages:records.map(x=>({...x,senderId:x.sender===owner?'yo':x.sender})),unread:0});
 const booking={getAuthenticatedUserId:async()=>owner,supabaseApiRequest:async(path,init={},required,expected)=>{
  assert.equal(required,true);assert.equal(expected,owner);if(fail)throw new Error('Servidor no disponible');
  requests.push(path);
  if(path.startsWith('/supabase/booking-conversations')){const row=thread();if(path.includes('scope=')&&!legacy)row.inboxScope=path.includes('scope=business')?'business:'+businessId:'personal';const result=records.length||path.includes('booking_id=')?[row]:[];if(holdRead){holdRead=false;return new Promise(resolve=>{releaseRead=()=>resolve(result);});}return result;}
  const {messageId,text}=JSON.parse(init.body);attempts++;sending++;await Promise.resolve();
  if(!records.some(m=>m.id===messageId))records.push({id:messageId,text,sender:owner,createdAt:1,channel:'go'});sending--;
  if(loseResponse){loseResponse=false;throw new Error('Respuesta de envío perdida');}return malformed?{...thread(),messages:[]}:thread();
 }};
 const data=evaluate('data/goMessages.ts',{'./booking':booking,'@react-native-async-storage/async-storage':storage});
 const places=evaluate('data/contactPlaces.ts',{});
 const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='string'?n:n?.props?text(n.props.children):'';
 class Value{setValue(){}interpolate(){return 0;}}
 const motion={start:fn=>fn?.()};const chain=new Proxy({},{get:()=>()=>chain});
 const NativeView=native('View');const View=props=>{React.useLayoutEffect(()=>{props.onLayout?.({nativeEvent:{layout:{x:10,y:0,width:370,height}}});},[]);return React.createElement(NativeView,props);};
 const keyboard={isVisible:()=>keyboardVisible,dismiss(){keyboardVisible=false;for(const fn of keyboardEvents.get('keyboardDidHide')||[])fn();},addListener:(name,fn)=>{const set=keyboardEvents.get(name)||new Set();set.add(fn);keyboardEvents.set(name,set);return{remove:()=>set.delete(fn)};}};
 const runtime={...rn,AppState:appState,View,Text:native('Text'),Platform:{OS:platform},Keyboard:keyboard,Share:{share:async value=>shares.push(value)},Modal:props=>{modalProps=props;return props.visible?props.children:null;},
   Dimensions:{get:()=>({width:390,height:844})},Easing:{out:x=>x,cubic:0},PanResponder:{create:()=>({panHandlers:{}})},
   Animated:{Value,View,spring:()=>motion,timing:()=>motion},ScrollView:React.forwardRef((props,ref)=>{React.useImperativeHandle(ref,()=>({scrollToEnd:options=>scrolls.push(options)}));return React.createElement(View,props);}),KeyboardAvoidingView:View,
   FlatList:props=>React.createElement(View,null,(props.data||[]).map((item,index)=>React.createElement(React.Fragment,{key:item.id},props.renderItem({item,index})))),
   TextInput:props=>{inputs.push(props);return React.createElement('input',{'data-value':props.value,'data-placeholder':props.placeholder});},
   TouchableOpacity:props=>{buttons.push({...props,label:props.accessibilityLabel||text(props.children)});return React.createElement('button',null,props.children);},
 };
 const railFrames=[];
 const rail=evaluate('components/ui/GoToolRail.tsx',{'react-native':runtime,'@expo/vector-icons':{Feather:()=>null},'@/components/DraggableFAB':{DraggableFAB:props=>{railFrames.push(props);return props.children;}}});
 const messageTools=evaluate('components/messages/MessageTools.tsx',{'react-native':runtime,'@/components/ui/GoToolRail':rail,'@/data/contactPlaces':places,
   'expo-image-picker':{launchImageLibraryAsync:async options=>{pickerCalls.push(['photo',options]);return photos?photos():{canceled:false,assets:[{uri:'file:///private/photo.jpg',fileName:'elegida.jpg',mimeType:'image/jpeg',fileSize:2048}]};}},
   'expo-document-picker':{getDocumentAsync:async options=>{pickerCalls.push(['document',options]);return documents?documents():{canceled:false,assets:[{uri:'file:///private/informe.pdf',name:'informe.pdf',mimeType:'application/pdf',size:4096}]};}},
   'expo-clipboard':{setStringAsync:async value=>copies.push(value)},
 });
 const screen=evaluate('components/MessagesScreen.tsx',{
  '@/components/ui/GoScreenCloseSurface':{GoScreenCloseSurface:View,GoScreenCloseGuide:()=>null},
  '@/data/booking':booking,'@/data/goMessages':data,'@/lib/sessionEvents':{onSessionChanged:fn=>{events.add(fn);return()=>events.delete(fn);}},
  '@/data/contactPlaces':places,'./MessageLocationTools':{MessageLocationTools:props=>{locationTools=props;return null;},
   MessageLocationBubble:props=>React.createElement('span',null,props.place.title)},
  '@/components/ui/GoToolRail':rail,'./messages/MessageTools':messageTools,
  '@react-native-async-storage/async-storage':storage,'@expo/vector-icons':{Feather:()=>null},'./DraggableFAB':{DraggableFAB:({children})=>children},
  'expo-haptics':{selectionAsync:async()=>{},impactAsync:async()=>{},notificationAsync:async()=>{},ImpactFeedbackStyle:{Light:1},NotificationFeedbackType:{Warning:1}},
  '@/contexts/LanguageContext':{useLanguage:()=>({lang:'es',t:key=>key})},'expo-linear-gradient':{LinearGradient:View},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34})},
  'react-native-gesture-handler':{Gesture:{Pan:()=>chain},GestureDetector:({children})=>children},
  'react-native-reanimated':{__esModule:true,default:{View},useSharedValue:v=>React.useRef({value:v}).current,useAnimatedStyle:fn=>fn(),withSpring:v=>v},
  'react-native':runtime,
 });
 let shown=true,initialBookingId=initial?bookingId:undefined;const container=document.createElement('div'),root=createRoot(container);
 const render=()=>{inputs.length=0;buttons.length=0;root.render(React.createElement(screen.MessagesScreen,{visible:shown,handedness,onClose(){closed++;},onGoToLanding(){landings++;},onDismiss(){dismissed++;},recentContacts:[],initialContact:contact,userGoPhone:'',onCreateGo(){aiOpens++;},onPickDeviceContact:async()=>null,initialBookingId,initialContext:context,businessId}));};
 await settle(render);
 const input=()=>inputs.findLast(p=>p.placeholder==='Escribe un mensaje...');
 const send=()=>buttons.findLast(p=>p.label==='msg_send_btn');
 return{memory,records,container,data,requests,shares,copies,pickerCalls,scrolls,railFrames,async press(label){await settle(()=>{const hit=buttons.findLast(p=>p.label===label);assert.ok(hit,label);hit.onPressIn?.();return hit.onPress();});},button:label=>buttons.findLast(p=>p.label===label),async keyboard(){await settle(()=>{keyboardVisible=true;for(const fn of keyboardEvents.get('keyboardDidShow')||[])fn();});},oldServer:()=>{legacy=true;},holdRead:()=>{holdRead=true;},async releaseRead(){await settle(()=>releaseRead());},malformed:()=>{malformed=true;},async foreground(){await settle(()=>{for(const state of ['background','active']){appState.currentState=state;for(const fn of appListeners)fn(state);}});},get dismissed(){return dismissed;},async hide(){shown=false;await settle(render);},async nativeDismiss(){await settle(()=>modalProps.onDismiss());},get closed(){return closed;},get landings(){return landings;},get aiOpens(){return aiOpens;},get attempts(){return attempts;},get input(){return input();},get send(){return send();},get locationTools(){return locationTools;},
  async type(value){await settle(()=>input().onChangeText(value));},async submit(){await settle(()=>send().onPress());},
 async sendLocation(place){let result;await settle(async()=>{result=await locationTools.onSend(place);});return result;},
  async double(){await settle(()=>Promise.all([send().onPress(),send().onPress()]));},fail(v){fail=v;},lose(){loseResponse=true;},
  async account(next){await settle(()=>{owner=next;for(const fn of events)fn();});},
  async general(){initialBookingId=undefined;context=undefined;await settle(render);},
  async landing(){await settle(()=>buttons.findLast(p=>p.accessibilityLabel==='Ir directamente al Landing').onPress());},
  async go(){await settle(()=>buttons.findLast(p=>p.label==='GO').onPress());},
  async back(){await settle(()=>buttons.findLast(p=>p.accessibilityLabel==='Volver a la ficha'||p.accessibilityLabel==='Volver a conversaciones').onPress());},
  async reopen(){context=context?{...context}:undefined;initialBookingId=undefined;await settle(()=>root.render(null));initialBookingId=initial?bookingId:undefined;await settle(render);},
  async close(){await settle(()=>root.unmount());assert.equal(events.size,0);assert.equal(appListeners.size,0);assert.equal(sending,0);}
 };
}
test('booking detail opens the existing GO Communication thread and double tap sends once',async()=>{
 const f=await fixture();try{assert.ok(f.container.textContent.includes('Registered salon'));await f.type('Hello company');await f.double();assert.equal(f.records.length,1);assert.equal(f.attempts,1);assert.equal(f.input.value,'');await f.general();assert.ok(f.container.textContent.includes('Hello company'));}finally{await f.close();}
});
test('offline send preserves text and its scoped draft without displaying fictitious delivery',async()=>{
 const f=await fixture();try{await f.type('Keep this text');f.fail(true);await f.submit();assert.equal(f.records.length,0);assert.equal(f.input.value,'Keep this text');assert.ok(f.container.textContent.includes('Servidor no disponible'));assert.ok([...f.memory.entries()].some(([k,v])=>k.includes('go_message_draft_v1:customer:')&&v==='Keep this text'));f.fail(false);await f.submit();assert.equal(f.records.length,1);assert.equal(f.input.value,'');}finally{await f.close();}
});
test('lost response retries with persisted message ID, including a reloaded outbox, without duplicate delivery',async()=>{
 const f=await fixture();try{await f.type('Exactly once');f.lose();await f.submit();assert.equal(f.records.length,1);assert.equal(f.input.value,'Exactly once');const pending=JSON.parse([...f.memory.entries()].find(([k])=>k.startsWith('go_message_outbox_v1:'))[1]);assert.equal(pending.messageId,f.records[0].id);await f.submit();assert.equal(f.records.length,1);assert.equal(f.attempts,2);}finally{await f.close();}
});
test('account change removes the previous recipient, messages and input from the active screen',async()=>{
 const f=await fixture();try{await f.type('Private draft');await f.account('another-account');const dom=n=>[n,...n.childNodes.flatMap(dom)];assert.equal(dom(f.container).filter(n=>n.attributes?.['data-placeholder']==='Escribe un mensaje...').length,0);assert.ok(!f.container.textContent.includes('Private draft'));assert.ok(f.container.textContent.includes('La sesión ha cambiado'));}finally{await f.close();}
});

const context={actionId:'current-reservation',bookingId,name:'Registered salon',phone:'+34910123456',date:'2030-10-26',time:'12:30',kind:'booking'};
test('offline opening from a reservation keeps its actual recipient, context and composer, then sends through the existing server thread',async()=>{
 const f=await fixture({context,offline:true});try{
  assert.ok(f.container.textContent.includes(context.name));assert.ok(f.container.textContent.includes('Reserva · 2030-10-26 · 12:30'));assert.ok(f.input);assert.ok(f.container.textContent.includes('Servidor no disponible'));
  await f.type('Scoped offline draft');await f.submit();assert.equal(f.records.length,0);assert.equal(f.input.value,'Scoped offline draft');
  await f.reopen();assert.equal(f.input.value,'Scoped offline draft');f.fail(false);await f.double();assert.equal(f.records.length,1);assert.equal(f.attempts,1);assert.equal(f.input.value,'');
  assert.ok(f.container.textContent.includes('Reserva ·'));await f.general();assert.ok(f.container.textContent.includes('Scoped offline draft'));
 }finally{await f.close();}
});
test('business context opens the actual customer immediately and back returns to the source detail callback',async()=>{
 const f=await fixture({context:{...context,name:'Registered customer'},account:'business-owner'});try{assert.ok(f.container.textContent.includes('Registered customer'));assert.ok(f.input);await f.back();assert.equal(f.closed,1);}finally{await f.close();}
});
test('a shared task without an authenticated server relationship preserves its draft and never fakes GO or WhatsApp delivery',async()=>{
 const f=await fixture({initial:false,context:{actionId:'shared-task',name:'Existing participant',phone:'+34600123456',date:'2030-10-26',kind:'task'}});try{
  assert.ok(f.container.textContent.includes('Existing participant'));assert.ok(f.container.textContent.includes('Tarea compartida'));assert.ok(f.input);
  await f.type('Do not simulate delivery');await f.submit();assert.equal(f.records.length,0);assert.equal(f.attempts,0);assert.equal(f.input.value,'Do not simulate delivery');
  assert.ok(f.container.textContent.includes('vínculo de comunicación verificable'));assert.ok([...f.memory.values()].includes('Do not simulate delivery'));
 }finally{await f.close();}
});

for(const platform of ['ios','android'])test(platform+': returning to a reservation waits for native Communication dismissal',async()=>{
 const f=await fixture({platform,context});try{assert.ok(f.input);await f.type('Keep the reservation draft');await f.back();assert.equal(f.dismissed,0);await f.hide();if(platform==='ios'){assert.equal(f.dismissed,0);await f.nativeDismiss();}assert.equal(f.dismissed,1);assert.equal(f.records.length,0);assert.ok([...f.memory.values()].includes('Keep the reservation draft'));}finally{await f.close();}
});

for(const route of ['back','landing'])test('Messages '+route+' keeps the existing reservation thread, sent messages and draft',async()=>{
 const f=await fixture({context});try{await f.type('Mensaje conservado');await f.submit();const before=JSON.stringify(f.records);await f.type('Borrador sin enviar');await f[route]();assert.equal(f.closed,route==='back'?1:0);assert.equal(f.landings,route==='landing'?1:0);assert.equal(JSON.stringify(f.records),before);assert.equal(f.attempts,1);assert.equal(f.input.value,'Borrador sin enviar');assert.ok([...f.memory.values()].includes('Borrador sin enviar'));}finally{await f.close();}
});

test('conversation header retains the actual business and reservation, with no redundant GO, and lower gold GO still opens AI',async()=>{
 const details={...context,name:'GO Peluquería de María'};const f=await fixture({context:details,offline:true});try{const dom=n=>[n,...n.childNodes.flatMap(dom)],header=dom(f.container).find(n=>n.attributes?.['data-testid']==='go-message-header');assert.ok(header);const text=header.textContent.replace(/\u200b/g,'');assert.ok(!text.includes('\\u200b'),'No visible escape sequence is introduced');assert.ok(text.includes(details.name));assert.ok(text.includes(details.date));assert.ok(text.includes(details.time));assert.ok(text.includes(details.phone));assert.equal((text.match(/GO/g)||[]).length,1,'Only the actual business name may contain GO in this header');assert.ok(!text.includes('GP'),'No green initials marker remains');await f.type('Texto para conservar');await f.go();assert.equal(f.aiOpens,1);assert.equal(f.closed,0);assert.equal(f.landings,0);assert.equal(f.input.value,'Texto para conservar');assert.equal(f.records.length,0);}finally{await f.close();}
});

test('non-GO conversation header keeps its existing WA identification and contact unchanged',async()=>{const contact={name:'Existing contact',phone:'+34600123456'},f=await fixture({initial:false,contact});try{const dom=n=>[n,...n.childNodes.flatMap(dom)],header=dom(f.container).find(n=>n.attributes?.['data-testid']==='go-message-header');assert.ok(header);assert.ok(header.textContent.includes(contact.name));assert.ok(header.textContent.includes(contact.phone));assert.ok(header.textContent.includes('WA'));assert.equal(f.records.length,0);}finally{await f.close();}});

test('foreground refresh receives an incoming reply in the same thread without losing the composer draft',async()=>{
 const f=await fixture();try{
  await f.type('Unsent draft');f.records.push({id:'remote-one',text:'Incoming company reply',sender:'business-owner',createdAt:2,channel:'go'});
  await f.foreground();assert.ok(f.container.textContent.includes('Incoming company reply'));assert.equal(f.input.value,'Unsent draft');
 }finally{await f.close();}
});
test('message IDs scoped to two different authors render with unique React keys',async()=>{
 const f=await fixture({seed:[{id:'same-id',sender:'customer',text:'Customer message',createdAt:1,channel:'go'},{id:'same-id',sender:'business-owner',text:'Company message',createdAt:1,channel:'go'}]});
 try{assert.ok(f.container.textContent.includes('Customer message'));assert.ok(f.container.textContent.includes('Company message'));
  const customer=(await f.data.readBookingConversations('customer',bookingId))[0].messages.map(m=>m.text);await f.account('business-owner');
  const business=(await f.data.readBookingConversations('business-owner',bookingId))[0].messages.map(m=>m.text);assert.deepEqual(customer,business);
 }finally{await f.close();}
});
test('a slow foreground read cannot overwrite a newer confirmed outgoing message',async()=>{
 const f=await fixture();try{f.holdRead();await f.foreground();await f.type('Newest confirmed message');await f.submit();await f.releaseRead();
  assert.ok(f.container.textContent.includes('Newest confirmed message'));assert.equal(f.input.value,'');
 }finally{await f.close();}
});
test('the business inbox refreshes on foreground and forwards only its selected business context',async()=>{
 const f=await fixture({initial:false,businessId:bookingId,account:'business-owner'});try{
  assert.ok(f.requests.some(path=>path.includes('scope=business')&&path.includes('business_id='+bookingId)));
  f.records.push({id:'remote-one',text:'Incoming customer request',sender:'customer',createdAt:2,channel:'go'});
  await f.foreground();assert.ok(f.container.textContent.includes('Incoming customer request'));
 }finally{await f.close();}
});
test('HTTP success without the persisted outgoing message is unconfirmed and retains draft and retry key',async()=>{
 const f=await fixture();try{
  await f.type('Do not fake delivery');f.malformed();await f.submit();
  assert.equal(f.input.value,'Do not fake delivery');assert.ok(f.container.textContent.includes('No se confirmó la persistencia'));
  assert.ok([...f.memory.keys()].some(key=>key.startsWith('go_message_outbox_v1:')));
 }finally{await f.close();}
});
test('an older API which ignores the inbox scope cannot expose a mixed personal/company inbox',async()=>{
 const f=await fixture({businessId:bookingId});try{
  f.oldServer();f.records.push({id:'existing',text:'Existing authorized thread',sender:'customer',createdAt:1,channel:'go'});
  await assert.rejects(f.data.readBookingConversations('customer',undefined,bookingId),/contexto de esta bandeja/);
 }finally{await f.close();}
});
test('direct concurrent delivery shares one durable retry and draft clearing cannot erase a newer edit',async()=>{
 const f=await fixture();try{
  await Promise.all([f.data.deliverBookingMessage('customer',bookingId,'Same message'),f.data.deliverBookingMessage('customer',bookingId,'Same message')]);
  assert.equal(f.attempts,1);assert.equal(f.records.length,1);
  const id='booking:'+bookingId;
  await Promise.all([f.data.saveBookingMessageDraft('customer',id,'Old'),f.data.saveBookingMessageDraft('customer',id,'New')]);
  await f.data.clearBookingMessageDraft('customer',id,'Old');
  assert.equal(await f.data.loadBookingMessageDraft('customer',id),'New');
  assert.equal(await f.data.loadBookingMessageDraft('other',id),'');
 }finally{await f.close();}
});

const sharedPlace={title:'Lugar de prueba',source:'current',coordinates:{latitude:40.4,longitude:-3.7}};
test('an unverified conversation cannot send a location or create a local delivered bubble',async()=>{
 const f=await fixture({context,offline:true});
 try{
  assert.equal(f.locationTools.canSend,false);
  assert.equal(await f.sendLocation(sharedPlace),false);
  assert.equal(f.attempts,0);
  assert.equal(f.records.length,0);
 }finally{await f.close();}
});

test('a confirmed location uses the authorized booking thread and preserves the ordinary draft',async()=>{
 const sender=await fixture();
 try{
  await sender.type('Mi borrador');
  assert.equal(sender.locationTools.canSend,true);
  sender.lose();
  await assert.rejects(sender.sendLocation(sharedPlace),/perdida/);
  assert.equal(sender.records.length,1);
  assert.equal(await sender.sendLocation(sharedPlace),true);
  assert.equal(sender.records.length,1);
  assert.equal(sender.input.value,'Mi borrador');
  assert.ok(sender.requests.includes('/supabase/bookings/'+bookingId+'/messages'));
  const receiver=await fixture({account:'business-owner',seed:sender.records});
  try{assert.ok(receiver.container.textContent.includes(sharedPlace.title));}
  finally{await receiver.close();}
 }finally{await sender.close();}
});

test('photo and document previews stay local, removable and never travel through the text-only transport',async()=>{
 const f=await fixture();try{
  assert.equal(f.button('Mostrar herramientas de mensajes').accessibilityState.expanded,false);
  await f.type('Borrador con adjuntos');await f.press('Mostrar herramientas de mensajes');
  await f.press('Fotografía / imagen');await f.press('Archivo / documento');
  assert.equal(f.pickerCalls.length,2);assert.ok(f.container.textContent.includes('elegida.jpg'));assert.ok(f.container.textContent.includes('informe.pdf'));
  assert.ok(f.container.textContent.includes('application/pdf'));assert.ok(f.container.textContent.includes('4 KB'));
  assert.ok(!f.container.textContent.includes('file:///private'));assert.ok(![...f.memory.values()].some(value=>value.includes('file:///private')));
  assert.equal(f.send.disabled,true);await f.submit();assert.equal(f.records.length,0);assert.equal(f.attempts,0);assert.equal(f.input.value,'Borrador con adjuntos');
  assert.ok(f.container.textContent.includes('No disponible hasta activar la conversación compartida'));
  await f.press('Ocultar herramientas de mensajes');assert.equal(f.input.value,'Borrador con adjuntos');
  await f.press('Retirar elegida.jpg');await f.press('Retirar informe.pdf');assert.equal(f.send.disabled,false);
  await f.submit();assert.equal(f.records.length,1);assert.equal(f.records[0].text,'Borrador con adjuntos');
 }finally{await f.close();}
});

test('native picker cancellation and denied access preserve the ordinary draft without transport side effects',async()=>{
 const f=await fixture({photos:async()=>{throw Error('Permission denied');},documents:async()=>({canceled:true})});try{
  await f.type('Texto intacto');await f.press('Mostrar herramientas de mensajes');await f.press('Fotografía / imagen');
  assert.ok(f.container.textContent.includes('No se pudo abrir el selector'));await f.press('Archivo / documento');
  assert.equal(f.input.value,'Texto intacto');assert.equal(f.attempts,0);assert.equal(f.send.disabled,false);
 }finally{await f.close();}
});

for(const route of ['account','hide','general'])test('pending native selection cannot enter another editor after '+route,async()=>{
 let release;const f=await fixture({photos:()=>new Promise(resolve=>release=resolve)});try{
  await f.type('Borrador privado');await f.press('Mostrar herramientas de mensajes');await f.press('Fotografía / imagen');
  if(route==='account')await f.account('other-account');else await f[route]();
  await settle(()=>release({canceled:false,assets:[{uri:'file:///private/stale.jpg',fileName:'stale.jpg',mimeType:'image/jpeg'}]}));
  assert.ok(!f.container.textContent.includes('stale.jpg'));assert.equal(f.attempts,0);
 }finally{await f.close();}
});

test('sharing requires explicit selection and exports only that message text without conversation metadata',async()=>{
 const seed=[{id:'first',sender:'customer',text:'Primer texto privado',createdAt:1,channel:'go'},{id:'second',sender:'business-owner',text:'Solo este texto',createdAt:2,channel:'go'}];
 const f=await fixture({context,seed});try{
  await f.type('Borrador que no se comparte');await f.press('Mostrar herramientas de mensajes');await f.press('Compartir mensaje');
  assert.equal(f.shares.length,0);assert.equal(f.copies.length,0);await f.press('Seleccionar mensaje 2');assert.equal(f.shares.length,0);
  await f.press('Compartir este mensaje');assert.equal(JSON.stringify(f.shares),JSON.stringify([{message:'Solo este texto'}]));
  await f.press('Copiar este mensaje');assert.deepEqual(f.copies,['Solo este texto']);
  assert.equal(f.input.value,'Borrador que no se comparte');assert.equal(f.attempts,0);assert.equal(f.records.length,2);
  await f.account('other-account');assert.ok(!f.container.textContent.includes('Solo este texto'));
 }finally{await f.close();}
});

test('an unavailable general contact cannot manufacture delivery or share nonexistent messages and retains its scoped draft on reopen',async()=>{
 const f=await fixture({initial:false,contact:{name:'Contacto local',phone:'+34000000000'}});try{
  await f.type('Sin enviar');assert.equal(f.send.disabled,true);await f.submit();assert.equal(f.attempts,0);assert.equal(f.records.length,0);
  assert.equal(f.input.value,'Sin enviar');await f.press('Mostrar herramientas de mensajes');assert.equal(f.button('Compartir mensaje').disabled,true);
  await f.reopen();assert.equal(f.input.value,'Sin enviar');assert.ok(f.container.textContent.includes('No disponible hasta activar la conversación compartida'));
 }finally{await f.close();}
});

test('unscoped legacy contacts are preserved on disk but never shown to a different account',async()=>{
 const legacy=JSON.stringify([{id:'legacy',contactName:'Contacto de otra cuenta',contactPhone:'+34000000000',messages:[{text:'Texto de otra cuenta'}]}]);
 const f=await fixture({initial:false,initialMemory:[['go_messages_v1',legacy],['go_messages_v1:another-account',legacy]]});try{
  assert.ok(!f.container.textContent.includes('Contacto de otra cuenta'));assert.ok(!f.container.textContent.includes('Texto de otra cuenta'));
  assert.equal(f.memory.get('go_messages_v1'),legacy);assert.equal(f.memory.get('go_messages_v1:another-account'),legacy);
 }finally{await f.close();}
});

for(const handedness of ['left','right'])for(const height of [130,300,500])test('shared Messages rail, keyboard and primary actions remain independent: '+handedness+'/'+height,async()=>{
 const f=await fixture({handedness,height});try{
  const rail=f.railFrames.at(-1);assert.equal(rail.screenKey,'note-editor');assert.equal(rail.buttonKey,'tools-toggle');
  assert.equal(rail.fixedLeft,handedness==='right'?302:0);assert.equal(rail.bounds.height,height-(height>=208?80:0));
  await f.type('Texto con teclado');await f.keyboard();await f.press('Mostrar herramientas de mensajes');
  assert.equal(f.input.value,'Texto con teclado');assert.equal(f.send.disabled,false);assert.ok(f.button(height<208?'Volver a conversaciones':'Ir directamente al Landing'));
  await f.press('Ocultar teclado');assert.equal(f.closed,0);assert.equal(f.input.value,'Texto con teclado');
  await f.submit();assert.equal(f.records.length,1);assert.equal(f.input.value,'');
 }finally{await f.close();}
});

for(const handedness of ['left','right'])for(const width of [320,430])test('GO assistant uses the same rail and keeps its actual composer, menu actions and voice stop accessible: '+handedness+'/'+width,async()=>{
 const f=await assistantHarness.assistantToolsFixture({handedness,width});try{
  assert.equal(f.button('Mostrar herramientas de GO').accessibilityState.expanded,false);assert.equal(f.container.textContent.includes('Menú'),false);
  const rail=f.frames.at(-1);assert.equal(rail.screenKey,'note-editor');assert.equal(rail.buttonKey,'tools-toggle');assert.equal(rail.fixedLeft,handedness==='right'?width-68:0);
  await f.type('Solicitud conservada');await f.keyboard();assert.ok(f.button('Escuchar con GO'));assert.equal(f.button('Enviar solicitud').disabled,false);
  await f.press('Mostrar herramientas de GO');await f.press('Menú');assert.equal(f.panel,'menu');assert.equal(f.input().value,'Solicitud conservada');assert.equal(f.button('Enviar solicitud').disabled,false);
  await f.press('Ayuda de GO');assert.equal(f.panel,'help');assert.ok(f.container.textContent.includes('Toca GO para hablar'));
  await f.press('Volver a herramientas');await f.press('Adjuntar');assert.equal(f.panel,'attach');assert.ok(f.container.textContent.includes('Fotos'));assert.ok(f.container.textContent.includes('Archivo'));
  await f.press('Volver a herramientas');await f.press('Acciones');assert.equal(f.panel,'actions');await f.press('Crear tarea');assert.deepEqual(f.calls.find(c=>c[0]==='start'),['start','task']);
  await f.press('Volver a herramientas');await f.press('Zona');assert.equal(f.panel,'zone');assert.ok(f.calls.some(c=>c[0]==='zone'));
  await f.press('Ocultar teclado');assert.equal(f.closed,0);assert.equal(f.input().value,'Solicitud conservada');
  await f.press('Escuchar con GO');assert.ok(f.calls.some(c=>c[0]==='voice'&&c[1]===true));assert.ok(f.container.textContent.includes('Parar'));
  assert.equal(f.button('Detener escucha y enviar').disabled,false);await f.press('Detener escucha y enviar');assert.ok(f.calls.some(c=>c[0]==='stop'));
  await f.status('preparing');assert.ok(f.button('Parar captura de micrófono'));await f.press('Parar captura de micrófono');
  await f.press('Enviar solicitud');assert.equal(f.input().value,'');assert.equal(f.calls.filter(c=>c[0]==='dispatch').length,1);
 }finally{await f.close();}
});

test('existing location tools embed without a second arrow, capture only on demand and still require explicit confirmation',async()=>{
 const buttons=[],sent=[];let positions=0,returned=0;
 const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='string'?n:n?.props?text(n.props.children):'';
 const runtime={...rn,ScrollView:rn.View,TouchableOpacity:props=>{buttons.push(props);return React.createElement('button',null,props.children);}};
 const places=evaluate('data/contactPlaces.ts',{});
 const tools=evaluate('components/MessageLocationTools.tsx',{'react-native':runtime,'@/data/contactPlaces':places,'@expo/vector-icons':{Feather:()=>null},
  './contactos/ContactPlacesPanel':{ContactPlacesPanel:()=>null,openPlace:async()=>{}},
  'expo-location':{getForegroundPermissionsAsync:async()=>({status:'granted'}),getCurrentPositionAsync:async()=>{positions++;return{coords:{latitude:40.4,longitude:-3.7,accuracy:5}};},Accuracy:{Balanced:3}},
 });
 const container=document.createElement('div'),root=createRoot(container);
 const press=label=>settle(()=>{const button=buttons.findLast(b=>(b.accessibilityLabel||text(b.children))===label);assert.ok(button,label);return button.onPress();});
 try{
  await settle(()=>root.render(React.createElement(tools.MessageLocationTools,{embedded:true,bounds:{width:350,height:220},handedness:'right',canSend:true,recipient:'Destino autorizado',onIncomingHandled(){},onClose(){returned++;},onSend:async place=>{sent.push(place);return true;}})));
  assert.equal(buttons.some(b=>b.accessibilityLabel==='Herramientas de ubicación'),false);assert.equal(positions,0);
  await press('Estoy aquí');assert.equal(positions,1);assert.equal(sent.length,0);await press('Compartir esta ubicación');
  assert.equal(sent.length,1);assert.equal(returned,1);assert.equal(sent[0].title,'Estoy aquí');
 }finally{await settle(()=>root.unmount());}
});
