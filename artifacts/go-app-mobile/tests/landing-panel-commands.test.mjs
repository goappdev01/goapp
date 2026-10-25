import { priorLandingPosition } from './helpers/landing-anchor-baseline.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json'));
const ts=require('typescript');
const {React,createRoot,document,rn}=require('./tests/helpers/react-lifecycle.cjs');
function load(file,imports={}){const ctx={exports:{},require:n=>n==='react'?React:n==='react-native'?rn:imports[n]};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{ alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,ctx);return ctx.exports;}
const policy=load('components/landing/landingPanels.ts'),layout=load('components/landing/landingResponsiveLayout.ts'),humanity=load('components/landing/humanityPlacement.ts');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const protectedBaselines=JSON.parse(fs.readFileSync(new URL('./helpers/landing-protected-baselines.json',import.meta.url),'utf8'));
// Compare the exact frozen contract for the base or the separately approved session package.
const hasSessionPackage=source.includes('import { recordAuthTrace } from "@/lib/authTrace";');
function find(n,p){if(p(n))return n;let r;ts.forEachChild(n,c=>{if(!r)r=find(c,p)});return r;}
const declarations=new Map(); const declaration=name=>{if(!declarations.has(name))declarations.set(name,find(ast,n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name));return declarations.get(name)};
const commandsNode=find(ast,n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='LandingPanelCommands');
assert.ok(commandsNode);
const commandsExpression=commandsNode.attributes.properties.find(p=>p.name?.getText(ast)==='commands').initializer.expression.getText(ast);

