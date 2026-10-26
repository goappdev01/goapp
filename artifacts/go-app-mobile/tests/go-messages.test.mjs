import {test} from 'node:test';
import assert from 'node:assert/strict';
import lifecycle from './helpers/react-lifecycle.cjs';
const {React,createRoot,document,evaluate,rn,native}=lifecycle;
const bookingId='11111111-1111-4111-8111-111111111111';
const settle=async fn=>React.act(async()=>{await fn?.();for(let i=0;i<20;i++)await Promise.resolve();});
async function fixture({initial=true,context,offline=false,account='customer',platform='ios'}={}){
 const memory=new Map(),storage={getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>{memory.set(k,v);},removeItem:async k=>{memory.delete(k);}};
 let owner=account,fail=offline,loseResponse=false,sending=0,attempts=0,closed=0;const records=[],events=new Set(),inputs=[],buttons=[];let modalProps,dismissed=0;
 const thread=()=>({id:'booking:'+bookingId,bookingId,businessId:'salon',counterpartId:owner==='customer'?'business-owner':'customer',contactName:owner==='customer'?'Registered salon':'Registered customer',lastUpdated:1,messages:records.map(x=>({...x,senderId:x.sender===owner?'yo':x.sender})),unread:0});
 const booking={getAuthenticatedUserId:async()=>owner,supabaseApiRequest:async(path,init={},required,expected)=>{
  assert.equal(required,true);assert.equal(expected,owner);if(fail)throw new Error('Servidor no disponible');
  if(path.startsWith('/supabase/booking-conversations'))return records.length||path.includes('booking_id=')?[thread()]:[];
  const {messageId,text}=JSON.parse(init.body);attempts++;sending++;await Promise.resolve();
  if(!records.some(m=>m.id===messageId))records.push({id:messageId,text,sender:owner,createdAt:1,channel:'go'});sending--;
  if(loseResponse){loseResponse=false;throw new Error('Respuesta de envío perdida');}return thread();
 }};
 const data=evaluate('data/goMessages.ts',{'./booking':booking,'@react-native-async-storage/async-storage':storage});
 const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='string'?n:n?.props?text(n.props.children):'';
 class Value{setValue(){}interpolate(){return 0;}}
 const motion={start:fn=>fn?.()};const chain=new Proxy({},{get:()=>()=>chain});
 const NativeView=native('View');const View=props=>{React.useLayoutEffect(()=>{props.onLayout?.({nativeEvent:{layout:{x:10,y:0,width:370,height:300}}});},[]);return React.createElement(NativeView,props);};
 const screen=evaluate('components/MessagesScreen.tsx',{
  '@/data/booking':booking,'@/data/goMessages':data,'@/lib/sessionEvents':{onSessionChanged:fn=>{events.add(fn);return()=>events.delete(fn);}},
  '@react-native-async-storage/async-storage':storage,'@expo/vector-icons':{Feather:()=>null},'./DraggableFAB':{DraggableFAB:({children})=>children},
  'expo-haptics':{selectionAsync:async()=>{},impactAsync:async()=>{},notificationAsync:async()=>{},ImpactFeedbackStyle:{Light:1},NotificationFeedbackType:{Warning:1}},
  '@/contexts/LanguageContext':{useLanguage:()=>({lang:'es',t:key=>key})},'expo-linear-gradient':{LinearGradient:View},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34})},
  'react-native-gesture-handler':{Gesture:{Pan:()=>chain},GestureDetector:({children})=>children},
  'react-native-reanimated':{__esModule:true,default:{View},useSharedValue:v=>React.useRef({value:v}).current,useAnimatedStyle:fn=>fn(),withSpring:v=>v},
  'react-native':{...rn,View,Text:native('Text'),Platform:{OS:platform},Modal:props=>{modalProps=props;return props.visible?props.children:null;},
   Dimensions:{get:()=>({width:390,height:844})},Easing:{out:x=>x,cubic:0},PanResponder:{create:()=>({panHandlers:{}})},
   Animated:{Value,View,spring:()=>motion,timing:()=>motion},ScrollView:View,KeyboardAvoidingView:View,
   FlatList:props=>React.createElement(View,null,(props.data||[]).map((item,index)=>React.createElement(React.Fragment,{key:item.id},props.renderItem({item,index})))),
   TextInput:props=>{inputs.push(props);return React.createElement('input',{'data-value':props.value,'data-placeholder':props.placeholder});},
   TouchableOpacity:props=>{buttons.push({...props,label:props.accessibilityLabel||text(props.children)});return React.createElement('button',null,props.children);},
  },
 });
 let shown=true,initialBookingId=initial?bookingId:undefined;const container=document.createElement('div'),root=createRoot(container);
 const render=()=>{inputs.length=0;buttons.length=0;root.render(React.createElement(screen.MessagesScreen,{visible:shown,onClose(){closed++;},onDismiss(){dismissed++;},recentContacts:[],userGoPhone:'',onCreateGo(){},onPickDeviceContact:async()=>null,initialBookingId,initialContext:context}));};
 await settle(render);
 const input=()=>inputs.findLast(p=>p.placeholder==='Escribe un mensaje...');
 const send=()=>buttons.findLast(p=>p.label==='msg_send_btn');
 return{memory,records,container,data,get dismissed(){return dismissed;},async hide(){shown=false;await settle(render);},async nativeDismiss(){await settle(()=>modalProps.onDismiss());},get closed(){return closed;},get attempts(){return attempts;},get input(){return input();},get send(){return send();},
  async type(value){await settle(()=>input().onChangeText(value));},async submit(){await settle(()=>send().onPress());},
  async double(){await settle(()=>Promise.all([send().onPress(),send().onPress()]));},fail(v){fail=v;},lose(){loseResponse=true;},
  async account(next){await settle(()=>{owner=next;for(const fn of events)fn();});},
  async general(){initialBookingId=undefined;context=undefined;await settle(render);},
  async back(){await settle(()=>buttons.findLast(p=>p.accessibilityLabel==='Volver a la ficha'||p.accessibilityLabel==='Volver a conversaciones').onPress());},
  async reopen(){context={...context};initialBookingId=undefined;await settle(()=>root.render(null));initialBookingId=initial?bookingId:undefined;await settle(render);},
  async close(){await settle(()=>root.unmount());assert.equal(events.size,0);assert.equal(sending,0);}
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
