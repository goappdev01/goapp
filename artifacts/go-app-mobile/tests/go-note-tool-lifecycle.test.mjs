import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fixture as calendarFixture} from './helpers/calendar-fixture.mjs';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
const flat=value=>Object.assign({},...(Array.isArray(value)?value.flat(Infinity):[value]).filter(Boolean));
const edit=(ui,id,value)=>ui.run(()=>ui.hosts.get(id).onChangeText(value));
const focus=(ui,id)=>ui.run(()=>{ui.hosts.get(id).onFocus({target:77});ui.keyboard.show();});
const back=async ui=>{await ui.back();await ui.idle();};
const press=async(ui,id)=>{await ui.tap(id);await ui.idle();};
const number=async(ui,tool,hour,minute)=>{await ui.tool(tool);await edit(ui,`note-${tool}-hour`,hour);await edit(ui,`note-${tool}-minute`,minute);};
const ports={location:{requestForegroundPermissionsAsync:async()=>({status:'granted'}),getCurrentPositionAsync:async()=>({coords:{latitude:40.4168,longitude:-3.7038}}),reverseGeocodeAsync:async()=>[{street:'Calle Nueva',streetNumber:'12',city:'Madrid'}],Accuracy:{Balanced:3}}};

for(const handedness of ['right','left'])test('creation: save and both arrows conserve valid tool values only in the draft / '+handedness,async()=>{
 const disk=await h.diskFixture(),ui=await h.editorFixture({handedness,ports,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});
 try{
  await edit(ui,'note-content','Una nota sin título');
  await ui.tool('time');assert.equal(ui.hosts.get('note-time-clear').disabled,true);assert.match(ui.container.textContent,/GUARDAR/);assert.doesNotMatch(ui.container.textContent,/APLICAR HORA|SIN HORA/);
  await edit(ui,'note-time-hour','19');await edit(ui,'note-time-minute','30');await focus(ui,'note-time-minute');await back(ui);assert.ok(ui.hosts.has('note-time-picker'));assert.equal(disk.rows.length,0);await back(ui);
  assert.match(ui.hosts.get('note-summary').children,/19:30/);assert.equal(disk.rows.length,0);
  await number(ui,'time','20','00');await press(ui,'note-time-apply');assert.match(ui.hosts.get('note-summary').children,/20:00/);
  await ui.tool('time');assert.ok(ui.hosts.has('note-time-clear'));await press(ui,'note-time-clear');assert.equal(ui.hosts.get('note-option-time').accessibilityState.selected,false);
  await number(ui,'duration','1','30');await press(ui,'note-tools-toggle');assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,false);
  await ui.tool('duration');assert.equal(ui.hosts.get('note-duration-hour').value,'1');assert.equal(ui.hosts.get('note-duration-minute').value,'30');await press(ui,'note-duration-clear');assert.equal(ui.hosts.get('note-option-duration').accessibilityState.selected,false);
  await ui.tool('reminder');assert.equal(ui.hosts.get('note-reminder-none').disabled,true);await edit(ui,'note-reminder-hours','1');await edit(ui,'note-reminder-minutes','15');await back(ui);
  await ui.tool('reminder');assert.equal(ui.hosts.get('note-reminder-hours').value,'1');assert.equal(ui.hosts.get('note-reminder-minutes').value,'15');await press(ui,'note-reminder-none');assert.equal(ui.hosts.get('note-option-reminder').accessibilityState.selected,false);
  await ui.tool('place');await press(ui,'note-location-current');assert.equal(ui.hosts.get('note-location-current').accessibilityState.selected,true);assert.match(ui.container.textContent,/✓ Seleccionada: Calle Nueva/);await back(ui);
  await ui.tool('place');assert.match(ui.container.textContent,/Ubicación guardada: Calle Nueva/);await press(ui,'note-place-clear');assert.equal(ui.hosts.get('note-option-place').accessibilityState.selected,false);
  await ui.tool('attachments');await edit(ui,'note-link','https://example.com/referencia');await back(ui);await ui.tool('attachments');assert.match(ui.container.textContent,/example.com\/referencia/);await back(ui);
  assert.equal(disk.rows.length,0);await ui.destination('pending');await press(ui,'unified-note-save');assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].note.content,'Una nota sin título');assert.equal(disk.rows[0].note.title,'');assert.equal(disk.rows[0].note.attachments.length,1);
 }finally{await ui.close();disk.close();}
});