// Mount the real command component with the exact hooks and callbacks from HomeScreen.
// Native controls are hosts; no backend, credentials, storage or device operations are used.
async function mountCommands(counts){
 const buttons=new Map();
 const native={...rn,View:props=>React.createElement('div',{'data-testid':props.testID,'data-layout':JSON.stringify(props.style)},props.children),TouchableOpacity:props=>{buttons.set(props.testID,props);return React.createElement('button',{'data-testid':props.testID,disabled:props.disabled},props.children)}};
 const ctx={exports:{},require:n=>n==='react'?React:n==='react-native'?native:n==='./landingPanels'?policy:undefined};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/landing/LandingPanelCommands.tsx','utf8'),{compilerOptions:{ alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,ctx);
 let state,clean;const actions=[],animations=[];
 Object.assign(ctx,{useState:React.useState,React,LandingPanelCommands:ctx.exports.LandingPanelCommands,
  capture:v=>state=v,captureClean:fn=>clean=fn,nextGroups:{visit:[{g:{id:'visit-1',type:'GO_BOOKING',color:'#60a5fa'}}],task:[{g:{id:'task-1',type:'TAREA',color:'#a855f7'}},{g:{id:'task-2',type:'TAREA_INTERNA',color:'#a855f7'}}]},allPendientes:[{kind:'cambio',g:{id:'change-1'}}],
  t:k=>({next_fem:'PRÓXIMA',word_visit:'visita',task:'TAREA'})[k]??k,readableOnDark:c=>c,intent:{color:'#ffffff'},
  LayoutAnimation:{configureNext(){animations.push(true)},Presets:{easeInEaseOut:{}}},Haptics:{selectionAsync:()=>Promise.resolve(),impactAsync:()=>Promise.resolve(),ImpactFeedbackStyle:{Medium:'medium'}},startRelatedGoAction:g=>actions.push(g.id)});
 const hooks=['nextAptMinimized','nextPanelKind','cambiosOpen','nextCardIdx','cambiosCardIdx'].map(name=>'const '+find(ast,n=>ts.isVariableDeclaration(n)&&ts.isArrayBindingPattern(n.name)&&n.name.elements[0]?.name.getText(ast)===name).getText(ast)+';').join('\n');
 const closePanels=find(declaration('closeTopLayer'),n=>ts.isIfStatement(n)&&n.expression.getText(ast)==='!nextAptMinimized || cambiosOpen');assert.ok(closePanels);
 const fixture=`function Fixture(){clearButtons();${hooks}\n capture({nextAptMinimized,nextPanelKind,cambiosOpen,nextCardIdx});captureClean(()=>{${closePanels.getText(ast)}});return React.createElement(LandingPanelCommands,{frame:{x:18,y:350,width:354,height:46},commands:${commandsExpression}});}exports.Fixture=Fixture;`;
 vm.runInNewContext(ts.transpileModule(fixture,{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,ctx);
 const makeEntries=counts=>{
  ctx.nextGroups={visit:Array.from({length:counts.visit},(_,i)=>({g:{id:'visit-'+(i+1),type:'GO_BOOKING',color:'#60a5fa'}})),task:Array.from({length:counts.task},(_,i)=>({g:{id:'task-'+(i+1),type:'TAREA',color:'#a855f7'}}))};
  ctx.allPendientes=Array.from({length:counts.changes},(_,i)=>({kind:'cambio',g:{id:'change-'+(i+1)}}));
 };
 ctx.clearButtons=()=>buttons.clear();
 if(counts)makeEntries(counts);
 const container=document.createElement('div'),root=createRoot(container);
 await React.act(()=>root.render(React.createElement(ctx.exports.Fixture)));
 return {get state(){return state},buttons,actions,animations,container,update:async counts=>{makeEntries(counts);await React.act(()=>root.render(React.createElement(ctx.exports.Fixture)))},clean:async()=>React.act(()=>clean()),press:async key=>{const b=buttons.get('landing-command-'+key);assert.ok(b&&!b.disabled);await React.act(()=>b.onPress())},close:async()=>React.act(()=>root.unmount())};
}
// Commands toggle themselves; selecting another command still opens it exclusively.
for(const first of ['changes','visit','task'])for(const second of ['changes','visit','task'])
 test(first+' -> '+second+': toggle the same panel or open another exclusively',async()=>{
 const f=await mountCommands();try{
  let active=null;
  for(const key of [first,second]){
   active=active===key?null:key;
   await f.press(key);
   assert.equal(f.state.cambiosOpen,active==='changes');
   assert.equal(f.state.nextAptMinimized,active===null||active==='changes');
   if(key!=='changes')assert.equal(f.state.nextPanelKind,key);
   for(const name of ['changes','visit','task'])assert.equal(f.buttons.get('landing-command-'+name).accessibilityState.expanded,name===active);
   assert.equal(f.buttons.size,3,'all minimized commands remain mounted');
  }
  assert.equal(f.animations.length,0,'opening must not animate/reorganize the whole Landing');
 }finally{await f.close()}
});
test('the existing clean/close branch minimizes all three controls after any sequence',async()=>{
 const f=await mountCommands();try{
  for(const key of ['changes','visit','task','task','changes','visit']){
   await f.press(key);await f.clean();
   assert.equal(f.state.cambiosOpen,false);assert.equal(f.state.nextAptMinimized,true);
   for(const name of ['changes','visit','task'])assert.equal(f.buttons.get('landing-command-'+name).accessibilityState.expanded,false);
  }
 }finally{await f.close()}
});
test('three separate labels, counts and long press targets are preserved',async()=>{const f=await mountCommands();try{
 assert.equal(f.buttons.get('landing-command-visit').accessibilityLabel,'PRÓXIMA VISITA');assert.equal(f.buttons.get('landing-command-task').accessibilityLabel,'PRÓXIMA TAREA');assert.equal(f.buttons.get('landing-command-changes').accessibilityLabel,'CAMBIOS PROPUESTOS');
 for(const key of ['visit','task','changes']){const b=f.buttons.get('landing-command-'+key);assert.equal(b.delayLongPress,500);b.onLongPress()};assert.deepEqual(f.actions,['visit-1','task-1','change-1']);
}finally{await f.close()}});
test('task classification uses stable types, preserves order/references and never duplicates a record',()=>{
 const records=[{g:{id:'v1',type:'GO_BOOKING'}},{g:{id:'t1',type:'TAREA'}},{g:{id:'v2',type:'GO_INTERNO'}},{g:{id:'t2',type:'TAREA_INTERNA'}}];
 const groups=policy.splitLandingAppointments(records);assert.deepEqual(Array.from(groups.visit,r=>r.g.id),['v1','v2']);assert.deepEqual(Array.from(groups.task,r=>r.g.id),['t1','t2']);assert.equal(groups.visit[0],records[0]);assert.equal(groups.task[0],records[1]);assert.equal(new Set([...groups.visit,...groups.task]).size,records.length);
 const active=declaration('activeApt');for(const kind of ['visit','task'])for(const safeIdx of [0,1])assert.equal(vm.runInNewContext(active.initializer.getText(ast),{nextPanelAppointments:groups[kind],safeIdx}),groups[kind][safeIdx]);
});
const devices=[{width:320,height:568,insets:{top:20,bottom:0,left:0,right:0}},{width:375,height:667,insets:{top:20,bottom:0,left:0,right:0}},{width:390,height:822,insets:{top:59,bottom:34,left:0,right:0}},{width:430,height:910,insets:{top:59,bottom:34,left:0,right:0}},{width:844,height:368,insets:{top:0,bottom:21,left:44,right:44}},{width:568,height:298,insets:{top:0,bottom:21,left:44,right:44}}];
for(const preset of ['compacto','estandar','grande'])for(const user of [true,false])test(`${preset} / ${user?'particular':'empresa'}: fixed dock, three commands and the same region in every panel state`,()=>{
 for(const d of devices){
  const scale=layout.fitLandingScale(preset,d.width,d.height,d.insets),r=Math.round(99*scale),btn=Math.round(65*scale),microR=r+Math.round(35*scale),microSz=Math.round(50*scale),go=Math.round(128*scale),wrap=2*(r+btn/2)+12,bound=Math.max(r+btn/2,microR+microSz/2),dockRight=preset==='estandar'?-1:5;
  const keys=user?['bell','list','calendar','settings','mas']:Object.keys(layout.LANDING_SATELLITE_DEGREES);
  const dock=layout.landingDockBounds({...d,dockRight,boundingRadius:bound,wrapSize:wrap,satelliteRadius:microR,satelliteSize:microSz,visibleSatelliteKeys:keys,orbitRadius:r,orbitButtonSize:btn,orbitVisible:!user,goSize:go});
  const bindings={screen:d,insets:d.insets,SYSTEM_MARGIN_Y:6,orbitWrapSize:wrap,landingDock:dock,goSize:go,orbitRadius:r,orbitBtnSize:btn,microR,microSz};
  const orbitTop=vm.runInNewContext(declaration('landingOrbitTop').initializer.getText(ast),bindings);
  const baseline=vm.runInNewContext(declaration('landingBaseline').initializer.getText(ast),{...bindings,landingOrbitTop:orbitTop,landingCloseRect:{y:d.height-(d.insets.bottom+4+(preset==='compacto'?2:preset==='estandar'?6:12)+wrap-50)-40}});
  const frame=layout.landingContentFrame({...d,safeTop:d.insets.top+12,baseline,naturalHeight:1000,boundingRadius:bound,handedness:'right',controlSize:Math.max(44,Math.round(32*scale),!user?Math.round(56*scale)+16-20:0)});
  assert.equal(frame.scroll,false);
  const initial=policy.landingPanelFrames({frame,screenHeight:d.height,insets:frame.virtual?{left:0,right:0}:d.insets});
  for(const nextOpen of [false,true])for(const changesOpen of [false,true]){
   const panels=policy.landingPanelFrames({frame,screenHeight:d.height,insets:frame.virtual?{left:0,right:0}:d.insets,nextOpen,changesOpen});
   for(const _topFloor_screen of [0,300,1000]){const ctx={anyOverlayOpen:false,landingDock:dock,_topFloor_screen,_anchorContainerY:10,insets:d.insets};assert.equal(vm.runInNewContext(declaration('minY').initializer.getText(ast),ctx),dock.maxY);assert.equal(vm.runInNewContext(declaration('maxY').initializer.getText(ast),ctx),dock.maxY);}
   const slots=policy.landingCommandSlots(panels.commands);assert.equal(slots.length,3);
   for(const slot of slots){assert.ok(slot.width>=44&&slot.height>=44);assert.ok(slot.x>=0&&slot.x+slot.width<=panels.commands.width+1e-8);assert.ok(slot.y+slot.height<=panels.commands.height);}
   for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)assert.ok(!humanity.overlapsHumanity(slots[i],slots[j],0));
   if(!frame.virtual)assert.ok(panels.commands.y+panels.commands.height<=orbitTop-12+1e-8,'commands clear every orbital button');else assert.ok(panels.commands.y+panels.commands.height<=frame.height);
   for(const [open,p] of [[nextOpen,panels.next],[changesOpen,panels.changes]])if(open){assert.ok(p.height>=44,`usable panel ${JSON.stringify({preset,d,p,frame})}`);assert.equal(p.width,panels.commands.width);assert.ok(p.y>=(frame.virtual?0:frame.top)-1e-8);assert.ok(p.y+p.height<=panels.commands.y-8+1e-8);}
   assert.equal(panels.next,panels.changes,'exactly the same shared rectangle');
   assert.equal(panels.region,panels.next);
   assert.deepEqual(panels.commands,initial.commands,'commands never move');
   assert.deepEqual(panels.region,initial.region,'region never resizes when switching or minimizing');
  }
 }
});
test('auth wrapper and existing card gesture/actions remain unchanged from the protected visual backup',()=>{
 const before=protectedBaselines.commands;
 for(const name of ['HomeScreen','buildNextAptActions','nextCardPanRef','cambiosCardPanRef','wrapOrbital']){
  const get=a=>find(a,n=>ts.isFunctionDeclaration(n)&&n.name?.text===name||ts.isVariableDeclaration(n)&&n.name.getText(a)===name)?.getText(a);
  assert.ok(get(ast));assert.equal(priorLandingPosition(get(ast)),name==='HomeScreen'&&!hasSessionPackage?protectedBaselines.base.HomeScreen:before[name],name);
 }
});
test('Humanity header fallback avoids commands, panels and QR on both thumb sides',()=>{
 const rect=declaration('inlineHumanityRect'),control=find(declaration('landingBaseFrame'),n=>ts.isPropertyAssignment(n)&&n.name.getText(ast)==='controlSize');assert.ok(rect&&control);
 for(const d of devices)for(const preset of ['compacto','estandar','grande'])for(const handedness of ['left','right']){
  const scale=layout.fitLandingScale(preset,d.width,d.height,d.insets),width=Math.max(62,Math.round(52*scale)+10);
  const actual=vm.runInNewContext('('+rect.initializer.getText(ast)+')',{handedness,insets:d.insets,screen:d,inlineHumanityWidth:width,uiScaleFactor:scale});
  const controlSize=vm.runInNewContext(control.initializer.getText(ast),{uiScaleFactor:scale,fullLandingArchitecture:true});
  const safeTop=d.insets.top+12,frameTop=safeTop+controlSize+8;
  assert.ok(actual.x>=d.insets.left&&actual.x+actual.width<=d.width-d.insets.right);assert.equal(actual.y,d.insets.top);assert.ok(actual.y+actual.height<=frameTop);
  const qrSize=Math.round(32*scale),qr={x:handedness==='right'?d.width-d.insets.right-18-qrSize:d.insets.left+18,y:safeTop,width:qrSize,height:qrSize};
  assert.ok(!humanity.overlapsHumanity(actual,qr,0));
 }
 const outside=source.indexOf('landingInlineHumanity && renderLandingHumanity(inlineHumanityRect)');assert.ok(outside>0&&outside<source.indexOf('<LandingContentViewport '));
});
test('one shared transport strip serves both bounded cards, with unchanged targets',()=>{
 assert.equal((source.match(/label: "Taxi"/g)||[]).length,1);assert.equal((declaration("transportControls").getText(ast).match(/key=\{op.label\}/g)||[]).length,1);
 const transport=declaration('transportControls');assert.ok(transport);
 const shared=declaration('renderLandingOperations');assert.ok(shared&&shared.getText(ast).includes('actionRows.map')&&shared.getText(ast).includes('{transportControls}'));
 for(const call of ['{operations.content}','{item.kind === "cambio" && renderLandingOperations(item.g).content}']){
  const body=find(ast,n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='LandingCardContents'&&n.getText(ast).includes(call));assert.ok(body,'each card contains the shared renderer in its bounded viewport');
 }

 const handler=a=>{const attr=find(a,n=>ts.isJsxAttribute(n)&&n.name.getText(a)==='onPress'&&n.initializer?.getText(a).includes('op.url'));return ts.createPrinter().printNode(ts.EmitHint.Expression,attr.initializer.expression,a);};
 assert.equal(handler(ast),protectedBaselines.commandsTransportHandler);
});
test('Humanity reserves one fixed region regardless of the expanded panel',()=>{
 const blocks=declaration('humanityBlocks').initializer.getText(ast);
 for(const flag of ['cambiosOpen','nextAptMinimized','humanityPanelOpen','landingHasChanges'])assert.ok(!blocks.includes(flag));
 const close={x:20,y:500,width:40,height:40},commands={x:18,y:450,width:354,height:46},region={x:18,y:120,width:354,height:320};
 const actual=vm.runInNewContext(blocks,{landingCloseRect:close,toLandingRootRect:r=>r,landingPanels:{commands,region}});
 assert.equal(actual.length,3);assert.equal(actual[0],close);assert.equal(actual[1],commands);assert.equal(actual[2],region);
});
test('renderer guards cannot display two panels even if legacy state has both flags open',()=>{
 const opening=find(ast,n=>ts.isJsxOpeningElement(n)&&n.attributes.properties.some(a=>a.name?.getText(ast)==='key'&&a.initializer?.getText(ast)==='"proxima-abs-block"'));assert.ok(opening);
 let expr=opening;while(!ts.isJsxExpression(expr))expr=expr.parent;
 const text=expr.expression.getText(ast),next=text.slice(0,text.indexOf('(() =>'))+'true';
 const bindings={nextAppointment:{},anyOverlayOpen:false,isActivelyCreating:false,nextAptMinimized:false,rutasMode:false,cambiosOpen:true};
 assert.equal(vm.runInNewContext(next,bindings),false);
 assert.equal(vm.runInNewContext(next,{...bindings,cambiosOpen:false}),true);
});

// Render actual controls for every combination, including data arriving after hydration.
for(let mask=0;mask<8;mask++)for(const count of [1,3])test('actual counts: category mask '+mask+', '+count+' records',async()=>{
 const keys=['changes','visit','task'],counts=Object.fromEntries(keys.map((key,i)=>[key,mask&(1<<i)?count:0]));
 const f=await mountCommands(counts);try{
  const visible=keys.filter(key=>counts[key]>0);
  assert.deepEqual([...f.buttons.keys()],visible.map(key=>'landing-command-'+key));
  if(!visible.length){assert.equal(f.container.childNodes.length,0,'no empty command container');return;}
  const row=f.container.firstChild;
  assert.equal(row.childNodes.length,visible.length,'no hidden slots between commands');
  for(const [index,key] of visible.entries()){
   const box=JSON.parse(row.childNodes[index].attributes['data-layout']);
   assert.equal(box.left,policy.landingCommandSlots({width:354})[index].x);
   assert.equal(box.width,policy.landingCommandSlots({width:354})[index].width);
   assert.equal(box.height,46,'approved touch height');
   assert.equal(row.childNodes[index].childNodes.length,count>1?2:1,'existing count badge only for multiple records');
   if(count>1)assert.ok(row.childNodes[index].textContent.endsWith(String(count)));
   await f.press(key);assert.ok(f.buttons.has('landing-command-'+key),'button remains while panel is open');
   assert.equal(f.buttons.get('landing-command-'+key).accessibilityState.expanded,true);
   await f.press(key);assert.equal(f.buttons.get('landing-command-'+key).accessibilityState.expanded,false);
  }
 }finally{await f.close()}
});

test('first committed card appears automatically, empty categories disappear and refresh keeps current controls',async()=>{
 const f=await mountCommands({changes:0,visit:0,task:0});try{
  assert.equal(f.buttons.size,0);
  for(const key of ['changes','visit','task']){
   const counts={changes:0,visit:0,task:0,[key]:1};
   await f.update(counts);await f.press(key);
   assert.equal(f.buttons.size,1);assert.equal(f.buttons.get('landing-command-'+key).accessibilityState.expanded,true);
   await f.update({...counts,[key]:3});
   assert.equal(f.buttons.get('landing-command-'+key).accessibilityState.expanded,true,'committed update preserves the open panel');
   await f.clean();await f.update({changes:0,visit:0,task:0});assert.equal(f.buttons.size,0);
  }
 }finally{await f.close()}
});

test('an unfinished or failed HOLD refresh does not clear loaded cards or substitute demo counts',async()=>{
 let resolve,reject;const updates=[];
 const ctx={useCallback:fn=>fn,isBusinessMode:true,getBookings:()=>new Promise((yes,no)=>{resolve=yes;reject=no}),holdPrevCountRef:{current:2},holdSoundCooldownRef:{current:false},holdSoundEnabledRef:{current:false},setHoldBookings:items=>updates.push(items)};
 const refresh=vm.runInNewContext(declaration('refreshHoldBookings').initializer.getText(ast),ctx);
 const pending=refresh();assert.equal(updates.length,0,'pending is not an empty successful response');
 reject(Error('offline'));await pending;assert.equal(updates.length,0,'failed reads retain committed cards');
 const retry=refresh();resolve([]);await retry;assert.equal(updates.length,1);assert.equal(updates[0].length,0,'a successful empty result can hide the button');
 const attrs=commandsExpression;
 for(const expression of ['nextGroups.visit.length','nextGroups.task.length','allPendientes.length'])assert.ok(attrs.includes('count: '+expression));
});
