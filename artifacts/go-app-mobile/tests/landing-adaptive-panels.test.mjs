import {test} from 'node:test';
import {renderEntryQuickActions} from './helpers/entry-details-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,createRoot,document,rn,ts,evaluate}=require('./tests/helpers/react-lifecycle.cjs');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];
function walk(n){all.push(n);ts.forEachChild(n,walk)}walk(ast);
const attr=(n,k)=>n.openingElement.attributes.properties.find(a=>a.name?.getText(ast)===k)?.initializer?.expression;
const cards=all.filter(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='LandingCardContents');
const changes=cards.find(n=>attr(n,'footer').getText(ast).includes('item.kind')),next=cards.find(n=>n!==changes);
const compile=s=>ts.transpileModule(s,{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const dom=n=>n?[n,...n.childNodes.flatMap(dom)]:[],byId=(root,id)=>dom(root).find(n=>n.attributes?.['data-testid']===id);
const settle=async fn=>React.act(async()=>{await fn?.();for(let i=0;i<8;i++)await Promise.resolve()});
const flatten=s=>Array.isArray(s)?Object.assign({},...s.map(flatten)):s??{};
async function fixture({scale=1,profile='ADMIN',long=false,received=false}={}){
 const propsById=new Map(),texts=new Map(),calls=[],bodyHeight=long?900:110;let change;
 function View(p){if(p.testID)propsById.set(p.testID,p);const height=p.testID==='landing-card-header'?34:p.testID==='landing-card-operations'?134:['landing-card-body','landing-card-natural-content'].includes(p.testID)?bodyHeight:null;
 React.useLayoutEffect(()=>{if(height!==null)p.onLayout?.({nativeEvent:{layout:{height,width:354}}})},[p.testID,height]);return React.createElement('div',{'data-testid':p.testID,'data-native':'View','data-style':JSON.stringify(flatten(p.style))},p.children);}
 function Text(p){const value=Array.isArray(p.children)?p.children.join(''):String(p.children??'');texts.set(value,p);return React.createElement('span',{'data-testid':p.testID},p.children)}
 function ScrollView(p){const [offset,setOffset]=React.useState(0);propsById.set('drag',setOffset);return React.createElement('div',{'data-testid':p.testID,'data-native':'ScrollView','data-offset':offset,'data-style':JSON.stringify(p.style)},p.children)}
 const shared=evaluate('components/landing/LandingContentViewport.tsx',{'react-native':{...rn,View,Text,ScrollView}});
 const g=Object.freeze({id:'shared-action',type:'GO_BOOKING',kind:received?'received':'sent',estado:received?'propuesto':'propuesta_pendiente',notes:'Título completo de la actividad\nSegunda línea',changeProposal:{date:'Fecha propuesta completa',time:'14:00',note:'Nota completa de la propuesta\nSegunda línea\nTercera línea'}});
 const ctx={React,renderEntryQuickActions,View,Text,Pressable:View,TouchableOpacity:View,Feather:()=>null,LandingCompactBody:shared.LandingCompactBody,LandingCardContents:shared.LandingCardContents,uiScaleFactor:scale,
 changesCardSpace:{availableHeight:400,width:354,headerObstacles:[]},item:{kind:'cambio',g},cardAccent:'#f97316',cardTitle:'Contacto completo\nOtra línea',cardSub:'Servicio completo\nOtra línea',cardOrigDate:'Vie 16/10 · 14:00',cardNewDate:'Sáb 17/10 · 15:00',isSent:!received,total:1,safeIdx:0,allPendientes:[{kind:'cambio',g}],ACCENT:'#f97316',BLUE:'#60a5fa',
 goView:{view:profile},setPendingHeaderH(){},setPendingContentH(){},Haptics:{selectionAsync:async()=>{},impactAsync:async()=>{},ImpactFeedbackStyle:{Light:'light'}},
 t:k=>k==='biz_booking_awaiting'?'Esperando respuesta':k,landingCurrentEntry:e=>e,
 renderLandingOperations:()=>({content:React.createElement(View,{testID:'unchanged-operations'},'Taxi · Uber · Bolt · WhatsApp · Cambiar · Aquí · Llamar · Tarde · Ir')}),
 setLandingDetailsId:id=>calls.push('open-detail:'+id),buildNextAptActions:()=>[{k:'change',fn:()=>calls.push('open-original')}],rejectProposal:id=>calls.push('reject:'+id),acceptProposal:id=>calls.push('accept:'+id),openProposalFromList:e=>calls.push('propose:'+e.id),setCambiosOpen:v=>calls.push('open:'+v),setCambiosCardIdx(){}};
 vm.createContext(ctx);vm.runInContext(compile('renderCard=()=>('+changes.getText(ast)+');'),ctx);
 function Root(){const [opened,setOpened]=React.useState(true);change=setOpened;return React.createElement(View,{testID:'panel',style:{position:'absolute',bottom:300}},opened&&ctx.renderCard())}
 const container=document.createElement('div'),root=createRoot(container);await settle(()=>root.render(React.createElement(Root)));return{container,propsById,texts,calls,g,async opened(v){await settle(()=>change(v))},async scroll(v){await settle(()=>propsById.get('drag')(v))},async close(){await settle(()=>root.unmount())}};
}
for(const profile of ['ADMIN','USER','BUSINESS'])for(const [preset,scale]of [['compacto',.83],['estandar',1],['grande',1.12],['enorme',1.35]])for(const received of [false,true])
 test(profile+' / '+preset+' / received='+received+': compact proposal retains its information and opens full detail without scrolling',async()=>{
 const f=await fixture({profile,scale,received});try{const body=byId(f.container,'landing-card-body'),frame=byId(f.container,'landing-information-frame'),operations=byId(f.container,'landing-card-operations');
 assert.equal(body.attributes['data-native'],'View');assert.ok(dom(frame).includes(body)&&!dom(body).includes(operations));
 const frameStyle=JSON.parse(frame.attributes['data-style']);assert.equal(frameStyle.flexShrink,0);assert.equal(frameStyle.overflow,undefined);assert.equal(frameStyle.height,undefined);assert.equal(frameStyle.maxHeight,undefined);
 for(const value of ['Contacto completo\nOtra línea','Servicio completo\nOtra línea',f.g.notes,f.g.changeProposal.note]){assert.ok(f.container.textContent.includes(value));assert.equal(f.texts.get(value)?.numberOfLines,1);}
 for(const value of ['Vie 16/10 · 14:00','Sáb 17/10 · 15:00'])assert.ok(f.container.textContent.includes(value));
 assert.equal(dom(f.container).filter(n=>n.attributes?.['data-native']==='ScrollView').length,0);
 const actions=byId(f.container,'entry-quick-actions');assert.ok(dom(frame).includes(actions));assert.ok(!dom(operations).includes(actions),'proposal state actions stay inside the orange border, separate from existing transport controls');
 const saved=operations.attributes['data-style'];await f.opened(false);assert.equal(byId(f.container,'landing-information-frame'),undefined);await f.opened(true);assert.equal(byId(f.container,'landing-card-operations').attributes['data-style'],saved);
 f.propsById.get('landing-proposal-card').onPress();assert.equal(f.calls.at(-1),'open-detail:'+f.g.id);
 }finally{await f.close()}
 });
for(const profile of ['ADMIN','USER','BUSINESS'])test(profile+': long proposal remains a static compact card with fixed external operations',async()=>{
 const f=await fixture({profile,long:true});try{const body=byId(f.container,'landing-card-body'),frame=byId(f.container,'landing-information-frame'),operations=byId(f.container,'landing-card-operations');assert.equal(body.attributes['data-native'],'View');assert.ok(dom(frame).includes(body));assert.ok(!dom(frame).includes(operations));assert.equal(dom(f.container).filter(n=>n.attributes?.['data-native']==='ScrollView').length,0);assert.equal(JSON.parse(byId(f.container,'panel').attributes['data-style']).bottom,300);f.propsById.get('landing-proposal-card').onPress();assert.equal(f.calls.at(-1),'open-detail:'+f.g.id);}finally{await f.close()}
});
test('visits and tasks retain one renderer; compact task description opens the full detail',()=>{
 assert.equal((source.match(/key="proxima-abs-block"/g)||[]).length,1);
 const task=all.find(n=>ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(a=>a.name?.getText(ast)==='testID'&&a.initializer?.getText(ast)==='"landing-task-description"'));assert.ok(task);assert.equal(attr(task,'numberOfLines').getText(ast),'1');assert.equal(task.openingElement.attributes.properties.find(p=>p.name?.getText(ast)==='ellipsizeMode')?.initializer.getText(ast),'"tail"');
 assert.ok(next.getText(ast).includes('g.type === "TAREA" || g.type === "TAREA_INTERNA"'));
 for(const card of cards){assert.ok(attr(card,'adaptiveBody'));const style=attr(card.parent,'style').getText(ast);assert.ok(!style.includes('maxHeight'));assert.ok(style.includes('bottom: contentBottom('));}
});
