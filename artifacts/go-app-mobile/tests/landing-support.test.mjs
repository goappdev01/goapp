import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {supportFiles} from './helpers/support-files.mjs';
import {alarmFixture,alarmScope,alarmTask} from './helpers/alarm-reliability-fixture.mjs';
const ts=createRequire(import.meta.url)('typescript');
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{esModuleInterop:false,alwaysStrict:false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const port={exports:{}};vm.runInNewContext(compile('lib/supportRequests.ts'),port);const api=port.exports;
const nodes=t=>!t||typeof t!=='object'?[]:[t,...(t.children??[]).flatMap(nodes)];
const text=t=>typeof t==='string'?t:(t?.children??[]).map(text).join(' ');
const button=(tree,label)=>nodes(tree).find(n=>label==='ENVIAR'?n.type==='GoSendButton':n.type==='TouchableOpacity'&&text(n).includes(label));
const icon=(tree,label)=>nodes(tree).find(n=>n.type==='IconButton'&&n.props.label===label);
const menu=tree=>nodes(tree).find(n=>n.type==='GoNoteAttachmentMenu');
function fixture(gateway,options={}){let cursor=0,slots=[],effects=[];const files=options.files??supportFiles(),picker={photo:async()=>({canceled:true}),document:async()=>({canceled:true})};const events=new Map(),navigation=[];
 const local=options.local??new Map(),recovery={exports:{}};let lifecycle;
 vm.runInNewContext(compile('data/supportDrafts.ts'),{exports:recovery.exports,require:name=>{if(name==='@react-native-async-storage/async-storage')return{default:{getItem:async key=>options.getItem?options.getItem(key):local.get(key)??null,setItem:async(key,value)=>local.set(key,value)}};throw Error(name);}});
 const speech={status:'idle',error:'',notice:'',focus:()=>{},abort:()=>navigation.push('abort'),toggle:async()=>{speech.toggles++;},toggles:0};let voiceProps;
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const React={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),Fragment:'Fragment',
 useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},
 useRef(value){return React.useState({current:value})[0];},
 useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||!equal(old.deps,deps)){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 const scope={exports:{},Error,require(name){if(name==='@/data/supportDrafts')return recovery.exports;if(name==='@/lib/authSession')return{captureAuthIdentity:async()=>({userId:options.authUid??props.scopeKey})};if(name==='@/hooks/useSupportRefresh')return{useSupportRefresh:(enabled,refresh,invalidate)=>{lifecycle={enabled,refresh,invalidate};}};if(name==='react')return {...React,default:React};if(name==='react-native')return new Proxy({Platform:{OS:'ios'},StyleSheet:{create:v=>v},Keyboard:{addListener:(name,fn)=>{events.set(name,fn);return{remove(){events.delete(name);}};},dismiss:()=>{navigation.push('keyboard');events.get('keyboardDidHide')?.();}}},{get:(o,k)=>o[k]??k});
 if(name==='@/components/ui/GoNavigationFloating')return{GoNavigationFloating:'GoNavigationFloating'};if(name==='@/components/ui/GoScreenModal')return{GoScreenHost:'GoScreenHost'};
 if(name==='@/components/GOChatScreen')return{GOChatScreen:'GOChatScreen'};
 if(name==='@/components/notes/GoNoteAttachmentMenu')return{GoNoteAttachmentMenu:'GoNoteAttachmentMenu'};
 if(name==='@/components/booking-assistant/BookingAssistantUI')return{IconButton:'IconButton',GoAssistantButton:'GoAssistantButton',GoSendButton:'GoSendButton'};
 if(name==='./SupportVoiceNotice')return {SupportVoiceNotice:'SupportVoiceNotice'};if(name==='@/hooks/useGoNoteVoice')return{useGoNoteVoice:p=>{voiceProps=p;return speech;}};
 if(name==='react-native-safe-area-context')return{useSafeAreaInsets:()=>({top:47,bottom:34})};if(name==='@expo/vector-icons')return{Feather:'Feather'};if(name==='@/components/ui/GoCloseButton')return {GoCloseButton:'GoCloseButton'};if(name==='@/lib/supportRequests')return api;if(name==='@/lib/supportAttachments')return{createSupportAttachmentStore:files.create};if(name==='expo-image-picker')return{launchImageLibraryAsync:options=>picker.photo(options)};if(name==='expo-document-picker')return{getDocumentAsync:options=>picker.document(options)};throw Error(name);}};
 vm.runInNewContext(compile('components/landing/LandingSupport.tsx'),scope);
 const props={visible:true,scopeKey:'user-a',onClose(){navigation.push('back');},onExit(){navigation.push('exit');},gateway};
 return{props,events,navigation,files,picker,speech,local,recovery:recovery.exports,unmount:()=>slots.forEach(s=>s?.cleanup?.()),foreground:()=>{if(lifecycle.enabled)lifecycle.refresh();},sessionChanged:()=>lifecycle.invalidate(),get voice(){return voiceProps;},render(p=props){cursor=0;effects=[];const tree=scope.exports.LandingSupport(p);for(const run of effects)run();return tree;}};
}
const tick=()=>new Promise(setImmediate);

test('alarm success and restart use OS readback and retain the confirmed schedule without cancel/recreate',async()=>{
 const f=alarmFixture();assert.equal(await f.status(),'Alarma no activada');await f.start();assert.equal(await f.status(),'Alarma activa');
 const id=[...f.os.keys()][0];await f.restart();assert.equal(await f.status(),'Alarma activa');assert.equal([...f.os.keys()][0],id);
 assert.equal(f.calls.filter(call=>call[0]==='schedule').length,1);assert.equal(f.calls.filter(call=>call[0]==='cancel').length,0);
});

test('denied permissions stay inactive, persist a private incident and ask only on the explicit native flow',async()=>{
 const f=alarmFixture();f.state.permission={granted:false,canAskAgain:true,ios:{status:1}};
 await f.start();assert.equal(await f.status(),'Alarma no activada');assert.equal(f.os.size,0);assert.equal(f.calls.length,0);
 assert.ok(f.incidents().some(row=>row.cause==='denied'&&row.retry==='waiting_change'&&row.support==='local_only'));
 f.state.permissionResult={granted:true,canAskAgain:false,ios:{status:2}};await f.refresh(true);
 assert.equal(await f.status(),'Alarma activa');assert.equal(f.calls.filter(row=>row[0]==='permission').length,1);
 assert.ok(f.incidents().some(row=>row.cause==='denied'&&row.retry==='resolved'));
});

test('a changed title or sound option cannot reuse the previous native receipt before reconciliation',async()=>{
 const f=alarmFixture();await f.start();assert.equal(await f.status(),'Alarma activa');
 await f.edit({notes:'UPDATED NOTE TEXT'});assert.equal(await f.status(),'Alarma no activada');
 await f.refresh();assert.equal(await f.status(),'Alarma activa');
 assert.equal([...f.os.values()][0].content.body,'UPDATED NOTE TEXT');
 await f.edit({reminderSound:false});assert.equal(await f.status(),'Alarma no activada');
 await f.refresh();assert.equal(await f.status(),'Alarma activa');
 assert.equal([...f.os.values()][0].content.sound,false);assert.equal(f.os.size,1);
});

test('a permanently denied native flow never loops prompts or creates a request',async()=>{
 const f=alarmFixture();f.state.permission={granted:false,canAskAgain:false,ios:{status:1}};await f.start();await f.refresh(true);await f.refresh(true);
 assert.equal(await f.status(),'Alarma no activada');assert.equal(f.calls.length,0);assert.equal(f.os.size,0);
});

test('transient activation errors retry once and ambiguous OS success never produces a duplicate',async()=>{
 const f=alarmFixture();await f.start();await f.edit({time:'18:00'});f.state.ambiguousSchedule=1;
 await f.refresh();assert.equal(await f.status(),'Alarma activa');assert.equal(f.os.size,1);
 assert.equal(f.calls.filter(row=>row[0]==='schedule').length,2);
 const failure=f.incidents().find(row=>row.cause==='schedule');assert.equal(failure.retry,'resolved');assert.equal(failure.attempts,1);
});

