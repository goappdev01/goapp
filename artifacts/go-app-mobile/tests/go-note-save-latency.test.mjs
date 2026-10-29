import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import fs from 'node:fs';import vm from 'node:vm';
const require=createRequire(import.meta.url),h=require('./helpers/note-performance-fixture.cjs');
const flat=value=>Object.assign({},...(Array.isArray(value)?value.flat(Infinity):[value]).filter(Boolean));
const write=(ui,id,value)=>ui.run(()=>ui.hosts.get(id).onChangeText(value));
const wait=async(ui,predicate)=>{for(let i=0;i<200&&!predicate();i++)await ui.run(()=>h.pause(5));assert.ok(predicate(),'The editor must respond without waiting for the held native queue');};
const store=async(f,draft)=>{const result=await f.api().saveUnifiedNote(draft,f.scope,f.active);await result.reminderSync;return result;};

test('QUITAR/GUARDAR keep two equal flex surfaces, physical left/right order and disabled neutral removal in both hands',async()=>{
 for(const handedness of ['right','left']){const ui=await h.editorFixture({handedness});try{
  await ui.tool('time');let remove=ui.hosts.get('note-time-clear'),save=ui.hosts.get('note-time-apply'),footer=flat(ui.hosts.get('note-time-apply-footer').style);
  assert.equal(footer.flexDirection,'row');assert.equal(footer.alignItems,'stretch');assert.equal(remove.disabled,true);assert.equal(remove.accessibilityState.disabled,true);assert.equal(flat(remove.style).backgroundColor,'#e7edf2');
  for(const key of ['flex','flexBasis','minWidth','minHeight','paddingHorizontal','paddingVertical','borderRadius'])assert.equal(flat(remove.style)[key],flat(save.style)[key]);
  assert.equal(footer.flexWrap,undefined);await write(ui,'note-time-hour','19');await write(ui,'note-time-minute','30');await ui.tap('note-time-apply');await ui.tool('time');remove=ui.hosts.get('note-time-clear');assert.equal(remove.disabled,false);assert.equal(flat(remove.style).backgroundColor,'#b91c1c');assert.equal(remove.children.props.children,'QUITAR HORA');
  await ui.tap('note-time-clear');assert.equal(ui.hosts.get('note-option-time').accessibilityState.selected,false);await ui.tool('reminder');assert.equal(ui.hosts.get('note-reminder-none').children.props.children,'QUITAR AVISO');assert.equal(ui.hosts.get('note-reminder-none').disabled,true);
 }finally{await ui.close();}}
});

const channel=x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;},rgb=hex=>hex.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16)),luminance=values=>values.map(channel).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
test('each active destination has white label/selection and sufficient contrast even under the lightest sheen; inactive colors stay unchanged',async()=>{
 const ui=await h.editorFixture();try{for(const destination of ['calendar','pending','archive']){await ui.destination(destination);for(const value of ['calendar','pending','archive']){
  const label=flat(ui.hosts.get('note-destination-label-'+value).style),button=ui.hosts.get('note-destination-'+value);assert.equal(button.accessibilityState.checked,value===destination);assert.equal(label.color,value===destination?'#ffffff':'#17212b');
  if(value===destination){const lightest=rgb(flat(button.style).backgroundColor).map(v=>v*.92+255*.08);assert.ok(1.05/(luminance(lightest)+.05)>=4.5);assert.equal(ui.hosts.get('note-destination-selected').style.color,'#ffffff');}
 }} }finally{await ui.close();}
});

test('verified data save does not await a held OS queue; pending notification status is honest and the file survives reopening',async()=>{
 const f=await h.performanceFixture();let release;try{await f.prime();f.block('pending',new Promise(r=>release=r));const api=f.api(),draft=f.draft({destination:'calendar',dateISO:'2027-12-30',time:'18:30',reminderMinutes:15});
  const result=await Promise.race([api.saveUnifiedNote(draft,f.scope,f.active),h.pause(1500).then(()=>assert.fail('Data save waited for the native OS queue'))]);
  assert.equal(f.rows.length,1);assert.equal(f.rows[0].id,draft.id);assert.equal(f.noteProgress.getNoteReminderProgress(f.scope,draft.id).phase,'pending');assert.equal(f.os.size,0,'no false native activation');assert.equal((await f.reopen()).length,1);
  release();const receipt=await result.reminderSync;assert.equal(receipt.phase,'ready');assert.equal(f.os.size,1);assert.equal(f.noteProgress.getNoteReminderProgress(f.scope,draft.id).phase,'ready');
 }finally{release?.();f.close();}
});

