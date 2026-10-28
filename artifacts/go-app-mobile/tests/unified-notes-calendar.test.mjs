import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import {fixture} from './helpers/calendar-fixture.mjs';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
const nodes=(n,p)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...(n.children||[]).flatMap(c=>nodes(c,p))];
const style=s=>Array.isArray(s)?Object.assign({},...s.filter(Boolean)):s;
for(const viewMode of ['dia','semana','mes_lineal'])test(viewMode+': one foldable NOTAS immediately before PENDIENTES, independent day width and real archive actions',async()=>{
 const disk=await h.diskFixture();try{const {entry}=await disk.api().saveUnifiedNote(disk.draft({content:'Consultar documento'}),disk.scope,disk.active);
 const app=fixture({now:'2027-01-01T12:00:00'}),{AgendaBoard}=app.load('components/AgendaOperativa.tsx'),opens=[],moves=[];
 const props={goLog:[],archiveNotes:[entry],onOpenNote:e=>opens.push(e),onMoveNote:(e,d)=>moves.push([e,d]),viewMode,selectedDateISO:'2027-01-01',calViewMonth:'2027-01'};
 let tree=app.render(AgendaBoard,props),columns=nodes(tree,n=>n.props.key&&n.props.onLayout&&style(n.props.style)?.width);
 const noteIndex=columns.findIndex(c=>c.props.key==='notes');assert.ok(noteIndex>=0);assert.equal(columns[noteIndex+1].props.key,'retrasados');assert.equal(columns.filter(c=>c.props.key==='notes').length,1);assert.equal(style(columns[noteIndex].props.style).width,52);
 const component=nodes(tree,n=>n.type?.name==='GoNoteArchiveColumn')[0];assert.equal(component.props.expanded,false);assert.equal(component.props.entries[0].id,entry.id);
 const dayWidth=style(columns[noteIndex+1].props.style).width;component.props.onToggle();tree=app.render(AgendaBoard,props);
 const expanded=nodes(tree,n=>n.type?.name==='GoNoteArchiveColumn')[0];assert.equal(expanded.props.expanded,true);columns=nodes(tree,n=>n.props.key&&n.props.onLayout&&style(n.props.style)?.width);assert.equal(style(columns.find(c=>c.props.key==='retrasados').props.style).width,dayWidth);
 const content=expanded.type(expanded.props),open=nodes(content,n=>n.props.accessibilityLabel==='Abrir nota '+entry.notes)[0];open.props.onPress();assert.equal(opens[0].id,entry.id);
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
test('Home scheduling opens the same note editor, preserves content on cancellation, and never runs booking or generic GO writes',async()=>{
 const disk=await h.diskFixture();try{const {entry}=await disk.api().saveUnifiedNote(disk.draft({destination:'pending'}),disk.scope,disk.active);
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=h.ts.createSourceFile('home.tsx',source,h.ts.ScriptTarget.Latest,true,h.ts.ScriptKind.TSX),all=[];function visit(n){all.push(n);h.ts.forEachChild(n,visit);}visit(ast);
 const open=[],ctx={personalGoLog:[entry],noteDocument:disk.model.noteDocument,openUnifiedNote:(...args)=>open.push(h.plain(args)),customerBookings:{entries:[]},setGoLog:()=>assert.fail('note drag must not call a generic optimistic writer'),setCalOpen:()=>assert.fail('no intermediate calendar route')};
 const declaration=name=>all.find(n=>h.ts.isVariableDeclaration(n)&&n.name.getText(ast)===name).initializer.getText(ast);
 vm.runInNewContext(h.compile('globalThis.move = '+declaration('moveGoToDay')),ctx);ctx.move(entry.id,'2027-01-15','');assert.equal(open.length,1);assert.equal(open[0][0].id,entry.id);assert.equal(open[0][1].destination,'calendar');assert.equal(disk.rows[0].note.destination,'pending');
 const ui=await h.editorFixture({initial:entry,seed:open[0][1],onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active)});try{await ui.run(()=>ui.hosts.get('Cerrar nota').onPress());assert.equal(disk.rows[0].note.destination,'pending');assert.equal(disk.rows.length,1);}finally{await ui.close();}
 }finally{disk.close();}
});

test('the real Home GUARDAR callback and mounted editor persist/read back a phrase, then reopen the same note',async()=>{
 const disk=await h.diskFixture();try{
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=h.ts.createSourceFile('home.tsx',source,h.ts.ScriptTarget.Latest,true,h.ts.ScriptKind.TSX),all=[];function visit(n){all.push(n);h.ts.forEachChild(n,visit);}visit(ast);
 const fn=all.find(n=>h.ts.isFunctionDeclaration(n)&&n.name?.text==='renderUnifiedNoteEditor'),calls=[],identity={ready:true,scope:disk.scope};
 const ctx={React:h.React,GoNoteEditor:'Editor',noteIdentity:identity,noteIdentityRef:{current:identity},notesOpen:true,unifiedNoteInitial:null,handedness:'right',unifiedNoteCache:{current:null},unifiedNoteSeed:{},quickNoteText:'',quickNoteDetail:'',saveUnifiedNote:disk.api().saveUnifiedNote,AsyncStorage:{removeItem:async key=>calls.push(['remove',key])},setQuickNoteText:text=>calls.push(['title',text]),setQuickNoteDetail:text=>calls.push(['detail',text])};
 vm.runInNewContext(h.compile(fn.getText(ast)+';globalThis.renderEditor=renderUnifiedNoteEditor;'),ctx);const element=ctx.renderEditor();assert.equal(element.props.visible,true);
 const ui=await h.editorFixture({scope:element.props.scope,onSave:element.props.onSave});try{
 await ui.run(()=>ui.hosts.get('note-content').onChangeText('Frase del Landing sin título'));disk.failWrite(true);await ui.run(()=>ui.hosts.get('unified-note-save').onPress());await ui.idle();assert.equal(calls.length,0);assert.equal(disk.rows.length,0);
 disk.failWrite(false);await ui.run(()=>ui.hosts.get('unified-note-save').onPress());await ui.idle();assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].note.content,'Frase del Landing sin título');assert.deepEqual(calls,[['title',''],['detail',''],['remove','go_task_draft_v1']]);
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
