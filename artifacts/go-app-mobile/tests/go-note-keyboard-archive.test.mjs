import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import {fixture} from './helpers/calendar-fixture.mjs';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs'),flat=s=>Object.assign({},...(Array.isArray(s)?s.flat(Infinity):[s]).filter(Boolean));
const nodes=(n,p)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...(n.children||[]).flatMap(c=>nodes(c,p))],text=n=>typeof n==='string'||typeof n==='number'?String(n):n&&typeof n==='object'?(n.children||[]).map(text).join(''):'';
const edit=(ui,id,value)=>ui.run(()=>ui.hosts.get(id).onChangeText(value));
const wait=async(ui,fn)=>{for(let i=0;i<80&&!fn();i++)await ui.run(()=>new Promise(r=>setTimeout(r,5)));assert.ok(fn(),'Native transition must settle');};

for(const handedness of ['left','right'])test(handedness+': a single menu press waits for actual keyboard dismissal, preserves title/body and the same input, then opens once',async()=>{
 let release;const gate=new Promise(r=>release=r),ui=await h.editorFixture({handedness,ports:{dismiss:()=>gate}});try{
  await edit(ui,'note-title','Título conservado');await edit(ui,'note-content','Texto dictado\nVarias líneas');await ui.run(()=>{ui.hosts.get('note-content').onFocus({target:77});ui.keyboard.show();});const token=ui.instances.get('note-content');
  await ui.tap('note-tools-toggle');assert.equal(ui.keyboard.visible,true);assert.equal(ui.keyboard.focused,null);assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,false);assert.equal(ui.calls.some(c=>c[0]==='close'),false);
  await ui.run(()=>release());await wait(ui,()=>ui.hosts.get('note-tools-toggle').accessibilityState.expanded);assert.equal(ui.keyboard.visible,false);assert.equal(ui.instances.get('note-content'),token);assert.equal(ui.hosts.get('note-title').value,'Título conservado');assert.equal(ui.hosts.get('note-content').value,'Texto dictado\nVarias líneas');assert.equal(ui.calls.filter(c=>c[0]==='blur').length,1);
  const panel=flat(ui.hosts.get('note-tools-panel').style);assert.equal(panel.width,205);assert.equal(panel[handedness==='right'?'right':'left'],0);assert.equal(ui.calls.some(c=>c[0]==='close'),false);await ui.back();assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,false);
 }finally{release();await ui.close();}
});

test('a delayed menu-open request cannot reopen a hidden editor; reopening retains the draft and a closed menu',async()=>{
 let release;const gate=new Promise(r=>release=r),ui=await h.editorFixture({ports:{dismiss:()=>gate}});try{
  await edit(ui,'note-content','Texto recuperable');await ui.run(()=>{ui.hosts.get('note-content').onFocus({target:12});ui.keyboard.show();});await ui.tap('note-tools-toggle');await ui.render({visible:false});await ui.run(()=>release());assert.equal(ui.hosts.has('note-tools-toggle'),false);await ui.render({visible:true});assert.equal(ui.hosts.get('note-tools-toggle').accessibilityState.expanded,false);assert.equal(ui.hosts.get('note-content').value,'Texto recuperable');
 }finally{release();await ui.close();}
});

