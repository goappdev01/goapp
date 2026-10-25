import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/calendar-fixture.mjs';
const nodes=(n,p)=>n&&typeof n==='object'?[...(p(n)?[n]:[]),...(n.children??[]).flatMap(c=>nodes(c,p))]:[];
const date='2030-10-26',entry={id:'new-reservation-exact-id',type:'GO_BOOKING',customerBooking:true,reservationId:'one',businessId:'salon',slotKey:'slot',estado:'aceptado',bookingStatus:'confirmada',contactName:'Registered salon',time:'12:37',duration:'73min',dateISO:date,date:'26 octubre'};
function mount({viewMode='dia',showHours=true,ready=true}={}){
 const f=fixture(),{AgendaBoard,centeredBookingOffset}=f.load('components/AgendaOperativa.tsx'),scrolls=[];
 const props={goLog:ready?[entry,{...entry,id:'same-time-other-reservation',reservationId:'two'}]:[],viewMode,showHours,selectedDateISO:date,calViewMonth:'2030-10',scrollToDateToken:{dateISO:date,timeHHMM:entry.time,entryId:entry.id,token:1},highlightEntryId:entry.id};
 let tree=f.render(AgendaBoard,props),cardY=1260,cardHeight=100;
 const render=()=>tree=f.render(AgendaBoard,props);
 const layout=()=>{
  const horizontal=nodes(tree,n=>n.type==='GHScrollView')[0];horizontal.props.ref.current={scrollTo:p=>scrolls.push(['x',p])};
  horizontal.props.onLayout({nativeEvent:{layout:{width:390}}});horizontal.props.onContentSizeChange(2000,500);
  const column=nodes(tree,n=>n.props.key==='day_'+date)[0];assert.ok(column);column.props.onLayout({nativeEvent:{layout:{x:800,width:366}}});
  const scroll=nodes(column,n=>n.type==='ScrollView'&&n.props.onContentSizeChange)[0];assert.ok(scroll);
  scroll.props.ref({measureInWindow:fn=>fn(0,120,366,400),scrollTo:p=>scrolls.push(['y',p])});
  scroll.props.onLayout({nativeEvent:{layout:{height:400}}});scroll.props.onScroll?.({nativeEvent:{contentOffset:{y:100}}});scroll.props.onContentSizeChange(366,3000);
  const target=nodes(column,n=>n.props.testID==='calendar-entry-'+entry.id)[0];
  if(target){target.props.ref({measureInWindow:fn=>fn(810,cardY,350,cardHeight)});target.props.onLayout();}
  const wrong=nodes(column,n=>n.props.testID==='calendar-entry-same-time-other-reservation')[0];
  wrong?.props.ref({measureInWindow(){throw Error('Must never select another booking with the same time');}});
  return {horizontal,scroll,target};
 };
 return{f,props,scrolls,render,layout,centeredBookingOffset,get tree(){return tree;},height:h=>cardHeight=h,cardY:y=>cardY=y};
}
for(const [viewMode,showHours]of [['dia',true],['semana',true],['mes_lineal',false]])test(viewMode+': exact booking centers after native card/column measurements and only once',()=>{
 const m=mount({viewMode,showHours}),before=JSON.stringify(m.props.goLog);m.f.runTimers();assert.equal(m.scrolls.length,0);
 m.layout();m.f.runTimers();assert.deepEqual(m.scrolls.map(x=>x[0]),['x','y']);
 assert.equal(m.scrolls[0][1].x,788);assert.equal(m.scrolls[1][1].y,m.centeredBookingOffset(1240,100,400,3000));
 const y=m.scrolls[1][1].y;assert.ok(1240-y>=8);assert.ok(1240+100-y<=400-64);
 m.props.goLog=[...m.props.goLog];m.render();m.layout();m.f.runTimers();assert.equal(m.scrolls.length,2,'data refresh does not reset the achieved position');
 assert.equal(JSON.stringify(m.props.goLog),before);assert.equal(m.props.viewMode,viewMode);assert.equal(m.props.showHours,showHours);
});
test('late-loaded booking and an initially zero-height native card remain pending until the exact card is measurable',()=>{
 const m=mount({ready:false});m.layout();m.f.runTimers();assert.equal(m.scrolls.length,0);
 m.props.goLog=[entry];m.render();m.height(0);m.layout();m.f.runTimers();assert.equal(m.scrolls.length,0);
 m.height(160);m.layout();m.f.runTimers();assert.equal(m.scrolls.length,2);assert.equal(m.scrolls[1][1].y,m.centeredBookingOffset(1240,160,400,3000));
});
test('manual navigation cancels a pending focus and later layouts cannot pull the user back',()=>{
 const m=mount();const {horizontal}=m.layout();horizontal.props.onScrollBeginDrag();m.f.runTimers();assert.equal(m.scrolls.length,0);m.render();m.layout();m.f.runTimers();assert.equal(m.scrolls.length,0);
});
test('centering uses measured dimensions, clamps first/last records and keeps room for floating controls',()=>{
 const {centeredBookingOffset:offset}=fixture().load('components/AgendaOperativa.tsx');
 for(const viewport of [260,400,670])for(const card of [64,100,180]){
  const contentY=1500,y=offset(contentY,card,viewport,3500),safeBottom=Math.min(64,viewport/3);
  assert.ok(contentY-y>=8);assert.ok(contentY+card-y<=viewport-safeBottom+0.001);
 }
 assert.equal(offset(0,100,400,2000),0);assert.ok(offset(2900,100,400,3200)<=2800);
});
