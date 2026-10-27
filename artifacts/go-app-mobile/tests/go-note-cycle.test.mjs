import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {createRequire} from 'node:module';
import {detailFixture} from './helpers/calendar-detail-lifecycle.mjs';
const require=createRequire(import.meta.url),f=require('./helpers/note-cycle-fixture.cjs');
const {source,ast,nodes,ts,React,scope,plain,storageFixture,selectorFixture,mountComponent,compile,declaration}=f;
const turn=()=>new Promise(setImmediate);

for(const kind of ['NOTA_INTERNA','NOTA_EXTERNA'])test(kind+': actual GUARDAR waits for storage, retains detail/date/time/duration/contact and reloads one record',async()=>{
 const a=selectorFixture({kind});let release;a.gate(new Promise(resolve=>release=resolve));
 const saving=a.save();await turn();assert.equal(a.rows.length,0);assert.equal(a.context.fieldSelectorOpen,true);assert.equal(a.calls.some(c=>c[0]==='toast'&&c[2]==='success'),false);
 await a.save();assert.equal(a.rows.length,0,'repeated taps cannot enqueue a duplicate');release();await saving;
 assert.equal(a.rows.length,1);const row=a.rows[0];assert.equal(row.type,kind==='NOTA_INTERNA'?'TAREA_INTERNA':'TAREA');
 assert.equal(row.notes,'Mi tarea');assert.equal(row.detail,'Contenido dictado');assert.equal(row.dateISO,'2027-12-30');assert.equal(row.time,'13:45');assert.equal(row.duration,'1h');assert.deepEqual(row.reminders,[75]);
 if(kind==='NOTA_EXTERNA'){assert.equal(row.contactName,'Contacto');assert.equal(row.phone,'+34600123456');}
 assert.equal(a.context.fieldSelectorOpen,false);assert.ok(a.calls.some(c=>c[0]==='toast'&&c[2]==='success'));
 const rows=await a.reopen();assert.deepEqual(plain(rows),a.rows);await a.save();assert.equal(a.rows.length,1);
});

test('failed storage keeps the editor and values, reports failure, allows a unique retry and never reports success',async()=>{
 const a=selectorFixture();a.fail(true);await a.save();assert.equal(a.rows.length,0);assert.equal(a.context.fieldSelectorOpen,true);assert.equal(a.context.fieldSelectorText,'Mi tarea');
 assert.equal(a.context.fieldSelectorDetail,'Contenido dictado');assert.equal(a.context.fsFilledValues.time,'13:45');assert.ok(a.calls.some(c=>c[0]==='toast'&&/guardar/.test(c[1])));
 assert.equal(a.calls.some(c=>c[0]==='toast'&&c[2]==='success'),false);assert.equal(a.context.fieldSelectorSaveBusyRef.current,false);
 a.fail(false);await a.save();assert.equal(a.rows.length,1);assert.equal(a.rows[0].id,'cycle-note');
});

test('a failed edit inside Calendar stays open until persistence actually succeeds',async()=>{
 const a=selectorFixture();a.context.calendarTaskContextRef.current={};a.fail(true);await a.save();assert.equal(a.context.fieldSelectorOpen,true);assert.ok(a.context.calendarTaskContextRef.current);assert.equal(a.calls.some(c=>c[0]==='close'),false);
 a.fail(false);await a.save();assert.equal(a.calls.filter(c=>c[0]==='close').length,1);assert.equal(a.rows.length,1);
});

test('requesting note edition uses the existing native dismissal, once, before presenting the editor',async()=>{
 const a=await detailFixture();let closes=0;const entry={id:'note-to-edit',kind:'sent',type:'TAREA_INTERNA',notes:'Nota',color:'#7c3aed'};
 try{
  await a.render({entry,onClose:()=>closes++});assert.equal(a.props.get('entry-details-modal').visible,true);
  await a.render({entry,closeRequested:true,onClose:()=>closes++});assert.equal(a.props.get('entry-details-modal').visible,false);assert.equal(closes,0);
  await a.nativeDismiss();await a.nativeDismiss();assert.equal(closes,1);
 }finally{await a.dispose();}
});

