import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {ast,find,declaration,transpile} from './helpers/calendar-container-fixture.mjs';
import {detailFixture,detailEntry} from './helpers/calendar-detail-lifecycle.mjs';
import lifecycle from './helpers/react-lifecycle.cjs';
const ts=createRequire(import.meta.url)('typescript');
const presentation=lifecycle.evaluate('data/goEntryPresentation.ts');
const booking={...detailEntry,id:'go_booking_cli_11111111-1111-4111-8111-111111111111',reservationId:'11111111-1111-4111-8111-111111111111',contactName:'Salón autorizado'};
const tree=(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)});
const nodes=n=>!n||typeof n!=='object'?[]:[n,...(n.children??[]).flatMap(nodes)];
const label=n=>nodes(n).filter(x=>x.type==='Text').flatMap(x=>x.children).filter(x=>typeof x==='string').join('');
for(const hand of ['right','left'])for(const platform of ['ios','android'])test(`${platform}/${hand}: MENSAJE GO waits for native detail dismissal, then opens once with the same booking`,async()=>{
 const f=await detailFixture({handedness:hand,platform}),calls=[];
 try{
  await f.render({entry:booking,onClose:()=>calls.push('detail-dismissed'),onMessage:()=>calls.push(presentation.entryMessageContext(booking))});
  const button=f.props.get('MENSAJE GO');assert.ok(button,'The existing action remains available');
  await f.settle(()=>{button.onPress();button.onPress();});
  assert.equal(f.props.get('entry-details-modal').visible,false);
  if(platform==='ios'){assert.deepEqual(calls,[],'Do not unmount or present a second controller before UIKit acknowledges dismissal');await f.nativeDismiss();}
  assert.equal(calls.length,2);assert.equal(calls[0],'detail-dismissed');assert.equal(calls[1].bookingId,booking.reservationId);assert.equal(calls[1].name,'Salón autorizado');
  await f.nativeDismiss();assert.equal(calls.length,2,'A duplicate callback must not open another conversation');
 }finally{await f.dispose();}
});

test('Calendar keeps its modal and source detail while the SAME Communication screen opens and returns after native dismissal',()=>{
 const calls=[],returnRef={current:null};let calOpen=true;
 const scope={exports:{},React:{createElement:tree},MessagesScreen:'MessagesScreen',goDirectlyToLanding:()=>calls.push(['landing']),entryMessageContext:presentation.entryMessageContext,
  messageReturnRef:returnRef,directLandingRef:{current:false},messagesOpen:true,goChatOpen:false,goChatScreen:null,setMessageEntryId:v=>calls.push(["host",v]),recentContacts:[],userGoPhone:'',handedness:'right',initialMessagesContact:null,
  initialMessagesBookingId:booking.reservationId,initialMessagesContext:presentation.entryMessageContext(booking),
  setMessagesOpen:v=>calls.push(['messages',v]),setLandingDetailsId:v=>calls.push(['landing-detail',v]),
  setInitialMessagesContext:v=>calls.push(['context',v]),setInitialMessagesBookingId:v=>calls.push(['booking',v]),setInitialMessagesContact:v=>calls.push(['contact',v]),
  setTimeout:()=>{throw Error('Native navigation must not depend on a guessed timeout');}};
 vm.createContext(scope);vm.runInContext(transpile('exports.open='+declaration('openEntryMessage')+';exports.finish='+declaration('finishEntryMessageReturn')+';'),scope);
 scope.finishEntryMessageReturn=scope.exports.finish;
 scope.exports.open(booking,()=>calls.push(['restore',booking.id]),true);assert.equal(calOpen,true);assert.deepEqual(calls.at(-1),['messages',true]);assert.equal(calls.some(x=>x[0]==='landing-detail'),false,'The selected source detail must remain mounted');
 vm.runInContext(transpile('exports.screen='+declaration('messagesScreen')+';'),scope);
 const screen=scope.exports.screen;assert.equal(screen.type,'MessagesScreen');assert.equal(screen.props.onGoToLanding,scope.goDirectlyToLanding,'Messages reuses the exact approved Landing coordinator');assert.equal(screen.props.initialBookingId,booking.reservationId);assert.equal(screen.props.initialContext.name,booking.contactName);
 screen.props.onClose();assert.equal(calls.filter(x=>x[0]==='restore').length,0,'Back waits until Communication is actually dismissed');
 screen.props.onDismiss();screen.props.onDismiss();assert.equal(calls.filter(x=>x[0]==='restore').length,1);assert.equal(calOpen,true,'Calendar and its scroll position remain mounted');
});

