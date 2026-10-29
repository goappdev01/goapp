import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
// These persistence/notification contract tests explicitly await the separate OS receipt.
const save=async(api,...args)=>{const result=await api.saveUnifiedNote(...args);await result.reminderSync;return result;};
const move=async(api,...args)=>{const result=await api.moveUnifiedNote(...args);await result.reminderSync;return result;};

for(const destination of ['archive','pending','calendar'])test(destination+': one phrase without title/duration/reminder survives real disk reopen, with no HTTP dependency',async()=>{
 const f=await h.diskFixture();try{const draft=f.draft({destination,...(destination==='calendar'?{dateISO:'2027-12-30',time:'3:15'}:{})});
  const result=await save(f.api(),draft,f.scope,f.active);assert.match(result.message,/guardada/);assert.equal(f.rows.length,1);assert.equal(f.rows[0].id,draft.id);assert.equal(f.rows[0].note.content,'Una frase');assert.equal(f.rows[0].note.title,'');
  assert.equal(f.rows[0].duration,'');assert.deepEqual(f.rows[0].reminders,[]);assert.equal(f.rows[0].note.destination,destination);assert.deepEqual(h.plain(await f.reopen()),f.rows);
  if(destination==='calendar')assert.equal(f.rows[0].time,'03:15');else assert.equal(f.rows[0].dateISO,'');
 }finally{f.close();}
});

test('actual disk failure keeps the draft, returns an error, permits retry and concurrent taps never duplicate an ID',async()=>{
 const f=await h.diskFixture();try{const draft=f.draft();f.failWrite(true);await assert.rejects(save(f.api(),draft,f.scope,f.active),/disco/);assert.equal(f.rows.length,0);assert.equal(draft.content,'Una frase');
  f.failWrite(false);await Promise.all([save(f.api(),draft,f.scope,f.active),save(f.api(),draft,f.scope,f.active)]);assert.equal(f.rows.length,1);assert.equal(f.writes,1);
 }finally{f.close();}
});

test('a readback failure never reports success and the identical retry verifies one existing row without another write',async()=>{
 const f=await h.diskFixture();try{await f.store.readGoLog();const draft=f.draft();f.failRead(true);await assert.rejects(save(f.api(),draft,f.scope,f.active),/almacenamiento/);
 assert.equal(f.rows.length,1);assert.equal(f.writes,1);f.failRead(false);const result=await save(f.api(),draft,f.scope,f.active);assert.match(result.message,/guardada/);assert.equal(f.rows.length,1);assert.equal(f.writes,1);
 }finally{f.close();}
});

test('editing and destination moves retain legacy independent reminder offsets and a manual mute',async()=>{
 const f=await h.diskFixture();try{const previous={...f.model.buildNoteEntry(f.draft({destination:'calendar',dateISO:'2027-12-30',time:'18:30',reminderMinutes:75}),f.scope),note:undefined,reminders:[75,15],notificationsEnabled:false};
 await f.store.updateGoLog(rows=>({entries:[previous,...rows],result:null}));const edit=f.model.noteDraft(previous);edit.content='Texto editado';let result=await save(f.api(),edit,f.scope,f.active);assert.deepEqual(f.rows[0].reminders,[15,75]);assert.equal(f.rows[0].notificationsEnabled,false);assert.equal(f.osRequests.size,0);
 result=await move(f.api(),result.entry,'archive',f.scope,f.active);assert.equal(f.nativeModel.nativeReminderTaskInScope(result.entry,f.scope),false);
 result=await move(f.api(),result.entry,'pending',f.scope,f.active);assert.equal(f.nativeModel.nativeReminderTaskInScope(result.entry,f.scope),false);
 await move(f.api(),result.entry,'calendar',f.scope,f.active);assert.deepEqual(f.rows[0].reminders,[15,75]);assert.equal(f.rows[0].notificationsEnabled,false);assert.equal(f.osRequests.size,0);
 }finally{f.close();}
});

