import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
const {React,createRoot,document,settle}=h;
const style=value=>Object.assign({},...(Array.isArray(value)?value.flat(Infinity):[value]).filter(Boolean));
const load=(source,imports={})=>{const vm=require('node:vm'),ctx={exports:{},require:name=>name==='react'?React:imports[name]};vm.runInNewContext(h.compile(source),ctx);return ctx.exports;};
test('full-screen note has a definite native keyboard viewport, immediate fields, native cursor and a separate accessible footer',async()=>{
 for(const handedness of ['left','right']){const ui=await h.editorFixture({handedness});try{
 const frame=ui.hosts.get('KeyboardFrame'),scroll=ui.hosts.get('unified-note-scroll'),footer=ui.hosts.get('note-editor-footer');
 assert.equal(frame.behavior,'padding');assert.equal(frame.style.flex,1);assert.equal(style(scroll.style).flex,1);assert.equal(scroll.keyboardShouldPersistTaps,'handled');
 assert.equal(footer.style[1].flexDirection,handedness==='left'?'row-reverse':'row');assert.ok(footer.style[1].paddingBottom>=34);
 assert.equal(ui.hosts.get('Cerrar nota').touchSize,56);assert.equal(ui.hosts.get('unified-note-save').style.minHeight,52);
 for(const id of ['note-title','note-content']){assert.ok(ui.hosts.get(id));assert.equal(ui.hosts.get(id).autoFocus,undefined);assert.equal(ui.hosts.get(id).selection,undefined);}
 await ui.run(()=>ui.hosts.get('note-content').onChangeText(('Texto largo\n').repeat(100)));
 assert.equal(style(ui.hosts.get('note-content').style).height,240);assert.equal(ui.hosts.get('note-content').scrollEnabled,true);
 assert.equal(ui.hosts.get('note-content').onContentSizeChange,undefined,'native content size cannot feed an artificial outer height or trailing keyboard spacer');assert.equal(scroll.automaticallyAdjustKeyboardInsets,false);assert.equal(scroll.bounces,false);
 }finally{await ui.close();}}
});
test('inline configuration and reopening keep the same unsaved note, title, content and independent optional values',async()=>{
 const ui=await h.editorFixture();try{
 await ui.run(()=>ui.hosts.get('note-title').onChangeText('Mi título'));await ui.run(()=>ui.hosts.get('note-content').onChangeText('Párrafos conservados'));
 await ui.pickTime('03','15');
 await ui.tool('date');await ui.run(()=>ui.hosts.get('note-date-2027-01-15').onPress());
 await ui.exit();const state=ui.calls.find(c=>c[0]==='close')[1];
 assert.equal(state.draft.time,'03:15');assert.equal(state.draft.dateISO,'2027-01-15');assert.equal(state.draft.title,'Mi título');assert.equal(state.draft.content,'Párrafos conservados');assert.equal(state.saved,false);
 const again=await h.editorFixture({cached:state.draft});try{assert.equal(again.hosts.get('note-content').value,'Párrafos conservados');assert.equal(again.hosts.get('note-title').value,'Mi título');}finally{await again.close();}
 }finally{await ui.close();}
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
