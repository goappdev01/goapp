import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),h=require('./unified-note-fixture.cjs');
export async function shoppingFixture(){
 const disk=await h.diskFixture(),model=h.load('lib/shoppingNote.ts');
 const api=()=>h.load('lib/shoppingNoteStore.ts',{'@react-native-async-storage/async-storage':disk.storage,'./goTaskAccess':disk.access,'./goLogStore':disk.store,'./unifiedNotes':disk.model,'./shoppingNote':model});
 const open=(scope=disk.scope,active=disk.active)=>api().openShoppingNote(scope,active);
 const run=(op,scope=disk.scope,active=disk.active)=>api().runShoppingOperation(scope,active,{operationId:model.shoppingId(),...op});
 const doc=()=>disk.rows.find(row=>row.ownerUserId===disk.scope.userId&&row.note?.shopping)?.note.shopping;
 const add=async(name,extra={})=>{const draft={...model.shoppingEditor(),name,category:model.suggestShoppingCategory(name,doc()),...extra};await run({type:'saveItem',draft});return doc().items.find(i=>i.id===draft.id);};
 return {disk,model,api,open,run,doc,add};
}

export async function shoppingUI(f,{handedness='right',width=390,height=844,fontScale=1,startList=true,scope=f.disk.scope,ready=true,
 adminAccess={userId:null,allowed:false,checking:false,unavailable:false},goView={view:'USER',isAdminView:false}}={}){
 const {React}=h,hosts=new Map(),instances=new Map(),geometry=new Map(),gestures=new Map(),calls=[],alerts=[],frames=new Map();let frameId=0;
 const keyboard={visible:false,focused:null,listeners:new Map(),isVisible(){return this.visible;},addListener(name,fn){const set=this.listeners.get(name)||new Set();set.add(fn);this.listeners.set(name,set);return{remove:()=>set.delete(fn)};},
  show(){this.visible=true;for(const name of ['keyboardWillShow','keyboardDidShow'])for(const fn of this.listeners.get(name)||[])fn({});},
  dismiss(){keyboard.visible=false;keyboard.focused=null;for(const fn of keyboard.listeners.get('keyboardDidHide')||[])fn({});}};
 const host=name=>React.forwardRef((p,ref)=>{
  const token=React.useRef({}).current,live=React.useRef(p);live.current=p;
  if(p.testID){hosts.set(p.testID,p);instances.set(p.testID,token);}
  React.useImperativeHandle(ref,()=>({measureInWindow:fn=>fn(...(geometry.get(live.current.testID)||(live.current.testID==='shopping-reorder-viewport'?[0,80,width,400]:[12,100,width-24,70]))),
   scrollTo:options=>calls.push(['scrollTo',live.current.testID,options]),scrollResponderScrollNativeHandleToKeyboard:(...args)=>calls.push(['reveal',...args])}));
  React.useEffect(()=>()=>{if(live.current.testID&&instances.get(live.current.testID)===token){hosts.delete(live.current.testID);instances.delete(live.current.testID);}},[]);
  return React.createElement('div',{'data-native':name,'data-testid':p.testID},p.children);
 });
 const native={...h.rn,View:host('View'),Text:host('Text'),TouchableOpacity:host('Button'),TextInput:host('Input'),ScrollView:host('ScrollView'),KeyboardAvoidingView:host('KeyboardFrame'),Modal:host('Modal'),Keyboard:keyboard,
  PanResponder:{create:handlers=>({panHandlers:handlers})},Share:{share:async payload=>{calls.push(['share',payload]);return {action:'sharedAction'};}},
  useWindowDimensions:()=>({width,height,fontScale,scale:3}),Alert:{alert:(title,message,buttons)=>alerts.push({title,message,buttons})}};
 native.TextInput.State={currentlyFocusedInput:()=>keyboard.focused};
 const gh={GestureHandlerRootView:native.View,GestureDetector:({gesture,children})=>{gestures.set(children.props.testID,gesture);return children;},Gesture:{Pan:()=>{
  const pan={};for(const key of ['enabled','activateAfterLongPress','maxPointers','runOnJS'])pan[key]=value=>{pan[key+'Value']=value;return pan;};
  for(const key of ['onStart','onUpdate','onFinalize'])pan[key]=fn=>{pan[key+'Handler']=fn;return pan;};return pan;
 }}};
 const globals={requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id)};
 const board=h.load('components/boards/BoardDragSurface.tsx',{'react-native':native});
 const reorder=h.load('components/notes/ShoppingReorderSurface.tsx',{'react-native':native,'react-native-gesture-handler':gh,'@/components/boards/BoardDragSurface':board},globals);
 const keyboardHook=h.load('hooks/useGoNoteKeyboard.ts',{'react-native':native});
 const store={subscribeGoLog:f.disk.store.subscribeGoLog,getGoLogSnapshot:f.disk.store.getGoLogSnapshot};
 const experience=h.load('lib/shoppingExperience.ts',{'./shoppingNote':f.model});
 const icons={Feather:host('Feather'),MaterialCommunityIcons:host('Illustration')};
 const row=h.load('components/notes/ShoppingProductRow.tsx',{'react-native':native,'@expo/vector-icons':icons,'@/lib/shoppingNote':f.model,'@/lib/shoppingProductArt':h.load('lib/shoppingProductArt.ts',{'./shoppingNote':f.model})});
 const catalog=h.load('lib/shoppingCatalog.ts',{'./shoppingNote':f.model});
 const choice=h.load('components/notes/ShoppingCatalogChoice.tsx',{'react-native':native});
 const {GoShoppingNote}=h.load('components/notes/GoShoppingNote.tsx',{'react-native':native,'react-native-gesture-handler':gh,'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:44,bottom:20,left:0,right:0})},'expo-linear-gradient':{LinearGradient:native.View},
  '@expo/vector-icons':icons,'@/lib/shoppingProductArt':h.load('lib/shoppingProductArt.ts',{'./shoppingNote':f.model}),'@/lib/shoppingShare':h.load('lib/shoppingShare.ts',{'./shoppingNote':f.model}),'@/lib/shoppingExperience':experience,'@/lib/shoppingCatalog':catalog,'./ShoppingProductRow':row,'./ShoppingCatalogChoice':choice,'@/hooks/useBookingVoice':{useBookingVoice:()=>({status:'idle',error:'',abort(){},start:async()=>{},stop:async()=>{}})},
  '@/components/ui/GoScreenModal':{GoScreenModal:native.Modal},'@/components/ui/GoCloseButton':{GoCloseButton:native.TouchableOpacity},'@/hooks/useGoNoteKeyboard':keyboardHook,
  '@/contexts/GoAdminAccessContext':{useAdminAccess:()=>adminAccess},'@/contexts/GoViewContext':{useGoView:()=>goView},
  '@/lib/goLogStore':store,'@/lib/unifiedNotes':f.disk.model,'@/lib/shoppingNoteStore':f.api(),'@/lib/shoppingNote':f.model,'./ShoppingReorderSurface':reorder},globals);
 const container=h.document.createElement('div'),root=h.createRoot(container);let props={visible:true,ready,scope,handedness,onClose:()=>calls.push(['close'])};
 const idle=async()=>{for(let i=0;i<10;i++)await h.settle(()=>new Promise(setImmediate));};
 const render=async patch=>{props={...props,...patch};await h.settle(()=>root.render(React.createElement(GoShoppingNote,props)));await idle();};
 await render({});
 const tap=async id=>{assert.ok(hosts.has(id),'control exists: '+id);await h.settle(()=>hosts.get(id).onPress());await idle();};
 if(startList&&hosts.has('shopping-list'))await tap('shopping-list');
 const input=async(key,value)=>{assert.ok(hosts.has("shopping-field-"+key));await h.settle(()=>hosts.get("shopping-field-"+key).onChangeText(value));await idle();};
 return {hosts,instances,calls,alerts,frames,geometry,gestures,keyboard,container,render,idle,tap,input,run:h.settle,
  async frame(time){const pending=[...frames.values()];frames.clear();await h.settle(()=>pending.forEach(fn=>fn(time)));},close:()=>h.settle(()=>root.unmount())};
}