test('full note retains content, location, exact schedule, attachments and native reminder after reload and edit',async()=>{
 const f=await h.diskFixture();try{const draft=f.draft({destination:'calendar',title:'Título completo',content:'Párrafo uno\nPárrafo dos',dateISO:'2027-12-30',time:'18:30',duration:'2h',reminderMinutes:75,place:'Dirección',location:{latitude:38,longitude:-1}});
  const asset=await f.sourceFile();draft.attachments=[await f.fileApi.importNoteFile(f.scope,draft.id,asset),{id:'web',kind:'link',name:'Referencia',uri:'https://example.com/manual'}];
  const result=await save(f.api(),draft,f.scope,f.active);assert.equal(f.osRequests.size,1);
  const [loaded]=await f.reopen();assert.equal(loaded.note.content,draft.content);assert.deepEqual(h.plain(loaded.note.attachments),h.plain(draft.attachments));assert.equal(fs.readFileSync(fileURLToPath(loaded.note.attachments[0].uri),'utf8'),'fixture document');
  const edit=f.model.noteDraft(loaded);edit.content='Texto corregido después de dictar';await save(f.api(),edit,f.scope,f.active);
  assert.equal(f.rows.length,1);assert.equal(f.rows[0].note.revision,2);assert.equal(f.rows[0].note.content,edit.content);assert.equal(f.rows[0].createdAt,result.entry.createdAt);assert.equal(f.osRequests.size,1);
 }finally{f.close();}
});

test('archive, pending and scheduling moves preserve one ID, metadata and completion history; archive is never completion',async()=>{
 const f=await h.diskFixture();try{const initial=await save(f.api(),f.draft({destination:'calendar',dateISO:'2027-12-30',time:'13:45',reminderMinutes:15}),f.scope,f.active);
  const completion=h.load('lib/goActionCompletion.ts'),doc=completion.recordCompletion(completion.emptyCompletionDocument(f.scope),initial.entry,'done',Date.now(),true),history=JSON.stringify(doc);
  const archived=await move(f.api(),initial.entry,'archive',f.scope,f.active);assert.equal(f.osRequests.size,0);assert.equal(archived.entry.id,initial.entry.id);assert.equal(archived.entry.estado,'pendiente');assert.equal(archived.entry.deleted,undefined);assert.equal(completion.completionEligible(archived.entry),false);assert.equal(JSON.stringify(doc),history);
  const pending=await move(f.api(),archived.entry,'pending',f.scope,f.active);assert.equal(pending.entry.dateISO,'');assert.equal(completion.plannedActionEnd(pending.entry),null);assert.equal(completion.completionDecision(pending.entry,doc).status,'done');
  const scheduled=await move(f.api(),pending.entry,'calendar',f.scope,f.active,{dateISO:'2027-12-30',time:'13:45'});assert.equal(scheduled.entry.id,initial.entry.id);assert.equal(f.rows.length,1);assert.equal(f.osRequests.size,1);assert.equal(scheduled.entry.note.history.length,3);assert.equal(completion.completionDecision(scheduled.entry,doc).status,'done');
 }finally{f.close();}
});

test('manual confirmation is reused; elapsed time and archiving never fabricate a done decision',async()=>{
 const f=await h.diskFixture();try{const {entry}=await save(f.api(),f.draft({destination:'calendar',dateISO:'2020-01-01',time:'13:45'}),f.scope,f.active),completion=h.load('lib/goActionCompletion.ts'),doc=completion.emptyCompletionDocument(f.scope);
  assert.equal(completion.completionDecision(entry,doc),undefined);assert.equal(completion.awaitingCompletion(entry,doc,Date.now()),true);
  const {entry:archived}=await move(f.api(),entry,'archive',f.scope,f.active);assert.equal(completion.awaitingCompletion(archived,doc,Date.now()),false);assert.equal(completion.completionDecision(archived,doc),undefined);
 }finally{f.close();}
});