test('persistent activation failures remain inactive after the bounded retry and recover on a later refresh',async()=>{
 const f=alarmFixture();await f.start();await f.edit({time:'18:00'});f.state.failSchedule=20;
 await f.refresh();assert.equal(await f.status(),'Alarma no activada');assert.equal(f.os.size,0);
 assert.equal(f.calls.filter(row=>row[0]==='schedule').length,3);
 assert.ok(f.incidents().some(row=>row.cause==='schedule'&&row.attempts===2&&row.retry==='waiting_foreground'));
 f.state.failSchedule=0;await f.refresh();assert.equal(await f.status(),'Alarma activa');assert.equal(f.os.size,1);
 const log=f.disk.get('go_alarm_incidents_v1');for(const secret of ['PRIVATE','private-owner','private-task','2035-10-13','live:USER'])assert.equal(log.includes(secret),false);
});

test('a missing native readback, unsupported environment and preferences failure never activate an alarm',async()=>{
 for(const reason of ['readback','web','preferences']){const f=alarmFixture(reason==='web'?'web':'ios');
  if(reason==='readback')f.state.omitReadback=true;if(reason==='preferences')f.state.failPreferences=true;
  await f.start();assert.equal(await f.status(),'Alarma no activada');
  assert.ok(f.incidents().some(row=>row.cause===({readback:'readback_mismatch',web:'unsupported',preferences:'preferences'}[reason])));
  if(reason==='preferences'){f.state.failPreferences=false;await f.refresh();assert.equal(await f.status(),'Alarma activa');}
 }
});

test('editing invalidates the receipt immediately; cancellation and a failed cancellation cannot claim active',async()=>{
 const f=alarmFixture();await f.start();await f.edit({time:'18:00'});
 const changed=f.refresh();assert.equal(f.runtime.getNativeReminderReports(alarmScope).length,0);await changed;assert.equal(await f.status(),'Alarma activa');
 await f.edit({reminders:[],notificationsEnabled:false});f.state.failCancel=true;await f.refresh();
 assert.equal(await f.status(),'Alarma no activada');assert.equal(f.os.size,1);assert.ok(f.incidents().some(row=>row.cause==='cancel'&&row.retry==='waiting_foreground'));
 f.state.failCancel=false;await f.refresh();assert.equal(f.os.size,0);assert.equal(await f.status(),'Alarma no activada');
 assert.equal((await f.store.readGoLog()).length,1);
});

test('interrupted native scheduling is fenced on logout; unfinished attempts survive a process restart locally',async()=>{
 const f=alarmFixture();let release;f.state.scheduleGate=new Promise(resolve=>{release=resolve;});const opening=f.start();
 for(let i=0;i<30&&!f.calls.length;i++)await tick();assert.equal(f.calls[0][0],'schedule');
 assert.ok(f.incidents().some(row=>row.cause==='activation'&&row.retry==='in_progress'));
 const recovered=f.load('lib/goAlarmIncidents.ts');await recovered.recordAlarmAttempt(alarmScope.context,'ios');
 assert.ok(f.incidents().some(row=>row.cause==='interrupted'&&row.retry==='waiting_foreground'));
 const closing=f.runtime.suspendNativeTaskReminders();release();await opening;await closing;
 assert.equal(f.os.size,0);assert.equal(f.runtime.getNativeReminderReports(alarmScope).length,0);
});

test('repeated and concurrent refreshes reuse one request; expired and duplicated task records cannot claim active',async()=>{
 const f=alarmFixture();await f.start();await Promise.all([f.refresh(),f.refresh(),f.refresh()]);
 assert.equal(f.os.size,1);assert.equal(f.calls.filter(row=>row[0]==='schedule').length,1);
 f.advance(4*86400000);assert.equal(await f.status(),'Alarma no activada');await f.refresh();assert.equal(f.os.size,0);
 const g=alarmFixture();await g.start();await g.store.updateGoLog(rows=>({entries:[...rows,...rows],result:null}));await g.refresh();
 assert.equal(await g.status(),'Alarma no activada');assert.equal(g.os.size,0);
});

test('RECUÉRDAME schedules the explicitly owned alarm at its actual time and preserves the selected silent mode',async()=>{
 const f=alarmFixture();await f.store.updateGoLog(()=>({entries:[alarmTask({type:undefined,goAlarmReminder:true,reminderSound:false,reminders:[0]})],result:null}));
 await f.start();assert.equal(await f.status(),'Alarma activa');const request=[...f.os.values()][0];
 assert.equal(request.content.sound,false);assert.equal(JSON.parse(request.content.data.signature)[0],new Date('2035-10-13T17:00:00').getTime());
 assert.equal(request.content.data.minutes,0);
});

test('the real Landing and note alarm controls render only the two binary states, without a yellow diagnostics notice',async()=>{
 const f=alarmFixture(),R={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),
  useState:value=>[typeof value==='function'?value():value,()=>{}],useRef:value=>({current:value}),useEffect(){},useCallback:fn=>fn,useSyncExternalStore:(_,snapshot)=>snapshot()};
 const native=new Proxy({Platform:{OS:'ios'},PixelRatio:{getFontScale:()=>1}},{get:(target,key)=>target[key]??key});
 const ui=f.load('components/landing/LandingActionCompletion.tsx',{react:{...R,default:R},'react-native':native,'@/constants/colors':f.module('constants/colors.ts'),
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})},'@/components/ui/GoCloseButton':{GoCloseButton:'Close'},
  '@/lib/goActionCompletion':f.module('lib/goActionCompletion.ts')});
 const note=f.load('components/notes/GoAlarmStatus.tsx',{react:{...R,default:R},'react-native':native,
  '@/lib/goTaskReminders':f.reminders,'@/lib/goTaskReminderRuntime':f.runtime});
 const picker=f.load('components/notes/GoNoteReminderPicker.tsx',{react:{...R,default:R},'react-native':native,
  '@/lib/goNoteTools':f.module('lib/goNoteTools.ts'),'./GoNoteToolFooter':{GoNoteToolFooter:'Footer'}});
 for(const unified of [false,true])for(const dateISO of ['', '2035-10-13']){
  const selection=picker.GoNoteReminderPicker({value:15,onChange(){},dateISO,time:'17:00',unified});
  assert.doesNotMatch(text(selection),/permis|notificaci|notification|phone|programar|schedule|intervalo se conserva/i);
 }
 const model={scope:alarmScope,doc:{preferences:{defaultDurationMinutes:60,reminderMinutes:60},records:{}},unresolved:[alarmTask()],pending:[],failedDecisions:[],savingCount:0};
 for(const active of [false,true,false]){
  if(active)await f.start();else if(f.os.size){f.state.permission={granted:false,canAskAgain:false,ios:{status:1}};await f.refresh();}
  const status=await f.status(),tree=ui.LandingActionCompletion({model:{...model,alarmStatus:()=>status},frame:{x:0,y:0,width:360,height:280},onPendingList(){},onPropose(){}});
  assert.equal(text(nodes(tree).find(node=>node.props.testID==='completion-alarm-status')),status);
  assert.equal(text(note.GoAlarmStatus({entry:alarmTask(),scope:alarmScope})),status);
  assert.doesNotMatch(text(tree),/conserva tu solicitud|permisos|servidor|notificacion|confirmar todos|diagn[oó]stic/i);
  assert.equal(nodes(tree).find(node=>node.props.testID==='completion-alarm-status').props.style.color,'#cbd5e1');
 }
});

