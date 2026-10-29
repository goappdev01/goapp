import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs'),flat=value=>Object.assign({},...(Array.isArray(value)?value.flat(Infinity):[value]).filter(Boolean));
const content=(ui,value='Una nota completa')=>ui.run(()=>ui.hosts.get('note-content').onChangeText(value));

test('date opens at the real local month, distinguishes today and selected dates, closes on a day and displays Spanish dates without an ISO input',async()=>{
 const ui=await h.editorFixture({ports:{today:new Date(2026,9,29)}});try{
  await content(ui);await ui.tool('date');assert.match(ui.hosts.get('note-date-month').children,/octubre de 2026/);assert.equal(flat(ui.hosts.get('note-date-today-ring').style).borderColor,'#2563eb');assert.equal(ui.hosts.get('note-date-2026-10-29').accessibilityState.selected,false);assert.equal(ui.hosts.has('note-date'),false);
  await ui.tap('note-date-2026-10-30');assert.equal(ui.hosts.has('note-inline-date-picker'),false);assert.match(ui.hosts.get('note-summary').children,/30\/10\/2026/);assert.equal(ui.hosts.get('note-option-date').accessibilityState.selected,true);
  await ui.tool('date');assert.equal(ui.hosts.get('note-date-2026-10-30').accessibilityState.selected,true);await ui.tap('note-date-2026-10-29');await ui.tool('date');assert.match(ui.hosts.get('note-date-2026-10-29').accessibilityLabel,/hoy, seleccionada/);assert.equal(flat(ui.hosts.get('note-date-today-ring').style).backgroundColor,'#d6f1df');
  await ui.tap('note-date-clear');assert.equal(ui.hosts.get('note-option-date').accessibilityState.selected,false);assert.equal(ui.hosts.has('note-inline-date-picker'),false);
 }finally{await ui.close();}
});

test('selected old dates open at their month; previous, next and HOY navigate without selecting or losing the original date',async()=>{
 const model=h.load('lib/unifiedNotes.ts'),cached={...model.noteDraft(),dateISO:'2000-02-29'},ui=await h.editorFixture({cached,ports:{today:new Date(2026,9,29)}});try{
  await ui.tool('date');assert.match(ui.hosts.get('note-date-month').children,/febrero de 2000/);await ui.tap('Mes anterior');assert.match(ui.hosts.get('note-date-month').children,/enero de 2000/);await ui.tap('Mes siguiente');assert.match(ui.hosts.get('note-date-month').children,/febrero de 2000/);
  for(let i=0;i<25;i++)await ui.tap('Mes siguiente');assert.match(ui.hosts.get('note-date-month').children,/marzo de 2002/);await ui.tap('note-date-today');assert.match(ui.hosts.get('note-date-month').children,/octubre de 2026/);
  await ui.tap('note-tool-back');assert.match(ui.hosts.get('note-summary').children,/29\/02\/2000/);await ui.tool('date');assert.match(ui.hosts.get('note-date-month').children,/febrero de 2000/);
 }finally{await ui.close();}
});

test('existing local time utilities identify today across UTC midnight and daylight-saving zones',()=>{
 const script=`const h=require('./tests/helpers/unified-note-fixture.cjs');const Real=Date;class Fixed extends Real{constructor(...a){super(...(a.length?a:['2026-10-29T00:30:00Z']));}}const t=h.load('lib/time.ts',{}, {Date:Fixed});process.stdout.write(t.formatISODate(t.getToday()));`;
 for(const [zone,date] of [['America/Los_Angeles','2026-10-28'],['Europe/Madrid','2026-10-29'],['Pacific/Auckland','2026-10-29']])assert.equal(execFileSync(process.execPath,['-e',script],{cwd:process.cwd(),env:{...process.env,TZ:zone},encoding:'utf8'}),date);
});

