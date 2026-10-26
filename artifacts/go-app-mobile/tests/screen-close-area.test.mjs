import {test} from 'node:test';import assert from 'node:assert/strict';
import lifecycle from './helpers/react-lifecycle.cjs';
import {screenCloseSurface} from './helpers/screen-close-surface.mjs';
import {createRequire} from 'node:module';import path from 'node:path';
const require=createRequire(path.join(process.cwd(),'package.json')),{nativePanResponder,touchStream}=require('./tests/helpers/native-pan-responder.cjs');
const {React,createRoot,document,evaluate,rn}=lifecycle,actual=nativePanResponder();
const settle=async fn=>React.act(async()=>{fn?.();for(let i=0;i<16;i++)await Promise.resolve();});
async function fixture(width=390,height=844,hand='right'){
 const props=new Map(),ownership=evaluate('lib/calendarGestureOwnership.ts').calendarGestureOwnership,scroll={enabled:true,updates:[],setNativeProps({scrollEnabled}){this.enabled=scrollEnabled;this.updates.push(scrollEnabled);}};
 const rootRect={x:11,y:61,width:width-22,height:height-160};
 function View(p){React.useImperativeHandle(p.ref,()=>({measureInWindow:callback=>callback(rootRect.x,rootRect.y,rootRect.width,rootRect.height)}),[]);if(p.testID)props.set(p.testID,p);return React.createElement('div',{'data-testid':p.testID},p.children);}
 const native={...rn,View,StyleSheet:{absoluteFill:{position:'absolute',top:0,right:0,bottom:0,left:0}},PanResponder:actual};
 const screen=evaluate('components/ui/GoScreenModal.tsx',{'react-native':{...native,Modal:p=>p.children}});
 const guide=evaluate('components/ui/CalendarCloseGuide.tsx',{'expo-linear-gradient':{LinearGradient:View}}),surface=screenCloseSurface(native,ownership,guide,screen);
 let state,update;const calls={detail:0,messages:0,ia:0};
 function Layer({name,children}){return React.createElement(surface.GoScreenCloseSurface,{testID:name,handedness:hand,onClose:()=>{calls[name]++;update(s=>({...s,[name]:false}));},scrollRefs:[{current:scroll}]},React.createElement('input',{'data-thread':'draft preserved',defaultValue:'Mensaje sin enviar'}),React.createElement(surface.GoScreenCloseGuide,{testID:name+'-guide'}),children);}
 function Host(){const[s,set]=React.useState({detail:true,messages:false,ia:false});state=s;update=set;return React.createElement(screen.GoScreenHost,null,'CALENDARIO',React.createElement(screen.GoScreenModal,{visible:s.detail},React.createElement(Layer,{name:'detail'},React.createElement(screen.GoScreenModal,{visible:s.messages},React.createElement(Layer,{name:'messages'},React.createElement(screen.GoScreenModal,{visible:s.ia},React.createElement(Layer,{name:'ia'})))))));}
 const root=createRoot(document.createElement('div'));await settle(()=>root.render(React.createElement(Host)));
 let time=1000;return{props,scroll,calls,ownership,get state(){return state;},async set(patch){await settle(()=>update(s=>({...s,...patch})));},stream(x,y){return touchStream({x,y,time:time+=2000});},rect:{x:rootRect.x+(hand==='right'?rootRect.width*.75:0),y:rootRect.y+rootRect.height*.5,width:rootRect.width*.25,height:rootRect.height*.5},async close(){await settle(()=>root.unmount());assert.equal(ownership.detailOpen(),false);}};
}
async function drag(f,name,x,y,dy=55,dx=0){const p=f.props.get(name),s=f.stream(x,y);p.onStartShouldSetResponderCapture(s.event());const move=s.event(0,13,30),claimed=p.onMoveShouldSetResponderCapture(move);if(claimed){p.onResponderGrant(move);p.onResponderMove(s.event(dx,dy,250));await settle(()=>{const up=s.event(dx,dy,10,true);p.onResponderRelease(up);p.onTouchEndCapture(up);});}return{claimed,p,s};}

for(const hand of['left','right'])for(const width of[320,375,390,430])test(`${width}/${hand}: all three screens recognize every measured guide edge, corner and center with the installed RN responder`,async()=>{
 const f=await fixture(width,width===320?568:844,hand);try{
  for(const name of['detail','messages','ia'])for(const fx of[0,.5,1])for(const fy of[0,.5,1]){
   await f.set({detail:true,messages:name!=='detail',ia:name==='ia'});const r=f.rect,before=f.calls[name],other=JSON.stringify(f.calls);const {claimed}=await drag(f,name,r.x+r.width*fx,r.y+r.height*fy,55,hand==='right'?-2:2);assert.equal(claimed,true);assert.equal(f.calls[name],before+1);
   assert.equal(f.state.detail,name!=='detail');if(name==='ia')assert.equal(f.state.messages,true);assert.equal(f.scroll.enabled,true);
  }
 }finally{await f.close();}
});

for(const hand of['left','right'])test(`${hand}: only the top layer can own the contact, incomplete gestures recover and closing proceeds IA → Messages → detail → Calendar`,async()=>{
 const f=await fixture(390,844,hand);try{await f.set({messages:true,ia:true});const r=f.rect,x=r.x+r.width/2,y=r.y+20;
  for(const name of['detail','messages'])assert.equal((await drag(f,name,x,y)).claimed,false,'inactive layer cannot claim a queued event');
  const short=await drag(f,'ia',x,y,35);assert.equal(short.claimed,true);assert.equal(f.state.ia,true);assert.equal(f.scroll.enabled,true);
  const old=await drag(f,'ia',x,y);assert.equal(f.state.ia,false);assert.equal(f.state.messages,true);await settle(()=>old.p.onResponderRelease(old.s.event(0,150,10,true)));assert.equal(f.calls.ia,1);assert.equal(f.calls.messages,0);
  await drag(f,'messages',x,y);assert.equal(f.state.messages,false);assert.equal(f.state.detail,true);assert.equal(f.ownership.detailOpen(),true);
  await drag(f,'detail',x,y);assert.equal(f.state.detail,false);assert.equal(f.ownership.detailOpen(),false);assert.deepEqual(f.calls,{detail:1,messages:1,ia:1});
  await f.set({detail:true});assert.equal((await drag(f,'detail',r.x-r.width-8,y)).claimed,false,'central scrolling cannot turn into a close');
 }finally{await f.close();}
});

test('a contact interrupted by a new foreground screen cannot close its origin after that screen returns',async()=>{
 const f=await fixture();try{
  const r=f.rect,p=f.props.get('detail'),s=f.stream(r.x+r.width/2,r.y+30);
  p.onStartShouldSetResponderCapture(s.event());const move=s.event(0,13,30);assert.equal(p.onMoveShouldSetResponderCapture(move),true);p.onResponderGrant(move);assert.equal(f.scroll.enabled,false);
  await f.set({messages:true});assert.equal(f.scroll.enabled,true,'background activation releases native scroll immediately');
  await f.set({messages:false});await settle(()=>p.onResponderRelease(s.event(0,160,500,true)));
  assert.equal(f.calls.detail,0,'stale touch cannot resume when the former screen becomes active again');assert.equal(f.state.detail,true);
  await drag(f,'detail',r.x+r.width/2,r.y+30);assert.equal(f.calls.detail,1);
 }finally{await f.close();}
});
