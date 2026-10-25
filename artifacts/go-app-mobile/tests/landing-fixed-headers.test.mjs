import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,createRoot,document,rn,ts,evaluate}=require('./tests/helpers/react-lifecycle.cjs');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=new Map(),cards=[];let home;
function walk(n){
 if(ts.isFunctionDeclaration(n)&&n.name?.text==='HomeScreenContent')home=n.body;
 if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&!declarations.has(n.name.text))declarations.set(n.name.text,n);
 if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='LandingCardContents')cards.push(n);
 ts.forEachChild(n,walk);
}walk(ast);
const attr=(node,name)=>node.openingElement.attributes.properties.find(p=>p.name?.getText(ast)===name)?.initializer?.expression;
const changes=cards.find(n=>n.getText(ast).includes('renderLandingOperations(item.g).content'));
const next=cards.find(n=>n.getText(ast).includes('{operations.content}'));
const statement=name=>home.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));
const geometry=source.slice(statement('landingOrbitTop').getStart(ast),statement('landingPanelWidth').end);
const names=['isBusinessMode','isUserMode','fullLandingArchitecture','isUserV1Surface','uiScaleFactor','goSize','orbitRadius','orbitBtnSize','orbitWrapSize','microR','microSz','systemBoundingRadius','SYSTEM_MARGIN_X','SYSTEM_MARGIN_Y','dockRight','landingDock','maxX','minX','paddingBottom','LAYOUT','orbitAirGap','bottomReserved'];
const geometrySource=names.map(name=>'const '+declarations.get(name).getText(ast)+';').join('\n')+'\n'+geometry+'\nresult={scale:uiScaleFactor,frame:landingBaseFrame,panels:landingPanels};';
const geometryCode=ts.transpileModule(geometrySource,{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const layout=evaluate('components/landing/landingResponsiveLayout.ts'),policy=evaluate('components/landing/landingPanels.ts'),visibility=evaluate('components/landing/landingV1Visibility.ts');
const profiles=[{name:'ADMIN',view:'ADMIN',owner:true,business:false,preview:false},{name:'USUARIO',view:'USER',owner:true,business:false,preview:false},{name:'EMPRESA',view:'BUSINESS',owner:false,business:true,preview:false},{name:'EMPRESA DEMO',view:'BUSINESS',owner:true,business:false,preview:true}];
function regions(profile,preset,selected='visit',measuredHeight=320){
 const context={...layout,...policy,...visibility,screen:{width:390,height:844-(profile.owner&&profile.view!=='BUSINESS'?22:0)},insets:{top:59,bottom:34,left:0,right:0},
  uiScale:preset,handedness:'right',anyOverlayOpen:false,isActivelyCreating:false,rutasMode:false,requestedBusinessMode:profile.business,businessAccess:{allowed:profile.business},adminAccess:{checking:false},
  goView:{view:profile.view,isAdminView:profile.view==='ADMIN',isBusinessPreview:profile.preview},INTENTS:{length:declarations.get('INTENTS').initializer.elements.length},titleBottomLocalY:67,
  nextAppointment:{},allPendientes:[{}],nextAptMinimized:!['visit','task'].includes(selected),cambiosOpen:selected==='changes',nextAptPanelH:measuredHeight,pendingPanelH:measuredHeight,pendingHeaderH:36,pendingContentH:Math.max(0,measuredHeight-36),landingHelpH:80,transportPanelH:180,anyOperationalPanelOpen:!!selected};
 vm.runInNewContext(geometryCode,context);return JSON.parse(JSON.stringify(context.result));
}
function nodes(node){return node?[node,...node.childNodes.flatMap(nodes)]:[];}
function byId(container,id){return nodes(container).find(n=>n.attributes?.['data-testid']===id);}
const settle=async operation=>React.act(async()=>{if(operation)await operation();for(let i=0;i<12;i++)await Promise.resolve();});
async function fixture(profile,preset,initial,contentHeight){
 const dims=regions(profile,preset,initial),buttons=new Map(),calls=[],measurements=[];let active,select,scroll,bodyMetrics,resize,measuredHeight=contentHeight;
 const View=({children,style,testID,...props})=>React.createElement('div',{'data-testid':testID,'data-layout':JSON.stringify(style??{}),'data-scroll-handler':!!props.onScroll},children);
 // React renders the real shared component. Only the native ScrollView host is
 // simulated: its content offset is clamped as UIKit does with bouncing disabled.
 const ScrollView=props=>{
  const [offset,setOffset]=React.useState(0),viewport=bodyMetrics.viewport;
  scroll=value=>setOffset(Math.max(0,Math.min(value,Math.max(0,measuredHeight-viewport))));
  React.useEffect(()=>{props.onContentSizeChange?.(354,measuredHeight);},[measuredHeight]);
  bodyMetrics={...bodyMetrics,props,offset,maxOffset:Math.max(0,measuredHeight-viewport)};
  return React.createElement('div',{'data-testid':props.testID,'data-offset':offset,'data-layout':JSON.stringify(props.style)},
   React.createElement('div',{'data-native-content':true},props.children));
 };
 const native={...rn,View,ScrollView,TouchableOpacity:props=>{buttons.set(props.testID,props);return React.createElement('button',{'data-testid':props.testID},props.children);}};
 const shared=evaluate('components/landing/LandingContentViewport.tsx',{'react-native':native});
 const commands=evaluate('components/landing/LandingPanelCommands.tsx',{'react-native':native,'./landingPanels':policy});
 const fixtureHeaderHeight=36;
 function Root(){
  const [selected,setSelected]=React.useState(initial);active=selected;select=setSelected;
  const [bodyHeight,setBodyHeight]=React.useState(contentHeight);measuredHeight=bodyHeight;resize=setBodyHeight;
  const renderDims=regions(profile,preset,selected,bodyHeight);
  const headerGap=selected==='changes'?Math.round(4*renderDims.scale):0;
  bodyMetrics={...bodyMetrics,viewport:Math.max(0,renderDims.panels.region.height-fixtureHeaderHeight-headerGap)};
  const header=React.createElement('span',{'data-header-content':true,onClick:()=>calls.push('header:'+selected)},'Indicador '+selected);
  const content=React.createElement('div',{'data-panel':selected},React.createElement('button',{'data-testid':'first-detail',onClick:()=>calls.push('first')},'Primer detalle'),
   React.createElement('div',{'data-long-content':true},'Contenido conservado'),React.createElement('button',{'data-testid':'last-detail',onClick:()=>calls.push('last')},'Último detalle'));
  return React.createElement(shared.LandingContentViewport,{frame:renderDims.frame,closingGesture:{}},
   React.createElement(commands.LandingPanelCommands,{frame:renderDims.panels.commands,commands:['changes','visit','task'].map(key=>({key,heading:key,title:key,count:1,color:'#60a5fa',expanded:selected===key,onPress:()=>setSelected(selected===key?null:key),onLongPress:()=>calls.push('long:'+key)}))}),
   selected&&React.createElement(View,{testID:'original-card-bounds',style:{maxHeight:renderDims.panels.region.height}},
    React.createElement(shared.LandingCardContents,{header,headerGap,overflowing:false,onHeight:value=>measurements.push(value),contentContainerStyle:{gap:12}},content)));
 }
 const container=document.createElement('div'),root=createRoot(container);await settle(()=>root.render(React.createElement(Root)));
 return{container,dims,buttons,calls,measurements,get body(){return bodyMetrics;},get active(){return active;},
  async resize(value){await settle(()=>resize(value));},async drag(value){await settle(()=>scroll(value));},async choose(value){await settle(()=>select(value));},
  async press(key){await settle(()=>buttons.get('landing-command-'+key).onPress());},
  async close(){await settle(()=>root.unmount());}};
}

test('both actual Home cards supply a fixed header and remove it from scrolling children',()=>{
 assert.equal(cards.length,2);assert.ok(next&&changes);
 for(const card of cards){const header=attr(card,'header');assert.ok(header,'each actual card must use the same fixed-header contract');
  const body=card.children.map(n=>n.getText(ast)).join('');
  assert.ok(!body.includes('INDICADOR DE POSICIÓN'));assert.ok(!body.includes('const _ordSuffix'));
  assert.ok(!/goView\.view|isAdminView|isBusinessMode|isUserMode/.test(header.getText(ast)),'no profile-specific gesture branch');
 }
 for(const card of cards){
  assert.ok(attr(card,'footer'),'the complete operations group is a fixed sibling');
  assert.ok(!card.children.map(n=>n.getText(ast)).join('').includes('operations.content'));
  assert.ok(!card.children.map(n=>n.getText(ast)).join('').includes('renderLandingOperations(item.g).content'));
 }
 assert.ok(attr(next,'header').getText(ast).includes('nextCardPanRef.panHandlers'));
 assert.ok(attr(next,'bodyFrame').getText(ast).includes('nextCardPanRef.panHandlers'),'the fixed information frame retains the existing horizontal gesture');
 assert.equal(attr(changes,'headerGap').getText(ast),'Math.round(4 * uiScaleFactor)');
 assert.equal(attr(next,'headerGap'),undefined,'next header stays adjacent to the info card');
 assert.ok(changes.parent.openingElement.getText(ast).includes('cambiosCardPanRef.panHandlers'));
});

for(const profile of profiles)for(const preset of ['compacto','estandar','grande'])for(const panel of ['visit','task','changes'])
 test(`${profile.name} / ${preset} / ${panel}: scrolling long content moves only its body`,async()=>{
  const f=await fixture(profile,preset,panel,860);try{
   const header=byId(f.container,'landing-card-header'),body=byId(f.container,'landing-card-body'),row=byId(f.container,'landing-panel-commands'),shell=byId(f.container,'landing-card-fixed-frame');
   assert.ok(header&&body&&row&&shell);assert.equal(header.parentNode,shell);assert.equal(body.parentNode,shell);
   assert.ok(!nodes(body).includes(header));assert.ok(!nodes(body).includes(row));
   assert.equal(JSON.parse(header.attributes['data-layout']).flexShrink,0);
   const savedHeader=header.attributes['data-layout'],savedRow=row.attributes['data-layout'];
   assert.ok(f.body.viewport>44,'body viewport remains usable in the compared portrait fixtures');
   await f.drag(2000);assert.equal(f.body.offset,f.body.maxOffset);assert.ok(f.body.offset>0);
   assert.equal(byId(f.container,'landing-card-header'),header);assert.equal(header.attributes['data-layout'],savedHeader);
   assert.equal(byId(f.container,'landing-panel-commands'),row);assert.equal(row.attributes['data-layout'],savedRow);
   assert.equal(nodes(body).filter(n=>n.attributes?.['data-testid']==='last-detail').length,1);
   // At maximum native content offset the final control reaches the viewport bottom.
   assert.equal(860-f.body.offset,f.body.viewport);assert.equal(f.body.props.scrollEnabled,undefined);
   assert.equal(f.body.props.bounces,false);assert.equal(f.body.props.alwaysBounceVertical,false);assert.equal(f.body.props.overScrollMode,'never');
   assert.equal(f.body.props.style.overflow,'hidden');assert.deepEqual(f.measurements,[860]);
   await f.drag(-100);assert.equal(f.body.offset,0);assert.equal(header.attributes['data-layout'],savedHeader);
   for(const key of ['changes','visit','task']){await f.press(key);assert.equal(row.attributes['data-layout'],savedRow);}
   await f.choose(null);assert.equal(byId(f.container,'landing-card-header'),undefined);assert.equal(byId(f.container,'landing-panel-commands'),row);
   for(const key of ['changes','visit','task'])f.buttons.get('landing-command-'+key).onLongPress();assert.deepEqual(f.calls,['long:changes','long:visit','long:task']);
  }finally{await f.close();}
 });

for(const profile of profiles)test(`${profile.name}: short bodies have no bounce and keep header/body spacing`,async()=>{
 for(const panel of ['visit','task','changes']){
  const f=await fixture(profile,'estandar',panel,60);try{
   const header=byId(f.container,'landing-card-header'),row=byId(f.container,'landing-panel-commands');
   assert.ok(header);await f.drag(100);assert.equal(f.body.offset,0);await f.drag(-100);assert.equal(f.body.offset,0);
   const style=JSON.parse(byId(f.container,'landing-card-fixed-frame').attributes['data-layout']);
   assert.equal(JSON.parse(header.attributes['data-layout']).marginBottom,panel==='changes'?4:0,'the existing header/body separation is reserved by the fixed header');assert.equal(style.minHeight,0);assert.equal(style.flexShrink,1);
   const rowStyle=row.attributes['data-layout'];await f.choose(null);assert.equal(row.attributes['data-layout'],rowStyle);
   const closed=regions(profile,'estandar',null);assert.deepEqual(closed.panels.commands,f.dims.panels.commands);
  }finally{await f.close();}
 }
});

test('body-only and natural-height consumers retain their original contract',()=>{
 const react={createElement:(type,props,...children)=>({type,props:props||{},children})};const scope={exports:{},require:n=>n==='react'?react:n==='react-native'?{View:'View',ScrollView:'ScrollView',StyleSheet:{absoluteFill:{}}}:undefined};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/landing/LandingContentViewport.tsx','utf8'),{compilerOptions:{ alwaysStrict: false,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,scope);
 const api=scope.exports,children={preserve:true},style={gap:12},heights=[];
 const props={overflowing:false,onHeight:h=>heights.push(h),contentContainerStyle:style,children};
 const body=api.LandingCardContents(props);assert.equal(body.type,'ScrollView');assert.equal(body.children[0],children);assert.equal(body.props.contentContainerStyle,style);body.props.onContentSizeChange(354,500);
 const natural=api.LandingCardContents({...props,overflowing:true});assert.equal(natural.type,'View');natural.props.onLayout({nativeEvent:{layout:{height:400}}});assert.deepEqual(heights,[500,400]);
});

for(const profile of profiles)test(profile.name+': changed body measurements never move the header or minimized commands',async()=>{
 for(const panel of ['visit','task','changes']){
  const f=await fixture(profile,'estandar',panel,60);try{
   const header=byId(f.container,'landing-card-header'),row=byId(f.container,'landing-panel-commands');
   const headerStyle=header.attributes['data-layout'],rowStyle=row.attributes['data-layout'];
   for(const height of [860,240,1200,60]){
    await f.resize(height);await f.drag(20000);
    assert.equal(byId(f.container,'landing-card-header'),header);
    assert.equal(byId(f.container,'landing-panel-commands'),row);
    assert.equal(header.attributes['data-layout'],headerStyle);
    assert.equal(row.attributes['data-layout'],rowStyle);
    assert.equal(f.body.offset,Math.max(0,height-f.body.viewport));
    assert.equal(f.measurements.at(-1),height);
   }
  }finally{await f.close();}
 }
});

for(const profile of profiles)test(profile.name+': visit/task transitions reuse the body and retain reachable content',async()=>{
 const f=await fixture(profile,'estandar','visit',860);try{
  const header=byId(f.container,'landing-card-header'),body=byId(f.container,'landing-card-body'),row=byId(f.container,'landing-panel-commands'),shell=byId(f.container,'landing-card-fixed-frame');
  const headerStyle=header.attributes['data-layout'],rowStyle=row.attributes['data-layout'];
  await f.drag(120);assert.ok(f.body.offset>0);
  for(const selected of ['task','visit','task']){
   await f.press(selected);assert.equal(f.active,selected);
   assert.equal(byId(f.container,'landing-card-body'),body,'switch category without replacing the native body');
   assert.equal(byId(f.container,'landing-card-fixed-frame'),shell);assert.equal(byId(f.container,'landing-card-header'),header);
   assert.equal(byId(f.container,'landing-panel-commands'),row);
   assert.equal(header.textContent,'Indicador '+selected);
   assert.equal(header.attributes['data-layout'],headerStyle);assert.equal(row.attributes['data-layout'],rowStyle);
   assert.equal(nodes(body).filter(n=>n.attributes?.['data-panel']===selected).length,1,'the reused body renders the selected category');
   for(const id of ['first-detail','last-detail'])assert.equal(nodes(body).filter(n=>n.attributes?.['data-testid']===id).length,1);
   // A category change may preserve or reset its offset; both ends must stay reachable.
   await f.drag(20000);assert.equal(f.body.offset,f.body.maxOffset);assert.equal(860-f.body.offset,f.body.viewport);
   await f.drag(-100);assert.equal(f.body.offset,0);
   assert.equal(byId(f.container,'landing-card-header'),header);assert.equal(header.attributes['data-layout'],headerStyle);
  }
 }finally{await f.close();}
});
