import {test} from 'node:test';
import assert from 'node:assert/strict';
import lifecycle from './helpers/react-lifecycle.cjs';
const {React,createRoot,document,evaluate}=lifecycle;
const dom=n=>[n,...n.childNodes.flatMap(dom)];
const settle=async fn=>React.act(async()=>{fn?.();for(let i=0;i<16;i++)await Promise.resolve();});
async function fixture(strict=false){
 let api,props,nativeCount=0,nativeMounts=0;const dismiss=[],shows=[];
 const View=({children,...p})=>React.createElement('div',{'data-testid':p.testID,'data-top':String(p.accessibilityViewIsModal??false)},children);
 function NativeModal(p){props=p;React.useLayoutEffect(()=>{nativeCount++;nativeMounts++;return()=>nativeCount--;},[]);return React.createElement('div',{'data-native':'Modal'},p.children);}
 const screen=evaluate('components/ui/GoScreenModal.tsx',{'react-native':{View,Modal:NativeModal,StyleSheet:{absoluteFill:{position:'absolute',top:0,left:0,right:0,bottom:0}}}});
 function App(){const [state,setState]=React.useState({mounted:true,visible:true,detail:false,message:false,ai:false});api={set:patch=>setState(s=>({...s,...patch})),state};
  return React.createElement(React.Fragment,null,React.createElement('div',null,'LANDING'),state.mounted&&React.createElement(screen.GoScreenModal,{visible:state.visible,onRequestClose:()=>api.set({visible:false}),onDismiss:()=>api.set({mounted:false})},React.createElement('div',{'data-testid':'calendar'},'CALENDAR'),
   React.createElement(screen.GoScreenModal,{visible:state.detail,onShow:()=>shows.push('detail'),onRequestClose:()=>api.set({detail:false}),onDismiss:()=>dismiss.push('detail')},React.createElement('div',{'data-testid':'detail'},'DETAIL'),
    React.createElement(screen.GoScreenModal,{visible:state.message,onShow:()=>shows.push('message'),onRequestClose:()=>api.set({message:false}),onDismiss:()=>dismiss.push('message')},React.createElement('div',{'data-testid':'message'},'MESSAGE'),
     React.createElement(screen.GoScreenModal,{visible:state.ai,onShow:()=>shows.push('ai'),onRequestClose:()=>api.set({ai:false}),onDismiss:()=>dismiss.push('ai')},React.createElement('div',{'data-testid':'ai'},'AI'))))));
 }
 const container=document.createElement('div'),root=createRoot(container);await settle(()=>root.render(strict?React.createElement(React.StrictMode,null,React.createElement(App)):React.createElement(App)));
 return{container,dismiss,shows,get nativeCount(){return nativeCount;},get nativeMounts(){return nativeMounts;},get nativeProps(){return props;},get state(){return api.state;},async set(patch){await settle(()=>api.set(patch));},async back(){await settle(()=>props.onRequestClose({nativeEvent:{}}));},async acknowledge(){await settle(()=>props.onDismiss());},async dispose(){await settle(()=>root.unmount());},get layers(){return dom(container).filter(n=>n.attributes?.['data-testid']==='go-presented-layer');}};
}
for(const strict of [false,true])test((strict?'StrictMode':'normal')+': detail, Messages and AI share one native presenter and Back removes exactly one level',async()=>{
 const f=await fixture(strict);try{
  await f.set({detail:true});const detail=dom(f.container).find(n=>n.attributes?.['data-testid']==='detail');await f.set({message:true});const message=dom(f.container).find(n=>n.attributes?.['data-testid']==='message');await f.set({ai:true});
  assert.equal(f.nativeCount,1,'No nested native controller can remain stranded on iOS');assert.equal(f.layers.length,3);assert.deepEqual(f.dismiss,[],'Mounting/re-rendering must never close a screen');assert.deepEqual(f.shows,['detail','message','ai']);
  await f.back();assert.equal(f.layers.length,2);assert.equal(f.state.message,true);assert.equal(f.state.detail,true);assert.equal(dom(f.container).find(n=>n.attributes?.['data-testid']==='message'),message);assert.deepEqual(f.dismiss,['ai']);
  await f.back();assert.equal(f.layers.length,1);assert.equal(dom(f.container).find(n=>n.attributes?.['data-testid']==='detail'),detail);assert.deepEqual(f.dismiss,['ai','message']);
  await f.back();assert.equal(f.layers.length,0);assert.equal(f.state.visible,true);assert.equal(f.nativeCount,1);assert.deepEqual(f.dismiss,['ai','message','detail']);
 }finally{await f.dispose();}
});

test('direct Landing dismisses one native presenter, holds the original screens until native acknowledgement and cannot reopen intermediates',async()=>{
 const f=await fixture();try{await f.set({detail:true,message:true,ai:true});assert.equal(f.nativeCount,1);await f.set({visible:false});assert.equal(f.nativeProps.visible,false);assert.equal(f.layers.length,3);assert.deepEqual(f.dismiss,[]);await f.acknowledge();assert.equal(f.nativeCount,0);assert.equal(f.layers.length,0);assert.equal(f.container.textContent,'LANDING');assert.deepEqual(f.dismiss,[],'Native host exit must not simulate three independent Back presses');}finally{await f.dispose();}
});
