import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{React,createRoot,document,evaluate,rn}=require('./helpers/react-lifecycle.cjs'),ts=require('typescript');
const policy=evaluate('components/landing/landingPanels.ts');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(n,p){if(p(n))return n;let result;ts.forEachChild(n,c=>{if(!result)result=find(c,p)});return result;}
const command=find(ast,n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='LandingPanelCommands');
const expression=command.attributes.properties.find(p=>p.name?.getText(ast)==='commands').initializer.expression.getText(ast);
const stateNames=['landingActionsOpen','nextAptMinimized','nextPanelKind','cambiosOpen','nextCardIdx','cambiosCardIdx'];
const hooks=stateNames.map(name=>'const '+find(ast,n=>ts.isVariableDeclaration(n)&&ts.isArrayBindingPattern(n.name)&&n.name.elements[0]?.name.getText(ast)===name).getText(ast)+';').join('\n');
const close=find(ast,n=>ts.isIfStatement(n)&&n.expression.getText(ast)==='!nextAptMinimized || cambiosOpen || landingActionsOpen').getText(ast);
async function mountSelectors(){
 const buttons=new Map();let state,clean;
 const native={...rn,TouchableOpacity:p=>{buttons.set(p.testID,p);return React.createElement('button',{},p.children)}};
 const ui=evaluate('components/landing/LandingPanelCommands.tsx',{'react-native':native,'./landingPanels':policy});
 const ctx={exports:{},React,useState:React.useState,LandingPanelCommands:ui.LandingPanelCommands,lang:'es',
  actionCompletion:{unresolved:[{id:'a'},{id:'b'}],pending:[]},landingHasActionSelector:true,
  nextGroups:{visit:[{g:{id:'v'}}],task:[{g:{id:'t'}}]},allPendientes:[{kind:'cambio',g:{id:'c'}}],
  LANDING_VISIT_VISUAL:{color:'#facc15'},readableOnDark:x=>x,intent:{color:'#fff'},t:x=>({next_fem:'PRÓXIMA',word_visit:'VISITA',task:'TAREA'})[x],
  Haptics:{selectionAsync:()=>Promise.resolve()},capture:s=>state=s,captureClose:f=>clean=f};
 vm.runInNewContext(ts.transpileModule(`function Host(){${hooks}capture({landingActionsOpen,nextAptMinimized,cambiosOpen,nextPanelKind});captureClose(()=>{${close}});return React.createElement(LandingPanelCommands,{frame:{x:18,y:300,width:354,height:100},commands:${expression}})}exports.Host=Host;`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,ctx);
 const container=document.createElement('div'),root=createRoot(container);await React.act(()=>root.render(React.createElement(ctx.exports.Host)));
 return{buttons,container,get state(){return state},press:async key=>React.act(()=>buttons.get('landing-command-'+key).onPress()),clean:async()=>React.act(()=>clean()),close:async()=>React.act(()=>root.unmount()),update:async()=>React.act(()=>root.render(React.createElement(ctx.exports.Host))),ctx};
}
test('the same selectors open actions exclusively, toggle and close through existing navigation; real badge updates',async()=>{
 const f=await mountSelectors();try{
  assert.equal(f.buttons.size,4);assert.match(f.container.textContent,/ACCIONES2/);assert.doesNotMatch(f.container.textContent,/Confirma tus acciones|ACCIONES ·/);
  for(const key of ['actions','visit','actions','task','actions','changes','actions','actions']){
   await f.press(key);const s=f.state;
   assert.ok(Number(s.landingActionsOpen)+Number(s.cambiosOpen)+Number(!s.nextAptMinimized)<=1);
   assert.equal(f.buttons.get('landing-command-actions').accessibilityState.expanded,s.landingActionsOpen);
  }
  await f.press('actions');await f.clean();assert.equal(f.state.landingActionsOpen,false);
  f.ctx.actionCompletion={unresolved:[{id:'a'}],pending:[]};await f.update();assert.match(f.container.textContent,/ACCIONES1/);
  f.ctx.actionCompletion={unresolved:[],pending:[]};f.ctx.landingHasActionSelector=false;await f.update();assert.doesNotMatch(f.container.textContent,/ACCIONES/);
 }finally{await f.close()}
});
for(const width of [284,339,354,394])test('two selector rows share a stable card region at width '+width,()=>{
 for(const x of [18,62]){
  const base={commands:{x,y:400,width,height:46},region:{x,y:70,width,height:322}};
  const p=policy.landingActionPanelFrames(base,454),again=policy.landingActionPanelFrames(base,454);
  assert.deepEqual(p,again);assert.equal(p.commands.y+p.commands.height,454);assert.equal(p.region.y+p.region.height,p.commands.y-8);
  assert.equal(p.region.y,70);assert.equal(p.next,p.changes);assert.ok(p.region.height>200);
  // No bar reservation: new two rows still recover space formerly consumed by 44+16pt bar.
  assert.ok(p.region.height>base.region.height-60);
  const single=policy.landingActionPanelFrames(base,454,false);assert.equal(single.commands.height,46);
 }
});
async function mountCard({width=354,fontScale=1,feedback='GO conserva tu solicitud. No se han podido confirmar todos los avisos del teléfono',error='',visible=true}={}){
 let props=[];const host=name=>p=>{props.push({...p,native:name});if(name==='Modal'&&!p.visible)return null;return React.createElement('div',{},p.children)};
 const native={...rn,PanResponder:{create:h=>({panHandlers:{onMoveShouldSetResponder:h.onMoveShouldSetPanResponder,onResponderRelease:h.onPanResponderRelease}})},PixelRatio:{getFontScale:()=>fontScale},KeyboardAvoidingView:host('KeyboardAvoidingView'),Modal:host('Modal'),View:host('View'),Text:host('Text'),ScrollView:host('ScrollView'),TextInput:host('TextInput'),Switch:host('Switch'),TouchableOpacity:host('TouchableOpacity')};
 const core=evaluate('lib/goActionCompletion.ts'),ui=evaluate('components/landing/LandingActionCompletion.tsx',{'react-native':native,'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:59,bottom:34,left:0,right:0})},'@/components/ui/GoCloseButton':{GoCloseButton:host('GoCloseButton')},'@/lib/goActionCompletion':core});
 const entries=[{id:'a',notes:'Acción real',dateISO:'2026-11-20',time:'10:00'},{id:'b',notes:'Segunda acción',dateISO:'2026-11-21',time:'11:00'}],calls=[];
 const model={scope:{userId:'a',context:'demo:USER'},doc:{preferences:{defaultDurationMinutes:60,reminderMinutes:1440,pendingAlerts:true},records:{}},unresolved:entries,pending:[],selected:'a',savingCount:0,failedDecisions:[],feedback,error,setSelected:id=>calls.push(['selected',id]),decide:(e,s)=>calls.push([s,e.id]),isSaving:()=>false};
 const container=document.createElement('div'),root=createRoot(container);await React.act(()=>root.render(React.createElement(ui.LandingActionCompletion,{model,frame:{x:18,y:120,width,height:450},visible,onPropose:e=>calls.push(['change',e.id]),onPendingList:()=>calls.push(['list'])})));
 return {props,container,calls,close:async()=>React.act(()=>root.unmount())};
}
for(const width of [284,339,354,394])for(const fontScale of [1,1.3,2])test('compact fixed action order, original handlers and no technical feedback '+width+'/'+fontScale,async()=>{
 const f=await mountCard({width,fontScale});try{
  const buttons=f.props.filter(p=>p.native==='TouchableOpacity'&&['PROPONER CAMBIO','PENDIENTE','REALIZADO'].includes(p.accessibilityLabel));
  assert.deepEqual(buttons.map(p=>p.accessibilityLabel),['PROPONER CAMBIO','PENDIENTE','REALIZADO']);
  assert.ok(buttons.every(p=>p.style.height>=44&&p.style.height<=72));assert.ok(buttons.reduce((n,p)=>n+p.style.width,16)<=width);
  for(const b of buttons)await React.act(()=>b.onPress());assert.deepEqual(f.calls,[['change','a'],['pending','a'],['done','a']]);
  assert.match(f.container.textContent,/1º/);assert.doesNotMatch(f.container.textContent,/Confirma tus acciones|GO conserva|permisos|capacidad de notificaciones/);
  const card=f.props.find(p=>p.testID==='completion-inline-card');assert.equal(card.style.maxHeight,450);assert.equal(card.style.height,undefined,'short content uses intrinsic height');
  const details=f.props.find(p=>p.testID==='completion-action-details');assert.equal(details.style.height,undefined);assert.ok(details.style.maxHeight>=80);
 }finally{await f.close()}
});
test('real persistence errors remain visible and a closed panel renders no controls',async()=>{
 const error=await mountCard({error:'No se pudo guardar'});try{assert.match(error.container.textContent,/No se pudo guardar/)}finally{await error.close()}
 const hidden=await mountCard({visible:false});try{assert.equal(hidden.container.textContent,'')}finally{await hidden.close()}
});
test('only one action panel renderer remains, with no old bar or extra height reservation in Landing',()=>{
 const calls=[];function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='renderLandingActionCompletion')calls.push(n);ts.forEachChild(n,walk)}walk(ast);
 assert.equal(calls.length,1);assert.ok(source.includes('frame={landingDisplayPanels.commands}'));
 assert.doesNotMatch(source,/landingCompletionHeight|landingCompletionAnchored|confirmationHeight: landingHasCompletion/);
});

const orbital=evaluate('components/landing/landingLowerArc.ts'),responsive=evaluate('components/landing/landingResponsiveLayout.ts');
test('actual orbital footprints remain clear of selectors across profiles, sizes, hands and orientation',()=>{
 for(const profile of ['USER','ADMIN','BUSINESS'])for(const preset of ['compacto','estandar','grande'])for(const alignment of ['left','center','right'])
 for(const [width,height] of [[320,568],[390,822],[430,910],[844,368]]){
  const insets={top:height<400?0:59,bottom:height<400?21:34,left:height<400?44:0,right:height<400?44:0};
  const scale=responsive.fitLandingScale(preset,width,height,insets),radius=Math.round(99*scale),satelliteRadius=radius+Math.round(35*scale),size=Math.round(50*scale);
  const geom=orbital.compactLandingOrbit({goSize:Math.round(128*scale),orbitRadius:radius,orbitSize:Math.round(65*scale),orbitCount:8,orbitVisible:true,
   satelliteRadius,satelliteSize:size,helpSize:size,alignment,
   satellites:Object.entries(responsive.LANDING_SATELLITE_DEGREES).filter(([key])=>key!=='payment').map(([key,degrees])=>({key,degrees})),
   bounds:{left:insets.left+4,right:width-insets.right-4,top:insets.top+8,bottom:height-insets.bottom-4}});
  // Horizontal uses the existing independent side column; vertical selectors end at the actual painted orbit.
  const commandWidth=height<400?180:width-36;
  const base={commands:{x:18,y:140,width:commandWidth,height:46},region:{x:18,y:insets.top+8,width:commandWidth,height:100}};
  const panels=policy.landingActionPanelFrames(base,height<400?height-insets.bottom-8:geom.frame.y-8);
  assert.equal(panels.commands.width,base.commands.width);assert.equal(panels.commands.height,100);
  if(height>=400)for(const circle of [...geom.obstacles,geom.help])assert.ok(panels.commands.y+panels.commands.height<=circle.y-8+.001,profile+'/'+preset+'/'+alignment);
  const space=policy.landingScrollPanelSpace({panel:panels.region,frame:{virtual:false},insets,titleBottom:insets.top,
   controls:[{x:18,y:insets.top+8,width:44,height:44}]});
  const floor=panels.region.y+panels.region.height;
  if(floor>insets.top+60)assert.ok(floor-space.availableHeight>=insets.top+60,'header gear stays free');
 }
});

test('the narrow landscape decision row fits three accessible targets without overflow',()=>{
 const ui=evaluate('components/landing/LandingActionCompletion.tsx',{'react-native-safe-area-context':{useSafeAreaInsets:()=>({})},'@/lib/goActionCompletion':evaluate('lib/goActionCompletion.ts')});
 for(const width of [144,162,180,268,336]){const row=ui.completionDecisionLayout(width);assert.ok(row.side>=44);assert.ok(row.side*3+row.gap*2<=width+.001);}
});

test('relocated ACCIONES remains inside its native hit-testing parent and keeps its handler',async()=>{
 let hosts=[],pressed=0;const native={...rn,View:p=>{hosts.push(p);return React.createElement('div',{},p.children)},TouchableOpacity:p=>{hosts.push(p);return React.createElement('button',{},p.children)}};
 const ui=evaluate('components/landing/LandingPanelCommands.tsx',{'react-native':native,'./landingPanels':policy});
 const root=createRoot(document.createElement('div'));
 try{await React.act(()=>root.render(React.createElement(ui.LandingPanelCommands,{frame:{x:18,y:400,width:354,height:46},actionsSlot:{x:25,y:460,width:100,height:44},commands:[{key:'changes',heading:'CAMBIOS',title:'PROPUESTOS',color:'#f97316',count:2,expanded:false,onPress(){}},{key:'actions',heading:'',title:'ACCIONES',color:'#f97316',count:3,expanded:false,onPress(){pressed++}}]})));
  const parent=hosts.find(p=>p.testID==='landing-panel-commands').style,button=hosts.find(p=>p.testID==='landing-command-actions');
  assert.ok(parent.top+parent.height>=504);assert.ok(parent.left<=25);assert.equal(button.style.height,44);await React.act(()=>button.onPress());assert.equal(pressed,1);
 }finally{await React.act(()=>root.unmount())}
});

test('actions swipe uses the existing horizontal thresholds and selects the next real entry',async()=>{
 const f=await mountCard();try{
  const c=f.props.find(p=>p.testID==='action-completion-controls');
  assert.equal(c.onMoveShouldSetResponder(null,{dx:5,dy:0}),false);
  assert.equal(c.onMoveShouldSetResponder(null,{dx:25,dy:30}),false);
  assert.equal(c.onMoveShouldSetResponder(null,{dx:-25,dy:1}),true);
  await React.act(()=>c.onResponderRelease(null,{dx:-25,dy:1}));assert.deepEqual(f.calls,[['selected','b']]);
  const pending=f.props.find(p=>p.accessibilityLabel==='PENDIENTE'),change=f.props.find(p=>p.accessibilityLabel==='PROPONER CAMBIO');
  assert.equal(pending.children.props.style.color,'#ffffff');assert.equal(change.style.backgroundColor,'#FF8C00');
 }finally{await f.close()}
});