for(const destination of ['calendar','pending','archive'])for(const handedness of ['right','left'])test('existing '+destination+' / '+handedness+': same ID evolves through numerical edits, removal, attachments and every destination',async()=>{
 const disk=await h.diskFixture(),draft=disk.draft({destination,title:'HACER LA COMPRA',content:'Pan y tomates',dateISO:'2027-10-31',time:'19:30',duration:'90m',reminderMinutes:30,place:'Lugar anterior',location:{latitude:38,longitude:-1}});
 const originalFile=await disk.fileApi.importNoteFile(disk.scope,draft.id,await disk.sourceFile('anterior.pdf'));draft.attachments=[originalFile];
 const {entry}=await disk.api().saveUnifiedNote(draft,disk.scope,disk.active),photo=await disk.sourceFile('nueva.jpg','image fixture');
 const ui=await h.editorFixture({initial:entry,handedness,scope:disk.scope,ports:{...ports,images:{launchImageLibraryAsync:async()=>({canceled:false,assets:[{...photo,fileName:'nueva.jpg',mimeType:'image/jpeg'}]})},importFile:disk.fileApi.importNoteFile},onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});
 try{
  assert.equal(ui.hosts.get('note-title').value,'HACER LA COMPRA');assert.equal(ui.hosts.get('note-content').value,'Pan y tomates');
  await number(ui,'time','20','00');await focus(ui,'note-time-minute');const before=disk.writes;await back(ui);assert.equal(disk.writes,before);await back(ui);assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].id,entry.id);assert.equal(disk.rows[0].note.schedule.time,'20:00');assert.ok(ui.hosts.has('note-primary-controls'));
  await ui.tool('time');const unchanged=disk.writes;await back(ui);assert.equal(disk.writes,unchanged,'closing unchanged does not revise the note');
  await ui.tool('duration');await press(ui,'note-duration-1h');await back(ui);assert.equal(disk.rows[0].note.schedule.duration,'1h');
  await ui.tool('reminder');await press(ui,'note-reminder-none');assert.equal(disk.rows[0].note.reminderMinutes,null);assert.equal(disk.osRequests.size,0);
  await ui.tool('reminder');await edit(ui,'note-reminder-hours','0');await edit(ui,'note-reminder-minutes','15');await back(ui);assert.equal(disk.rows[0].note.reminderMinutes,15);assert.equal(disk.osRequests.size,destination==='calendar'?1:0);
  await ui.tool('reminder');await edit(ui,'note-reminder-minutes','45');await press(ui,'note-reminder-confirm');assert.equal(disk.rows[0].note.reminderMinutes,45);assert.equal(disk.osRequests.size,destination==='calendar'?1:0);
  await ui.tool('place');await press(ui,'note-location-current');assert.match(ui.container.textContent,/✓ Seleccionada/);await back(ui);assert.equal(disk.rows[0].place,'Calle Nueva, 12, Madrid');assert.equal(disk.rows[0].note.location.latitude,40.4168);
  await ui.tool('place');await press(ui,'note-place-clear');assert.equal(disk.rows[0].place,'');assert.equal(disk.rows[0].note.location,undefined);
  await ui.tool('attachments');assert.match(ui.container.textContent,/anterior.pdf/);await press(ui,'Fotografías');await press(ui,'Quitar anterior.pdf');await edit(ui,'note-link','https://example.com/compra');await back(ui);
  assert.equal(disk.rows[0].note.attachments.length,2);assert.equal(disk.rows[0].note.attachments.some(a=>a.id===originalFile.id),false);assert.match(ui.container.textContent,/nueva.jpg/);
  await ui.tool('attachments');const writes=disk.writes;await back(ui);assert.equal(disk.writes,writes);assert.equal(disk.rows[0].note.attachments.length,2);
  for(const to of ['pending','archive','calendar']){await ui.destination(to);await ui.idle();assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].id,entry.id);assert.equal(disk.rows[0].note.destination,to);assert.equal(disk.rows[0].dateISO,to==='calendar'?'2027-10-31':'');assert.equal(disk.osRequests.size,to==='calendar'?1:0);}
  await ui.tool('time');await press(ui,'note-time-clear');assert.equal(disk.rows[0].note.schedule.time,'');assert.equal(disk.rows[0].time,'');assert.equal(disk.rows[0].dateISO,'2027-10-31');assert.equal(disk.osRequests.size,0,'untimed day note cannot retain a stale alarm');
  await ui.tool('duration');await press(ui,'note-duration-clear');assert.equal(disk.rows[0].note.schedule.duration,'');
  const [stored]=await disk.reopen();assert.equal(stored.id,entry.id);assert.equal(stored.createdAt,entry.createdAt);assert.equal(stored.estado,entry.estado);assert.equal(stored.note.title,'HACER LA COMPRA');assert.equal(stored.note.content,'Pan y tomates');
  const reopened=await h.editorFixture({initial:stored,scope:disk.scope});try{await reopened.tool('time');assert.equal(reopened.hosts.get('note-time-clear').disabled,true);await back(reopened);await reopened.tool('attachments');assert.match(reopened.container.textContent,/nueva.jpg/);assert.doesNotMatch(reopened.container.textContent,/anterior.pdf/);}finally{await reopened.close();}
 }finally{await ui.close();disk.close();}
});