test('the real editor closes an edited tool and permits further editing while native work remains pending',async()=>{
 const f=await h.performanceFixture();let ui,release;try{await f.prime(1);const initial=f.rows[0],api=f.api();f.block('pending',new Promise(r=>release=r));let result;
  ui=await h.editorFixture({initial,scope:f.scope,ports:{noteProgress:f.noteProgress},onSave:async draft=>{result=await api.saveUnifiedNote(draft,f.scope,f.active);return result;}});await ui.tool('duration');await ui.tap('note-duration-2h');await ui.tap('note-duration-apply');await wait(ui,()=>ui.hosts.has('note-primary-controls'));
  assert.equal(f.rows[0].note.schedule.duration,'2h');assert.equal(ui.hosts.get('unified-note-save').disabled,false);assert.equal(ui.hosts.get('note-content').editable,true);assert.match(ui.hosts.get('note-reminder-sync-status').children,/comprobando/);await write(ui,'note-content','Sigo escribiendo sin esperar al sistema');assert.equal(ui.hosts.get('note-content').value,'Sigo escribiendo sin esperar al sistema');
  release();await ui.run(()=>result.reminderSync);assert.equal(f.os.size,1);assert.equal(f.rows.length,1);
 }finally{release?.();if(ui)await ui.close();f.close();}
});

test('one refresh verifies 64 real queued requests with two pending reads; synchronous callers share that reconciliation',async()=>{
 const f=await h.performanceFixture();try{await f.prime(64);const reports=await Promise.all(Array.from({length:12},()=>f.runtime.refreshNativeTaskReminders(f.scope)));assert.equal(f.counts.pending,2);assert.equal(f.counts.delivered,1);assert.equal(f.counts.permission,1);assert.equal(f.os.size,64);assert.ok(reports.every(rows=>rows.length===64&&rows.every(row=>row.status==='scheduled')));}finally{f.close();}
});

test('new edits during native work preserve one latest trailing run, original ID and stable notification identifiers',async()=>{
 const f=await h.performanceFixture();let release;try{await f.prime(1);const api=f.api(),initial=f.rows[0];f.block('pending',new Promise(r=>release=r));
  const one=await api.saveUnifiedNote({...f.model.noteDraft(initial),time:'19:00'},f.scope,f.active);await h.pause(0);const two=await api.saveUnifiedNote({...f.model.noteDraft(one.entry),time:'20:00'},f.scope,f.active);assert.equal(f.rows.length,1);assert.equal(f.rows[0].id,initial.id);release();const [old,latest]=await Promise.all([one.reminderSync,two.reminderSync]);assert.equal(old.phase,'superseded');assert.equal(latest.phase,'ready');assert.equal(f.os.size,1);assert.equal(f.noteProgress.getNoteReminderProgress(f.scope,initial.id).operationId,two.entry.note.operationId);assert.ok(f.counts.pending<=4);assert.equal(f.rows[0].note.schedule.time,'20:00');
 }finally{release?.();f.close();}
});

test('logout during the final batch read fences every queued note and leaves unrelated OS requests untouched',async()=>{
 let armed=false,reads=0,release,entered;const gate=new Promise(r=>release=r),inside=new Promise(r=>entered=r);
 const f=await h.performanceFixture({onNativeCall(name){if(armed&&name==='pending'&&++reads===2){f.block('pending',gate);entered();}}});try{
  await f.prime(3);f.os.set('other-app',{identifier:'other-app',content:{data:{}}});armed=true;const refresh=f.runtime.refreshNativeTaskReminders(f.scope);await inside;const logout=f.runtime.suspendNativeTaskReminders();release();await Promise.all([refresh,logout]);
  assert.equal(f.runtime.isNativeTaskScopeActive(f.scope),false);assert.deepEqual([...f.os.keys()],['other-app']);
 }finally{release();f.close();}
});

test('a persisted silent-mode change during a shared flight is reconciled before its final receipt',async()=>{
 const f=await h.performanceFixture();let release;try{await f.prime(2);f.block('pending',new Promise(r=>release=r));const first=f.runtime.refreshNativeTaskReminders(f.scope);await h.pause(0);await f.storage.setItem('go_alert_mode_v1','silent');const latest=f.runtime.refreshNativeTaskReminders(f.scope);release();await Promise.all([first,latest]);assert.equal(f.os.size,0);assert.ok(f.counts.pending<=4);
 }finally{release?.();f.close();}
});

test('failed notification cancellation is a warning after verified data, and an idempotent retry cancels without another note',async()=>{
 const f=await h.performanceFixture();try{await f.prime(1);const api=f.api(),draft={...f.model.noteDraft(f.rows[0]),reminderMinutes:null};f.failCancel(true);const result=await api.saveUnifiedNote(draft,f.scope,f.active);assert.equal(f.rows[0].note.reminderMinutes,null);const receipt=await result.reminderSync;assert.equal(receipt.phase,'warning');assert.equal(f.os.size,1);assert.match(receipt.message,/No se ha confirmado/);const writes=f.writes;
  f.failCancel(false);const retry=await api.saveUnifiedNote(draft,f.scope,f.active);assert.equal((await retry.reminderSync).phase,'ready');assert.equal(f.os.size,0);assert.equal(f.rows.length,1);assert.equal(f.writes,writes);
 }finally{f.close();}
});