test('hour/minute columns cover all exact values without a keyboard and apply/clear exclusively on confirmation',async()=>{
 const ui=await h.editorFixture();try{
  await content(ui);for(const [hour,minute] of [['00','00'],['03','15'],['05','20'],['13','45'],['18','30'],['23','59']]){
   await ui.tool('time');assert.equal(ui.hosts.has('note-exact-hour'),false);assert.equal(ui.hosts.has('note-exact-minute'),false);
   for(let number=0;number<60;number++)assert.ok(ui.hosts.has('note-time-minute-'+String(number).padStart(2,'0')));
   await ui.tap('note-time-hour-'+hour);await ui.tap('note-time-minute-'+minute);assert.equal(ui.hosts.get('note-time-preview').children,hour+':'+minute);assert.ok(ui.hosts.has('note-time-apply'));
   await ui.tap('note-time-apply');assert.equal(ui.hosts.has('note-time-picker'),false);assert.match(ui.hosts.get('note-summary').children,new RegExp(hour+':'+minute));
   await ui.tool('time');assert.equal(ui.hosts.get('note-time-hour-'+hour).accessibilityState.checked,true);assert.equal(ui.hosts.get('note-time-minute-'+minute).accessibilityState.checked,true);await ui.tap('note-tool-back');
  }
  await ui.tool('time');await ui.tap('note-time-clear');assert.equal(ui.hosts.get('note-option-time').accessibilityState.selected,false);assert.equal(ui.keyboard.visible,false);
 }finally{await ui.close();}
});

test('duration is provisional until applied, closes on confirmation and preserves existing custom durations',async()=>{
 const ui=await h.editorFixture();try{
  await ui.tool('duration');for(const value of ['15m','30m','1h','2h'])assert.ok(ui.hosts.has('note-duration-'+value));await ui.tap('note-duration-30m');assert.equal(ui.hosts.get('note-duration-30m').accessibilityState.checked,true);await ui.tap('note-tool-back');assert.equal(ui.hosts.get('note-option-duration').accessibilityState.selected,false);
  await ui.tool('duration');await ui.tap('note-duration-2h');await ui.tap('note-duration-apply');assert.match(ui.hosts.get('note-summary').children,/2 horas/);await ui.tool('duration');assert.equal(ui.hosts.get('note-duration-2h').accessibilityState.checked,true);await ui.tap('note-duration-clear');assert.equal(ui.hosts.get('note-option-duration').accessibilityState.selected,false);
 }finally{await ui.close();}
 const cached={...h.load('lib/unifiedNotes.ts').noteDraft(),duration:'45m'},old=await h.editorFixture({cached});try{await old.tool('duration');assert.equal(old.hosts.get('note-duration-45m').accessibilityState.checked,true);await old.tap('note-duration-apply');assert.match(old.hosts.get('note-summary').children,/45 minutos/);}finally{await old.close();}
});

test('opening a nontext tool waits for native keyboard dismissal and the next layout frame, preserving text and native cursor ownership',async()=>{
 let manual=false,release,measure;const frames=[],ui=await h.editorFixture({ports:{dismiss:()=>new Promise(resolve=>release=resolve),frame:fn=>{if(manual)frames.push(fn);else Promise.resolve().then(()=>fn(0));return frames.length;},measure:fn=>manual?measure=fn:fn(0,0,366,600)}});try{
  await ui.tap('note-tools-toggle');manual=true;await content(ui,'Texto largo\nCon cursor propio');await ui.run(()=>{ui.hosts.get('note-content').onFocus({target:42});ui.keyboard.show();});const instance=ui.instances.get('note-content');await ui.tap('note-option-date');
  assert.equal(ui.hosts.has('note-inline-date-picker'),false);assert.equal(ui.keyboard.visible,true);assert.ok(ui.calls.some(c=>c[0]==='blur'&&c[1]==='note-content'));assert.equal(ui.calls.some(c=>c[0]==='keyboard-dismiss'),false);
  await ui.run(()=>release());assert.equal(ui.hosts.has('note-inline-date-picker'),false);assert.equal(ui.keyboard.focused,null);
  await ui.run(()=>ui.hosts.get('note-writing-workspace').onLayout({nativeEvent:{layout:{x:12,y:99,width:366,height:600}}}));await ui.run(()=>frames.splice(0).forEach(fn=>fn(0)));assert.equal(ui.hosts.has('note-inline-date-picker'),false);await ui.run(()=>measure(0,0,366,600));assert.ok(ui.hosts.has('note-inline-date-picker'));
  assert.equal(ui.instances.get('note-content'),instance);assert.equal(ui.hosts.get('note-content').value,'Texto largo\nCon cursor propio');assert.equal(ui.hosts.get('note-content').selection,undefined);assert.equal(ui.hosts.get('note-content').autoFocus,undefined);
 }finally{await ui.close();}
});