test('the actual existing-card edit action carries the saved ID, owner, content and reminder into the same acknowledged save',async()=>{
 const a=selectorFixture();await a.save();const entry=a.rows[0],ctx=a.context,opens=[];
 Object.assign(ctx,{entryIsInternal:()=>true,landingCurrentEntry:e=>e,landingDetailsId:entry.id,noteEditAfterDetailsRef:{current:null},
  setNoteDetailCloseRequested:()=>{},setLandingDetailsId:id=>{ctx.landingDetailsId=id;},isGoNoteReminderTarget:()=>true,setNoteReminderTargetId:()=>{},setNoteReminderPickerOpen:()=>{},setFsPlaceDraft:()=>{},
  openFieldSelector:(kind,title,detail,_date,_time,draft)=>{opens.push(draft);ctx.noteTaskDraftRef.current=draft;ctx.fieldSelectorKind=kind;ctx.fieldSelectorText=title;ctx.fieldSelectorDetail=detail;ctx.fieldSelectorOpen=true;ctx.fieldSelectorSaveBusyRef.current=false;}});
 vm.runInContext(compile('globalThis.openEntryChange = '+declaration('openEntryChange')),ctx);
 ctx.openEntryChange(entry);assert.equal(opens.length,0);assert.equal(ctx.noteEditAfterDetailsRef.current.id,entry.id);
 const sheet=nodes.find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='GoEntryDetailsSheet'&&n.openingElement.attributes.properties.some(p=>p.name?.getText(ast)==='closeRequested'));
 const close=sheet.openingElement.attributes.properties.find(p=>p.name?.getText(ast)==='onClose').initializer.expression;
 vm.runInContext(compile('globalThis.finishNoteDetail = '+close.getText(ast)),ctx);ctx.finishNoteDetail();ctx.finishNoteDetail();assert.equal(opens.length,1);assert.equal(opens[0].entryId,entry.id);
 ctx.fieldSelectorDetail='Editada después de dictar';await a.save();assert.equal(a.rows.length,1);assert.equal(a.rows[0].id,entry.id);assert.equal(a.rows[0].ownerUserId,scope.userId);assert.equal(a.rows[0].detail,'Editada después de dictar');assert.deepEqual(a.rows[0].reminders,[75]);
});

test('saving a dated Calendar task uses the same confirmed queue and restores its container once',async()=>{
 const a=selectorFixture({slot:true});await a.save();assert.equal(a.rows.length,1);assert.deepEqual(a.rows[0].reminders,[75]);assert.equal(a.calls.filter(c=>c[0]==='close').length,1);assert.equal(a.context.calendarTaskContextRef.current,null);
});

test('new saves retain every older record rather than discarding records beyond 200',async()=>{
 const existing=Array.from({length:205},(_,i)=>({id:'old-'+i,type:'TAREA_INTERNA',ownerUserId:scope.userId,notes:'Nota '+i}));const a=selectorFixture({initial:existing});await a.save();assert.equal(a.rows.length,206);assert.deepEqual(a.rows.slice(1),existing);
});

for(const type of ['TAREA_INTERNA','TAREA'])test(type+': edit an existing record, retain identity/status/other records and reminders after reload',async()=>{
 const a=storageFixture();const entry={id:'edit-note',kind:'sent',type,notes:'Original',detail:'Detalle',date:'Día',dateISO:'2027-12-30',time:'13:45',duration:'30m',place:'Casa',contactName:'Ana',phone:'123',estado:'pendiente'};
 const old=await a.api().saveGoNoteReminder(entry,{scope,minutes:75},()=>true);
 await a.store.updateGoLog(rows=>({entries:[...rows,{id:'another',type:'GO',notes:'Intocable'}],result:null}));
 const snapshot=Object.fromEntries(['notes','detail','date','dateISO','time','duration','place','contactName','phone','reminders'].map(k=>[k,old.saved[k]]));
 await a.api().saveGoNoteReminder({...entry,notes:'Editada',detail:'Dictado corregido',time:'18:30',duration:'2h'}, {scope,entryId:entry.id,minutes:90,edit:snapshot},()=>true);
 const rows=plain(await a.reopen()),saved=rows.find(r=>r.id===entry.id);assert.equal(rows.length,2);assert.equal(saved.notes,'Editada');assert.equal(saved.detail,'Dictado corregido');assert.equal(saved.duration,'2h');assert.equal(saved.time,'18:30');assert.deepEqual(saved.reminders,[90]);assert.equal(saved.estado,'pendiente');assert.equal(saved.type,type);assert.equal(rows[1].notes,'Intocable');
});

