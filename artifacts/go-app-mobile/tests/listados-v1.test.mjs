import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {fixture} from './helpers/calendar-fixture.mjs';
const ts=createRequire(import.meta.url)('typescript');
const source=readFileSync('app/index.tsx','utf8');
const ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];
(function walk(n){all.push(n);ts.forEachChild(n,walk)})(ast);
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const declaration=name=>all.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);
const cardMap=all.find(n=>ts.isCallExpression(n)&&n.expression.getText(ast)==='ordered.map');
assert.ok(cardMap);
const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.children)];
const text=t=>typeof t==='string'?t:typeof t==='number'?String(t):Array.isArray(t)?t.map(text).join(''):(t?.children??[]).map(text).join('');
function expand(t){if(!t||typeof t!=='object')return t;if(Array.isArray(t))return t.map(expand);if(typeof t.type==='function')return expand(t.type({...t.props,children:t.children}));return {...t,children:(t.children??[]).map(expand)};}
const base={id:'one',ownerUserId:'owner',actionContext:'live:USER',type:'GO_BOOKING',customerBooking:true,reservationId:'original',businessId:'salon',serviceId:'service',
 bookingStatus:'confirmada',bookingServerStatus:'CONFIRMED',estado:'aceptado',kind:'received',intentLabel:'Corte',contactName:'Peluquería con un nombre muy largo',professionalName:'María José',
 dateISO:'2030-01-07',date:'7/1/2030',time:'10:30',duration:'30min'};
function card({entry=base,hand='right',size='medio',width=390,fontScale=1,followUp,failed=false}={}){
 const f=fixture({viewport:{width,height:844,fontScale}}),c=f.load('components/GoEntryDetails.tsx'),controls=f.load('components/listados/ListadosControls.tsx');
 const presentation=f.load('data/goEntryPresentation.ts'),policy=f.load('data/reservationCardPolicy.ts'),translations=f.load('i18n/translations.ts').translations.es;
 const calls=[],record=name=>(...args)=>calls.push([name,...args]);
 const context={React:{Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)})},
  View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',Pressable:'Pressable',SwipeableRow:'SwipeableRow',Feather:'Feather',
  ...controls,...presentation,GoListActionRow:c.GoListActionRow,...policy,ENTRY_COLORS:policy.GO_ENTRY_COLORS,
  listGoSize:size,listScale:size==='compacto'?.8:size==='grande'?1.25:1,lang:'es',handedness:hand,firstNoDateIdx:-1,isPapelaraView:!!entry.deleted,
  INTENTS:[],RESERVAS_ORBITAL_CATS:[],t:key=>translations[key]??key,localizeLabel:x=>x,displayContact:(name,phone)=>name||phone,
  Haptics:{selectionAsync:async()=>{}},canResolveEntry:e=>!e.deleted,
  actionCompletion:{status:()=>followUp,failedDecisions:failed?[{id:'failure',entry}]:[],retryDecision:record('retry')},
  openListSavedNote:()=>false,setCalBookingDetailEntry:record('detail'),renderLinkedNotes:()=>null,
  renderEntryMicroActions:e=>f.render(c.GoEntryMicroActions,{entry:{...e,localResolutionStatus:followUp},layout:'list',handedness:hand,
    onDone:record('done'),onPending:record('pending'),onDiscard:record('discard')}),
  altSlotsEntry:null,TRASH_DISPLAY_LIMIT:50,pendingUndos:{},completionKey:f.load("lib/goActionCompletion.ts").completionKey,
 };
 context.lv=n=>Math.round(n*context.listScale);
 const formatter=all.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='formatCompactProposalSlot');
 vm.runInNewContext(compile('const '+declaration('slotOf').getText(ast)+';'+formatter.getText(ast)+';exports.render='+cardMap.arguments[0].getText(ast)+';'),{...context,exports:context});
 return {tree:expand(context.render(entry,0)),calls,fixture:f,context};
}

