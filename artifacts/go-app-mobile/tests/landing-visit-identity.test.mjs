import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import lifecycle from './helpers/react-lifecycle.cjs';
import { renderEntryQuickActions } from './helpers/entry-details-fixture.mjs';
const { React, createRoot, document, rn, ts, evaluate } = lifecycle;
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
function visit(n){nodes.push(n);ts.forEachChild(n,visit)}visit(ast);
const attribute=(n,key)=>(n.openingElement||n).attributes.properties.find(p=>p.name?.getText(ast)===key)?.initializer?.expression;
const card=nodes.find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='LandingCardContents'&&attribute(n,'footer')?.getText(ast)==='operations.content');
const tint=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='tint'&&n.initializer?.getText(ast).includes('LANDING_VISIT_VISUAL'));
const selector=nodes.find(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='LandingPanelCommands');
const commands=selector.attributes.properties.find(p=>p.name?.getText(ast)==='commands').initializer.expression;
const outline=nodes.find(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='LandingVisitOutline');
const shared=evaluate('components/landing/LandingVisitOutline.tsx');
const visual=shared.LANDING_VISIT_VISUAL;
const policy=evaluate('data/reservationCardPolicy.ts');
const presentation=evaluate('data/goEntryPresentation.ts');
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const settle=async fn=>React.act(async()=>{fn();for(let i=0;i<12;i++)await Promise.resolve()});
const flat=s=>Array.isArray(s)?Object.assign({},...s.map(flat)):s||{};

test('one frozen visual token preserves the approved Admin yellow, independent of state colors',()=>{
  assert.equal(Object.isFrozen(visual),true);assert.equal(visual.color,'#eab308');
  assert.notEqual(visual.color,policy.GO_ENTRY_COLORS.pending,'module identity is not the mutable pending-state palette');
  assert.ok(attribute(card,'boundedHeight'));assert.ok(attribute(card,'onOpen'));
});

function contrast(a,b){const luminance=hex=>{const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2]};const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
test('identity text and counter keep readable contrast on their actual dark and yellow backgrounds',()=>{
  assert.ok(contrast(visual.color,'#0f0f12')>=4.5);assert.ok(contrast('#000000',visual.color)>=4.5);
});

for(const profile of ['ADMIN','BUSINESS','USER'])for(const scale of [.83,1,1.12])test(`${profile}/${scale}: real selector, counter, header, dots and outline consume the same identity`,async()=>{
  const captures=[];
  const host=name=>p=>{captures.push({name,...p});return React.createElement('div',{'data-testid':p.testID},p.children)};
  const native={...rn,View:host('View'),Text:host('Text'),TouchableOpacity:host('Button'),StyleSheet:{create:x=>x,absoluteFill:{top:0,left:0,right:0,bottom:0,position:'absolute'}}};
  const frame=evaluate('components/landing/LandingVisitOutline.tsx',{'react-native':native});
  const selectors=evaluate('components/landing/LandingPanelCommands.tsx',{'react-native':native,'./landingPanels':evaluate('components/landing/landingPanels.ts')});
  const g=Object.freeze({id:'visit-'+profile,type:'GO_BOOKING',customerBooking:profile!=='BUSINESS',businessBooking:profile==='BUSINESS',contactName:'Contacto privado '+profile,color:profile==='ADMIN'?'#eab308':'#3D9A84',estado:'aceptado'});
  const state=JSON.stringify(g),scope={React,...frame,...selectors,entryIsInternal:presentation.entryIsInternal,entryIsReservation:presentation.entryIsReservation,LANDING_VISIT_VISUAL:visual,nextPanelKind:'visit',g,goView:{view:profile,isAdminView:profile==='ADMIN'},isBusinessMode:profile==='BUSINESS',isUserMode:profile!=='BUSINESS',
    readableOnDark:color=>color,intent:{color:'#22c55e'},nextGroups:{visit:[{g},{g},{g}],task:[]},allPendientes:[],cambiosOpen:false,nextAptMinimized:false,
    t:key=>({next_fem:'PRÓXIMA',word_visit:'visita',task:'TAREA'})[key]||key,uiScaleFactor:scale,total:3,safeIdx:0,ordinal:'1ª',cardLabel:g.contactName.toUpperCase(),nextPanelAppointments:[{g},{g},{g}],nextCardDeleteConfirm:null,
    Animated:{View:native.View},View:native.View,Text:native.Text,Feather:()=>null,nextCardPanRef:{panHandlers:{}},nextCardSlideAnim:0,nextSwipeHintAnim:{interpolate:()=>0}};
  vm.createContext(scope);
  vm.runInContext(compile('const tint='+tint.initializer.getText(ast)+';render=()=> <>'+attribute(card,'header').getText(ast)+'{'+outline.getText(ast)+'}<LandingPanelCommands frame={{x:18,y:200,width:284,height:46}} commands={'+commands.getText(ast)+'}/></>;'),scope);
  const root=createRoot(document.createElement('div'));
  try{await settle(()=>root.render(scope.render()));
    const command=captures.find(p=>p.testID==='landing-command-visit');assert.equal(command.style.borderColor,visual.color+'55');assert.equal(command.style.shadowColor,visual.color);
    const heading=captures.find(p=>p.name==='Text'&&p.children==='PRÓXIMA');assert.equal(heading.style.color,visual.color);
    const counter=captures.find(p=>p.name==='View'&&p.style?.width===17);assert.equal(counter.style.backgroundColor,visual.color);
    const title=captures.find(p=>p.name==='Text'&&p.children===scope.cardLabel);assert.equal(title.style.color,visual.color);assert.equal(title.style.fontSize,Math.round(13*scale));assert.equal(title.style.fontFamily,'Inter_900Black');assert.equal(title.style.fontWeight,'900');assert.equal(title.style.letterSpacing,.7);
    const border=captures.find(p=>p.testID==='landing-visit-outline');assert.equal(flat(border.style).borderColor,visual.color);assert.equal(flat(border.style).borderWidth,1.5);assert.equal(border.pointerEvents,'none');
    assert.ok(captures.some(p=>p.name==='View'&&p.style?.width===8&&p.style.backgroundColor===visual.color));assert.equal(JSON.stringify(g),state,'visual configuration never mutates the authorized record');
  }finally{await settle(()=>root.unmount())}
});

