const life=require('./react-lifecycle.cjs'),{React,createRoot,document,evaluate,rn,native}=life;
const settle=async fn=>React.act(async()=>{await fn?.();for(let i=0;i<20;i++)await Promise.resolve();});
async function assistantToolsFixture({handedness='right',width=390,height=300}={}){
 const buttons=new Map(),inputs=new Map(),events=new Map(),calls=[],frames=[];
 let keyboardVisible=false,setStatus,assistant,closed=0;
 const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='string'?n:n?.props?text(n.props.children):'';
 const View=React.forwardRef((props,ref)=>{React.useImperativeHandle(ref,()=>({scrollToEnd(){}}));React.useLayoutEffect(()=>{
   props.onLayout?.({nativeEvent:{layout:{x:0,y:0,width,height:props.testID==='assistant-conversation-viewport'?height:80}}});
 },[]);return React.createElement('div',{'data-testid':props.testID},props.children);});
 const runtime={...rn,View,Text:native('Text'),ActivityIndicator:()=>null,KeyboardAvoidingView:View,ScrollView:View,
   useWindowDimensions:()=>({width,height:844}),TextInput:props=>{inputs.set(props.accessibilityLabel,props);return React.createElement('input');},
   TouchableOpacity:props=>{buttons.set(props.accessibilityLabel||text(props.children),props);return React.createElement('button',null,props.children);},
   Keyboard:{isVisible:()=>keyboardVisible,dismiss(){keyboardVisible=false;events.get('keyboardDidHide')?.({duration:0});},addListener:(name,fn)=>{events.set(name,fn);return{remove:()=>events.delete(name)};}},
 };
 const icons={Feather:()=>null},fab={DraggableFAB:props=>{frames.push(props);return props.children;}};
 const rail=evaluate('components/ui/GoToolRail.tsx',{'react-native':runtime,'@expo/vector-icons':icons,'@/components/DraggableFAB':fab});
 const ui=evaluate('components/booking-assistant/BookingAssistantUI.tsx',{'react-native':runtime,'@expo/vector-icons':icons});
 const go={manager:{state:null},active:null,choices:[],dispatch:(...args)=>calls.push(['dispatch',...args]),start:kind=>calls.push(['start',kind]),reset(){}};
 const panels=evaluate('components/booking-assistant/BookingAssistantPanels.tsx',{'react-native':runtime,'@/components/ui/GoToolRail':rail,
   './AssistantCloseControls':{AssistantCloseControls:()=>null},'./BookingAssistantUI':ui,'@/hooks/useGoActions':{GO_TASK_CREATION_ONLY:true}});
 const screen=evaluate('components/booking-assistant/BookingAssistantScreen.tsx',{
   'react-native':runtime,'react-native-gesture-handler':{GestureHandlerRootView:View},'@expo/vector-icons':icons,
   'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})},'expo-status-bar':{StatusBar:()=>null},
   '@/components/ui/GoToolRail':rail,'@/components/ui/GoScreenCloseSurface':{GoScreenCloseSurface:View,GoScreenCloseGuide:()=>null},
   '@/components/landing/SupportVoiceNotice':{SupportVoiceNotice:()=>null},'./AssistantCloseControls':{AssistantCloseControls:()=>null},
   '@/hooks/useAssistantZoneScope':{useAssistantZoneScope:()=>({ready:true,scope:{userId:'fixture-user'}})},
   '@/hooks/useBookingAssistant':{useBookingAssistant:()=>{
     const [panel,setPanel]=React.useState(null),[busy,setBusy]=React.useState(''),[notice,setNotice]=React.useState('');
     assistant={panel,setPanel,busy,setBusy,notice,setNotice,phase:'idle',request:{},messages:[],selection:{current:{}},places:[],bookings:[],radiusText:'5',placeText:'',
       invalidate(){},reset(){setPanel(null);},openZonePanel(){calls.push(['zone']);setPanel('zone');},showBookings(){setPanel('bookings');},
       setPlaceQuery(){},setRadiusText(){},rememberZone(){},work:async(label,fn)=>fn(1),check(){},searchPlaces(){}};return assistant;
   }},
   '@/hooks/useGoActions':{useGoActions:()=>go},'@/hooks/useBookingVoice':{useBookingVoice:()=>{
     const [status,update]=React.useState('idle');setStatus=update;return{status,error:'',transcript:'',abort(){calls.push(['abort']);update('idle');},start(zone){calls.push(['voice',zone]);update('listening');},stop(){calls.push(['stop']);update('idle');}};
   }},
   '@/lib/bookingAssistant':{assistantApi:async()=>({interpretation:false}),localToday:()=> '2030-01-01'},
   'expo-image-picker':{launchImageLibraryAsync:async()=>({canceled:true})},'expo-document-picker':{getDocumentAsync:async()=>({canceled:true})},
   './ListeningIndicator':{ListeningIndicator:()=>null,listeningPlacement:()=>null},'./BookingAssistantPanels':panels,'./BookingAssistantUI':ui,
 });
 const container=document.createElement('div'),root=createRoot(container);
 await settle(()=>root.render(React.createElement(screen.BookingAssistantScreen,{visible:true,handedness,onClose(){closed++;}})));
 return{container,calls,frames,button:label=>buttons.get(label),input:()=>inputs.get('Solicitud a GO'),get panel(){return assistant.panel;},get closed(){return closed;},
   press:label=>settle(()=>{const button=buttons.get(label);if(!button)throw Error('Missing '+label);button.onPressIn?.();return button.onPress();}),
   type:value=>settle(()=>inputs.get('Solicitud a GO').onChangeText(value)),status:value=>settle(()=>setStatus(value)),
   keyboard:()=>settle(()=>{keyboardVisible=true;events.get('keyboardWillShow')?.({duration:0});}),close:()=>settle(()=>root.unmount())};
}
module.exports={assistantToolsFixture};
