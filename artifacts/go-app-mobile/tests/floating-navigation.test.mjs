import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import lifecycle from './helpers/react-lifecycle.cjs';
import {detailFixture} from './helpers/calendar-detail-lifecycle.mjs';
import {ast,find,declaration,transpile} from './helpers/calendar-container-fixture.mjs';
const ts=createRequire(import.meta.url)('typescript'),{React,evaluate}=lifecycle;

test('detail Back and Landing are distinct overlays and never resize the original panel or footer',async()=>{
 const f=await detailFixture();let back=0,landing=0;try{
 await f.render({onClose:()=>back++,onGoToLanding:()=>landing++});const sheet=JSON.stringify(f.props.get('entry-details-sheet').style);
 const layout=async(summaryEnd,actionsTop,offset=0)=>f.settle(()=>{f.props.get('entry-details-scroll').onLayout({nativeEvent:{layout:{y:44,height:600}}});f.props.get('entry-details-information').onLayout({nativeEvent:{layout:{y:0,height:summaryEnd}}});f.props.get('entry-details-actions').onLayout({nativeEvent:{layout:{y:actionsTop}}});f.props.get('entry-details-scroll').onScroll({nativeEvent:{contentOffset:{y:offset}}});});
 await layout(160,440);let floating=f.props.get('entry-detail-floating-navigation');assert.equal(floating.style.position,'absolute');assert.equal(floating.style.top,416);assert.ok(floating.style.top>=44+160+12);assert.ok(floating.style.top+56<=44+440-12);
 await layout(420,440);floating=f.props.get('entry-detail-floating-navigation');assert.equal(floating.style.top,undefined);assert.equal(floating.style.bottom,6,'Long information uses the original footer, never covers actions');
 assert.equal(f.props.get('entry-detail-close-footer').style.height,66);assert.equal(f.props.get('entry-detail-close-footer').style.paddingBottom,6);assert.equal(JSON.stringify(f.props.get('entry-details-sheet').style),sheet);
 await f.settle(()=>f.props.get('Ir directamente al Landing').onPress({stopPropagation(){}}));assert.equal(landing,1);assert.equal(back,0,'Double arrow must not invoke one-level Back');
 await f.pressClose();assert.equal(back,0);await f.nativeDismiss();assert.equal(back,1);assert.equal(landing,1);
 }finally{await f.dispose();}
});

const closeUi=evaluate('components/booking-assistant/AssistantCloseControls.tsx',{'react-native':{View:'View'},'@/components/DraggableFAB':{DraggableFAB:'DraggableFAB'},'@/components/ui/GoCloseButton':{GoCloseButton:'GoCloseButton'}});
for(const height of [300,450,700])test('assistant exposes one-level Back and direct Landing within '+height+' points without covering the composer',()=>{
 const calls=[],tree=closeUi.AssistantCloseControls({disabled:false,onClose:()=>calls.push('back'),onGoToLanding:()=>calls.push('landing'),viewport:{width:390,height},protectedBottom:144,topInset:47});
 const fab=tree.props.children,buttons=React.Children.toArray(fab.props.children.props.children);assert.equal(fab.props.buttonWidth,96);assert.equal(fab.props.maxH,44);assert.equal(fab.props.bounds.height,height-144);assert.equal(buttons.length,2);assert.equal(buttons[0].props.level,'panel');assert.equal(buttons[1].props.level,'container');buttons[0].props.onPress();assert.deepEqual(calls,['back']);buttons[1].props.onPress();assert.deepEqual(calls,['back','landing']);
 const single=closeUi.AssistantCloseControls({panel:true,disabled:true,onClose(){},viewport:{width:390,height},protectedBottom:144});const originalPanel=React.Children.toArray(single.props.children.props.children.props.children);assert.equal(originalPanel.length,1);assert.equal(originalPanel[0].props.disabled,true,'Existing inner-panel close remains unchanged');
});

