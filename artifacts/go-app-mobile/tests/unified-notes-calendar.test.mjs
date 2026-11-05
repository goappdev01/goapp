import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import {fixture} from './helpers/calendar-fixture.mjs';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
const nodes=(n,p)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...(n.children||[]).flatMap(c=>nodes(c,p))];
const style=s=>Array.isArray(s)?Object.assign({},...s.filter(Boolean)):s;
for(const viewMode of ['dia','semana','mes_lineal'])test(viewMode+': NOTAS ARCHIVO opens readable before PENDIENTES; manual folding retains its full heading and day widths',async()=>{
 const disk=await h.diskFixture();try{const {entry}=await disk.api().saveUnifiedNote(disk.draft({content:'Consultar documento'}),disk.scope,disk.active);
 const app=fixture({now:'2027-01-01T12:00:00'}),{AgendaBoard}=app.load('components/AgendaOperativa.tsx'),opens=[],moves=[];
 const props={goLog:[],archiveNotes:[entry],onOpenNote:e=>opens.push(e),onMoveNote:(e,d)=>moves.push([e,d]),viewMode,selectedDateISO:'2027-01-01',calViewMonth:'2027-01'};
 let tree=app.render(AgendaBoard,props),columns=nodes(tree,n=>n.props.key&&n.props.onLayout&&style(n.props.style)?.width);
 const noteIndex=columns.findIndex(c=>c.props.key==='notes');assert.ok(noteIndex>=0);assert.equal(columns[noteIndex+1].props.key,'retrasados');assert.equal(columns.filter(c=>c.props.key==='notes').length,1);assert.equal(style(columns[noteIndex].props.style).width,style(columns[noteIndex+1].props.style).width);
 const component=nodes(tree,n=>n.type?.name==='GoNoteArchiveColumn')[0];assert.equal(component.props.expanded,true);assert.equal(component.props.entries[0].id,entry.id);
 const dayWidth=style(columns[noteIndex+1].props.style).width;component.props.onToggle();tree=app.render(AgendaBoard,props);
 const folded=nodes(tree,n=>n.type?.name==='GoNoteArchiveColumn')[0];assert.equal(folded.props.expanded,false);columns=nodes(tree,n=>n.props.key&&n.props.onLayout&&style(n.props.style)?.width);assert.equal(style(columns.find(c=>c.props.key==='retrasados').props.style).width,dayWidth);assert.equal(style(columns.find(c=>c.props.key==='notes').props.style).width,dayWidth);folded.props.onToggle();tree=app.render(AgendaBoard,props);const expanded=nodes(tree,n=>n.type?.name==='GoNoteArchiveColumn')[0];assert.equal(expanded.props.expanded,true);
 const content=expanded.type(expanded.props),open=nodes(content,n=>n.type==='GestureDetector'&&n.props.gesture?._maxDuration===350)[0];
 open.props.gesture._onEnd({},false);assert.equal(opens.length,0);
 open.props.gesture._onEnd({},true);assert.equal(opens[0].id,entry.id);
 const actions=nodes(content,n=>n.props.onPress&&n.props.key==='pending');assert.equal(actions.length,1);actions[0].props.onPress();assert.equal(moves[0][0].id,entry.id);assert.equal(moves[0][1],'pending');assert.equal(disk.rows.length,1,'render and opening cannot duplicate/write notes');
 }finally{disk.close();}
});
test('the actual card drag finalizer targets the laid-out day once; cancellation does not move and pending identity survives scheduling',async()=>{
 const disk=await h.diskFixture();try{const {entry}=await disk.api().saveUnifiedNote(disk.draft({destination:'pending'}),disk.scope,disk.active),app=fixture({now:'2027-01-01T12:00:00'}),{AgendaBoard}=app.load('components/AgendaOperativa.tsx'),drops=[];
 const props={goLog:[entry],archiveNotes:[],onOpenNote:()=>{},viewMode:'mes_lineal',calViewMonth:'2027-01',onOpenMoveFlow:(...args)=>drops.push(args)};
 let tree=app.render(AgendaBoard,props),columns=nodes(tree,n=>n.props.key&&n.props.onLayout&&style(n.props.style)?.width);let x=0,target;
 for(const col of columns){const width=style(col.props.style).width;col.props.onLayout({nativeEvent:{layout:{x,width,y:0,height:500}}});if(col.props.key==='day_2027-01-15')target=x+width/2;x+=width+10;}
 assert.ok(target);const card=nodes(tree,n=>n.type==='GestureDetector'&&n.props.key===entry.id)[0];assert.ok(card);
 const pan=card.props.gesture;assert.equal(typeof pan._onStart,'function');assert.equal(pan._activateAfterLongPress,400);
 const event={absoluteX:target,absoluteY:200,y:20,velocityX:0};pan._onStart(event);pan._onFinalize(event,false);assert.equal(drops.length,0);assert.equal(disk.rows[0].note.destination,'pending');
 tree=app.render(AgendaBoard,props);const second=nodes(tree,n=>n.type==='GestureDetector'&&n.props.key===entry.id)[0].props.gesture;second._onStart(event);second._onFinalize(event,true);
 assert.equal(drops.length,1);assert.equal(drops[0][0],entry.id);assert.equal(drops[0][1],'2027-01-15');assert.equal(disk.rows[0].dateISO,'','a drop asks for a valid time before committing');
 await disk.api().moveUnifiedNote(entry,'calendar',disk.scope,disk.active,{dateISO:drops[0][1],time:'05:20'});assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].id,entry.id);assert.equal(disk.rows[0].time,'05:20');
 }finally{disk.close();}
});
test('the shared native note drag supports all six moves between Calendar, Pending and Archive, including a legacy note',async()=>{
 const disk=await h.diskFixture();try{
  const {entry:archived}=await disk.api().saveUnifiedNote(disk.draft({destination:'archive',id:'archived-drag',dateISO:'2027-01-12',time:'17:30'}),disk.scope,disk.active);
  const {entry:pending}=await disk.api().saveUnifiedNote(disk.draft({destination:'pending',id:'pending-drag'}),disk.scope,disk.active);
  const {entry:calendar}=await disk.api().saveUnifiedNote(disk.draft({destination:'calendar',id:'calendar-drag',dateISO:'2027-01-10',time:'17:30'}),disk.scope,disk.active);
  const legacy={id:'legacy-note',kind:'sent',type:'TAREA_INTERNA',intentKey:'nota_interna',intentLabel:'Tarea interna',ownerUserId:disk.scope.userId,taskContext:disk.scope.context,estado:'pendiente',notes:'Nota antigua',detail:'Conservar la nota anterior',dateISO:'2027-01-11',time:'16:00',duration:'30min'};
  assert.equal(disk.model.noteEntryDestination(legacy),'calendar');
  const cases=[
   {name:'calendar to pending',entry:calendar,destination:'pending',source:'calendar'},
   {name:'pending to calendar',entry:pending,destination:'calendar',source:'pending'},
   {name:'calendar to archive (legacy)',entry:legacy,destination:'archive',source:'calendar'},
   {name:'pending to archive',entry:pending,destination:'archive',source:'pending'},
   {name:'archive to calendar',entry:archived,destination:'calendar',source:'archive'},
   {name:'archive to pending',entry:archived,destination:'pending',source:'archive'},
  ];
  for(const scenario of cases){
   const app=fixture({now:'2027-01-01T12:00:00'}),{AgendaBoard}=app.load('components/AgendaOperativa.tsx'),moves=[];
   const props={goLog:scenario.source==='archive'?[]:[scenario.entry],archiveNotes:scenario.source==='archive'?[scenario.entry]:[],onOpenNote(){},onMoveNote:(...args)=>moves.push(args),viewMode:'mes_lineal',calViewMonth:'2027-01'};
   const tree=app.render(AgendaBoard,props),columns=nodes(tree,n=>n.props.key&&n.props.onLayout&&style(n.props.style)?.width);let x=0,targetX,archiveView;
   for(const col of columns){const width=style(col.props.style).width;col.props.onLayout({nativeEvent:{layout:{x,width,y:0,height:500}}});if((scenario.destination==='calendar'&&col.props.key==='day_2027-01-15')||(scenario.destination==='pending'&&col.props.key==='retrasados')||(scenario.destination==='archive'&&col.props.key==='notes'))targetX=x+width/2;x+=width+10;}
   assert.ok(targetX,scenario.name+': destination column was laid out');
   let card=nodes(tree,n=>n.type==='GestureDetector'&&n.props.key===scenario.entry.id)[0];
   if(!card&&scenario.source==='archive'){
    archiveView=nodes(tree,n=>n.type?.name==='GoNoteArchiveColumn')[0];assert.ok(archiveView,scenario.name+': archive column rendered');
    card=nodes(archiveView.type(archiveView.props),n=>n.type==='GestureDetector'&&n.props.key===scenario.entry.id)[0];
   }
   assert.ok(card,scenario.name+': actual note drag recognizer rendered');
   const pan=card.props.gesture,event={absoluteX:targetX,absoluteY:200,y:18,velocityX:0};pan._onStart(event);pan._onUpdate(event);pan._onFinalize(event,true);
   assert.equal(moves.length,1,scenario.name+': one shared drag dispatch');assert.equal(moves[0][0].id,scenario.entry.id);assert.equal(moves[0][1],scenario.destination);
   if(scenario.destination==='calendar'){assert.equal(moves[0][2].dateISO,'2027-01-15');assert.equal(moves[0][2].time,scenario.entry.time||scenario.entry.note?.schedule.time||'');}
   assert.equal(disk.rows.length,3,'dragging legacy/current notes must not write or duplicate data itself');
  }
 }finally{disk.close();}
});