test('invalid, incomplete and impossible numerical edits cannot close, replace a valid selection or write storage',async()=>{
 const disk=await h.diskFixture(),{entry}=await disk.api().saveUnifiedNote(disk.draft({time:'19:30',duration:'1h',reminderMinutes:15}),disk.scope,disk.active),ui=await h.editorFixture({initial:entry,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});
 try{
  for(const [tool,hour,minute]of [['time','24','00'],['time','','12'],['duration','-1','30'],['duration','1',''],['reminder','0','60'],['reminder','','']]){
   if(!ui.hosts.has('note-option-'+tool)){if(ui.hosts.has('note-time-hour')){await edit(ui,'note-time-hour','19');await edit(ui,'note-time-minute','30');}if(ui.hosts.has('note-duration-hour')){await edit(ui,'note-duration-hour','1');await edit(ui,'note-duration-minute','00');}if(ui.hosts.has('note-reminder-hours')){await edit(ui,'note-reminder-hours','0');await edit(ui,'note-reminder-minutes','15');}await back(ui);}
   await ui.tool(tool);const hours=tool==='reminder'?'note-reminder-hours':`note-${tool}-hour`,minutes=tool==='reminder'?'note-reminder-minutes':`note-${tool}-minute`;await edit(ui,hours,hour);await edit(ui,minutes,minute);const before=disk.writes;await back(ui);assert.ok(ui.hosts.has(hours));assert.equal(disk.writes,before);assert.ok(ui.hosts.has('note-save-error'));
  }
  assert.equal(disk.rows[0].note.schedule.time,'19:30');assert.equal(disk.rows[0].note.schedule.duration,'1h');assert.equal(disk.rows[0].note.reminderMinutes,15);
 }finally{await ui.close();disk.close();}
});

test('failed write/readback leaves the tool and draft recoverable; save, back and blur converge on one idempotent operation',async()=>{
 for(const failure of ['write','read']){const disk=await h.diskFixture(),{entry}=await disk.api().saveUnifiedNote(disk.draft({time:'19:30'}),disk.scope,disk.active),ui=await h.editorFixture({initial:entry,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{
  await number(ui,'time','20','00');disk[failure==='write'?'failWrite':'failRead'](true);await back(ui);assert.ok(ui.hosts.has('note-time-picker'));assert.ok(ui.hosts.has('note-save-error'));assert.equal(ui.hosts.get('note-time-hour').value,'20');
  disk.failWrite(false);disk.failRead(false);await press(ui,'note-time-apply');assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].id,entry.id);assert.equal(disk.rows[0].note.schedule.time,'20:00');assert.equal(disk.rows[0].note.revision,2);
 }finally{await ui.close();disk.close();}}
});

