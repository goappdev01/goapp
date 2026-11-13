import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];(function walk(n){all.push(n);ts.forEachChild(n,walk)})(ast);
const sheet=all.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='BottomSheet');
const compile=value=>ts.transpileModule(value,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS}}).outputText;
const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)];

test('Listados closes its detail and sheet before dispatching the existing reservation proposal once',()=>{
 const detail=all.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='renderListBookingDetail');
 const finish=all.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='finishListBookingProposal');
 assert.ok(detail&&finish);
 const calls=[],entry={id:'booking-1',reservationId:'real-booking'};
 const scope={React:{Fragment:'Fragment',createElement:(type,props,...children)=>({type,props,children})},
  GoEntryDetailsSheet:'Details',handedness:'right',goDirectlyToLanding(){},renderEntryMessageScreen(){},openEntryMessage(){},
  setCalBookingDetailEntry:value=>calls.push(['close-detail',value]),renderEntryMicroActions:()=>null,
  renderEntryQuickActions:(_entry,_state,_compact,_edit,propose)=>({type:'QuickActions',propose}),renderLinkedNotes:()=>null,
  listBookingProposalAfterDismissRef:{current:null},setListOpen:value=>calls.push(['close-list',value]),
  openEntryChange:value=>calls.push(['proposal',value.id])};
 vm.runInNewContext(compile(finish.getText(ast)+';'+detail.getText(ast)+';globalThis.openDetail=renderListBookingDetail;globalThis.finish=finishListBookingProposal;'),scope);
 const sheet=scope.openDetail(entry),dismissed=[];
 const content=sheet.children[0](action=>dismissed.push(action));
 content.children.find(child=>child?.type==='QuickActions').propose();
 assert.deepEqual(calls,[]);assert.equal(dismissed.length,1);
 dismissed[0]();assert.deepEqual(calls,[['close-list',false]]);
 scope.finish();scope.finish();assert.deepEqual(calls,[['close-list',false],['proposal',entry.id]]);
 const listSheet=all.find(n=>ts.isJsxOpeningElement(n)&&n.tagName.getText(ast)==='BottomSheet'&&n.attributes.properties.some(p=>p.name?.getText(ast)==='visible'&&p.initializer?.expression?.getText(ast)==='listOpen'));
 assert.equal(listSheet.attributes.properties.find(p=>p.name?.getText(ast)==='onDismiss')?.initializer?.expression?.getText(ast),'finishListBookingProposal');
});
const style=s=>Object.assign({},...[s].flat(Infinity).filter(Boolean));
function fixture(width=390,height=844,hand='right'){
 let cursor=0;const slots=[],events=new Map(),effects=[],gestures=[],calls=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children:children.flat(Infinity)}}),useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,value=>slots[i].value=typeof value==='function'?value(slots[i].value):value];}};
 function gesture(){const result={};const proxy=new Proxy(result,{get:(o,k)=>k in o?o[k]:(...args)=>{if(k.startsWith('on'))o[k]=args[0];else o[k+'Value']=args;return proxy;}});gestures.push(result);return proxy;}
 const scope={React,useState:React.useState,useEffect:fn=>effects.push(fn),useMemo:fn=>fn(),useCallback:fn=>fn,useSharedValue:value=>React.useState({value})[0],useAnimatedStyle:fn=>fn(),useAnimatedScrollHandler:value=>value,
  useSheetSwipeDown:()=>gesture(),useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0}),useWindowDimensions:()=>({width,height}),
  Dimensions:{get:()=>({width,height})},Keyboard:{addListener:(event,fn)=>{const listeners=events.get(event)||[];listeners.push(fn);events.set(event,listeners);return{remove(){}};}},
  Gesture:{Pan:gesture,Native:gesture,Race:(...g)=>g},runOnJS:fn=>fn,withSpring:value=>value,withTiming:(value,_config,fn)=>{fn?.(true);return value;},
  Reanimated:{View:'Sheet',ScrollView:'ScrollView'},StyleSheet:{absoluteFill:{}},styles:{sheet:{backgroundColor:'#0e0e10'},sheetHandle:{},sheetTitle:{}},Platform:{OS:'ios'},containsGoBrand:()=>false,noTranslate:{},
  Modal:'Modal',View:'View',Pressable:'Pressable',AnimatedPressable:'Backdrop',GestureDetector:'GestureDetector',KeyboardAvoidingView:'KeyboardFrame',KeyboardControllerAvoidingView:'ControllerFrame',KeyboardAwareScrollView:'ScrollView',Text:'Text',LinearGradient:'Gradient',DraggableFAB:'DraggableFAB',GoCloseButton:'GoCloseButton'};
 vm.runInNewContext(compile(sheet.getText(ast)+'\nglobalThis.BottomSheet=BottomSheet;'),scope);
 const props={visible:true,onClose:()=>calls.push('close'),title:'GO · TAREAS',paddingBottom:38,dragToClose:true,compactHeader:true,expandToSafeTop:true,floatingClose:{screenKey:'listados',handedness:hand,label:'Cerrar listado'},footer:'original-footer',children:'real-cards'};
 return{scope,calls,props,gestures,events,render(overrides={}){cursor=0;effects.length=0;gestures.length=0;const tree=scope.BottomSheet({...props,...overrides});effects.splice(0).forEach(fn=>fn());return tree;},keyboard(show){for(const event of [show?'keyboardWillShow':'keyboardWillHide',show?'keyboardDidShow':'keyboardDidHide'])events.get(event)?.forEach(fn=>fn({endCoordinates:{height:300}}));}};
}
for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390]])for(const hand of ['left','right'])test(`${width}×${height}/${hand}: expanded Listados uses safe viewport, flexible inner scroll and the shared floating close outside the panel pan`,()=>{
 const f=fixture(width,height,hand);let tree=f.render(),sheet=nodes(tree).find(n=>n.props.testID==='listados-sheet'),frame=nodes(tree).find(n=>n.type==='KeyboardFrame'),scroll=nodes(tree).find(n=>n.props.testID==='listados-scroll');
 assert.equal(style(sheet.props.style).flex,1);assert.equal(style(sheet.props.style).maxHeight,'100%');assert.equal(frame.props.style.paddingTop,55);assert.equal(frame.props.style.flex,1);assert.equal(scroll.props.style.maxHeight,undefined);assert.equal(scroll.props.style.flex,1);assert.equal(scroll.props.contentContainerStyle.paddingBottom,64);
 const footer=nodes(tree).find(n=>n.type==='View'&&n.props.onLayout);footer.props.onLayout({nativeEvent:{layout:{height:120}}});tree=f.render();const floating=nodes(tree).find(n=>n.props.testID==='listados-floating-close'),fab=nodes(floating).find(n=>n.type==='DraggableFAB'),close=nodes(fab).find(n=>n.type==='GoCloseButton');
 assert.equal(fab.props.screenKey,'listados');assert.equal(fab.props.buttonWidth,64);assert.equal(fab.props.maxH,64);assert.equal(fab.props.bounds.height,height-55-34-120-20);assert.equal(close.props.level,'panel');assert.equal(fab.props.initialRight,14);
 const panelGesture=nodes(tree).find(n=>n.type==='GestureDetector');assert.equal(nodes(panelGesture).some(n=>n.type==='DraggableFAB'),false,'moving the shared FAB cannot drive the sheet close gesture');close.props.onPress();assert.deepEqual(f.calls,['close']);
 const minimized=f.render({minimized:true});assert.equal(style(nodes(minimized).find(n=>n.props.testID==='listados-sheet').props.style).flex,undefined);assert.equal(nodes(minimized).find(n=>n.props.testID==='listados-scroll').props.style.maxHeight,0);
 assert.equal(nodes(f.render({modalOverlay:'note-editor'})).some(n=>n.type==='DraggableFAB'),false,'child editor owns its own close');
});
test('inner scroll, two-stage swipe and keyboard gating retain their actual existing gesture handlers',()=>{
 const f=fixture(),step={value:0};let stages=0;let tree=f.render({swipeStepDown:step,onSwipeStepDown:()=>stages++});const scroll=nodes(tree).find(n=>n.props.testID==='listados-scroll');
 const pan=()=>f.gestures.find(g=>g.failOffsetXValue);scroll.props.onScroll({nativeEvent:{contentOffset:{y:120}}});pan().onUpdate({translationY:200});pan().onEnd({translationY:200,velocityY:900});assert.deepEqual(f.calls,[]);assert.equal(stages,0);
 scroll.props.onScroll({nativeEvent:{contentOffset:{y:0}}});pan().onUpdate({translationY:140});pan().onEnd({translationY:140,velocityY:0});assert.equal(stages,1);assert.deepEqual(f.calls,[]);
 step.value=1;pan().onUpdate({translationY:140});pan().onEnd({translationY:140,velocityY:0});assert.deepEqual(f.calls,['close']);
 f.keyboard(true);tree=f.render();pan().onUpdate({translationY:140});pan().onEnd({translationY:140,velocityY:0});assert.deepEqual(f.calls,['close'],'keyboard input cannot turn into sheet dismissal');
});
test('other sheets retain the 460-point limit and Note retains its single existing keyboard frame',()=>{
 const f=fixture();let tree=f.render({expandToSafeTop:false,floatingClose:undefined});assert.equal(nodes(tree).find(n=>n.type==='ScrollView').props.style.maxHeight,460);assert.equal(nodes(tree).some(n=>n.type==='DraggableFAB'),false);
 tree=f.render({expandToSafeTop:false,floatingClose:undefined,noteKeyboardScroll:true});assert.equal(nodes(tree).filter(n=>n.type==='ControllerFrame').length,1);assert.equal(style(nodes(tree).find(n=>n.props.testID==='note-sheet').props.style).maxHeight,440);assert.equal(nodes(tree).find(n=>n.type==='ScrollView').props.style.flexBasis,undefined);
});
test('read projection carries the real establishment category without changing status, identity or input data',()=>{
 const scope={exports:{},Intl,Date};vm.runInNewContext(compile(readFileSync('data/customerBookingProjection.ts','utf8')),scope);
 const booking={id:'original',customerId:'client',businessId:'business',bookableItemId:'service',startDatetime:'2030-01-07T10:00:00',endDatetime:'2030-01-07T10:30:00',status:'CONFIRMED'},business={id:'business',name:'Salón',category:'peluqueria',timezone:'Europe/Madrid',location:'Lugar'},item={title:'Lavado + Corte'};
 const before=JSON.stringify([booking,business,item]),row=scope.exports.customerBookingEntry(booking,business,item,'Profesional');
 assert.equal(row.bookingCategory,'peluqueria');assert.equal(row.reservationId,'original');assert.equal(row.bookingStatus,'confirmada');assert.equal(row.estado,'aceptado');assert.equal(JSON.stringify([booking,business,item]),before);
});