for(const width of [320,375,390,430])for(const hand of ['left','right'])for(const size of ['compacto','medio','grande'])test(`${width}/${hand}/${size}: actual card keeps one personal row, one title/status line and unmarked persisted follow-up`,()=>{
 const {tree,calls}=card({width,hand,size,fontScale:2.8});
 const header=nodes(tree).find(n=>n.props.testID==='list-header-line-one'),title=nodes(header).find(n=>n.props.testID==='list-title-one');
 assert.equal(header.props.style.flexWrap,'nowrap');assert.equal(header.props.style.flexDirection,'row');assert.equal(title.props.style.flex,1);assert.equal(title.props.style.minWidth,0);assert.equal(title.props.numberOfLines,1);
 const badge=nodes(header).find(n=>n.props.testID==='list-reservation-status-one');assert.equal(text(badge),'CONFIRMADA');assert.equal(nodes(badge).find(n=>n.type==='Text').props.numberOfLines,1);
 assert.match(text(tree),/Seguimiento: Sin marcar/);
 const rows=nodes(tree).filter(n=>n.props.testID==='entry-micro-actions');assert.equal(rows.length,1);
 const buttons=nodes(rows[0]).filter(n=>n.type==='TouchableOpacity');assert.deepEqual(buttons.map(text),hand==='right'?['ELIMINAR','PENDIENTE','REALIZADA']:['REALIZADA','PENDIENTE','ELIMINAR']);
 assert.ok(buttons.every(n=>n.props.style.minHeight>=44));assert.ok(buttons.every(n=>!n.props.accessibilityState.selected));assert.equal(nodes(rows[0]).some(n=>n.type==='Feather'),false);
 nodes(tree).find(n=>n.props.testID==='list-entry-card-one').props.onPress();assert.deepEqual(calls,[['detail',base]]);
});

test('only the explicitly selected personal button has a check and border, without changing contract or another card',()=>{
 const before=JSON.stringify(base);
 for(const followUp of ['pending','done','pending']){
  const f=card({followUp}),row=nodes(f.tree).find(n=>n.props.testID==='entry-micro-actions'),selected=nodes(row).filter(n=>n.props.accessibilityState?.selected);
  assert.equal(selected.length,1);assert.equal(text(selected[0]),followUp==='done'?'REALIZADA ✓':'PENDIENTE ✓');assert.equal(selected[0].props.style.borderWidth,2);
  assert.match(text(f.tree),followUp==='done'?/Seguimiento: REALIZADA/:/Seguimiento: PENDIENTE/);assert.match(text(f.tree),/CONFIRMADA/);
  selected[0].props.onPress({stopPropagation(){}});assert.equal(f.calls[0][0],followUp==='done'?'done':'pending');
 }
 assert.match(text(card({entry:{...base,id:'two',reservationId:'other'}}).tree),/Sin marcar/);assert.equal(JSON.stringify(base),before);
});

test('received proposals keep original/new dates but contractual actions live only in the complete detail',()=>{
 const entry={...base,estado:'propuesto',changeProposal:{dateISO:'2030-01-08',date:'8/1/2030',time:'11:45',originalDateISO:base.dateISO,originalTime:base.time}},f=card({entry});
 assert.match(text(f.tree),/11:45/);assert.equal(nodes(f.tree).some(n=>n.props.testID==='go-proposal-responses-one'),false);
 assert.equal(nodes(f.tree).some(n=>n.type==='Feather'&&['maximize-2','minimize-2'].includes(n.props.name)),false);
 const c=f.fixture.load('components/GoEntryDetails.tsx'),calls=[];
 const detail=expand(f.fixture.render(c.GoEntryQuickActions,{entry:{...entry,localResolutionStatus:'done'},onAccept:()=>calls.push('accept'),onReject:()=>calls.push('reject'),onPropose:()=>calls.push('propose')}));
 for(const label of ['ACEPTAR','RECHAZAR','PROPONER'])nodes(detail).find(n=>n.props.accessibilityLabel===label).props.onPress();assert.deepEqual(calls,['accept','reject','propose']);
 const confirmed=expand(f.fixture.render(c.GoEntryQuickActions,{entry:base,onCancel(){},onPropose(){},onAccept(){},onReject(){}}));
 assert.equal(nodes(confirmed).some(n=>['ACEPTAR','RECHAZAR'].includes(n.props.accessibilityLabel)),false);
});

