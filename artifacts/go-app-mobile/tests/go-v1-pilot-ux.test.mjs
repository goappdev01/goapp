import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fixture} from './helpers/calendar-fixture.mjs';
const require=createRequire(path.join(process.cwd(),'package.json')),ts=require('typescript');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const compile=text=>ts.transpileModule(text,{compilerOptions:{esModuleInterop:false,alwaysStrict:false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
function find(root,p){if(p(root))return root;let result;ts.forEachChild(root,n=>{if(!result)result=find(n,p)});return result;}
const attr=(n,k)=>n.openingElement.attributes.properties.find(a=>a.name?.getText(n.getSourceFile())===k)?.initializer;
const byId=(root,id)=>find(root,n=>ts.isJsxElement(n)&&attr(n,'testID')?.text===id);
const nodes=(n,p)=>n&&typeof n==='object'?[...(p(n)?[n]:[]),...(n.children??[]).flatMap(c=>nodes(c,p))]:[];
const text=n=>nodes(n,c=>c.type==='Text').flatMap(c=>c.children).filter(x=>typeof x==='string').join(' ');
const style=s=>Array.isArray(s)?Object.assign({},...s.map(style)):s||{};
const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)})};
const declaration=name=>find(ast,n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);
function wordAdvance(file,word){
 const font=fs.readFileSync(file),tables={};for(let i=0;i<font.readUInt16BE(4);i++){const p=12+16*i;tables[font.toString('ascii',p,p+4)]=font.readUInt32BE(p+8);}
 const units=font.readUInt16BE(tables.head+18),metrics=font.readUInt16BE(tables.hhea+34);let sub;
 for(let i=0;i<font.readUInt16BE(tables.cmap+2);i++){const p=tables.cmap+font.readUInt32BE(tables.cmap+8+8*i);if(font.readUInt16BE(p)===4){sub=p;break;}}
 assert.ok(sub);const segments=font.readUInt16BE(sub+6)/2;
 return [...word].reduce((sum,char)=>{let glyph;const code=char.codePointAt(0);for(let i=0;i<segments;i++){
  const end=font.readUInt16BE(sub+14+2*i),start=font.readUInt16BE(sub+16+2*segments+2*i);if(code<start||code>end)continue;
  const delta=font.readInt16BE(sub+16+4*segments+2*i),at=sub+16+6*segments+2*i,range=font.readUInt16BE(at);
  glyph=range?font.readUInt16BE(at+range+2*(code-start)):(code+delta)&65535;if(range&&glyph)glyph=(glyph+delta)&65535;break;
 }assert.ok(glyph);return sum+font.readUInt16BE(tables.hmtx+4*Math.min(glyph,metrics-1))/units;},0);
}
test('EMPRESA fits the real Inter glyphs in all three diameters, without moving or resizing the satellite',()=>{
 const code=declaration('_labelFs').initializer.getText(ast),label=find(ast,n=>ts.isJsxElement(n)&&attr(n,'maxFontSizeMultiplier')?.getText(ast).includes('displayLabel === "EMPRESA"'));
 assert.ok(label);const em=wordAdvance('node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf','EMPRESA');
 for(const uiScaleFactor of [.83,1,1.12]){
  const microSz=Math.round(50*uiScaleFactor),scope={Math,uiScaleFactor,microSz,_labelPadH:1,displayLabel:'EMPRESA',s:{key:'mas'}},font=vm.runInNewContext(code,scope),available=microSz-6;
  assert.ok(em*font<=available,`${em*font} <= ${available}`);assert.ok(em*font>=available*.85,'uses the available diameter for readable lettering');
  assert.equal(attr(label,'numberOfLines').expression.getText(ast),'1');assert.equal(vm.runInNewContext(attr(label,'adjustsFontSizeToFit').expression.getText(ast),scope),true);
  assert.equal(vm.runInNewContext(attr(label,'maxFontSizeMultiplier').expression.getText(ast),scope),1);
 }
});
test('NUEVA RESERVA is a bounded yellow button with press feedback and the same booking route',()=>{
 const button=byId(ast,'calendar-new-reservation'),calls=[],scope={exports:{},React,TouchableOpacity:'TouchableOpacity',Text:'Text',lang:'es',setDemoInitialBusinessId:value=>calls.push(['business',value]),setShowBookingFromCal:value=>calls.push(['open',value])};
 assert.ok(button);vm.runInNewContext(compile('exports.button=('+button.getText(ast)+');'),scope);const b=scope.exports.button;
 assert.equal(text(b),'NUEVA RESERVA');assert.equal(b.props.style.borderColor,'#FFD700');assert.equal(b.props.style.width,'66%');assert.ok(b.props.style.maxWidth<=240);assert.ok(b.props.style.minHeight>=44);assert.ok(b.props.activeOpacity<1);b.props.onPress();assert.deepEqual(calls,[['business',undefined],['open',true]]);
});
test('Belleza retains the original first cell and equal three-column width as more categories become public',()=>{
 const f=fixture(),sectors=f.load('data/goSectorData.ts').SECTORS,booking=fs.readFileSync('components/booking/BookingSearchOverlay.tsx','utf8'),tree=ts.createSourceFile('booking.tsx',booking,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const grid=find(tree,n=>ts.isJsxElement(n)&&attr(n,'style')?.expression?.getText(tree)==='s.categoryGrid'&&n.getText(tree).includes('booking-category-row'));
 assert.ok(grid);assert.equal(sectors.length,9);assert.equal(sectors[0].id,'belleza');
 for(const visibleSectors of [[sectors[0]],sectors.slice(0,2),sectors]){
  const calls=[],scope={exports:{},React,View:'View',TouchableOpacity:'TouchableOpacity',Text:'Text',SECTORS:sectors,visibleSectors,lang:'es',trSector:value=>value,s:{categoryGrid:{},categoryRow:{},categoryChip:{flex:1,paddingVertical:14},categoryChipEmoji:{},categoryChipLabel:{}},Haptics:{selectionAsync:async()=>{}},setSelectedCategory:id=>calls.push(id),setSelectedSubCategory:()=>{}};
  vm.runInNewContext(compile('exports.grid=('+grid.getText(tree)+');'),scope);const row=nodes(scope.exports.grid,n=>n.props.testID==='booking-category-row')[0],buttons=nodes(scope.exports.grid,n=>n.type==='TouchableOpacity');
  assert.equal(row.children.length,3);assert.equal(row.children[0].props.testID,'booking-category-belleza');assert.equal(buttons.length,visibleSectors.length,'inactive categories are not fake buttons');
  assert.equal(style(row.children[0].props.style).flex,1);assert.equal(style(row.children[0].props.style).width,undefined);assert.equal(style(row.children[0].props.style).paddingVertical,14);
  row.children[0].props.onPress();assert.deepEqual(calls,['belleza']);
 }
});
test('compact Calendar time/type stay on one row without microactions; original footer is byte-for-byte preserved',()=>{
 const f=fixture({now:'2030-10-26T08:00:00'}),{AgendaBoard}=f.load('components/AgendaOperativa.tsx'),entry={id:'e',type:'GO_EXT',kind:'received',contactName:'Contact',intentLabel:'GO',phone:'+34600123456',time:'17:00',dateISO:'2030-10-26',date:'26/10',estado:'aceptado'};
 const tree=f.render(AgendaBoard,{goLog:[entry],viewMode:'dia',selectedDateISO:entry.dateISO,onChangeEstado(){},onDeleteItem(){},canResolveEntry:()=>true,onResolveEntry(){}}),card=nodes(tree,n=>n.type==='TouchableOpacity'&&n.props.activeOpacity===.85)[0];assert.ok(card);
 const row=nodes(card,n=>n.props.testID==='calendar-time-type-row')[0];assert.ok(text(row).includes('17:00'));assert.ok(text(row).includes('GO↙EXT'));assert.equal(style(row.props.style).flexWrap,'nowrap');assert.equal(nodes(tree,n=>n.props.testID==='entry-micro-actions').length,0);
 const before=execFileSync('git',['show','2f0b7ab:artifacts/go-app-mobile/components/AgendaOperativa.tsx'],{encoding:'utf8',maxBuffer:2e6}),after=fs.readFileSync('components/AgendaOperativa.tsx','utf8');
 const footer=s=>s.slice(s.indexOf('{/* ── Footer: estado buttons + delete.'),s.indexOf('    // ── Render column',s.indexOf('{/* ── Footer: estado buttons + delete.')));
 // Only the original footer is compared; expanded sheets are outside this card renderer.
 const footerNode=s=>{const ast=ts.createSourceFile('calendar.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);return find(ast,n=>ts.isJsxElement(n)&&attr(n,'style')?.expression?.getText(ast)==='s.cardFooter').getText(ast).replace(/\s+/g,'');};
 assert.equal(footerNode(after),footerNode(before));
});
test('Landing discard dispatch is explicit and personal; cancelled confirmation never writes or invokes booking cancellation',async()=>{
 const run=declaration('resolveEntry').getText(ast),entry={id:'e',estado:'aceptado'},alerts=[],calls=[],scope={exports:{},lang:'es',goLog:[entry],canResolveEntry:()=>true,setLandingDetailsId:id=>calls.push(['close',id]),Alert:{alert:(...args)=>alerts.push(args)},actionCompletion:{discard:async(e,current)=>calls.push(['discard',e.id,current().id]),decide:(...args)=>calls.push(['decide',args[1]])}};
 vm.runInNewContext(compile('const '+run+';exports.run=resolveEntry;'),scope);
 scope.exports.run(entry,'discard');assert.equal(calls.length,0);assert.ok(alerts[0][1].includes('No se cancela'));await alerts[0][2].find(b=>b.style==='destructive').onPress();await new Promise(r=>setImmediate(r));assert.deepEqual(calls,[['discard','e','e'],['close',null]]);
 scope.exports.run(entry,'done');scope.exports.run(entry,'pending');assert.deepEqual(calls.slice(-2),[['decide','done'],['decide','pending']]);assert.equal(entry.estado,'aceptado');
 scope.exports.run({...entry,changeProposal:{}},'done');assert.equal(calls.length,4,'a proposal cannot silently complete the original commitment');
});