test('the only Communication component is presented by the active Calendar, not its obscured Landing sibling',()=>{
 const screen=find(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='MessagesScreen');
 let fn=screen;while(fn&&!ts.isFunctionDeclaration(fn))fn=fn.parent;assert.equal(fn.name.text,'HomeScreenContent');
 const calendar=find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='Modal'&&n.openingElement.attributes.properties.some(a=>a.name?.getText(ast)==='visible'&&a.initializer?.getText(ast)==='{calOpen}'));
 const inside=find(n=>ts.isBinaryExpression(n)&&n.getText(ast)==='(calOpen || directLandingExit) && !messageEntryId && messagesScreen');
 let p=inside;while(p&&p!==calendar)p=p.parent;assert.equal(p,calendar,'iOS presenter must be inside Calendar native modal');
 const outside=find(n=>ts.isBinaryExpression(n)&&n.getText(ast)==='!calOpen && !directLandingExit && !messageEntryId && messagesScreen');
 p=outside;while(p&&p!==calendar)p=p.parent;assert.equal(p,undefined,'General Communication stays on Landing only when Calendar is closed');
 const source=readFileSync('components/AgendaOperativa.tsx','utf8');assert.ok(!source.includes('setTimeout(()=>handleOpenMessage(item),180)'));
});

const actions=find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='View'&&n.openingElement.attributes.properties.some(a=>a.name?.getText(ast)==='testID'&&a.initializer?.text==='calendar-actions'));
for(const customer of [false,true])test(`${customer?'customer after booking':'personal from Landing'}: original four controls, styles and working actions remain together`,()=>{
 const calls=[];let token=3;const scope={exports:{},React:{createElement:tree},View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',MaterialCommunityIcons:'Icon',
  goView:{view:'USER'},adminAccess:{},calQuickCreateOpen:false,isBusinessMode:false,demoCustomerCalendarSelected:customer,GO_GOLD:'#C8A037',lang:'es',
  t:k=>({new_task_label:'NOTAS',cal_today_btn:'HOY',biz_book_btn:'Reservar'}[k]??k),Haptics:{selectionAsync:()=>{},impactAsync:async()=>{},ImpactFeedbackStyle:{Medium:1,Heavy:2}},
  setCalQuickCreateOpen:v=>calls.push(['notes',v]),setCalScrollToTodayToken:fn=>{token=fn(token);},setDemoCalendarFocus:v=>calls.push(['focus',v]),
  getNow:()=>new Date(2030,2,15,11,37),getToday:()=>new Date(2030,2,15),formatISODate:()=> '2030-03-15',Date,
  setShowBookingFromCal:v=>calls.push(['reserve',v]),setDiagBookingOpen:v=>calls.push(['diagnostic',v]),openAi:()=>calls.push(['ai']),startVoiceMode:()=>calls.push(['voice'])};
 vm.runInNewContext(transpile('exports.bar=('+actions.getText(ast)+');'),scope);
 const buttons=nodes(scope.exports.bar).filter(n=>n.type==='TouchableOpacity');assert.equal(buttons.length,4);assert.deepEqual(buttons.map(n=>n.props.accessibilityLabel==='NOTAS'?'NOTAS':label(n)),['NOTAS','HOY','RESERVAR','GO']);
 buttons.forEach(n=>n.props.onPress());assert.deepEqual(calls.filter(x=>x[0]!=='focus'),[['notes',true],['reserve',true],['ai']]);assert.equal(token,4);
 if(customer){const focus=calls.find(x=>x[0]==='focus')[1];assert.equal(focus.dateISO,'2030-03-15');assert.equal(focus.timeHHMM,'11:37');}
 assert.equal(buttons[0].props.style.width,44);assert.equal(buttons[1].props.style.height,42);assert.equal(buttons[2].props.style.height,52);assert.equal(buttons[2].props.style.backgroundColor,'#C8A037');assert.equal(buttons[3].props.style.width,44);
 let p=actions;while(p){if(ts.isConditionalExpression(p))assert.notEqual(p.condition.getText(ast),'demoCustomerCalendarSelected','Customer navigation must not replace the bar');p=p.parent;}
 assert.ok(!ast.text.includes('testID="calendar-new-reservation"'),'No additional replacement or duplicated reservation control');
 const customerCalendar=find(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='DemoCustomerCalendar');assert.ok(customerCalendar.getText(ast).includes('scrollToTodayToken={calScrollToTodayToken}'));
});
