import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{load}=require('./helpers/listados-fixture.cjs');
const {React,createRoot,document}=require('./helpers/react-lifecycle.cjs');
test('swipe discovery is passive, finite, scoped and stops on use or reduced motion',async()=>{
 const storage=new Map(),animations=[],listeners=new Set();let reduced=false;
 const native=name=>({children,...props})=>React.createElement('div',{'data-testid':props.testID,'data-events':props.pointerEvents},children);
 const Animated={Value:class{constructor(value){this.value=value;}setValue(v){this.value=v;}},View:native('Animated'),delay:ms=>({delay:ms}),timing:(_value,options)=>options,sequence:steps=>steps,loop:(steps,options)=>{const a={steps,options,started:false,stopped:false,start(){this.started=true;},stop(){this.stopped=true;}};animations.push(a);return a;}};
 const AccessibilityInfo={isReduceMotionEnabled:async()=>reduced,addEventListener:(_name,fn)=>{listeners.add(fn);return{remove:()=>listeners.delete(fn)};}};
 const {ListadosSwipeHint}=load('components/ListadosSwipeHint.tsx',{'react':React,'react-native':{Animated,AccessibilityInfo,Text:native('Text'),View:native('View')},'@expo/vector-icons':{MaterialCommunityIcons:native('Icon')},'@react-native-async-storage/async-storage':{getItem:async key=>storage.get(key)||null,setItem:async(key,value)=>storage.set(key,value)}});
 const container=document.createElement('div');let root=createRoot(container),props={scopeKey:'user-a:company-a',used:false,visible:true};
 const render=()=>React.act(async()=>{root.render(React.createElement(ListadosSwipeHint,props));await Promise.resolve();});
 try{
  await render();assert.equal(animations.length,1);assert.equal(animations[0].options.iterations,3);assert.ok(animations[0].started);
  assert.equal(container.firstChild.attributes['data-events'],'none');assert.equal(container.textContent,'Desliza a los lados para cambiar el estado');
  assert.ok(animations[0].steps.some(s=>s.toValue>0));assert.ok(animations[0].steps.some(s=>s.toValue<0));
  await React.act(()=>{for(const listener of listeners)listener(true);});assert.ok(animations[0].stopped);
  assert.ok(container.firstChild,'a static accessible hint remains with reduced motion');
  props={...props,used:true};await render();assert.equal(container.firstChild,null);assert.equal(storage.get('listados_swipe_known:'+props.scopeKey),'1');
  await React.act(()=>root.unmount());root=createRoot(container);props={...props,used:false};await render();assert.equal(container.firstChild,null,'learned preference survives remount');
  props={...props,scopeKey:'user-b:company-b'};await render();assert.ok(container.firstChild,'other accounts retain independent discovery');
  props={...props,visible:false};await render();assert.equal(container.firstChild,null);
 }finally{await React.act(()=>root.unmount());assert.equal(listeners.size,0);}
});
