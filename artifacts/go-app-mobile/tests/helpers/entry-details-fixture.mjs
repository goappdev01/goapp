import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,evaluate,rn,native}=require('./tests/helpers/react-lifecycle.cjs');
export const presentation=evaluate('data/goEntryPresentation.ts');
const components=evaluate('components/GoEntryDetails.tsx',{
 'react-native':{...rn,TouchableOpacity:native('TouchableOpacity')},
 '@/data/goEntryPresentation':presentation,
 '@/data/reservationCardPolicy':evaluate('data/reservationCardPolicy.ts'),
 '@/contexts/LanguageContext':{useLanguage:()=>({lang:'es',t:k=>k})},
 'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})},
 './ui/GoCloseButton':{GoCloseButton:()=>null},
 './landing/landingPanels':evaluate('components/landing/landingPanels.ts'),
});
export const renderEntryQuickActions=(entry,showState=true,compact=false)=>React.createElement(components.GoEntryQuickActions,{entry,showState,compact,onCancel(){},onPropose(){},onEdit(){},onAccept(){},onReject(){}});
export const entryPhone=presentation.entryPhone;
