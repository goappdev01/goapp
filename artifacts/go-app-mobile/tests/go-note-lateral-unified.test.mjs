import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
const flat=value=>Object.assign({},...(Array.isArray(value)?value.flat(Infinity):[value]).filter(Boolean));
const edit=(ui,id,text)=>ui.run(()=>ui.hosts.get(id).onChangeText(text));
const focus=async(ui,id)=>ui.run(()=>{ui.hosts.get(id).onFocus({target:77});ui.keyboard.show();});
function parentNavigation(scope){
 const model=h.load('lib/unifiedNotes.ts'),navigation=h.load('lib/goNoteNavigation.ts',{'./unifiedNotes':model}),source=fs.readFileSync('app/index.tsx','utf8'),tree=h.ts.createSourceFile('home.tsx',source,h.ts.ScriptTarget.Latest,true,h.ts.ScriptKind.TSX);let fn;function visit(n){if(h.ts.isFunctionDeclaration(n)&&n.name?.text==='openSavedNoteDestination')fn=n;h.ts.forEachChild(n,visit);}visit(tree);assert.ok(fn);
 const calls=[],ctx={Date,noteIdentityRef:{current:{ready:true,scope}},savedNoteTarget:navigation.savedNoteTarget,calendarTaskContextRef:{current:null},closeMonthGrid:()=>calls.push(['month-closed'])};
 for(const name of ['setFieldSelectorOpen','setDemoCustomerCalendarSelected','setCalConfigVisible','setCalQuickCreateOpen','setCalPanelOpen','setCalBgViewMode','setDateISODraft','setCalBgViewMonth','setCalScrollToDateTarget','setCalHighlightEntryId','setCalOpen','showToast'])ctx[name]=(...args)=>calls.push([name,...args]);
 vm.runInNewContext(h.compile(fn.getText(tree)+';globalThis.openSaved=openSavedNoteDestination;'),ctx);return{ctx,calls,open:ctx.openSaved,navigation};
}

test('approved 56 percent lateral menu opens over the keyboard without blurring or replacing the opposite writing field, in either hand',async()=>{
 for(const handedness of ['left','right']){const ui=await h.editorFixture({handedness});try{
  await edit(ui,'note-content','Texto editable\nOtra línea');await focus(ui,'note-content');const token=ui.instances.get('note-content'),blurs=ui.calls.filter(c=>c[0]==='blur').length;await ui.tap('note-tools-toggle');
  assert.equal(ui.keyboard.visible,true);assert.equal(ui.keyboard.focused,'note-content');assert.equal(ui.calls.filter(c=>c[0]==='blur').length,blurs);assert.equal(ui.instances.get('note-content'),token);
  const panel=flat(ui.hosts.get('note-tools-panel').style);assert.ok(panel.width<=366*.56+1);assert.equal(panel[handedness==='right'?'right':'left'],0);assert.ok(panel.height<=300*.6+1);assert.equal(ui.hosts.get('note-tools-scroll').keyboardShouldPersistTaps,'always');assert.equal(ui.hosts.get('note-tools-scroll').keyboardDismissMode,'none');
  for(const key of ['date','time','duration','reminder','place','attachments'])assert.equal(flat(ui.hosts.get('note-option-'+key).style).width,'100%');await ui.tap('note-tools-toggle');assert.equal(ui.keyboard.visible,true);assert.equal(ui.hosts.get('note-content').value,'Texto editable\nOtra línea');
 }finally{await ui.close();}}
});

test('ONE bottom arrow handles keyboard, subform, lateral menu and editor in four independent presses, without a header return control',async()=>{
 const ui=await h.editorFixture();try{
  await edit(ui,'note-content','Borrador íntegro');await ui.tool('time');await edit(ui,'note-time-hour','18');await edit(ui,'note-time-minute','37');await focus(ui,'note-time-minute');
  assert.equal(ui.hosts.has('note-tool-back'),false);assert.doesNotMatch(ui.container.textContent,/VOLVER|LISTO/);await ui.back();assert.equal(ui.keyboard.visible,false);assert.ok(ui.hosts.has('note-time-picker'));assert.equal(ui.hosts.get('note-time-minute').value,'37');assert.equal(ui.calls.some(c=>c[0]==='close'),false);
  await ui.back();assert.ok(ui.hosts.has('note-primary-controls'));assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,true);await ui.back();assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,false);assert.equal(ui.calls.some(c=>c[0]==='close'),false);
  await ui.back();const exits=ui.calls.filter(c=>c[0]==='close');assert.equal(exits.length,1);assert.equal(exits[0][1].draft.content,'Borrador íntegro');assert.equal(exits[0][1].draft.time,'','unapplied numerical edits never silently commit');
 }finally{await ui.close();}
});