test('completion alarms require the current action schedule and actual native metadata, including after an edit at the same reminder time',async()=>{
 const f=alarmFixture(),store=f.module('lib/goActionCompletionStore.ts'),core=f.module('lib/goActionCompletion.ts');
 const entry=alarmTask({duration:'30min'});store.setCompletionSource(alarmScope,[entry]);
 f.runtime.registerActionCompletionRuntime(f.module('lib/goActionCompletionNotifications.ts').completionNotificationPolicy);
 const at=new Date('2035-10-14T19:00:00').getTime();
 await store.updateCompletionDocument(alarmScope,()=>true,doc=>({...doc,records:{[core.completionKey(entry)]:{history:[],remindAt:at}}}));
 await f.start();
 const R={useState:value=>[typeof value==='function'?value():value,()=>{}],useRef:value=>({current:value}),useEffect(){},useMemo:fn=>fn(),useCallback:fn=>fn,useSyncExternalStore:(_,get)=>get()};
 const hook=f.load('hooks/useActionCompletion.ts',{react:R,'react-native':{},'@/hooks/useAssistantZoneScope':{useAssistantZoneScope:()=>({ready:true,scope:alarmScope})},
  '@/contexts/OwnerBusinessDemoContext':{useOwnerBusinessDemo:()=>({demo:null,catalog:null})},'@/data/demoBookingRepository':{},
  '@/lib/goActionCompletionStore':store,'@/lib/goActionCompletion':core,'@/lib/goTaskReminderRuntime':f.runtime,'@/lib/goActionCompletionNotifications':{}});
 assert.equal(hook.useActionCompletion([entry]).alarmStatus(entry),'Alarma activa');
 const changed={...entry,time:'18:00'};store.setCompletionSource(alarmScope,[changed]);
 assert.equal(hook.useActionCompletion([changed]).alarmStatus(changed),'Alarma no activada');
 await f.refresh();assert.equal(hook.useActionCompletion([changed]).alarmStatus(changed),'Alarma activa');
 assert.equal([...f.os.values()].filter(row=>row.content.data.goActionCompletion===true).length,8);
 await store.updateCompletionDocument(alarmScope,()=>true,doc=>({...doc,records:{...doc.records,[core.completionKey(changed)]:{...doc.records[core.completionKey(changed)],alerts:false}}}));
 assert.equal(hook.useActionCompletion([changed]).alarmStatus(changed),'Alarma no activada');await f.refresh();
 assert.equal([...f.os.values()].some(row=>row.content.data.goActionCompletion===true),false);
});

test('journal writes serialize, deduplicate and stay bounded; corrupted journal and local storage failure never fake support delivery',async()=>{
 const f=alarmFixture();f.disk.set('go_alarm_incidents_v1','broken JSON');
 await Promise.all(Array.from({length:6},()=>f.journal.recordAlarmReconciliation([{taskId:'PRIVATE',minutes:60,status:'denied'}],alarmScope.context,'ios')));
 assert.equal(f.incidents().length,1);assert.equal(f.incidents()[0].attempts,6);assert.equal(f.incidents()[0].support,'local_only');
 const g=alarmFixture();g.state.failJournal=true;await g.start();assert.equal(await g.status(),'Alarma activa');
 assert.equal(g.disk.has('go_alarm_incidents_v1'),false);assert.ok(g.warnings.length);assert.ok(g.journal.getLocalAlarmIncidents().length);g.state.failJournal=false;await g.refresh();
 assert.ok(g.incidents().every(row=>row.support==='local_only'));assert.ok(f.warnings.some(message=>message.includes('rebuilding')));
 for(let i=0;i<90;i++){
  await f.journal.recordAlarmReconciliation([{taskId:'PRIVATE',minutes:0,status:'denied'}],alarmScope.context,'ios');
  await f.journal.recordAlarmReconciliation([],alarmScope.context,'ios');
 }
 assert.ok(f.incidents().length<=80);
});

