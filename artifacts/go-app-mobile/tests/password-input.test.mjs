import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import lifecycle from './helpers/react-lifecycle.cjs';
const {React,createRoot,document,ts}=lifecycle;
const source=fs.readFileSync('components/auth/PasswordInput.tsx','utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const settle=fn=>React.act(async()=>{if(fn)await fn();await Promise.resolve();});
function hub(){const handlers=new Map();return{visibilityState:'visible',
 addEventListener(type,fn,capture){const rows=handlers.get(type)||[];rows.push({fn,capture});handlers.set(type,rows);},
 removeEventListener(type,fn,capture){handlers.set(type,(handlers.get(type)||[]).filter(row=>row.fn!==fn||row.capture!==capture));},
 emit(type,event={}){for(const row of handlers.get(type)||[])row.fn(event);},
 listeners(type){return handlers.get(type)||[];},
 get count(){return [...handlers.values()].reduce((n,rows)=>n+rows.length,0);}};}
function descendants(node){return[node,...node.childNodes.flatMap(descendants)];}
async function fixture({platform='web',value='Prueba-123',confirm=false,metadata={}}={}){
 const keyboard=hub(),browser=hub(),inputs=new Map(),buttons=new Map(),changes=[],callbacks=[];
 const outerRef=React.createRef();let live,setValue,fieldKey='login';
 const host=(name)=>({children,...props})=>{if(name==='button')buttons.set(props.testID,props);
  return React.createElement(name,{'data-testid':props.testID,'aria-label':props.accessibilityLabel},children);};
 const TextInput=React.forwardRef((props,ref)=>{inputs.set(props.testID,props);React.useImperativeHandle(ref,()=>({focus(){callbacks.push('imperative-focus');props.onFocus?.({nativeEvent:{}});}}));
  return React.createElement('input',{'data-testid':props.testID,value:props.value,type:props.secureTextEntry?'password':'text',readOnly:true});});
 const native={Platform:{OS:platform},View:host('div'),Text:host('span'),TextInput,Pressable:host('button'),StyleSheet:{create:x=>x}};
 const context={exports:{},document:keyboard,window:browser,require(name){if(name==='react')return React;if(name==='react-native')return native;if(name==='@expo/vector-icons')return{Feather:()=>null};throw Error(name);}};
 vm.runInNewContext(code,context);const PasswordInput=context.exports.PasswordInput;
 function Harness(){const [text,update]=React.useState(value);live=text;setValue=update;
  const props={testID:'primary',ref:outerRef,value:text,onChangeText:next=>{changes.push(next);update(next);},
   autoCapitalize:'none',autoCorrect:false,textContentType:'password',returnKeyType:'go',
   onFocus:()=>callbacks.push('focus'),onBlur:()=>callbacks.push('blur'),onKeyPress:()=>callbacks.push('key'),onSubmitEditing:()=>callbacks.push('submit'),...metadata};
  return React.createElement(React.Fragment,null,
   React.createElement(PasswordInput,{...props,key:fieldKey}),
   confirm&&React.createElement(PasswordInput,{testID:'confirm',placeholder:'Confirmar contraseña',textContentType:'newPassword',value:text,onChangeText:update}));
 }
 const container=document.createElement('div'),root=createRoot(container);await settle(()=>root.render(React.createElement(Harness)));
 const caps=id=>descendants(container).find(node=>node.attributes['data-testid']===`${id}-caps-lock`);
 return{inputs,buttons,keyboard,browser,changes,callbacks,outerRef,caps,get value(){return live;},
  press:async id=>settle(()=>buttons.get(`${id}-visibility-toggle`).onPress()),
  focus:async id=>settle(()=>inputs.get(id).onFocus({nativeEvent:{}})),
  blur:async id=>settle(()=>inputs.get(id).onBlur({nativeEvent:{}})),
  emit:async(type,event)=>settle(()=>keyboard.emit(type,event)),
  page:async type=>settle(()=>browser.emit(type)),
  edit:async text=>settle(()=>inputs.get('primary').onChangeText(text)),
  rerender:async()=>settle(()=>root.render(React.createElement(Harness))),
  newForm:async()=>{fieldKey='registration';await settle(()=>root.render(React.createElement(Harness)));},
  close:async()=>settle(()=>root.unmount())};
}
const key=(locked,extra={})=>({key:locked?'CapsLock':'a',getModifierState:name=>{assert.equal(name,'CapsLock');return locked;},...extra});

for(const platform of ['web','ios','android'])for(const value of ['','Prueba-123'])test(`${platform}, ${value?'filled':'empty'}: eye toggles permanently without changing the controlled password`,async()=>{
 const f=await fixture({platform,value});try{
  assert.equal(f.inputs.get('primary').secureTextEntry,true);assert.equal(f.buttons.get('primary-visibility-toggle').accessibilityLabel,'Mostrar contraseña');
  await f.press('primary');assert.equal(f.inputs.get('primary').secureTextEntry,false);assert.equal(f.value,value);
  await f.rerender();await f.blur('primary');assert.equal(f.inputs.get('primary').secureTextEntry,false,'visibility survives release, rerender and blur');
  assert.deepEqual(f.changes,[],'the eye never writes a password');
  await f.edit('Otra-prueba-456');assert.equal(f.value,'Otra-prueba-456');assert.equal(f.inputs.get('primary').secureTextEntry,false);
  await f.press('primary');assert.equal(f.inputs.get('primary').secureTextEntry,true);assert.equal(f.value,'Otra-prueba-456');
  assert.equal(f.buttons.get('primary-visibility-toggle').style.minWidth,44);assert.equal(f.buttons.get('primary-visibility-toggle').style.minHeight,44);
 }finally{await f.close();}
});
test('confirmation and password share the component with independent visibility; a new form starts hidden',async()=>{
 const f=await fixture({confirm:true});try{
  assert.equal(f.inputs.get('confirm').secureTextEntry,true);await f.press('primary');assert.equal(f.inputs.get('confirm').secureTextEntry,true);
  await f.press('confirm');assert.equal(f.inputs.get('confirm').secureTextEntry,false);await f.press('primary');assert.equal(f.inputs.get('confirm').secureTextEntry,false);
  await f.press('primary');await f.newForm();assert.equal(f.inputs.get('primary').secureTextEntry,true);assert.equal(f.value,'Prueba-123');
 }finally{await f.close();}
});
test('autofill metadata, focus ref, key callbacks and submit are retained while the eye is visible',async()=>{
 for(const metadata of [{textContentType:'password',autoComplete:undefined},{textContentType:'newPassword',autoComplete:undefined},{textContentType:undefined,autoComplete:'current-password'}]){
  const f=await fixture({metadata});try{
   const expected=f.outerRef;await f.press('primary');for(const [name,value]of Object.entries(metadata))assert.equal(f.inputs.get('primary')[name],value);
   assert.equal(f.inputs.get('primary').autoCapitalize,'none');assert.equal(f.inputs.get('primary').autoCorrect,false);
   await settle(()=>expected.current.focus());assert.deepEqual(f.callbacks,['imperative-focus','focus']);
   f.inputs.get('primary').onKeyPress({});f.inputs.get('primary').onSubmitEditing();assert.deepEqual(f.callbacks.slice(-2),['key','submit']);
   assert.equal(f.changes.length,0);
  }finally{await f.close();}
 }
});
test('web uses captured keydown and keyup CapsLock state, never an uppercase letter or Shift',async()=>{
 const f=await fixture();try{
  assert.equal(f.keyboard.count,0);assert.equal(f.caps('primary'),undefined);await f.focus('primary');
  assert.ok(f.keyboard.listeners('keydown').every(row=>row.capture===true));assert.ok(f.keyboard.listeners('keyup').every(row=>row.capture===true));
  await f.emit('keydown',key(false,{key:'A',shiftKey:true}));assert.equal(f.caps('primary'),undefined);
  await f.emit('keyup',key(true));assert.ok(f.caps('primary'));assert.equal(f.caps('primary').attributes['aria-label'],'Bloq Mayús activado');
  await f.emit('keydown',key(true,{key:'a',shiftKey:true}));assert.ok(f.caps('primary'),'Shift with Caps Lock remains Caps Lock');
  await f.emit('keyup',key(false));assert.equal(f.caps('primary'),undefined);
 }finally{await f.close();}assert.equal(f.keyboard.count,0);assert.equal(f.browser.count,0);
});
test('unsupported, composing and failing keyboard APIs never invent Caps Lock state',async()=>{
 const f=await fixture();try{await f.focus('primary');
  for(const event of [{key:'A',shiftKey:false},{key:'CapsLock'},key(true,{isComposing:true}),{getModifierState(){throw Error('unsupported')}},{getModifierState:()=>undefined}]){
   await f.emit('keydown',key(true));assert.ok(f.caps('primary'));await f.emit('keyup',event);assert.equal(f.caps('primary'),undefined);
  }
 }finally{await f.close();}
});
for(const platform of ['ios','android'])test(`${platform}: no unreliable Caps Lock listener or red warning`,async()=>{
 const f=await fixture({platform});try{await f.focus('primary');assert.equal(f.keyboard.count,0);assert.equal(f.browser.count,0);
  await f.emit('keydown',key(true));assert.equal(f.caps('primary'),undefined);
 }finally{await f.close();}
});
test('blur, background and unmount clear stale warnings and remove listeners without changing visibility',async()=>{
 const f=await fixture();try{
  await f.focus('primary');await f.emit('keydown',key(true));await f.press('primary');assert.ok(f.caps('primary'));
  await f.page('blur');assert.equal(f.caps('primary'),undefined);assert.equal(f.inputs.get('primary').secureTextEntry,false);
  await f.emit('keyup',key(true));f.keyboard.visibilityState='hidden';await f.emit('visibilitychange',{});assert.equal(f.caps('primary'),undefined);
  await f.blur('primary');await f.emit('keydown',key(true));assert.equal(f.caps('primary'),undefined);assert.equal(f.keyboard.count,0);
  assert.equal(f.inputs.get('primary').secureTextEntry,false);
 }finally{await f.close();}assert.equal(f.keyboard.count,0);assert.equal(f.browser.count,0);
});
