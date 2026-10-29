import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fixture} from './helpers/calendar-fixture.mjs';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
const nodes=(n,p)=>n&&typeof n==='object'?[...(p(n)?[n]:[]),...(n.children||[]).flatMap(c=>nodes(c,p))]:[];
function mount(entry,destination){
 const f=fixture({now:'2027-01-01T12:00:00'}),{AgendaBoard}=f.load('components/AgendaOperativa.tsx'),scrolls=[],date=destination==='calendar'?entry.dateISO:'';
 const props={goLog:destination==='archive'?[]:[entry],archiveNotes:destination==='archive'?[entry]:[],onOpenNote(){},viewMode:'semana',selectedDateISO:entry.dateISO||'2027-01-01',scrollToDateToken:{dateISO:date,timeHHMM:entry.time,entryId:entry.id,token:1,destination}};
 let tree=f.render(AgendaBoard,props);tree=f.render(AgendaBoard,props);
 const layout=()=>{
  const horizontal=nodes(tree,n=>n.type==='GHScrollView')[0];horizontal.props.ref.current={scrollTo:options=>scrolls.push(['x',options])};horizontal.props.onLayout({nativeEvent:{layout:{width:390}}});horizontal.props.onContentSizeChange(2000,500);
  const key=destination==='calendar'?'day_'+entry.dateISO:destination==='archive'?'notes':'retrasados',column=nodes(tree,n=>n.props.key===key)[0];assert.ok(column);column.props.onLayout({nativeEvent:{layout:{x:destination==='archive'?0:destination==='pending'?188:800,width:176}}});
  let content=column;if(destination==='archive'){const component=nodes(column,n=>n.type?.name==='GoNoteArchiveColumn')[0];assert.equal(component.props.expanded,true);content=component.type(component.props);}
  const scroll=nodes(content,n=>n.type==='ScrollView'&&n.props.onContentSizeChange)[0];assert.ok(scroll);scroll.props.ref({measureInWindow:fn=>fn(0,100,176,400),scrollTo:options=>scrolls.push(['y',options])});scroll.props.onLayout({nativeEvent:{layout:{height:400}}});scroll.props.onContentSizeChange(176,3000);scroll.props.onScroll?.({nativeEvent:{contentOffset:{y:100}}});
  const card=nodes(content,n=>n.props.testID===(destination==='archive'?'calendar-archived-note-':'calendar-entry-')+entry.id)[0];assert.ok(card);card.props.ref({measureInWindow:fn=>fn(810,1200,160,120)});card.props.onLayout?.();return{scroll,card,horizontal};
 };
 return{f,props,scrolls,layout,render:()=>tree=f.render(AgendaBoard,props)};
}
for(const destination of ['calendar','pending','archive'])test('the real calendar reveals exactly the saved '+destination+' note after its native column and card are measurable, once',async()=>{
 const disk=await h.diskFixture();try{
  const {entry}=await disk.api().saveUnifiedNote(disk.draft({destination,dateISO:'2027-01-15',time:'18:37',content:'Objeto real '+destination}),disk.scope,disk.active),m=mount(entry,destination);m.f.runTimers();assert.equal(m.scrolls.length,0);const before=JSON.stringify(disk.rows);
  m.layout();m.f.runTimers();assert.deepEqual(m.scrolls.map(c=>c[0]),['x','y']);assert.ok(m.scrolls[1][1].y>0);m.render();m.layout();m.f.runTimers();assert.equal(m.scrolls.length,2);assert.equal(JSON.stringify(disk.rows),before);
 }finally{disk.close();}
});
test('manual scroll cancels an unfinished note reveal, preserving existing calendar gesture ownership and the stored identity',async()=>{
 const disk=await h.diskFixture();try{const {entry}=await disk.api().saveUnifiedNote(disk.draft({destination:'pending'}),disk.scope,disk.active),m=mount(entry,'pending');const {scroll}=m.layout();scroll.props.onScrollBeginDrag();m.f.runTimers();assert.equal(m.scrolls.length,0);assert.equal(disk.rows[0].id,entry.id);}finally{disk.close();}
});
test('navigation targets cannot expose another account/context, a deleted note, or an invented calendar time',()=>{
 const model=h.load('lib/unifiedNotes.ts'),nav=h.load('lib/goNoteNavigation.ts',{'./unifiedNotes':model}),scope={userId:'owner',context:'demo:USER'},entry=model.buildNoteEntry({...model.noteDraft(),content:'Nota',destination:'calendar',dateISO:'2027-01-15',time:'18:37'},scope);
 assert.equal(nav.savedNoteTarget(entry,scope,1).entryId,entry.id);for(const patch of [{ownerUserId:'other'},{taskContext:'demo:BUSINESS'},{deleted:true},{time:'25:00'}])assert.throws(()=>nav.savedNoteTarget({...entry,...patch},scope,1));
});

test('removing a note time retains its real calendar day and reuses the existing untimed lane/focus without inventing midnight',async()=>{
 const disk=await h.diskFixture();try{const {entry}=await disk.api().saveUnifiedNote(disk.draft({destination:'calendar',dateISO:'2027-01-15',time:''}),disk.scope,disk.active),nav=h.load('lib/goNoteNavigation.ts',{'./unifiedNotes':disk.model}),target=nav.savedNoteTarget(entry,disk.scope,1);assert.equal(target.timeHHMM,'');assert.equal(target.dateISO,'2027-01-15');const m=mount(entry,'calendar');m.layout();m.f.runTimers();assert.deepEqual(m.scrolls.map(row=>row[0]),['x','y']);assert.equal(disk.rows[0].time,'');}finally{disk.close();}
});
