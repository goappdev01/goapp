import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
const bottom=ui=>ui.hosts.get('note-editor-footer').children[2].props;
const pressBack=ui=>ui.run(()=>bottom(ui).onPress());
const flat=value=>Object.assign({},...(Array.isArray(value)?value.flat(Infinity):[value]).filter(Boolean));
const write=async ui=>{
 await ui.run(()=>ui.hosts.get('note-title').onChangeText('Hacer la compra'));
 await ui.run(()=>ui.hosts.get('note-content').onChangeText('1-pan, 2-tomates, 3-huevos'));
 await ui.run(()=>{ui.hosts.get('note-content').onFocus({target:42});ui.keyboard.show();});
};

test('PRIORITY: one bottom-arrow press hides the real focused input keyboard, preserves NOTA and its exact shopping draft in both hands',async()=>{
 for(const handedness of ['right','left']){const ui=await h.editorFixture({handedness});try{
  await write(ui);const token=ui.instances.get('note-content');assert.equal(ui.keyboard.visible,true);assert.equal(bottom(ui).accessibilityLabel,'Ocultar teclado');
  await pressBack(ui);assert.equal(ui.keyboard.visible,false);assert.equal(ui.keyboard.focused,null);assert.equal(ui.calls.filter(c=>c[0]==='blur'&&c[1]==='note-content').length,1);
  assert.equal(ui.calls.some(c=>c[0]==='close'),false);assert.equal(ui.hosts.get('note-title').value,'Hacer la compra');assert.equal(ui.hosts.get('note-content').value,'1-pan, 2-tomates, 3-huevos');assert.equal(ui.instances.get('note-content'),token);
  assert.equal(ui.hosts.has('note-hide-keyboard'),false);assert.equal(bottom(ui).accessibilityLabel,'Cerrar nota');
  await ui.tap('note-tools-toggle');assert.ok(ui.hosts.has('note-option-date'));assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,true);
 }finally{await ui.close();}}
});

test('a separate bottom-arrow press with the keyboard hidden closes normally and reopens the complete retained draft',async()=>{
 const ui=await h.editorFixture();try{
  await write(ui);await pressBack(ui);await pressBack(ui);const closes=ui.calls.filter(c=>c[0]==='close');assert.equal(closes.length,1);assert.equal(closes[0][1].saved,false);
  const again=await h.editorFixture({cached:closes[0][1].draft});try{assert.equal(again.hosts.get('note-title').value,'Hacer la compra');assert.equal(again.hosts.get('note-content').value,'1-pan, 2-tomates, 3-huevos');}finally{await again.close();}
 }finally{await ui.close();}
});

test('repeated arrow presses during a native hide animation join the same dismissal and never close NOTA',async()=>{
 let release;const ui=await h.editorFixture({ports:{dismiss:()=>new Promise(resolve=>release=resolve)}});try{
  await write(ui);await pressBack(ui);await pressBack(ui);await pressBack(ui);assert.equal(ui.keyboard.visible,true);assert.equal(ui.calls.filter(c=>c[0]==='blur').length,1);assert.equal(ui.calls.some(c=>c[0]==='close'),false);
  await ui.run(()=>release());assert.equal(ui.keyboard.visible,false);assert.equal(ui.calls.some(c=>c[0]==='close'),false);await pressBack(ui);assert.equal(ui.calls.filter(c=>c[0]==='close').length,1);
 }finally{await ui.close();}
});

test('tool opening uses RN focus and hide events even if the separate controller cache/promise never acknowledges the keyboard',async()=>{
 const ui=await h.editorFixture();try{
  ui.controller.isVisible=()=>false;ui.controller.dismiss=()=>new Promise(()=>{});
  await ui.tap('note-tools-toggle');await write(ui);await ui.tap('note-option-date');assert.equal(ui.keyboard.visible,false);assert.ok(ui.hosts.has('note-inline-date-picker'));
  assert.equal(ui.calls.some(c=>c[0]==='keyboard-dismiss'),false);assert.equal(ui.hosts.get('note-content').value,'1-pan, 2-tomates, 3-huevos');
 }finally{await ui.close();}
});