for(const profile of ['ADMIN','BUSINESS','USER'])test(`${profile}: semantic states and authorized reservation actions remain separate from yellow module identity`,()=>{
  for(const status of ['pendiente','confirmada','completada','cancelada']){
    const entry=Object.freeze({id:'r1',type:'GO_BOOKING',customerBooking:profile!=='BUSINESS',businessBooking:profile==='BUSINESS',reservationId:'11111111-1111-4111-8111-111111111111',bookingStatus:status,estado:status==='confirmada'?'aceptado':status==='cancelada'?'rechazado':'pendiente'});
    const result=policy.reservationCardPolicy(entry),colors={pendiente:'#FFD700',confirmada:'#22c55e',completada:'#22c55e',cancelada:'#FF0000'};assert.equal(result.stateColor,colors[status]);
    assert.equal(result.canConfirm,profile==='BUSINESS'&&status==='pendiente');assert.equal(result.canVerify,profile==='BUSINESS');assert.equal(result.canShowQr,profile!=='BUSINESS'&&status==='confirmada');
    const element=renderEntryQuickActions(entry,true,true),tree=element.type({...element.props,onConfirm(){}}),buttons=tree.props.children.at(-1)?.props?.children?.flat().filter(Boolean)||[];
    if(status==='pendiente'||status==='confirmada'){
      assert.equal(flat(buttons[0].props.style).borderColor,'#FF0000');assert.equal(flat(buttons[1].props.style).borderColor,'#FF8C00');
      assert.equal(buttons.some(b=>b.props.accessibilityLabel==='ACEPTAR'),profile==='BUSINESS'&&status==='pendiente');
    }
  }
});

test('task identity still uses its record color and transient deletion confirmation remains red',()=>{
  const context={nextPanelKind:'task',g:{color:'#a78bfa'},intent:{color:'#000000'},LANDING_VISIT_VISUAL:visual,readableOnDark:color=>'existing:'+color};
  assert.equal(vm.runInNewContext(tint.initializer.getText(ast),context),'existing:#a78bfa');
  assert.equal(vm.runInNewContext(attribute(outline,'color').getText(ast),{g:{id:'visit'},nextCardDeleteConfirm:'visit',tint:visual.color}),'#ef4444');
});
