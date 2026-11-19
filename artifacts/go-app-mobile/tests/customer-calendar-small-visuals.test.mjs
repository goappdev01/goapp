import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fixture} from './helpers/calendar-fixture.mjs';
const ts=createRequire(import.meta.url)('typescript');
const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.children)];
const text=t=>typeof t==='string'?t:typeof t==='number'?String(t):Array.isArray(t)?t.map(text).join(''):(t?.children??[]).map(text).join('');
const entry={id:'visual-change',type:'GO_BOOKING',reservationId:'original',customerBooking:true,bookingServerStatus:'CONFIRMED',bookingStatus:'confirmada',kind:'sent',estado:'propuesta_pendiente',intentLabel:'Corte',contactName:'Salón',
 dateISO:'2030-01-07',date:'Lun, 7 enero 2030',time:'10:00',duration:'30min',changeProposal:{dateISO:'2030-01-08',date:'Mar, 8 enero 2030',time:'11:30',originalDateISO:'2030-01-07',originalDate:'Lun, 7 enero 2030',originalTime:'10:00',proposedAt:1}};
function calendar(state,view,width,fontScale){
 const f=fixture({platform:'ios',now:'2030-01-07T08:00:00',viewport:{width,height:844,fontScale}}),{AgendaBoard}=f.load('components/AgendaOperativa.tsx');
 const value={...entry,estado:state};const before=JSON.stringify(value);
 const tree=f.render(AgendaBoard,{goLog:[value],selectedDateISO:'2030-01-07',viewMode:view,calViewMonth:'2030-01',embedded:true});
 assert.equal(JSON.stringify(value),before);return {tree,f};
}
for(const view of ['dia','semana'])test(`proposed change heading/${view}: no decorative arrows, centered within its real padded width`,()=>{
 for(const width of [320,375,390,430])for(const fontScale of [1,2.8]){
  const {tree}=calendar('propuesta_pendiente',view,width,fontScale);
  const headers=nodes(tree).filter(n=>n.props.testID==='calendar-change-header-visual-change');assert.ok(headers.length);
  for(const header of headers){
   assert.equal(nodes(header).some(n=>n.type==='Feather'),false);
   const title=nodes(header).find(n=>n.props.testID==='calendar-change-title-visual-change');
   assert.equal(text(title),'biz_change_proposed');assert.equal(title.props.style.textAlign,'center');assert.equal(title.props.style.flex,1);assert.equal(title.props.style.minWidth,0);assert.equal(title.props.style.paddingHorizontal,4);
   assert.equal(title.props.style.color,'#FF8C00');assert.equal(title.props.numberOfLines,undefined,'long accessible text can wrap without clipping');assert.equal(header.props.style.gap,0);
  }
  assert.match(text(tree),/10:00/);assert.match(text(tree),/11:30/);assert.match(text(tree),/biz_booking_awaiting/);
 }
});
for(const [state,icon,label] of [['propuesto','refresh-cw','biz_change_received'],['aceptado','check-circle','biz_change_accepted']])test(`${state}: other proposal headings retain their original icons and layout`,()=>{
 const {tree}=calendar(state,'dia',320,2.8),headers=nodes(tree).filter(n=>n.props.testID==='calendar-change-header-visual-change');assert.ok(headers.length);
 for(const header of headers){assert.equal(nodes(header).find(n=>n.type==='Feather').props.name,icon);assert.equal(header.props.style.gap,4);const title=nodes(header).find(n=>n.props.testID==='calendar-change-title-visual-change');assert.equal(text(title),label);assert.equal(title.props.style.textAlign,undefined);}
});
const propsFor=handedness=>{
 const props={handedness,density:'auto',timedTaskCount:5,showHours:true,dayNightMode:'mixto',calSize:'GO_CAL_MEDIUM',viewMode:'dia'};
 for(const [callback,key] of [['onDensityChange','density'],['onShowHoursChange','showHours'],['onDayNightModeChange','dayNightMode'],['onCalSizeChange','calSize'],['onViewModeChange','viewMode']])props[callback]=v=>{props[key]=v;};return props;
};
for(const hand of ['left','right'])for(const view of ['dia','semana'])test(`customer tools/${hand}/${view}: all three rows follow the saved hand without reversing controls or changing actions`,()=>{
 for(const width of [320,390]){
  const f=fixture({platform:'ios',viewport:{width,height:568,fontScale:2.8}}),{GoCalConfigPanel}=f.load('components/GoCalConfigPanel.tsx'),props=propsFor(hand);props.viewMode=view;
  const render=()=>f.render(GoCalConfigPanel,props),rows=tree=>nodes(tree).filter(n=>/^calendar-tools-(view|scale|theme)-row$/.test(n.props.testID??''));
  let tree=render(),controls=rows(tree);assert.equal(controls.length,3);
  for(const row of controls){assert.equal(row.props.style.justifyContent,hand==='right'?'flex-end':'flex-start');assert.equal(row.props.style.flexDirection,'row');assert.equal(row.props.style.flexWrap,'wrap');assert.equal(row.props.style.gap,8);}
  const buttons=row=>nodes(row).filter(n=>n.type==='TouchableOpacity');
  assert.deepEqual(buttons(controls[0]).map(text),['DÍA','SEM','MES','HORAS']);assert.deepEqual(buttons(controls[1]).map(text),['AUTO·30','1H','30','15','']);assert.deepEqual(buttons(controls[2]).map(text),['CLARO','MIXTO','OSCURO']);
  buttons(controls[0])[1].props.onPress();assert.equal(props.viewMode,'semana');
  buttons(controls[0])[2].props.onPress();assert.equal(props.viewMode,'mes_lineal');
  buttons(controls[0])[3].props.onPress();assert.equal(props.showHours,false);
  buttons(controls[1])[3].props.onPress();assert.equal(props.density,'15min');
  buttons(controls[1])[4].props.onPress();assert.equal(props.calSize,'GO_CAL_LARGE');
  buttons(controls[2])[2].props.onPress();assert.equal(props.dayNightMode,'oscuro');
  tree=render();for(const row of rows(tree))assert.equal(row.props.style.justifyContent,hand==='right'?'flex-end':'flex-start');
  const reopened=fixture({platform:'ios'}),Panel=reopened.load('components/GoCalConfigPanel.tsx').GoCalConfigPanel;
  for(const row of rows(reopened.render(Panel,props)))assert.equal(row.props.style.justifyContent,hand==='right'?'flex-end':'flex-start');
 }
});
test('only the existing Home calendar panel receives handedness; unconfigured consumers retain their previous alignment',()=>{
 const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let call;
 (function walk(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='GoCalConfigPanel')call=n;ts.forEachChild(n,walk)})(ast);
 assert.ok(call);assert.equal(call.attributes.properties.find(p=>p.name?.getText(ast)==='handedness').initializer.expression.getText(ast),'handedness');
 const f=fixture(),Panel=f.load('components/GoCalConfigPanel.tsx').GoCalConfigPanel;
 const tree=f.render(Panel,{...propsFor(undefined)});for(const row of nodes(tree).filter(n=>n.props.testID?.startsWith('calendar-tools-'))){assert.equal(row.props.style.justifyContent,'flex-start');assert.equal(row.props.style.flexWrap,'nowrap');}
});
