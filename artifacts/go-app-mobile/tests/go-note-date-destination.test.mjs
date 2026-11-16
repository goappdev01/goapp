import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
const edit=(ui,id,value)=>ui.run(()=>ui.hosts.get(id).onChangeText(value));
function selected(ui,destination){
 for(const value of ['calendar','pending','archive']){
  const state=ui.hosts.get('note-destination-'+value).accessibilityState;
  assert.equal(state.checked,value===destination);
  assert.equal(state.selected,value===destination);
 }
}

test('choosing a date selects CALENDARIO with no hour, then saves and reveals the same untimed note',async()=>{
 const disk=await h.diskFixture(),reveals=[],navigation=h.load('lib/goNoteNavigation.ts',{'./unifiedNotes':disk.model});
 const ui=await h.editorFixture({scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active),onSaved:entry=>reveals.push(navigation.savedNoteTarget(entry,disk.scope,1))});
 try{
  await edit(ui,'note-content','Nota con fecha, sin hora');await ui.tool('date');await ui.back();selected(ui,null);
  await ui.pickDate('2027-01-03');selected(ui,'calendar');assert.match(ui.hosts.get('note-summary').children,/CALENDARIO · 03\/01\/2027/);
  assert.equal(ui.hosts.get('note-option-time').accessibilityState.selected,false);assert.equal(disk.writes,0);
  await ui.tap('unified-note-save');await ui.idle();const [entry]=await disk.reopen();
  assert.equal(entry.note.destination,'calendar');assert.equal(entry.note.schedule.dateISO,'2027-01-03');assert.equal(entry.note.schedule.time,'');assert.equal(entry.time,'');
  assert.equal(disk.rows.length,1);assert.equal(reveals.length,0);await ui.dismissSaved();await ui.dismissSaved();
  assert.equal(reveals.length,1);assert.equal(reveals[0].entryId,entry.id);assert.equal(reveals[0].destination,'calendar');assert.equal(reveals[0].dateISO,'2027-01-03');assert.equal(reveals[0].timeHHMM,'');
 }finally{await ui.close();disk.close();}
});

for(const destination of ['pending','archive'])test('manual '+destination+' survives rerenders, other tools and reopen; a fresh date selects calendar again',async()=>{
 const disk=await h.diskFixture(),props={scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)};let ui=await h.editorFixture(props);
 try{
  await edit(ui,'note-content','Destino elegido expresamente');await ui.pickDate('2027-01-03');await ui.destination(destination);selected(ui,destination);
  assert.match(ui.hosts.get('note-summary').children,new RegExp((destination==='pending'?'PENDIENTES':'ARCHIVO')+' · 03/01/2027'));
  await edit(ui,'note-title','Título nuevo');await ui.render({handedness:'left'});await ui.pickTime('18','30');selected(ui,destination);
  await ui.tool('date');await ui.tap('Mes siguiente');await ui.tap('note-date-today');await ui.back();selected(ui,destination);
  await ui.exit();const state=ui.calls.filter(c=>c[0]==='close').at(-1)[1];assert.equal(state.draft.destination,destination);assert.equal(state.draft.dateISO,'2027-01-03');
  await ui.close();ui=await h.editorFixture({...props,cached:state.draft});await ui.tool('date');await ui.back();selected(ui,destination);
  await ui.tap('unified-note-save');await ui.idle();const [entry]=await disk.reopen();assert.equal(entry.note.destination,destination);assert.equal(disk.rows.length,1);
  await ui.close();ui=await h.editorFixture({...props,initial:entry});await ui.tool('date');await ui.back();selected(ui,destination);
  await ui.pickDate('2027-01-04');selected(ui,'calendar');assert.match(ui.hosts.get('note-summary').children,/04\/01\/2027/);
 }finally{await ui.close();disk.close();}
});

for(const destination of ['calendar','archive'])test('clearing the date keeps persisted '+destination+' consistent without changing an explicit archive selection',async()=>{
 const disk=await h.diskFixture(),{entry}=await disk.api().saveUnifiedNote(disk.draft({destination,dateISO:'2027-01-03',time:'',duration:'45m'}),disk.scope,disk.active);
 const ui=await h.editorFixture({initial:entry,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});
 try{
  await ui.tool('date');await ui.tap('note-date-clear');await ui.idle();selected(ui,destination==='calendar'?'pending':'archive');
  await ui.tap('unified-note-save');await ui.idle();const [stored]=await disk.reopen();assert.equal(stored.id,entry.id);assert.equal(stored.note.destination,destination==='calendar'?'pending':'archive');
  assert.equal(stored.note.schedule.dateISO,'');assert.equal(stored.dateISO,'');assert.equal(stored.note.schedule.time,'');assert.equal(stored.note.schedule.duration,'45m');assert.equal(disk.rows.length,1);
 }finally{await ui.close();disk.close();}
});

