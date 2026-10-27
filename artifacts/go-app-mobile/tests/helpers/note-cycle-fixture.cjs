const fs=require('node:fs'),vm=require('node:vm');
const life=require('./react-lifecycle.cjs'),{React,ts,createRoot,document}=life;
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
function visit(n){nodes.push(n);ts.forEachChild(n,visit);}visit(ast);
const compile=s=>ts.transpileModule(s,{compilerOptions:{alwaysStrict:false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const declaration=name=>{const n=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);if(!n)throw Error('Missing '+name);return n.initializer.getText(ast);};
const load=(file,imports={})=>{const scope={exports:{},Date,Intl,console,setTimeout,clearTimeout,require:n=>n==='react'?React:n in imports?imports[n]:(()=>{throw Error('Unexpected '+n)})()};vm.runInNewContext(compile(fs.readFileSync(file,'utf8')),scope);return scope.exports;};
const plain=x=>JSON.parse(JSON.stringify(x));
const settle=async fn=>React.act(async()=>{await fn?.();for(let i=0;i<8;i++)await Promise.resolve();});
const scope={userId:'note-cycle-owner',context:'demo:USER'};
function storageFixture(initial=[]){
 let raw=JSON.stringify(initial),failure=false,gate=null,writes=0;
 const access={getTaskUser:async()=>scope.userId,assertTaskUser:async expected=>{if(expected!==scope.userId)throw Error('Otra cuenta');},isPersonalTask:entry=>['TAREA','TAREA_INTERNA'].includes(entry.type)};
 const storage={getItem:async key=>key==='go_log_v1'?raw:null,setItem:async(key,value)=>{if(key!=='go_log_v1')return;if(gate)await gate;if(failure)throw Error('No se pudo guardar en el teléfono');raw=value;writes++;}};
 const tools=load('lib/goNoteTools.ts'),reopen=()=>load('lib/goLogStore.ts',{'@react-native-async-storage/async-storage':storage,'./goTaskAccess':access});
 let store=reopen();const refreshes=[];
 const api=()=>load('lib/goNoteReminder.ts',{'./goLogStore':store,'./goTaskAccess':access,'./goNoteTools':tools,'./goTaskReminderRuntime':{refreshNativeTaskReminders:async(...args)=>{refreshes.push(args);return[];}},'./goTaskReminders':{describeReminders:()=>''}});
 return{scope,storage,access,tools,refreshes,api,get store(){return store;},get rows(){return JSON.parse(raw);},get writes(){return writes;},fail:value=>failure=value,gate:value=>gate=value,
  async reopen(){store=reopen();return store.readGoLog();}};
}
function selectorFixture({kind='NOTA_INTERNA',initial=[],draft=null,slot=false}={}){
 const f=storageFixture(initial),calls=[];
 const context={...life,React,Date,Math,Set,JSON,Error,console,clearTimeout,lang:'es',isUserMode:false,t:k=>k,
  makeUid:()=> 'cycle-note',normalizePhoneForWhatsApp:x=>x.replace(/[^\d+]/g,''),
  fieldSelectorKind:kind,fieldSelectorText:'Mi tarea',fieldSelectorDetail:'Contenido dictado',fieldSelectorOpen:true,
  fsFilledValues:{date:'30/12/2027',dateISO:'2027-12-30',time:'13:45',duration:'1h',place:'Casa',contactName:'Contacto',phone:'+34600123456'},
  fieldSelectorSaveBusyRef:{current:false},noteTaskDraftRef:{current:draft},noteIdentityRef:{current:{ready:true,scope}},quickNoteReminderMinutes:75,
  calendarSlotDraftRef:{current:slot?{ownerUserId:scope.userId,actionContext:scope.context}:null},calendarSlotSavingRef:{current:false},calendarTaskContextRef:{current:slot?{}:null},
  qdReturnTimerRef:{current:null},qdFlowActiveRef:{current:false},qdOriginContextRef:{current:{}},
  Keyboard:{dismiss:()=>calls.push(['dismiss'])},AsyncStorage:{...f.storage,removeItem:async key=>calls.push(['remove',key])},
  showToast:(...args)=>calls.push(['toast',...args]),Alert:{alert:(...args)=>calls.push(['alert',...args])},
  saveGoNoteReminder:(...args)=>f.api().saveGoNoteReminder(...args),setGoLog:()=>{throw Error('Note must use acknowledged storage');},persistLog:()=>{throw Error('Note must use acknowledged storage');},
  closeFieldSelectorPanel:()=>{calls.push(['close']);context.calendarTaskContextRef.current=null;context.calendarSlotDraftRef.current=null;context.fieldSelectorOpen=false;},
 };
 for(const name of ['QuickNoteText','QuickNoteDetail','NotesOpen','QuickNoteReminderMinutes','FsFilledValues','FsLocationExpanded','FsActivityKey','FsOrbitalOpen','FsCustomOpen','FsCustomLabel','FieldSelectorOpen','FieldSelectorText','FieldSelectorDetail','ListOpen','AgendaOpOpen','PendingEnvioNota']){
  const key=name[0].toLowerCase()+name.slice(1);context['set'+name]=value=>{calls.push(['set'+name]);context[key]=typeof value==='function'?value(context[key]):value;};
 }
 const ctx=vm.createContext(context);
 for(const name of ['saveQuickNoteEntry','createEntryFromSelector','saveFieldSelector'])vm.runInContext(compile('globalThis.'+name+' = '+declaration(name)),ctx);
 return{...f,context:ctx,calls,save:()=>ctx.saveFieldSelector(),get rows(){return f.rows;},get writes(){return f.writes;}};
}
async function mountComponent(file,extraImports={},initialProps={}){
 const hosts=new Map(),container=document.createElement('div'),root=createRoot(container);
 const host=name=>React.forwardRef((props,ref)=>{hosts.set(props.testID||props.accessibilityLabel||name,props);React.useImperativeHandle(ref,()=>({scrollTo(){}}));return React.createElement('div',null,props.children);});
 const native={...life.rn,View:host('View'),Text:host('Text'),TextInput:host('Input'),ScrollView:host('ScrollView'),TouchableOpacity:host('Button'),Keyboard:{dismiss(){}},StyleSheet:{create:x=>x,absoluteFill:{}}};
 const imports={'react-native':native,'react-native-keyboard-controller':{KeyboardAvoidingView:host('KeyboardFrame')},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})},'@expo/vector-icons':{Feather:host('Feather')},'@/components/ui/GoCloseButton':{GoCloseButton:host('Close')},'@/components/ui/GoScreenCloseSurface':{GoScreenCloseSurface:host('Surface'),GoScreenCloseGuide:host('Guide')},...extraImports};
 const exports=load(file,imports),Component=Object.values(exports)[0];let props=initialProps;
 const render=async next=>{props={...props,...next};await settle(()=>root.render(React.createElement(Component,props)));};
 await render({});return{hosts,container,render,run:settle,close:()=>settle(()=>root.unmount())};
}
async function taskFormFixture({hand='right',embedded=false}={}){
 const hosts=new Map(),container=document.createElement('div'),root=createRoot(container),calls=[];let live;
 const host=name=>React.forwardRef((props,ref)=>{const instance=React.useRef({}).current;hosts.set(props.testID||props.accessibilityLabel||name,{...props,instance});return React.createElement('div',null,props.children);});
 const native=Object.fromEntries(['View','Text','TextInput','Pressable','TouchableOpacity','ScrollView','KeyboardAvoidingView','KeyboardControllerAvoidingView','KeyboardAwareScrollView','Feather','GoCloseButton'].map(n=>[n,host(n)]));
 native.Modal=props=>{hosts.set('Modal',props);return props.visible?React.createElement('div',null,props.children):null;};
 const ctx={...native,React,Platform:{OS:'ios'},StyleSheet:{absoluteFill:{}},Keyboard:{dismiss:()=>calls.push(['dismiss'])},styles:{locAquiBtn:{},locAquiText:{}},
  fieldSelectorKind:'NOTA_INTERNA',fieldSelectorOpen:true,fsLocationExpanded:false,fsPlaceDraft:'',fsLocating:false,fsOrbitalOpen:false,
  paddingBottom:34,insets:{top:47,bottom:34,left:0,right:0},handedness:hand,lang:'es',quickNoteReminderMinutes:null,noteReminderPickerOpen:false,
  t:k=>({'date_time_label':'FECHA / HORA','placeholder_task_details':'Contenido','placeholder_operational':'Título'}[k]||k),noteReminderLabel:()=>'',
  closeFieldSelectorPanel:()=>calls.push(['close']),saveFieldSelector:()=>calls.push(['save']),renderGoOrbit:()=>{throw Error('Old orbit must never appear in note editing');},
  qdFlowActiveRef:{current:false},noteCalendarAfterSelectorDismissRef:{current:null},noteSelectorAfterCalendarDismissRef:{current:false},calendarTaskContextRef:{current:embedded?{}:null},
  ...Object.fromEntries(['ContactName','Phone','Date','DateISO','Time','Place'].map(n=>['qdCap'+n+'Ref',{current:''}])),
  Haptics:{selectionAsync:async()=>{}},setCalOpen:value=>calls.push(['calendar',value]),calFlow:{open:opts=>calls.push(['schedule',opts])},formatISODate:()=> '2027-12-30',getToday:()=>new Date('2027-12-30'),_handleCalFlowSave:()=>{},
 };
 for(const name of ['FsLocationExpanded','FsPlaceDraft','FsFilledValues','FieldSelectorOpen','NoteReminderPickerOpen'])ctx['set'+name]=value=>{const key=name[0].toLowerCase()+name.slice(1);ctx[key]=typeof value==='function'?value(ctx[key]):value;calls.push(['set'+name,value]);};
 const form=nodes.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='renderFieldSelector');
 vm.runInNewContext(compile(form.getText(ast)+';globalThis.renderTaskForm=renderFieldSelector;'),ctx);
 function Fixture(){const[fsKbVisible,setKeyboard]=React.useState(false),[fsFocusedField,setFsFocusedField]=React.useState(null),[fieldSelectorText,setFieldSelectorText]=React.useState('Título'),[fieldSelectorDetail,setFieldSelectorDetail]=React.useState('Texto');
  Object.assign(ctx,{fsKbVisible,fsFocusedField,setFsFocusedField,fieldSelectorText,setFieldSelectorText,fieldSelectorDetail,setFieldSelectorDetail,fsFilledValues:{dateISO:'2027-12-30',time:'13:45',duration:'1h'}});
  live={setKeyboard,fsFocusedField,fieldSelectorText,fieldSelectorDetail};return ctx.renderTaskForm(embedded);
 }
 await settle(()=>root.render(React.createElement(Fixture)));return{hosts,calls,context:ctx,container,get live(){return live;},run:settle,close:()=>settle(()=>root.unmount())};
}
module.exports={...life,source,ast,nodes,compile,declaration,load,plain,settle,scope,storageFixture,selectorFixture,mountComponent,taskFormFixture};
