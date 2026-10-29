import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs'),flat=value=>Object.assign({},...(Array.isArray(value)?value.flat(Infinity):[value]).filter(Boolean));
const find=(node,id)=>node.attributes?.['data-testid']===id?node:(node.childNodes||[]).map(child=>find(child,id)).find(Boolean);
const press=ui=>ui.run(()=>{const button=ui.hosts.get('note-tools-toggle');button.onPressIn();button.onPress();});
const layout=(ui,width,height)=>ui.run(()=>ui.hosts.get('note-writing-workspace').onLayout({nativeEvent:{layout:{x:12,y:99,width,height}}}));
async function drag(ui,dy,dx=0){const start=ui.fab.style();await ui.run(()=>{const button=ui.hosts.get('note-tools-toggle');button.onPressIn();button.onLongPress();const gesture=ui.fab.gesture;assert.equal(gesture._activateAfterLongPress,500);gesture._onStart({translationX:0,translationY:0});gesture._onUpdate({translationX:dx,translationY:dy});gesture._onEnd();gesture._onFinalize();});return start;}

test('definitive footer order, edge-aligned tray and floating ownership are independent of the sheet close recognizer',async()=>{
 for(const handedness of ['left','right']){const ui=await h.editorFixture({handedness});try{
  const children=ui.hosts.get('note-editor-footer').children;assert.equal(children[0].props.testID,'unified-note-save');assert.equal(children[1].props.testID,'note-microphone');assert.equal(children[2].props.accessibilityLabel,'Cerrar nota');assert.equal(flat(ui.hosts.get('note-editor-footer').style).flexDirection,handedness==='right'?'row':'row-reverse');
  assert.equal(flat(ui.hosts.get('note-tools-panel').style)[handedness==='right'?'right':'left'],0);assert.equal(flat(ui.hosts.get('unified-note-scroll').style).marginLeft,undefined);assert.equal(flat(ui.hosts.get('unified-note-scroll').style).marginRight,undefined);
  const floating=find(ui.container,'note-tools-floating-layer'),sheet=find(ui.container,'unified-note-screen');assert.ok(floating);for(let parent=floating.parentNode;parent;parent=parent.parentNode)assert.notEqual(parent,sheet);assert.equal(ui.hosts.get('note-tools-floating-layer').pointerEvents,'box-none');
  const tray=find(ui.container,'note-tools-panel');for(let parent=tray.parentNode;parent;parent=parent.parentNode)assert.notEqual(parent,sheet,'tray scroll must not reach the note close recognizer');
  await press(ui);const width=flat(ui.hosts.get('note-tools-panel').style).width,style=ui.fab.style();assert.equal(style.left,handedness==='right'?322:0);assert.ok(style.top>600*.62);
 }finally{await ui.close();}}
});

test('actual shared 500ms recognizer moves only vertically; releasing a drag cannot toggle or close the note',async()=>{
 const ui=await h.editorFixture();try{
  assert.equal(ui.hosts.get('note-tools-toggle').delayLongPress,500);const before=await drag(ui,-160,500);assert.equal(ui.fab.style().left,before.left);assert.equal(ui.fab.style().top,before.top-160);assert.equal(ui.fab.style().transform[0].scale,1);
  await ui.run(()=>ui.hosts.get('note-tools-toggle').onPress());assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,false);assert.equal(ui.calls.some(c=>c[0]==='close'),false);
  await press(ui);assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,true);assert.equal(ui.fab.style().top,before.top-160);await drag(ui,80,-500);
  await ui.run(()=>ui.hosts.get('note-tools-toggle').onPress());assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,true);await press(ui);assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,false);
 }finally{await ui.close();}
});