test('calendar cannot mount after keyboardDidHide until the actual footer and workspace have returned to full-screen geometry',async()=>{
 let release;const ui=await h.editorFixture({ports:{manualGeometry:true,dismiss:()=>new Promise(resolve=>release=resolve)}});try{
  await ui.tap('note-tools-toggle');await write(ui);
  await ui.run(()=>ui.hosts.get('note-editor-footer').onLayout({nativeEvent:{layout:{y:438,height:106}}}));
  await ui.run(()=>ui.hosts.get('note-writing-workspace').onLayout({nativeEvent:{layout:{x:12,y:99,width:366,height:300}}}));
  await ui.tap('note-option-date');assert.equal(ui.hosts.has('note-inline-date-picker'),false);
  await ui.run(()=>release());assert.equal(ui.keyboard.visible,false);assert.equal(ui.hosts.has('note-inline-date-picker'),false,'a native hide event alone cannot accept a compressed frame');
  await ui.run(()=>ui.hosts.get('note-writing-workspace').onLayout({nativeEvent:{layout:{x:12,y:99,width:366,height:600}}}));assert.equal(ui.hosts.has('note-inline-date-picker'),false);
  await ui.run(()=>ui.hosts.get('note-editor-footer').onLayout({nativeEvent:{layout:{y:738,height:106}}}));assert.ok(ui.hosts.has('note-inline-date-picker'));
  await ui.tap('note-date-2027-01-15');assert.equal(ui.hosts.has('note-inline-date-picker'),false);assert.match(ui.hosts.get('note-summary').children,/15\/01\/2027/);
 }finally{await ui.close();}
});

test('a lost native hide event has a bounded recoverable failure, without forced geometry, lost data or an unintended note close',async()=>{
 const timers=new Map();let serial=0;const ui=await h.editorFixture({ports:{missingHideEvent:true,timers:{setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)}}});try{
  await write(ui);await pressBack(ui);assert.equal(ui.calls.some(c=>c[0]==='close'),false);const timer=[...timers.values()].find(t=>t.ms===1200);assert.ok(timer);await ui.run(()=>timer.fn());
  assert.match(ui.container.textContent,/No se ha confirmado el cierre del teclado/);assert.equal(ui.hosts.get('note-content').value,'1-pan, 2-tomates, 3-huevos');assert.equal(ui.calls.some(c=>c[0]==='close'),false);
  await ui.run(()=>ui.keyboard.hide());await pressBack(ui);assert.equal(ui.calls.filter(c=>c[0]==='close').length,1);
 }finally{await ui.close();}
});

test('iOS didChangeFrame with the keyboard outside the screen can complete a hide even if keyboardDidHide is omitted',async()=>{
 const ui=await h.editorFixture({ports:{missingHideEvent:true}});try{
  await write(ui);await pressBack(ui);await ui.run(()=>{ui.keyboard.visible=false;ui.keyboard.emit('keyboardDidChangeFrame',{endCoordinates:{height:0,screenY:844}});});
  assert.equal(bottom(ui).accessibilityLabel,'Cerrar nota');assert.equal(ui.calls.some(c=>c[0]==='close'),false);await pressBack(ui);assert.equal(ui.calls.filter(c=>c[0]==='close').length,1);
 }finally{await ui.close();}
});

test('the main menu exposes the existing ten controls together in two adaptive columns, with a visibly unavailable security option',async()=>{
 for(const handedness of ['left','right']){const ui=await h.editorFixture({handedness});try{
  await ui.tap('note-tools-toggle');for(const key of ['date','time','duration','reminder','place','attachments']){assert.ok(ui.hosts.has('note-option-'+key));assert.equal(flat(ui.hosts.get('note-option-'+key).style).width,'47%');}
  for(const value of ['calendar','pending','archive'])assert.equal(ui.hosts.get('note-destination-'+value).accessibilityState.checked,false);
  assert.match(ui.hosts.get('note-security-info').accessibilityLabel,/no disponible/);assert.match(ui.container.textContent,/No disponible/);
  const panel=flat(ui.hosts.get('note-tools-panel').style);assert.equal(panel.height,undefined);assert.equal(panel.maxHeight,600);assert.equal(panel[handedness==='right'?'right':'left'],0);
 }finally{await ui.close();}}
});