test('concurrent edits or deleted notes are not overwritten; editing text preserves independent offsets and manual mute',async()=>{
 const previous={id:'edit',kind:'sent',type:'TAREA_INTERNA',ownerUserId:scope.userId,taskContext:scope.context,goNoteReminder:true,notes:'Nota',detail:'Texto',dateISO:'2027-12-30',time:'13:45',reminders:[75,15],firedReminderMins:[15],notificationsEnabled:false};
 const a=storageFixture([previous]);await a.api().saveGoNoteReminder({...previous,notes:'Corregida'},{scope,minutes:75,edit:{notes:'Nota',reminders:[75,15]}},()=>true);
 assert.deepEqual(a.rows[0].reminders,[75,15]);assert.deepEqual(a.rows[0].firedReminderMins,[15]);assert.equal(a.rows[0].notificationsEnabled,false);
 await assert.rejects(a.api().saveGoNoteReminder({...previous,notes:'Obsoleta'},{scope,minutes:75,edit:{notes:'Nota'}},()=>true),/cambió/);assert.equal(a.rows[0].notes,'Corregida');
 await a.store.updateGoLog(rows=>({entries:rows.map(r=>({...r,deleted:true})),result:null}));await assert.rejects(a.api().saveGoNoteReminder(previous,{scope,minutes:75,edit:{}},()=>true),/disponible/);assert.equal(a.rows[0].deleted,true);
});

for(const time of ['00:00','03:15','05:20','13:45','18:30','23:59'])test('numeric time '+time+' is exact; changing minutes does not alter hours and a duplicate Continue does not repeat the transition',async()=>{
 const calls=[],a=await mountComponent('components/notes/GoTaskScheduleStep.tsx',{}, {step:'clock',dateLabel:'30/12/2027',time:'12:00',duration:'30m',handedness:'right',onTime:t=>calls.push(t),onDuration(){},onDurationDraft(){},onDate(){},onBack(){}});
 try{
  await a.run(()=>a.hosts.get('note-hour').onChangeText(time.slice(0,2)));await a.run(()=>a.hosts.get('note-minute').onChangeText(time.slice(3)));
  assert.equal(a.hosts.get('note-hour').value,time.slice(0,2));assert.equal(a.hosts.get('note-hour').autoFocus,undefined);
  const press=a.hosts.get('note-schedule-continue').onPress;await a.run(()=>{press();press();});assert.deepEqual(calls,[time]);
 }finally{await a.close();}
});

test('invalid time remains editable; date/back commit the valid draft and duration retains its independent selection',async()=>{
 const calls=[],props={step:'clock',dateLabel:'30/12/2027',time:'03:15',duration:'30m',handedness:'left',onTime:t=>calls.push(['time',t]),onDuration:t=>calls.push(['duration',t]),onDurationDraft:t=>calls.push(['draft',t]),onDate:()=>calls.push(['date']),onBack:()=>calls.push(['back'])};
 const a=await mountComponent('components/notes/GoTaskScheduleStep.tsx',{},props);try{
  await a.run(()=>a.hosts.get('note-minute').onChangeText('60'));await a.run(()=>a.hosts.get('note-schedule-continue').onPress());assert.equal(calls.length,0);
  await a.run(()=>a.hosts.get('note-minute').onChangeText('20'));await a.run(()=>a.hosts.get('Cambiar fecha').onPress());assert.deepEqual(calls,[['time','03:20'],['date']]);
  assert.equal(a.hosts.get('note-schedule-navigation').style.left,18);assert.equal(a.hosts.get('note-schedule-navigation').style.gap,10);
 }finally{await a.close();}
 const b=await mountComponent('components/notes/GoTaskScheduleStep.tsx',{}, {...props,step:'duration',duration:'30m'});try{
  assert.equal(b.hosts.has('note-hour'),false);assert.equal(b.hosts.has('note-minute'),false);assert.ok(!/RESERVAR|MEETING|SHOP|FOOD/.test(b.container.textContent));
  await b.run(()=>b.hosts.get('note-duration-2h').onPress());await b.run(()=>b.hosts.get('Volver').onPress());assert.ok(calls.some(c=>c[0]==='draft'&&c[1]==='2h'));
 }finally{await b.close();}
});

