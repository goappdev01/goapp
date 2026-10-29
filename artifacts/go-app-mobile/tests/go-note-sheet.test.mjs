import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
const flat=s=>Object.assign({},...(Array.isArray(s)?s.flat(Infinity):[s]).filter(Boolean));
const open=ui=>ui.run(()=>{const button=ui.hosts.get('note-tools-toggle');button.onPressIn?.();button.onPress();});

test('white writing sheet starts with tools fully hidden and no selected destination; opening tools never changes the draft',async()=>{
 const ui=await h.editorFixture();try{
  assert.equal(flat(ui.hosts.get('unified-note-screen').style).backgroundColor,'#FAFAF7');
  assert.equal(flat(ui.hosts.get('note-tools-panel').style).display,'none');
  assert.equal(ui.hosts.get('note-tools-panel').pointerEvents,'none');
  assert.equal(ui.hosts.get('note-tools-panel').accessibilityElementsHidden,true);
  for(const dest of ['calendar','pending','archive'])assert.equal(ui.hosts.get('note-destination-'+dest).accessibilityState.checked,false);
  await open(ui);assert.equal(flat(ui.hosts.get('note-tools-panel').style).display,'flex');
  assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,true);
  assert.equal(ui.calls.some(c=>c[0]==='keyboard'),false);
  await open(ui);assert.equal(flat(ui.hosts.get('note-tools-panel').style).display,'none');
 }finally{await ui.close();}
});

test('repeated manual folding keeps long dictated text, native input instance, selection freedom and unfinished reminder fields',async()=>{
 const ui=await h.editorFixture();try{
  const text=('Párrafo dictado, seleccionable y editable.\n').repeat(100);
  await ui.run(()=>ui.hosts.get('note-content').onChangeText(text));const instance=ui.instances.get('note-content');
  await open(ui);await ui.run(()=>ui.hosts.get('note-option-reminder').onPress());await ui.run(()=>ui.hosts.get('note-reminder-hours').onChangeText('2'));
  await ui.run(()=>ui.hosts.get('note-reminder-minutes').onChangeText('25'));
  for(let i=0;i<12;i++)await open(ui);
  assert.equal(ui.instances.get('note-content'),instance);assert.equal(ui.hosts.get('note-content').value,text);
  assert.equal(ui.hosts.get('note-reminder-hours').value,'2');assert.equal(ui.hosts.get('note-reminder-minutes').value,'25');
  for(const key of ['selection','onSelectionChange','autoFocus'])assert.equal(ui.hosts.get('note-content')[key],undefined);
  await ui.run(()=>ui.hosts.get('note-content').onChangeText(text.replace('dictado','corregido')));assert.match(ui.hosts.get('note-content').value,/corregido/);
  assert.equal(ui.calls.some(c=>c[0]==='keyboard'),false);
 }finally{await ui.close();}
});

test('Close stays at the dominant edge with save, GO, close order; left-handed mode mirrors controls, panel and tab without reversing text',async()=>{
 const ui=await h.editorFixture();try{
  await ui.run(()=>ui.hosts.get('note-content').onChangeText('Texto con sentido de lectura normal'));const instance=ui.instances.get('note-content');
  const footer=ui.hosts.get('note-editor-footer');assert.equal(footer.children[0].props.testID,'unified-note-save');assert.equal(footer.children[1].props.testID,'note-microphone');assert.equal(footer.children[2].props.accessibilityLabel,'Cerrar nota');
  assert.equal(flat(footer.style).flexDirection,'row');assert.equal(flat(ui.hosts.get('note-tools-panel').style).right,0);
  await open(ui);await ui.render({handedness:'left'});
  assert.equal(flat(ui.hosts.get('note-editor-footer').style).flexDirection,'row-reverse');assert.equal(flat(ui.hosts.get('note-tools-panel').style).left,0);
  assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,true);assert.equal(ui.instances.get('note-content'),instance);assert.equal(ui.hosts.get('note-content').value,'Texto con sentido de lectura normal');
 }finally{await ui.close();}
});