test('concurrent finish events during the disk write commit once and do not close the editor',async()=>{
 const disk=await h.diskFixture(),{entry}=await disk.api().saveUnifiedNote(disk.draft({destination:'calendar',dateISO:'2027-10-31',time:'19:30',reminderMinutes:15}),disk.scope,disk.active);let release;disk.gate(new Promise(r=>release=r));
 const ui=await h.editorFixture({initial:entry,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{
  await number(ui,'time','20','00');await ui.run(()=>{ui.hosts.get('note-time-apply').onPress();ui.hosts.get('note-editor-footer').children[2].props.onPress();ui.hosts.get('note-tools-toggle').onPress();});await ui.idle();assert.equal(disk.writes,1);assert.equal(ui.calls.some(c=>c[0]==='close'),false);assert.equal(ui.hosts.get('unified-note-save').disabled,true);
  await ui.run(()=>release());await ui.idle();assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].note.revision,2);assert.equal(disk.osRequests.size,1);assert.equal(ui.calls.some(c=>c[0]==='close'),false);
 }finally{release?.();await ui.close();disk.close();}
});

test('tool persistence preserves unsubmitted text, execution state and other users; final save updates the same note',async()=>{
 const disk=await h.diskFixture(),{entry}=await disk.api().saveUnifiedNote(disk.draft({title:'Título guardado',content:'Texto guardado',time:'19:30'}),disk.scope,disk.active),other={...entry,id:'other-note',ownerUserId:'another-user'};await disk.store.updateGoLog(rows=>({entries:[...rows,other],result:null}));
 const ui=await h.editorFixture({initial:entry,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{
  await edit(ui,'note-content','Texto en edición');await number(ui,'time','20','00');await back(ui);assert.equal(disk.rows.find(row=>row.id===entry.id).detail,'Texto guardado');assert.equal(ui.hosts.get('note-content').value,'Texto en edición');assert.deepEqual(h.plain(disk.rows.find(row=>row.id===other.id)),h.plain(other));
  await press(ui,'unified-note-save');assert.equal(disk.rows.find(row=>row.id===entry.id).detail,'Texto en edición');assert.equal(disk.rows.length,2);
 }finally{await ui.close();disk.close();}
});

test('real shared detail delegates only note records to the same editor while reservations retain their presenter',()=>{
 const ui=calendarFixture(),{GoEntryDetailsSheet}=ui.load('components/GoEntryDetails.tsx'),calls=[],entry={id:'note',kind:'sent',type:'TAREA_INTERNA',notes:'Hacer la compra',detail:'Pan',note:{version:1}},close=()=>calls.push('close');
 const result=ui.render(GoEntryDetailsSheet,{entry,onClose:close,renderNote:(record,returnTo)=>{calls.push(record);return{type:'note-editor',props:{returnTo},children:[]};}});assert.equal(result.type,'note-editor');assert.equal(calls[0],entry);result.props.returnTo();assert.equal(calls[1],'close');
 const ordinary={...entry,note:undefined};ui.render(GoEntryDetailsSheet,{entry:ordinary,onClose:close,renderNote:()=>assert.fail('Other details must retain their presenter')});
});

test('existing status actions and modify callback remain usable; direct Landing arrow waits for native dismissal and retains the draft',async()=>{
 const disk=await h.diskFixture(),{entry}=await disk.api().saveUnifiedNote(disk.draft({content:'Contenido original'}),disk.scope,disk.active),actions=[];
 const actionHosts=new Map(),host=name=>props=>{if(props.accessibilityLabel)actionHosts.set(props.accessibilityLabel,props);return h.React.createElement('div',{'data-action':name},props.children);},f=calendarFixture();
 const original=h.load('components/GoEntryDetails.tsx',{'react-native':{...h.rn,TouchableOpacity:host('Button'),View:host('View'),Text:host('Text')},'@/components/ui/GoScreenModal':{GoScreenModal:host('Modal')},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})},'@expo/vector-icons':{Feather:host('Icon')},'@/contexts/LanguageContext':{useLanguage:()=>({lang:'es',t:key=>key})},'@/data/goEntryPresentation':f.load('data/goEntryPresentation.ts'),'@/data/reservationCardPolicy':f.load('data/reservationCardPolicy.ts'),'./ui/GoCloseButton':{},'./landing/landingPanels':{},'@/components/ui/GoScreenCloseSurface':{}});
 let goLanding=0;const ui=await h.editorFixture({initial:entry,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active),onGoToLanding:()=>goLanding++,renderActions:(record,onEdit)=>h.React.createElement(h.React.Fragment,null,h.React.createElement(original.GoEntryMicroActions,{entry:record,onDone:()=>actions.push(['done',record.id]),onPending:()=>actions.push(['pending',record.id]),onDiscard:()=>actions.push(['discard',record.id])}),h.React.createElement(original.GoEntryQuickActions,{entry:record,onEdit,onCancel:()=>actions.push(['cancel',record.id])}))});
 try{
  assert.ok(ui.hosts.has('note-existing-actions'));for(const label of ['REALIZADA','PENDIENTE','ELIMINAR','CANCELAR'])await ui.run(()=>actionHosts.get(label).onPress({stopPropagation(){}}));assert.deepEqual(actions.map(a=>a[0]),['done','pending','discard','cancel']);assert.ok(actions.every(a=>a[1]===entry.id));
  await ui.run(()=>actionHosts.get('MODIFICAR').onPress({stopPropagation(){}}));assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,true);
  await edit(ui,'note-content','Texto aún en borrador');await ui.tool('time');await edit(ui,'note-time-hour','20');await edit(ui,'note-time-minute','00');await press(ui,'Ir directamente al Landing');
  assert.equal(disk.rows[0].note.schedule.time,'20:00');assert.equal(goLanding,0);assert.equal(ui.hosts.get('NoteModal').visible,false);assert.equal(ui.calls.some(c=>c[0]==='close'),false);await ui.dismissSaved();await ui.dismissSaved();assert.equal(goLanding,1);
  const closed=ui.calls.find(c=>c[0]==='close')[1];assert.equal(closed.draft.content,'Texto aún en borrador');assert.equal(closed.saved,false);
 }finally{await ui.close();disk.close();}
});

