import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {renderEntryMicroActions} from './helpers/entry-details-fixture.mjs';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,createRoot,document,rn,ts,evaluate}=require('./tests/helpers/react-lifecycle.cjs');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
function walk(n){nodes.push(n);ts.forEachChild(n,walk)}walk(ast);
const attr=(n,k)=>n.openingElement.attributes.properties.find(a=>a.name?.getText(ast)===k)?.initializer;
const textChild=value=>nodes.find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='Text'&&n.children.some(c=>c.getText(ast)===value));
const tree=n=>n?[n,...n.childNodes.flatMap(tree)]:[],byId=(n,id)=>tree(n).find(c=>c.attributes?.['data-testid']===id);
const settle=async fn=>React.act(async()=>{fn?.();for(let i=0;i<10;i++)await Promise.resolve()});
const flatten=s=>Array.isArray(s)?Object.assign({},...s.map(flatten)):s??{};

test('the real next-card header uses the approved proposal typography without shrinking long names',()=>{
 const next=textChild('{cardLabel}');assert.ok(next);
 const approved=textChild('{_typeLabel}');assert.ok(approved);
 const style=(n,scale)=>vm.runInNewContext('('+attr(n,'style').expression.getText(ast)+')',{uiScaleFactor:scale,tint:'#fff',cardAccent:'#fff'});
 for(const scale of [.83,1,1.12]){
  const a=style(next,scale),b=style(approved,scale);
  for(const key of ['fontSize','fontWeight','fontFamily','letterSpacing'])assert.equal(a[key],b[key]);
 }
 assert.equal(attr(next,'numberOfLines'),undefined);assert.equal(attr(next,'ellipsizeMode'),undefined);
 assert.equal(attr(next,'adjustsFontSizeToFit'),undefined);assert.equal(attr(next,'minimumFontScale'),undefined);
 assert.ok(attr(next.parent.parent,'style').expression.getText(ast).includes('total > 1 ? 18 : 2'),'navigation chevrons have their own horizontal space');
});

test('the date and time stay together and written follow-up actions occupy the next primary row',()=>{
 const row=nodes.find(n=>ts.isJsxElement(n)&&attr(n,'testID')?.text==='landing-date-actions-row');assert.ok(row);
 assert.ok(attr(row,'style').expression.getText(ast).includes('flexDirection: "row"'));
 for(const value of ['landing-compact-date','landing-compact-time'])assert.ok(row.getText(ast).includes(value));
 assert.ok(!row.getText(ast).includes('renderEntryMicroActions'));assert.ok(row.parent.getText(ast).includes('renderEntryMicroActions(g, true)'));
 const compact=source.slice(source.indexOf('key="proxima-abs-block"'),source.indexOf('{/* ── LANDING HINTS'));
 assert.ok(!compact.includes('note-indicator'));assert.ok(!compact.includes('name="edit-2"'));
 assert.equal((compact.match(/renderEntryMicroActions\(g, true\)/g)||[]).length,1);
 assert.ok(compact.includes('setLandingDetailsId(g.id)'));
 const details=fs.readFileSync('components/GoEntryDetails.tsx','utf8');
 assert.ok(details.includes('internal ? actions.onEdit : actions.onPropose'),'editing remains available through the existing detail action');
 assert.ok(details.includes('<Text style={s.title}>{entryHeading(entry, unknown)}</Text>'),'the expanded real name has no line limit');
});

test('inline microactions preserve callbacks, colors, permissions and stop opening the parent card',()=>{
 const entry=Object.freeze({id:'reservation-1',reservationId:'r1',estado:'aceptado',localResolutionStatus:'pending'});
 const element=renderEntryMicroActions(entry,true),calls=[];
 const node=element.type({...element.props,onDone:()=>calls.push('done'),onPending:()=>calls.push('pending'),onDiscard:()=>calls.push('discard')});
 assert.equal(node.props.style.padding,0);assert.equal(node.props.style.flexShrink,0);
 const buttons=node.props.children;
 assert.equal(buttons.length,3);
 for(const [i,button] of buttons.entries()){
  assert.equal(button.props.style.flex,1);assert.equal(button.props.style.minHeight+button.props.hitSlop.top+button.props.hitSlop.bottom,44);
  const label=button.props.children.find(c=>c?.props?.numberOfLines===1);assert.equal(label.props.children,['REALIZADA','PENDIENTE','ELIMINAR'][i]);assert.equal(label.props.style.textAlign,'center');assert.ok(button.props.children.find(c=>c?.props?.name));
  let stopped=false;button.props.onPress({stopPropagation(){stopped=true}});assert.ok(stopped);assert.equal(calls.length,i+1);
 }
 assert.deepEqual(calls,['done','pending','discard']);assert.equal(entry.estado,'aceptado');assert.equal(entry.localResolutionStatus,'pending');
 const one=element.type({...element.props,onDone:undefined,onPending:undefined});assert.equal(one.props.children.length,1,'inapplicable actions leave no empty slots');
 assert.equal(element.type({...element.props,onDone:undefined,onPending:undefined,onDiscard:undefined}),null);
});