test('the existing bottom arrow and an outside heading tap hide the keyboard without closing the note; each nontext tool opens without it',async()=>{
 const ui=await h.editorFixture();try{
  await content(ui);await ui.run(()=>ui.keyboard.show());assert.equal(ui.hosts.has('note-hide-keyboard'),false);await ui.tap('Ocultar teclado');assert.equal(ui.keyboard.visible,false);assert.equal(ui.calls.some(c=>c[0]==='close'),false);
  await ui.run(()=>ui.keyboard.show());await ui.tap('note-heading');assert.equal(ui.keyboard.visible,false);
  for(const key of ['date','time','duration','reminder','attachments']){await ui.run(()=>ui.keyboard.show());await ui.tool(key);assert.equal(ui.keyboard.visible,false);assert.ok(ui.hosts.has('note-tool-back'));assert.equal(ui.hosts.get('note-content').value,'Una nota completa');}
 }finally{await ui.close();}
});

test('each tool starts with a fresh bounded scroll; no content-size callback can move the selector to an empty trailing area',async()=>{
 const ui=await h.editorFixture();try{
  let previous=ui.instances.get('note-tools-scroll');for(const key of ['date','attachments','place','reminder']){await ui.tool(key);const id=key==='date'?'note-date-grid':'note-tools-scroll',scroll=ui.hosts.get(id);assert.notEqual(ui.instances.get(id),previous);previous=ui.instances.get(id);assert.equal(scroll.bounces,false);assert.equal(scroll.alwaysBounceVertical,false);assert.equal(scroll.automaticallyAdjustKeyboardInsets,false);assert.equal(scroll.onContentSizeChange,undefined);assert.equal(scroll.contentContainerStyle.flexGrow,undefined);}
  assert.equal(ui.calls.some(c=>c[0]==='scrollEnd'||c[0]==='scrollTo'),false);
  await ui.tool('time');for(const key of ['hour','minute']){const list=ui.hosts.get('note-time-'+key+'-list');assert.equal(list.bounces,false);assert.equal(list.overScrollMode,'never');}await ui.tool('duration');assert.equal(ui.hosts.get('note-duration-options').bounces,false);
 }finally{await ui.close();}
});

test('textual tool inputs use native focus scrolling above the measured footer, without an extra keyboard spacer',async()=>{
 const ui=await h.editorFixture();try{
  await ui.tool('attachments');await ui.run(()=>ui.hosts.get('note-editor-footer').onLayout({nativeEvent:{layout:{height:106}}}));await ui.run(()=>ui.hosts.get('note-link').onFocus({nativeEvent:{target:77}}));await ui.run(()=>ui.keyboard.show());
  assert.ok(ui.calls.some(c=>c[0]==='reveal-input'&&c[1]===77&&c[2]===122&&c[3]===true));assert.equal(ui.hosts.get('note-tools-scroll').automaticallyAdjustKeyboardInsets,false);assert.equal(ui.hosts.has('note-hide-keyboard'),false);assert.ok(ui.hosts.has('Ocultar teclado'));assert.equal(ui.hosts.has('note-tool-header'),false);assert.ok(ui.hosts.has('note-tool-back'));assert.equal(ui.hosts.get('note-tool-back').style[0].height,44);
  const atShow=ui.calls.filter(c=>c[0]==='reveal-input').length;await ui.run(()=>ui.hosts.get('note-writing-workspace').onLayout({nativeEvent:{layout:{x:12,y:80,width:296,height:102}}}));assert.ok(ui.calls.filter(c=>c[0]==='reveal-input').length>atShow,'reveal is recalculated after the keyboard changes the real viewport');
  await ui.tap('Ocultar teclado');assert.ok(ui.hosts.has('note-tool-header'));const before=ui.calls.filter(c=>c[0]==='reveal-input').length;await ui.run(()=>ui.hosts.get('note-content').onFocus({target:99}));await ui.run(()=>ui.keyboard.show());assert.equal(ui.calls.filter(c=>c[0]==='reveal-input').length,before,'returning to content never scrolls an old tool field');
 }finally{await ui.close();}
});

test('a stored custom duration survives editing an archived or pending note without allowing unsupported durations in new notes',async()=>{
 const disk=await h.diskFixture();try{
  const initial=await disk.api().saveUnifiedNote(disk.draft({destination:'archive'}),disk.scope,disk.active),legacy={...initial.entry,note:{...initial.entry.note,schedule:{dateISO:'2027-12-30',time:'18:30',duration:'45m'}}};
  await disk.storage.setItem('go_log_v1',JSON.stringify([legacy]));const [loaded]=await disk.reopen(),draft=disk.model.noteDraft(loaded);draft.title='Nota antigua corregida';await disk.api().saveUnifiedNote(draft,disk.scope,disk.active);assert.equal((await disk.reopen())[0].note.schedule.duration,'45m');
  await assert.rejects(disk.api().saveUnifiedNote(disk.draft({duration:'45m'}),disk.scope,disk.active),/duración válida/);
 }finally{disk.close();}
});

