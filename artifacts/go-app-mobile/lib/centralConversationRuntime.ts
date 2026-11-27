import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import {CentralConversation,type CentralReply} from "./centralConversation";
import {centralAssistantApi} from "./centralAssistant";
import {centralSpeechOptions,deviceVoices} from "./centralVoicePreferences";

/** One existing conversation model per account, shared by chat and general privacy controls. */
const conversations=new Map<string,{model:CentralConversation;locale:string}>();
export function centralConversationFor(userId:string,locale="es-ES"){
  const existing=conversations.get(userId);if(existing){existing.locale=locale;return existing.model;}
  const state={locale,speechEpoch:0,model:null as unknown as CentralConversation};
  state.model=new CentralConversation(userId,{
    read:key=>AsyncStorage.getItem(key),write:(key,value)=>AsyncStorage.setItem(key,value),remove:key=>AsyncStorage.removeItem(key),
    respond:(messages,signal)=>centralAssistantApi<CentralReply>(userId,"/respond",{messages,requestId:globalThis.crypto?.randomUUID?.(),consent:true},signal),
    confirm:id=>centralAssistantApi(userId,"/proposal/confirm",{id,confirmed:true,consent:true}),
    cancelProposal:()=>centralAssistantApi(userId,"/proposal/cancel",{consent:true}),
    cloud:{read:()=>centralAssistantApi(userId,"/history"),write:(revision,messages)=>centralAssistantApi(userId,"/history",{consent:true,revision,messages},undefined,"PUT")},
    speak:(text,onStart,onDone,onError)=>{const prefs={...state.model.speech},epoch=++state.speechEpoch;
      void Speech.getAvailableVoicesAsync().then(voices=>centralSpeechOptions(deviceVoices(voices),prefs,state.locale))
        .catch(()=>({language:prefs.locale??state.locale,rate:prefs.rate})).then(options=>{
          // Enumeration may finish after interruption, revocation or a session change.
          if(epoch!==state.speechEpoch)return;
          const spoken=text.replace(/```[^\n]*\n?/g,"").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1")
            .replace(/(?:\*\*|__|\*|_|`)/g,"").replace(/^\s{0,3}#{1,6}\s+/gm,"").replace(/^\s*[-+]\s+/gm,"");
          try{Speech.speak(spoken,{...options,onStart,onDone,onStopped:onDone,onError});}catch{onError();}
        });},stop:()=>{state.speechEpoch++;void Speech.stop().catch(()=>{});},
    pause:()=>Speech.pause(),resume:()=>Speech.resume(),
  });conversations.set(userId,state);return state.model;
}
