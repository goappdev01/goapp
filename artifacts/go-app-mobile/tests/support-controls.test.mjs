import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
const nodes=t=>!t||typeof t!=='object'?[]:[t,...(t.children??[]).flatMap(nodes)];
const text=t=>typeof t==='string'?t:(t?.children??[]).map(text).join(' ');
function load(file){let saved='',cursor=0;const React={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),useState:()=>[saved,value=>{saved=value;}]};
 const context={exports:{},require:name=>{if(name==='react')return{...React,default:React};if(name==='react-native')return new Proxy({StyleSheet:{create:v=>v}},{get:(o,k)=>o[k]??k});if(name==='@expo/vector-icons')return{Feather:'Feather'};if(name==='@/theme/goAssistantColors')return{GO_ASSISTANT_GOLD:'#C8A037',GO_ASSISTANT_LABEL:{color:'#FFFFFF'}};throw Error(name);}};
 vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{esModuleInterop:false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,context);return context.exports;
}
test('paper plane is small green with a 44pt target, while disabled transport is visibly and accessibly inactive',()=>{
 const ui=load('components/booking-assistant/BookingAssistantUI.tsx');let sent=0;for(const disabled of [true,false]){const tree=ui.GoSendButton({disabled,onPress:()=>sent++}),plane=nodes(tree).find(n=>n.type==='Feather');assert.equal(tree.props.disabled,disabled);assert.equal(tree.props.accessibilityState.disabled,disabled);assert.equal(tree.props.style.width,44);assert.equal(tree.props.style.height,44);assert.equal(plane.props.name,'send');assert.equal(plane.props.size,22);assert.equal(plane.props.color,disabled?'#728578':'#16834a');assert.equal(text(tree),'');if(!disabled)tree.props.onPress();}assert.equal(sent,1);
 for(const size of [56,64]){const tree=ui.GoAssistantButton({size,onPress(){}});assert.equal(tree.props.style[1].width,size);assert.equal(tree.props.style[1].height,size);assert.equal(tree.props.style[0].backgroundColor,'#C8A037');assert.equal(nodes(tree).find(n=>n.type==='Text').props.style[0].color,'#FFFFFF');}
});
test('voice failures become brief neutral closable notices, retaining permission and session information with no timers',()=>{
 const ui=load('components/landing/SupportVoiceNotice.tsx'),message='El servicio de dictado de GO no está configurado o no está disponible. No se ha iniciado una grabación. Puedes escribir mientras se restablece el servicio.';
 assert.equal(ui.SupportVoiceNotice({message:'',attempt:0}),null);let tree=ui.SupportVoiceNotice({message,attempt:1});assert.equal(text(tree),'Dictado no disponible. Puedes escribir. ');assert.ok(text(tree).length<55);assert.equal(nodes(tree).find(n=>n.type==='Text').props.style.color,'#46534c');const close=nodes(tree).find(n=>n.type==='TouchableOpacity');assert.equal(close.props.style.width,44);close.props.onPress();assert.equal(ui.SupportVoiceNotice({message,attempt:1}),null);assert.ok(ui.SupportVoiceNotice({message,attempt:2}));
 assert.equal(ui.supportVoiceMessage('Permite el acceso al micrófono'),'Revisa el permiso del micrófono.');assert.equal(ui.supportVoiceMessage('Inicia sesión para utilizar el dictado'),'Inicia sesión para dictar.');
});
