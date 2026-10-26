import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {detailFixture,detailEntry} from './helpers/calendar-detail-lifecycle.mjs';
import {ast,find,declaration,transpile} from './helpers/calendar-container-fixture.mjs';
import lifecycle from './helpers/react-lifecycle.cjs';
const ts=createRequire(import.meta.url)('typescript'),{React}=lifecycle;
const nodes=n=>!n||typeof n!=='object'?[]:[n,...(n.children??[]).flatMap(nodes)];
const createElement=(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)});
const booking={...detailEntry,contactName:'Empresa autorizada',notes:'Reserva y estado conservados'};
for(const platform of ['ios','android'])test(platform+': Ficha → Mensajes → Ficha never dismisses or remounts the source detail, then one close returns to Calendar',async()=>{
 const f=await detailFixture({platform}),snapshot=JSON.stringify(booking);let conversation=false,closed=0,opened=0;
 const props={entry:booking,onClose:()=>closed++,onMessage:()=>{opened++;conversation=true;},renderMessageScreen:()=>conversation?React.createElement('div',null,'CONVERSACIÓN DE LA MISMA RESERVA'):null};
 try{
  await f.render(props);const initialPan=f.props.get('entry-details-gesture-body').onPanResponderRelease;
  await f.settle(()=>f.props.get('MENSAJE GO').onPress());await f.render(props);
  assert.equal(opened,1);assert.equal(closed,0);assert.equal(f.props.get('entry-details-modal').visible,true,'Calendar must stay covered by the already visible detail');assert.ok(f.container.textContent.includes('CONVERSACIÓN DE LA MISMA RESERVA'));
  conversation=false;await f.render(props);assert.equal(f.props.get('entry-details-modal').visible,true);assert.equal(closed,0);assert.equal(f.props.get('entry-details-gesture-body').onPanResponderRelease,initialPan,'The native detail session, scroll and gesture are retained');assert.equal(JSON.stringify(booking),snapshot);
  await f.pressClose();if(platform==='ios'){assert.equal(closed,0);await f.nativeDismiss();}assert.equal(closed,1);assert.equal(f.props.get('entry-details-modal').visible,false);
 }finally{await f.dispose();}
});
for(const height of [568,667,844,932])test('detail back button is raised safely at '+height+' logical points without covering actions',async()=>{
 const f=await detailFixture();try{await f.render();await f.settle(()=>f.props.get('entry-details-overlay').onLayout({nativeEvent:{layout:{height}}}));const footer=f.props.get('entry-detail-close-footer'),button=f.props.get('Cerrar detalle');
  assert.equal(footer.style.paddingBottom,Math.max(24,Math.min(44,Math.round(height*.045))));assert.ok(footer.style.paddingBottom>6);assert.equal(footer.style.flexShrink,0);assert.equal(footer.style.justifyContent,'flex-end');assert.equal(footer.style.position,undefined,'Dedicated existing footer stays outside scrollable actions');assert.equal(button.style.width,56);assert.equal(button.children.props.style.width,44);assert.equal(f.props.get('entry-details-overlay').style.paddingBottom,42);
 }finally{await f.dispose();}
});

