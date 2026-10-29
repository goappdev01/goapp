import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs'),esbuild=require(path.resolve('../../node_modules/.pnpm/esbuild@0.27.3/node_modules/esbuild'));
const output=esbuild.buildSync({entryPoints:['../../lib/api-zod/src/index.ts'],bundle:true,format:'cjs',platform:'node',write:false,nodePaths:[path.join(process.cwd(),'node_modules')]}).outputFiles[0].text;
const context={module:{exports:{}},exports:{},require};vm.runInNewContext(output,context);const model=context.module.exports;
function preparation({ai=false,plan=null}={}){
 const calls=[],today=()=> '2027-12-29',assistantApi=async(route,body)=>{calls.push({route,body});if(route==='/capabilities')return{interpretation:ai};if(route==='/plan'&&plan)return{plan};throw Error('Unavailable provider');};
 const shared={'@workspace/api-zod':model,'@/data/booking':{getAuthenticatedUserId:async()=> 'note-user'},'./bookingAssistant':{assistantApi,localToday:today},'./goLogBridge':{readPersonalGoLog:()=>assert.fail('No note may be read or written by preparation'),updatePersonalGoLog:()=>assert.fail('No automatic save')},'./goTaskAccess':{},'./time':{}};
 const actions=h.load('lib/goPersonalActions.ts',shared),reminders=h.load('lib/goTaskReminders.ts',shared),notes=h.load('lib/unifiedNotes.ts');
 const api=h.load('lib/goNotePreparation.ts',{'@workspace/api-zod':model,'./bookingAssistant':shared['./bookingAssistant'],'./goPersonalActions':actions,'./goTaskReminders':reminders,'./unifiedNotes':notes});
 return{prepare:api.prepareGoNote,calls};
}
const spoken='Nota Viaje: Preparar maleta mañana a las 18:30 durante 30 minutos en Madrid. Avísame una hora y quince minutos antes.';
test('GO reuses actual local interpretation to prepare explicit fields, preserving an unselected destination and never saving',async()=>{
 const p=preparation(),result=await p.prepare(spoken);assert.equal(result.patch.title,'Viaje');assert.equal(result.patch.dateISO,'2027-12-30');assert.equal(result.patch.time,'18:30');assert.equal(result.patch.duration,'30m');assert.equal(result.patch.place,'Madrid');assert.equal(result.patch.reminderMinutes,75);assert.match(result.patch.content,/Preparar maleta/);assert.equal('destination'in result.patch,false);assert.deepEqual(p.calls.map(c=>c.route),['/capabilities']);
});
test('available IA uses the existing plan endpoint without turning it into a write or inventing unspoken schedule/location',async()=>{
 const action={...model.emptyGoAction('Manual de la televisión','note'),title:'Manual de televisión',detail:'Instrucciones de uso',date:'2027-12-30',time:'09:00',place:'Inventado',durationMinutes:60};
 const p=preparation({ai:true,plan:{actions:[action]}}),result=await p.prepare('Manual de la televisión');assert.equal(result.patch.title,'Manual de televisión');assert.equal(result.patch.content,'Instrucciones de uso');for(const key of ['dateISO','time','duration','place','destination'])assert.equal(key in result.patch,false,key);assert.deepEqual(p.calls.map(c=>c.route),['/capabilities','/plan']);
});
test('ambiguous hours and multiple requests remain reviewable and never select a destination',async()=>{
 const p=preparation(),result=await p.prepare('Nota Médico: ir al médico mañana a las cinco');assert.equal(result.patch.time,undefined);assert.match(result.notice,/ambigua/);
 const many=await p.prepare('Crea una tarea comprar pan y crea una tarea llamar a Ana');assert.match(many.notice,/varias acciones/);assert.equal(many.patch.content,'Crea una tarea comprar pan y crea una tarea llamar a Ana');assert.equal(many.patch.destination,undefined);
});
test('new notes have no selected destination and cannot write until the user chooses one; existing archive notes retain their destination',async()=>{
 const disk=await h.diskFixture(),ui=await h.editorFixture({scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{
 assert.equal(disk.model.noteDraft().destination,null);for(const dest of ['calendar','pending','archive'])assert.equal(ui.hosts.get('note-destination-'+dest).accessibilityState.checked,false);
 await ui.run(()=>ui.hosts.get('note-content').onChangeText('No archivar accidentalmente'));await ui.run(()=>ui.hosts.get('unified-note-save').onPress());await ui.idle();assert.equal(disk.writes,0);assert.match(ui.container.textContent,/Selecciona CALENDARIO/);
 await assert.rejects(disk.api().saveUnifiedNote({...disk.draft(),destination:null},disk.scope,disk.active),/Selecciona/);assert.equal(disk.writes,0);
 await ui.destination('archive');await ui.run(()=>ui.hosts.get('unified-note-save').onPress());await ui.idle();assert.equal(disk.rows.length,1);assert.equal(disk.model.noteDraft(disk.rows[0]).destination,'archive');
 }finally{await ui.close();disk.close();}
});
test('security is compact and informational: its floating explanation appears only on demand and cannot activate protected storage',async()=>{
 const timers=[],ui=await h.editorFixture({ports:{timers:{setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}}}});try{
 assert.doesNotMatch(ui.container.textContent,/falta validar|No disponible en esta versión/);await ui.run(()=>ui.hosts.get('note-security-info').onPress());assert.match(ui.container.textContent,/falta validar el cifrado/);
 await ui.run(()=>timers.at(-1)());assert.doesNotMatch(ui.container.textContent,/falta validar el cifrado/);await ui.exit();assert.equal(ui.calls.find(c=>c[0]==='close')[1].draft.security,undefined);
 const protectedUI=await h.editorFixture({cached:{...h.load('lib/unifiedNotes.ts').noteDraft(),security:true}});try{await protectedUI.run(()=>protectedUI.hosts.get('note-microphone').onPress());assert.equal(protectedUI.calls.some(c=>c[0]==='microphone'),false);}finally{await protectedUI.close();}
 }finally{await ui.close();}
});
test('the real note voice hook routes a transcript into the existing interpreter, fills one draft and only GUARDAR persists after explicit destination',async()=>{
 const disk=await h.diskFixture(),p=preparation(),ui=await h.editorFixture({scope:disk.scope,ports:{prepare:p.prepare},onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{
 await ui.run(()=>ui.hosts.get('note-microphone').onPress());assert.ok(ui.calls.some(c=>c[0]==='microphone'));await ui.emit(spoken);await ui.idle();assert.equal(ui.hosts.get('note-title').value,'Viaje');assert.match(ui.hosts.get('note-content').value,/Preparar maleta/);assert.equal(disk.rows.length,0);
 await ui.tool('time');assert.equal(ui.hosts.get('note-time-hour').value,'18');assert.equal(ui.hosts.get('note-time-minute').value,'30');await ui.back();for(const dest of ['calendar','pending','archive'])assert.equal(ui.hosts.get('note-destination-'+dest).accessibilityState.checked,false);
 await ui.destination('calendar');await ui.run(()=>ui.hosts.get('unified-note-save').onPress());await ui.idle();assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].note.destination,'calendar');assert.equal(disk.rows[0].time,'18:30');assert.equal(disk.rows[0].note.reminderMinutes,75);assert.equal(disk.osRequests.size,1);
 }finally{await ui.close();disk.close();}
});
test('switching handedness mirrors only controls, retaining native text/editing and the unsaved data',async()=>{
 const ui=await h.editorFixture();try{await ui.run(()=>ui.hosts.get('note-content').onChangeText('Texto que no se invierte'));const instance=ui.instances.get('note-content');assert.equal(ui.hosts.get('note-primary-controls').style[1].flexDirection,'row-reverse');
 await ui.render({handedness:'left'});assert.equal(ui.hosts.get('note-primary-controls').style[1].flexDirection,'row');assert.equal(ui.hosts.get('note-editor-footer').style[1].flexDirection,'row-reverse');assert.equal(ui.hosts.get('note-content').value,'Texto que no se invierte');assert.equal(ui.instances.get('note-content'),instance);
 }finally{await ui.close();}
});
test('a late interpretation cannot overwrite manual corrections, a closed note or another identity',async()=>{
 let release;const gate=new Promise(r=>release=r),ui=await h.editorFixture({ports:{prepare:()=>gate}});try{
 await ui.emit('Dictado original');await ui.run(()=>ui.hosts.get('note-content').onChangeText('Corrección manual'));await ui.run(()=>ui.hosts.get('note-title').onChangeText('Mi título'));release({patch:{content:'Respuesta tardía',title:'Título IA'},notice:'Preparado'});await ui.idle();assert.equal(ui.hosts.get('note-content').value,'Corrección manual');assert.equal(ui.hosts.get('note-title').value,'Mi título');
 }finally{await ui.close();}
});

test('GO retains the real unavailability message; recording blocks saving and closes through the existing abort',async()=>{
 const ui=await h.editorFixture();try{
 ui.voice.error='El servicio de dictado de GO no está configurado o no está disponible.';await ui.render({});assert.match(ui.container.textContent,/no está configurado/);
 ui.voice.error='';ui.voice.status='listening';await ui.render({});assert.equal(ui.hosts.get('unified-note-save').disabled,true);await ui.run(()=>ui.hosts.get('note-microphone').onPress());assert.ok(ui.calls.some(c=>c[0]==='stop'));
 await ui.exit();assert.ok(ui.calls.some(c=>c[0]==='abort'));
 }finally{await ui.close();}
});

test('closing or changing identity ignores a delayed prepared result and preserves the captured unsaved dictation',async()=>{
 for(const action of ['close','identity']){let release;const gate=new Promise(r=>release=r),ui=await h.editorFixture({ports:{prepare:()=>gate}});try{
 await ui.emit('Dictado conservado');if(action==='close'){await ui.exit();assert.equal(ui.calls.find(c=>c[0]==='close')[1].draft.content,'Dictado conservado');}
 else await ui.render({scope:{userId:'another',context:'demo:USER'}});
 release({patch:{content:'No debe aplicarse'},notice:'Respuesta tardía'});await ui.idle();assert.doesNotMatch(ui.container.textContent,/Respuesta tardía/);assert.notEqual(ui.hosts.get('note-content').value,'No debe aplicarse');
 }finally{await ui.close();}}
});