test('numeric time supports exact two-digit values, rejects invalid ranges and retains provisional edits when only the keyboard is hidden',async()=>{
 const ui=await h.editorFixture();try{
  for(const [hour,minute]of [['00','00'],['03','15'],['05','20'],['13','45'],['18','30'],['23','59']]){
   await ui.tool('time');for(const id of ['note-time-hour','note-time-minute']){assert.equal(ui.hosts.get(id).keyboardType,'number-pad');assert.equal(ui.hosts.get(id).maxLength,2);}
   await edit(ui,'note-time-hour',hour);await edit(ui,'note-time-minute',minute);await focus(ui,'note-time-minute');await ui.back();assert.equal(ui.hosts.get('note-time-minute').value,minute);await ui.tap('note-time-apply');assert.equal(ui.keyboard.visible,false);assert.equal(ui.hosts.has('note-time-picker'),false);assert.match(ui.hosts.get('note-summary').children,new RegExp(hour+':'+minute));
  }
  for(const [hour,minute]of [['24','00'],['23','60'],['-1','00'],['','30']]){await ui.tool('time');await edit(ui,'note-time-hour',hour);await edit(ui,'note-time-minute',minute);await ui.tap('note-time-apply');assert.match(ui.container.textContent,/horas de 00 a 23/);assert.ok(ui.hosts.has('note-time-picker'));}
  await ui.tap('note-time-clear');assert.equal(ui.hosts.get('note-option-time').accessibilityState.selected,false);
 }finally{await ui.close();}
});