for(const confirmScheduleOnSave of [false,true])test('archived date selection and later tools stay in the draft until main GUARDAR, including cached reopen / confirm='+confirmScheduleOnSave,async()=>{
 const disk=await h.diskFixture(),draft=disk.draft({title:'Archivada',content:'Contenido conservado',dateISO:'2027-01-02',time:'18:30',duration:'45m',reminderMinutes:15,place:'Madrid'});
 draft.attachments=[await disk.fileApi.importNoteFile(disk.scope,draft.id,await disk.sourceFile())];
 const {entry}=await disk.api().saveUnifiedNote(draft,disk.scope,disk.active),writes=disk.writes;
 const props={initial:entry,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)};let ui=await h.editorFixture({...props,confirmScheduleOnSave});
 try{
  await edit(ui,'note-content','Texto aún sin guardar');await ui.pickDate('2027-01-03');selected(ui,'calendar');
  assert.match(ui.container.textContent,/CALENDARIO · 03\/01\/2027 · 18:30/);assert.equal(disk.writes,writes);assert.equal(disk.rows[0].note.destination,'archive');
  await ui.tool('duration');await edit(ui,'note-duration-hour','1');await edit(ui,'note-duration-minute','00');await ui.back();await ui.exit();
  const state=ui.calls.filter(c=>c[0]==='close').at(-1)[1];assert.equal(state.saved,false);assert.equal(state.draft.destination,'calendar');assert.equal(disk.writes,writes);
  await ui.close();ui=await h.editorFixture({...props,cached:state.draft});await ui.tool('date');await ui.back();selected(ui,'calendar');assert.equal(disk.writes,writes);
  await ui.tap('unified-note-save');await ui.idle();let [stored]=await disk.reopen();
  assert.equal(disk.writes,writes+1);assert.equal(disk.rows.length,1);assert.equal(stored.id,entry.id);assert.equal(stored.ownerUserId,entry.ownerUserId);assert.equal(stored.taskContext,entry.taskContext);
  assert.equal(stored.note.destination,'calendar');assert.equal(stored.note.schedule.dateISO,'2027-01-03');assert.equal(stored.note.schedule.time,'18:30');assert.equal(stored.note.schedule.duration,'1h');
  assert.equal(stored.note.content,'Texto aún sin guardar');assert.equal(stored.note.title,'Archivada');assert.equal(stored.place,'Madrid');assert.equal(stored.note.reminderMinutes,15);
  assert.deepEqual(h.plain(stored.note.attachments),h.plain(entry.note.attachments));assert.equal(stored.note.history.at(-1).from,'archive');assert.equal(stored.note.history.at(-1).to,'calendar');
  await ui.tap('unified-note-save');await ui.idle();[stored]=await disk.reopen();assert.equal(disk.rows.length,1);assert.equal(stored.id,entry.id);assert.equal(disk.writes,writes+1);
 }finally{await ui.close();disk.close();}
});

test('removing a newly selected archive date and editing another field cannot silently commit its staged pending destination',async()=>{
 const disk=await h.diskFixture(),{entry}=await disk.api().saveUnifiedNote(disk.draft(),disk.scope,disk.active),writes=disk.writes;
 const props={initial:entry,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)};let ui=await h.editorFixture(props);
 try{
  await ui.pickDate('2027-01-03');await ui.tool('date');await ui.tap('note-date-clear');selected(ui,'pending');
  await ui.pickTime('18','30');assert.equal(disk.writes,writes);assert.equal(disk.rows[0].note.destination,'archive');
  await ui.exit();const state=ui.calls.filter(c=>c[0]==='close').at(-1)[1];await ui.close();ui=await h.editorFixture({...props,cached:state.draft});
  await ui.tool('time');await ui.back();selected(ui,'pending');assert.equal(disk.writes,writes);
  await ui.tap('unified-note-save');await ui.idle();assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].id,entry.id);assert.equal(disk.rows[0].note.destination,'pending');assert.equal(disk.rows[0].note.schedule.dateISO,'');
 }finally{await ui.close();disk.close();}
});

for(const changed of ['user','context'])test('changing '+changed+' cancels the archived date draft without moving or duplicating the note',async()=>{
 const disk=await h.diskFixture(),{entry}=await disk.api().saveUnifiedNote(disk.draft(),disk.scope,disk.active),writes=disk.writes;
 const ui=await h.editorFixture({initial:entry,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});
 try{
  await ui.pickDate('2027-01-03');selected(ui,'calendar');await ui.render({scope:{...disk.scope,...(changed==='user'?{userId:'another-user'}:{context:'other-context'})}});await ui.idle();
  assert.ok(ui.calls.some(c=>c[0]==='close'));assert.equal(ui.hosts.get('note-content').value,'');assert.equal(disk.writes,writes);assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].note.destination,'archive');
 }finally{await ui.close();disk.close();}
});

test('concurrent date completion and back keep one atomic date/destination write on the existing note',async()=>{
 const disk=await h.diskFixture(),{entry}=await disk.api().saveUnifiedNote(disk.draft({destination:'pending'}),disk.scope,disk.active),writes=disk.writes;let release;
 const ui=await h.editorFixture({initial:entry,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});
 try{
  await ui.tool('date');disk.gate(new Promise(resolve=>release=resolve));
  await ui.run(()=>{ui.hosts.get('note-date-2027-01-03').onPress();ui.hosts.get('note-date-2027-01-04').onPress();ui.hosts.get('note-navigation-back').onPress();});
  assert.equal(disk.writes,writes);await ui.run(()=>release());await ui.idle();selected(ui,'calendar');
  const [stored]=await disk.reopen();assert.equal(stored.note.destination,'calendar');assert.equal(stored.note.schedule.dateISO,'2027-01-03');assert.equal(stored.note.schedule.time,'');
  assert.equal(stored.id,entry.id);assert.equal(disk.rows.length,1);assert.equal(disk.writes,writes+1);assert.equal(ui.calls.some(c=>c[0]==='close'),false);
 }finally{release?.();await ui.close();disk.close();}
});
