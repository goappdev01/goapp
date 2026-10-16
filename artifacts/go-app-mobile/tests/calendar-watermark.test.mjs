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

test('iOS DEMO overlays the safe Calendar row without layout space or input interception and restores Landing on close',async()=>{
  const f=await fixture();
  try {
    await f.render(false);
    let marks=f.indicator();assert.equal(marks.length,1);
    assert.equal(flatten(f.propsByNode.get(marks[0]).style).top,49);
    await f.render(true);
    marks=f.indicator();assert.equal(marks.length,1,'Keep one native window overlay');
    const mark=marks[0],p=f.propsByNode.get(mark),style=flatten(p.style);
    assert.equal(mark.textContent,'DEMO');assert.equal(p.pointerEvents,'none');
    assert.equal(style.position,'absolute');assert.equal(style.top,63,'Inside the 44-point row below the 47-point safe inset');
    assert.equal(style.height,undefined);assert.equal(style.paddingTop,undefined);
    const text=nodes(mark).find(n=>n.attributes['data-native']==='Text');
    const ts=flatten(f.propsByNode.get(text).style);
    assert.equal(ts.opacity,0.3);assert.equal(ts.fontSize,10);assert.equal(ts.color,'rgba(239,68,68,0.45)');
    const modal=f.live().find(n=>n.attributes['data-native']==='Modal');
    const mp=f.propsByNode.get(modal);
    assert.equal(mp.calendarWatermark,undefined,'Do not pass presentation props to NativeModal');
    assert.equal(mp.onRequestClose,f.close);assert.equal(mp.visible,true);
    const modalSurface=modal.firstChild;
    assert.equal(flatten(f.propsByNode.get(modalSurface).style).paddingTop,undefined,'DEMO reserves no gutter');
    await f.render(false);
    const restored=f.indicator()[0];assert.equal(flatten(f.propsByNode.get(restored).style).top,49);
    const restoredText=nodes(restored).find(n=>n.attributes['data-native']==='Text');
    assert.equal(flatten(f.propsByNode.get(restoredText).style).opacity,undefined,'Original Landing watermark unchanged');
  } finally {await f.unmount();}
});

test('the Calendar watermark remains exclusive to authorized DEMO and leaves other contexts unchanged',async()=>{
  const f=await fixture();
  try {
    await f.render(true,false);assert.equal(flatten(f.propsByNode.get(f.indicator()[0]).style).top,49);
    await f.render(true);f.setView('ADMIN');await f.render(true);
    assert.equal(f.indicator()[0].textContent,'ADMIN');
    assert.equal(flatten(f.propsByNode.get(f.indicator()[0]).style).top,49);
    f.setOwner(false);await f.render(true);
    assert.equal(f.indicator().length,0);
    const modal=f.live().find(n=>n.attributes['data-native']==='Modal');
    assert.equal(modal.textContent,f.children);
    assert.equal(f.propsByNode.get(modal).onRequestClose,f.close);
  } finally {await f.unmount();}
});

test('Android uses the same passive Calendar watermark inside the existing native modal',async()=>{
  const f=await fixture('android');
  try {
    await f.render(true);
    const mark=f.indicator();assert.equal(mark.length,1);
    assert.equal(mark[0].textContent,'DEMO');
    assert.equal(f.propsByNode.get(mark[0]).pointerEvents,'none');
    assert.equal(flatten(f.propsByNode.get(mark[0]).style).top,63);
    assert.equal(f.live().filter(n=>n.attributes['data-native']==='Overlay').length,0);
  } finally {await f.unmount();}
});