test('denied permissions and storage failures never produce a false success or a scheduled notification',async()=>{
 const f=await h.performanceFixture();try{await f.prime();f.permission({granted:false,canAskAgain:false,ios:{status:1}});const api=f.api(),draft=f.draft({destination:'calendar',dateISO:'2027-12-30',time:'18:30',reminderMinutes:15});f.failWrite(true);await assert.rejects(api.saveUnifiedNote(draft,f.scope,f.active),/disco/);assert.equal(f.rows.length,0);assert.equal(f.os.size,0);assert.equal(f.noteProgress.getNoteReminderProgress(f.scope,draft.id),null);
  f.failWrite(false);const result=await api.saveUnifiedNote(draft,f.scope,f.active);assert.equal(f.rows.length,1);assert.equal((await result.reminderSync).phase,'warning');assert.equal(f.os.size,0);assert.equal(f.noteProgress.getNoteReminderProgress(f.scope,draft.id).phase,'warning');
 }finally{f.close();}
});

test('timing instrumentation contains phase names and numbers without note text, user IDs, locations or file URLs',async()=>{
 const f=await h.performanceFixture();try{await f.prime();const result=await f.api().saveUnifiedNote(f.draft({content:'Contenido privado de prueba',place:'Dirección confidencial'}),f.scope,f.active);await result.reminderSync;const measurements=f.noteProgress.getNoteSaveMeasurements();assert.ok(measurements[0].marks.dataReady>=0);assert.ok(measurements[0].marks.notificationsSettled>=0);const json=JSON.stringify(measurements);for(const value of ['Contenido privado','Dirección confidencial',f.scope.userId,result.entry.id,'file://'])assert.equal(json.includes(value),false);}finally{f.close();}
});

const homeCallbacks=(f)=>{
 const source=fs.readFileSync('app/index.tsx','utf8'),tree=h.ts.createSourceFile('home.tsx',source,h.ts.ScriptTarget.Latest,true,h.ts.ScriptKind.TSX),all=[];
 function visit(n){all.push(n);h.ts.forEachChild(n,visit);}visit(tree);
 const declarations=['saveNoteDraft','watchNoteReminderReceipt'].map(name=>{const fn=all.find(n=>h.ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(fn);return fn.getText(tree);}).join('\n');
 const calls=[],identity={ready:true,scope:f.scope},ctx={noteIdentityRef:{current:identity},saveUnifiedNote:f.api().saveUnifiedNote,noteInScope:f.model.noteInScope,noteReminderOperationCurrent:f.noteProgress.noteReminderOperationCurrent,showToast:(...args)=>calls.push(args),setQuickNoteText(){},setQuickNoteDetail(){},AsyncStorage:{removeItem:async()=>{}}};
 vm.runInNewContext(h.compile(declarations+';globalThis.save=saveNoteDraft;'),ctx);return {ctx,calls};
};

test('the actual Home save callback does not wait for legacy draft cleanup or native services after verified persistence',async()=>{
 const f=await h.performanceFixture();let release,cleanup;try{await f.prime();f.block('pending',new Promise(r=>release=r));const home=homeCallbacks(f);home.ctx.AsyncStorage.removeItem=()=>new Promise(r=>cleanup=r);
  const result=await Promise.race([home.ctx.save(f.draft({content:'Persistencia antes de limpiar un borrador antiguo'})),h.pause(1500).then(()=>assert.fail('Home held the verified note behind cleanup'))]);
  assert.equal(f.rows.length,1);assert.equal((await f.reopen())[0].id,result.entry.id);assert.ok(cleanup);assert.equal(home.calls.length,0);cleanup();release();await result.reminderSync;
 }finally{cleanup?.();release?.();f.close();}
});

test('the actual Home observer warns on a late native failure only for the current note operation and account',async()=>{
 const f=await h.performanceFixture();let release;try{await f.prime();f.permission({granted:false,canAskAgain:false,ios:{status:1}});const home=homeCallbacks(f),draft=f.draft({destination:'calendar',dateISO:'2027-12-30',time:'18:30',reminderMinutes:15});
  let result=await home.ctx.save(draft);assert.equal((await result.reminderSync).phase,'warning');await h.pause(0);assert.equal(home.calls.length,1);assert.equal(home.calls[0][1],'warning');assert.match(home.calls[0][0],/Nota guardada/);assert.equal(f.rows.length,1);
  home.calls.length=0;f.block('pending',new Promise(r=>release=r));result=await home.ctx.save({...f.model.noteDraft(result.entry),time:'19:30'});home.ctx.noteIdentityRef.current={ready:true,scope:{...f.scope,userId:'another-account'}};release();await result.reminderSync;await h.pause(0);assert.equal(home.calls.length,0,'No cross-account notification feedback');
 }finally{release?.();f.close();}
});
