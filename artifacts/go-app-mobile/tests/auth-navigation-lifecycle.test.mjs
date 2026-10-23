import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import lifecycle from './helpers/react-lifecycle.cjs';
import {loadAuthSession} from './helpers/auth-session-fixture.mjs';
const {React,createRoot,document,req,ts,native,rn,evaluate}=lifecycle;
const home=ts.createSourceFile('home.tsx',fs.readFileSync('app/index.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let bootstrap,commit,wrapper;
function visit(n){
 if(ts.isFunctionDeclaration(n)&&n.name?.text==='HomeScreen')wrapper=n.getText(home).slice(n.getText(home).indexOf('function'));
 if(ts.isCallExpression(n)&&n.expression.getText(home)==='useEffect'&&n.arguments[0]?.getText(home).includes('restoreStoredAuthentication()'))bootstrap=n.getText(home);
 if(ts.isVariableDeclaration(n)&&n.name.getText(home)==='commitAccountType')commit=n.getText(home);
 ts.forEachChild(n,visit);
}
visit(home);
assert.ok(bootstrap&&commit);
const settle=async operation=>React.act(async()=>{if(operation)await operation();for(let i=0;i<30;i++)await Promise.resolve();});
async function fixture({expired=false,status=200}={}){
 const trace=[], recordAuthTrace=(event,details)=>trace.push({event,...details});
 const calls=[],screenChanges=[],events=new Set(),activity=new Set(),mounts={home:0,unmounts:0,panel:0},storage=new Map([['go_account_type_v1','usuario'],['go_active_mode_v1','USER'],['go_owner_view_context_v1:fictional-user','USER'],['demo-data','preserve']]);
 let now=Date.now(),responseStatus=status;
 const session={access_token:'fictional-access',refresh_token:'fictional-refresh',expires_at:Math.floor(now/1000)+(expired?-1:3600),user:{id:'fictional-user',user_metadata:{role:'usuario'}}};
 const secure=new Map([['go_auth_session_v2',JSON.stringify(session)]]);
 const storageApi={getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v),removeItem:async k=>storage.delete(k),multiRemove:async keys=>keys.forEach(k=>storage.delete(k))};
 const sessionEvents={onSessionChanged:fn=>{events.add(fn);return()=>events.delete(fn);},notifySessionChanged:()=>{for(const fn of events)fn();}};
 const AppState={currentState:'active',addEventListener:(_name,fn)=>{activity.add(fn);return{remove:()=>activity.delete(fn)}}};
 class Clock extends Date{static now(){return now;}}
 const transport=async(url,init)=>{
   const route=new URL(url).pathname;calls.push(route);
   if(route.endsWith('/auth/refresh')){
    if(responseStatus===410)return Response.json({code:'SESSION_UNRECOVERABLE'},{status:401});
    return Response.json({...session,access_token:'fictional-rotated',refresh_token:'fictional-next',expires_at:Math.floor(now/1000)+3600});
   }
   if(responseStatus!==200)return Response.json({error:'simulated denial'},{status:responseStatus});
   if(route.endsWith('/auth/me'))return Response.json({user:session.user,profile:{role:'usuario'}});
   if(route.endsWith('/admin/access'))return Response.json({userId:session.user.id,role:'admin',allowed:true,level:'owner',permissions:['admin.access','ownership.manage']});
   if(route.endsWith('/manage/businesses'))return Response.json([]);
   throw Error('Unexpected route '+route);
 };
 const auth=loadAuthSession({fetch:transport,process:{env:{EXPO_PUBLIC_API_URL:'http://fictional.invalid/api'}},Date:Clock},storageApi,{...sessionEvents,recordAuthTrace},{secure});
 class BookingApiError extends Error{constructor(message,status){super(message);this.status=status;}}
 const booking={BookingApiError,isCloudId:()=>true,supabaseApiRequest:async(route,init={},required=true,userId)=>{
  const r=await auth.fetchWithAuth('http://fictional.invalid/api'+route,init,required,userId);
  if(!r.ok)throw new BookingApiError('simulated denial',r.status);return r.json();
 }};
 rn.AppState=AppState;
 const mode=evaluate('contexts/GoModeContext.tsx',{'@react-native-async-storage/async-storage':storageApi});
 const adminData=evaluate('data/adminAccess.ts',{'@/lib/authSession':auth,'./booking':booking});
 const admin=evaluate('contexts/GoAdminAccessContext.tsx',{'@/data/adminAccess':adminData,'@/lib/sessionEvents':sessionEvents,'@/lib/authTrace':{recordAuthTrace}});
 const view=evaluate('contexts/GoViewContext.tsx',{'@react-native-async-storage/async-storage':storageApi,'./GoAdminAccessContext':admin,'./GoModeContext':mode,'@/data/goViewPolicy':evaluate('data/goViewPolicy.ts')});
 const businessData=evaluate('data/businessAccess.ts',{'@/lib/authSession':auth,'./booking':booking});
 const business=evaluate('contexts/GoBusinessAccessContext.tsx',{'@/data/businessAccess':businessData,'@/lib/sessionEvents':sessionEvents,'./GoModeContext':mode});
 const surface=evaluate('components/debug/OwnerContextIndicator.tsx',{'expo-linear-gradient':{LinearGradient:native('Gradient')},'react-native-screens':{FullWindowOverlay:native('Overlay')},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:44,bottom:34})},'@/contexts/GoViewContext':view,'@/contexts/GoAdminAccessContext':admin,'@/contexts/OwnerBusinessDemoContext':{useOwnerBusinessDemo:()=>({})}});

 rn.Dimensions={get:()=>({width:390,height:844})};
 rn.PanResponder={create:()=>({panHandlers:{}})};
 rn.Linking={addEventListener:()=>({remove(){}})};
 rn.Animated={Value:class{stopAnimation(){};interpolate(){return 0;}},View:native('AnimatedView'),timing:()=>({start(){}}),spring:()=>({start(){}})};
 for(const name of ['ActivityIndicator','ScrollView','TextInput','TouchableOpacity','Pressable'])rn[name]=native(name);
 rn.Modal=({visible,children})=>visible?React.createElement('div',{'data-native':'Modal'},children):null;
 const password=evaluate('components/auth/PasswordInput.tsx',{'@expo/vector-icons':{Feather:native('Feather')}});
 const panel=evaluate('components/auth/LoginRegisterPanel.tsx',{
  '@/components/debug/OwnerContextIndicator':surface,'@/lib/sessionEvents':sessionEvents,'@/lib/authSession':auth,
  '@/lib/registrationReturn':{readPendingRegistration:async()=>null,PENDING_REGISTRATION_KEY:'fictional-pending'},
  '@react-native-async-storage/async-storage':storageApi,
  'expo-linear-gradient':{LinearGradient:native('Gradient')},'expo-status-bar':{StatusBar:native('StatusBar')},
  '@expo/vector-icons':{Feather:native('Feather')},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:44,bottom:34})},
  'expo-haptics':{impactAsync:async()=>{},selectionAsync:async()=>{},ImpactFeedbackStyle:{Medium:'medium'}},
  '../DraggableFAB':{DraggableFAB:native('Fab')},'@/contexts/LanguageContext':{useLanguage:()=>({t:key=>key})},
  '@/contexts/GoAdminAccessContext':admin,'@/contexts/GoViewContext':view,'./AccountContextSelector':{AccountContextSelector:native('Selector')},
  './PasswordInput':password,
  '@/data/cuenta':{verificationColor:()=>''},
 });
 const Panel=props=>{React.useEffect(()=>{mounts.panel++;return()=>{};},[]);return React.createElement(panel.LoginRegisterPanel,props);};
 let actions,liveView,liveAdmin;
 // Execute the real Home hydration effect and account callback within React's
 // reconciler and real permission/view providers. Native/router host is simulated.
 const factorySource='exports.make=({React,AsyncStorage,AppState,onSessionChanged,restoreStoredAuthentication,consumeAuthRecoveryNotice,syncModeFromRole,Alert,capture,captureScreen,mounts,useOwnerLandingBackground,recordAuthTrace,Panel})=>function Home(){const {useState,useEffect,useRef}=React;const [userAccountType,setUserAccountType]=useState(null);const [goAuthOpen,setGoAuthOpen]=useState(true);const [authBootstrapComplete,setAuthBootstrapComplete]=useState(false);const [authBootstrapError,setAuthBootstrapError]=useState(null);const authBootstrapRetryRef=useRef(null);const '+commit+';'+bootstrap+';capture({userAccountType,goAuthOpen,authBootstrapComplete,commitAccountType,setGoAuthOpen,retry:()=>authBootstrapRetryRef.current?.()});const screen=authBootstrapComplete?(goAuthOpen?"access":"landing"):"recovering";captureScreen(screen);useEffect(()=>{mounts.home++;return()=>mounts.unmounts++;},[]);useOwnerLandingBackground(screen==="landing");return React.createElement(React.Fragment,null,React.createElement("div",{"data-screen":screen},screen),React.createElement(Panel,{visible:authBootstrapComplete&&goAuthOpen,userAccountType,onSetAccountType:commitAccountType,onClose:()=>setGoAuthOpen(false),onOpenPerfil:()=>{},onOpenEmpresa:()=>{}}));};';
 const code=ts.transpileModule(factorySource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const vm=await import('node:vm'),scope={exports:{}};vm.runInNewContext(code,scope);
 const MountedHome=scope.exports.make({React,AsyncStorage:storageApi,AppState,...sessionEvents,...auth,syncModeFromRole:()=>{},Alert:{alert(){}},capture:value=>{actions=value;},captureScreen:screen=>{if(screenChanges.at(-1)!==screen)screenChanges.push(screen);},mounts,useOwnerLandingBackground:surface.useOwnerLandingBackground,recordAuthTrace,Panel});
 const Observe=()=>{liveView=view.useGoView();liveAdmin=admin.useAdminAccess();return React.createElement(MountedHome);};
 const Root=()=>React.createElement(mode.GoModeProvider,null,React.createElement(admin.GoAdminAccessProvider,null,React.createElement(view.GoViewProvider,null,React.createElement(business.GoBusinessAccessProvider,null,React.createElement(surface.OwnerContextSurface,null,React.createElement(wrapperScope.exports.HomeScreen))))));

 const gate=evaluate('components/auth/BusinessAccessGate.tsx',{
  '@/contexts/GoBusinessAccessContext':business,'@/contexts/GoModeContext':mode,'@/data/businessAccess':businessData,
  '@/data/businessEnrollmentDraft':{businessEnrollmentDraftKey:()=>null,loadBusinessEnrollmentDraft:async()=>null,logBusinessEnrollmentFailure:()=>{}},
  '@/lib/authSession':auth,'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:44,bottom:34})},
 });
 const wrapperCode=ts.transpileModule(wrapper+';exports.HomeScreen=HomeScreen;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
 const wrapperScope={exports:{},React,useRef:React.useRef,useAdminAccess:admin.useAdminAccess,useGoView:view.useGoView,HomeScreenContent:Observe,BusinessAccessGate:gate.BusinessAccessGate};
 vm.runInNewContext(wrapperCode,wrapperScope);
 const root=createRoot(document.createElement('div'));
 await settle(()=>root.render(React.createElement(Root)));
 return{calls,screenChanges,mounts,secure,storage,auth,trace,get actions(){return actions;},get admin(){return liveAdmin;},get view(){return liveView;},
  async state(next){await settle(()=>{AppState.currentState=next;for(const fn of activity)fn(next);});},
  async select(next){await settle(()=>liveView.selectOwnerView(next));},
  async logout(){await settle(()=>auth.clearAuthSession());},
  async remount(){await settle(()=>root.render(null));await settle(()=>root.render(React.createElement(Root)));},
  async close(){await settle(()=>root.unmount());assert.equal(activity.size,0);assert.equal(events.size,0);},
  status(next){responseStatus=next;},advance(ms){now+=ms;},};
}

test('real React mount/foreground/context changes do not restart Home authentication',async()=>{
 const f=await fixture();try{
  assert.deepEqual(f.screenChanges,['recovering','landing']);assert.equal(f.mounts.home,1);
  for(const next of ['BUSINESS','USER','ADMIN','USER'])await f.select(next);
  for(let i=0;i<5;i++){await f.state('inactive');await f.state('background');await f.state('active');}
  assert.deepEqual(f.screenChanges,['recovering','landing']);assert.equal(f.mounts.home,1);assert.equal(f.mounts.panel,1);
  assert.equal(f.calls.filter(x=>x.endsWith('/auth/me')).length,1);assert.equal(f.calls.filter(x=>x.endsWith('/auth/refresh')).length,0);
  assert.equal(f.storage.get('demo-data'),'preserve');
 }finally{await f.close();}
});
test('remount hydrates persisted session once and manual logout keeps access open',async()=>{
 const f=await fixture();try{await f.remount();assert.equal(f.calls.filter(x=>x.endsWith('/auth/me')).length,2);
  await f.logout();assert.equal(f.screenChanges.at(-1),'access');await f.state('background');await f.state('active');
  assert.equal(f.screenChanges.at(-1),'access');assert.equal(f.secure.size,0);assert.equal(f.storage.get('demo-data'),'preserve');
 }finally{await f.close();}
});
for(const status of [401,403,429])test('mounted restoration and foreground permission '+status+' retains session without navigation loop',async()=>{
 const f=await fixture({status});try{
  for(let i=0;i<3;i++){await f.state('inactive');await f.state('active');}
  assert.deepEqual(f.screenChanges,['recovering','landing']);assert.equal(f.mounts.home,1);
  assert.ok(f.secure.has('go_auth_session_v2'));assert.equal(f.admin.allowed,false);
  assert.ok(f.calls.filter(x=>x.endsWith('/auth/refresh')).length<=1);
 }finally{await f.close();}
});
test('expired cold start shares one renewal across mounted permissions and Home',async()=>{
 const f=await fixture({expired:true});try{
  assert.deepEqual(f.screenChanges,['recovering','landing']);assert.equal(f.calls.filter(x=>x.endsWith('/auth/refresh')).length,1);
 }finally{await f.close();}
});

test('confirmed permission transitions never remount the User working screen or repeat auth/me',async()=>{
 const f=await fixture();try{
  assert.equal(f.admin.allowed,true);const initialMounts=f.mounts.home;
  for(let i=0;i<3;i++){
   f.status(403);await f.state('inactive');await f.state('active');assert.equal(f.admin.allowed,false);
   f.status(200);await f.state('inactive');await f.state('active');assert.equal(f.admin.allowed,true);
  }
  assert.equal(f.mounts.home,initialMounts,'Server authorization changes must not replace the screen component tree');
  assert.equal(f.calls.filter(x=>x.endsWith('/auth/me')).length,1,'Revalidating permissions must not restart authentication bootstrap');
  assert.deepEqual(f.screenChanges,['recovering','landing']);assert.equal(f.storage.get('demo-data'),'preserve');
 }finally{await f.close();}
});
