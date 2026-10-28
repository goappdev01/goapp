const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{pathToFileURL,fileURLToPath}=require('node:url');
const life=require('./react-lifecycle.cjs'),{React,ts,createRoot,document}=life;
const compile=s=>ts.transpileModule(s,{compilerOptions:{alwaysStrict:false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const load=(file,imports={},globals={})=>{const c={exports:{},Date,Intl,URL,console,setTimeout,clearTimeout,Promise,...globals,require:n=>n==='react'?React:n in imports?imports[n]:(()=>{throw Error('Unexpected '+n+' in '+file)})()};vm.runInNewContext(compile(fs.readFileSync(file,'utf8')),c);return c.exports;};
const plain=x=>JSON.parse(JSON.stringify(x));
const settle=fn=>React.act(async()=>{await fn?.();for(let i=0;i<10;i++)await Promise.resolve();});
async function diskFixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'go-unified-note-test-')),filesDirectory=path.join(directory,'files');fs.mkdirSync(filesDirectory);
 let failWrite=false,failRead=false,gate=null,reads=0,writes=0;
 const keyFile=key=>path.join(directory,encodeURIComponent(key)+'.json');
 const storage={getItem:async key=>{reads++;if(key==='go_log_v1'&&failRead)throw Error('Fallo al verificar almacenamiento');try{return fs.readFileSync(keyFile(key),'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}},
  setItem:async(key,value)=>{if(key==='go_log_v1'){if(gate)await gate;if(failWrite)throw Error('No se pudo guardar en disco');writes++;}fs.writeFileSync(keyFile(key),value);},
  removeItem:async key=>{try{fs.unlinkSync(keyFile(key));}catch(e){if(e.code!=='ENOENT')throw e;}},multiRemove:async keys=>{for(const key of keys)await storage.removeItem(key);}};
 const {loadAuthSession}=await import('./auth-session-fixture.mjs');
 const auth=loadAuthSession({fetch:async()=>{throw Error('Ordinary notes must save without an HTTP request');}},storage);
 const setUser=async userId=>{if(!userId){await auth.clearAuthSession();return;}const payload=Buffer.from(JSON.stringify({sub:userId,exp:Math.floor(Date.now()/1000)+3600,session_id:'test-session-'+userId})).toString('base64url');
  await auth.saveAuthSession({access_token:'test.'+payload+'.signature',refresh_token:'test-refresh',user:{id:userId}});};
 const scope={userId:'note-user',context:'demo:USER'};await setUser(scope.userId);
 const bookingSource=fs.readFileSync('data/booking.ts','utf8'),ast=ts.createSourceFile('booking.ts',bookingSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='getAuthenticatedUserId');
 const ctx={exports:{},getStoredSession:auth.readAuthSession};vm.runInNewContext(compile(fn.getText(ast)),ctx);
 const access=load('lib/goTaskAccess.ts',{'@/data/booking':{getAuthenticatedUserId:ctx.exports.getAuthenticatedUserId}});
 const nativeFiles={documentDirectory:pathToFileURL(filesDirectory+path.sep).href,makeDirectoryAsync:async uri=>fs.mkdirSync(fileURLToPath(uri),{recursive:true}),copyAsync:async({from,to})=>fs.copyFileSync(fileURLToPath(from),fileURLToPath(to)),getInfoAsync:async uri=>{try{const s=fs.statSync(fileURLToPath(uri));return{exists:true,size:s.size};}catch{return{exists:false};}}};
 const model=load('lib/unifiedNotes.ts'),fileApi=load('lib/goNoteFiles.ts',{'expo-file-system/legacy':nativeFiles,'./unifiedNotes':model});
 const reopen=()=>load('lib/goLogStore.ts',{'@react-native-async-storage/async-storage':storage,'./goTaskAccess':access});let store=reopen();
 const noteTools=load('lib/goNoteTools.ts'),reminders=load('lib/goTaskReminders.ts',{'@workspace/api-zod':{},'./goLogBridge':{},'./goTaskAccess':access});
 const schedulerModel=load('lib/goNativeReminderScheduler.ts',{'./goTaskAccess':access,'./goTaskReminders':reminders,'./goNoteTools':noteTools});
 let activeScope=scope,permission='allowed';const osRequests=new Map(),refreshes=[];
 const scheduler=schedulerModel.createNativeReminderScheduler({platform:'ios',readTasks:()=>store.readGoLog(),now:()=>Date.now(),scopeValid:async expected=>expected.userId===await ctx.exports.getAuthenticatedUserId()&&expected.context===activeScope.context,
  permissions:async()=>permission,pending:async()=>[...osRequests.values()],delivered:async()=>[],schedule:async item=>{osRequests.set(item.identifier,{identifier:item.identifier,data:{taskId:item.taskId,minutes:item.minutes,signature:item.signature}});return item.identifier;},cancel:async id=>osRequests.delete(id),dismiss:async()=>{}});
 await scheduler.setScope(scope,'sound');
 const api=()=>load('lib/unifiedNoteStore.ts',{'@react-native-async-storage/async-storage':storage,'./goTaskAccess':access,'./goLogStore':store,'./goNoteFiles':fileApi,'./unifiedNotes':model,'./goTaskReminders':reminders,
  './goTaskReminderRuntime':{refreshNativeTaskReminders:async(expected,requestPermission)=>{refreshes.push([expected,requestPermission]);return scheduler.refresh(expected,{requestPermission});}}});
 return{scope,storage,access,auth,model,fileApi,api,scheduler,nativeModel:schedulerModel,osRequests,refreshes,directory,
  get store(){return store;},get writes(){return writes;},get reads(){return reads;},get rows(){try{return JSON.parse(fs.readFileSync(keyFile('go_log_v1'),'utf8'));}catch{return[];}},
  failWrite:value=>failWrite=value,failRead:value=>failRead=value,gate:value=>gate=value,permission:value=>permission=value,setUser,
  active:()=>activeScope.context===scope.context,changeContext:context=>activeScope={...scope,context},
  async reopen(){store=reopen();return store.readGoLog();},draft:extra=>({...model.noteDraft(),content:'Una frase',...extra}),
  async sourceFile(name='documento.pdf',content='fixture document'){const filename=path.join(directory,name);fs.writeFileSync(filename,content);return{uri:pathToFileURL(filename).href,name,size:Buffer.byteLength(content),mimeType:'application/pdf'};},
  close(){const resolved=path.resolve(directory);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep+'go-unified-note-test-'))throw Error('Unsafe fixture cleanup');fs.rmSync(resolved,{recursive:true,force:true});}};
}
async function editorFixture({scope={userId:'note-user',context:'demo:USER'},onSave,initial=null,seed,handedness='right',cached,ready=true,ports={}}={}){
 const hosts=new Map(),instances=new Map(),container=document.createElement('div'),root=createRoot(container),calls=[];let props;
 const host=name=>React.forwardRef((p,ref)=>{const token=React.useRef({}).current;if(p.testID){hosts.set(p.testID,p);instances.set(p.testID,token);}if(p.accessibilityLabel)hosts.set(p.accessibilityLabel,p);React.useImperativeHandle(ref,()=>({scrollTo(){},setNativeProps(){}}));return React.createElement('div',null,p.children);});
 const native={...life.rn,Platform:{OS:'ios'},View:host('View'),Text:host('Text'),TextInput:host('TextInput'),TouchableOpacity:host('TouchableOpacity'),ScrollView:host('ScrollView'),Keyboard:{dismiss:()=>calls.push(['keyboard'])},Linking:{openURL:async uri=>calls.push(['link',uri])},Share:{share:async data=>calls.push(['share',data])},StyleSheet:{create:x=>x,absoluteFill:{}}};
 const common={'react-native':native,'@expo/vector-icons':{Feather:host('Feather')},'@/lib/time':{getToday:()=>new Date('2027-01-01'),formatISODate:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}};
 const model=load('lib/unifiedNotes.ts'),tools=load('lib/goNoteTools.ts'),picker=load('components/notes/GoNoteReminderPicker.tsx',{...common,'@/lib/goNoteTools':tools}),date=load('components/notes/GoNoteDatePicker.tsx',common);
 const voice={status:'idle',error:'',notice:'',focus:field=>calls.push(['focus',field]),abort:()=>calls.push(['abort']),toggle:async()=>calls.push(['microphone'])};
 const imports={...common,'react-native-keyboard-controller':{KeyboardAvoidingView:host('KeyboardFrame'),KeyboardAwareScrollView:host('KeyboardScroll')},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})},
  '@/components/ui/GoScreenModal':{GoScreenModal:host('Modal')},'@/components/ui/GoScreenCloseSurface':{GoScreenCloseSurface:host('Surface'),GoScreenCloseGuide:()=>null},'@/components/ui/GoCloseButton':{GoCloseButton:host('Close')},
  './GoNoteReminderPicker':picker,'./GoNoteDatePicker':date,'@/hooks/useGoNoteVoice':{useGoNoteVoice:p=>({...voice,props:p})},'@/lib/unifiedNotes':model,'@/lib/goNoteFiles':{importNoteFile:ports.importFile||async function(){throw Error('Use the actual file fixture for persistence tests');}},
  'expo-document-picker':ports.documents||{getDocumentAsync:async()=>({canceled:true})},'expo-image-picker':ports.images||{launchImageLibraryAsync:async()=>({canceled:true})},'expo-location':ports.location||{}};
 const Editor=load('components/notes/GoNoteEditor.tsx',imports).GoNoteEditor;
 props={visible:true,scope,ready,initial,seed,handedness,cached,onClose:state=>calls.push(['close',state]),onSave:onSave||(async draft=>({entry:model.buildNoteEntry(draft,scope,draft.original),message:'Nota guardada.'}))};
 const render=async patch=>{props={...props,...patch};await settle(()=>root.render(React.createElement(Editor,props)));};await render({});
 return{hosts,instances,calls,voice,container,run:settle,render,async idle(){for(let i=0;i<20;i++)await settle(()=>new Promise(setImmediate));},close:()=>settle(()=>root.unmount())};
}
module.exports={...life,compile,load,plain,settle,diskFixture,editorFixture};
