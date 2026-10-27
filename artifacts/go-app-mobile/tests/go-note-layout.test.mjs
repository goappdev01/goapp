import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fixture,source,ast,note,sheet,load,React,createRoot,document,settle}=require('./helpers/note-layout-fixture.cjs');
test('NOTA requests focus once from native onShow, after presentation; text survives keyboard, bell and closing',async()=>{
 const f=await fixture();try{
  assert.equal(f.calls.includes('focus'),false);await f.open();assert.equal(f.calls.includes('focus'),false);assert.equal(f.hosts.get('title').autoFocus,undefined);
  await f.show();assert.equal(f.calls.filter(x=>x==='focus').length,1);assert.ok(f.hosts.get('NativeKeyboardFrame'));assert.equal(f.hosts.get('NativeKeyboardFrame').behavior,'height');
  await f.run(()=>f.hosts.get('title').onChangeText('Mi título'));await f.run(()=>f.hosts.get('detail').onChangeText('Una línea\nSegunda línea\nTercera línea'));
  for(const event of ['keyboardWillShow','keyboardDidShow','keyboardWillHide','keyboardDidHide','keyboardWillShow']){await f.emit(event);assert.equal(f.state.quickNoteText,'Mi título');assert.match(f.state.quickNoteDetail,/Tercera/);}
  await f.run(()=>f.hosts.get('Micrófono').onPress());assert.ok(f.calls.includes('mic'));
  await f.run(()=>f.hosts.get('Campana').onPress());assert.equal(f.state.noteReminderPickerOpen,true);assert.ok(f.hosts.get('ReminderPicker'));
  await f.run(()=>f.hosts.get('Cerrar nota').onPress({stopPropagation(){}}));assert.equal(f.state.notesOpen,false);assert.ok(f.calls.includes('abort'));assert.ok(f.calls.includes('dismiss'));assert.equal(f.state.quickNoteText,'Mi título');assert.match(f.state.quickNoteDetail,/Tercera/);
  await f.open();await f.show();assert.equal(f.calls.filter(x=>x==='focus').length,2);assert.equal(f.state.quickNoteText,'Mi título');
 }finally{await f.close()}
});
for(const [label,kind] of [['INTERNA','NOTA_INTERNA'],['EXTERNA','NOTA_EXTERNA']])test(label+' retains its original action, including title/detail and existing clear-after-create behavior',async()=>{
 const f=await fixture();try{await f.open();const footer=f.hosts.get('note-task-controls');const children=footer.children;
  // Original actions are fragments; descend their actual JSX without reconstructing callbacks.
  const flat=v=>Array.isArray(v)?v.flatMap(flat):React.isValidElement(v)?[v,...flat(v.props.children)]:[],text=v=>Array.isArray(v)?v.map(text).join(''):React.isValidElement(v)?text(v.props.children):v==null?'':String(v);
  const b=flat(children).find(n=>n.props.onPress&&text(n)===label);assert.ok(b);await f.run(()=>b.props.onPress());assert.ok(f.calls.some(c=>Array.isArray(c)&&c[0]===kind&&c[1]==='Título'&&c[2]==='Texto previo'));assert.equal(f.state.quickNoteText,'');assert.equal(f.state.quickNoteDetail,'');
 }finally{await f.close()}
});
test('one shared square floating close; controls have full touch surfaces and mirrored safe gutters',async()=>{
 for(const hand of ['left','right'])for(const width of [320,375,390,430,844]){const f=await fixture({hand,width});try{await f.open();const close=f.hosts.get('Cerrar nota');assert.equal(close.style.width,44);assert.equal(close.style.height,44);assert.equal(close.style.borderRadius,16);assert.equal(close.accessibilityRole,'button');const floating=f.hosts.get('note-floating-close');assert.equal(floating.style[hand==='left'?'left':'right'],0);assert.equal(floating.style.bottom,0);for(const label of ['Micrófono','Campana']){assert.equal(f.hosts.get(label).style.width,44);assert.equal(f.hosts.get(label).style.height,44);assert.equal(f.hosts.get(label).hitSlop,2);}}finally{await f.close()}}
});
test('the actual SDK 58 keyboard frame follows native progress and initializes an already open keyboard',async()=>{
 const sdk=path.join(process.cwd(),'node_modules/react-native-keyboard-controller/src/components/KeyboardAvoidingView');
 for(const initial of [0,320]){
  const handlers=[],props=[],context={reanimated:{height:{value:-initial},progress:{value:initial?1:0}}},shared=v=>React.useRef({value:v}).current;
  const imports={'react-native':{View:()=>null,Platform:{OS:'ios'}},'react-native-reanimated':{default:{View:p=>{props.push(p);return null}},useSharedValue:shared,runOnUI:fn=>fn,interpolate:(v,[a,b],[c,d])=>c+(v-a)/(b-a)*(d-c)},'../../context':{useKeyboardContext:()=>context},'../../hooks':{useKeyboardHandler:h=>handlers.push(h),useWindowDimensions:()=>({width:390,height:844})},'../../bindings':{KeyboardControllerNative:{}},'../../utils/findNodeHandle':{findNodeHandle:()=>null},'../hooks/useCombinedRef':{default:()=>null},'../../reanimated':{useDerivedValue:fn=>({get value(){return fn()}}),useAnimatedStyle:fn=>({get current(){return fn()}})}};
  imports['react-native-reanimated'].__esModule=true;imports['../hooks/useCombinedRef'].__esModule=true;
  imports['./hooks']=load(fs.readFileSync(path.join(sdk,'hooks.ts'),'utf8'),imports);
  const Frame=load(fs.readFileSync(path.join(sdk,'index.tsx'),'utf8'),imports).default;
  const root=createRoot(document.createElement('div'));try{await settle(()=>root.render(React.createElement(Frame,{behavior:'height',style:{flex:1}})));const p=props.at(-1);p.onLayout({nativeEvent:{layout:{x:0,y:0,width:390,height:844}}});assert.deepEqual({...p.style[1].current},initial?{height:524,flex:0}:{});
   for(const progress of [.25,.5,1]){for(const h of handlers)h.onStart?.({height:320,progress});for(const h of handlers)h.onMove?.({height:320*progress,progress});assert.equal(p.style[1].current.height,844-320*progress);}
   for(const h of handlers)h.onEnd?.({height:0,progress:0});assert.deepEqual({...p.style[1].current},{});
  }finally{await settle(()=>root.unmount())}
 }
});
test('only NOTA opts into the new native frame; existing gestures and all non-note sheet defaults remain',()=>{
 assert.equal(source.match(/        noteKeyboardScroll\n/g).length,1);assert.ok(note.getText(ast).includes('footer={<GoNoteControls'));assert.ok(note.getText(ast).includes('onShow={() => quickNoteTitleRef.current?.focus()}'));assert.ok(!note.getText(ast).includes('autoFocus'));
 const body=sheet.getText(ast);assert.ok(body.includes('? KeyboardControllerAvoidingView : KeyboardAvoidingView'));assert.ok(body.includes('noteKeyboardScroll ? "height" : Platform.OS === "ios" ? "padding" : "height"'));assert.ok(body.includes('justifyContent: noteKeyboardScroll ? "flex-start" : "flex-end"'),'the shrinking native frame stays anchored to the top');assert.ok(body.includes('noteKeyboardScroll && kbVisible'));assert.ok(body.includes('Gesture.Race(rightZoneGesture, dragGesture)'));assert.ok(body.includes('noteFooterHeight + effectivePaddingBottom + 26'));assert.ok(!body.includes('setNoteKeyboardTop'));
});