test('both real task SAVE buttons use acknowledged save; notes never render the old orbit and inputs remain mounted across keyboard/blur',()=>{
 const form=nodes.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='renderFieldSelector');assert.ok(form);const text=form.getText(ast);
 assert.equal((text.match(/onPress=\{saveFieldSelector\}/g)||[]).length,2);assert.ok(!text.includes('>SAVE<'));assert.ok(!text.includes('INTERNAL TASK'));
 assert.ok(text.includes('!embedded && !isNoteSelector'));assert.ok(text.includes('!isNoteSelector && fsOrbitalOpen'));
 for(const field of ['title','detail'])assert.ok(text.includes('isNoteSelector || !fsKbVisible || fsFocusedField === "'+field+'"'));
 assert.ok(text.includes('style: { flex: 1 }'),'the native form has a definite flex viewport rather than zero intrinsic ScrollView height');
});

test('note native viewport is definite before first touch and only note sheets change their flex sizing',()=>{
 const sheet=nodes.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='BottomSheet').getText(ast);
 assert.ok(sheet.includes('noteKeyboardScroll && { height: "100%", maxHeight: 440, flexShrink: 1'));
 assert.ok(sheet.includes('noteKeyboardScroll ? { flex: 1 } : undefined'));
 assert.ok(sheet.includes('noteKeyboardScroll ? { flexGrow: 1, flexShrink: 1 } : {}'));
 assert.ok(!sheet.includes('setNoteKeyboardTop'));
});

test('dictation, temporary native blur, selection replacement and deletion keep the real task inputs mounted and editable',async()=>{
 const a=await f.taskFormFixture();try{
  const title=a.hosts.get('task-title').instance,detail=a.hosts.get('task-detail').instance;
  await a.run(()=>{a.hosts.get('task-detail').onFocus();a.live.setKeyboard(true);});
  await a.run(()=>a.hosts.get('task-detail').onChangeText('Texto dictado por iPhone'));
  await a.run(()=>a.hosts.get('task-detail').onBlur());assert.equal(a.live.fsFocusedField,null);
  assert.equal(a.hosts.get('task-title').instance,title);assert.equal(a.hosts.get('task-detail').instance,detail);
  for(const text of ['Texto dictado por iPhon','Texto dictado por GO','Texto nuevo dictado por GO','Texto nuevo escrito']){
   await a.run(()=>a.hosts.get('task-detail').onChangeText(text));assert.equal(a.live.fieldSelectorDetail,text);assert.equal(a.hosts.get('task-detail').instance,detail);
   assert.equal(a.hosts.get('task-detail').selection,undefined,'native cursor/IME owns selection; JS does not force it to the end');
  }
  await a.run(()=>a.hosts.get('task-title').onChangeText('Título editado'));assert.equal(a.live.fieldSelectorText,'Título editado');
  // Locate the actual keyboard-open GUARDAR callback, not a reconstructed button.
  const text=node=>Array.isArray(node)?node.map(text).join(''):React.isValidElement(node)?text(node.props.children):node??'';
  const save=[...a.hosts.values()].find(p=>p.onPress&&text(p.children)==='GUARDAR');assert.ok(save);await a.run(()=>save.onPress());assert.deepEqual(a.calls,[['save']]);
 }finally{await a.close();}
});