test('native location failure never selects success or replaces a saved location',async()=>{
 const disk=await h.diskFixture(),{entry}=await disk.api().saveUnifiedNote(disk.draft({place:'Lugar conservado',location:{latitude:38,longitude:-1}}),disk.scope,disk.active),ui=await h.editorFixture({initial:entry,scope:disk.scope,ports:{location:{requestForegroundPermissionsAsync:async()=>({status:'denied'})}},onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});
 try{await ui.tool('place');const before=disk.writes;await press(ui,'note-location-current');assert.equal(ui.hosts.get('note-location-current').accessibilityState.selected,false);assert.match(ui.container.textContent,/Permite el acceso a ubicación/);assert.doesNotMatch(ui.container.textContent,/✓ Seleccionada/);await back(ui);assert.equal(disk.writes,before);assert.equal(disk.rows[0].place,'Lugar conservado');assert.equal(disk.rows[0].note.location.latitude,38);
 }finally{await ui.close();disk.close();}
});

test('invalid links cannot close or persist; repeated additions, GUARDAR and close never duplicate a valid link',async()=>{
 const disk=await h.diskFixture(),{entry}=await disk.api().saveUnifiedNote(disk.draft(),disk.scope,disk.active),ui=await h.editorFixture({initial:entry,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});
 try{await ui.tool('attachments');await edit(ui,'note-link','javascript:bad');const before=disk.writes;await back(ui);assert.ok(ui.hosts.has('note-link'));assert.equal(disk.writes,before);assert.match(ui.container.textContent,/enlace http/);
  await edit(ui,'note-link','https://example.com/manual');await press(ui,'Añadir enlace');await edit(ui,'note-link','https://example.com/manual');await press(ui,'note-attachments-save');assert.equal(disk.rows[0].note.attachments.length,1);const once=disk.writes;await ui.tool('attachments');await press(ui,'note-attachments-save');assert.equal(disk.writes,once);assert.equal(disk.rows[0].note.attachments.length,1);
 }finally{await ui.close();disk.close();}
});