for(const handedness of ['left','right'])test(handedness+': location has a short complete removal label, full accessibility, equal geometry and unchanged real save/remove behavior',async()=>{
 const disk=await h.diskFixture(),{entry}=await disk.api().saveUnifiedNote(disk.draft({content:'Lugar de la nota',place:'Dirección anterior'}),disk.scope,disk.active);
 const ui=await h.editorFixture({initial:entry,handedness,scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active),ports:{location:{requestForegroundPermissionsAsync:async()=>({status:'granted'}),getCurrentPositionAsync:async()=>({coords:{latitude:40.4,longitude:-3.7}}),reverseGeocodeAsync:async()=>[{street:'Calle nueva',streetNumber:'4',city:'Madrid'}],Accuracy:{Balanced:3}}}});try{
  await ui.tool('place');const remove=ui.hosts.get('note-place-clear'),save=ui.hosts.get('note-place-save');assert.equal(remove.children.props.children,'QUITAR');assert.equal(remove.accessibilityLabel,'Quitar ubicación');for(const key of ['flex','flexBasis','minHeight','paddingHorizontal','paddingVertical'])assert.equal(flat(remove.style)[key],flat(save.style)[key]);
  await ui.tap('note-location-current');assert.equal(ui.hosts.get('note-location-current').accessibilityState.selected,true);await ui.tap('note-place-save');await ui.idle();assert.equal(disk.rows[0].note.location.latitude,40.4);assert.match(disk.rows[0].place,/Calle nueva/);
  await ui.tool('place');await edit(ui,'note-place','Nueva dirección manual');await ui.back();await ui.idle();assert.equal(disk.rows[0].place,'Nueva dirección manual');assert.equal(disk.rows[0].note.location,undefined);
  await ui.tool('place');await ui.tap('note-place-clear');await ui.idle();assert.equal(disk.rows[0].place,'');await ui.tool('place');assert.equal(ui.hosts.get('note-place-clear').disabled,true);assert.equal(flat(ui.hosts.get('note-place-clear').style).backgroundColor,'#e7edf2');assert.equal(disk.rows.length,1);assert.equal((await disk.reopen())[0].id,entry.id);
 }finally{await ui.close();disk.close();}
});

for(const viewMode of ['dia','semana','mes_lineal'])test(viewMode+': responsive archive starts expanded, has a distinct empty surface and never resizes calendar days',()=>{
 for(const width of [320,375,390,430])for(const fontScale of [1,1.6,2]){
  const f=fixture({now:'2027-01-01T12:00:00',viewport:{width,height:844,fontScale}}),{AgendaBoard}=f.load('components/AgendaOperativa.tsx'),props={goLog:[],archiveNotes:[],onOpenNote(){},viewMode,selectedDateISO:'2027-01-01',calViewMonth:'2027-01'};
  let tree=f.render(AgendaBoard,props);const columns=nodes(tree,n=>n.props.key&&n.props.onLayout&&flat(n.props.style).width),archive=columns.find(n=>n.props.key==='notes'),pending=columns.find(n=>n.props.key==='retrasados');assert.ok(flat(archive.props.style).width>=176&&flat(archive.props.style).width<=width-24);const dayWidth=flat(pending.props.style).width;
  const column=nodes(tree,n=>n.type?.name==='GoNoteArchiveColumn')[0];assert.equal(column.props.expanded,true);const content=column.type(column.props),header=nodes(content,n=>n.props.testID==='toggle-notes-column')[0],list=nodes(content,n=>n.props.testID==='archived-notes-list')[0];assert.match(text(header),/NOTAS ARCHIVO/);assert.doesNotMatch(text(content),/No hay notas/);assert.equal(nodes(list,n=>String(n.props.testID).startsWith('calendar-archived-note-')).length,0);assert.notEqual(flat(header.props.style).backgroundColor,flat(list.props.style).backgroundColor);assert.equal(flat(header.props.style).borderBottomWidth,1);
  column.props.onToggle();tree=f.render(AgendaBoard,props);const folded=nodes(tree,n=>n.props.key==='notes')[0];assert.ok(flat(folded.props.style).width>=176);assert.equal(flat(nodes(tree,n=>n.props.key==='retrasados')[0].props.style).width,dayWidth);
 }
});

const luminance=hex=>hex.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
test('archive actions are white on readable gold/green surfaces and forward the original record/destination',()=>{
 const f=fixture(),{GoNoteArchiveColumn}=f.load('components/notes/GoNoteArchiveColumn.tsx'),entry={id:'one',notes:'Título',note:{title:'Título',attachments:[]}},calls=[];
 const tree=GoNoteArchiveColumn({entries:[entry],expanded:true,onToggle(){},onOpen:e=>calls.push(['open',e]),onMove:(...args)=>calls.push(args)});
 for(const [destination,color]of [['pending','#806017'],['calendar','#23674f']]){const button=nodes(tree,n=>n.props.key===destination)[0];assert.equal(flat(button.props.style).backgroundColor,color);assert.ok(1.05/(luminance(color)+.05)>=4.5);assert.equal(flat(button.children[0].props.style).color,'#ffffff');assert.ok(flat(button.props.style).minHeight>=44);button.props.onPress();assert.equal(calls.at(-1)[0],entry);assert.equal(calls.at(-1)[1],destination);}
 nodes(tree,n=>n.props.accessibilityLabel==='Abrir nota Título')[0].props.onPress();assert.equal(calls.at(-1)[1],entry);
});