test('iOS date transition waits for the actual editor onDismiss; returning cancels only its schedule and preserves the draft',async()=>{
 const a=await f.taskFormFixture();try{
  const text=node=>Array.isArray(node)?node.map(text).join(''):React.isValidElement(node)?text(node.props.children):node??'';
  // Host maps retain only the last unnamed button; evaluate JSX to find date's actual closure.
  const fn=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='openFechaHora');assert.ok(fn);
  a.context.isNoteSelector=true;a.context.embedded=false;
  vm.runInNewContext(compile('globalThis.openDate = '+fn.initializer.getText(ast)),a.context);a.context.openDate();
  assert.equal(a.calls.some(c=>c[0]==='calendar'),false);assert.equal(typeof a.context.noteCalendarAfterSelectorDismissRef.current,'function');
  await a.run(()=>a.hosts.get('Modal').onDismiss());assert.equal(a.calls.filter(c=>c[0]==='calendar'&&c[1]===true).length,1);
  await a.run(()=>a.hosts.get('Modal').onDismiss());assert.equal(a.calls.filter(c=>c[0]==='calendar'&&c[1]===true).length,1);
  const options=a.calls.find(c=>c[0]==='schedule')[1];assert.equal(options.initialTime,'13:45');assert.equal(options.initialDuration,'1h');options.onCancel();
  assert.equal(a.context.noteSelectorAfterCalendarDismissRef.current,true);assert.equal(a.context.qdFlowActiveRef.current,false);
 }finally{await a.close();}
});

test('real shared Calendar hook accepts exact task times and keeps date/time/duration through backwards navigation',async()=>{
 class Value{setValue(){}};const animation={Value,timing:()=>({start:done=>done?.()}),spring:()=>({start:done=>done?.()})};
 const api=f.load('hooks/useGoCalendarFlow.tsx',{'react-native':{Animated:animation},'expo-haptics':{selectionAsync:async()=>{},notificationAsync:async()=>{},NotificationFeedbackType:{Success:'success',Error:'error'}},'@/lib/time':{getToday:()=>new Date('2027-01-01'),formatISODate:d=>d.toISOString().slice(0,10),formatDayLabel:()=> '30/12/2027'}});
 let flow;const saved=[];function Fixture(){flow=api.useGoCalendarFlow();return null;}const root=f.createRoot(f.document.createElement('div'));
 try{
  await f.settle(()=>root.render(React.createElement(Fixture)));
  await f.settle(()=>flow.open({startAt:'clock',initialDateISO:'2027-12-30',initialDateDraft:'30/12/2027',initialTime:'03:15',initialDuration:'30m',onSave:r=>saved.push(plain(r))}));
  await f.settle(()=>flow.selectExactTime('13:45'));assert.equal(flow.step,'duration');assert.equal(flow.dateISO,'2027-12-30');
  await f.settle(()=>flow.setDurationDraft('2h'));await f.settle(()=>flow.reopenClock());assert.equal(flow.time,'13:45');assert.equal(flow.duration,'2h');
  await f.settle(()=>flow.returnToDate());assert.equal(flow.step,'date');assert.equal(flow.time,'13:45');assert.equal(flow.dateISO,'2027-12-30');
  await f.settle(()=>flow.handleDayTap('2027-12-30'));assert.equal(flow.step,'clock');assert.equal(flow.time,'13:45');
  await f.settle(()=>flow.selectExactTime('18:30'));await f.settle(()=>flow.selectDuration('2h'));await new Promise(r=>setTimeout(r,5));
  assert.deepEqual(saved,[{dateISO:'2027-12-30',dateDraft:'30/12/2027',time:'18:30',duration:'2h'}]);
 }finally{await f.settle(()=>root.unmount());}
});

test('completing task date/time does not copy it into the Landing GO draft',()=>{
 const calls=[],ctx={qdFlowActiveRef:{current:true},fieldSelectorKind:'NOTA_INTERNA',calendarTaskContextRef:{current:null},
  qdCapDateRef:{current:''},qdCapDateISORef:{current:''},qdCapTimeRef:{current:''},setFsFilledValues:fn=>calls.push(['fields',plain(fn({place:'Casa'}))]),setCalOpen:()=>{},qdReturnToSelector:()=>calls.push(['return']),
  ...Object.fromEntries(['Date','DateISO','Time','Duration'].map(k=>['set'+k,()=>assert.fail('Task date must not modify Landing '+k)]))};
 vm.runInNewContext(compile('globalThis.finish = '+declaration('_handleCalFlowSave')),ctx);
 ctx.finish({dateDraft:'Día',dateISO:'2027-12-30',time:'18:30',duration:'2h'});
 assert.equal(ctx.qdCapTimeRef.current,'18:30');assert.deepEqual(calls,[['fields',{place:'Casa',duration:'2h'}],['return']]);
});
