const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const life=require('./react-lifecycle.cjs'),{React,createRoot,document,ts}=life;
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
function visit(n){nodes.push(n);ts.forEachChild(n,visit)}visit(ast);
const note=nodes.find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='BottomSheet'&&n.openingElement.attributes.properties.some(p=>p.name?.getText(ast)==='visible'&&p.initializer.expression.getText(ast)==='notesOpen'));
const sheet=nodes.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='BottomSheet');
const compile=s=>ts.transpileModule(s,{compilerOptions:{alwaysStrict:false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const load=(s,imports={},globals={})=>{const c={exports:{},React,...globals,require:n=>n==='react'?React:n in imports?imports[n]:(()=>{throw Error('Unexpected note import '+n)})()};vm.runInNewContext(compile(s),c);return c.exports;};
const settle=async fn=>React.act(async()=>{fn?.();for(let i=0;i<12;i++)await Promise.resolve();});
async function fixture({hand='right',width=390,fontScale=1,keyboardOpen=false}={}){
 const calls=[],listeners=new Map(),hosts=new Map(),dimensions={width,height:844,fontScale},insets={top:47,bottom:34,left:0,right:0};let state;
 const host=name=>function Host(props){hosts.set(props.testID||props.accessibilityLabel||name,props);return React.createElement('div',{'data-native':name},props.children);};
 const native={...life.rn,useWindowDimensions:()=>dimensions,KeyboardAvoidingView:host('LegacyKeyboardFrame'),Dimensions:{get:()=>dimensions},Keyboard:{addListener:(n,fn)=>{const set=listeners.get(n)||new Set();set.add(fn);listeners.set(n,set);return{remove:()=>set.delete(fn)}} ,dismiss:()=>{calls.push('dismiss');for(const fn of listeners.get('keyboardWillHide')||[])fn();}}};
 for(const n of ['View','Text','TouchableOpacity','Pressable','ScrollView'])native[n]=host(n);
 native.Modal=props=>{hosts.set('Modal',props);return props.visible?React.createElement('div',null,props.children):null;};
 native.TextInput=React.forwardRef((props,ref)=>{hosts.set(props.multiline?'detail':'title',props);React.useImperativeHandle(ref,()=>({focus(){calls.push('focus');props.onFocus?.()}}));return React.createElement('div');});
 const safe={'react-native-safe-area-context':{useSafeAreaInsets:()=>insets}},close=load(fs.readFileSync('components/ui/GoCloseButton.tsx','utf8'),{'react-native':native,'@expo/vector-icons':{Feather:host('Feather')}});
 const controls=load(fs.readFileSync('components/notes/GoNoteControls.tsx','utf8'),{'react-native':native,...safe,'@/components/ui/GoCloseButton':close});
 const shared=value=>React.useRef({value}).current,pan=()=>new Proxy({}, {get:(o,n)=>o[n]||((...args)=>{o[n]=args;return new Proxy(o,{get:(_o,k)=>k in o?o[k]:(...a)=>{o[k]=a;return pan();}})})});
 const gesture={Native:()=>({}),Pan:pan,Race:(...v)=>v};
 const scope={...React,...native,...safe['react-native-safe-area-context'],Gesture:gesture,GestureDetector:host('GestureDetector'),AnimatedPressable:native.Pressable,KeyboardControllerAvoidingView:host('NativeKeyboardFrame'),KeyboardAwareScrollView:host('KeyboardScroll'),Reanimated:{View:native.View,ScrollView:native.ScrollView},LinearGradient:host('Gradient'),useSharedValue:shared,useAnimatedStyle:fn=>fn(),useAnimatedScrollHandler:fn=>fn,useSheetSwipeDown:()=>({}),withSpring:x=>x,withTiming:x=>x,runOnJS:fn=>fn,containsGoBrand:()=>false,noTranslate:{},styles:{sheet:{},sheetTitle:{},sheetHandle:{},sheetSub:{},backdrop:{}}};
 // Use a normal chain while retaining the actual recognizer callbacks.
 gesture.Pan=()=>{const chain={};for(const k of ['enabled','activeOffsetY','failOffsetY','failOffsetX','simultaneousWithExternalGesture','onUpdate','onEnd','onStart','onFinalize'])chain[k]=value=>{chain['_'+k]=value;return chain};return chain;};
 const BottomSheet=load(sheet.getText(ast)+'\nexports.BottomSheet=BottomSheet;',{},scope).BottomSheet;
 const words={panel_note:'NOTA',close:'Cerrar nota',tasks_internal_short:'INTERNA',tasks_external_short:'EXTERNA',tasks_record_audio:'Micrófono',tasks_enable_reminder:'Campana'};
 const ctx={...scope,BottomSheet,GoNoteControls:controls.GoNoteControls,GoNoteReminderPicker:host('ReminderPicker'),Feather:host('Feather'),t:k=>words[k]||k,lang:'es',handedness:hand,date:'',dateISO:'',time:'',paddingBottom:34,setOverlayPanelHeight:()=>{},noteSelectorAfterNotesDismissRef:{current:false},setFieldSelectorOpen:()=>{},
  Haptics:{selectionAsync:async()=>calls.push('haptic'),impactAsync:async()=>calls.push('haptic'),ImpactFeedbackStyle:{Light:'Light',Medium:'Medium'}},noteVoice:{status:'idle',error:'',notice:'',focus:k=>calls.push(['voiceFocus',k])},notaAudioRecording:false,resetNotaAudio:()=>calls.push('abort'),toggleNotaRecording:()=>calls.push('mic'),startGoNoteTask:(...args)=>calls.push(args),noteReminderTarget:null,savedGoNoteReminderTargets:[],noteReminderBusy:false,noteReminderLabel:()=>'',goNoteReminderMinutes:()=>15,changeQuickNoteReminder:()=>{},setNoteReminderTargetId:()=>{},capture:s=>state=s};
 const code=`function Fixture(){const [notesOpen,setNotesOpen]=useState(false),[quickNoteText,setQuickNoteText]=useState('Título'),[quickNoteDetail,setQuickNoteDetail]=useState('Texto previo'),[noteReminderPickerOpen,setNoteReminderPickerOpen]=useState(false);const quickNoteTitleRef=useRef(null),quickNoteAlarm=false,quickNoteReminderMinutes=null;capture({notesOpen,setNotesOpen,quickNoteText,quickNoteDetail,noteReminderPickerOpen});return (${note.getText(ast)});}exports.Fixture=Fixture;`;
 const Fixture=load(code,{},ctx).Fixture,root=createRoot(document.createElement('div'));
 await settle(()=>root.render(React.createElement(Fixture)));
 return{hosts,calls,dimensions,insets,get state(){return state},open:()=>settle(()=>state.setNotesOpen(true)),show:()=>settle(()=>hosts.get('Modal').onShow()),emit:(event)=>settle(()=>{for(const fn of listeners.get(event)||[])fn({endCoordinates:{screenY:524,height:320}})}),run:settle,rerender:()=>settle(()=>root.render(React.createElement(Fixture))),close:()=>settle(()=>root.unmount())};
}
module.exports={...life,source,ast,nodes,note,sheet,compile,load,settle,fixture};
