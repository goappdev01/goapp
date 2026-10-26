import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,createRoot,document,ts,evaluate}=require('./tests/helpers/react-lifecycle.cjs');
const core=evaluate('lib/goActionCompletion.ts'),source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];
function walk(node){all.push(node);ts.forEachChild(node,walk);}walk(ast);
const renderer=all.find(node=>ts.isVariableDeclaration(node)&&node.name.getText(ast)==='renderLandingActionCompletion');
const anchors=all.filter(node=>ts.isCallExpression(node)&&node.expression.getText(ast)==='renderLandingActionCompletion'&&node.arguments[1]?.getText(ast)==='true');
assert.equal(anchors.length,2,'The existing changes group and shared visit/task group reuse one renderer');
const descendants=node=>node?[node,...node.childNodes.flatMap(descendants)]:[];
async function fixture(width=390,hand='right',initial='changes'){
 const props=new Map(),calls=[],scopeId={userId:'11111111-1111-4111-8111-111111111111',context:'live:USER'};
 const first={id:'one',notes:'Acción conservada',dateISO:'2030-01-07',time:'09:00'},second={...first,id:'two'},third={...first,id:'three'};
 const model={scope:scopeId,doc:core.emptyCompletionDocument(scopeId),unresolved:[first,second],pending:[third],selected:null,savingCount:0,failedDecisions:[],busy:false,
  setSelected:id=>calls.push(['selected',id]),decide:(entry,status)=>calls.push(['decide',entry.id,status]),configure:()=>calls.push(['configure'])};
 const native=name=>p=>{const id=React.useId();props.set(id,{...p,native:name});return name==='Modal'&&!p.visible?null:React.createElement('div',{'data-prop-id':id},p.children);};
 const rn=Object.fromEntries(['View','Text','TouchableOpacity','Modal','ScrollView','TextInput','Switch','KeyboardAvoidingView'].map(name=>[name,native(name)]));rn.Platform={OS:'ios'};rn.PixelRatio={getFontScale:()=>1};
 const ui=evaluate('components/landing/LandingActionCompletion.tsx',{'react-native':rn,'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:59,bottom:34,left:0,right:0})},'@/components/ui/GoCloseButton':{GoCloseButton:native('GoCloseButton')},'@/lib/goActionCompletion':core});
 const panelWidth=width-36,panelX=18,controls=[{x:hand==='right'?8:width-70,y:59,width:62,height:72},{x:hand==='right'?width-56:18,y:75,width:44,height:44}];
 const scope={exports:{},React,LandingActionCompletion:ui.LandingActionCompletion,completionPanelFrame:ui.completionPanelFrame,actionCompletion:model,
  anyOverlayOpen:false,rutasMode:false,goAuthOpen:false,authBootstrapComplete:true,screen:{width},insets:{left:0,right:0},lang:'es',
  setListFilter:filter=>calls.push(['filter',filter]),setListOpen:open=>calls.push(['list',open]),
  toLandingRootRect:rect=>rect,landingPanels:{next:{x:panelX},changes:{x:panelX}},PANEL_W:panelWidth,closeHeaderHeight:52,closeHeaderObstacles:controls};
 const code='const renderLandingActionCompletion='+renderer.initializer.getText(ast)+';'+anchors.map((call,index)=>'exports.anchor'+index+'=()=>('+call.getText(ast)+');').join('');
 vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,scope);
 let select,refresh,selected=initial;
 function Host(){const[current,setCurrent]=React.useState(initial),[,update]=React.useState(0);selected=current;select=setCurrent;refresh=()=>update(n=>n+1);
  const render=scope.exports['anchor'+(current==='changes'?0:1)];return React.createElement(rn.View,{testID:'actual-panel',pointerEvents:'box-none',style:{position:'absolute',left:panelX,top:220,width:panelWidth}},render());}
 const container=document.createElement('div'),root=createRoot(container),settle=async(fn=()=>{})=>React.act(async()=>{fn();for(let i=0;i<12;i++)await Promise.resolve();});
 const visible=()=>descendants(container).filter(node=>node.attributes?.['data-prop-id']).map(node=>props.get(node.attributes['data-prop-id']));
 const get=id=>visible().find(p=>p.testID===id);
 await settle(()=>root.render(React.createElement(Host)));
 return{ui,model,scope,calls,container,visible,get,settle,controls,panelX,panelWidth,get selected(){return selected;},async select(value){await settle(()=>select(value));},async refresh(){await settle(refresh);},async close(){await settle(()=>root.unmount());}};
}

const orders=[['changes','visit','task'],['changes','task','visit'],['visit','changes','task'],['visit','task','changes'],['task','visit','changes'],['task','changes','visit']];
for(const order of orders)test(order.join(' → ')+': each real anchor stays outside its panel, opens the original confirmation and keeps the real count',async()=>{
 for(const width of [320,390,430])for(const hand of ['left','right']){
  const f=await fixture(width,hand,order[0]);try{
   const before=JSON.stringify(f.model);
   for(const panel of [...order,...order.slice().reverse()]){
    await f.select(panel);const bars=f.visible().filter(p=>p.testID==='landing-action-completion');assert.equal(bars.length,1);
    const bar=bars[0];assert.equal(bar.style.position,'absolute');assert.equal(bar.style.bottom,'100%');assert.equal(bar.style.marginBottom,16);assert.equal(bar.style.top,undefined);assert.equal(bar.style.height,undefined);assert.equal(bar.style.minHeight,44);
    assert.equal(f.get('actual-panel').style.top,220);assert.equal(f.get('actual-panel').pointerEvents,'box-none');
    const x=f.panelX+bar.style.left;for(const control of f.controls)assert.ok(x+bar.style.width<=control.x-8+.01||x>=control.x+control.width+8-.01,'The bar excludes the existing header touch area');
    const button=f.visible().find(p=>p.native==='TouchableOpacity'&&p.children?.props?.children?.[0]==='Confirma tus acciones');assert.ok(button);assert.ok(button.style.minHeight>=44);
    assert.match(f.container.textContent,/Confirma tus acciones · 3/);await f.settle(()=>button.onPress());assert.ok(f.container.textContent.includes('Acción conservada'));
    const close=f.visible().find(p=>p.native==='GoCloseButton');assert.equal(close.accessibilityLabel,'Cerrar confirmación');await f.settle(()=>close.onPress());
    assert.equal(f.visible().some(p=>p.native==='GoCloseButton'),false);assert.equal(JSON.stringify(f.model),before);assert.equal(f.calls.length,0);
   }
   f.model.unresolved=[];f.model.pending=[];await f.refresh();assert.equal(f.get('landing-action-completion'),undefined);assert.equal(f.calls.length,0);
  }finally{await f.close();}
 }
});

test('free header lane adapts to small, large, landscape and left handed layouts without reading another panel height',async()=>{
 const f=await fixture();try{
  for(const width of [320,375,390,430,667,844,1024])for(const hand of ['left','right'])for(const edgeWidth of [64,72,80]){
   const inset=width>600?44:0,panelWidth=width>600?240:width-36,panelX=hand==='right'?inset+18:width-inset-18-panelWidth;
   const controls=[{x:inset+8,y:50,width:62,height:72},{x:width-inset-60,y:70,width:44,height:44}];
   const frame=f.ui.completionPanelFrame({panelX,panelWidth,width,left:inset,right:inset,edgeWidth,controls});const x=panelX+frame.x;
   assert.ok(frame.width>=44);assert.equal(frame.height,44);assert.equal(frame.y,0);assert.ok(x>=inset);assert.ok(x+frame.width<=width-inset);
   for(const control of controls)assert.ok(x+frame.width<=control.x-8+.01||x>=control.x+control.width+8-.01);
  }
  assert.ok(source.includes('!landingCompletionAnchored && renderLandingActionCompletion('),'The independent root bar is suppressed while one panel owns the bar');
  const beside=f.ui.completionPanelFrame({panelX:62,panelWidth:240,width:844,left:44,right:44,edgeWidth:72,controls:[{x:214,y:70,width:44,height:44}]});
  assert.ok(62+beside.x>=116&&62+beside.x+beside.width<=206,'In a side column, prefer the free lane directly above the panel, not a wider remote lane');
  const module=fs.readFileSync('components/landing/LandingActionCompletion.tsx','utf8');assert.ok(module.includes('anchorAbove?{minHeight:44}'),'Large text remains intrinsic and grows upwards, not into the panel');
 }finally{await f.close();}
});