test('keyboard layout changes keep the same live field, enlarge usable writing area and leave save/GO/close mounted',async()=>{
 const ui=await h.editorFixture();try{
  await ui.run(()=>ui.hosts.get('note-content').onChangeText('Texto conservado'));const instance=ui.instances.get('note-content');
  for(const height of [640,260,180,640]){await ui.run(()=>ui.hosts.get('unified-note-scroll').onLayout({nativeEvent:{layout:{height}}}));
   assert.ok(flat(ui.hosts.get('note-content').style).height>=120);assert.equal(ui.instances.get('note-content'),instance);assert.equal(ui.hosts.get('note-content').value,'Texto conservado');assert.equal(ui.hosts.get('note-content').scrollEnabled,true);
   assert.ok(ui.hosts.get('unified-note-save'));assert.ok(ui.hosts.get('note-microphone'));assert.ok(ui.hosts.get('Cerrar nota'));
  }
  assert.ok(flat(ui.hosts.get('note-content').style).height>=530);
 }finally{await ui.close();}
});

test('all three destinations survive folding and persist with the existing store, without saving on selection or creating duplicate records',async()=>{
 for(const destination of ['pending','archive','calendar']){const disk=await h.diskFixture(),ui=await h.editorFixture({scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{
  await ui.run(()=>ui.hosts.get('note-content').onChangeText('Una nota '+destination));await open(ui);
  if(destination==='calendar'){await ui.run(()=>ui.hosts.get('note-option-date').onPress());await ui.run(()=>ui.hosts.get('note-date').onChangeText('2027-12-30'));await ui.run(()=>ui.hosts.get('note-option-time').onPress());await ui.run(()=>ui.hosts.get('note-exact-hour').onChangeText('18'));await ui.run(()=>ui.hosts.get('note-exact-minute').onChangeText('30'));}
  await ui.run(()=>ui.hosts.get('note-destination-'+destination).onPress());assert.equal(disk.rows.length,0);assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,true);
  await open(ui);await ui.run(()=>ui.hosts.get('unified-note-save').onPress());await ui.idle();const [loaded]=await disk.reopen();assert.equal(loaded.note.destination,destination);assert.equal(loaded.note.content,'Una nota '+destination);assert.equal(disk.rows.length,1);
  await ui.run(()=>ui.hosts.get('unified-note-save').onPress());await ui.idle();assert.equal((await disk.reopen()).length,1);
 }finally{await ui.close();disk.close();}}
});

test('saving without a destination keeps the tools closed and text intact; security stays informational and GO uses its existing callback',async()=>{
 const ui=await h.editorFixture();try{
  await ui.run(()=>ui.hosts.get('note-content').onChangeText('No archivar por accidente'));await ui.run(()=>ui.hosts.get('unified-note-save').onPress());assert.match(ui.container.textContent,/Selecciona CALENDARIO/);assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,false);
  await open(ui);await ui.run(()=>ui.hosts.get('note-security-info').onPress());assert.match(ui.container.textContent,/falta validar el cifrado/);await open(ui);
  await ui.run(()=>ui.hosts.get('note-microphone').onPress());assert.ok(ui.calls.some(c=>c[0]==='microphone'));await ui.run(()=>ui.hosts.get('Cerrar nota').onPress());const state=ui.calls.find(c=>c[0]==='close')[1];assert.equal(state.draft.content,'No archivar por accidente');assert.equal(state.draft.destination,null);assert.equal(state.draft.security,undefined);
 }finally{await ui.close();}
});

test('light close appearance is opt-in; every other screen retains the original dark button, size, icon and propagation behavior',()=>{
 const native={TouchableOpacity:'button',View:'view',StyleSheet:{create:x=>x}},icons={Feather:'icon'},Close=h.load('components/ui/GoCloseButton.tsx',{'react-native':native,'@expo/vector-icons':icons}).GoCloseButton;
 const defaults=Close({level:'panel',onPress(){},accessibilityLabel:'Cerrar'});assert.equal(defaults.props.style.backgroundColor,'#0e0e10');assert.equal(defaults.props.children.props.color,'#ffffff');assert.equal(defaults.props.style.width,44);
 let stopped=0,closed=0;const light=Close({level:'panel',onPress(){closed++;},accessibilityLabel:'Cerrar nota',touchSize:56,appearance:'light'});assert.equal(light.props.style.width,56);assert.equal(light.props.children.props.children.props.color,'#17212b');light.props.onPress({stopPropagation(){stopped++;}});assert.equal(stopped,1);assert.equal(closed,1);
});