for(const [density,expected] of [['15min','13:45'],['30min','13:30'],['1h','13:00']])test(`dropping a pending note on the rendered ${density} calendar slot assigns its exact start time; cancelled drags do not move it`,async()=>{
 const disk=await h.diskFixture();try{
  const {entry}=await disk.api().saveUnifiedNote(disk.draft({id:`slot-${density}`,destination:'pending',dateISO:'',time:''}),disk.scope,disk.active),app=fixture({now:'2027-01-01T12:00:00'}),{AgendaBoard}=app.load('components/AgendaOperativa.tsx'),moves=[],created=[];
  const props={goLog:[entry],archiveNotes:[],onOpenNote(){},onMoveNote:(...args)=>moves.push(args),onCreateTaskAtTime:(...args)=>created.push(args),density,viewMode:'mes_lineal',selectedDateISO:'2027-01-15',calViewMonth:'2027-01'};
  let tree=app.render(AgendaBoard,props);const root=tree,boardX=24,boardY=100,viewportY=52;root.props.ref.current={measureInWindow:cb=>cb(boardX,boardY)};root.props.onLayout();
  const columns=nodes(tree,n=>n.type==='View'&&n.props.key&&n.props.onLayout&&style(n.props.style)?.width);let columnX=0,targetColumn;
  for(const col of columns){const width=style(col.props.style).width;col.props.onLayout({nativeEvent:{layout:{x:columnX,y:0,width,height:2600}}});if(col.props.key==='day_2027-01-15')targetColumn={x:columnX,width};columnX+=width+10;}
  assert.ok(targetColumn,'target day exists');const targetRow=nodes(tree,n=>n.props.testID===`calendar-drop-slot-2027-01-15-${expected}`)[0];assert.ok(targetRow,'configured interval renders the expected slot');
  const horizontal=nodes(tree,n=>n.type==='GHScrollView'&&n.props.horizontal)[0];horizontal.props.onLayout({nativeEvent:{layout:{x:0,y:viewportY,width:390,height:520}}});horizontal.props.onScroll({nativeEvent:{contentOffset:{x:targetColumn.x+targetColumn.width/2-100}}});
  const dayScroll=nodes(tree,n=>n.type==='ScrollView'&&n.props.testID==='calendar-day-scroll-day_2027-01-15')[0];assert.ok(dayScroll,'target day has its own measured vertical scroll viewport');dayScroll.props.onLayout({nativeEvent:{layout:{x:0,y:70,width:176,height:420}}});
  const rowY=expected==='13:45'?700:expected==='13:30'?600:500,rowHeight=expected==='13:45'?28:expected==='13:30'?36:50;
  const wrapper=nodes(dayScroll,n=>n.type?.name==="GoCalendarSlot"&&n.props.timeHHMM===expected)[0];
  assert.ok(wrapper,"empty slot has a tap wrapper");
  assert.equal(targetRow.props.onLayout,undefined);
  wrapper.props.onLayout({nativeEvent:{layout:{x:0,y:rowY,width:176,height:rowHeight}}});
  const scrollY=400; dayScroll.props.onScroll({nativeEvent:{contentOffset:{y:scrollY}}});
  const absX=boardX+100,absY=boardY+viewportY+70+rowY-scrollY+rowHeight/2,event={absoluteX:absX,absoluteY:absY,y:18,velocityX:0};
  const card=nodes(tree,n=>n.type==='GestureDetector'&&n.props.key===entry.id)[0];assert.ok(card,'pending note uses the real pan recognizer');let pan=card.props.gesture;
  pan._onStart(event);pan._onUpdate(event);tree=app.render(AgendaBoard,props);const highlighted=nodes(tree,n=>n.props.testID===targetRow.props.testID)[0],highlight=nodes(highlighted,n=>n.props.testID==="calendar-drop-slot-highlight")[0];assert.deepEqual(style(highlighted.props.style),style(targetRow.props.style));assert.ok(highlight,'the exact slot under the finger is highlighted');assert.equal(nodes(tree,n=>n.props.testID==="calendar-drop-time")[0].children[0],expected);
  assert.equal(created.length,0,'a drag cannot trigger the empty-slot tap action');pan._onFinalize(event,false);tree=app.render(AgendaBoard,props);assert.equal(moves.length,0,'cancel does not move the note');assert.equal(nodes(tree,n=>n.props.testID==="calendar-drop-slot-highlight").length,0,'cancel clears the slot cue');
  const nextCard=nodes(tree,n=>n.type==='GestureDetector'&&n.props.key===entry.id)[0];pan=nextCard.props.gesture;pan._onStart(event);pan._onUpdate(event);tree=app.render(AgendaBoard,props);pan._onFinalize(event,true);
  assert.equal(moves.length,1,'drop dispatches one move');assert.equal(moves[0][0].id,entry.id);assert.equal(moves[0][1],'calendar');assert.deepEqual(JSON.parse(JSON.stringify(moves[0][2])),{dateISO:'2027-01-15',time:expected});
  await disk.api().moveUnifiedNote(moves[0][0],moves[0][1],disk.scope,disk.active,moves[0][2]);
  assert.equal(disk.rows.length,1,'saving the drop keeps one note');
  assert.equal(disk.rows[0].id,entry.id);
  assert.equal(disk.rows[0].dateISO,'2027-01-15');
  assert.equal(disk.rows[0].time,expected);
 }finally{disk.close();}
});
test('existing calendar note can remove its date by moving to pending and can remove its time without losing its date',async()=>{
 const disk=await h.diskFixture();try{
  const {entry}=await disk.api().saveUnifiedNote(disk.draft({destination:'calendar',id:'clear-date-time',dateISO:'2027-01-12',time:'19:45'}),disk.scope,disk.active);
  const dateEditor=await h.editorFixture({initial:entry,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{
   await dateEditor.tool('date');assert.ok(dateEditor.hosts.has('note-date-clear'));await dateEditor.tap('note-date-clear');await dateEditor.idle();
   assert.equal(disk.rows[0].note.destination,'pending');assert.equal(disk.rows[0].note.schedule.dateISO,'');assert.equal(disk.rows[0].id,entry.id);
  }finally{await dateEditor.close();}
  const restored=await disk.api().moveUnifiedNote(disk.rows[0],'calendar',disk.scope,disk.active,{dateISO:'2027-01-12',time:'19:45'});
  const timeEditor=await h.editorFixture({initial:restored.entry,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{
   await timeEditor.tool('time');assert.ok(timeEditor.hosts.has('note-time-clear'));await timeEditor.tap('note-time-clear');await timeEditor.idle();
   assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].note.schedule.time,'');assert.equal(disk.rows[0].note.schedule.dateISO,'2027-01-12');assert.equal(disk.rows[0].id,entry.id);
  }finally{await timeEditor.close();}
 }finally{disk.close();}
});
test('existing note offers red delete action in tools and only soft deletes after explicit confirmation',async()=>{
 const disk=await h.diskFixture();try{
  const {entry}=await disk.api().saveUnifiedNote(disk.draft({destination:'archive',id:'delete-note-confirm'}),disk.scope,disk.active),deleted=[];
  const ui=await h.editorFixture({initial:entry,onDelete:async item=>deleted.push(item.id)});try{
   if(!ui.hosts.get('note-tools-toggle').accessibilityState.expanded)await ui.tap('note-tools-toggle');
   const action=ui.hosts.get('note-delete');assert.ok(action);assert.equal(action.accessibilityLabel,'Eliminar nota');assert.match(JSON.stringify(action.style),/b4232f/i);
   await ui.tap('note-delete');assert.equal(deleted.length,0);assert.equal(ui.alerts.length,1);assert.equal(ui.alerts[0].buttons.at(-1).style,'destructive');assert.equal(ui.alerts[0].buttons.at(-1).text,'ELIMINAR NOTA');
   await ui.run(()=>ui.alerts[0].buttons.at(-1).onPress());await ui.idle();assert.deepEqual(deleted,[entry.id]);assert.equal(ui.calls.filter(call=>call[0]==='close').length,1);
  }finally{await ui.close();}
 }finally{disk.close();}
});
test('Home scheduling opens the same note editor, preserves content on cancellation, and never runs booking or generic GO writes',async()=>{
 const disk=await h.diskFixture();try{const {entry}=await disk.api().saveUnifiedNote(disk.draft({destination:'pending'}),disk.scope,disk.active);
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=h.ts.createSourceFile('home.tsx',source,h.ts.ScriptTarget.Latest,true,h.ts.ScriptKind.TSX),all=[];function visit(n){all.push(n);h.ts.forEachChild(n,visit);}visit(ast);
 const open=[],ctx={personalGoLog:[entry],noteDocument:disk.model.noteDocument,openUnifiedNote:(...args)=>open.push(h.plain(args)),customerBookings:{entries:[]},setGoLog:()=>assert.fail('note drag must not call a generic optimistic writer'),setCalOpen:()=>assert.fail('no intermediate calendar route')};
 const declaration=name=>all.find(n=>h.ts.isVariableDeclaration(n)&&n.name.getText(ast)===name).initializer.getText(ast);
 vm.runInNewContext(h.compile('globalThis.move = '+declaration('moveGoToDay')),ctx);ctx.move(entry.id,'2027-01-15','');assert.equal(open.length,1);assert.equal(open[0][0].id,entry.id);assert.equal(open[0][1].destination,'calendar');assert.equal(disk.rows[0].note.destination,'pending');
 const ui=await h.editorFixture({initial:entry,seed:open[0][1],onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{await ui.exit();assert.equal(disk.rows[0].note.destination,'pending');assert.equal(disk.rows.length,1);}finally{await ui.close();}
 }finally{disk.close();}
});

test('the real Home GUARDAR callback and mounted editor persist/read back a phrase, then reopen the same note',async()=>{
 const disk=await h.diskFixture();try{
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=h.ts.createSourceFile('home.tsx',source,h.ts.ScriptTarget.Latest,true,h.ts.ScriptKind.TSX),all=[];function visit(n){all.push(n);h.ts.forEachChild(n,visit);}visit(ast);
 const fn=all.find(n=>h.ts.isFunctionDeclaration(n)&&n.name?.text==='renderUnifiedNoteEditor'),saved=all.find(n=>h.ts.isFunctionDeclaration(n)&&n.name?.text==='handleUnifiedNoteSaved'),calls=[],identity={ready:true,scope:disk.scope};
 const ctx={watchNoteReminderReceipt(){},openSavedNoteDestination(){},showToast(){},unifiedNoteOriginRef:{current:'landing'},renderSavedNoteActions(){},React:h.React,GoNoteEditor:'Editor',noteIdentity:identity,noteIdentityRef:{current:identity},notesOpen:true,unifiedNoteInitial:null,handedness:'right',unifiedNoteCache:{current:null},unifiedNoteSeed:{},quickNoteText:'',quickNoteDetail:'',saveUnifiedNote:disk.api().saveUnifiedNote,AsyncStorage:{removeItem:async key=>calls.push(['remove',key])},setQuickNoteText:text=>calls.push(['title',text]),setQuickNoteDetail:text=>calls.push(['detail',text])};
 const save=all.find(n=>h.ts.isFunctionDeclaration(n)&&n.name?.text==='saveNoteDraft');assert.ok(save);assert.ok(saved);
 vm.runInNewContext(h.compile(save.getText(ast)+';'+saved.getText(ast)+';'+fn.getText(ast)+';globalThis.renderEditor=renderUnifiedNoteEditor;'),ctx);const element=ctx.renderEditor();assert.equal(element.props.visible,true);
 const ui=await h.editorFixture({scope:element.props.scope,onSave:element.props.onSave});try{
 await ui.run(()=>ui.hosts.get('note-content').onChangeText('Frase del Landing sin título'));await ui.run(()=>ui.hosts.get('note-destination-pending').onPress());disk.failWrite(true);await ui.run(()=>ui.hosts.get('unified-note-save').onPress());await ui.idle();assert.equal(calls.length,0);assert.equal(disk.rows.length,0);
 disk.failWrite(false);await ui.run(()=>ui.hosts.get('unified-note-save').onPress());await ui.idle();assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].note.content,'Frase del Landing sin título');
 assert.deepEqual(calls,[['title',''],['detail','']],'saving a unified note preserves the separate legacy GO task draft');
 const [loaded]=await disk.reopen(),reopened=await h.editorFixture({initial:loaded});try{assert.equal(reopened.hosts.get('note-content').value,'Frase del Landing sin título');}finally{await reopened.close();}
 }finally{await ui.close();}
 }finally{disk.close();}
});

test('the real Home projection excludes archived and other-account/context notes while preserving existing reservations',async()=>{
 const disk=await h.diskFixture();try{const make=(destination,id,owner=disk.scope.userId,context=disk.scope.context)=>({...disk.model.buildNoteEntry(disk.draft({destination,dateISO:'2027-01-15',time:'18:30',id}),disk.scope),ownerUserId:owner,taskContext:context});
 const archive=make('archive','archive'),pending=make('pending','pending'),calendar=make('calendar','calendar'),foreign=make('calendar','foreign','another'),company=make('pending','company',disk.scope.userId,'demo:BUSINESS:another'),booking={id:'booking',customerBooking:true};
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=h.ts.createSourceFile('home.tsx',source,h.ts.ScriptTarget.Latest,true,h.ts.ScriptKind.TSX);let declaration;function visit(n){if(h.ts.isVariableDeclaration(n)&&n.name.getText(ast)==='completionEntries')declaration=n;h.ts.forEachChild(n,visit);}visit(ast);
 const ctx={useMemo:fn=>fn(),personalGoLog:[archive,pending,calendar,foreign,company],customerBookings:{entries:[booking]},mergeCustomerBookingEntries:(a,b)=>[...a,...b],canReadBoardTask:()=>true,isArchivedNote:disk.model.isArchivedNote,noteDocument:disk.model.noteDocument,noteInScope:disk.model.noteInScope,goView:{view:'USER'},adminAccess:{allowed:true,checking:false},completionIdentity:{ready:true,scope:disk.scope}};
 vm.runInNewContext(h.compile('globalThis.rows='+declaration.initializer.getText(ast)),ctx);assert.deepEqual(h.plain(ctx.rows).map(e=>e.id),['pending','calendar','booking']);ctx.completionIdentity.ready=false;
 vm.runInNewContext(h.compile('globalThis.rows='+declaration.initializer.getText(ast)),ctx);assert.deepEqual(h.plain(ctx.rows).map(e=>e.id),['booking']);
 }finally{disk.close();}
});

test('the real saved-note Home renderer reuses the editor/save path without clearing a different creation draft',async()=>{
 const disk=await h.diskFixture();try{
  const {entry}=await disk.api().saveUnifiedNote(disk.draft({content:'Nota existente',time:'19:30'}),disk.scope,disk.active),source=fs.readFileSync('app/index.tsx','utf8'),tree=h.ts.createSourceFile('home.tsx',source,h.ts.ScriptTarget.Latest,true,h.ts.ScriptKind.TSX),all=[];function visit(n){all.push(n);h.ts.forEachChild(n,visit);}visit(tree);
  const functions=['renderExistingNote','saveNoteDraft','cacheNoteDraft'].map(name=>{const fn=all.find(n=>h.ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(fn);return fn.getText(tree);}).join('\n');
  const calls=[],identity={ready:true,scope:disk.scope},creation=disk.draft({content:'Borrador de otra nota'}),cache={current:{scope:JSON.stringify(disk.scope),draft:creation}},edits={current:new Map()},ctx={watchNoteReminderReceipt(){},React:h.React,GoNoteEditor:'Editor',noteIdentity:identity,noteIdentityRef:{current:identity},handedness:'left',unifiedNoteCache:cache,unifiedNoteEditCache:edits,renderSavedNoteActions(){},deleteSavedNote:entry=>calls.push(['delete',entry.id]),saveUnifiedNote:disk.api().saveUnifiedNote,AsyncStorage:{removeItem:async key=>calls.push(['remove',key])},setQuickNoteText:text=>calls.push(['title',text]),setQuickNoteDetail:text=>calls.push(['detail',text])};
  vm.runInNewContext(h.compile(functions+';globalThis.renderExisting=renderExistingNote;'),ctx);const element=ctx.renderExisting(entry,()=>calls.push(['close']),{onGoToLanding:()=>calls.push(['landing'])});assert.equal(element.props.initial.id,entry.id);assert.equal(element.props.handedness,'left');assert.equal(element.props.visible,true);
  const ui=await h.editorFixture({initial:element.props.initial,scope:element.props.scope,onSave:element.props.onSave});try{await ui.pickTime('20','00');await ui.idle();assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].note.schedule.time,'20:00');assert.equal(calls.length,0);assert.equal(cache.current.draft.id,creation.id);
   const draft={...disk.model.noteDraft(disk.rows[0]),content:'Texto recuperable'};element.props.onClose({draft,saved:false});assert.equal(edits.current.get(JSON.stringify(disk.scope)+':'+entry.id).content,'Texto recuperable');assert.equal(cache.current.draft.content,'Borrador de otra nota');assert.equal(calls.at(-1)[0],'close');
  }finally{await ui.close();}
 }finally{disk.close();}
});
