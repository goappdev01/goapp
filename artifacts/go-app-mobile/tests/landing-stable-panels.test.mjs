import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import lifecycle from './helpers/react-lifecycle.cjs';
const { React, createRoot, document, rn, evaluate, ts } = lifecycle;
const policy = evaluate('components/landing/landingPanels.ts');
const settle = async fn => React.act(async () => { fn?.(); for (let i=0;i<12;i++) await Promise.resolve(); });

for (const device of [{width:320,height:568,top:20},{width:375,height:667,top:20},{width:390,height:844,top:47},{width:430,height:932,top:59}]) {
  for (const hand of ['left','right']) test(`${device.width}/${hand}: short, medium and extensive groups stay below safe chrome and above fixed commands`, () => {
    const panel={x:18,y:0,width:device.width-36,height:device.height-330},frame={virtual:false};
    const controls=[{x:hand==='right'?8:device.width-68,y:device.top,width:60,height:70}];
    const frozen=JSON.stringify({panel,frame,controls}),floor=panel.height;
    for (const offsetY of [0,16]) for (const confirmationHeight of [0,44,76,110]) {
      const space=policy.landingScrollPanelSpace({panel,frame,insets:{top:device.top},titleBottom:device.top+8,controls,offsetY,confirmationHeight});
      for (const natural of [38,180,1600]) {
        const height=Math.min(space.availableHeight,natural),top=floor+offsetY-height;
        assert.ok(top>=device.top+8);assert.ok(top>=controls[0].y+controls[0].height+8);
        if(confirmationHeight)assert.ok(top-16-confirmationHeight>=device.top+8,'the rendered summary remains below the status bar');
        assert.ok(height<=space.availableHeight);assert.equal(floor+offsetY-top,height);
        if(natural===38)assert.equal(height,38,'short content retains its intrinsic height');
      }
    }
    assert.equal(JSON.stringify({panel,frame,controls}),frozen,'scroll budgeting never moves selectors or orbit anchors');
  });
}

test('a real side-column origin and Landing offset are included exactly once', () => {
  const panel={x:18,y:0,width:220,height:500},frame={virtual:true,left:430,top:80};
  const space=policy.landingScrollPanelSpace({panel,frame,insets:{top:20},titleBottom:36,offsetY:12,confirmationHeight:70,
    controls:[{x:10,y:50,width:80,height:160},{x:450,y:50,width:32,height:44}]});
  const rootFloor=80+500+12,top=rootFloor-space.availableHeight;
  assert.ok(top-16-70>=28);assert.ok(top>=102);
  assert.ok(top<200,'unrelated controls in the other column do not consume card space');
});

test('no pending summary reserves neither an invisible bar nor its gap', () => {
  const input={panel:{x:18,y:0,width:354,height:500},frame:{virtual:false},insets:{top:47},titleBottom:55,controls:[]};
  const without=policy.landingScrollPanelSpace(input),withBar=policy.landingScrollPanelSpace({...input,confirmationHeight:70});
  assert.equal(without.availableHeight-withBar.availableHeight,70+16);
  assert.equal(500-without.availableHeight,63);
});

async function mounted() {
  const props=new Map(),calls=[];
  function View(p){if(p.testID)props.set(p.testID,p);return React.createElement('div',{'data-testid':p.testID},p.children);}
  const native={...rn,View,ScrollView:View,Pressable:View};
  const api=evaluate('components/landing/LandingContentViewport.tsx',{'react-native':native});
  const node=document.createElement('div'),root=createRoot(node);
  const element=height=>React.createElement(api.LandingCardContents,{boundedHeight:height,scrollKey:'same-record',onOpen:()=>calls.push('open'),
    header:React.createElement(View,{testID:'original-header'},'Título extenso'),footer:React.createElement(View,{testID:'original-actions'},'Acciones originales'),
    adaptiveBody:{availableHeight:height,width:284,frameVerticalInset:3},staticBody:true,intrinsicBody:true,overflowing:false,onHeight(){},contentContainerStyle:{gap:3}},
    React.createElement(api.LandingCompactBody,{primary:'Contenido principal',actions:'Cancelar y modificar',secondary:[{key:'long',content:'Texto completo '.repeat(200)},{key:'notes',content:'Notas conservadas'}]}));
  await settle(()=>root.render(element(120)));
  return{props,node,calls,async resize(height){await settle(()=>root.render(element(height)))},async close(){await settle(()=>root.unmount())}};
}