test('numeric custom duration uses the existing duration engine and canonical minutes, preserving shortcuts and rejecting invalid units',async()=>{
 const disk=await h.diskFixture(),ui=await h.editorFixture({scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{
  await edit(ui,'note-content','Trabajo con duración propia');await ui.tool('duration');for(const value of ['15m','30m','1h','2h'])assert.ok(ui.hosts.has('note-duration-'+value));
  await edit(ui,'note-duration-hour','1');await edit(ui,'note-duration-minute','30');await focus(ui,'note-duration-minute');await ui.tap('note-duration-apply');assert.equal(ui.keyboard.visible,false);assert.match(ui.hosts.get('note-summary').children,/90 minutos/);await ui.destination('calendar');await ui.pickDate('2027-01-15');await ui.pickTime('18','30');await ui.tap('unified-note-save');await ui.idle();
  const [stored]=await disk.reopen();assert.equal(stored.duration,'90m');assert.equal(stored.note.schedule.duration,'90m');assert.equal(h.load('lib/goActionCompletion.ts').durationMinutes(stored.duration),90);
  for(const [hours,minutes]of [['0','0'],['1','60'],['-1','00'],['10000','00']]){await ui.tool('duration');await edit(ui,'note-duration-hour',hours);await edit(ui,'note-duration-minute',minutes);await ui.tap('note-duration-apply');assert.match(ui.container.textContent,/mayor que cero/);assert.ok(ui.hosts.has('note-duration-picker'));}
 }finally{await ui.close();disk.close();}
});

test('destination is opt-in, exclusive, visibly checked and preserved through panel folding; security remains unavailable',async()=>{
 const ui=await h.editorFixture();try{
  await ui.tap('note-tools-toggle');for(const value of ['calendar','pending','archive'])assert.equal(ui.hosts.get('note-destination-'+value).accessibilityState.checked,false);
  for(const selected of ['pending','archive','calendar']){await ui.destination(selected);for(const value of ['calendar','pending','archive']){const p=ui.hosts.get('note-destination-'+value);assert.equal(p.accessibilityState.checked,value===selected);assert.equal(p.accessibilityState.selected,value===selected);if(value===selected)assert.ok(flat(p.style).borderWidth>1);}
   await ui.tap('note-tools-toggle');await ui.tap('note-tools-toggle');assert.equal(ui.hosts.get('note-destination-'+selected).accessibilityState.checked,true);
  }
  await ui.tap('note-security-info');assert.match(ui.container.textContent,/Aún no disponible/);assert.equal(ui.calls.some(c=>c[0]==='save'),false);
 }finally{await ui.close();}
});

for(const destination of ['calendar','pending','archive'])for(const context of ['demo:USER','demo:BUSINESS'])test('real save, native dismiss, exact destination and single navigation: '+destination+' / '+context,async()=>{
 const disk=await h.diskFixture();disk.scope.context=context;disk.changeContext(context);const parent=parentNavigation(disk.scope),results=[];const ui=await h.editorFixture({scope:disk.scope,onSave:async draft=>{const result=await disk.api().saveUnifiedNote(draft,disk.scope,disk.active);results.push(result);return result;},onSaved:parent.open});try{
  await edit(ui,'note-content','Nota comprobada '+destination);await ui.destination(destination);if(destination==='calendar'){await ui.pickDate('2027-01-15');await ui.pickTime('18','37');}
  await ui.tap('unified-note-save');await ui.idle();assert.equal(disk.rows.length,1);assert.equal(ui.hosts.get('NoteModal').visible,false);assert.equal(parent.calls.length,0,'must wait for native/host onDismiss');assert.equal(ui.calls.filter(c=>c[0]==='close').length,0);
  assert.ok(results[0].timings.totalMs>=0);for(const value of Object.values(results[0].timings))assert.ok(Number.isFinite(value)&&value>=0);assert.ok(ui.hosts.get('note-save-confirmation').children.length<80);
  await ui.dismissSaved();await ui.dismissSaved();assert.equal(ui.calls.filter(c=>c[0]==='close').length,1);const target=parent.calls.find(c=>c[0]==='setCalScrollToDateTarget')[1];assert.equal(target.destination,destination);assert.equal(target.entryId,disk.rows[0].id);assert.equal(target.dateISO,destination==='calendar'?'2027-01-15':'');assert.equal(parent.calls.filter(c=>c[0]==='setCalOpen').length,1);assert.equal(parent.calls.find(c=>c[0]==='setDemoCustomerCalendarSelected')[1],false);assert.equal(parent.calls.find(c=>c[0]==='showToast')[1],results[0].notice);
  assert.equal((await disk.reopen()).length,1);assert.equal(disk.rows[0].taskContext,context);assert.equal(disk.rows[0].note.destination,destination);
 }finally{await ui.close();disk.close();}
});

test('save stays locked until reminders acknowledge; failed persistence never exits or loses the draft',async()=>{
 const disk=await h.diskFixture(),parent=parentNavigation(disk.scope);let release;disk.holdReminders(new Promise(resolve=>release=resolve));const ui=await h.editorFixture({scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active),onSaved:parent.open});try{
  await edit(ui,'note-content','Conservar ante errores');await ui.destination('pending');await ui.tap('unified-note-save');await ui.idle();assert.equal(disk.rows.length,1);assert.equal(ui.hosts.get('NoteModal').visible,true);assert.equal(ui.hosts.get('unified-note-save').disabled,true);await ui.tap('unified-note-save');assert.equal(disk.writes,1);assert.equal(parent.calls.length,0);await ui.run(()=>release());await ui.idle();assert.equal(ui.hosts.get('NoteModal').visible,false);await ui.dismissSaved();assert.equal(parent.calls.filter(c=>c[0]==='setCalOpen').length,1);
 }finally{await ui.close();disk.close();}
 const failed=await h.diskFixture(),ui2=await h.editorFixture({scope:failed.scope,onSave:d=>failed.api().saveUnifiedNote(d,failed.scope,failed.active),onSaved:()=>assert.fail('Cannot navigate after a storage failure')});try{
  await edit(ui2,'note-content','Mi texto no desaparece');await ui2.destination('archive');failed.failWrite(true);await ui2.tap('unified-note-save');await ui2.idle();assert.equal(ui2.hosts.get('NoteModal').visible,true);assert.equal(failed.rows.length,0);assert.equal(ui2.hosts.get('note-content').value,'Mi texto no desaparece');assert.ok(ui2.hosts.has('note-save-error'));
 }finally{await ui2.close();failed.close();}
});

test('account/context changes after persistence but before native dismissal cannot navigate to another user\'s note',async()=>{
 let navigations=0;const ui=await h.editorFixture({onSaved:()=>navigations++});try{await edit(ui,'note-content','Información de la cuenta anterior');await ui.destination('archive');await ui.tap('unified-note-save');await ui.idle();await ui.render({scope:{userId:'other-user',context:'demo:USER'}});await ui.dismissSaved();assert.equal(navigations,0);}finally{await ui.close();}
});
