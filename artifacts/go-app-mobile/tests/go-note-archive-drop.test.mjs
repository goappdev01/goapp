import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import {fixture} from './helpers/calendar-fixture.mjs';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
const flat=s=>Object.assign({},...(Array.isArray(s)?s.flat(Infinity):[s]).filter(Boolean)),nodes=(n,p)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...(n.children||[]).flatMap(c=>nodes(c,p))];
async function setup(origin='pending',handedness='right'){
 const disk=await h.diskFixture(),api=disk.api(),draft=disk.draft({title:'Nota que evoluciona',content:'Conservar texto y archivo',destination:origin,dateISO:'2027-01-15',time:'18:30',duration:'90m',place:'Madrid',reminderMinutes:15});draft.attachments=[await disk.fileApi.importNoteFile(disk.scope,draft.id,await disk.sourceFile())];const first=await api.saveUnifiedNote(draft,disk.scope,disk.active);await first.reminderSync;
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=h.ts.createSourceFile('home.tsx',source,h.ts.ScriptTarget.Latest,true,h.ts.ScriptKind.TSX);let fn;function visit(n){if(h.ts.isVariableDeclaration(n)&&n.name.getText(ast)==='moveNoteDestination')fn=n.initializer;h.ts.forEachChild(n,visit);}visit(ast);assert.ok(fn);
 const calls=[],ctx={noteIdentityRef:{current:{ready:true,scope:disk.scope}},openUnifiedNote(){},showToast:(...args)=>calls.push(['toast',...args]),watchNoteReminderReceipt(){},moveUnifiedNote:(...args)=>{calls.push(['move',args[0].id,args[1]]);ctx.pending=api.moveUnifiedNote(...args);return ctx.pending;}};vm.runInNewContext(h.compile('globalThis.move='+fn.getText(ast)),ctx);
 const f=fixture({now:'2027-01-15T12:00:00'}),{AgendaBoard}=f.load('components/AgendaOperativa.tsx');let tree,archiveLayout;const boardX=handedness==='left'?48:24,boardY=100,viewportY=52;
 const render=()=>tree=f.render(AgendaBoard,{goLog:disk.rows.filter(e=>!disk.model.isArchivedNote(e)),archiveNotes:disk.rows.filter(disk.model.isArchivedNote),onOpenNote(){},onMoveNote:ctx.move,handedness,viewMode:'mes_lineal',selectedDateISO:'2027-01-15',calViewMonth:'2027-01'});
 render();tree.props.ref.current={measureInWindow:cb=>cb(boardX,boardY)};tree.props.onLayout();let x=0;for(const col of nodes(tree,n=>n.props.key&&n.props.onLayout&&flat(n.props.style).width)){const width=flat(col.props.style).width;col.props.onLayout({nativeEvent:{layout:{x,y:0,width,height:520}}});if(col.props.key==='notes')archiveLayout={x,width};x+=width+10;}
 const scroll=()=>nodes(tree,n=>n.type==='GHScrollView'&&n.props.horizontal)[0];scroll().props.onLayout({nativeEvent:{layout:{x:0,y:viewportY,width:390,height:520}}});scroll().props.onScroll({nativeEvent:{contentOffset:{x:archiveLayout.x-70}}});
 const xAtArchive=boardX+70+archiveLayout.width/2,card=()=>nodes(tree,n=>n.type==='GestureDetector'&&n.props.key===draft.id)[0],gesture=()=>card().props.gesture;
 return{disk,api,draft,ctx,calls,f,render,scroll,get tree(){return tree;},xAtArchive,yHeader:boardY+viewportY+10,yContent:boardY+viewportY+240,yOutside:boardY+viewportY-5,
  start(){const g=gesture();g._onStart({absoluteX:xAtArchive+200,absoluteY:300,y:20,velocityX:0});render();return g;},
  update(g,y=boardY+viewportY+240){g._onUpdate({absoluteX:xAtArchive,absoluteY:y,y:20,velocityX:0});render();},
  drop(g,{success=true,x=xAtArchive,y=boardY+viewportY+240}={}){g._onFinalize({absoluteX:x,absoluteY:y,y:20,velocityX:0},success);render();},
  archive(){const node=nodes(tree,n=>n.type?.name==='GoNoteArchiveColumn')[0];return node;},close:()=>disk.close()};
}

