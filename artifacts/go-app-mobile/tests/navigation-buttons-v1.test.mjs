import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import life from './helpers/react-lifecycle.cjs';
const {React,createRoot,document,evaluate,ts}=life;
const flat=style=>Object.assign({},...[style].flat(Infinity).filter(Boolean));
const baseline=JSON.parse(readFileSync('tests/fixtures/navigation-handlers-v1.json','utf8'));
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?['node_modules','tests'].includes(e.name)?[]:walk(path.join(p,e.name)):e.name.endsWith('.tsx')?[path.join(p,e.name)]:[]);
const canonical=handler=>ts.createPrinter({removeComments:true}).printFile(ts.createSourceFile('callback.ts','const callback='+handler,ts.ScriptTarget.Latest,true));
test('every migrated navigation callback is unchanged, no duplicates were added and sorting arrows remain untouched',()=>{
 const actual=[];for(const file of [...walk('components'),'app/index.tsx']){const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);(function visit(n){if(!file.endsWith('GoNavigationAppearanceControl.tsx')&&ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='GoCloseButton'){const h=n.attributes.properties.find(p=>p.name?.getText(ast)==='onPress');if(h)actual.push({file:file.replace(/\\/g,'/'),handler:h.initializer.expression.getText(ast)});}ts.forEachChild(n,visit);})(ast);}
 const keys=rows=>rows.map(r=>r.file+'\n'+canonical(r.handler)).sort();const expected=[...baseline.handlers,{file:'app/index.tsx',handler:'()=>setSupportMode(false)'},{file:'app/index.tsx',handler:'()=>setSupportMode(active=>!active)'},{file:'components/booking-assistant/BookingAssistantScreen.tsx',handler:'back'},{file:'app/index.tsx',handler:'() => { Haptics.selectionAsync(); setCalConfigVisible(true); }'},{file:'components/booking/GoReservasConfigScreen.tsx',handler:'() => { Haptics.selectionAsync(); setConfigVisible(v => !v); }'}];assert.deepEqual(keys(actual),keys(expected));
 for(const row of baseline.excluded)assert.ok(readFileSync(row.file,'utf8').includes(row.source),'non-navigation arrow remains exact');
});