test('direct Landing dismisses the outer Calendar once and never restores Message or detail during native cleanup',()=>{
 const calls=[],scope={exports:{},directLandingRef:{current:false},directLandingExit:false,calOpen:true,messagesOpen:true,goChatOpen:true,messageEntryId:'reservation',messageReturnRef:{current:()=>{throw Error('Direct Landing cannot restore the source card');}},pendingCalendarGoRef:{current:false},pendingCalendarGoListenRef:{current:false},closeAllOverlays:()=>calls.push('other-ui-closed')};
 const names=['MessagesOpen','GoChatOpen','MessageEntryId','InitialMessagesContact','InitialMessagesBookingId','InitialMessagesContext','LandingDetailsId','CalBookingDetailEntry','CalReservasOpen','ShowBookingFromCal','AgendaOpOpen','EmpresaOpen','DirectLandingExit','CalOpen'];for(const name of names){const key=name[0].toLowerCase()+name.slice(1);scope['set'+name]=value=>{scope[key]=value;calls.push([key,value]);};}
 vm.createContext(scope);for(const name of ['finishDirectLanding','goDirectlyToLanding','completeCalendarGoOpen','finishEntryMessageReturn'])vm.runInContext(transpile('var '+name+'='+declaration(name)+';exports.'+name+'='+name+';'),scope);
 scope.exports.goDirectlyToLanding();scope.exports.goDirectlyToLanding();assert.equal(scope.calOpen,false);assert.equal(scope.directLandingExit,true);assert.equal(scope.messagesOpen,true);assert.equal(scope.goChatOpen,true,'The top native stack stays mounted until its ancestor is dismissed');assert.equal(scope.messageReturnRef.current,null);assert.equal(calls.filter(c=>Array.isArray(c)&&c[0]==='calOpen').length,1);
 scope.exports.finishEntryMessageReturn();assert.equal(scope.messagesOpen,true,'Child dismissal cannot restore intermediate screens');scope.exports.completeCalendarGoOpen();assert.equal(scope.messagesOpen,false);assert.equal(scope.goChatOpen,false);assert.equal(scope.messageEntryId,null);assert.equal(scope.landingDetailsId,null);assert.equal(scope.directLandingExit,false);assert.equal(calls.filter(c=>c==='other-ui-closed').length,1);
 scope.exports.completeCalendarGoOpen();assert.equal(calls.filter(c=>c==='other-ui-closed').length,1);
});

test('assistant Back preserves its real origin; Landing has a separate guarded callback',()=>{
 const s=readFileSync('components/booking-assistant/BookingAssistantScreen.tsx','utf8'),tree=ts.createSourceFile('ai.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let close;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='close')close=n.getText(tree);ts.forEachChild(n,visit);}visit(tree);const calls=[],scope={exports:{},a:{busy:'',invalidate:()=>calls.push('invalidate')},voice:{abort:()=>calls.push('abort')},onClose:()=>calls.push('origin'),onGoToLanding:()=>calls.push('landing')};vm.runInNewContext(transpile(close+';exports.close=close;'),scope);scope.exports.close();assert.deepEqual(calls,['invalidate','abort','origin']);calls.length=0;scope.exports.close(true);assert.deepEqual(calls,['invalidate','abort','landing']);scope.a.busy='Confirmando reserva…';calls.length=0;scope.exports.close();scope.exports.close(true);assert.deepEqual(calls,[],'Navigation cannot interrupt an existing critical booking write');
});

test('one assistant instance is hosted by its actual native origin, including Calendar and Messages',()=>{
 const expressions=[];function visit(n){if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&n.right.getText(ast)==='goChatScreen')expressions.push(n.getText(ast));ts.forEachChild(n,visit);}visit(ast);
 const screen=find(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='MessagesScreen'),messageExpr=screen.attributes.properties.find(a=>a.name?.getText(ast)==='assistant').initializer.expression.getText(ast);
 for(const [calOpen,messagesOpen,directLandingExit]of [[false,false,false],[true,false,false],[true,true,false],[false,true,true],[false,false,true]]){
 const scope={calOpen,messagesOpen,directLandingExit,goChatOpen:true,goChatScreen:'same-assistant'};const hosts=expressions.map(e=>vm.runInNewContext(e,scope)).filter(Boolean);if(vm.runInNewContext(messageExpr,scope))hosts.push('same-assistant');assert.equal(hosts.length,1,'Exactly one native presenter, including during Landing dismissal');
 }
 const calls=[],scope={exports:{},pendingCalendarGoRef:{current:false},calOpen:true,goChatOpen:false,Haptics:{selectionAsync(){}},getNow:()=>new Date(),__DEV__:false,goChatListenSequence:{current:0},aiDraftBaseRef:{current:''},setGoChatListenRequest(){},setGoChatOpen:v=>calls.push(['ai',v]),setAiDraft(){},setAiOpen(){},setAiListening(){},setCalOpen:()=>{throw Error('Back must retain the Calendar origin');}};vm.runInNewContext(transpile('exports.open='+declaration('openAi')+';'),scope);scope.exports.open();assert.deepEqual(calls,[['ai',true]]);
});