test('generic tasks open the full detail without inventing a confirmed reservation and failed writes remain contextual',()=>{
 const entry={...base,id:'task',type:'TAREA_INTERNA',customerBooking:false,reservationId:undefined,estado:'pendiente',notes:'Título de tarea completo'};
 const f=card({entry,failed:true});assert.doesNotMatch(text(f.tree),/CONFIRMADA/);assert.match(text(f.tree),/No se ha guardado el seguimiento/);
 nodes(f.tree).find(n=>n.props.testID==='list-entry-card-task').props.onPress();assert.deepEqual(f.calls,[['detail',entry]]);
 nodes(f.tree).find(n=>n.props.accessibilityRole==='button'&&text(n)==='Reintentar').props.onPress();assert.equal(f.calls.at(-1)[0],'retry');
});

test('Listados tools use the original sort and size preference handlers; primary navigation and global tools remain',()=>{
 const f=fixture(),c=f.load('components/listados/ListadosControls.tsx'),calls=[],memory=new Map();
 const context={goSortOrder:'asc',listGoSize:'compacto',setGoSortOrder:v=>{context.goSortOrder=v;},setListGoSize:v=>{context.listGoSize=v;},
  AsyncStorage:{setItem:async(k,v)=>memory.set(k,v)},Haptics:{selectionAsync:async()=>{},impactAsync:async()=>{},ImpactFeedbackStyle:{Medium:'medium'}},setSortFeedbackVisible(){},setTimeout(){},exports:{}};
 vm.runInNewContext(compile(['toggleGoSortOrder','cycleListSize'].map(name=>'const '+declaration(name).getText(ast)+';').join('\n')+';exports.sort=toggleGoSortOrder;exports.size=cycleListSize;'),context);
 for(let i=0;i<3;i++){
  const tree=f.render(c.ListadosTools,{sortOrder:context.goSortOrder,size:context.listGoSize,onToggleSort:context.exports.sort,onCycleSize:context.exports.size});
  assert.match(text(tree),/Herramientas de Listados/);const buttons=nodes(tree).filter(n=>n.type==='TouchableOpacity');assert.equal(buttons.length,2);assert.ok(buttons.every(n=>n.props.style.minHeight>=44));buttons[1].props.onPress();
 }
 assert.equal(context.listGoSize,'compacto');assert.equal(memory.get('go_list_size_v1'),'compacto');context.exports.sort();assert.equal(memory.get('go_sort_order_v1'),'desc');
 const tools=readFileSync('components/herramientas/HerramientasPanel.tsx','utf8');assert.match(tools,/\{listTools\}/);assert.match(tools,/<GoNavigationAppearanceControl/);assert.match(tools,/toggleHandedness/);
 const sheet=all.find(n=>ts.isJsxOpeningElement(n)&&n.tagName.getText(ast)==='BottomSheet'&&n.attributes.properties.some(p=>p.name?.getText(ast)==='visible'&&p.initializer?.expression?.getText(ast)==='listOpen'));
 assert.match(sheet.getText(ast),/LISTADOS/);assert.match(sheet.getText(ast),/floatingClose/);
 assert.equal(all.some(n=>ts.isVariableDeclaration(n)&&/\b(?:expandedId|allExpanded|cardMode)\b/.test(n.name.getText(ast))),false);
 assert.match(sheet.getText(ast),/clusterScroll/);assert.match(sheet.getText(ast),/list-notes-open/);
 assert.doesNotMatch(sheet.getText(ast),/maximize-2|minimize-2|setAllExpanded|BTN_MINI/);
});

test('large text and long contractual states remain in the allocated header row with the full accessible label',()=>{
 const f=fixture({viewport:{width:320,height:568,fontScale:2.8}}),{ListEntryHeader}=f.load('components/listados/ListadosControls.tsx');
 for(const title of ['Corte','Un nombre extraordinariamente largo que debe seguir completo en el detalle']){
  const tree=f.render(ListEntryHeader,{id:'long',title,status:'PENDIENTE DE ACEPTACIÓN',scale:1.25}),line=nodes(tree).find(n=>n.props.testID==='list-header-line-long');
  assert.equal(line.props.style.flexWrap,'nowrap');const label=nodes(line).find(n=>n.props.accessibilityLabel==='PENDIENTE DE ACEPTACIÓN');assert.equal(label.props.numberOfLines,1);assert.equal(label.props.adjustsFontSizeToFit,true);assert.equal(nodes(line).find(n=>n.props.testID==='list-title-long').props.accessibilityLabel,title);
 }
});
