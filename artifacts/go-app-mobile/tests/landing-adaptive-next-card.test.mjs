import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {renderEntryQuickActions,renderEntryMicroActions,entryIsReservation} from './helpers/entry-details-fixture.mjs';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,createRoot,document,rn,ts,evaluate}=require('./tests/helpers/react-lifecycle.cjs');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
function walk(n){nodes.push(n);ts.forEachChild(n,walk)}walk(ast);
const attribute=(node,name)=>node.openingElement.attributes.properties.find(p=>p.name?.getText(ast)===name)?.initializer?.expression;
const cards=nodes.filter(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='LandingCardContents');
const next=cards.find(n=>attribute(n,'footer')?.getText(ast)==='operations.content'),proposal=cards.find(n=>n!==next);
const compile=code=>ts.transpileModule(code,{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const dom=node=>node?[node,...node.childNodes.flatMap(dom)]:[];
const byId=(root,id)=>dom(root).find(n=>n.attributes?.['data-testid']===id);
const settle=async fn=>React.act(async()=>{await fn?.();for(let i=0;i<8;i++)await Promise.resolve();});
const flatten=style=>Array.isArray(style)?Object.assign({},...style.map(flatten)):style??{};
const profiles=['ADMIN','USER','BUSINESS'];

test('visits/tasks and changes share static compact sizing and retain full detail navigation',()=>{
 assert.ok(attribute(next,'adaptiveBody'));assert.ok(attribute(proposal,'adaptiveBody'),'changes now reuse the validated natural sizing path');
 const info=next.children.map(n=>n.getText(ast)).join('');
 for(const expression of ['{displayContact(entryIdentity(g.contactName), g.phone)}','{g.place}']){
  const text=nodes.find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='Text'&&n.pos>=next.pos&&n.end<=next.end&&n.children.some(child=>child.getText(ast)===expression));
  assert.ok(text);assert.equal(attribute(text,'numberOfLines').getText(ast),'1');assert.equal(text.openingElement.attributes.properties.find(p=>p.name?.getText(ast)==='ellipsizeMode')?.initializer.getText(ast),'"tail"');
 }
 assert.ok(!info.includes('overflow: "hidden"'));assert.ok(!/isAdminView|isBusinessMode|isUserMode/.test(attribute(next,'adaptiveBody').getText(ast)));
 const frame=attribute(next,'bodyFrame').getText(ast);assert.ok(!frame.includes('flexShrink: 1'));assert.ok(!frame.includes('overflow: "hidden"'));
 const panelStyle=attribute(next.parent,'style').getText(ast);assert.ok(panelStyle.includes('bottom: contentBottom('));assert.ok(!panelStyle.includes('maxHeight'),'no outer cap may silently reinstate the old full-width header reservation');assert.ok(!/margin|translateY|paddingTop/.test(panelStyle));
});

async function fixture(profile,{bodyHeight=40,availableHeight=348,scale=1,place='Calle de Murcia, Molina de Segura, Murcia',entryType='GO_BOOKING',notes=''}={}){
 let change;const propsById=new Map(),actions=[],measures=[];
 const headerHeight=34,footerHeight=2*Math.round(Math.min(80,Math.max(56,64*scale)))+Math.round(6*scale);
 function View(props){
  const id=props.testID,style=flatten(typeof props.style==='function'?props.style({pressed:false}):props.style);
  if(id)propsById.set(id,props);
  const measured=id==='landing-card-header'?headerHeight:id==='landing-card-operations'?footerHeight:
   id==='landing-card-natural-content'||id==='landing-card-body'?current.bodyHeight:id==='landing-compact-primary'?36:id==='landing-compact-actions'?52:id?.startsWith('landing-compact-row-')?16:null;
  // Native onLayout values are injected; this harness does not pretend to render iOS fonts or Yoga.
  React.useLayoutEffect(()=>{if(measured!==null)props.onLayout?.({nativeEvent:{layout:{height:measured,width:328}}});},[id,measured]);
  return React.createElement('div',{'data-testid':id,'data-native':'View','data-style':JSON.stringify(style)},props.children);
 }
 function ScrollView(props){const [offset,setOffset]=React.useState(0);propsById.set('scroll',props);propsById.set('drag',setOffset);return React.createElement('div',{'data-testid':props.testID,'data-native':'ScrollView','data-offset':offset,'data-style':JSON.stringify(props.style)},props.children);}
 const native={...rn,View,ScrollView,Pressable:View,TouchableOpacity:View};
 const shared=evaluate('components/landing/LandingContentViewport.tsx',{'react-native':native});
 const scope={React,View,Animated:{View},Pressable:View,TouchableOpacity:View,Text:rn.Text,Feather:()=>null,entryIdentity:e=>e||'',renderEntryQuickActions,renderEntryMicroActions,entryIsReservation,lang:'es',
  nextCardPanRef:{panHandlers:{onMoveShouldSetResponder:()=>false}},nextCardSlideAnim:0,nextCardDeleteConfirm:null,nextCardDeleteTimerRef:{current:null},
  setNextCardDeleteConfirm(){},Haptics:{impactAsync:()=>Promise.resolve(),ImpactFeedbackStyle:{Light:'light',Medium:'medium'}},startRelatedGoAction:g=>actions.push('long:'+g.id),
  aChange:{fn:()=>actions.push('open')},setLandingDetailsId:()=>actions.push('open'),nextSwipeHintAnim:{interpolate:()=>0},nextSwipeHintStage:0,
  INFO_W:354,uiScaleFactor:scale,handedness:'right',tint:'#f97316',ordinal:'1ª',cardLabel:'TAREA',safeIdx:0,total:1,
  dateStr:'Vie 16/10 · 14:00',dt:new Date('2032-10-16T14:00:00'),receptionNowMs:0,displayContact:name=>name,
  goView:{view:profile,isAdminView:profile==='ADMIN'},operations:{content:React.createElement(View,{testID:'unchanged-controls'},'Taxi · Uber · Bolt · WhatsApp · Cambiar · Aquí · Llamar · Tarde · Ir')},
  PANEL_ACTION_GAP:Math.round(12*scale),PANEL_W:354,headerObstacles:[],nextCardAvailableHeight:availableHeight,LandingCompactBody:shared.LandingCompactBody,LandingCardContents:shared.LandingCardContents};
 vm.createContext(scope);
 // Compile a function so subsequent native measurements/entry changes use current scope values.
 vm.runInContext(compile('exportsRender = () => ('+next.getText(ast)+');'),scope);
 let current={bodyHeight,availableHeight,place,entryType,notes,opened:true};
 function Root(){const [state,set]=React.useState(current);current=state;change=set;
  scope.g={id:'same-appointment',contactName:'Contacto completo',place:state.place,dateISO:'2032-10-16',time:'14:00',type:state.entryType,notes:state.notes};
  scope.cardLabel=entryIsReservation(scope.g)?scope.g.contactName.toUpperCase():'TAREA';
  scope.landingPanels={next:{height:state.availableHeight}};scope.nextCardAvailableHeight=state.availableHeight;
  return React.createElement(View,{testID:'bottom-anchored-panel',style:{position:'absolute',bottom:300}},state.opened&&scope.exportsRender());}
 const container=document.createElement('div'),root=createRoot(container);await settle(()=>root.render(React.createElement(Root)));
 return{container,propsById,actions,headerHeight,footerHeight,scale,get state(){return current;},
  async update(values){await settle(()=>change(old=>({...old,...values})))},async drag(value){await settle(()=>propsById.get('drag')(value))},async press(long=false){await settle(()=>propsById.get('landing-information-frame')[long?'onLongPress':'onPress']())},async close(){await settle(()=>root.unmount())}};
}

for(const profile of profiles)for(const [label,height]of [['two lines',36],['three lines',56],['multiline location',68]])
 test(profile+' / '+label+': natural content has no scroller, fixed height or clipping',async()=>{
  const address=label==='multiline location'?'Calle de Murcia, número 18\nMolina de Segura\nMurcia':'Calle de Murcia';
  const f=await fixture(profile,{bodyHeight:height,place:address});try{
   const body=byId(f.container,'landing-card-body'),frame=byId(f.container,'landing-information-frame'),footer=byId(f.container,'landing-card-operations');
   assert.equal(body.attributes['data-native'],'View');assert.ok(dom(frame).includes(body));
   for(const node of [body,frame]){const style=JSON.parse(node.attributes['data-style']);assert.equal(style.height,undefined);if(node===body)assert.ok(style.maxHeight>=0);else assert.equal(style.maxHeight,undefined);assert.equal(style.overflow,undefined);assert.equal(style.flexShrink,0);}
   assert.ok(f.container.textContent.includes(address));assert.ok(/Contacto completo|CONTACTO COMPLETO/.test(f.container.textContent));
   const actions=byId(f.container,'entry-quick-actions');assert.ok(dom(frame).includes(actions));assert.ok(!dom(footer).includes(actions),'reservation/task quick actions are inside their information card');
   const savedFooter=footer.attributes['data-style'];await f.press();await f.press(true);assert.deepEqual(f.actions,['open','long:same-appointment']);
   await f.update({opened:false});assert.equal(byId(f.container,'landing-information-frame'),undefined);
   await f.update({opened:true});assert.ok(byId(f.container,'landing-information-frame'));assert.equal(byId(f.container,'landing-card-operations').attributes['data-style'],savedFooter);
  }finally{await f.close()}
 });

for(const profile of profiles)test(profile+': measured growth goes upward, controls and orbit anchor do not move',async()=>{
 const f=await fixture(profile,{bodyHeight:36,availableHeight:350});try{
  const panel=byId(f.container,'bottom-anchored-panel'),footer=byId(f.container,'landing-card-operations'),saved=footer.attributes['data-style'];
  const shared=evaluate('components/landing/LandingContentViewport.tsx');
  const heightFor=h=>shared.landingAdaptiveCardSizing({availableHeight:350,headerHeight:f.headerHeight,footerHeight:f.footerHeight,headerGap:0,footerGap:12,frameVerticalInset:27,contentHeight:h});
  const bottom=844-JSON.parse(panel.attributes['data-style']).bottom,footerTop=bottom-f.footerHeight;
  let previousTop=bottom-heightFor(36).naturalHeight;
  for(const height of [56,90,130]){await f.update({bodyHeight:height});const size=heightFor(height);assert.equal(size.scroll,false);const top=bottom-size.naturalHeight;assert.ok(top<previousTop);previousTop=top;
   assert.equal(byId(f.container,'landing-card-body').attributes['data-native'],'View');assert.equal(byId(f.container,'landing-card-operations'),footer);assert.equal(footer.attributes['data-style'],saved);assert.equal(bottom-f.footerHeight,footerTop);assert.equal(JSON.parse(panel.attributes['data-style']).bottom,300);}
 }finally{await f.close()}
});

for(const profile of profiles)test(profile+': compact Landing never creates a vertical scroller, even as available height changes',async()=>{
 const f=await fixture(profile,{bodyHeight:700});try{
  const footer=byId(f.container,'landing-card-operations'),frame=byId(f.container,'landing-information-frame'),body=byId(f.container,'landing-card-body');
  assert.equal(body.attributes['data-native'],'View');assert.ok(JSON.parse(byId(f.container,'landing-card-fixed-frame').attributes['data-style']).maxHeight<=f.state.availableHeight);assert.ok(JSON.parse(body.attributes['data-style']).maxHeight<700);assert.ok(dom(frame).includes(body));assert.ok(!dom(body).includes(frame)&&!dom(body).includes(footer));
  assert.equal(dom(f.container).filter(n=>n.attributes?.['data-native']==='ScrollView').length,0);
  assert.equal(byId(f.container,'landing-card-operations'),footer);assert.equal(byId(f.container,'landing-information-frame'),frame);
  await f.update({availableHeight:1000});assert.equal(byId(f.container,'landing-card-body').attributes['data-native'],'View');assert.equal(byId(f.container,'landing-card-operations'),footer);
  await f.update({bodyHeight:36,availableHeight:278});assert.equal(byId(f.container,'landing-card-body').attributes['data-native'],'View');
 }finally{await f.close()}
});

test('height budget includes measured header, footer, original gaps, padding and both borders',()=>{
 const api=evaluate('components/landing/LandingContentViewport.tsx');
 for(const scale of [.83,1,1.12])for(const availableHeight of [240,278,322,344]){
  const headerHeight=34,footerHeight=2*Math.round(Math.min(80,Math.max(56,64*scale)))+Math.round(6*scale),footerGap=Math.round(12*scale),frameVerticalInset=Math.round(10*scale)+Math.round(14*scale)+3;
  const input={availableHeight,headerHeight,footerHeight,headerGap:0,footerGap,frameVerticalInset,contentHeight:56};
  const size=api.landingAdaptiveCardSizing(input);assert.equal(size.naturalHeight,headerHeight+footerHeight+footerGap+frameVerticalInset+56);assert.equal(size.bodyMaxHeight,Math.max(0,availableHeight-size.chromeHeight));
  assert.equal(size.scroll,56>size.bodyMaxHeight,'large ADMIN must use actual remaining space rather than a fake viewport omitting controls');
 }
});

// Native iPhone capture: no inferred line metrics. The old 280pt reservation left 57.67pt
// for a real 119.67pt body although the physical space above the fixed controls was free.
test('captured native clipping case fits naturally after reserving side controls only where they exist',()=>{
 const api=evaluate('components/landing/LandingContentViewport.tsx');
 const captured={headerHeight:39.33332824707031,footerHeight:144,headerGap:0,footerGap:12,frameVerticalInset:27,contentHeight:119.66665649414062};
 const before=api.landingAdaptiveCardSizing({...captured,availableHeight:280});assert.equal(before.scroll,true);assert.ok(Math.abs(before.bodyMaxHeight-57.66667)<.01);
 const after=api.landingAdaptiveCardSizing({...captured,availableHeight:348,width:354,headerObstacles:[{x:322,y:8,width:32,height:32}]});
 assert.equal(after.scroll,false);assert.equal(after.bodyMaxHeight,121);assert.equal(after.headerLeftInset,0);assert.equal(after.headerRightInset,40);
 assert.ok(Math.abs(after.naturalHeight-342)<.01);assert.ok(after.naturalHeight>280&&after.naturalHeight<348);
 const fixedBottom=413,footerTop=fixedBottom-captured.footerHeight,frameBottom=footerTop-captured.footerGap;
 assert.equal(footerTop,269);assert.equal(frameBottom,257);assert.ok(frameBottom-(captured.contentHeight+27)>40+65+4,'full information clears the QR');
 const panelTop=fixedBottom-after.naturalHeight;assert.ok(panelTop>=65,'respect the actual safe/title boundary');assert.ok(panelTop<133,'real growth uses the previously vacant upper band');
});

for(const [preset,scale]of [['compacto',.83],['estandar',1],['grande',1.12]])for(const profile of profiles)
 test(profile+' / '+preset+': variable screen widths and system text scaling preserve safe growth and fixed controls',()=>{
 const api=evaluate('components/landing/LandingContentViewport.tsx');
 for(const width of [284,339,354,394,714])for(const fontScale of [1,1.3,1.6])for(const hand of ['left','right']){
  const headerHeight=22*fontScale+18,footerHeight=2*Math.round(Math.min(80,Math.max(56,64*scale)))+Math.round(6*scale),footerGap=Math.round(12*scale),frameVerticalInset=Math.round(10*scale)+Math.round(14*scale)+3;
  const control=Math.round(32*scale),obstacle={x:hand==='left'?0:width-control,y:8,width:control,height:control};
  const chrome=headerHeight+footerHeight+footerGap+frameVerticalInset;
  for(const extraSpace of [24,70,180,600])for(const contentHeight of [36,56,120,700].map(n=>n*scale*fontScale)){
   const availableHeight=chrome+extraSpace,result=api.landingAdaptiveCardSizing({availableHeight,width,headerHeight,footerHeight,headerGap:0,footerGap,frameVerticalInset,contentHeight,headerObstacles:[obstacle]});
   assert.equal(result.scroll,contentHeight>result.bodyMaxHeight);const shown=Math.min(contentHeight,result.bodyMaxHeight),top=availableHeight-chrome-shown,frameTop=top+headerHeight;
   assert.ok(top>=-1e-6);assert.ok(frameTop>=obstacle.y+obstacle.height+4-1e-6);
   const headerBottom=top+headerHeight;if(top<obstacle.y+obstacle.height&&headerBottom>obstacle.y){
    if(hand==='left')assert.ok(result.headerLeftInset>=control+8);else assert.ok(result.headerRightInset>=control+8);
   }
   assert.ok(Math.abs(availableHeight-(chrome+shown)+headerHeight+frameVerticalInset+shown+footerGap-(availableHeight-footerHeight))<1e-6,'the operations top is independent of text length');
  }
 }
});

test('all real Home cards reuse the same safe-space helper without changing shared orbit policy',()=>{
 const helper=fs.readFileSync('components/landing/landingPanels.ts','utf8');assert.ok(helper.includes('Math.max(insets.top, titleBottom)'));
 for(const name of ['nextCardSpace','changesCardSpace']){const node=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);assert.ok(node);assert.ok(node.initializer.getText(ast).startsWith('landingAdaptivePanelSpace('));}
 const controls=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='landingHeaderControls').getText(ast);assert.ok(controls.includes('landingInlineHumanity ? [inlineHumanityRect] : []'));
 const viewport=fs.readFileSync('components/landing/LandingContentViewport.tsx','utf8');assert.ok(viewport.includes('flexShrink: adaptiveBody ? 0 : 1'));
 const api=evaluate('components/landing/landingPanels.ts');const bounds=api.landingAdaptivePanelSpace({panel:{x:18,y:133,width:354,height:280},frame:{virtual:false},insets:{top:47},titleBottom:65,controls:[{x:340,y:73,width:32,height:32}]});
 assert.equal(bounds.availableHeight,348);assert.equal(bounds.width,354);assert.equal(bounds.headerObstacles[0].x,322);assert.equal(bounds.headerObstacles[0].y,8);
});
for(const profile of profiles)for(const [preset,scale]of [['compacto',.83],['estandar',1],['grande',1.12],['enorme',1.35]])for(const entryType of ['TAREA','TAREA_INTERNA'])
 test(profile+' / '+preset+' / '+entryType+': actual task description and multiline location share natural upward growth and original actions',async()=>{
  const notes='Descripción completa de la tarea\nSegunda línea de notas\nTercera línea sin truncar',place='Calle de Murcia, Molina de Segura, Murcia\nUbicación completa de la tarea';
  const f=await fixture(profile,{bodyHeight:120,availableHeight:420,scale,entryType,notes,place});try{
   assert.ok(f.container.textContent.includes(notes));assert.ok(f.container.textContent.includes(place));assert.ok(byId(f.container,'landing-task-description'));
   assert.equal(byId(f.container,'landing-card-body').attributes['data-native'],'View');
   const footer=byId(f.container,'landing-card-operations'),style=footer.attributes['data-style'];
   await f.update({bodyHeight:160,notes:notes+'\nCuarta línea'});
   assert.equal(byId(f.container,'landing-card-body').attributes['data-native'],'View');
   assert.equal(byId(f.container,'landing-card-operations'),footer);assert.equal(footer.attributes['data-style'],style);
   await f.press();await f.press(true);assert.deepEqual(f.actions,['open','long:same-appointment']);
   await f.update({opened:false});assert.equal(byId(f.container,'landing-information-frame'),undefined);
   await f.update({opened:true});assert.ok(f.container.textContent.includes(notes));assert.equal(byId(f.container,'landing-card-operations').attributes['data-style'],style);
  }finally{await f.close()}
 });