test('the actual RECUÉRDAME save awaits persistence, requests the native flow and ignores a concurrent SAVE tap',async()=>{
 const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];
 (function walk(node){all.push(node);ts.forEachChild(node,walk);})(ast);
 const create=all.find(node=>ts.isVariableDeclaration(node)&&node.name.getText(ast)==='createReminder').initializer.getText(ast);
 for(const denied of [false,true]){
  const f=alarmFixture(),toasts=[],closed=[];await f.start();if(denied)f.state.permission={granted:false,canAskAgain:false,ios:{status:1}};
  const context={exports:{},reminderSaveLock:{current:false},remindTime:'19:00',noteIdentityRef:{current:{ready:true,scope:alarmScope}},
   userGoPhone:'',makeUid:()=> 'standalone-created',remindDateLabel:'13/10/2035',remindDateISO:'2035-10-13',remindText:'PRIVATE STANDALONE TEXT',remindAlertType:'discreta',t:value=>value,
   assertTaskUser:f.module('lib/goTaskAccess.ts').assertTaskUser,updateGoLog:f.store.updateGoLog,getGoLogSnapshot:f.store.getGoLogSnapshot,setGoLog(){},
   setRemindOpen:value=>closed.push(value),setRemindText(){},setRemindTime(){},setRemindPreset(){},showToast:(...args)=>toasts.push(args),
   refreshNativeTaskReminders:f.runtime.refreshNativeTaskReminders,describeReminders:f.reminders.describeReminders,recordAlarmReconciliation:f.journal.recordAlarmReconciliation,Platform:{OS:'ios'}};
  vm.runInNewContext(ts.transpileModule('exports.create='+create,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  await Promise.all([context.exports.create(),context.exports.create()]);const rows=await f.store.readGoLog();
  assert.equal(rows.length,2);assert.equal(rows.filter(row=>row.id==='standalone-created').length,1);assert.equal(closed.length,1);
  assert.equal(rows[0].goAlarmReminder,true);assert.deepEqual(Array.from(rows[0].reminders),[0]);assert.equal(rows[0].taskContext,alarmScope.context);
  assert.equal(toasts.at(-1)[0],denied?'Alarma no activada':'Alarma activa');
  assert.equal([...f.os.values()].filter(row=>row.content.data.taskId==='standalone-created').length,denied?0:1);
 }
});

test('the existing start-time polling leaves native alarms to the OS and preserves ordinary GO alerts',()=>{
 const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];
 (function walk(node){all.push(node);ts.forEachChild(node,walk);})(ast);
 const check=all.find(node=>ts.isVariableDeclaration(node)&&node.name.getText(ast)==='check'&&node.initializer?.getText(ast).includes('reminderNotifiedRef.current.has'));
 const f=alarmFixture(),scheduler=f.module('lib/goNativeReminderScheduler.ts'),date=new Date('2035-10-12T12:00:00'),due=new Date(date.getTime()+5*60000),toasts=[];
 class Clock extends Date{constructor(...args){super(...(args.length?args:[date.getTime()]));}}
 const hour=String(due.getHours()).padStart(2,'0')+':'+String(due.getMinutes()).padStart(2,'0'),day=date.toISOString().slice(0,10);
 const context={Date:Clock,goLog:[alarmTask({estado:'aceptado',dateISO:day,time:hour}),{id:'ordinary-go',estado:'aceptado',dateISO:day,time:hour}],
  Platform:{OS:'ios'},isNativeReminderTask:scheduler.isNativeReminderTask,reminderNotifiedRef:{current:new Set()},resolveIntentLabel:entry=>entry.id,
  showToast:value=>toasts.push(value),t:()=> '__LABEL__',Haptics:{notificationAsync:()=>Promise.resolve(),NotificationFeedbackType:{Warning:1}}};
 vm.runInNewContext(ts.transpileModule('const check='+check.initializer.getText(ast)+';check();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 assert.deepEqual(toasts,['ordinary-go']);
});

test('actual support draft and PDF recover after unmount; clearing text preserves the file and another business stays empty',async()=>{
 const f=fixture();let tree=f.render();await tick();tree=f.render();
 nodes(tree).find(n=>n.props.testID==='support-text').props.onChangeText('Borrador persistente');tree=f.render();
 const pdf=f.files.asset('private.pdf',200,'application/pdf');f.picker.document=async()=>({canceled:false,assets:[pdf]});
 icon(tree,'Adjuntar referencia').props.onPress();tree=f.render();await menu(tree).props.onFile();await tick();f.render();await tick();
 f.unmount();await tick();
 const next=fixture(undefined,{local:f.local,files:f.files});next.render();await tick();tree=next.render();
 assert.equal(nodes(tree).find(n=>n.props.testID==='support-text').props.value,'Borrador persistente');
 assert.ok(text(tree).includes('private.pdf'));
 icon(tree,'Limpiar texto del borrador').props.onPress();next.render();await tick();next.unmount();
 const last=fixture(undefined,{local:f.local,files:f.files});last.render();await tick();tree=last.render();
 assert.equal(nodes(tree).find(n=>n.props.testID==='support-text').props.value,'');assert.ok(text(tree).includes('private.pdf'));
 last.unmount();
 const business=fixture(undefined,{local:f.local,files:f.files});business.props.businessId='44444444-4444-4444-8444-444444444444';
 business.render();await tick();tree=business.render();
 assert.equal(nodes(tree).find(n=>n.props.testID==='support-text').props.value,'');assert.equal(text(tree).includes('private.pdf'),false);business.unmount();
});

test('a delayed draft recovery cannot repopulate the old account after a session change',async()=>{
 let resolveRead;
 const options={authUid:'user-a',getItem:()=>new Promise(resolve=>{resolveRead=resolve;})};
 const f=fixture(undefined,options);f.render();await tick();
 options.authUid='user-b';f.sessionChanged();f.render();await tick();
 resolveRead(JSON.stringify({drafts:{incident:'Private old account',improvement:'',help:''},files:{incident:[],improvement:[],help:[]},pending:{}}));
 await tick();const tree=f.render();
 assert.equal(nodes(tree).find(n=>n.props.testID==='support-text').props.value,'');
 assert.equal(nodes(tree).find(n=>n.props.testID==='support-text').props.editable,false);f.unmount();
});

test('an uncertain request keeps its idempotency key across a complete editor remount',async()=>{
 const keys=[];let fail=true;const gateway={create:async command=>{keys.push(command.requestKey);if(fail)throw Error('lost response');return{id:'r',reference:'AY-TEST',requestKey:command.requestKey,status:'received'};}};
 const f=fixture(gateway);f.render();await tick();let tree=f.render();nodes(tree).find(n=>n.props.testID==='support-text').props.onChangeText('Solicitud sintética');tree=f.render();
 await button(tree,'ENVIAR').props.onPress();f.render();await tick();f.unmount();fail=false;
 const next=fixture(gateway,{local:f.local,files:f.files});next.render();await tick();tree=next.render();
 assert.equal(nodes(tree).find(n=>n.props.testID==='support-text').props.value,'Solicitud sintética');
 await button(tree,'ENVIAR').props.onPress();tree=next.render();await tick();
 assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.ok(text(tree).includes('AY-TEST'));next.unmount();
});

test('own requests pass explicit business context and foreground refresh receives the real new response',async()=>{
 const scopes=[];let answered=false;
 const f=fixture({listOwn:async()=>[],listOwnPage:async(offset,limit,businessId,owner)=>{scopes.push({businessId,owner});return{total:1,items:[{id:'r',reference:'AY-SYNTHETIC',status:'received',response:answered?'Respuesta real de prueba':undefined}]};}});
 f.props.kind='mine';f.props.businessId='44444444-4444-4444-8444-444444444444';
 f.render();await tick();f.render();answered=true;f.foreground();await tick();f.render();
 assert.ok(scopes.length>=2);assert.ok(scopes.every(s=>s.businessId===f.props.businessId&&s.owner==='user-a'));
 f.sessionChanged();const tree=f.render();assert.equal(text(tree).includes('AY-SYNTHETIC'),false);f.unmount();
});

test('paper bin clears only the current AYUDA text without sending or removing attachments',async()=>{
 const sends=[];const f=fixture({supportsAttachments:true,create:async command=>{sends.push(command);throw Error('unexpected send');}});
 const drafts={incident:'Incidencia parcial',improvement:'Mejora parcial',help:'Ayuda parcial'};
 for(const kind of ['incident','improvement','help']){
  const props={...f.props,kind};let tree=f.render(props);
  const input=()=>nodes(tree).find(n=>n.type==='TextInput');
  input().props.onChangeText(drafts[kind]);tree=f.render(props);
  const clear=icon(tree,'Limpiar texto del borrador');assert.ok(clear);assert.equal(clear.props.disabled,false);
  if(kind!=='help'){
   const controls=nodes(tree).find(n=>n.props?.testID==='support-thumb-controls');
   const actions=controls.children.filter(n=>n.type==='IconButton');
   assert.equal(actions[0].props.label,'Limpiar texto del borrador');
   assert.equal(actions[1].props.label,'Adjuntar referencia');
  }
  if(kind==='incident'){
   const pdf=f.files.asset('Reference.pdf',256,'application/pdf');
   f.picker.document=async()=>({canceled:false,assets:[pdf]});
   icon(tree,'Adjuntar referencia').props.onPress();tree=f.render(props);
   menu(tree).props.onFile();await tick();tree=f.render(props);
   assert.ok(text(tree).includes('Reference.pdf'));
  }
  clear.props.onPress();tree=f.render(props);assert.equal(input().props.value,'');
  if(kind==='incident')assert.ok(nodes(tree).some(n=>n.props?.accessibilityLabel==='Quitar Reference.pdf'));
  assert.equal(icon(tree,'Limpiar texto del borrador').props.disabled,true);
  f.render({...props,visible:false});tree=f.render(props);assert.equal(input().props.value,'');
 }
 assert.deepEqual(sends,[]);
});

test('real AYUDA buttons render only their centered label without changing the normal orbit renderer',()=>{
 const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('index.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const declarations=['_orbitLighten','_orbitDarken','PremiumOrbitBtn'].map(name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast)).join('\n');
 const scope={result:null,React:{createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),useRef:value=>({current:value}),useState:value=>[value,()=>{}],Fragment:'Fragment'},
  useLanguage:()=>({t:x=>x}),Animated:{View:'AnimatedView',Value:class{}},View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',LinearGradient:'LinearGradient',Feather:'Feather',Ionicons:'Ionicons'};
 vm.runInNewContext(ts.transpileModule(declarations,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,scope);
 for(const flat of [false,true])for(const action of api.SUPPORT_ORBIT_ACTIONS){
  const calls=[],props={color:'#4A80BD',selected:false,onPress:()=>calls.push(action.kind),icon:action.icon,label:action.label,size:65,iconSize:24,labelSize:10,labelSpacing:0,paddingH:4,flat};
  const normal=scope.PremiumOrbitBtn(props),help=scope.PremiumOrbitBtn({...props,labelOnly:true});
  assert.equal(nodes(normal).filter(n=>n.type==='Feather').length,1);assert.equal(nodes(help).filter(n=>n.type==='Feather'||n.type==='Ionicons').length,0);
  const label=nodes(help).find(n=>n.type==='Text');assert.equal(text(label),action.label);assert.equal(label.props.style.textAlign,'center');
  const surface=nodes(help).find(n=>n.children?.includes(label));assert.equal(surface.props.style.alignItems,'center');assert.equal(surface.props.style.justifyContent,'center');assert.equal(surface.props.style.gap,0);
  const tap=nodes(help).find(n=>n.type==='TouchableOpacity');tap.props.onPress();assert.deepEqual(calls,[action.kind]);assert.equal(JSON.stringify(tap.props.style),JSON.stringify(nodes(normal).find(n=>n.type==='TouchableOpacity').props.style));
 }
});

test('AYUDA keeps only the shared lateral exit; the old orbital exit is absent',()=>{
 const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('index.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),exits=[];
 (function visit(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='GoCloseButton'&&n.attributes.getText(ast).includes('Salir del modo ayuda'))exits.push(n);ts.forEachChild(n,visit);})(ast);
 assert.equal(exits.length,1);
 const attrs=exits[0].attributes.properties;assert.equal(attrs.find(p=>p.name?.text==='level').initializer.text,'container');assert.ok(attrs.some(p=>p.name?.text==='preserveTouchSize'));
 const handler=attrs.find(p=>p.name?.text==='onPress').initializer.expression.getText(ast),calls=[];
 vm.runInNewContext(ts.transpileModule('const press='+handler+';press();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{setSupportMode:v=>calls.push(typeof v==='function'?v(true):v)});assert.deepEqual(calls,[false]);
});
test('the real Landing entry toggles orbital help instead of opening the former options panel',()=>{
 const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('index.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler,mount;
 const visit=n=>{if((ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n))&&n.tagName.getText(ast)==='PremiumOrbitBtn'&&n.attributes.getText(ast).includes('AYÚDANOS A MEJORAR'))handler=n.attributes.properties.find(p=>p.name?.getText(ast)==='onPress').initializer.expression;
 if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='LandingSupport')mount=n;ts.forEachChild(n,visit);};visit(ast);assert.ok(handler&&mount);
 const calls=[];vm.runInNewContext(ts.transpileModule('const tap=('+handler.getText(ast)+');tap();tap();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{setSupportMode:fn=>calls.push(fn(calls.at(-1)??false))});assert.deepEqual(calls,[true,false]);
 assert.equal(mount.attributes.properties.find(p=>p.name?.text==='gateway')?.initializer?.getText(ast).includes('supportGateway'),true,'the real gateway is mounted for an authenticated user');
});
test('central GO opens the existing help consultation only in AYUDA mode',()=>{
 const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('index.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let go;
 (function visit(n){if(ts.isJsxOpeningElement(n)&&n.tagName.getText(ast)==='TouchableOpacity'&&n.attributes.properties.some(p=>p.name?.getText(ast)==='delayLongPress'&&p.initializer?.getText(ast).includes('450')))go=n;ts.forEachChild(n,visit);})(ast);
 assert.ok(go);const press=go.attributes.properties.find(p=>p.name?.getText(ast)==='onPress').initializer.expression.getText(ast),long=go.attributes.properties.find(p=>p.name?.getText(ast)==='onLongPress').initializer.expression.getText(ast),calls=[];
 const scope={supportMode:true,voiceActive:false,setSupportKind:v=>calls.push(['kind',v]),setSupportOpen:v=>calls.push(['open',v]),setSupportAiRequest:fn=>calls.push(['ai',fn(0)]),openAi:v=>calls.push(['ordinary',v]),isUserV1Surface:true,aiOpen:false};
 vm.runInNewContext(ts.transpileModule('const tap='+press+';const hold='+long+';tap();hold();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,scope);
 assert.deepEqual(calls,[['kind','help'],['open',true],['ai',1],['kind','help'],['open',true],['ai',1]]);
 calls.length=0;vm.runInNewContext(ts.transpileModule('const tap='+press+';tap();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{...scope,supportMode:false});assert.deepEqual(calls,[['ordinary',true]]);
 const f=fixture();let p={...f.props,kind:'help',initialAssistantRequest:1};f.render(p);let tree=f.render(p);const chat=nodes(tree).find(n=>n.type==='GOChatScreen');assert.ok(chat);assert.equal(chat.props.consultation.title,'AYUDA GO');assert.equal(chat.props.consultation.respond,undefined);
});
test('AYUDA groups its four real actions consecutively and leaves the normal orbit renderer unchanged',()=>{
 const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('index.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];
 (function walk(n){all.push(n);ts.forEachChild(n,walk)})(ast);
 const decl=name=>all.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);
 const mode=all.find(n=>ts.isConditionalExpression(n)&&n.whenTrue.getText(ast).includes('testID="landing-quiet-orbits"')).whenTrue;
 const calls=[],scope={result:null,React:{createElement:(type,props,...children)=>({type,props,children:children.flat(Infinity)})},View:'View',GoCloseButton:'GoCloseButton',PremiumOrbitBtn:'PremiumOrbitBtn',StyleSheet:{absoluteFill:{}},SUPPORT_ORBIT_ACTIONS:api.SUPPORT_ORBIT_ACTIONS,SUPPORT_ADMIN_ORBITS:api.SUPPORT_ADMIN_ORBITS,supportOrbitSlot:api.supportOrbitSlot,handedness:'right',goView:{isAdminView:false},adminAccess:{isOwner:false},openSupportAdmin:v=>calls.push(v),
 supportMode:true,orbitWrapSize:275,orbitRadiusVisual:99,orbitBtnVisualSize:65,uiScaleFactor:1,openSupportAction:k=>calls.push(k),setSupportMode:v=>calls.push(v)};
 const code=['GO_COLORS','INTENTS'].map(n=>'const '+decl(n).getText(ast)+';').join('\n')+'result='+mode.getText(ast);
 vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{alwaysStrict:false,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,scope);
 const help=scope.result.children;assert.equal(help.length,4);
 scope.supportMode=false;vm.runInNewContext(ts.transpileModule('result='+mode.getText(ast),{compilerOptions:{alwaysStrict:false,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,scope);
 const userOrbits=scope.result.children;
 assert.equal(userOrbits.length,8,'the complete user orbit remains visible');
 assert.deepEqual(userOrbits.map(n=>n.children[0].props.color),['#1e40af','#f97316','#78350f','#0d9488','#c026d3','#15803d','#eab308','#9ca3af']);
 assert.ok(userOrbits.every(n=>n.children[0].props.dimmed===false),'inactive user orbit slots retain their original full opacity');
 assert.ok(userOrbits.every(n=>n.props.pointerEvents==='none'),'the restored colors do not activate restricted actions');
 const colors={mine:'#f97316',improvement:'#78350f',help:'#15803d',incident:'#c026d3'};
 for(let i=0;i<4;i++){const h=help[i].children[0].props;assert.equal(h.labelOnly,true);assert.equal(h.label,api.SUPPORT_ORBIT_ACTIONS[i].label);assert.equal(h.color,colors[api.SUPPORT_ORBIT_ACTIONS[i].kind]);h.onPress();}
 assert.deepEqual(calls,['incident','improvement','help','mine']);
 assert.equal(help.filter(n=>n.children[0].props.dimmed).length,0);assert.equal(help.filter(n=>n.props.pointerEvents==='none').length,0);
 scope.supportMode=true;scope.handedness='left';vm.runInNewContext(ts.transpileModule('result='+mode.getText(ast),{compilerOptions:{alwaysStrict:false,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,scope);
 assert.deepEqual(scope.result.children.map(n=>n.children[0].props.label),help.map(n=>n.children[0].props.label));
 for(const action of api.SUPPORT_ORBIT_ACTIONS){const f=fixture();f.render({...f.props,kind:action.kind});const tree=f.render({...f.props,kind:action.kind});assert.ok(text(tree).includes(action.title));
  const nav=nodes(tree).filter(n=>n.type==='GoCloseButton');assert.equal(nav.length,1);assert.equal(nav[0].props.level,'panel');assert.equal(nav[0].props.appearance,'light');nav[0].props.onPress();assert.deepEqual(f.navigation,['abort','back']);}
});
test('the ADMIN permission selects seven support queues and EQUIPO, while USER keeps four forms',()=>{
 const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('index.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];
 (function walk(n){all.push(n);ts.forEachChild(n,walk)})(ast);
 const mode=all.find(n=>ts.isConditionalExpression(n)&&n.whenTrue.getText(ast).includes('testID="landing-quiet-orbits"')).whenTrue;
 const colors={comida:'#f97316',fiesta:'#c026d3',cafe:'#78350f',deporte:'#15803d',shopping:'#FFD700',viaje:'#2563eb',reunion:'#a855f7'};
 const opened=[],scope={result:null,React:{createElement:(type,props,...children)=>({type,props,children:children.flat(Infinity)})},View:'View',PremiumOrbitBtn:'PremiumOrbitBtn',StyleSheet:{absoluteFill:{}},
   SUPPORT_ORBIT_ACTIONS:api.SUPPORT_ORBIT_ACTIONS,SUPPORT_ADMIN_ORBITS:api.SUPPORT_ADMIN_ORBITS,GO_COLORS:colors,INTENTS:[],supportMode:true,fullLandingArchitecture:true,
   goView:{isAdminView:true},adminAccess:{isOwner:true},openSupportAdmin:value=>opened.push(value),openSupportAction:value=>opened.push(value),orbitWrapSize:300,orbitRadiusVisual:99,orbitBtnVisualSize:65,uiScaleFactor:1};
 const run=()=>vm.runInNewContext(ts.transpileModule('result='+mode.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,scope);
 run();assert.equal(scope.result.children.length,8);
 assert.equal(api.SUPPORT_ADMIN_ORBITS[7].view,'team');assert.equal(api.SUPPORT_ADMIN_ORBITS[7].label,'EQUIPO');
 assert.equal(scope.result.children[7].children[0].props.color,'#9ca3af');
 scope.result.children.forEach((item,index)=>{assert.equal(item.children[0].props.label,api.SUPPORT_ADMIN_ORBITS[index].label);item.children[0].props.onPress();});
 assert.deepEqual(JSON.parse(JSON.stringify(opened)),JSON.parse(JSON.stringify(api.SUPPORT_ADMIN_ORBITS.map(item=>item.view))));
 scope.adminAccess.isOwner=false;opened.length=0;run();assert.equal(scope.result.children.length,4);
 assert.deepEqual(JSON.parse(JSON.stringify(scope.result.children.map(item=>item.children[0].props.label))),JSON.parse(JSON.stringify(api.SUPPORT_ORBIT_ACTIONS.map(item=>item.label))));
});
test('floating back hides the keyboard first and preserves the current form',()=>{
 const f=fixture();f.render();let tree=f.render(),nav=()=>nodes(tree).find(n=>n.type==='GoCloseButton');
 nodes(tree).find(n=>n.type==='TextInput').props.onChangeText('Conservar texto');
 f.events.get('keyboardWillShow')();tree=f.render();assert.equal(nav().props.keyboardVisible,true);
 assert.equal(nodes(tree).some(n=>n.type==='GoNavigationFloating'),false,'writing controls never mount a persisted drag host');
 assert.equal(nodes(tree).find(n=>n.type==='KeyboardAvoidingView').props.style[1].paddingBottom,0);
 nav().props.onPress();assert.deepEqual(f.navigation,['keyboard']);tree=f.render();assert.equal(nav().props.keyboardVisible,false);
 assert.equal(nodes(tree).some(n=>n.type==='GoNavigationFloating'),false);
 assert.equal(nodes(tree).find(n=>n.type==='KeyboardAvoidingView').props.style[1].paddingBottom,34);
 assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'Conservar texto');
 nav().props.onPress();assert.deepEqual(f.navigation,['keyboard','abort','back']);
});
test('orbit is in the dominant bottom corner, safe and at least 44pt for both hands and iPhone widths',()=>{
 for(const width of [320,375,430])for(const hand of ['left','right']){const r=api.supportOrbitRect(width,844,{left:0,right:0,bottom:34},hand);
 assert.ok(r.width>=44&&r.height>=44);assert.equal(r.y+r.height,844-34-8);assert.equal(hand==='left'?r.x:width-r.x-r.width,12);}
});
test('unconfigured real UI never sends or displays a fake empty history; close preserves draft and account change clears it',()=>{
 const f=fixture();f.render();let tree=f.render();assert.ok(text(tree).includes('Comunicar incidencia'));assert.equal(button(tree,'Proponer mejora'),undefined);
 const input=()=>nodes(tree).find(n=>n.type==='TextInput');input().props.onChangeText('Texto privado');tree=f.render({...f.props,visible:false});tree=f.render();assert.equal(input().props.value,'Texto privado');assert.equal(button(tree,'ENVIAR').props.disabled,true);
 tree=f.render({...f.props,kind:'mine'});assert.ok(text(tree).includes('pendiente de conexión al servidor'));assert.equal(text(tree).includes('No tienes solicitudes registradas'),false);
 f.render({...f.props,scopeKey:'user-b'});tree=f.render({...f.props,scopeKey:'user-b'});tree=f.render({...f.props,scopeKey:'user-b'});assert.equal(input().props.value,'');
});
test('real submit prevents concurrent sends, confirms only a valid receipt and keeps one request key for an uncertain retry',async()=>{
 let resolve,calls=0,keys=[];const gateway={listOwn:async()=>[],create:command=>{calls++;keys.push(command.requestKey);return new Promise(r=>{resolve=r;});}};
 const f=fixture(gateway);f.render();let tree=f.render();nodes(tree).find(n=>n.type==='TextInput').props.onChangeText('Ayuda');tree=f.render();const send=button(tree,'ENVIAR').props.onPress;
 const first=send();await send();await tick();assert.equal(calls,1);resolve({id:'r',reference:'GO-1',requestKey:'wrong',status:'received'});await first;tree=f.render();assert.ok(text(tree).includes('No se ha confirmado'));assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'Ayuda');
 const retry=button(tree,'ENVIAR').props.onPress();await tick();resolve({id:'r',reference:'GO-1',requestKey:keys[1],status:'received'});await retry;tree=f.render();assert.equal(keys[0],keys[1]);assert.ok(text(tree).includes('Recibida ·'));assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'');
});
test('an uncertain send cannot become a second request when the draft changes',async()=>{
 const keys=[];const gateway={listOwn:async()=>[],create:async command=>{keys.push(command.requestKey);throw Error('upload failed after persistence');}};
 const f=fixture(gateway);let tree=f.render();tree=f.render();
 nodes(tree).find(n=>n.type==='TextInput').props.onChangeText('Texto original');tree=f.render();
 await button(tree,'ENVIAR').props.onPress();tree=f.render();assert.equal(keys.length,1);
 nodes(tree).find(n=>n.type==='TextInput').props.onChangeText('Texto cambiado');tree=f.render();
 await button(tree,'ENVIAR').props.onPress();tree=f.render();
 assert.equal(keys.length,1);assert.ok(text(tree).includes('El envío anterior puede haberse recibido'));
});
test('old-account replies never appear after changing identity; history uses the own-only operation',async()=>{
 let release;const f=fixture({create:async()=>{},listOwn:()=>new Promise(r=>{release=r;})});f.render();let tree=f.render();f.render({...f.props,kind:'mine'});
 const oldRelease=release;f.render({...f.props,scopeKey:'user-b'});oldRelease([{id:'old',reference:'PRIVATE',status:'answered'}]);await tick();tree=f.render({...f.props,scopeKey:'user-b'});assert.equal(text(tree).includes('PRIVATE'),false);
});
test('Mis solicitudes loads later pages without duplicating existing requests',async()=>{
 const pages=[];const gateway={create:async()=>{},listOwn:async()=>[],listOwnPage:async(offset,limit)=>{pages.push([offset,limit]);
   return {items:offset?[{id:'second',reference:'AY-2',status:'pending',kind:'help',summary:'Segunda',detail:'Segunda'}]:[{id:'first',reference:'AY-1',status:'received',kind:'help',summary:'Primera',detail:'Primera'}],total:2};}};
 const f=fixture(gateway),props={...f.props,kind:'mine'};f.render(props);await tick();let tree=f.render(props);
 assert.ok(text(tree).includes('Primera'));nodes(tree).find(n=>n.props.accessibilityLabel==='Cargar más solicitudes').props.onPress();await tick();tree=f.render(props);
 assert.deepEqual(pages,[[0,30],[1,30]]);assert.ok(text(tree).includes('Primera'));assert.ok(text(tree).includes('Segunda'));
});
test('invalid messages cannot reach transport and mismatched receipts cannot confirm delivery',async()=>{
 let calls=0;const gateway={create:async()=>{calls++;return {}},listOwn:async()=>[]};
 await assert.rejects(api.sendSupportRequest(gateway,{kind:'help',message:' ',requestKey:'one'}));assert.equal(calls,0);
 await assert.rejects(api.sendSupportRequest(gateway,{kind:'help',message:'Ayuda',requestKey:'one'}));assert.equal(calls,1);
});
test('four white surfaces keep one arrow and a safe bottom composer without provisional messages',()=>{
 for(const kind of ['incident','improvement','help','mine']){
  const f=fixture();f.render({...f.props,kind});const tree=f.render({...f.props,kind}),all=nodes(tree);
  const screen=all.find(n=>n.type==='KeyboardAvoidingView');assert.equal(screen.props.style[0].backgroundColor,'#ffffff');assert.equal(screen.props.style[1].paddingBottom,34);assert.equal(screen.props.style[1].paddingTop,47);
  assert.equal(all.filter(n=>n.type==='GoCloseButton').length,1);const nav=all.find(n=>n.props.testID==='support-thumb-controls');assert.equal(nav.props.style[0].flexShrink,0);assert.equal(nav.props.style[1].flexDirection,'row');
  assert.equal(all.filter(n=>n.type==='GoAssistantButton').length,1);assert.equal(text(tree).includes('Disponible próximamente'),false);
  assert.equal(text(tree).includes('Incluir contexto'),false);assert.equal(text(tree).includes('contraseñas'),false);assert.equal(all.some(n=>n.props.accessibilityRole==='checkbox'),false);
  const input=all.find(n=>n.type==='TextInput');if(input){assert.equal(input.props.placeholder,undefined);assert.equal(input.props.style[0].color,'#17212b');assert.ok(input.props.style[1].height>=44);assert.equal(all.find(n=>n.props.testID==='support-writing-scroll').props.contentContainerStyle.justifyContent,'flex-end');}else assert.equal(kind,'mine');
 }
});
test('real photo/document handlers import privately, preview and remove individually without network or note changes',async()=>{
 const f=fixture();f.render();let tree=f.render(),photo=f.files.asset('Photo.jpg'),pdf=f.files.asset('Report.pdf',256,'application/pdf');
 f.picker.photo=async options=>{assert.deepEqual(Array.from(options.mediaTypes),['images']);return{canceled:false,assets:[{...photo,fileName:photo.name,fileSize:photo.size}]};};
 icon(tree,'Adjuntar referencia').props.onPress();tree=f.render();menu(tree).props.onPhotos();await tick();tree=f.render();assert.equal(nodes(tree).filter(n=>n.type==='Image').length,1);assert.ok(text(tree).includes('Photo.jpg'));assert.equal(button(tree,'ENVIAR').props.disabled,true);
 f.picker.document=async()=>({canceled:false,assets:[pdf]});icon(tree,'Adjuntar referencia').props.onPress();tree=f.render();menu(tree).props.onFile();await tick();tree=f.render();assert.ok(text(tree).includes('Report.pdf'));
 const remove=nodes(tree).find(n=>n.props.accessibilityLabel==='Quitar Photo.jpg');remove.props.onPress();await tick();tree=f.render();assert.equal(nodes(tree).filter(n=>n.type==='Image').length,0);assert.ok(text(tree).includes('Report.pdf'));assert.ok(f.files.data.has(photo.uri));
 tree=f.render({...f.props,visible:false});tree=f.render();assert.ok(text(tree).includes('Report.pdf'),'ordinary close preserves local attachments');
});
test('cancellation, invalid file and stale native picker results never add a misleading preview',async()=>{
 const f=fixture();f.render();let tree=f.render();icon(tree,'Adjuntar referencia').props.onPress();tree=f.render();menu(tree).props.onPhotos();await tick();tree=f.render();assert.equal(nodes(tree).filter(n=>n.type==='Image').length,0);
 f.picker.photo=async()=>({canceled:false,assets:[f.files.asset('Huge.jpg',11*1024*1024)]});menu(tree).props.onPhotos();await tick();tree=f.render();assert.ok(text(tree).includes('supera 10 MB'));assert.equal(nodes(tree).filter(n=>n.type==='Image').length,0);
 let resolve;f.picker.photo=()=>new Promise(r=>resolve=r);menu(tree).props.onPhotos();f.render({...f.props,scopeKey:'user-b'});resolve({canceled:false,assets:[f.files.asset()]});await tick();tree=f.render({...f.props,scopeKey:'user-b'});assert.equal(nodes(tree).filter(n=>n.type==='Image').length,0);assert.equal(f.files.copied.length,0);
});
test('request template renders real summaries, type/date/status and expands real detail and response',async()=>{
 const rows=[{id:'one',reference:'GO-123',requestKey:'k',kind:'incident',summary:'Problema de prueba',createdAt:'2026-11-06T10:00:00Z',status:'in_review',detail:'Detalle sintético',revision:1}];
 const f=fixture({listOwn:async()=>rows,detail:async()=>({...rows[0],messages:[{id:'m',authorId:'admin',body:'Respuesta sintética',internal:false,createdAt:'2026-11-06T11:00:00Z'}]}),create:async()=>{throw Error('unexpected')}});f.render({...f.props,kind:'mine'});await tick();let tree=f.render({...f.props,kind:'mine'});
 for(const value of ['Problema de prueba','Comunicar incidencia','6/11/2026','En revisión'])assert.ok(text(tree).includes(value));assert.equal(text(tree).includes('Respuesta sintética'),false);
 button(tree,'Problema de prueba').props.onPress();await tick();tree=f.render({...f.props,kind:'mine'});assert.ok(text(tree).includes('Detalle sintético'));assert.ok(text(tree).includes('Respuesta sintética'));
});
test('attachment transport requires explicit capability and matching stored receipt for every file',async()=>{
 const files=[{id:'local1',uri:'file:///private/a.pdf',name:'a.pdf',mime:'application/pdf',size:128}],command={kind:'incident',message:'Incidencia',requestKey:'one'};let calls=0;
 const gateway={listOwn:async()=>[],create:async()=>{calls++;return{id:'r',reference:'GO-1',requestKey:'one',status:'received'}}};
 await assert.rejects(api.sendSupportRequest(gateway,command,files));assert.equal(calls,0);gateway.supportsAttachments=true;await assert.rejects(api.sendSupportRequest(gateway,command,files));assert.equal(calls,1);
 gateway.create=async(cmd,received)=>{assert.equal(received,files);assert.equal(cmd.context,undefined);return{id:'r',reference:'GO-1',requestKey:'one',status:'received',attachments:[{id:'remote1',clientId:'local1',name:'a.pdf'}]};};
 assert.equal((await api.sendSupportRequest(gateway,command,files)).id,'r');
});
test('closing during an authorized request cannot leave the reopened form stuck or cause a duplicate',async()=>{
 let release,calls=0;const f=fixture({listOwn:async()=>[],create:command=>{calls++;return new Promise(r=>release=()=>r({id:'r',reference:'GO-2',status:'received',requestKey:command.requestKey}));}});
 f.render();let tree=f.render();nodes(tree).find(n=>n.type==='TextInput').props.onChangeText('Ayuda');tree=f.render();const sent=button(tree,'ENVIAR').props.onPress();await tick();f.render({...f.props,visible:false});
 release();await sent;tree=f.render();assert.equal(calls,1);assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'');assert.ok(text(tree).includes('Recibida ·'));assert.equal(text(tree).includes('Enviando'),false);
});

test('GO opens the existing assistant in all four contexts; only explicit, current proposals can replace the preserved draft',()=>{
 for(const kind of ['incident','improvement','help','mine']){
  const f=fixture(),props={...f.props,kind,handedness:'left'};f.render(props);let tree=f.render(props);
  const input=()=>nodes(tree).find(n=>n.type==='TextInput');input()?.props.onChangeText('Borrador original');tree=f.render(props);
  nodes(tree).find(n=>n.type==='GoAssistantButton').props.onPress();tree=f.render(props);const ai=nodes(tree).find(n=>n.type==='GOChatScreen');assert.ok(ai);assert.equal(ai.props.handedness,'left');assert.equal(ai.props.consultation.sourceText,kind==='mine'?'':'Borrador original');
  assert.equal(ai.props.consultation.respond,undefined);assert.equal(f.speech.toggles,0);
  if(kind==='mine')assert.equal(ai.props.consultation.onAcceptDraft,undefined);
  else{assert.equal(input().props.value,'Borrador original');ai.props.consultation.onAcceptDraft('Propuesta aceptada','Borrador original');tree=f.render(props);assert.equal(input().props.value,'Propuesta aceptada');}
  ai.props.onClose();tree=f.render(props);assert.equal(nodes(tree).some(n=>n.type==='GOChatScreen'),false);
  ai.props.consultation.onAcceptDraft?.('Respuesta tardía','Propuesta aceptada');tree=f.render(props);if(kind!=='mine')assert.equal(input().props.value,'Propuesta aceptada');
 }
});

test('AI back, stale baseline and account changes cannot erase or expose a support draft',()=>{
 const f=fixture();f.render();let tree=f.render();const input=()=>nodes(tree).find(n=>n.type==='TextInput');input().props.onChangeText('Mi borrador');tree=f.render();nodes(tree).find(n=>n.type==='GoAssistantButton').props.onPress();tree=f.render();let ai=nodes(tree).find(n=>n.type==='GOChatScreen');
 input().props.onChangeText('Edición posterior');tree=f.render();ai.props.consultation.onAcceptDraft('Reemplazo','Mi borrador');tree=f.render();assert.equal(input().props.value,'Edición posterior');assert.ok(text(tree).includes('Conservamos tu borrador'));
 ai.props.onClose();tree=f.render();assert.equal(input().props.value,'Edición posterior');
 nodes(tree).find(n=>n.type==='GoAssistantButton').props.onPress();tree=f.render();ai=nodes(tree).find(n=>n.type==='GOChatScreen');f.render({...f.props,scopeKey:'user-b'});tree=f.render({...f.props,scopeKey:'user-b'});ai.props.consultation.onAcceptDraft('Privado','Edición posterior');tree=f.render({...f.props,scopeKey:'user-b'});assert.equal(input().props.value,'');
});

test('separate microphone inserts one final transcript at the native cursor without replacing existing or selected text',()=>{
 const f=fixture();f.render();let tree=f.render();const input=()=>nodes(tree).find(n=>n.type==='TextInput');input().props.onChangeText('antes después');tree=f.render();input().props.onSelectionChange({nativeEvent:{selection:{start:5,end:5}}});icon(tree,'Dictar solicitud').props.onPress();assert.equal(f.speech.toggles,1);f.voice.onPreparedText('dictado');f.voice.onPreparedText('dictado');tree=f.render();assert.equal(input().props.value,'antes dictado después');assert.equal(button(tree,'ENVIAR').props.disabled,true);
 input().props.onChangeText('Texto manual');tree=f.render();input().props.onSelectionChange({nativeEvent:{selection:{start:0,end:12}}});icon(tree,'Dictar solicitud').props.onPress();f.voice.onPreparedText('añadido');tree=f.render();assert.equal(input().props.value,'Texto manual añadido');
 icon(tree,'Dictar solicitud').props.onPress();f.render({...f.props,kind:'help'});f.voice.onPreparedText('antiguo');tree=f.render({...f.props,kind:'help'});assert.equal(input().props.value,'');
});

test('all three writing forms dock four fixed controls 6pt above the real composer for both hands and compact heights',()=>{
 for(const kind of ['incident','improvement','help'])for(const width of [320,375,390,430,768])for(const height of [140,180,220,480,690])for(const handedness of ['right','left']){
  const f=fixture(),p={...f.props,kind,handedness};f.render(p);let tree=f.render(p);
  nodes(tree).find(n=>n.props.testID==='support-workspace').props.onLayout({nativeEvent:{layout:{height}}});
  nodes(tree).find(n=>n.type==='TextInput').props.onContentSizeChange({nativeEvent:{contentSize:{height:1800}}});
  f.events.get('keyboardWillShow')();tree=f.render(p);
  const input=nodes(tree).find(n=>n.type==='TextInput'),footer=nodes(tree).find(n=>n.props.testID==='support-thumb-controls'),dock=nodes(tree).find(n=>n.props.testID==='support-composer-dock'),fixed=nodes(tree).find(n=>n.props.testID==='support-fixed-controls'),composer=nodes(tree).find(n=>n.props.testID==='support-composer');
  assert.ok(input.props.style[1].height<=(height<220?Math.max(44,height-90):Math.max(96,height-104)));assert.ok(input.props.scrollEnabled);
  assert.equal(footer.props.style[1].flexDirection,handedness==='right'?'row':'row-reverse');
  assert.equal(fixed.props.style[1].alignItems,handedness==='right'?'flex-end':'flex-start');
  assert.equal(dock.props.style.flexShrink,0);assert.equal(fixed.props.style[0].marginBottom,6);
  assert.ok(!dock.props.style.position&&!fixed.props.style[0].position&&!footer.props.style[0].position,'layout follows the composer, not absolute screen coordinates');
  assert.equal(dock.children.filter(n=>n&&typeof n==='object')[0],fixed);assert.equal(dock.children.filter(n=>n&&typeof n==='object')[1],composer);
  assert.ok(nodes(fixed).includes(footer));assert.ok(nodes(composer).some(n=>n.type==='GoSendButton'));
  assert.equal(nodes(tree).some(n=>n.type==='GoNavigationFloating'||n.type==='DraggableFAB'||n.type==='GestureDetector'),false,'no gesture or AsyncStorage position is mounted');
  assert.deepEqual(footer.children.map(n=>n.type),['IconButton','IconButton','GoAssistantButton','GoCloseButton']);
  assert.ok(44+44+56+64+3*8<=width-32-24,'unchanged controls fit the available width including side margins');
  const dockHeight=input.props.style[1].height+124;
  dock.props.onLayout({nativeEvent:{layout:{height:dockHeight}}});tree=f.render(p);
  icon(tree,'Adjuntar referencia').props.onPress();tree=f.render(p);
  assert.equal(menu(tree).props.handedness,handedness);assert.ok(menu(tree).props.maxHeight<=Math.max(80,height-dockHeight-18));
  const tray=nodes(tree).find(n=>n.props.pointerEvents==='box-none'&&n.props.style?.bottom===dockHeight+18);assert.ok(tray,'attachment menu clears the measured dock, including its unavailable-send notice');
 }
});

test('keyboard open, system hide, back dismissal, reopens and multiline resize never change the fixed composer gap',()=>{
 for(const kind of ['incident','improvement','help'])for(const handedness of ['right','left']){
  const f=fixture(),p={...f.props,kind,handedness};f.render(p);let tree=f.render(p);
  nodes(tree).find(n=>n.type==='TextInput').props.onChangeText('Borrador que se conserva');
  for(let i=0;i<4;i++){
   f.events.get('keyboardWillShow')();tree=f.render(p);
   nodes(tree).find(n=>n.type==='TextInput').props.onContentSizeChange({nativeEvent:{contentSize:{height:80+i*75}}});tree=f.render(p);
   assert.equal(nodes(tree).find(n=>n.props.testID==='support-fixed-controls').props.style[0].marginBottom,6);
   assert.equal(nodes(tree).find(n=>n.type==='GoCloseButton').props.keyboardVisible,true);
   if(i%2)nodes(tree).find(n=>n.type==='GoCloseButton').props.onPress();else f.events.get('keyboardDidHide')();
   tree=f.render(p);assert.equal(nodes(tree).find(n=>n.type==='GoCloseButton').props.keyboardVisible,false);
   assert.equal(nodes(tree).find(n=>n.type==='KeyboardAvoidingView').props.style[1].paddingBottom,34);
   assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'Borrador que se conserva');
   assert.equal(nodes(tree).find(n=>n.props.testID==='support-fixed-controls').props.style[0].marginBottom,6);
   assert.equal(nodes(tree).some(n=>n.type==='GoNavigationFloating'),false);
  }
  const reopened=fixture();reopened.render(p);const newTree=reopened.render(p);
  assert.equal(nodes(newTree).find(n=>n.props.testID==='support-fixed-controls').props.style[0].marginBottom,6,'fresh mount uses the same flow and cannot restore legacy fab_pos coordinates');
 }
});

test('disabled send has an adjacent visible explanation and keeps each form draft and attachment',async()=>{
 for(const kind of ['incident','improvement','help']){
  const f=fixture(),p={...f.props,kind};f.render(p);let tree=f.render(p);
  nodes(tree).find(n=>n.type==='TextInput').props.onChangeText('Conservar mi solicitud');tree=f.render(p);
  f.picker.document=async()=>({canceled:false,assets:[f.files.asset('referencia.pdf',10,'application/pdf')]});
  icon(tree,'Adjuntar referencia').props.onPress();tree=f.render(p);menu(tree).props.onFile();await tick();tree=f.render(p);
  const dock=nodes(tree).find(n=>n.props.testID==='support-composer-dock'),notice=nodes(tree).find(n=>n.props.testID==='support-send-unavailable');
  assert.ok(nodes(dock).includes(notice));assert.match(text(notice),/Envío temporalmente deshabilitado/);
  assert.equal(button(tree,'ENVIAR').props.disabled,true);await button(tree,'ENVIAR').props.onPress();tree=f.render(p);
  assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'Conservar mi solicitud');assert.ok(text(tree).includes('referencia.pdf'));assert.ok(!text(tree).includes('Recibida ·'));
  f.render({...p,visible:false});tree=f.render(p);assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'Conservar mi solicitud');assert.ok(text(tree).includes('referencia.pdf'));
 }
});

test('Mis solicitudes enlarges GO moderately and keeps its single close immediately beside it for either hand',()=>{
 for(const handedness of ['left','right']){const f=fixture(),p={...f.props,kind:'mine',handedness};f.render(p);const tree=f.render(p),group=nodes(tree).find(n=>n.props.testID==='support-thumb-controls');const floating=nodes(tree).find(n=>n.type==='GoNavigationFloating');assert.equal(floating.props.width,136);assert.equal(floating.props.handedness,handedness);assert.deepEqual(group.children.filter(Boolean).map(n=>n.type),['GoAssistantButton','GoCloseButton']);assert.equal(group.children.filter(Boolean)[0].props.size,64);assert.equal(nodes(tree).some(n=>n.type==='TextInput'),false);}
});