test('secondary rows yield whole lines to primary information and actions instead of adding height',()=>{
 const api=evaluate('components/landing/LandingContentViewport.tsx');
 assert.deepEqual(Array.from(api.landingCompactRows(143,40,52,[16,16,20],3)),[true,true,false]);
 assert.deepEqual(Array.from(api.landingCompactRows(105,40,52,[16,16,20],3)),[false,false,false]);
 for(const width of [284,339,354,394])for(const scale of [.83,1,1.12])for(const fontScale of [1,1.3,1.6]){
  const primary=36+18*fontScale,actions=36+16*fontScale,secondary=[16,16,22].map(n=>n*fontScale);
  const footer=2*Math.round(Math.min(80,Math.max(56,64*scale)))+Math.round(6*scale),header=18+17*fontScale;
  const chrome={headerHeight:header,footerHeight:footer,headerGap:0,footerGap:12,frameVerticalInset:27};
  const availableHeight=chrome.headerHeight+footer+12+27+primary+actions+3+35;
  const sizing=api.landingAdaptiveCardSizing({...chrome,width,availableHeight,contentHeight:1000});
  const shown=Array.from(api.landingCompactRows(sizing.bodyMaxHeight,primary,actions,secondary,3));
  const height=primary+actions+3+secondary.reduce((sum,h,i)=>sum+(shown[i]?h+3:0),0);
  assert.ok(height<=sizing.bodyMaxHeight+1e-6);assert.ok(availableHeight-sizing.chromeHeight-height>=0);
 }
});

test('native row measurements omit secondary information without moving the footer or creating a scroll area',async()=>{
 let resize;const props=new Map();
 const measurements={'landing-card-header':36,'landing-card-operations':130,'landing-compact-primary':40,'landing-compact-actions':52,
  'landing-compact-row-professional':16,'landing-compact-row-place':16,'landing-compact-row-extra':20};
 function View(p){const style=flatten(p.style);if(p.testID)props.set(p.testID,p);
  const h=style.display==='none'?0:measurements[p.testID];
  React.useLayoutEffect(()=>{if(h!=null)p.onLayout?.({nativeEvent:{layout:{height:h,width:330}}})},[h]);
  return React.createElement('div',{'data-testid':p.testID,'data-native':'View','data-style':JSON.stringify(style)},p.children);
 }
 const api=evaluate('components/landing/LandingContentViewport.tsx',{'react-native':{...rn,View}});
 function Root(){const [height,setHeight]=React.useState(348);resize=setHeight;
  return React.createElement(api.LandingCardContents,{staticBody:true,adaptiveBody:{availableHeight:height,width:354,frameVerticalInset:27},
   header:React.createElement(View,null,'Nombre real largo de empresa'),footer:React.createElement(View,null,'WhatsApp · Llamar'),footerGap:12,overflowing:false,onHeight(){},contentContainerStyle:{}},
   React.createElement(api.LandingCompactBody,{primary:React.createElement(View,null,'Fecha · hora · iconos'),actions:React.createElement(View,null,'Estado · CANCELAR · PROPONER'),
    secondary:[{key:'professional',content:'Profesional real'},{key:'place',content:'Dirección extensa'},{key:'extra',content:'Información adicional'}]}));
 }
 const container=document.createElement('div'),root=createRoot(container);
 try{
  await settle(()=>root.render(React.createElement(Root)));
  const footer=byId(container,'landing-card-operations');
  assert.equal(props.get('landing-compact-row-professional').style.display,undefined);
  assert.equal(props.get('landing-compact-row-extra').style.display,'none');
  assert.ok(props.get('landing-card-body').style.at(-1).maxHeight<=143);
  await settle(()=>resize(310));
  assert.equal(byId(container,'landing-compact-secondary'),undefined,'no empty container or reserved row');
  assert.ok(container.textContent.includes('CANCELAR'));assert.equal(byId(container,'landing-card-operations'),footer);
  assert.equal(props.get('landing-card-fixed-frame').style.maxHeight,310);
  await settle(()=>resize(440));assert.equal(props.get('landing-compact-row-extra').style.display,undefined);
  assert.equal(byId(container,'landing-card-operations'),footer);
  assert.equal(tree(container).filter(n=>n.attributes?.['data-native']==='ScrollView').length,0);
 }finally{await settle(()=>root.unmount())}
});