test('chosen position uses the existing fab_pos key, survives real disk reload and remains independent of note persistence',async()=>{
 const disk=await h.diskFixture(),ports={fabStorage:disk.storage};let ui=await h.editorFixture({ports});try{
  await ui.run(()=>ui.hosts.get('note-content').onChangeText('Borrador que se conserva'));await drag(ui,-135);const chosen=ui.fab.style().top;
  const record=JSON.parse(await disk.storage.getItem('fab_pos:note-editor:tools-toggle'));assert.equal(record.t,chosen);assert.equal(disk.writes,0);await ui.run(()=>ui.hosts.get('Cerrar nota').onPress());const cached=ui.calls.find(c=>c[0]==='close')[1].draft;await ui.close();
  ui=await h.editorFixture({ports,cached});await ui.idle();assert.equal(ui.fab.style().top,chosen);assert.equal(ui.hosts.get('note-content').value,'Borrador que se conserva');await press(ui);await press(ui);assert.equal(ui.fab.style().top,chosen);assert.equal(disk.rows.length,0);
 }finally{await ui.close();disk.close();}
});

test('keyboard, orientation and handedness clamp the displayed preference without overwriting its original vertical position',async()=>{
 const disk=await h.diskFixture(),ui=await h.editorFixture({ports:{fabStorage:disk.storage}});try{
  await drag(ui,-130);const chosen=ui.fab.style().top;await layout(ui,296,96);const small=ui.fab.style();assert.ok(small.top>=8&&small.top+48<=88);assert.equal(small.left,252);
  await ui.render({handedness:'left'});assert.equal(ui.fab.style().left,0);await press(ui);assert.equal(ui.fab.style().left,0);
  await layout(ui,406,640);assert.equal(ui.fab.style().top,chosen);assert.equal(JSON.parse(await disk.storage.getItem('fab_pos:note-editor:tools-toggle')).t,chosen);assert.ok(ui.fab.style().left+44<=406);
 }finally{await ui.close();disk.close();}
});

test('cancelled drag and late preference loading cannot trigger a toggle, overwrite a later drag or leave the note blocked',async()=>{
 let release;const storage={getItem:()=>new Promise(resolve=>release=resolve),setItem:async()=>{}},ui=await h.editorFixture({ports:{fabStorage:storage}});try{
  await drag(ui,-90);const chosen=ui.fab.style().top;release(JSON.stringify({l:0,t:500}));await ui.idle();assert.equal(ui.fab.style().top,chosen);
  await ui.run(()=>{ui.hosts.get('note-tools-toggle').onPressIn();ui.hosts.get('note-tools-toggle').onLongPress();ui.fab.gesture._onStart({translationX:0,translationY:0});ui.fab.gesture._onFinalize();ui.hosts.get('note-tools-toggle').onPress();});assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,false);
  await press(ui);assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,true);await ui.run(()=>ui.hosts.get('note-content').onChangeText('Se puede seguir editando'));assert.equal(ui.hosts.get('note-content').value,'Se puede seguir editando');assert.equal(ui.calls.some(c=>c[0]==='close'),false);
 }finally{await ui.close();}
});

test('repeated drag/fold cycles preserve writing, explicit destinations, GO and acknowledged save',async()=>{
 const disk=await h.diskFixture(),ui=await h.editorFixture({scope:disk.scope,ports:{fabStorage:disk.storage},onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{
  const text=('Texto largo editable después del dictado.\n').repeat(70);await ui.run(()=>ui.hosts.get('note-content').onChangeText(text));const input=ui.instances.get('note-content');
  for(let i=0;i<10;i++){await drag(ui,i%2?2000:-2000);await ui.run(()=>ui.hosts.get('note-tools-toggle').onPress());await press(ui);}assert.equal(ui.instances.get('note-content'),input);assert.equal(ui.hosts.get('note-content').value,text);assert.equal(disk.writes,0);
  await ui.run(()=>ui.hosts.get('unified-note-save').onPress());assert.match(ui.container.textContent,/Selecciona CALENDARIO/);await ui.run(()=>ui.hosts.get('note-microphone').onPress());assert.ok(ui.calls.some(c=>c[0]==='microphone'));
  await press(ui);await ui.destination('pending');await ui.run(()=>ui.hosts.get('unified-note-save').onPress());await ui.idle();const [loaded]=await disk.reopen();assert.equal(loaded.note.content,text);assert.equal(loaded.note.destination,'pending');assert.match(ui.container.textContent,/guardada/i);assert.equal(disk.rows.length,1);
 }finally{await ui.close();disk.close();}
});