test('concurrent edits, missing session and cross-context writes are refused without overwriting notes',async()=>{
 const f=await h.diskFixture();try{const {entry}=await save(f.api(),f.draft(),f.scope,f.active),edit=f.model.noteDraft(entry),other=f.model.noteDraft(entry);edit.content='Nueva versión';await save(f.api(),edit,f.scope,f.active);
  other.content='Versión obsoleta';await assert.rejects(save(f.api(),other,f.scope,f.active),/modificó/);assert.equal(f.rows[0].note.content,'Nueva versión');
  await f.setUser('other-user');await assert.rejects(save(f.api(),f.draft(),f.scope,f.active),/cuenta/);assert.equal(f.rows.length,1);
  await f.setUser(null);await assert.rejects(save(f.api(),f.draft(),f.scope,f.active),/cuenta/);assert.equal(f.rows.length,1);
  await f.setUser(f.scope.userId);f.changeContext('demo:BUSINESS:other');await assert.rejects(save(f.api(),f.draft(),f.scope,f.active),/contexto/);assert.equal(f.rows.length,1);
 }finally{f.close();}
});

test('protected saves and forged file associations are rejected before any ordinary persistence',async()=>{
 const f=await h.diskFixture();try{await assert.rejects(save(f.api(),f.draft({security:true,content:'private test fixture'}),f.scope,f.active),/seguridad no están activadas/);assert.equal(f.writes,0);
  const own=f.draft(),asset=await f.sourceFile(),attachment=await f.fileApi.importNoteFile(f.scope,own.id,asset);
  await assert.rejects(save(f.api(),f.draft({attachments:[attachment]}),f.scope,f.active),/pertenece/);assert.equal(f.writes,0);
  own.attachments=[attachment];fs.unlinkSync(fileURLToPath(attachment.uri));await assert.rejects(save(f.api(),own,f.scope,f.active),/adjunto/);assert.equal(f.writes,0);
  await assert.rejects(save(f.api(),f.draft({attachments:[{id:'bad',kind:'link',name:'bad',uri:'javascript:bad'}]}),f.scope,f.active),/enlace/);
 }finally{f.close();}
});

test('optional values do not prevent saving; calendar requires a real date/time; alerts stay unprogrammed outside calendar',async()=>{
 const f=await h.diskFixture();try{for(const patch of [{destination:'calendar'},{dateISO:'2027-02-30'},{time:'24:00'},{time:'03:60'},{reminderMinutes:-1}])await assert.rejects(save(f.api(),f.draft(patch),f.scope,f.active));
  const result=await save(f.api(),f.draft({reminderMinutes:15}),f.scope,f.active);assert.match(result.message,/sin programar/);assert.equal(f.osRequests.size,0);assert.equal(f.rows[0].note.reminderMinutes,15);
 }finally{f.close();}
});

test('ordinary editor opens both fields immediately without automatic keyboard and one save persists from that same form',async()=>{
 const f=await h.diskFixture(),ui=await h.editorFixture({scope:f.scope,onSave:d=>save(f.api(),d,f.scope,f.active)});
 try{assert.ok(ui.hosts.get('note-content'));assert.ok(ui.hosts.get('note-title'));assert.equal(ui.hosts.get('note-content').autoFocus,undefined);assert.equal(ui.hosts.get('note-title').autoFocus,undefined);
  await ui.run(()=>ui.hosts.get('note-content').onChangeText('Comprar leche'));assert.equal(ui.hosts.get('note-title').value,'');
  await ui.destination('pending');
  const press=ui.hosts.get('unified-note-save').onPress;await ui.run(()=>{press();press();});await ui.idle();assert.equal(f.rows.length,1);assert.equal(f.rows[0].note.content,'Comprar leche');assert.ok(ui.hosts.get('note-save-confirmation'));
 }finally{await ui.close();f.close();}
});

test('native dictation corrections, cursor-owned editing and optional configuration never unmount the content field',async()=>{
 const ui=await h.editorFixture();try{const instance=ui.instances.get('note-content');for(const text of ['Dictado nativo','Dictado natio','Dictado corregido','Texto insertado en medio']){await ui.run(()=>ui.hosts.get('note-content').onChangeText(text));assert.equal(ui.instances.get('note-content'),instance);assert.equal(ui.hosts.get('note-content').selection,undefined);}
  for(const option of ['date','time','duration','place','reminder','attachments']){await ui.tool(option);assert.equal(ui.instances.get('note-content'),instance);assert.equal(ui.hosts.get('note-content').value,'Texto insertado en medio');}
  await ui.run(()=>ui.hosts.get('note-microphone').onPress());assert.ok(ui.calls.some(c=>c[0]==='microphone'));
 }finally{await ui.close();}
});