test('premium heading is centered independently of floating controls; normal tools use 56 percent of the measured sheet and sit lower',async()=>{
 const ui=await h.editorFixture();try{
  assert.equal(flat(ui.hosts.get('note-heading').style).textAlign,'center');assert.equal(flat(ui.hosts.get('note-heading').style).width,'100%');
  await ui.run(()=>ui.hosts.get('note-writing-workspace').onLayout({nativeEvent:{layout:{x:12,y:99,width:366,height:600}}}));
  const tools=flat(ui.hosts.get('note-tools-panel').style),tab={...flat(ui.hosts.get('note-tools-toggle').style),...ui.fab.style()};
  assert.ok(tools.width>=366*.5&&tools.width<=366*.6);assert.ok(tools.width<318*.7);assert.equal(tools.height,360);assert.equal(tools.bottom,0);assert.equal(tab.top,444);assert.ok(tab.top>600*.4);assert.equal(tab.height,48);assert.equal(tab.width,44);
  assert.equal(ui.hosts.get('note-option-date').activeOpacity,0.78);assert.equal(flat(ui.hosts.get('note-option-date').children.at(-1).props.style).textAlign,'center');
  assert.equal(flat(ui.hosts.get('note-destination-pending').style).backgroundColor,'rgba(255,239,168,0.90)');assert.equal(flat(ui.hosts.get('note-destination-archive').style).backgroundColor,'rgba(211,229,255,0.90)');assert.equal(flat(ui.hosts.get('note-destination-calendar').style).backgroundColor,'rgba(199,236,224,0.90)');
 }finally{await ui.close();}
});

test('large fonts, inline pickers and short keyboard viewports get only the extra space they need without moving the writing frame',async()=>{
 const ports={viewport:{width:320,height:568,scale:2,fontScale:2}},ui=await h.editorFixture({ports});try{
  await ui.run(()=>ui.hosts.get('note-content').onChangeText('Borrador intacto'));const instance=ui.instances.get('note-content');
  await ui.run(()=>ui.hosts.get('note-writing-workspace').onLayout({nativeEvent:{layout:{x:12,y:99,width:296,height:96}}}));await open(ui);
  assert.equal(flat(ui.hosts.get('note-tools-panel').style).width,296);assert.equal(flat(ui.hosts.get('note-tools-panel').style).height,96);assert.ok(ui.fab.style().top+48<=96);
  await ui.run(()=>ui.hosts.get('note-option-date').onPress());assert.ok(ui.hosts.get('note-date'));assert.equal(flat(ui.hosts.get('note-tools-panel').style).width,296);
  ports.viewport={width:390,height:844,scale:3,fontScale:1};await ui.run(()=>ui.hosts.get('note-writing-workspace').onLayout({nativeEvent:{layout:{x:12,y:99,width:366,height:600}}}));assert.equal(flat(ui.hosts.get('note-tools-panel').style).width,288);
  await ui.run(()=>ui.hosts.get('note-option-date').onPress());assert.ok(flat(ui.hosts.get('note-tools-panel').style).width<=366*.6);assert.equal(ui.instances.get('note-content'),instance);assert.equal(ui.hosts.get('note-content').value,'Borrador intacto');
 }finally{await ui.close();}
});

test('opening tools, hiding them and changing handedness never resizes the sheet, starts voice or persists a draft',async()=>{
 const disk=await h.diskFixture(),ui=await h.editorFixture({scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{
  const initial=flat(ui.hosts.get('unified-note-scroll').style);await ui.run(()=>ui.hosts.get('note-content').onChangeText('Una frase sin destino'));
  for(let i=0;i<20;i++)await open(ui);assert.deepEqual(flat(ui.hosts.get('unified-note-scroll').style),initial);assert.equal(disk.writes,0);assert.equal(ui.calls.some(c=>c[0]==='microphone'),false);
  await ui.render({handedness:'left'});assert.equal(flat(ui.hosts.get('note-editor-footer').style).flexDirection,'row-reverse');await ui.run(()=>ui.hosts.get('unified-note-save').onPress());assert.equal(disk.writes,0);assert.match(ui.container.textContent,/Selecciona CALENDARIO/);assert.equal(ui.hosts.get('note-content').value,'Una frase sin destino');
 }finally{await ui.close();disk.close();}
});