test('main GUARDAR includes a currently open tool, but creation still performs one acknowledged record insertion',async()=>{
 const disk=await h.diskFixture(),ui=await h.editorFixture({scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{await edit(ui,'note-content','Una sola creación');await ui.destination('pending');await number(ui,'time','20','15');await focus(ui,'note-time-minute');await press(ui,'unified-note-save');assert.equal(disk.rows.length,1);assert.equal(disk.writes,1);assert.equal(disk.rows[0].note.schedule.time,'20:15');assert.equal(ui.keyboard.visible,false);assert.equal(disk.rows[0].note.revision,1);}finally{await ui.close();disk.close();}
});

test('an older recoverable edit cannot overwrite a newer note when reopened from a current calendar record',async()=>{
 const disk=await h.diskFixture();try{const {entry}=await disk.api().saveUnifiedNote(disk.draft({time:'19:30',duration:'1h'}),disk.scope,disk.active),cached={...disk.model.noteDraft(entry),content:'Texto del borrador anterior'},next={...disk.model.noteDraft(entry),duration:'2h'},current=await disk.api().saveUnifiedNote(next,disk.scope,disk.active);
  const ui=await h.editorFixture({initial:current.entry,cached,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{await number(ui,'time','20','00');await back(ui);assert.ok(ui.hosts.has('note-time-picker'));assert.match(ui.container.textContent,/modificó durante la edición/);assert.equal(disk.rows[0].note.schedule.duration,'2h');assert.equal(disk.rows[0].note.schedule.time,'19:30');assert.equal(ui.hosts.get('note-content').value,'Texto del borrador anterior');}finally{await ui.close();}
 }finally{disk.close();}
});

test('a failed explicit QUITAR remains the valid pending change when the user retries with the bottom arrow',async()=>{
 for(const [tool,clear,field,empty]of [['time','note-time-clear','time',''],['duration','note-duration-clear','duration',''],['reminder','note-reminder-none','reminderMinutes',null],['place','note-place-clear','place','']]){
  const disk=await h.diskFixture(),{entry}=await disk.api().saveUnifiedNote(disk.draft({time:'19:30',duration:'90m',reminderMinutes:15,place:'Lugar original'}),disk.scope,disk.active),ui=await h.editorFixture({initial:entry,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{
   await ui.tool(tool);if(tool==='place')await edit(ui,'note-place','Lugar provisional');disk.failWrite(true);await press(ui,clear);assert.ok(ui.hosts.has('note-save-error'));assert.equal(disk.rows.length,1);disk.failWrite(false);await back(ui);assert.ok(ui.hosts.has('note-primary-controls'));const actual=disk.model.noteDraft(disk.rows[0]);assert.equal(actual[field],empty);assert.equal(disk.rows[0].id,entry.id);assert.equal(disk.rows[0].note.revision,2);
  }finally{await ui.close();disk.close();}
 }
});

test('older note tasks acquire the same tools and update in place, while an attached reservation note retains its reservation sheet',async()=>{
 const f=calendarFixture(),Sheet=f.load('components/GoEntryDetails.tsx').GoEntryDetailsSheet,disk=await h.diskFixture();try{
  const legacy={...disk.model.buildNoteEntry(disk.draft({time:'19:30',duration:'1h'}),disk.scope),note:undefined};await disk.store.updateGoLog(rows=>({entries:[legacy,...rows],result:null}));let opened;
  f.render(Sheet,{entry:legacy,onClose(){},renderNote:entry=>{opened=entry;return{type:'note-tools',props:{},children:[]};}});assert.equal(opened.id,legacy.id);
  const ui=await h.editorFixture({initial:opened,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{await ui.pickTime('20','00');await ui.idle();assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].id,legacy.id);assert.equal(disk.rows[0].note.schedule.time,'20:00');assert.equal(disk.rows[0].createdAt,legacy.createdAt);}finally{await ui.close();}
  f.render(Sheet,{entry:{...legacy,id:'reservation',kind:'received',type:'GO_RESERVA',customerBooking:true,reservationId:'reserved'},onClose(){},renderNote:()=>assert.fail('An attached note must not replace the reservation')});
 }finally{disk.close();}
});

test('main GUARDAR on an existing note commits its open tool and edited text as one revision, despite repeated taps',async()=>{
 const disk=await h.diskFixture(),{entry}=await disk.api().saveUnifiedNote(disk.draft({content:'Texto anterior',time:'19:30'}),disk.scope,disk.active),ui=await h.editorFixture({initial:entry,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});
 try{await edit(ui,'note-content','Texto editado');await number(ui,'time','20','15');await focus(ui,'note-time-minute');const before=disk.writes;await ui.run(()=>{ui.hosts.get('unified-note-save').onPress();ui.hosts.get('unified-note-save').onPress();});await ui.idle();assert.equal(disk.writes,before+1);assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].id,entry.id);assert.equal(disk.rows[0].note.revision,2);assert.equal(disk.rows[0].note.schedule.time,'20:15');assert.equal(disk.rows[0].note.content,'Texto editado');assert.equal(ui.keyboard.visible,false);}finally{await ui.close();disk.close();}
});
