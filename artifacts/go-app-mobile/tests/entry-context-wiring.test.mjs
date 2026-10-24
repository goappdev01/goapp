import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(path.join(process.cwd(),'package.json')),ts=require('typescript');
function load(file){const context={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}
const presentation=load('data/goEntryPresentation.ts');
const parse=file=>ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function nodes(root,predicate){const found=[];function visit(n){if(predicate(n))found.push(n);ts.forEachChild(n,visit);}visit(root);return found;}
const components=(ast,name)=>nodes(ast,n=>(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n))&&n.tagName.getText(ast)===name);
const value=(ast,n,name)=>n.attributes.properties.find(p=>p.name?.getText(ast)===name)?.initializer?.expression?.getText(ast);

test('every existing customer and company calendar forwards contextual messages, follow-up and handedness to the shared card',()=>{
 const home=parse('app/index.tsx');
 for(const name of ['DemoCustomerCalendar','EmpresaPanel','GoReservasConfigScreen'])for(const c of components(home,name)){
  assert.equal(value(home,c,'onOpenMessage'),'openEntryMessage',name);assert.equal(value(home,c,'onResolveEntry'),'resolveEntry',name);assert.equal(value(home,c,'canResolveEntry'),'canResolveEntry',name);assert.equal(value(home,c,'handedness'),'handedness',name);
 }
 for(const file of ['components/booking/DemoCustomerCalendar.tsx','components/booking/GoReservasConfigScreen.tsx']){
  const ast=parse(file);for(const c of components(ast,'AgendaBoard'))for(const prop of ['onOpenMessage','onResolveEntry','canResolveEntry','handedness'])assert.equal(value(ast,c,prop),prop,file);
 }
 const company=parse('components/empresa/EmpresaPanel.tsx');for(const name of ['GoReservasDemoScreen','GoReservasConfigScreen'])for(const c of components(company,name))for(const prop of ['onOpenMessage','onResolveEntry','canResolveEntry','handedness'])assert.equal(value(company,c,prop),prop,name);
});

test('message context uses the actual booking participant and identity; internal tasks cannot invent a recipient',()=>{
 const original={id:'go_booking_cli_booking-id',type:'GO_BOOKING',customerBooking:true,reservationId:'booking-id',contactName:'Salón registrado',phone:'+34910123456',date:'26 octubre',time:'12:00'};
 const before=JSON.stringify(original),context=presentation.entryMessageContext(original);assert.equal(context.bookingId,'booking-id');assert.equal(context.name,'Salón registrado');assert.equal(context.date,'26 octubre');assert.equal(context.time,'12:00');assert.equal(JSON.stringify(original),before);
 const business={...original,businessBooking:true,customerBooking:false,contactName:'Cliente registrado'};assert.equal(presentation.entryMessageContext(business).name,'Cliente registrado');
 const internal={id:'own',type:'TAREA_INTERNA',kind:'sent',direction:'self',contactName:'',phone:''};assert.equal(presentation.entryMessageContext(internal),null);
 const shared={...internal,type:'TAREA',direction:'outgoing',contactName:'Participante vinculado',phone:'+34600123456'};assert.equal(presentation.entryMessageContext(shared).name,shared.contactName);assert.equal(presentation.entryMessageContext(shared).bookingId,undefined);
});

test('the compact proposal has one identifying title and retains the shared functional proposal actions without a scroller',()=>{
 const ast=parse('app/index.tsx');
 const card=nodes(ast,n=>ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(p=>p.name?.getText(ast)==='testID'&&p.initializer?.getText(ast)==='"landing-proposal-card"'))[0];assert.ok(card);
 const text=card.getText(ast);assert.ok(!text.includes('_labelText'));assert.ok(!text.includes('CAMBIO PROPUESTO'));assert.ok(!text.includes('ScrollView'));
 assert.ok(fs.readFileSync('app/index.tsx','utf8').includes('item.kind === "cambio" && renderEntryQuickActions(item.g, true, true)'));
 const source=fs.readFileSync('components/GoEntryDetails.tsx','utf8');assert.ok(source.includes('"PROPONER CAMBIO"'));assert.ok(source.includes('"PROPOSE CHANGE"'));
 const panels=components(ast,'LandingCardContents');assert.equal(panels.length,2);for(const panel of panels)assert.ok(panel.attributes.properties.some(p=>p.name?.getText(ast)==='staticBody'));
});