test('writing uses one native padding frame and bounded real-content scroll, with an internally scrolling text input instead of keyboard ghost space',async()=>{
 const ui=await h.editorFixture();try{
  const text=('Línea editable larga\n').repeat(600),token=ui.instances.get('note-content');await ui.run(()=>ui.hosts.get('note-content').onChangeText(text));
  assert.equal(ui.hosts.get('KeyboardFrame').behavior,'padding');const scroll=ui.hosts.get('unified-note-scroll');assert.equal(scroll.bounces,false);assert.equal(scroll.alwaysBounceVertical,false);assert.equal(scroll.automaticallyAdjustKeyboardInsets,false);assert.equal(scroll.contentContainerStyle.flexGrow,undefined);assert.equal(scroll.removeClippedSubviews,false);
  for(const height of [600,240,180,600]){await ui.run(()=>scroll.onLayout({nativeEvent:{layout:{height}}}));assert.equal(flat(ui.hosts.get('note-content').style).height,Math.max(120,height-110));assert.equal(ui.hosts.get('note-content').scrollEnabled,true);assert.equal(ui.hosts.get('note-content').onContentSizeChange,undefined);}
  assert.equal(ui.instances.get('note-content'),token);assert.equal(ui.hosts.get('note-content').value,text);assert.equal(ui.hosts.get('note-content').selection,undefined);assert.equal(ui.calls.some(c=>c[0]==='scrollEnd'),false);
 }finally{await ui.close();}
});

test('entering with the software keyboard already visible still makes the first bottom-arrow action dismiss it only',async()=>{
 const ui=await h.editorFixture({ports:{keyboardVisible:true}});try{await pressBack(ui);assert.equal(ui.keyboard.visible,false);assert.equal(ui.calls.some(c=>c[0]==='close'),false);}finally{await ui.close();}
});

test('an input retaining focus after iOS hides the software keyboard does not turn the normal exit into a spurious extra keyboard-only step',async()=>{
 const ui=await h.editorFixture();try{
  await write(ui);await ui.run(()=>{ui.keyboard.visible=false;ui.keyboard.emit('keyboardDidHide');});assert.ok(ui.keyboard.input);await pressBack(ui);assert.equal(ui.calls.filter(c=>c[0]==='close').length,1);
 }finally{await ui.close();}
});

test('a missing recovered-layout event also has a bounded failure and a usable retry, never a permanently blank tool panel',async()=>{
 const timers=new Map();let serial=0;const ui=await h.editorFixture({ports:{manualGeometry:true,timers:{setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)}}});try{
  await ui.tap('note-tools-toggle');await write(ui);await ui.run(()=>ui.hosts.get('note-editor-footer').onLayout({nativeEvent:{layout:{y:438,height:106}}}));await ui.tap('note-option-date');
  assert.equal(ui.keyboard.visible,false);assert.equal(ui.hosts.has('note-inline-date-picker'),false);const timer=[...timers.values()].find(t=>t.ms===1200);assert.ok(timer);await ui.run(()=>timer.fn());
  assert.match(ui.container.textContent,/No se ha recuperado el espacio del teclado/);assert.ok(ui.hosts.has('note-option-date'));assert.equal(ui.hosts.get('note-content').value,'1-pan, 2-tomates, 3-huevos');
  await ui.run(()=>ui.hosts.get('note-editor-footer').onLayout({nativeEvent:{layout:{y:738,height:106}}}));await ui.tap('note-option-date');assert.ok(ui.hosts.has('note-inline-date-picker'));assert.equal(ui.calls.some(c=>c[0]==='close'),false);
 }finally{await ui.close();}
});