async function fixture({hand='right',width=390,height=600,stored=new Map(),navigation=true,read,bridge=false}={}){
 const hosts=new Map(),gestures=[],styles=[],calls=[];let props={navigation,screenKey:'synthetic-nav',buttonKey:'pair',bounds:{width,height},buttonWidth:136,maxH:64,initialBottom:12,initialRight:20};
 const host=name=>p=>{if(p.accessibilityLabel)hosts.set(p.accessibilityLabel,p);if(p.testID)hosts.set(p.testID,p);return React.createElement('div',{'data-native':name},p.children);};
 const native={...life.rn,View:host('View'),Text:host('Text'),TouchableOpacity:host('Button'),StyleSheet:{create:x=>x,absoluteFill:{}},Dimensions:{get:()=>({width,height})},useWindowDimensions:()=>({width,height})};
 const safe={'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})}},handContext=evaluate('components/ui/GoNavigationHand.tsx');
 const button=evaluate('components/ui/GoCloseButton.tsx',{'react-native':native,'@expo/vector-icons':{Feather:host('Icon')},'expo-linear-gradient':{LinearGradient:host('Gradient')}});
 const pan=()=>{const chain={};for(const k of ['activateAfterLongPress','onStart','onUpdate','onEnd','onFinalize'])chain[k]=v=>{chain['_'+k]=v;return chain;};gestures.push(chain);return chain;};
 const fab=evaluate('components/DraggableFAB.tsx',{'react-native':native,...safe,'@/components/ui/GoNavigationHand':handContext,'react-native-reanimated':{__esModule:true,default:{View:host('Animated')},useSharedValue:v=>React.useRef({value:v}).current,useAnimatedStyle:fn=>{styles.push(fn);return fn();},withSpring:v=>v,runOnJS:fn=>fn},'react-native-gesture-handler':{Gesture:{Pan:pan},GestureDetector:host('GestureDetector')},'@react-native-async-storage/async-storage':{getItem:read||(async key=>stored.get(key)||null),setItem:async(key,value)=>stored.set(key,value)},'expo-haptics':{selectionAsync(){},impactAsync(){},ImpactFeedbackStyle:{Light:'light'}}});
 const floating=evaluate('components/ui/GoNavigationFloating.tsx',{'react-native':native,...safe,'@/components/DraggableFAB':fab,'./GoNavigationHand':handContext,'react-native-gesture-handler':{GestureHandlerRootView:host('Root')}});
 const container=document.createElement('div'),root=createRoot(container);const settle=async fn=>React.act(async()=>{fn?.();for(let i=0;i<10;i++)await Promise.resolve();});
 const Button=bridge?Object.assign(p=>React.createElement(button.GoCloseButton,p),{displayName:"GoNavigationButton"}):button.GoCloseButton;
 const children=React.createElement(native.View,{style:{flexDirection:'row',gap:8}},React.createElement(Button,{level:'panel',accessibilityLabel:'Original back',onPress:()=>calls.push('back')}),React.createElement(Button,{level:'container',accessibilityLabel:'Original exit',onPress:()=>calls.push('exit')}));
 const render=async change=>{props={...props,...change};await settle(()=>root.render(React.createElement(handContext.GoNavigationHand.Provider,{value:hand},React.createElement(fab.DraggableFAB,props,children))));};await render({});
 return{hosts,styles,gestures,calls,stored,props,settle,render,hand:async value=>{hand=value;await render({});},gesture:()=>gestures.at(-1),style:()=>styles.at(-1)(),press:async(label,pressIn=true)=>settle(()=>{const p=hosts.get(label);if(pressIn)p.onPressIn?.();p.onPress({stopPropagation(){calls.push('stop');}});}),close:()=>settle(()=>root.unmount()),button,native,async floating(options){await settle(()=>root.render(React.createElement(handContext.GoNavigationHand.Provider,{value:hand},React.createElement(floating.GoNavigationFloating,{screenKey:'floating-test',width:136,handedness:hand,...options},children))));}};
}

test('smoke icon-only navigation shares a readable 64pt square, retain callbacks, disabled states and non-overlapping touch areas',async()=>{
 const f=await fixture();try{for(const label of ['Original back','Original exit']){const p=f.hosts.get(label),s=flat(p.style);assert.equal(s.width,64);assert.equal(s.height,64);assert.equal(s.borderRadius,21);assert.equal(s.flexDirection,'column');assert.equal(s.paddingVertical,0);assert.equal(p.accessibilityState.disabled,false);assert.ok(p.hitSlop<=2);}assert.equal(flat(f.hosts.get('Original back').style).backgroundColor,'rgba(60,68,78,0.75)');assert.equal(flat(f.hosts.get('Original exit').style).backgroundColor,'rgba(60,68,78,0.75)');await f.press('Original back');await f.press('Original exit');assert.deepEqual(f.calls,['stop','back','stop','exit']);assert.ok(!f.hosts.get('Original back').children?.props?.children?.includes?.('ATRÁS'));}finally{await f.close();}
});
test('long press uses the existing 500ms recognizer, persists clamped movement and never navigates on release',async()=>{
 const f=await fixture({bridge:true});try{const g=f.gesture();assert.equal(g._activateAfterLongPress,500);await f.settle(()=>{g._onStart({translationX:0,translationY:0});g._onUpdate({translationX:-1000,translationY:1000});g._onEnd();g._onFinalize();});assert.equal(f.style().left,8);assert.equal(f.style().top,528);await f.press('Original back',false);assert.deepEqual(f.calls,['stop']);const saved=JSON.parse(f.stored.get('fab_pos:synthetic-nav:pair:right'));assert.deepEqual(saved,{l:8,t:528});await f.press('Original back');assert.deepEqual(f.calls,['stop','stop','back']);}finally{await f.close();}
});
test('right/left positions are independent, restore after remount and remain safe after keyboard/orientation changes',async()=>{
 const stored=new Map();let f=await fixture({stored});try{assert.equal(f.style().left,234);await f.hand('left');assert.equal(f.style().left,20);const g=f.gesture();await f.settle(()=>{g._onStart({translationX:0,translationY:0});g._onUpdate({translationX:15,translationY:-80});g._onEnd();g._onFinalize();});assert.deepEqual(JSON.parse(stored.get('fab_pos:synthetic-nav:pair:left')),{l:35,t:444});await f.render({bounds:{width:250,height:180}});assert.ok(f.style().left>=8&&f.style().left+136<=242);assert.ok(f.style().top>=8&&f.style().top+64<=172);await f.render({bounds:{width:390,height:600}});assert.equal(f.style().top,444);}finally{await f.close();}f=await fixture({stored,hand:'left'});try{assert.equal(f.style().left,35);assert.equal(f.style().top,444);}finally{await f.close();}
});
test('old right-hand preferences migrate safely, corrupted storage and obsolete hydration cannot hide navigation',async()=>{
 const stored=new Map([['fab_pos:synthetic-nav:pair',JSON.stringify({l:1000,t:1000})]]);const f=await fixture({stored});try{assert.ok(f.style().left+136<=382);assert.ok(f.style().top+64<=592);stored.set('fab_pos:synthetic-nav:pair:left','broken');await f.hand('left');assert.equal(f.style().left,20);}finally{await f.close();}
});
test('floating hosts measure real local bounds, protect the composer and mirror near-thumb initial placement at iPhone sizes',async()=>{
 for(const width of [320,375,430,844])for(const hand of ['left','right']){const f=await fixture({width,hand});try{await f.floating({safeArea:false,protectedBottom:120,height:64});const host=f.hosts.get('floating-test-navigation-host');assert.equal(host.style.bottom,120);await f.settle(()=>host.onLayout({nativeEvent:{layout:{width,height:200}}}));const s=f.style();assert.ok(s.left>=0&&s.left+136<=width);assert.ok(s.top>=0&&s.top+64<=200);assert.equal(s.left,hand==='left'?12:width-148);}finally{await f.close();}}
});

test('Calendar actual recognizer reaches each safe edge for every visible group and both hands',async()=>{for(const width of [320,390,430])for(const hand of ['left','right'])for(const group of [64,108,136,180]){const f=await fixture({width,hand});try{await f.render({buttonWidth:group});const g=f.gesture();await f.settle(()=>{g._onStart({translationX:0,translationY:0});g._onUpdate({translationX:2000,translationY:-2000});g._onEnd();g._onFinalize();});assert.equal(f.style().left+group,width-8);assert.equal(f.style().top,8);await f.settle(()=>{g._onStart({translationX:0,translationY:0});g._onUpdate({translationX:-2000,translationY:2000});g._onEnd();g._onFinalize();});assert.equal(f.style().left,8);assert.equal(f.style().top+64,592);}finally{await f.close();}}});

test('Calendar exit reaches the sheet edge without counting the iPhone bottom inset twice',async()=>{
 const source=readFileSync('app/index.tsx','utf8');
 const expression=source.match(/screenKey="personal-calendar"[^\n]*protectedBottom=\{([^}]+)\}/)?.[1];
 assert.ok(expression);
 for(const sheetHeight of [80,120,240])for(const hand of ['left','right']){
  const f=await fixture({width:390,hand});
  try{
   const inset=34,protectedBottom=Function('overlayPanelHeight','insets','return '+expression)(sheetHeight,{bottom:inset});
   await f.floating({safeArea:true,protectedBottom});
   const host=f.hosts.get('floating-test-navigation-host');
   assert.equal(host.style.bottom,sheetHeight+10);
   const availableHeight=600-47-host.style.bottom;
   await f.settle(()=>host.onLayout({nativeEvent:{layout:{width:390,height:availableHeight}}}));
   const g=f.gesture();
   await f.settle(()=>{g._onStart({translationX:0,translationY:0});g._onUpdate({translationX:0,translationY:2000});g._onEnd();g._onFinalize();});
   assert.equal(f.style().top+64,availableHeight);
   assert.equal(600-47-f.style().top-64,host.style.bottom);
  }finally{await f.close();}
 }
});