test('free taps open once; vertical, horizontal and native-scroll contacts never become an open', async () => {
  const f=await mounted();try{
    const scroll=f.props.get('landing-panel-scroll'),open=f.props.get('landing-panel-open');
    const event=(x,y)=>({nativeEvent:{pageX:x,pageY:y},stopPropagation(){}});
    scroll.onTouchStartCapture(event(10,10));open.onPress(event(10,10));assert.deepEqual(f.calls,['open']);
    for(const [x,y] of [[10,40],[50,10]]){scroll.onTouchStartCapture(event(10,10));scroll.onTouchMoveCapture(event(x,y));open.onPress(event(x,y));assert.equal(f.calls.length,1);}
    scroll.onTouchStartCapture(event(10,10));scroll.onScrollBeginDrag();open.onPress(event(10,10));assert.equal(f.calls.length,1);
    scroll.onTouchStartCapture(event(10,10));scroll.onMomentumScrollBegin();open.onPress(event(10,10));assert.equal(f.calls.length,1);
    scroll.onTouchStartCapture(event(10,10));open.onPress(event(10,10));assert.equal(f.calls.length,2,'a new independent tap remains available');
  }finally{await f.close();}
});

test('one bounded viewport contains header, every secondary row and all actions without clipping rows or forcing height', async () => {
  const f=await mounted();try{
    assert.equal(f.props.get('landing-panel-scroll').style.maxHeight,120);
    assert.equal(f.props.get('landing-panel-scroll').style.height,undefined);
    assert.equal(f.props.get('landing-panel-scroll').style.flexGrow,0);
    assert.equal(f.props.get('landing-compact-row-long').style.display,undefined);
    assert.equal(f.props.get('landing-compact-secondary').style.maxHeight,undefined);
    assert.equal(f.props.get('landing-compact-secondary').style.overflow,undefined);
    assert.ok(f.node.textContent.includes('Notas conservadas'));assert.ok(f.node.textContent.includes('Acciones originales'));
    const before=f.node.firstChild;await f.resize(240);assert.equal(f.node.firstChild,before,'resizing retains the mounted viewport and its native offset');
    assert.equal(f.props.get('landing-panel-scroll').style.maxHeight,240);
  }finally{await f.close();}
});

test('all actual Landing groups opt into the same viewport and reuse the existing full sheet without hiding their source', () => {
  const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
  function visit(n){nodes.push(n);ts.forEachChild(n,visit)}visit(ast);
  const cards=nodes.filter(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='LandingCardContents');assert.equal(cards.length,2);
  for(const card of cards){const code=card.openingElement.getText(ast);for(const name of ['boundedHeight=','onOpen=','scrollKey='])assert.ok(code.includes(name));assert.ok(code.includes('setLandingDetailsId('));assert.ok(card.parent.openingElement.getText(ast).includes('CardPanRef.panHandlers'),'the existing horizontal recognizer remains above the free-area press target');}
  const overlays=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='anyOverlayOpen').getText(ast);
  assert.ok(!overlays.includes('landingDetailsId'),'opening the full card leaves its Landing scroller mounted');
  const detail=nodes.find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='GoEntryDetailsSheet'&&n.openingElement.attributes.properties.some(p=>p.name?.getText(ast)==='closeRequested'));
  const close=detail.openingElement.attributes.properties.find(p=>p.name?.getText(ast)==='onClose').initializer.expression;
  const calls=[],ctx={noteEditAfterDetailsRef:{current:null},setNoteDetailCloseRequested:value=>calls.push(['request',value]),setLandingDetailsId:value=>calls.push(['detail',value]),openEntryChange:()=>assert.fail('ordinary close must not start editing')};
  vm.runInNewContext(ts.transpileModule('globalThis.close='+close.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);ctx.close();assert.deepEqual(calls,[['request',false],['detail',null]]);
});
