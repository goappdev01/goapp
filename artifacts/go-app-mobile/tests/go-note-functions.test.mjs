import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import lifecycle from './helpers/react-lifecycle.cjs';
const { React, createRoot, document, evaluate } = lifecycle;
const ts = createRequire(path.join(process.cwd(), 'package.json'))('typescript');
const plain = x => JSON.parse(JSON.stringify(x));
const load = (file, imports = {}) => {
  const ctx = { exports: {}, Date, Intl, console, require(name) { if (name in imports) return imports[name]; throw Error('Unexpected import '+name); } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { alwaysStrict: false,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
  }}).outputText, ctx); return ctx.exports;
};
const tools = load('lib/goNoteTools.ts');
const scope = { userId: 'note-owner', context: 'demo:USER' };
function futureEntry(extra = {}) {
  const day = new Date(Date.now() + 7 * 86400000); day.setHours(12, 0, 0, 0);
  return { id: 'one-note', kind: 'sent', type: 'TAREA_INTERNA', notes: 'Mi nota', detail: 'Detalle intacto',
    intentKey: 'nota_interna', estado: 'pendiente', dateISO: [day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-'),
    time: '12:00', duration: '', ...extra };
}
async function fixture({ permission = 'allowed', platform = 'ios' } = {}) {
  let raw = '[]', user = scope.userId, valid = true, writes = 0, currentScope = scope;
  const calls = { schedule: [], cancel: [], permissions: [] }, os = new Map();
  const storage = { getItem: async key => { assert.equal(key,'go_log_v1'); return raw; }, setItem: async(key,value)=>{
    assert.equal(key,'go_log_v1'); raw=value; writes++;
  }};
  const access=load('lib/goTaskAccess.ts',{'@/data/booking':{ getAuthenticatedUserId: async()=>user }});
  const reminder=load('lib/goTaskReminders.ts',{'@workspace/api-zod':{},'./goLogBridge':{},'./goTaskAccess':access});
  const model=load('lib/goNativeReminderScheduler.ts',{'./goTaskAccess':access,'./goTaskReminders':reminder,'./goNoteTools':tools});
  const reopen=()=>load('lib/goLogStore.ts',{'@react-native-async-storage/async-storage':storage,'./goTaskAccess':access});
  let store=reopen();
  const ports={platform,readTasks:()=>store.readGoLog(),now:()=>Date.now(),scopeValid:async expected=>valid&&user===expected.userId&&currentScope.context===expected.context,
    permissions:async requested=>{calls.permissions.push(requested);return permission;},pending:async()=>[...os.values()],delivered:async()=>[],
    schedule:async item=>{calls.schedule.push(plain(item));os.set(item.identifier,{identifier:item.identifier,data:{taskId:item.taskId,minutes:item.minutes,signature:item.signature}});return item.identifier;},
    cancel:async id=>{calls.cancel.push(id);os.delete(id);},dismiss:async()=>{},
  };
  const scheduler=model.createNativeReminderScheduler(ports); await scheduler.setScope(scope,'sound');
  const runtime={ refreshNativeTaskReminders: (expected,requested)=>scheduler.refresh(expected,{requestPermission:requested}) };
  const api=()=>load('lib/goNoteReminder.ts',{'./goLogStore':store,'./goTaskAccess':access,'./goTaskReminderRuntime':runtime,'./goTaskReminders':reminder,'./goNoteTools':tools});
  return {calls,os,scheduler,reminder,model,get raw(){return raw;},get writes(){return writes;},get store(){return store;},api,
    active:()=>valid&&user===scope.userId&&currentScope.context===scope.context,
    setUser:value=>user=value,setValid:value=>valid=value,
    async setScope(value){currentScope=value;await scheduler.setScope(value,'sound');},
    async reopen(){store=reopen();await store.readGoLog();},
  };
}

test('bell offers exactly the eleven requested offsets, with Spanish and English labels',()=>{
  assert.deepEqual([...tools.NOTE_REMINDER_MINUTES],[5,10,15,30,45,60,120,180,360,720,1440]);
  for(const n of tools.NOTE_REMINDER_MINUTES){assert.equal(tools.isNoteReminderMinutes(n),true);assert.ok(tools.noteReminderLabel(n).endsWith('antes'));assert.ok(tools.noteReminderLabel(n,true).endsWith('before'));}
  for(const invalid of [0,-1,6,25,1450,'15',null,NaN])assert.equal(tools.isNoteReminderMinutes(invalid),false);
});
for(const minutes of tools.NOTE_REMINDER_MINUTES)test(minutes+' minutes: persisted note programs exactly one real-queue request at the right instant',async()=>{
  const f=await fixture(),entry=futureEntry();
  const result=await f.api().saveGoNoteReminder(entry,{scope,minutes},f.active);
  assert.equal(f.os.size,1);assert.equal(f.calls.schedule.length,1);assert.equal(f.calls.schedule[0].at,f.reminder.reminderTaskInstant(entry)-minutes*60000);
  assert.equal(f.calls.permissions.at(-1),true);assert.equal(result.saved.id,entry.id);
  const [saved]=JSON.parse(f.raw);assert.equal(saved.ownerUserId,scope.userId);assert.equal(saved.taskContext,scope.context);
  assert.deepEqual(saved.reminders,[minutes]);assert.equal(saved.detail,entry.detail);assert.equal(saved.estado,entry.estado);
  await f.reopen();assert.deepEqual(plain((await f.store.readGoLog())[0].reminders),[minutes]);
  await f.scheduler.refresh(scope);assert.equal(f.calls.schedule.length,1,'Reload does not duplicate the OS request');
});
test('retry keeps one note, and changing/removing its offset updates/cancels the same native queue',async()=>{
  const f=await fixture(),entry=futureEntry(),draft={scope,minutes:15};
  await f.api().saveGoNoteReminder(entry,draft,f.active);await f.api().saveGoNoteReminder(entry,draft,f.active);
  assert.equal(JSON.parse(f.raw).length,1);assert.equal(f.calls.schedule.length,1);
  await f.api().changeGoNoteReminder(entry.id,{scope,minutes:120},f.active);
  assert.equal(f.os.size,1);assert.equal(f.calls.schedule.at(-1).minutes,120);assert.equal(f.calls.cancel.length,1);
  await f.api().changeGoNoteReminder(entry.id,{scope,minutes:null},f.active);
  assert.equal(f.os.size,0);const [saved]=JSON.parse(f.raw);assert.deepEqual(saved.reminders,[]);
  assert.equal(saved.notificationsEnabled,false);assert.equal(saved.notes,entry.notes);assert.equal(saved.estado,entry.estado);
});
test('moving the note date/time cancels the old schedule without discarding the relative offset',async()=>{
  const f=await fixture(),entry=futureEntry();await f.api().saveGoNoteReminder(entry,{scope,minutes:45},f.active);
  const oldAt=f.calls.schedule[0].at;
  await f.store.updateGoLog(entries=>({entries:entries.map(row=>({...row,time:'18:30'})),result:undefined}));
  await f.scheduler.refresh(scope);assert.equal(f.os.size,1);assert.equal(f.calls.cancel.length,1);
  assert.equal(f.calls.schedule.at(-1).at-oldAt,6.5*3600000);assert.deepEqual(JSON.parse(f.raw)[0].reminders,[45]);
});
test('past or undated notes keep their selection but never schedule a past/fabricated alarm',async()=>{
  for(const override of [{dateISO:'2001-01-02'},{time:''},{dateISO:''}]){
    const f=await fixture();const result=await f.api().saveGoNoteReminder(futureEntry(override),{scope,minutes:15},f.active);
    assert.equal(f.os.size,0);assert.equal(f.calls.schedule.length,0);assert.deepEqual(JSON.parse(f.raw)[0].reminders,[15]);
    assert.ok(/pasado|fecha|hora/.test(result.message));
  }
});
test('permission denial is explicit, preserves the note, and never claims scheduling succeeded',async()=>{
  const f=await fixture({permission:'denied'});const result=await f.api().saveGoNoteReminder(futureEntry(),{scope,minutes:5},f.active);
  assert.equal(f.os.size,0);assert.equal(JSON.parse(f.raw).length,1);assert.match(result.message,/no programado|permite las notificaciones/i);
});
test('web fallback is explicit; Android and iOS use the same existing native scheduler',async()=>{
  const web=await fixture({platform:'web'});const result=await web.api().saveGoNoteReminder(futureEntry(),{scope,minutes:60},web.active);
  assert.equal(web.os.size,0);assert.match(result.message,/no permite programar/);
  const android=await fixture({platform:'android'});await android.api().saveGoNoteReminder(futureEntry(),{scope,minutes:60},android.active);assert.equal(android.os.size,1);
});
test('a note containing a list title and bullets still uses the note queue without altering the separate Lists classifier',async()=>{
  const f=await fixture(),entry=futureEntry({notes:'Lista de compra',detail:'- Pan\n- Leche'});
  await f.api().saveGoNoteReminder(entry,{scope,minutes:15},f.active);assert.equal(f.os.size,1);
  const saved=JSON.parse(f.raw)[0];assert.equal(saved.notes,entry.notes);assert.equal(saved.detail,entry.detail);
  assert.equal(f.model.nativeReminderTaskInScope(saved,scope),true);
  assert.equal(f.model.nativeReminderTaskInScope(saved,{...scope,userId:'other'}),false);
  assert.equal(f.model.nativeReminderTaskInScope(saved,{...scope,context:'demo:BUSINESS:another'}),false);
});
test('identity and company isolation fence saved-note edits without changing other data',async()=>{
  const f=await fixture(),entry=futureEntry();await f.api().saveGoNoteReminder(entry,{scope,minutes:15},f.active);
  const raw=f.raw,writes=f.writes;f.setUser('other');
  await assert.rejects(f.api().changeGoNoteReminder(entry.id,{scope,minutes:60},()=>true),/cuenta/);assert.equal(f.raw,raw);assert.equal(f.writes,writes);
  f.setUser(scope.userId);
  await assert.rejects(f.api().changeGoNoteReminder(entry.id,{scope:{...scope,context:'demo:BUSINESS:another'},minutes:null},()=>true),/contexto/);
  assert.equal(f.raw,raw);f.setValid(false);await assert.rejects(f.api().saveGoNoteReminder(futureEntry({id:'new'}),{scope,minutes:5},f.active),/contexto/);
});
test('duplicate IDs, deleted notes and arbitrary non-note records cannot be adopted by the bell editor',async()=>{
  for(const override of [{deleted:true},{estado:'rechazado'},{goNoteReminder:false}]){
    const f=await fixture();await f.api().saveGoNoteReminder(futureEntry(),{scope,minutes:15},f.active);
    await f.store.updateGoLog(entries=>({entries:entries.map(row=>({...row,...override})),result:undefined}));
    await assert.rejects(f.api().changeGoNoteReminder('one-note',{scope,minutes:null},f.active),/disponible/);
  }
});

test('keyboard viewport adapts to screen, safe area, keyboard frame and measured header instead of a phone-specific height',()=>{
  for(const height of [568,667,812,844,926])for(const top of [20,47,59]){
    const kbTop=height-300,header=45;
    const limit=tools.noteKeyboardContentHeight(height,kbTop,top,header,7,0);
    assert.equal(limit+top+header+7,kbTop);assert.ok(limit>=0);
    assert.equal(tools.noteKeyboardContentHeight(height,null,top,header,7,34),height-top-header-7-34);
  }
  assert.equal(tools.noteKeyboardContentHeight(200,80,60,45,7,0),0);
});

const settle=async fn=>React.act(async()=>{if(fn)await fn();for(let i=0;i<12;i++)await Promise.resolve();});
async function voiceFixture() {
  let callback,live,visible=true,identity='A',voiceStatus='idle',voiceError='';const calls=[];
  const useBookingVoice=fn=>{callback=fn;return{status:voiceStatus,error:voiceError,transcript:'',
    start:async()=>calls.push('start'),stop:async()=>calls.push('stop'),abort:()=>calls.push('abort')}};
  const api=evaluate('hooks/useGoNoteVoice.ts',{'./useBookingVoice':{useBookingVoice},'@/lib/goNoteTools':tools});
  function Fixture(){const [title,setTitle]=React.useState('Nota'),[detail,setDetail]=React.useState('Texto escrito');
    live={...api.useGoNoteVoice({visible,identity,title,setTitle,setDetail,english:false}),title,detail};return null;}
  const root=createRoot(document.createElement('div'));const render=()=>root.render(React.createElement(Fixture));await settle(render);
  return {get live(){return live},calls,async emit(text){await settle(()=>callback(text));},
    async update(props){if('visible'in props)visible=props.visible;if('identity'in props)identity=props.identity;if('status'in props)voiceStatus=props.status;if('error'in props)voiceError=props.error;await settle(render)},
    async run(fn){await settle(fn)},async close(){await settle(()=>root.unmount())}};
}
test('microphone targets the field selected when listening starts and appends without clearing existing writing',async()=>{
  const f=await voiceFixture();try{
    await f.run(()=>{f.live.focus('detail');return f.live.toggle()});assert.equal(f.calls.at(-1),'start');
    await f.run(()=>f.live.focus('title'));await f.emit('texto dictado');assert.equal(f.live.detail,'Texto escrito texto dictado');assert.equal(f.live.title,'Nota');
    await f.update({status:'listening'});await f.run(()=>f.live.toggle());assert.equal(f.calls.at(-1),'stop');
  }finally{await f.close()}
});
test('closing the note or changing identity aborts dictation and rejects delayed transcription',async()=>{
  const f=await voiceFixture();try{
    await f.run(()=>{f.live.focus('detail');return f.live.toggle()});await f.update({visible:false});await f.emit('late');assert.equal(f.live.detail,'Texto escrito');
    await f.update({visible:true});await f.run(()=>f.live.toggle());await f.update({identity:'B'});await f.emit('other identity');assert.equal(f.live.detail,'Texto escrito');assert.ok(f.calls.filter(c=>c==='abort').length>=2);
  }finally{await f.close()}
});
test('the existing title limit is preserved, with a visible full dictation notice rather than silent truncation',async()=>{
  const f=await voiceFixture();try{
    await f.run(()=>f.live.toggle());await f.emit('Texto demasiado largo para un título');
    assert.equal(f.live.title,'Nota');assert.match(f.live.notice,/16 caracteres.*Texto demasiado largo/);
    await f.update({error:'Permiso de micrófono denegado'});assert.equal(f.live.error,'Permiso de micrófono denegado');
  }finally{await f.close()}
});

const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('index.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
function visit(n){nodes.push(n);ts.forEachChild(n,visit)}visit(ast);
test('keyboard scrolling is opt-in for Nota only; normal closed-keyboard layout, other sheets and Landing remain untouched',()=>{
  const opted=nodes.filter(n=>(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n))&&n.attributes?.properties.some(p=>p.name?.getText(ast)==='noteKeyboardScroll'));
  assert.equal(opted.length,1);assert.equal(opted[0].tagName.getText(ast),'BottomSheet');
  assert.equal(opted[0].attributes.properties.find(p=>p.name?.getText(ast)==='visible').initializer.expression.getText(ast),'notesOpen');
  assert.ok(source.includes('compact && !noteKeyboardScroll ?'));assert.ok(source.includes('bottomOffset={16}'));
  assert.ok(source.includes('noteKeyboardScroll && kbVisible'),'right-edge close pan cannot steal note scrolling while keyboard is open');
  assert.ok(source.includes('onFocus={() => noteVoice.focus("title")}'));assert.ok(source.includes('onFocus={() => noteVoice.focus("detail")}'));
  assert.ok(source.includes('note-dictation-status'));assert.ok(source.includes('note-dictation-error'));
  assert.ok(source.includes('changeQuickNoteReminder(minutes)'));assert.ok(source.includes('onSelectNote={setNoteReminderTargetId}'));
});

const picker=evaluate('components/notes/GoNoteReminderPicker.tsx',{
  'react-native':{View:'View',Text:'Text',TouchableOpacity:'Button'},'@/lib/goNoteTools':tools,
}).GoNoteReminderPicker;
const jsxNodes=tree=>Array.isArray(tree)?tree.flatMap(jsxNodes):React.isValidElement(tree)?[tree,...jsxNodes(tree.props.children)]:[];
const jsxText=tree=>Array.isArray(tree)?tree.map(jsxText).join(''):React.isValidElement(tree)?jsxText(tree.props.children):tree==null?'':String(tree);
for(const english of [false,true])test('bell menu '+(english?'EN':'ES')+': all choices, clear selection and saved-note access are explicit',()=>{
  const changes=[],selected=[];
  const tree=picker({value:15,onChange:n=>changes.push(n),english,savedNotes:[{id:'owned',label:'Mi nota · fecha · hora'}],onSelectNote:id=>selected.push(id)});
  const radios=jsxNodes(tree).filter(n=>n.props.accessibilityRole==='radio');assert.equal(radios.length,12);
  for(const radio of radios){assert.ok(radio.props.style.minHeight>=44);radio.props.onPress();}
  assert.deepEqual(changes,[null,...tools.NOTE_REMINDER_MINUTES]);assert.equal(radios.filter(n=>n.props.accessibilityState.checked).length,1);
  assert.ok(jsxText(tree).includes(english?'No reminder':'Sin aviso'));
  const stored=jsxNodes(tree).find(n=>n.type==='Button'&&jsxText(n)==='Mi nota · fecha · hora');assert.ok(stored);stored.props.onPress();assert.deepEqual(selected,['owned']);
  const editing=picker({value:60,onChange(){},english,targetName:'Nota seleccionada',onSelectNote:id=>selected.push(id),busy:true});
  assert.ok(jsxText(editing).includes('Nota seleccionada'));assert.ok(jsxNodes(editing).filter(n=>n.type==='Button').every(n=>n.props.disabled));
});

test('the real Note creation connection carries the selected offset and guards duplicate taps',()=>{
  const declaration=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='startGoNoteTask');assert.ok(declaration);
  const calls=[],ctx={result:null,lang:'es',noteStartLockRef:{current:false},quickNoteAlarm:true,quickNoteReminderMinutes:15,
    noteIdentityRef:{current:{ready:true,scope}},showToast:(...args)=>calls.push(['toast',...args]),
    setQuickNoteText:text=>calls.push(['title',text]),setQuickNoteDetail:text=>calls.push(['detail',text]),
    openFieldSelector:(...args)=>calls.push(['open',...args])};
  vm.runInNewContext(ts.transpileModule('result = '+declaration.initializer.getText(ast),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  ctx.result('NOTA_INTERNA','Título','Detalle');ctx.result('NOTA_INTERNA','Título','Detalle');
  assert.equal(calls.length,1);assert.equal(calls[0][0],'open');assert.deepEqual(plain(calls[0].at(-1)),{scope,minutes:15});
  ctx.noteStartLockRef.current=false;ctx.noteIdentityRef.current.ready=false;ctx.result('NOTA_INTERNA','Conservado','Detalle');
  assert.equal(calls.filter(call=>call[0]==='open').length,1);assert.ok(calls.some(call=>call[0]==='title'&&call[1]==='Conservado'));
  assert.equal(ctx.noteStartLockRef.current,false,'an unverified account does not consume the creation gesture');
});

async function persistLinkedGo(f, extra = {}, minutes = 15) {
  const entry=tools.bindAttachedNoteReminder(futureEntry({id:'parent-go',type:'GO',attachedNote:'Nota adjunta intacta',reminders:[15],...extra}),{scope,minutes});
  await f.store.updateGoLog(entries=>({entries:[...entries,entry],result:entry}));
  return entry;
}
for(const platform of ['ios','android'])test(platform+': attached note and GO share one persisted request; edit/remove/re-enable never create another task',async()=>{
  const f=await fixture({platform});const entry=await persistLinkedGo(f);
  const message=await f.api().confirmAttachedGoNoteReminder(entry.id,{scope,minutes:15},f.active);
  assert.match(message,/programada/i);assert.equal(f.os.size,1);assert.equal(f.calls.schedule[0].taskId,'parent-go');
  assert.equal(f.model.isNativeReminderTask(entry),true,'native GO is excluded from the legacy polling engine');
  assert.equal(tools.goNoteReminderMinutes(entry),15);assert.equal(JSON.parse(f.raw).length,1);
  await f.reopen();await f.scheduler.refresh(scope);assert.equal(f.calls.schedule.length,1,'Reload keeps the same OS identifier');
  await f.api().changeGoNoteReminder(entry.id,{scope,minutes:60},f.active);
  assert.equal(f.os.size,1);assert.equal(f.calls.cancel.length,1);assert.equal([...f.os.values()][0].data.minutes,60);
  await f.api().changeGoNoteReminder(entry.id,{scope,minutes:null},f.active);assert.equal(f.os.size,0);
  await f.api().changeGoNoteReminder(entry.id,{scope,minutes:30},f.active);assert.equal(f.os.size,1);
  const rows=JSON.parse(f.raw);assert.equal(rows.length,1);assert.equal(rows[0].id,entry.id);assert.equal(rows[0].attachedNote,entry.attachedNote);
  assert.deepEqual(rows[0].reminders,[30]);assert.equal(rows[0].dateISO,entry.dateISO);assert.equal(rows[0].estado,entry.estado);
});
test('unlinking a shared alert keeps the valid GO alert and never creates or deletes another action',async()=>{
  const f=await fixture();await persistLinkedGo(f);await f.scheduler.refresh(scope);
  const identifier=[...f.os.keys()][0];
  await f.store.updateGoLog(rows=>({entries:rows.map(row=>({...row,attachedNote:undefined})),result:undefined}));
  await f.scheduler.refresh(scope);assert.equal(f.os.size,1);assert.equal([...f.os.keys()][0],identifier);assert.equal(f.calls.cancel.length,0);
  const row=(await f.store.readGoLog())[0];assert.equal(tools.isGoNoteReminderTarget(row),false);
  await assert.rejects(f.api().changeGoNoteReminder(row.id,{scope,minutes:null},f.active),/disponible/);
});
test('unlinking a note-only offset cancels only that offset; independent GOs at the same time remain intact',async()=>{
  const f=await fixture();await persistLinkedGo(f,{reminders:[60]},15);
  const independent=futureEntry({id:'independent-note',notes:'Mi nota'});
  await f.api().saveGoNoteReminder(independent,{scope,minutes:15},f.active);await f.scheduler.refresh(scope);
  assert.equal(f.os.size,3);assert.equal(JSON.parse(f.raw).length,2);
  const independentId=[...f.os.values()].find(row=>row.data.taskId===independent.id).identifier;
  await f.store.updateGoLog(rows=>({entries:rows.map(row=>row.id==='parent-go'?{...row,attachedNote:''}:row),result:undefined}));
  await f.scheduler.refresh(scope);assert.equal(f.os.size,2);assert.ok(f.os.has(independentId));
  assert.deepEqual([...f.os.values()].filter(r=>r.data.taskId==='parent-go').map(r=>r.data.minutes),[60]);
  await f.reopen();await f.scheduler.refresh(scope);assert.equal(f.os.size,2);assert.equal(f.calls.cancel.length,1);
});
test('unlinking the only note-owned alarm leaves the GO saved without restoring default polling alerts',async()=>{
  const f=await fixture();await persistLinkedGo(f,{reminders:[]});await f.scheduler.refresh(scope);assert.equal(f.os.size,1);
  await f.store.updateGoLog(rows=>({entries:rows.map(row=>({...row,attachedNote:undefined})),result:undefined}));
  await f.scheduler.refresh(scope);assert.equal(f.os.size,0);assert.equal(JSON.parse(f.raw).length,1);
  const effective=tools.effectiveNoteReminderEntry((await f.store.readGoLog())[0]);
  assert.deepEqual(plain(effective.reminders),[]);assert.equal(effective.notificationsEnabled,false);
  assert.equal(f.model.isNativeReminderTask(effective),true,'unlinked GO cannot revert to a second native/polling engine');
});
test('editing a linked note preserves unrelated offsets, firing history and manual mute; retries are idempotent',async()=>{
  const f=await fixture();const entry=await persistLinkedGo(f,{reminders:[60,15],firedReminderMins:[60],notificationsEnabled:false});
  await f.api().changeGoNoteReminder(entry.id,{scope,minutes:30},f.active);
  const saved=JSON.parse(f.raw)[0];assert.deepEqual(saved.reminders,[60,30]);assert.deepEqual(saved.firedReminderMins,[60]);assert.equal(saved.notificationsEnabled,false);
  await f.api().changeGoNoteReminder(entry.id,{scope,minutes:30},f.active);assert.deepEqual(JSON.parse(f.raw)[0].reminders,[60,30]);assert.equal(f.os.size,0);
  const rebound=tools.bindAttachedNoteReminder(saved,{scope,minutes:30});assert.equal(rebound.goAttachedNoteReminder.shared,false);
});
test('linked notes cannot cross users/businesses, and identity switches cancel their private queue',async()=>{
  const f=await fixture();const entry=await persistLinkedGo(f);await f.scheduler.refresh(scope);const raw=f.raw;
  await assert.rejects(f.api().changeGoNoteReminder(entry.id,{scope:{...scope,context:'demo:BUSINESS:other'},minutes:30},()=>true),/contexto/);assert.equal(f.raw,raw);
  f.setUser('another');await assert.rejects(f.api().confirmAttachedGoNoteReminder(entry.id,{scope,minutes:15},()=>true),/cuenta/);
  await f.setScope({userId:'another',context:scope.context});assert.equal(f.os.size,0);assert.equal(f.raw,raw);
  assert.throws(()=>tools.bindAttachedNoteReminder({...entry,ownerUserId:'another'},{scope,minutes:15}),/contexto/);
});
test('linking a note does not drop existing distinct GO offsets or invent scheduling after a denied permission',async()=>{
  const f=await fixture({permission:'denied'});const entry=await persistLinkedGo(f,{reminders:[180,60,15]},30);
  const message=await f.api().confirmAttachedGoNoteReminder(entry.id,{scope,minutes:30},f.active);
  assert.deepEqual(plain(entry.reminders),[180,60,30,15]);assert.equal(f.os.size,0);assert.match(message,/no programado|permite las notificaciones/i);
  assert.ok(f.calls.permissions.includes(true));assert.equal(JSON.parse(f.raw).length,1);
});
test('the real attachment branch carries the chosen alarm inside GO without creating a separate note entry',()=>{
  const declaration=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='openFieldSelector');assert.ok(declaration);
  const calls=[],ctx={result:null,calendarSlotSavingRef:{current:false},noteTaskDraftRef:{current:null},isActivelyCreating:true,categorySelected:false,lang:'es',
    setAttachedExternalNote:note=>calls.push(['attached',plain(note)]),setNotesOpen:()=>{},setQuickNoteText:()=>{},setQuickNoteDetail:()=>{},
    AsyncStorage:{removeItem:async()=>{}},showToast:()=>{},Haptics:{NotificationFeedbackType:{Success:'success'},notificationAsync:async()=>{}},
    Alert:{alert:()=>assert.fail('The selected alarm must not be discarded with an unsupported warning')}};
  vm.runInNewContext(ts.transpileModule('result = '+declaration.initializer.getText(ast),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  ctx.result('NOTA_EXTERNA','Título','Detalle',undefined,undefined,{scope,minutes:15});
  assert.deepEqual(calls,[['attached',{title:'Título',detail:'Detalle',reminder:{scope,minutes:15}}]]);
});
test('the real GO creation connection persists one shared note/GO record and confirms through the existing queue',async()=>{
  const f=await fixture(),declaration=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='addLogEntry');assert.ok(declaration);
  const confirmations=[],day=futureEntry(),ctx={result:null,makeUid:()=> 'parent-go',t:x=>x,activeLabel:'Nota',activeColor:'#fff',activeKey:'nota',
    place:'Lugar',date:'',dateISO:day.dateISO,time:day.time,duration:'',contactName:'',phone:'',userGoPhone:'',goVisibility:'privado',
    normalizePhoneForWhatsApp:n=>n,sanitizeReminders:n=>[...new Set(n)],noteIdentityRef:{current:{ready:true,scope}},
    bindAttachedNoteReminder:tools.bindAttachedNoteReminder,hasAttachedNoteReminder:tools.hasAttachedNoteReminder,
    setGoLog:fn=>{void f.store.updateGoLog(rows=>({entries:fn(rows),result:undefined}));},persistLog:()=>{},
    confirmAttachedGoNoteReminder:(...args)=>{confirmations.push(args);return f.api().confirmAttachedGoNoteReminder(...args);},
    lang:'es',Alert:{alert:()=>{}},showToast:()=>{},console:{log:()=>{}}};
  vm.runInNewContext(ts.transpileModule('result = '+declaration.initializer.getText(ast),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  assert.equal(ctx.result('sent',{type:'GO',notes:'Padre',attachedNote:'Texto intacto',reminders:[15],attachedNoteReminder:{scope,minutes:15}}),'parent-go');
  await f.store.readGoLog();await new Promise(resolve=>setImmediate(resolve));await f.scheduler.refresh(scope);
  assert.equal(confirmations.length,1);assert.equal(JSON.parse(f.raw).length,1);assert.equal(f.os.size,1);
  assert.deepEqual(JSON.parse(f.raw)[0].reminders,[15]);assert.equal(JSON.parse(f.raw)[0].attachedNote,'Texto intacto');
});

for(const operation of ['save','change'])test('real Note '+operation+' rechecks company context after the final identity await and preserves the shared write queue',async()=>{
  const companyA={userId:scope.userId,context:'demo:BUSINESS:company-a'},companyB={...companyA,context:'demo:BUSINESS:company-b'};
  const original=tools.noteReminderMetadata(futureEntry(),{scope:companyA,minutes:15});
  const other=tools.noteReminderMetadata(futureEntry({id:'other-company',notes:'Nota B'}),{scope:companyB,minutes:60});
  const initial=operation==='change'?[original,other]:[other];
  let raw=JSON.stringify(initial),writes=0,reads=0,current=companyA,release,entered;
  const gate=new Promise(resolve=>release=resolve),checking=new Promise(resolve=>entered=resolve);
  const access={async getTaskUser(){if(++reads===2){entered();await gate;}return companyA.userId;},isPersonalTask:()=>true,
    async assertTaskUser(expected){assert.equal(expected,companyA.userId);}};
  const store=load('lib/goLogStore.ts',{'./goTaskAccess':access,'@react-native-async-storage/async-storage':{
    getItem:async()=>raw,setItem:async(_key,value)=>{raw=value;writes++;}}});
  let refreshes=0;
  const api=load('lib/goNoteReminder.ts',{'./goLogStore':store,'./goTaskAccess':access,'./goNoteTools':tools,
    './goTaskReminderRuntime':{async refreshNativeTaskReminders(){refreshes++;return[];}},
    './goTaskReminders':{describeReminders:()=>''}});
  const active=()=>current.context===companyA.context;
  const write=()=>operation==='save'?api.saveGoNoteReminder(futureEntry(),{scope:companyA,minutes:30},active)
    :api.changeGoNoteReminder(original.id,{scope:companyA,minutes:30},active);
  const pending=write().then(value=>({value}),error=>({error}));await checking;
  current=companyB;release();const rejected=await pending;
  assert.match(rejected.error?.message??'',/contexto/i);assert.equal(writes,0,'a stale company operation must not reach AsyncStorage.setItem');
  assert.deepEqual(JSON.parse(raw),plain(initial));assert.deepEqual(plain(store.getGoLogSnapshot()),plain(initial));assert.equal(refreshes,0);
  current=companyA;await write();assert.equal(writes,1,'a rejected operation must leave the same queue available for a valid retry');
  const saved=JSON.parse(raw);assert.deepEqual(saved.find(entry=>entry.id==='other-company'),plain(other));
  assert.deepEqual(saved.find(entry=>entry.id===original.id).reminders,[30]);assert.equal(refreshes,1);
});