for(const destination of ['pending','calendar','archive'])test('real full-cycle persistence with calendar/time/duration/image/location/reminder in '+destination,async()=>{
 const disk=await h.diskFixture(),asset=await disk.sourceFile('foto.jpg','actual imported fixture bytes'),ui=await h.editorFixture({scope:disk.scope,ports:{images:{launchImageLibraryAsync:async()=>({canceled:false,assets:[{...asset,fileName:asset.name,mimeType:'image/jpeg'}]})},importFile:(scope,id,file)=>disk.fileApi.importNoteFile(scope,id,file)},onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{
  await content(ui,'Contenido completo corregido tras dictado');await ui.run(()=>ui.hosts.get('note-title').onChangeText('Nota de prueba'));await ui.pickDate('2027-12-30');await ui.pickTime('18','37');await ui.tool('duration');await ui.tap('note-duration-30m');await ui.tap('note-duration-apply');
  await ui.tool('attachments');await ui.tap('Fotografías');await ui.idle();assert.match(ui.container.textContent,/foto.jpg/);assert.match(ui.hosts.get('note-floating-notice').children.props.children,/borrador/);assert.equal(ui.hosts.has('note-save-confirmation'),false);
  await ui.tool('place');await ui.run(()=>ui.hosts.get('note-place').onChangeText('Madrid'));await ui.tool('reminder');await ui.run(()=>ui.hosts.get('note-reminder-hours').onChangeText('1'));await ui.run(()=>ui.hosts.get('note-reminder-minutes').onChangeText('15'));await ui.tap('note-reminder-confirm');
  assert.equal(disk.writes,0);await ui.destination(destination);await ui.tap('unified-note-save');await ui.idle();let [saved]=await disk.reopen();assert.equal(saved.note.destination,destination);assert.equal(saved.note.schedule.dateISO,'2027-12-30');assert.equal(saved.note.schedule.time,'18:37');assert.equal(saved.note.schedule.duration,'30m');assert.equal(saved.note.reminderMinutes,75);assert.equal(saved.note.attachments[0].name,'foto.jpg');assert.equal(saved.place,'Madrid');assert.equal(saved.note.content,'Contenido completo corregido tras dictado');assert.ok(ui.hosts.has('note-save-confirmation'));
  await ui.tap('unified-note-save');await ui.idle();assert.equal((await disk.reopen()).length,1);await content(ui,'Nota modificada');await ui.tap('unified-note-save');await ui.idle();[saved]=await disk.reopen();assert.equal(saved.note.content,'Nota modificada');assert.equal(disk.rows.length,1);
 }finally{await ui.close();disk.close();}
});

test('destination, invalid date and invalid hour errors are distinct and route to the actual control without losing the draft',async()=>{
 const model=h.load('lib/unifiedNotes.ts'),cached={...model.noteDraft(),content:'Borrador inválido recuperable',dateISO:'2026-02-30',time:'27:90'},ui=await h.editorFixture({cached});try{
  await ui.tap('unified-note-save');assert.match(ui.container.textContent,/Selecciona CALENDARIO/);assert.ok(ui.hosts.has('note-destinations'));assert.equal(ui.hosts.has('note-inline-date-picker'),false);
  await ui.destination('pending');await ui.tap('unified-note-save');assert.match(ui.container.textContent,/La fecha no es válida/);assert.ok(ui.hosts.has('note-inline-date-picker'));assert.doesNotMatch(ui.container.textContent,/Selecciona CALENDARIO/);
  await ui.tap('note-date-2027-01-02');await ui.tap('unified-note-save');assert.match(ui.container.textContent,/Introduce una hora/);assert.ok(ui.hosts.has('note-time-picker'));assert.equal(ui.hosts.get('note-content').value,cached.content);
  await ui.tap('note-time-hour-23');await ui.tap('note-time-minute-59');await ui.tap('note-time-apply');await ui.tap('unified-note-save');await ui.idle();assert.ok(ui.hosts.has('note-save-confirmation'));
 }finally{await ui.close();}
});

test('a tool request finishing after close or identity change never reopens a stale selector',async()=>{
 for(const mode of ['close','identity']){let release;const ui=await h.editorFixture({ports:{dismiss:()=>new Promise(resolve=>release=resolve)}});try{
  await ui.tap('note-tools-toggle');await ui.run(()=>ui.keyboard.show());await ui.tap('note-option-date');await ui.render(mode==='close'?{visible:false}:{scope:{userId:'other-user',context:'demo:USER'}});await ui.run(()=>release());assert.equal(ui.hosts.has('note-inline-date-picker'),false);
 }finally{await ui.close();}}
});

test('attachment links remain after changing tools and hiding the text tool blurs its keyboard without closing the note',async()=>{
 const ui=await h.editorFixture();try{
  await ui.tool('attachments');await ui.run(()=>ui.hosts.get('note-link').onChangeText('https://example.org/documento'));await ui.tap('Añadir enlace');assert.match(ui.container.textContent,/example.org\/documento/);await ui.tool('place');await ui.tool('attachments');assert.match(ui.container.textContent,/example.org\/documento/);
  await ui.run(()=>ui.hosts.get('note-link').onFocus({target:42}));await ui.run(()=>ui.keyboard.show());await ui.tap('note-tools-toggle');assert.equal(ui.keyboard.visible,false);assert.equal(ui.calls.some(c=>c[0]==='close'),false);await ui.tap('note-tools-toggle');assert.match(ui.container.textContent,/example.org\/documento/);
  await ui.tap('Quitar https://example.org/documento');assert.doesNotMatch(ui.container.textContent,/https:\/\/example.org\/documento/);
 }finally{await ui.close();}
});

test('an attachment waiting for keyboard dismissal never opens a picker after the account changes',async()=>{
 let waiting=false,release,pickers=0;const ui=await h.editorFixture({ports:{dismiss:()=>waiting?new Promise(resolve=>release=resolve):Promise.resolve(),documents:{getDocumentAsync:async()=>{pickers++;return{canceled:true};}}}});try{
  await ui.tool('attachments');waiting=true;await ui.run(()=>{ui.hosts.get('note-link').onFocus({target:42});ui.keyboard.show();});await ui.tap('PDF o documento');await ui.render({scope:{userId:'other-user',context:'demo:USER'}});await ui.run(()=>release());await ui.idle();assert.equal(pickers,0);assert.equal(ui.hosts.get('note-content').value,'');
 }finally{await ui.close();}
});

test('failed persistent save after all selections keeps the draft and retries without duplicating an existing note',async()=>{
 const disk=await h.diskFixture(),ui=await h.editorFixture({scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{
  await content(ui,'No perder tras fallo de disco');await ui.pickDate('2027-01-03');await ui.pickTime('09','07');await ui.destination('pending');disk.failWrite(true);await ui.tap('unified-note-save');await ui.idle();assert.equal(disk.rows.length,0);assert.ok(ui.hosts.has('note-save-error'));assert.equal(ui.hosts.has('note-save-confirmation'),false);assert.equal(ui.hosts.get('note-content').value,'No perder tras fallo de disco');
  disk.failWrite(false);await ui.tap('unified-note-save');await ui.idle();assert.equal((await disk.reopen()).length,1);assert.equal(disk.rows[0].note.schedule.time,'09:07');await ui.tap('unified-note-save');await ui.idle();assert.equal((await disk.reopen()).length,1);
 }finally{await ui.close();disk.close();}
});

test('a syntactically valid hour missing during the local daylight-saving transition routes back to HORA',()=>{
 const script=`const h=require('./tests/helpers/unified-note-fixture.cjs'),a=require('node:assert/strict');(async()=>{const cached={...h.load('lib/unifiedNotes.ts').noteDraft(),content:'Acción',destination:'calendar',dateISO:'2027-03-28',time:'02:30'};const ui=await h.editorFixture({cached,onSave:()=>a.fail('Invalid local hour must not be saved')});try{await ui.tap('unified-note-save');a.match(ui.container.textContent,/Esa hora no existe/);a.ok(ui.hosts.has('note-time-picker'));process.stdout.write('dst-hour-routed');}finally{await ui.close();}})().catch(e=>{console.error(e);process.exitCode=1;});`;
 assert.equal(execFileSync(process.execPath,['-e',script],{cwd:process.cwd(),env:{...process.env,TZ:'Europe/Madrid'},encoding:'utf8'}),'dst-hour-routed');
});
