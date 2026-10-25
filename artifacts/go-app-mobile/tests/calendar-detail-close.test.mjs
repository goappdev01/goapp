import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,createRoot,document,rn,evaluate,ts}=require('./tests/helpers/react-lifecycle.cjs');
const presentation=evaluate('data/goEntryPresentation.ts'),policy=evaluate('data/reservationCardPolicy.ts');
const entry={id:'r1',type:'GO_BOOKING',kind:'sent',customerBooking:true,reservationId:'r1',estado:'aceptado',contactName:'Salón',date:'26/10/30',time:'12:00'};
async function fixture(handedness='right'){
 const props=new Map();let panCreations=0,pending=null;
 const View=p=>{if(p.testID)props.set(p.testID,p);return React.createElement('div',{'data-testid':p.testID},p.children);};
 const TouchableOpacity=p=>{props.set(p.accessibilityLabel,p);return React.createElement('button',{'aria-label':p.accessibilityLabel},p.children);};
 class Value{constructor(v){this.value=v;}setValue(v){this.value=v;}interpolate(){return 0;}stopAnimation(){if(pending?.value===this){const old=pending;pending=null;old.callback?.({finished:false});}}}
 const native={...rn,View,TouchableOpacity,ScrollView:View,Modal:View,Dimensions:{get:()=>({width:390,height:844})},
  Animated:{View,Value,timing:(value,config)=>({start:callback=>{pending={value,config,callback};}}),spring:(value,config)=>({start:()=>value.setValue(config.toValue)})},
  PanResponder:{create:config=>{panCreations++;return{panHandlers:config};}}};
 const close=evaluate('components/ui/GoCloseButton.tsx',{'react-native':native,'@expo/vector-icons':{Feather:()=>null}});
 const api=evaluate('components/GoEntryDetails.tsx',{'react-native':native,'@expo/vector-icons':{Feather:()=>null},
  '@/contexts/LanguageContext':{useLanguage:()=>({lang:'es',t:k=>k})},'@/data/goEntryPresentation':presentation,'@/data/reservationCardPolicy':policy,
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})},'./ui/GoCloseButton':close,'./landing/landingPanels':evaluate('components/landing/landingPanels.ts')});
 const root=createRoot(document.createElement('div'));
 const settle=async fn=>React.act(async()=>{fn();for(let i=0;i<8;i++)await Promise.resolve();});
 return{props,api,close,get panCreations(){return panCreations;},get pending(){return pending;},
  render:extra=>settle(()=>root.render(React.createElement(api.GoEntryDetailsSheet,{entry,handedness,onClose(){},...extra}))),
  finish:()=>{const old=pending;pending=null;old?.callback?.({finished:true});},dispose:()=>settle(()=>root.unmount())};
}
for(const hand of ['right','left'])test(`${hand}: real 56-point targets preserve icons, do not overlap and close on the first press`,async()=>{
 const f=await fixture(hand);let closed=0,exited=0;
 try{await f.render({onClose:()=>closed++,onExit:()=>exited++});
  const group=f.props.get('entry-detail-floating-close');assert.equal(group.style.gap,0);assert.equal(group.style[hand]+6,12);assert.equal(group.style.bottom+6,12);
  for(const label of ['Cerrar detalle','Salir del calendario']){const target=f.props.get(label);assert.equal(target.style.width,56);assert.equal(target.style.height,56);assert.equal(target.hitSlop,0);assert.equal(target.delayPressIn,0);
   assert.equal(target.children.props.style.width,44);assert.equal(target.children.props.style.borderRadius,16);}
  let stopped=0;f.props.get('Cerrar detalle').onPress({stopPropagation(){stopped++;}});assert.equal(closed,1);assert.equal(exited,0);assert.equal(stopped,1);
  f.props.get('Salir del calendario').onPress({stopPropagation(){}});assert.equal(exited,1);assert.equal(closed,1);
  assert.equal(f.close.GoCloseButton({level:'panel',onPress(){},accessibilityLabel:'default'}).props.style.width,44,'other GO close buttons keep their original size');
 }finally{await f.dispose();}
});
for(const hand of ['right','left'])test(`${hand}: Calendar-equivalent drag leaves central scrolling and taps free, uses current close and resets after cancellation`,async()=>{
 const f=await fixture(hand);let closed=0;
 try{await f.render({onClose:()=>closed++});
  const initial=f.props.get('entry-details-sheet').onPanResponderRelease;
  for(let i=0;i<10;i++)await f.render({entry:{...entry},onClose:()=>{closed+=2;}});
  assert.equal(f.panCreations,1);const pan=f.props.get('entry-details-sheet');assert.equal(pan.onPanResponderRelease,initial);
  const event={nativeEvent:{pageX:hand==='right'?380:10,pageY:400}};
  const gesture={dy:13,dx:0,y0:380};
  assert.equal(pan.onMoveShouldSetPanResponderCapture(event,gesture),true);assert.equal(f.api.ENTRY_DETAIL_CLOSE.distance,140);
  const boundary=390*(hand==='right'?.75:.25);
  assert.equal(pan.onMoveShouldSetPanResponderCapture({nativeEvent:{pageX:boundary,pageY:400}},gesture),true);
  assert.equal(pan.onMoveShouldSetPanResponderCapture({nativeEvent:{pageX:boundary+(hand==='right'?-1:1),pageY:400}},gesture),false);
  for(const g of [{...gesture,dy:12},{...gesture,dy:-160},{...gesture,dx:30}])assert.equal(pan.onMoveShouldSetPanResponderCapture(event,g),false);
  assert.equal(pan.onMoveShouldSetPanResponderCapture({nativeEvent:{pageX:195,pageY:400}},gesture),false,'central vertical scroll stays with the ScrollView');
  assert.equal(pan.onMoveShouldSetPanResponderCapture({nativeEvent:{pageX:195,pageY:400}},{...gesture,y0:0}),false,'native pre-grant y0=0 must not make the entire sheet act as its header');
  assert.equal(pan.onMoveShouldSetPanResponderCapture({nativeEvent:{pageX:195,pageY:70}},{...gesture,y0:60}),true,'header drag works across its full width');
  pan.onPanResponderRelease(event,{...gesture,dy:140});assert.equal(closed,0);assert.equal(f.pending,null);
  pan.onPanResponderMove(event,{...gesture,dy:160});pan.onPanResponderRelease(event,{...gesture,dy:160});assert.equal(f.pending.config.duration,180);f.finish();assert.equal(closed,2,'gesture uses the latest callback, exactly once');
  pan.onPanResponderRelease(event,{...gesture,dy:160});f.props.get('Cerrar detalle').onPress({stopPropagation(){}});assert.equal(closed,4);assert.equal(f.pending,null,'button cancels a pending gesture before closing immediately');
  await f.render({entry:null});await f.render({entry});assert.equal(f.panCreations,1);assert.ok(f.props.get('entry-detail-swipe-guide').pointerEvents==='none');
 }finally{await f.dispose();}
});
test('detail activation and full-close distance match the existing Calendar policy',()=>{
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let node;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='calTopSwipeRef')node=n;ts.forEachChild(n,visit);}visit(ast);
 const code=ts.transpileModule('('+node.initializer.getText(ast)+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const native=vm.runInNewContext(code,{useRef:x=>({current:x}),PanResponder:{create:c=>c},monthGridOpenRef:{current:false},calScreenWRef:{current:390},calCloseRef:{current(){}},calPanelCollapseRef:{current(){}},calOpenMonthGridRef:{current(){}}});
 for(const [dy,dx,x]of [[12,0,380],[13,0,380],[13,20,380],[13,0,195]])assert.equal(native.onMoveShouldSetPanResponder({nativeEvent:{pageX:x}},{dy,dx}),dy>12&&Math.abs(dy)>Math.abs(dx)&&x>=390*.75);
 assert.ok(node.getText(ast).includes('g.dy > 140'),'Calendar still uses the same full-dismiss distance');
});
