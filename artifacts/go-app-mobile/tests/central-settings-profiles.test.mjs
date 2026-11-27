import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript'),tick=()=>new Promise(setImmediate);
function load(file,imports={}){const context={exports:{},AbortController,Date,Intl,setTimeout,clearTimeout,console,require:name=>{if(name in imports)return imports[name];throw Error('Unexpected '+name+' in '+file);}};
 vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);return context.exports;}
const voice=load('lib/centralVoicePreferences.ts'),contract=load('../../lib/api-zod/src/central-assistant.ts',{zod:require('zod')});
const modelModule=load('lib/centralConversation.ts',{'@workspace/api-zod':contract,'./centralVoicePreferences':voice});
const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...(tree.children??[]).flat(Infinity).flatMap(nodes)];
const texts=tree=>[tree,...nodes(tree).flatMap(n=>n.children??[])].filter(x=>typeof x==='string').join(' ');
function ui(file,name,imports,props={}){
 let cursor=0;const slots=[],effects=[];
 const react={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),
  useState:value=>{const i=cursor++;if(!(i in slots))slots[i]=typeof value==='function'?value():value;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
  useRef:value=>react.useState({current:value})[0],useMemo:(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((v,k)=>v!==old.deps[k]))slots[i]={deps,value:fn()};return slots[i].value;},
  useReducer:(fn,value)=>{const [current,set]=react.useState(value);return[current,v=>set(old=>fn(old,v))];},
  useEffect:(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((v,k)=>v!==old.deps[k])){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 const exports=load(file,{react,'react-native':{Text:'Text',View:'View',TouchableOpacity:'Button',Alert:{alert:()=>{}}},...imports});
 return{render(next=props){cursor=0;const tree=exports[name](next);effects.splice(0).forEach(fn=>fn());return tree;}};
}
const rows=[{identifier:'es-a',name:'Voz A',language:'es-ES'},{identifier:'mx-a',name:'Voz B',language:'es-MX'},{identifier:'en-a',name:'Voice C',language:'en-GB'}];

test('voice catalogue only exposes actual identifiers/locales; missing gender is never inferred from names',()=>{
 const actual=voice.deviceVoices([...rows,rows[0],{name:'Not an installed voice'}]);assert.equal(actual.length,3);assert.ok(actual.every(v=>v.gender===undefined));
 const prefs=voice.centralSpeechPreferences({locale:'es-MX',voiceId:'mx-a',rate:1.25});
 assert.deepEqual(JSON.parse(JSON.stringify(voice.centralSpeechOptions(actual,prefs,'es-ES'))),{language:'es-MX',rate:1.25,voice:'mx-a'});
 const absent=voice.centralSpeechOptions(actual,{...prefs,voiceId:'removed-voice'},'es-ES');assert.equal(absent.voice,'mx-a');
 assert.equal(voice.centralSpeechPreferences({rate:50,locale:'javascript:bad'}).rate,2);assert.equal(voice.centralSpeechPreferences({locale:'javascript:bad'}).locale,null);
});

test('conversation and general privacy share one account model; old consent/history and new voice settings persist together',async()=>{
 const disk=new Map(),spoken=[],sent=[],storage={getItem:async key=>disk.get(key)??null,setItem:async(key,value)=>disk.set(key,value),removeItem:async key=>disk.delete(key)};
 const imports={'@react-native-async-storage/async-storage':storage,'expo-speech':{getAvailableVoicesAsync:async()=>rows,speak:(text,options)=>spoken.push({text,options}),stop:async()=>{}},
  './centralConversation':modelModule,'./centralVoicePreferences':voice,'./centralAssistant':{centralAssistantApi:async(...args)=>{sent.push(args);return{answer:'Respuesta local de prueba'};}}};
 const runtime=load('lib/centralConversationRuntime.ts',imports),a=runtime.centralConversationFor('A','es-ES');await Promise.all([a.restore(),a.restore()]);a.setConsent(true);a.setRemember(true);a.setSpeech({locale:'es-MX',voiceId:'mx-a',rate:.75});
 assert.equal(runtime.centralConversationFor('A','es-ES'),a);await a.respond('Consulta sintética');await tick();assert.equal(spoken[0].options.voice,'mx-a');assert.equal(spoken[0].options.rate,.75);
 const reopenedRuntime=load('lib/centralConversationRuntime.ts',imports),reopened=reopenedRuntime.centralConversationFor('A');await reopened.restore();
 assert.equal(reopened.consent,true);assert.equal(reopened.remember,true);assert.equal(reopened.speech.voiceId,'mx-a');assert.equal(reopened.messages.length,2);
 const other=reopenedRuntime.centralConversationFor('B');await other.restore();assert.equal(other.consent,false);assert.equal(other.messages.length,0);
 const before=sent.length;reopened.clear();await tick();assert.equal(sent.length,before,'clearing a chat without a proposal makes no booking request');assert.equal(reopened.consent,true);
});

test('delayed native voice enumeration cannot speak after interrupting or revoking consent',async()=>{
 let release;const spoken=[];
 const runtime=load('lib/centralConversationRuntime.ts',{'@react-native-async-storage/async-storage':{getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{}},'expo-speech':{getAvailableVoicesAsync:()=>new Promise(resolve=>release=resolve),speak:(...args)=>spoken.push(args),stop:async()=>{}},'./centralConversation':modelModule,'./centralVoicePreferences':voice,'./centralAssistant':{centralAssistantApi:async()=>({answer:'Respuesta de prueba'})}});
 const a=runtime.centralConversationFor('A');await a.restore();a.setConsent(true);await a.respond('Hola');a.interrupt();release(rows);await tick();assert.equal(spoken.length,0);
});

test('GO IA gear contains only conversation voice preferences and uses real accents/voices',async()=>{
 const model={ready:true,voice:true,speech:voice.centralSpeechPreferences(null),subscribe:()=>()=>{},setSpeech:update=>{model.speech=voice.centralSpeechPreferences({...model.speech,...update});},setVoice:v=>{model.voice=v;}};
 const f=ui('components/booking-assistant/CentralVoiceSettings.tsx','CentralVoiceSettings',{'expo-speech':{getAvailableVoicesAsync:async()=>rows},'@/lib/centralVoicePreferences':voice,'@/contexts/LanguageContext':{useLanguage:()=>({locale:'es-ES',lang:'es'})}},{model});
 f.render();await tick();let tree=f.render();assert.match(texts(tree),/Idioma/);assert.match(texts(tree),/Acento/);assert.match(texts(tree),/no informa/);assert.doesNotMatch(texts(tree),/OpenAI|presupuesto|gpt-|Privacidad|Borrar/);
 nodes(tree).find(n=>n.props.testID==='central-ai-accent').props.onPress();tree=f.render();
 const choice=nodes(tree).find(n=>n.type==='Button'&&texts(n)==='es-MX');assert.ok(choice);choice.props.onPress();assert.equal(model.speech.locale,'es-MX');
 tree=f.render();nodes(tree).find(n=>n.props.testID==='central-ai-native-voice').props.onPress();tree=f.render();assert.match(texts(tree),/Voz B/);assert.doesNotMatch(texts(tree),/Voice C/);
 nodes(tree).find(n=>n.props.testID==='central-ai-speak').props.onPress();assert.equal(model.voice,false);
});

test('technical UI and its capability request reject ordinary, stale, wrong-account and unavailable ADMIN identities',async()=>{
 for(const state of [{allowed:false},{allowed:true,checking:true},{allowed:true,unavailable:true},{allowed:true,userId:'B'}]){
  let calls=0;const identity={userId:'A',model:{subscribe:()=>()=>{}}};const f=ui('components/booking-assistant/GoAiPrivacySettings.tsx','GoAiAdminStatus',{
   '@/hooks/useGoAiPrivacyModel':{useGoAiPrivacyModel:()=>identity},'@/contexts/GoAdminAccessContext':{useAdminAccess:()=>({userId:'A',checking:false,unavailable:false,...state})},'@/contexts/LanguageContext':{useLanguage:()=>({t:()=>''})},
   '@/lib/centralConsent':{},'@/lib/centralConversation':modelModule,'@/lib/centralAssistant':{centralAssistantApi:async()=>{calls++;return{};}}},{visible:true});
  assert.equal(f.render(),null);await tick();assert.equal(calls,0);
 }
 let calls=0;const f=ui('components/booking-assistant/GoAiPrivacySettings.tsx','GoAiAdminStatus',{
  '@/hooks/useGoAiPrivacyModel':{useGoAiPrivacyModel:()=>({userId:'A',model:{subscribe:()=>()=>{}}})},'@/contexts/GoAdminAccessContext':{useAdminAccess:()=>({userId:'A',allowed:true,checking:false,unavailable:false})},'@/contexts/LanguageContext':{useLanguage:()=>({t:()=>''})},'@/lib/centralConsent':{},'@/lib/centralConversation':modelModule,
  '@/lib/centralAssistant':{centralAssistantApi:async()=>{calls++;return{model:'gpt-5.4-mini',conversation:true,actions:false,budget:{limitMicroUsd:4000000,chargedMicroUsd:0,remainingMicroUsd:3900000}};}}},{visible:true});
 f.render();await tick();assert.ok(calls>0);
});

test('privacy remains in general Preferences; interruption stays in the measured conversation footer with one own gear',()=>{
 const general=readFileSync('components/herramientas/HerramientasPanel.tsx','utf8');assert.match(general,/<GoAiPreferences visible=\{visible\}/);
 const privacy=readFileSync('components/booking-assistant/GoAiPreferences.tsx','utf8');assert.match(privacy,/Preferencias/);assert.match(privacy,/go-preferences-privacy/);
 const central=readFileSync('components/booking-assistant/CentralAssistant.tsx','utf8');assert.match(central,/const settings=<CentralVoiceSettings/);assert.doesNotMatch(central,/central-ai-clear|central-ai-consent|gpt-5\.4-mini|USD/);
 assert.match(central,/conversationActions=.*central-ai-interrupt/);const screen=readFileSync('components/booking-assistant/BookingAssistantScreen.tsx','utf8');
 assert.match(screen,/setFooterHeight[^\n]+\n\s*\{consultation\?\.conversationActions\}/);assert.equal((screen.match(/testID="central-ai-settings-toggle"/g)??[]).length,1);assert.match(screen,/backgroundColor:"#F8FAFC",overflow:"hidden"/);
});

test('general privacy preserves revocation and local deletion without requesting ADMIN capabilities for an ordinary account',async()=>{
 let calls=0;const model={ready:true,consent:true,remember:true,cloudEnabled:false,subscribe:()=>()=>{},setConsent(v){this.consent=v;},setRemember(v){this.remember=v;},clear(){this.cleared=true;}};
 const identity={userId:'A',model};const f=ui('components/booking-assistant/GoAiPrivacySettings.tsx','GoAiPrivacySettings',{
  '@/hooks/useGoAiPrivacyModel':{useGoAiPrivacyModel:()=>identity},'@/contexts/GoAdminAccessContext':{useAdminAccess:()=>({allowed:false,userId:'A'})},'@/contexts/LanguageContext':{useLanguage:()=>({t:()=> 'Aviso'})},
  '@/lib/centralConsent':{CENTRAL_PRIVACY_DISCLOSURE:'Información de privacidad'},'@/lib/centralConversation':modelModule,'@/lib/centralAssistant':{centralAssistantApi:async()=>{calls++;}}},{visible:true});
 f.render();let tree=f.render();assert.doesNotMatch(texts(tree),/Modelo:|Proveedor:|USD|presupuesto/i);
 nodes(tree).find(n=>n.props.testID==='central-ai-consent').props.onPress();assert.equal(model.consent,false);
 nodes(tree).find(n=>n.props.testID==='central-ai-remember').props.onPress();assert.equal(model.remember,false);
 const clear=nodes(tree).find(n=>n.props.testID==='central-ai-clear');assert.equal(clear.props.disabled,false);clear.props.onPress();assert.equal(model.cleared,true);await tick();assert.equal(calls,0);
});

test('ADMIN status cannot display the previous account budget while the new account request is pending',async()=>{
 let identity={userId:'A',model:{subscribe:()=>()=>{}}};let next;
 const f=ui('components/booking-assistant/GoAiPrivacySettings.tsx','GoAiAdminStatus',{
  '@/hooks/useGoAiPrivacyModel':{useGoAiPrivacyModel:()=>identity},'@/contexts/GoAdminAccessContext':{useAdminAccess:()=>({userId:identity.userId,allowed:true,checking:false,unavailable:false})},'@/contexts/LanguageContext':{useLanguage:()=>({t:()=>''})},'@/lib/centralConsent':{},'@/lib/centralConversation':modelModule,
  '@/lib/centralAssistant':{centralAssistantApi:async userId=>userId==='A'?{model:'account-A-model',conversation:true,actions:false,budget:{limitMicroUsd:4000000,chargedMicroUsd:123456,remainingMicroUsd:3800000}}:new Promise(resolve=>next=resolve)}},{visible:true});
 f.render();await tick();assert.match(texts(f.render()),/account-A-model/);
 identity={userId:'B',model:{subscribe:()=>()=>{}}};const changing=f.render();assert.doesNotMatch(texts(changing),/account-A-model|0\.123456|4\.00/);assert.match(texts(changing),/sin comprobar/);
 next({model:'account-B-model',conversation:true,actions:false});await tick();assert.match(texts(f.render()),/account-B-model/);
});

test('one informed authorization is shared, and a late allow after leaving the account cannot persist consent',async()=>{
 let buttons,current=true,alerts=0,changes=0;const model={ready:true,consent:false,setConsent(v){changes++;this.consent=v;}};
 const consent=load('lib/centralConsent.ts',{'react-native':{Alert:{alert:(title,copy,actions)=>{alerts++;buttons=actions;assert.match(copy,/OpenAI/);assert.match(copy,/Privacidad/);}}}});
 const first=consent.requestCentralConsent(model,()=>current);const outcome=first.catch(e=>e);
 assert.equal(consent.requestCentralConsent(model,()=>current),first);assert.equal(alerts,1);
 current=false;buttons.find(b=>b.text==='Permitir').onPress();assert.match((await outcome).message,/sesión/);assert.equal(changes,0);assert.equal(model.consent,false);
 const source=readFileSync('components/booking-assistant/CentralAssistant.tsx','utf8');assert.match(source,/return\(\)=>\{current=false;if\(active.current.model===model\)active.current.visible=false/);
});
