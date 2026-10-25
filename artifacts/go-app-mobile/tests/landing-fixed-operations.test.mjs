import {test} from 'node:test';
import {entryPhone,renderEntryQuickActions} from './helpers/entry-details-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,createRoot,document,rn,ts,evaluate}=require('./tests/helpers/react-lifecycle.cjs');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];
function walk(n){all.push(n);ts.forEachChild(n,walk)}walk(ast);
const declaration=name=>all.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);
const cards=all.filter(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='LandingCardContents');
const attr=(card,name)=>card.openingElement.attributes.properties.find(p=>p.name?.getText(ast)===name)?.initializer?.expression;
const next=cards.find(card=>attr(card,'footer')?.getText(ast)==='operations.content');
const changes=cards.find(card=>attr(card,'footer')?.getText(ast).includes('renderLandingOperations(item.g).content'));
const compile=code=>ts.transpileModule(code,{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const text=node=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
const dom=node=>node?[node,...node.childNodes.flatMap(dom)]:[];
const byId=(container,id)=>dom(container).find(n=>n.attributes?.['data-testid']===id);
const settle=async fn=>React.act(async()=>{await fn?.();for(let i=0;i<8;i++)await Promise.resolve();});
const labels={here:'Aquí',late:'Tarde',change:'Cambiar',go_nav:'Ir',call:'Llamar',whatsapp_intro:'GO',at_time:'a las __TIME__'};
const profiles=[{name:'ADMIN propietario',view:'ADMIN',owner:true},{name:'ADMIN técnico',view:'ADMIN',owner:false},
 {name:'USUARIO propietario',view:'USER',owner:true},{name:'USUARIO',view:'USER',owner:false},
 {name:'EMPRESA',view:'BUSINESS',owner:false},{name:'EMPRESA DEMO',view:'BUSINESS',owner:true}];
const policy=evaluate('components/landing/landingPanels.ts'),layout=evaluate('components/landing/landingResponsiveLayout.ts');

test('both real Home callers put the complete operations group in a fixed slot, never scrolling children',()=>{
 assert.equal(cards.length,2);assert.ok(next&&changes);
 for(const card of cards){
  const body=card.children.map(n=>n.getText(ast)).join('');
  assert.ok(attr(card,'header')&&attr(card,'footer')&&attr(card,'footerGap')&&attr(card,'bodyFrame'));
  assert.ok(!body.includes('borderWidth: 1.5'), 'the moving information contains no outer card border');
  assert.ok(attr(card,'bodyFrame').getText(ast).includes('{body}'), 'the existing frame wraps the bounded scroller');
  assert.ok(!body.includes('operations.content')&&!body.includes('renderLandingOperations('));
  assert.ok(!/isAdminView|goView|isBusinessMode|isUserMode/.test(attr(card,'footer').getText(ast)),'every profile uses the same operations boundary');
  assert.ok(!card.openingElement.getText(ast).includes('scrollEnabled={false}'),'long information is not disabled');
  for(let parent=card.parent;parent;parent=parent.parent)if(ts.isJsxElement(parent))
   assert.ok(!['ScrollView','Animated.ScrollView'].includes(parent.openingElement.tagName.getText(ast)),'no moving outer viewport');
 }
 assert.equal(attr(next,'footerGap').getText(ast),'PANEL_ACTION_GAP');
 assert.equal(attr(changes,'footerGap').getText(ast),'Math.round(12 * uiScaleFactor)');
 const renderer=declaration('renderLandingOperations').getText(ast);
 assert.ok(!/<(?:Animated\.)?ScrollView\b/.test(renderer),'the operations renderer itself contains no vertical scroller');
});

async function fixture(profile,card,stacked){
 const buttons=new Map(),urls=[],calls=[],refs={current:null};let drag,changeContent,setOpen;
 const View=({children,style,testID,...props})=>React.createElement('div',{'data-testid':testID,'data-layout':JSON.stringify(style??{}),'data-pointer':props.pointerEvents},children);
 // Only emulate native offset state. No simulated Yoga dimensions or clamping are
 // used to claim a fit: the regression checks the actual mounted ancestry instead.
 const ScrollView=props=>{const [offset,setOffset]=React.useState(0);drag=setOffset;return React.createElement('div',{'data-testid':props.testID,'data-offset':offset,'data-layout':JSON.stringify(props.style)},props.children);};
 const TouchableOpacity=props=>{const label=props.accessibilityLabel||text(props.children);if(label)buttons.set(label,props);return React.createElement('button',{'data-testid':label},props.children)};
 const Pressable=props=>React.createElement(View,{...props,style:typeof props.style==='function'?props.style({pressed:false}):props.style},props.children);
 const native={...rn,View,ScrollView,TouchableOpacity,Pressable};
 const shared=evaluate('components/landing/LandingContentViewport.tsx',{'react-native':native});
 const scope={exports:{},React,entryPhone,renderEntryQuickActions,View,Animated:{View},Pressable,Text:rn.Text,TouchableOpacity,
  tint:"#60a5fa",cardAccent:"#f97316",INFO_W:stacked?220:354,nextCardPanRef:{panHandlers:{onMoveShouldSetResponder:()=>false}},nextCardSlideAnim:0,nextCardDeleteConfirm:null,
  nextCardDeleteTimerRef:{current:null},setNextCardDeleteConfirm(){},startRelatedGoAction(){},LinearGradient:View,Feather:()=>null,
  landingCurrentEntry:policy.landingCurrentEntry,landingActionGrid:layout.landingActionGrid,
  landingPanels:{region:{width:stacked?220:354}},landingPanelInsets:{left:0,right:0},landingStackTransport:stacked,
  landingFrame:{virtual:stacked},uiScaleFactor:1,uiScale:'estandar',handedness:'right',
  goView:{view:profile.view,isAdminView:profile.view==='ADMIN',isOwner:profile.owner},isUserMode:profile.view==='USER',isBusinessMode:profile.view==='BUSINESS',
  aquiSendingId:null,setAquiSendingId:id=>calls.push(['gps',id]),Location:{getForegroundPermissionsAsync:async()=>({status:'granted'}),getLastKnownPositionAsync:async()=>({coords:{latitude:1,longitude:2}})},
  Linking:{openURL:async url=>urls.push(url)},normalizePhoneForWhatsApp:n=>n.replace(/\D/g,''),resolveIntentLabel:e=>e.intentLabel,t:k=>labels[k]??k,
  Haptics:{selectionAsync:()=>Promise.resolve()},setLateSheetGo:e=>calls.push(['late',e.id]),snoozeGoReminder(){throw Error('Unexpected reminder write')},
  currentReceivedIdRef:refs,proposalReturnRef:{current:null},setCalOpen(){},calFlow:{open:v=>calls.push(['calendar',v.initialTime])},
  formatISODate(){throw Error('Unexpected date replacement')},getToday(){},sendSuggestChangeFromCal(){},setTransportPanelH(){},showToast:msg=>calls.push(['toast',msg]),PANEL_ACTION_GAP:12};
 vm.createContext(scope);
 vm.runInContext(compile(`const ${declaration('buildNextAptActions').getText(ast)};const ${declaration('renderLandingOperations').getText(ast)};exports.render=renderLandingOperations;`),scope);
 const g=Object.freeze({id:'original-fixed',type:'GO_BOOKING',kind:'sent',estado:'aceptado',intentLabel:'Cita existente',dateISO:'2032-03-20',date:'20 marzo',time:'10:00',phone:'+34600111222',whatsapp:'+34600333444',place:'Dirección vigente',notes:'Nota conservada'});
 scope.g=g;
 vm.runInContext(compile('exports.frame = ('+attr(card,'bodyFrame').getText(ast)+');'),scope);
 const renderFooter=()=>{scope.operations=scope.exports.render(g);scope.aChange=scope.operations.change;scope.item={kind:'cambio',g};return vm.runInContext('('+attr(card,'footer').getText(ast)+')',scope);};
 const headerGap=attr(card,'headerGap')?vm.runInContext('('+attr(card,'headerGap').getText(ast)+')',scope):0;
 const footerGap=vm.runInContext('('+attr(card,'footerGap').getText(ast)+')',scope);
 function Root(){const [long,setLong]=React.useState(true),[opened,changeOpen]=React.useState(true);changeContent=setLong;setOpen=changeOpen;return React.createElement(shared.LandingContentViewport,{frame:{virtual:stacked,left:0,top:0,width:stacked?220:390,height:320},closingGesture:{}},
  opened&&React.createElement(shared.LandingCardContents,{bodyFrame:scope.exports.frame,header:React.createElement('span',{'data-testid':'actual-indicator'},'Cabecera'),headerGap,footer:renderFooter(),footerGap,
   overflowing:false,onHeight(){},contentContainerStyle:{gap:12}},React.createElement('div',{'data-testid':'information'},long?'Información larga '.repeat(200):'Información corta')));}
 const container=document.createElement('div'),root=createRoot(container);await settle(()=>root.render(React.createElement(Root)));
 return {container,buttons,urls,calls,refs,headerGap,footerGap,async open(value){await settle(()=>setOpen(value))},async scroll(offset){await settle(()=>drag(offset))},async resize(long){await settle(()=>changeContent(long))},
  async press(label){await settle(async()=>{buttons.get(label).onPress();await new Promise(resolve=>setImmediate(resolve));})},async close(){await settle(()=>root.unmount())}};
}

for(const profile of profiles)for(const [kind,which] of [['visit/task',()=>next],['changes',()=>changes]])for(const stacked of [false,true])
 test(profile.name+' / '+kind+' / '+(stacked?'narrow':'wide')+': actual controls stay outside every vertical scroller',async()=>{
  const f=await fixture(profile,which(),stacked);try{
   const shell=byId(f.container,'landing-card-fixed-frame'),body=byId(f.container,'landing-card-body'),header=byId(f.container,'landing-card-header'),footer=byId(f.container,'landing-card-operations');
   const frame=byId(f.container,'landing-information-frame');
   assert.ok(shell&&body&&header&&footer&&frame);assert.equal(body.parentNode,frame);assert.equal(footer.parentNode,shell);assert.equal(header.parentNode,shell);
   assert.ok(dom(frame).includes(body)&&!dom(body).includes(frame),'all four borders belong to a fixed ancestor, never to the moving native content');
   for(let node=frame;node!==shell;node=node.parentNode){
    assert.ok(node,'the border is constrained by the same fixed panel');
    const style=JSON.parse(node.attributes['data-layout']);assert.equal(style.flexShrink,0,'all three Landing panels preserve their intrinsic information frame');assert.equal(style.minHeight,0);
    assert.equal(style.height,undefined);assert.equal(style.minHeight,0);assert.equal(style.marginTop,undefined);assert.equal(style.marginBottom,undefined);
    for(const transform of style.transform??[])assert.equal(transform.translateY,undefined,'no cosmetic vertical displacement');
   }
   const frameStyle=JSON.parse(frame.attributes['data-layout']);assert.equal(frameStyle.borderWidth,1.5);assert.ok(frameStyle.borderRadius>0);
   assert.ok(!dom(footer).includes(frame)&&!dom(frame).includes(footer),'operations and complete frame have disjoint fixed layout bounds');
   const originalFrame=frame.attributes['data-layout'];
   assert.ok(!dom(body).includes(footer)&&!dom(body).includes(header));
   const footerStyle=JSON.parse(footer.attributes['data-layout']),headerStyle=JSON.parse(header.attributes['data-layout']),bodyStyle=JSON.parse(body.attributes['data-layout']);
   assert.equal(footerStyle.flexShrink,0);assert.equal(footerStyle.marginTop,f.footerGap);
   assert.equal(headerStyle.flexShrink,0);assert.equal(headerStyle.marginBottom,f.headerGap);
   assert.equal(bodyStyle.flexShrink,1);assert.equal(bodyStyle.minHeight,0);
   assert.deepEqual([...f.buttons.keys()],['WhatsApp','Cambiar','Aquí','Llamar','Tarde','Ir','Taxi','Uber','Bolt','T.pub']);
   const originalFooter=footer.attributes['data-layout'];
   for(const offset of [12,250,-12,0]){
    await f.scroll(offset);assert.equal(Number(byId(f.container,'landing-card-body').attributes['data-offset']),offset);
    assert.equal(byId(f.container,'landing-card-operations'),footer);assert.equal(footer.attributes['data-layout'],originalFooter);
    assert.equal(byId(f.container,'landing-information-frame'),frame);assert.equal(frame.attributes['data-layout'],originalFrame,'scroll changes only interior offset, never frame bounds');
    for(const label of f.buttons.keys()){
     const button=byId(f.container,label);assert.ok(dom(footer).includes(button));assert.ok(!dom(body).includes(button),label+' is never scroll content');
    }
   }
   for(const long of [false,true]){await f.resize(long);assert.equal(byId(f.container,'landing-card-operations'),footer);assert.equal(footer.attributes['data-layout'],originalFooter);}
   await f.press('Cambiar');assert.equal(f.refs.current,'original-fixed');assert.deepEqual(f.calls.at(-1),['calendar','10:00']);
   await f.press('Tarde');assert.deepEqual(f.calls.at(-1),['late','original-fixed']);
   await f.press('Uber');assert.equal(f.urls.at(-1),'https://m.uber.com');
   await f.open(false);for(const id of ['landing-information-frame','landing-card-header','landing-card-body','landing-card-operations'])assert.equal(byId(f.container,id),undefined,'minimizing removes the complete opened composition');
   await f.open(true);assert.ok(byId(f.container,'landing-information-frame'));assert.equal(byId(f.container,'landing-card-body').parentNode,byId(f.container,'landing-information-frame'));
  }finally{await f.close()}
 });

test('HOLD and body-only callers reserve no empty operations row',()=>{
 const fakeReact={createContext:React.createContext,createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)})};
 const context={exports:{},require:name=>name==='react'?fakeReact:name==='react-native'?{View:'View',ScrollView:'ScrollView',StyleSheet:{absoluteFill:{}}}:undefined};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/landing/LandingContentViewport.tsx','utf8'),{compilerOptions:{ alwaysStrict: false,jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,context);
 const render=context.exports.LandingCardContents,props={overflowing:false,onHeight(){},children:'body',contentContainerStyle:{gap:12}};
 const bodyOnly=render(props);assert.equal(bodyOnly.type,'ScrollView');
 const held=render({...props,header:'HOLD',footer:false,footerGap:12});
 assert.equal(held.children.filter(n=>n&&typeof n==='object'&&n.props?.testID==='landing-card-operations').length,0);
 assert.equal(held.children.filter(n=>n&&typeof n==='object'&&n.type==='ScrollView').length,1);
});

test('the actual card frame is fixed even when the controls were already fixed: regression guard',()=>{
 for(const card of cards){
  const frame=attr(card,'bodyFrame');assert.ok(frame,'a fixed footer alone does not protect the card border');
  assert.ok(frame.getText(ast).includes('borderWidth: 1.5'));
  assert.ok(!card.children.map(n=>n.getText(ast)).join('').includes('borderWidth: 1.5'));
  assert.ok(!/isAdminView|goView\.view/.test(frame.getText(ast)),'ADMIN, USUARIO and EMPRESA use identical frame/scroll ownership');
 }
});