test('real archive actions move the same persisted note to pending or through the existing scheduler, with files and no ghost entry',async()=>{
 const disk=await h.diskFixture();let ui;try{
  const api=disk.api(),draft=disk.draft({title:'Hacer la compra',content:'Contenido íntegro',dateISO:'2027-01-15',time:'19:30',duration:'90m',place:'Madrid'});draft.attachments=[await disk.fileApi.importNoteFile(disk.scope,draft.id,await disk.sourceFile())];let {entry}=await api.saveUnifiedNote(draft,disk.scope,disk.active);
  const source=fs.readFileSync('app/index.tsx','utf8'),ast=h.ts.createSourceFile('home.tsx',source,h.ts.ScriptTarget.Latest,true,h.ts.ScriptKind.TSX);let fn;function visit(n){if(h.ts.isVariableDeclaration(n)&&n.name.getText(ast)==='moveNoteDestination')fn=n.initializer;h.ts.forEachChild(n,visit);}visit(ast);assert.ok(fn);
  const opens=[],identity={ready:true,scope:disk.scope};let transition;const ctx={noteIdentityRef:{current:identity},openUnifiedNote:(...args)=>opens.push(args),showToast(){},watchNoteReminderReceipt(){},moveUnifiedNote:(...args)=>transition=api.moveUnifiedNote(...args)};vm.runInNewContext(h.compile('globalThis.move='+fn.getText(ast)),ctx);
  const f=fixture({now:'2027-01-01T12:00:00'}),{AgendaBoard}=f.load('components/AgendaOperativa.tsx');const render=()=>f.render(AgendaBoard,{goLog:disk.rows.filter(e=>!disk.model.isArchivedNote(e)),archiveNotes:disk.rows.filter(disk.model.isArchivedNote),onOpenNote(){},onMoveNote:ctx.move,viewMode:'mes_lineal',selectedDateISO:'2027-01-15',calViewMonth:'2027-01'}),archive=()=>{const node=nodes(render(),n=>n.type?.name==='GoNoteArchiveColumn')[0];return node.type(node.props);};
  nodes(archive(),n=>n.props.testID==='archive-note-pending-'+entry.id)[0].props.onPress();await transition;assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].note.destination,'pending');assert.equal(nodes(archive(),n=>n.props.testID==='calendar-archived-note-'+entry.id).length,0);assert.ok(nodes(render(),n=>n.type==='GestureDetector'&&n.props.key===entry.id).length);
  ({entry}=await api.moveUnifiedNote(disk.rows[0],'archive',disk.scope,disk.active));nodes(archive(),n=>n.props.testID==='archive-note-calendar-'+entry.id)[0].props.onPress();assert.equal(opens.length,1);assert.equal(opens[0][0].id,entry.id);assert.equal(opens[0][1].destination,'calendar');assert.equal(disk.rows[0].note.destination,'archive','Opening PROGRAMAR cannot itself commit');
  ui=await h.editorFixture({initial:opens[0][0],seed:opens[0][1],scope:disk.scope,onSave:d=>api.saveUnifiedNote(d,disk.scope,disk.active)});await ui.pickTime('20','00');await ui.tap('unified-note-save');await ui.idle();assert.equal(disk.rows.length,1);assert.equal(disk.rows[0].id,draft.id);assert.equal(disk.rows[0].note.destination,'calendar');assert.equal(disk.rows[0].note.schedule.time,'20:00');assert.equal(disk.rows[0].note.content,draft.content);assert.equal(disk.rows[0].note.attachments[0].id,draft.attachments[0].id);assert.equal(nodes(archive(),n=>n.props.testID==='calendar-archived-note-'+entry.id).length,0);const [reopened]=await disk.reopen();assert.equal(reopened.id,draft.id);assert.equal(reopened.note.destination,'calendar');
 }finally{if(ui)await ui.close();disk.close();}
});
