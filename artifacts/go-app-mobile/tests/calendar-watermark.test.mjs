import { test } from 'node:test';
import assert from 'node:assert/strict';
import lifecycle from './helpers/react-lifecycle.cjs';
const {React,createRoot,document,rn,evaluate}=lifecycle;
const flatten = value => Array.isArray(value) ? Object.assign({},...value.filter(Boolean)) : value;
const nodes = tree => [tree,...tree.childNodes.flatMap(nodes)];

async function fixture(platform='ios') {
  let owner=true,view='BUSINESS';
  const propsByNode=new Map();
  const host=name=>({children,...props})=>React.createElement('div',{
    'data-native':name,'data-testid':props.testID,
    ref:node=>{if(node)propsByNode.set(node,props);}
  },children);
  const surface=evaluate('components/debug/OwnerContextIndicator.tsx',{
    'react-native':{...rn,View:host('View'),Text:host('Text'),Modal:host('Modal'),Platform:{OS:platform}},
    'expo-linear-gradient':{LinearGradient:host('Gradient')},
    'react-native-screens':{FullWindowOverlay:host('Overlay')},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,left:0,right:0,bottom:34})},
    '@/contexts/GoViewContext':{useGoView:()=>({view})},
    '@/contexts/GoAdminAccessContext':{useAdminAccess:()=>({isOwner:owner,userId:'fictional-owner',checking:false})},
    '@/contexts/OwnerBusinessDemoContext':{useOwnerBusinessDemo:()=>({})}
  });
  const container=document.createElement('div'),root=createRoot(container);
  const close=()=>{},children='Existing Calendar';
  const render=async(visible,calendarWatermark=true)=>React.act(async()=>root.render(
    React.createElement(surface.OwnerContextSurface,null,
      React.createElement(surface.OwnerContextModal,{visible,calendarWatermark,onRequestClose:close},children))));
  const live=()=>nodes(container);
  const indicator=()=>live().filter(n=>n.attributes['data-testid']==='owner-context-indicator');
  return {render,indicator,propsByNode,live,close,children,
    setOwner:value=>{owner=value;},setView:value=>{view=value;},
    unmount:async()=>React.act(async()=>root.unmount())};
}

test('iOS Calendar opens and closes without environment overlays, gutters or input layers',async()=>{
 const f=await fixture();try{for(const visible of [false,true,false,true]){
  await f.render(visible);assert.equal(f.indicator().length,0);assert.equal(f.live().filter(n=>n.attributes['data-native']==='Overlay').length,0);
  const modal=f.live().find(n=>n.attributes['data-native']==='Modal'),mp=f.propsByNode.get(modal);
  assert.equal(mp.calendarWatermark,undefined);assert.equal(mp.visible,visible);assert.equal(mp.onRequestClose,f.close);assert.equal(modal.textContent,f.children);
  assert.equal(flatten(f.propsByNode.get(modal.firstChild).style).paddingTop,undefined);
 }}finally{await f.unmount();}
});

test('all profiles and public accounts preserve Calendar contents without environment badges',async()=>{
 const f=await fixture();try{for(const owner of [true,false])for(const profile of ['ADMIN','USER','BUSINESS']){
  f.setOwner(owner);f.setView(profile);await f.render(true);assert.equal(f.indicator().length,0);
  const modal=f.live().find(n=>n.attributes['data-native']==='Modal');assert.equal(modal.textContent,f.children);assert.equal(f.propsByNode.get(modal).onRequestClose,f.close);
 }}finally{await f.unmount();}
});

test('Android shares the same badge-free behavior and keeps native modal operations',async()=>{
 const f=await fixture('android');try{for(const profile of ['ADMIN','USER','BUSINESS']){
  f.setView(profile);await f.render(true);assert.equal(f.indicator().length,0);assert.equal(f.live().filter(n=>n.attributes['data-native']==='Overlay').length,0);
  const modal=f.live().find(n=>n.attributes['data-native']==='Modal');assert.equal(modal.textContent,f.children);assert.equal(f.propsByNode.get(modal).onRequestClose,f.close);
 }}finally{await f.unmount();}
});
