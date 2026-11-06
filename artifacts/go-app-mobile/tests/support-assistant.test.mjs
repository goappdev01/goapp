import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
const nodes=t=>!t||typeof t!=='object'?[]:[t,...(t.children??[]).flatMap(nodes)];
const tick=()=>new Promise(setImmediate);
function fixture(respond){
 let cursor=0,slots=[],effects=[],receive,options;const scopes=[],dispatched=[],accepted=[],closed=[];
 const React={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),
  useState(value){const i=cursor++;slots[i]??={value:typeof value==='function'?value():value};return[slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},
  useRef:value=>React.useState({current:value})[0],
  useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,k)=>!Object.is(v,old.deps[k]))){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 const a={messages:[],phase:'collect',request:{},panel:null,notice:'',busy:'',setNotice(v){a.notice=v;},setBusy(v){a.busy=v;},say(text,role='assistant'){a.messages.push({id:a.messages.length,text,role});},invalidate(){a.busy="";},setPanel(v){a.panel=v;}};
 const native=new Proxy({Platform:{OS:'ios'},useWindowDimensions:()=>({width:390,height:844}),Keyboard:{isVisible:()=>false,dismiss(){},addListener:()=>({remove(){}})}},{get:(o,k)=>o[k]??k});
 const ui=new Proxy({s:new Proxy({conversation:{gap:12,padding:16,paddingBottom:20}},{get:(o,k)=>o[k]??{}})},{get:(o,k)=>o[k]??k});
 const modules={react:{...React,default:React},'react-native':native,'react-native-gesture-handler':{GestureHandlerRootView:'Root'},'@expo/vector-icons':{Feather:'Feather'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34})},'expo-image-picker':{},'expo-document-picker':{},'expo-status-bar':{StatusBar:'StatusBar'},
  '@/components/ui/GoScreenModal':{GoScreenModal:'Modal'},'@/components/ui/GoScreenCloseSurface':{GoScreenCloseSurface:'Root',GoScreenCloseGuide:'Guide'},'./AssistantCloseControls':{AssistantCloseControls:'Close'},'./BookingAssistantPanels':{BookingAssistantPanels:'Panels'},'./BookingAssistantUI':ui,'./ListeningIndicator':{ListeningIndicator:'Indicator',listeningPlacement:()=>null},
  '@workspace/api-zod':{bookingDockOrder:()=>['menu','attach','go','actions','zone']},'@/lib/bookingAssistant':{assistantApi:async()=>({interpretation:false,transcription:false})},'@/hooks/useGoDockPreference':{useGoDockPreference:()=>({position:'right'})},'@/hooks/useAssistantZoneScope':{useAssistantZoneScope:()=>({ready:true,scope:{userId:'a'}})},
  '@/hooks/useBookingAssistant':{useBookingAssistant:p=>{scopes.push(p);return a;}},'@/hooks/useGoActions':{useGoActions:(_,scope)=>{scopes.push({actionScope:scope});return{manager:{state:null},choices:[],dispatch:(...v)=>dispatched.push(v)};}},
  '@/hooks/useBookingVoice':{useBookingVoice:(callback,configuration)=>{receive=callback;options=configuration;return{status:'idle',error:'',transcript:'',abort(){},start(){},stop(){}};}}};
 const context={exports:{},require:n=>{if(n in modules)return modules[n];throw Error(n);}};
 vm.runInNewContext(ts.transpileModule(readFileSync('components/booking-assistant/BookingAssistantScreen.tsx','utf8'),{compilerOptions:{esModuleInterop:false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,context);
 const props={visible:true,onClose:()=>closed.push(true),consultation:{scopeKey:'support:a',title:'Comunicar incidencia',sourceText:'Borrador original',respond,onAcceptDraft:(...v)=>accepted.push(v)}};
 return{a,props,scopes,dispatched,accepted,closed,get voiceOptions(){return options;},receive:text=>receive(text,false),render(p=props){cursor=0;effects=[];const tree=context.exports.BookingAssistantScreen(p);effects.forEach(fn=>fn());return tree;}};
}
const input=tree=>nodes(tree).find(n=>n.type==='TextInput');
const send=tree=>nodes(tree).find(n=>n.type==='IconButton'&&n.props.label==='Enviar solicitud');
test('the existing assistant opens a read-only support context and unavailable AI preserves typed and dictated queries',async()=>{
 const f=fixture();f.render();let tree=f.render();assert.ok(f.scopes.every(v=>'actionScope'in v?v.actionScope===null:v.scope===null&&!v.scopeReady));assert.equal(f.voiceOptions.requireTranscriptionReady,true);
 input(tree).props.onChangeText('Consulta escrita');tree=f.render();send(tree).props.onPress();await tick();tree=f.render();assert.equal(input(tree).props.value,'Consulta escrita');assert.match(f.a.notice,/borrador sigue intacto/);assert.equal(f.dispatched.length,0);
 f.receive('Consulta hablada');await tick();tree=f.render();assert.equal(input(tree).props.value,'Consulta hablada');assert.equal(f.dispatched.length,0);assert.equal(nodes(tree).filter(n=>n.type==='TouchableOpacity').length,1,'only existing GO voice dock action; no booking/task menus');
});
test('one consultation at a time yields a reviewable proposal; only its explicit accept button returns text',async()=>{
 let release,calls=0;const f=fixture(()=>{calls++;return new Promise(r=>release=r);});f.render();let tree=f.render();input(tree).props.onChangeText('Ordena este texto');tree=f.render();const submit=send(tree).props.onPress;submit();submit();assert.equal(calls,1);assert.equal(f.accepted.length,0);
 release({answer:'Puedes expresarlo así.',draft:'Propuesta para revisar'});await tick();tree=f.render();assert.equal(f.accepted.length,0);const review=nodes(tree).find(n=>n.props.testID==='assistant-draft-review');assert.ok(review);nodes(review).find(n=>n.type==='Action').props.onPress();assert.deepEqual(f.accepted,[['Propuesta para revisar','Borrador original']]);assert.equal(f.closed.length,1);assert.equal(f.dispatched.length,0);
});
test('closing or changing account invalidates an in-flight AI reply; failed queries remain editable',async()=>{
 let release;const f=fixture(()=>new Promise(r=>release=r));f.render();let tree=f.render();input(tree).props.onChangeText('Consulta privada');tree=f.render();send(tree).props.onPress();nodes(tree).find(n=>n.type==='Close').props.onClose();release({answer:'Respuesta antigua',draft:'Borrador antiguo'});await tick();tree=f.render();assert.equal(nodes(tree).some(n=>n.props.testID==='assistant-draft-review'),false);assert.equal(f.a.messages.length,0);
 f.props.consultation={...f.props.consultation,scopeKey:'support:b',respond:async()=>{throw Error('offline');}};f.render();tree=f.render();input(tree).props.onChangeText('Reintentar');tree=f.render();send(tree).props.onPress();await tick();tree=f.render();assert.equal(input(tree).props.value,'Reintentar');assert.match(f.a.notice,/Conservamos el texto/);assert.equal(f.dispatched.length,0);
});
test('a history consultation has no replacement action and opening any consultation never starts dictation automatically',async()=>{
 const f=fixture(async()=>({answer:'Respuesta',draft:'No sustituir historial'}));f.props.consultation.onAcceptDraft=undefined;f.render();let tree=f.render();assert.equal(typeof tree.props.onShow,'function');tree.props.onShow();input(tree).props.onChangeText('Ayuda');tree=f.render();send(tree).props.onPress();await tick();tree=f.render();assert.equal(nodes(tree).some(n=>n.props.testID==='assistant-draft-review'),false);assert.equal(f.accepted.length,0);assert.equal(f.dispatched.length,0);
});