for(const origin of ['pending','calendar'])for(const handedness of ['left','right'])for(const zone of ['Header','Content'])test(origin+' → archive / '+handedness+' / '+zone+': the real pan targets the scrolled column and persists one ID with metadata and no alarm',async()=>{
 const f=await setup(origin,handedness);try{
  const writes=f.disk.writes,g=f.start(),y=f['y'+zone];assert.equal(g._activateAfterLongPress,400);assert.equal(f.scroll().props.scrollEnabled,false);f.update(g,y);assert.equal(f.archive().props.dropActive,true);assert.equal(f.disk.writes,writes,'hover is not persistence');
  f.drop(g,{y});const result=await f.ctx.pending;await result.reminderSync;f.render();assert.equal(f.calls.filter(c=>c[0]==='move').length,1);assert.equal(f.disk.rows.length,1);const entry=f.disk.rows[0];assert.equal(entry.id,f.draft.id);assert.equal(entry.note.destination,'archive');assert.equal(entry.note.content,f.draft.content);assert.equal(entry.note.attachments[0].id,f.draft.attachments[0].id);assert.equal(entry.note.schedule.time,f.draft.time);assert.equal(entry.note.schedule.duration,'90m');assert.equal(entry.note.reminderMinutes,15,'configuration retained, OS schedule removed');assert.equal(f.disk.osRequests.size,0);assert.equal(f.archive().props.entries.length,1);assert.equal(f.scroll().props.scrollEnabled,true);assert.equal(nodes(f.tree,n=>n.type==='GestureDetector'&&n.props.key===entry.id).length,0);
  f.drop(g,{y});assert.equal(f.calls.filter(c=>c[0]==='move').length,1,'a repeated finalizer cannot execute another move');const [reopened]=await f.disk.reopen();assert.equal(reopened.id,entry.id);assert.equal(reopened.note.destination,'archive');
 }finally{f.close();}
});

test('an incomplete drag or release outside the archive vertical bounds leaves the original note and clears the cue',async()=>{
 const f=await setup();try{const writes=f.disk.writes;let g=f.start();f.update(g);assert.equal(f.archive().props.dropActive,true);f.drop(g,{success:false});assert.equal(f.calls.length,0);assert.equal(f.disk.writes,writes);assert.equal(f.archive().props.dropActive,false);g=f.start();f.update(g);f.drop(g,{y:f.yOutside});assert.equal(f.calls.length,0);assert.equal(f.disk.rows[0].note.destination,'pending');assert.equal(f.scroll().props.scrollEnabled,true);}finally{f.close();}
});

test('a failed disk write restores the source card and a new drag retries without losing attachments or duplicating a note',async()=>{
 const f=await setup('calendar');try{f.disk.failWrite(true);let g=f.start();f.update(g);f.drop(g);await assert.rejects(f.ctx.pending,/disco/);await new Promise(r=>setImmediate(r));f.render();assert.equal(f.disk.rows[0].note.destination,'calendar');assert.equal(f.archive().props.entries.length,0);assert.ok(f.calls.some(c=>c[0]==='toast'&&c[2]==='error'));assert.equal(f.scroll().props.scrollEnabled,true);
  f.disk.failWrite(false);g=f.start();f.update(g);f.drop(g);await f.ctx.pending;f.render();assert.equal(f.disk.rows.length,1);assert.equal(f.disk.rows[0].note.destination,'archive');assert.equal(f.disk.rows[0].note.attachments[0].id,f.draft.attachments[0].id);
 }finally{f.close();}
});

test('a normal GO task without a unified note cannot be archived and account changes cannot commit a dragged private note',async()=>{
 const f=await setup();try{await f.disk.store.updateGoLog(rows=>({entries:rows.map(({note,...entry})=>entry),result:null}));f.render();let g=f.start();f.update(g);assert.equal(f.archive().props.dropActive,false);f.drop(g);assert.equal(f.calls.length,0);assert.equal(f.disk.rows.length,1);}finally{f.close();}
 const owned=await setup();try{const g=owned.start();owned.update(g);await owned.disk.setUser('another-user');owned.drop(g);await assert.rejects(owned.ctx.pending);assert.equal(owned.disk.rows[0].note.destination,'pending');}finally{owned.close();}
});

test('archive uses the same column width and measured shared-header height, with a live count in the upper right including zero',()=>{
 for(const compact of [false,true]){const f=fixture(),{AgendaBoard}=f.load('components/AgendaOperativa.tsx');let entries=[];const props=()=>({goLog:[],archiveNotes:entries,onOpenNote(){},viewMode:'semana',...(compact?{renderHeader:()=>null}:{})});let tree=f.render(AgendaBoard,props());let columns=nodes(tree,n=>n.props.key&&n.props.onLayout&&flat(n.props.style).width);assert.equal(flat(columns.find(n=>n.props.key==='notes').props.style).width,flat(columns.find(n=>n.props.key==='retrasados').props.style).width);
  const pending=columns.find(n=>n.props.key==='retrasados'),header=nodes(pending,n=>n.props.onLayout&&flat(n.props.style).paddingHorizontal===10)[0];header.props.onLayout({nativeEvent:{layout:{height:compact?45:57}}});
  for(const count of [0,1,3,0]){entries=Array.from({length:count},(_,i)=>({id:String(i),notes:'Nota '+i,note:{title:'Nota '+i,attachments:[]}}));tree=f.render(AgendaBoard,props());const col=nodes(tree,n=>n.type?.name==='GoNoteArchiveColumn')[0];assert.equal(col.props.headerHeight,compact?45:57);assert.equal(col.props.expanded,true);const rendered=col.type(col.props),counter=nodes(rendered,n=>n.props.testID==='notes-archive-count')[0];assert.equal(flat(counter.props.style).right,5);assert.equal(flat(counter.props.style).top,5);assert.equal(counter.children[0].children[0],count);assert.equal(flat(nodes(rendered,n=>n.props.testID==='notes-archive-header')[0].props.style).height,compact?45:57);}
 }
});
