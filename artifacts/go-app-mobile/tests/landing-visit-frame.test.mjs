import {test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import vm from'node:vm';import{createRequire}from'node:module';
import{presentation,renderEntryQuickActions,renderEntryMicroActions}from'./helpers/entry-details-fixture.mjs';
const require=createRequire(path.join(process.cwd(),'package.json'));
const{React,createRoot,document,rn,ts,evaluate}=require('./tests/helpers/react-lifecycle.cjs');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];
function walk(n){all.push(n);ts.forEachChild(n,walk);}walk(ast);
const card=all.find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='LandingCardContents'&&n.openingElement.attributes.properties.some(a=>a.name?.getText(ast)==='footer'&&a.initializer?.expression?.getText(ast)==='operations.content'));
const tree=n=>n?[n,...n.childNodes.flatMap(tree)]:[],byId=(root,id)=>tree(root).find(n=>n.attributes?.['data-testid']===id),flatten=s=>Array.isArray(s)?Object.assign({},...s.map(flatten)):s||{};
const settle=async fn=>React.act(async()=>{fn();for(let i=0;i<10;i++)await Promise.resolve();});
test('frozen visit frame surrounds header, essential information and every existing lower action without changing task geometry',async()=>{
 const props=new Map();let fontScale=1,width=284;
 function View(p){if(p.testID)props.set(p.testID,p);if(p.style?.position==='absolute'&&p.onLayout)props.set('outer',p);
  const height=({'landing-card-header':34*fontScale,'landing-card-operations':128,'landing-compact-primary':60*fontScale,'landing-compact-actions':64*fontScale})[p.testID];
  React.useLayoutEffect(()=>{if(height!=null)p.onLayout?.({nativeEvent:{layout:{height,width}}});},[height,width]);
  return React.createElement('div',{'data-testid':p.testID},p.children);}
 const native={...rn,View,Pressable:p=>React.createElement(View,{...p,style:typeof p.style==='function'?p.style({pressed:false}):p.style}),StyleSheet:{create:x=>x,absoluteFill:{position:'absolute',top:0,bottom:0,left:0,right:0}}};
 const shared=evaluate('components/landing/LandingContentViewport.tsx',{'react-native':native});
 const frame=evaluate('components/landing/LandingVisitOutline.tsx',{'react-native':native});
 assert.equal(Object.isFrozen(frame.LANDING_VISIT_FRAME),true);assert.deepEqual(JSON.parse(JSON.stringify(frame.LANDING_VISIT_FRAME)),{bottomGap:8,outset:8,borderWidth:1.5,radius:14});
 const scope={React,View,Animated:{View},Pressable:native.Pressable,TouchableOpacity:View,Text:rn.Text,Feather:()=>null,
  ...frame,...shared,entryIsInternal:presentation.entryIsInternal,entryIsReservation:presentation.entryIsReservation,entryIdentity:presentation.entryIdentity,
  renderEntryQuickActions,renderEntryMicroActions,nextCardPanRef:{panHandlers:{}},nextCardSlideAnim:0,nextCardDeleteConfirm:null,
  nextSwipeHintAnim:{interpolate:()=>0},nextSwipeHintStage:0,safeIdx:0,total:1,tint:'#22c55e',ordinal:'1ª',cardLabel:'SALÓN CON NOMBRE LARGO',
  operations:{content:React.createElement(View,{testID:'existing-lower-actions'},'WhatsApp · Llamar · Cambiar · Aquí · Ir')},
  headerObstacles:[],nextCardAvailableHeight:170,PANEL_ACTION_GAP:12,lang:'es',displayContact:(n,p)=>n||p||'',
  panelSideStyle:{left:18},landingFrame:{virtual:false},screen:{height:844},landingPanels:{next:{y:200,height:300}},contentBottom:x=>x,
  dateStr:'Lun 26/10 · 14:15',dt:new Date('2026-10-26T14:15:00'),receptionNowMs:0};
 vm.createContext(scope);vm.runInContext(ts.transpileModule('renderVisit=()=>('+card.parent.getText(ast)+');',{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,scope);
 const container=document.createElement('div'),root=createRoot(container);
 try{
  for(width of[284,339,354,394])for(const scale of[.83,1,1.12])for(fontScale of[1,1.3,1.6])for(const hand of['left','right']){
   const g={id:'visit-1',type:'GO_BOOKING',kind:'sent',customerBooking:true,reservationId:'r1',contactName:'Salón con nombre largo',estado:'aceptado',time:'14:15',dateISO:'2026-10-26'};
   Object.assign(scope,{g,uiScaleFactor:scale,handedness:hand,INFO_W:width,PANEL_W:width});
   await settle(()=>root.render(scope.renderVisit()));
   const outer=byId(container,'landing-next-visit'),outline=byId(outer,'landing-visit-outline');assert.ok(outline);
   for(const id of['landing-card-header','landing-date-actions-row','entry-quick-actions','existing-lower-actions'])assert.ok(byId(outer,id),id+' stays within the outer frame');
   const style=flatten(props.get('landing-visit-outline').style);assert.equal(style.top,0);assert.equal(style.bottom,0);assert.equal(style.borderWidth,1.5);assert.equal(style.borderColor,'#22c55e');
   assert.equal(style.left,-Math.round(8*scale));assert.equal(style.right,style.left);assert.ok(18+style.left>=6,'outline remains inside the established screen margin');
   assert.equal(props.get('outer').style.paddingBottom,Math.round(8*scale));assert.equal(props.get('outer').style.left,18);assert.equal(props.get('outer').style.bottom,344);
   assert.equal(flatten(props.get('landing-card-body').style).maxHeight,undefined);assert.equal(flatten(props.get('landing-card-fixed-frame').style).maxHeight,undefined);
   assert.equal(props.get('landing-information-frame').style.borderColor,'transparent','there is exactly one visible visit outline');
   assert.equal(props.get('landing-visit-outline').pointerEvents,'none');assert.ok(outer.textContent.includes('14:15'));
  }
  scope.g={id:'task-1',type:'TAREA_INTERNA',kind:'sent',estado:'pendiente',notes:'Hacer la compra',time:'14:15'};
  await settle(()=>root.render(scope.renderVisit()));assert.equal(byId(container,'landing-visit-outline'),undefined);assert.equal(props.get('outer').style.paddingBottom,undefined);
  assert.equal(props.get('landing-information-frame').style.borderColor,'#22c55e','task uses its own unchanged frame color');
 }finally{await settle(()=>root.unmount());}
});
