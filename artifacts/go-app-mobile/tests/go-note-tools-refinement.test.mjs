import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fixture} from './helpers/calendar-fixture.mjs';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
const flat=s=>Object.assign({},...(Array.isArray(s)?s.flat(Infinity):[s]).filter(Boolean));
const nodes=(n,p)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...(n.children||[]).flatMap(c=>nodes(c,p))];
const edit=(ui,id,value)=>ui.run(()=>ui.hosts.get(id).onChangeText(value));

for(const hand of ['right','left'])test(hand+': location and unified reminder use the same interior as approved time/duration, without negative footer margins',async()=>{
 const ui=await h.editorFixture({handedness:hand});try{
  for(const [tool,form,save]of [['time','note-time-picker','note-time-apply'],['duration','note-duration-picker','note-duration-apply'],['place','note-place-form','note-place-save'],['reminder','note-reminder-picker','note-reminder-confirm']]){
   await ui.tool(tool);const root=ui.hosts.get(form);assert.ok(root,tool+' form');const style=flat(root.style);assert.equal(style.padding||0,0,tool+' cannot add a second inset');assert.equal(style.borderWidth||0,0,tool+' cannot put the footer against an inner frame');assert.equal(style.marginTop||0,0);
   const row=ui.hosts.get(save+'-footer');assert.equal(flat(row.style).width,'100%');
   const elements=n=>!n||typeof n!=='object'?[]:[n,...h.React.Children.toArray(n.props?.children||n.children).flatMap(elements)];
   assert.equal(elements(root).filter(n=>flat(n.props?.style).marginHorizontal<0).length,0,'No negative margin can force actions onto the form border');
   await ui.back();
  }
 }finally{await ui.close();}
});

for(const hand of ['right','left'])test(hand+': PROGRAMAR wiring opens the original note with its narrow tools visible, no keyboard or write; normal entry stays closed',async()=>{
 const disk=await h.diskFixture();let ui;try{
  const api=disk.api(),draft=disk.draft({title:'Programar esta misma nota',content:'Contenido conservado',dateISO:'2027-10-31',time:'19:30',duration:'90m',place:'Madrid',reminderMinutes:15});draft.attachments=[await disk.fileApi.importNoteFile(disk.scope,draft.id,await disk.sourceFile())];const {entry}=await api.saveUnifiedNote(draft,disk.scope,disk.active);
  const source=fs.readFileSync('app/index.tsx','utf8'),ast=h.ts.createSourceFile('home.tsx',source,h.ts.ScriptTarget.Latest,true,h.ts.ScriptKind.TSX),picked={};
  function visit(n){if(h.ts.isVariableDeclaration(n)&&['openUnifiedNote','moveNoteDestination'].includes(n.name.getText(ast)))picked[n.name.getText(ast)]=n.initializer.getText(ast);if(h.ts.isFunctionDeclaration(n)&&n.name?.text==='renderUnifiedNoteEditor')picked.render=n.getText(ast);h.ts.forEachChild(n,visit);}visit(ast);
  const ctx={React:h.React,GoNoteEditor:'GoNoteEditor',noteIdentity:{ready:true,scope:disk.scope},handedness:hand,unifiedNoteEditCache:{current:new Map()},unifiedNoteCache:{current:null},quickNoteText:'',quickNoteDetail:'',cacheNoteDraft(){},openSavedNoteDestination(){},renderSavedNoteActions(){},saveNoteDraft(){},setUnifiedNoteInitial:value=>ctx.unifiedNoteInitial=value,setUnifiedNoteSeed:value=>ctx.unifiedNoteSeed=value,setNotesOpen:value=>ctx.notesOpen=value};
  vm.runInNewContext(h.compile('const openUnifiedNote='+picked.openUnifiedNote+';globalThis.open=openUnifiedNote;globalThis.move='+picked.moveNoteDestination+';'+picked.render+';globalThis.editor=renderUnifiedNoteEditor;'),ctx);
  ctx.move(entry,'calendar');const props=ctx.editor().props;assert.equal(props.initial,entry);assert.equal(props.initialToolsOpen,true,'PROGRAMAR alone opts into tools');assert.equal(ctx.notesOpen,true);const writes=disk.writes;
  ui=await h.editorFixture({...props,onSave:d=>api.saveUnifiedNote(d,disk.scope,disk.active)});assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,true);assert.ok(ui.hosts.has('note-option-date'));assert.ok(ui.hosts.has('note-option-time'));assert.equal(ui.keyboard.visible,false);assert.equal(ui.keyboard.focused,null);assert.equal(disk.writes,writes);assert.equal(disk.rows[0].note.destination,'archive');assert.equal(flat(ui.hosts.get('note-tools-panel').style)[hand==='right'?'right':'left'],0);
  await ui.tool('time');await edit(ui,'note-time-hour','20');await edit(ui,'note-time-minute','00');await ui.tap('note-time-apply');await ui.idle();assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].id,entry.id);assert.equal(disk.rows[0].note.schedule.time,'20:00');assert.equal(disk.rows[0].note.destination,'calendar');assert.equal(disk.rows[0].note.attachments[0].id,draft.attachments[0].id);assert.equal(disk.rows[0].note.content,draft.content);assert.equal((await disk.reopen())[0].id,entry.id);
  await ui.close();ui=null;ctx.open(disk.rows[0]);const normal=ctx.editor().props;assert.equal(normal.initialToolsOpen,false);ui=await h.editorFixture(normal);assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,false);assert.equal(ui.keyboard.visible,false);
 }finally{if(ui)await ui.close();disk.close();}
});

test('archive only softens pending yellow locally; green, common header, count position and column dimensions are preserved',()=>{
 const f=fixture(),{GoNoteArchiveColumn}=f.load('components/notes/GoNoteArchiveColumn.tsx');for(const count of [0,1,3,10]){
  const entries=Array.from({length:count},(_,i)=>({id:String(i),notes:'Nota',note:{title:'Nota',attachments:[]}})),tree=GoNoteArchiveColumn({entries,expanded:true,compact:true,headerHeight:45,titleFont:13,onToggle(){},onOpen(){},onMove(){}}),header=nodes(tree,n=>n.props.testID==='notes-archive-header')[0],title=nodes(tree,n=>n.props.testID==='notes-archive-heading')[0],badge=nodes(tree,n=>n.props.testID==='notes-archive-count')[0];
  assert.equal(flat(header.props.style).height,45);assert.ok(flat(title.props.style).fontSize<13);assert.equal(flat(nodes(tree,n=>n.props.testID==='toggle-notes-column')[0].props.style).paddingVertical,2);assert.equal(title.children[0],'NOTAS\nARCHIVO');assert.equal(flat(badge.props.style).right,5);assert.equal(flat(badge.props.style).top,5);assert.equal(badge.children[0].children[0],count);
  if(count){const pending=nodes(tree,n=>n.props.testID==='archive-note-pending-0')[0],green=nodes(tree,n=>n.props.testID==='archive-note-calendar-0')[0],yellow=flat(pending.props.style).backgroundColor;assert.equal(yellow,'#f2cf24');assert.equal(flat(pending.children[0].props.style).color,'#ffffff');assert.equal(flat(green.props.style).backgroundColor,'#23674f');assert.equal(flat(green.children[0].props.style).color,'#ffffff');}
 }
 assert.match(fs.readFileSync('constants/colors.ts','utf8'),/GO_PENDING_YELLOW = "#FFD700"/);
});
