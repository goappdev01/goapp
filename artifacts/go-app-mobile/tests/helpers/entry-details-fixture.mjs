import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,evaluate,rn,native}=require('./tests/helpers/react-lifecycle.cjs');
const responder=evaluate('lib/calendarCloseResponder.ts',{'react-native':rn,'./calendarGestureOwnership':evaluate('lib/calendarGestureOwnership.ts')});
export const presentation=evaluate('data/goEntryPresentation.ts');
const components=evaluate('components/GoEntryDetails.tsx',{
 '@expo/vector-icons':{Feather:native('Feather')},
 'react-native':{...rn,TouchableOpacity:native('TouchableOpacity')},
 '@/data/goEntryPresentation':presentation,
 '@/data/reservationCardPolicy':evaluate('data/reservationCardPolicy.ts'),
 '@/contexts/LanguageContext':{useLanguage:()=>({lang:'es',t:k=>k})},
 'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})},
 './ui/GoCloseButton':{GoCloseButton:()=>null},
 './ui/CalendarCloseGuide':{CalendarCloseGuide:()=>null},
 '@/lib/calendarGestureOwnership':evaluate('lib/calendarGestureOwnership.ts'),
 '@/lib/calendarCloseResponder':responder,
 './landing/landingPanels':evaluate('components/landing/landingPanels.ts'),
});
export const renderEntryQuickActions=(entry,showState=true,compact=false)=>React.createElement(components.GoEntryQuickActions,{entry,showState,compact,onCancel(){},onPropose(){},onEdit(){},onAccept(){},onReject(){}});
export const renderEntryMicroActions=(entry,inline=false)=>React.createElement(components.GoEntryMicroActions,{entry,inline,onDone(){},onPending(){},onDiscard(){}});
export const entryIsReservation=presentation.entryIsReservation;
export const entryPhone=presentation.entryPhone;