test('Messages back button is above GO and ENVIAR in its own safe slot, with unchanged black design and no composer overlap',()=>{
 const source=readFileSync('components/MessagesScreen.tsx','utf8'),tree=ts.createSourceFile('Messages.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];function walk(n){all.push(n);ts.forEachChild(n,walk);}walk(tree);
 const slot=all.find(n=>ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(a=>a.name?.getText(tree)==='testID'&&a.initializer?.text==='message-back-position'));assert.ok(slot);
 const column=slot.parent;assert.equal(column.openingElement.attributes.properties.find(a=>a.name?.getText(tree)==='style').initializer.expression.getText(tree),'s.actionCol');
 const siblings=column.children.filter(n=>ts.isJsxElement(n));assert.equal(siblings[0],slot);assert.equal(siblings[1].openingElement.attributes.properties.find(a=>a.name?.getText(tree)==='onPress').initializer.expression.getText(tree),'handleCreateGo');assert.equal(siblings[2].openingElement.attributes.properties.find(a=>a.name?.getText(tree)==='onPress').initializer.expression.getText(tree),'sendMessage');
 const style=all.find(n=>ts.isPropertyAssignment(n)&&n.name.getText(tree)==='fabBack').initializer.getText(tree),scope={exports:{},React:{createElement},View:'View',DraggableFAB:'DraggableFAB',TouchableOpacity:'Button',Feather:'Icon',initialContext:{},lang:'es',s:{fabBack:vm.runInNewContext('('+style+')')},Haptics:{impactAsync:async()=>{},ImpactFeedbackStyle:{Light:1}},backToList(){}};
 vm.runInNewContext(transpile('exports.slot=('+slot.getText(tree)+');'),scope);const rendered=scope.exports.slot,fab=nodes(rendered).find(n=>n.type==='DraggableFAB'),button=nodes(rendered).find(n=>n.type==='Button');
 assert.equal(rendered.props.style.height,60);assert.equal(fab.props.bounds.height,60);assert.equal(fab.props.initialTop,8);assert.equal(fab.props.initialBottom,undefined);assert.equal(fab.props.maxH,44);assert.equal(fab.props.buttonWidth,44);assert.equal(button.props.style.width,44);assert.equal(button.props.style.height,44);assert.equal(button.props.style.backgroundColor,'#0F0F0F');
 const fabSource=readFileSync('components/DraggableFAB.tsx','utf8'),fabAst=ts.createSourceFile('Fab.tsx',fabSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let animated;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(fabAst)==='animStyle')animated=n.initializer.getText(fabAst);ts.forEachChild(n,visit);}visit(fabAst);
 const actual=vm.runInNewContext(animated,{useAnimatedStyle:fn=>fn(),bounds:fab.props.bounds,posL:{value:10000},posT:{value:10000},minL:8,maxL:24,minT:8,maxT:8,Math,scale:{value:1},isDragging:{value:false},shadowOp:{value:.18}});assert.equal(actual.left,24);assert.equal(actual.top,8);assert.ok(actual.top+44<=60);assert.ok(actual.left+44<=76,'Old saved floating coordinates are clamped above GO, never over the input or Send');
});

test('GO in Messages directly opens the existing assistant without hiding Calendar, Messages or the reservation',()=>{
 const calls=[],scope={exports:{},pendingCalendarGoRef:{current:false},pendingCalendarGoListenRef:{current:false},calOpen:true,goChatOpen:false,Haptics:{selectionAsync(){}},getNow:()=>new Date(2030,1,1),__DEV__:false,goChatListenSequence:{current:0},aiDraftBaseRef:{current:''},
  setCalOpen:v=>calls.push(['calendar',v]),setGoChatListenRequest:v=>calls.push(['listen',v]),setGoChatOpen:v=>calls.push(['assistant',v]),setAiDraft(){},setAiOpen:v=>calls.push(['legacy',v]),setAiListening(){}};
 vm.runInNewContext(transpile('exports.open='+declaration('openAi')+';'),scope);scope.exports.open(false,true);assert.ok(calls.some(c=>c[0]==='assistant'&&c[1]===true));assert.equal(calls.some(c=>c[0]==='calendar'),false);assert.ok(!calls.some(c=>c[0]==='legacy'&&c[1]===true));
 const screen=find(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='MessagesScreen');const callback=screen.attributes.properties.find(a=>a.name?.getText(ast)==='onCreateGo').initializer.expression;
 const direct=[];vm.runInNewContext(transpile('('+callback.getText(ast)+')();'),{openAi:(...args)=>direct.push(args)});assert.deepEqual(direct,[[false,true]]);
 const assistant=screen.attributes.properties.find(a=>a.name?.getText(ast)==='assistant');assert.equal(assistant.initializer.expression.getText(ast),'messagesOpen && goChatOpen ? goChatScreen : null');
 for(const messagesOpen of [false,true]){const hosted=vm.runInNewContext(assistant.initializer.expression.getText(ast),{messagesOpen,goChatOpen:true,goChatScreen:'existing-assistant'});assert.equal(hosted,messagesOpen?'existing-assistant':null,'Hidden Communication must never mount a second assistant');}
 assert.ok(ast.text.includes('{!messagesOpen && goChatScreen}'),'Root assistant is suppressed while the same screen is hosted by Messages');assert.equal((ast.text.match(/<GOChatScreen\b/g)||[]).length,1,'No parallel assistant');
});