test('failed UI save retains draft and error; normal close returns its unsaved content without inventing success',async()=>{
 const ui=await h.editorFixture({onSave:async()=>{throw Error('No se pudo guardar en disco');}});try{await ui.run(()=>ui.hosts.get('note-content').onChangeText('No perder texto'));await ui.destination('pending');await ui.run(()=>ui.hosts.get('unified-note-save').onPress());await ui.idle();
  assert.equal(ui.hosts.get('note-content').value,'No perder texto');assert.ok(ui.hosts.get('note-save-error'));assert.equal(ui.hosts.has('note-save-confirmation'),false);
  await ui.exit();const closed=ui.calls.find(c=>c[0]==='close')[1];assert.equal(closed.draft.content,'No perder texto');assert.equal(closed.saved,false);
 }finally{await ui.close();}
});

test('left/right editor keeps one shared square close, one save and a disabled real-security gate',async()=>{
 for(const handedness of ['left','right']){const ui=await h.editorFixture({handedness});try{assert.equal(ui.hosts.get('Cerrar nota').touchSize,56);assert.ok(ui.hosts.get('unified-note-save'));assert.ok(ui.hosts.get('note-security-info'));assert.equal(ui.hosts.has('note-floating-notice'),false);assert.match(ui.container.textContent,/NOTA/);assert.doesNotMatch(ui.container.textContent,/INTERNAL TASK|FICHA|SAVE|CAMBIAR AVISO/);}finally{await ui.close();}}
});

test('real editor attachment and location callbacks import a durable file, select a real result and persist both without a second form',async()=>{
 const disk=await h.diskFixture();let ui;try{const asset=await disk.sourceFile();let pickers=0;ui=await h.editorFixture({scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active),ports:{
 documents:{getDocumentAsync:async()=>{pickers++;return{canceled:false,assets:[asset]};}},importFile:disk.fileApi.importNoteFile,
 location:{geocodeAsync:async()=>[{latitude:38,longitude:-1},{latitude:39,longitude:-2}],reverseGeocodeAsync:async point=>[{street:point.latitude===38?'Calle uno':'Calle dos',streetNumber:'10',city:'Murcia'}],requestForegroundPermissionsAsync:()=>assert.fail('iOS address search should not request GPS permission')}}});
 await ui.run(()=>ui.hosts.get('note-content').onChangeText('Documento asociado'));
 await ui.tool('attachments');const pick=ui.hosts.get('PDF o documento').onPress;await ui.run(()=>{pick();pick();});await ui.idle();assert.equal(pickers,1);
 await ui.tool('place');await ui.run(()=>ui.hosts.get('note-place').onChangeText('Calle de búsqueda'));await ui.run(()=>ui.hosts.get('Buscar ubicación').onPress());await ui.idle();
 assert.equal(ui.hosts.get('note-place').value,'Calle de búsqueda','search proposes choices before replacing the selected location');await ui.run(()=>ui.hosts.get('note-location-result-1').onPress());assert.equal(ui.hosts.get('note-place').value,'Calle dos, 10, Murcia');
 await ui.destination('archive');await ui.run(()=>ui.hosts.get('unified-note-save').onPress());await ui.idle();assert.equal(disk.rows.length,1);const [loaded]=await disk.reopen();assert.equal(loaded.note.attachments.length,1);assert.equal(fs.readFileSync(fileURLToPath(loaded.note.attachments[0].uri),'utf8'),'fixture document');assert.equal(loaded.note.location.latitude,39);assert.equal(loaded.place,'Calle dos, 10, Murcia');
 }finally{if(ui)await ui.close();disk.close();}
});
