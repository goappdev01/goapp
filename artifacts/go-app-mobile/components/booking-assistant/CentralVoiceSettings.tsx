import React,{useEffect,useReducer,useState} from "react";
import {Text,TouchableOpacity,View} from "react-native";
import * as Speech from "expo-speech";
import type {CentralConversation} from "@/lib/centralConversation";
import {deviceVoices,matchingDeviceVoices,type DeviceVoice} from "@/lib/centralVoicePreferences";
import {useLanguage} from "@/contexts/LanguageContext";

/** Device catalogue is the sole source for language, accent, gender and voice choices. */
export function CentralVoiceSettings({model}:{model:CentralConversation}){
  const {locale,lang}=useLanguage(),[,render]=useReducer(n=>n+1,0),[voices,setVoices]=useState<DeviceVoice[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [opened,setOpened]=useState<string|null>(null);useEffect(()=>model.subscribe(render),[model]);
  useEffect(()=>{let current=true;setLoading(true);void Speech.getAvailableVoicesAsync().then(rows=>{if(current){setVoices(deviceVoices(rows));setError("");}})
    .catch(()=>{if(current)setError(lang==="en"?"Device voices could not be listed. System voice remains available.":"No se pudieron consultar las voces del dispositivo. Se conserva la voz del sistema.");})
    .finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[lang]);
  const prefs=model.speech,chosenLocale=prefs.locale??locale,language=chosenLocale.split('-')[0];
  const languages=[...new Set(voices.map(v=>v.language.split('-')[0]))].sort(),accents=[...new Set(voices.filter(v=>v.language.split('-')[0]===language).map(v=>v.language))].sort();
  const available=matchingDeviceVoices(voices,prefs,locale),selected=available.find(v=>v.identifier===prefs.voiceId);
  const genders=[...new Set(voices.filter(v=>v.language===chosenLocale).flatMap(v=>v.gender?[v.gender]:[]))];
  const languageName=(code:string)=>{try{return new Intl.DisplayNames([locale],{type:"language"}).of(code)??code;}catch{return code;}};
  const field=(id:string,label:string,value:string,options:{id:string;label:string;press:()=>void}[])=><View key={id} style={{gap:4,minWidth:0}}>
    <TouchableOpacity testID={id} accessibilityRole="button" accessibilityState={{expanded:opened===id,disabled:loading||!model.ready}} disabled={loading||!model.ready} onPress={()=>setOpened(opened===id?null:id)} style={{minHeight:48,padding:10,borderWidth:1,borderColor:"#CBD5E1",borderRadius:12,backgroundColor:"#FFF"}}>
      <Text style={{fontSize:14,fontWeight:"700",color:"#183955",flexShrink:1}}>{label}</Text><Text style={{fontSize:14,color:"#475569",flexShrink:1}}>{value}</Text>
    </TouchableOpacity>
    {opened===id&&options.map(option=><TouchableOpacity key={option.id} accessibilityRole="button" onPress={()=>{option.press();setOpened(null);}} style={{minHeight:44,padding:10,borderRadius:10,backgroundColor:"#EEF4F8"}}><Text style={{fontSize:14,color:"#183955",flexShrink:1}}>{option.label}</Text></TouchableOpacity>)}
  </View>;
  return <View testID="central-ai-voice-settings" style={{gap:10,minWidth:0}}>
    {loading&&<Text style={{color:"#475569"}}>{lang==="en"?"Reading device voices…":"Consultando voces del dispositivo…"}</Text>}
    {!!error&&<Text accessibilityLiveRegion="polite" style={{color:"#475569"}}>{error}</Text>}
    {field("central-ai-language",lang==="en"?"Language":"Idioma",languageName(language),languages.map(code=>({id:code,label:languageName(code),press:()=>model.setSpeech({locale:voices.find(v=>v.language.split('-')[0]===code)!.language,voiceId:null,gender:null})})))}
    {field("central-ai-accent",lang==="en"?"Accent":"Acento",chosenLocale,accents.map(accent=>({id:accent,label:accent,press:()=>model.setSpeech({locale:accent,voiceId:null,gender:null})})))}
    {genders.length?field("central-ai-voice-type",lang==="en"?"Voice type":"Tipo de voz",prefs.gender==="male"?(lang==="en"?"Male":"Masculina"):prefs.gender==="female"?(lang==="en"?"Female":"Femenina"):lang==="en"?"All available":"Todas las disponibles",[{id:"all",label:lang==="en"?"All available":"Todas las disponibles",press:()=>model.setSpeech({gender:null,voiceId:null})},...genders.map(gender=>({id:gender,label:gender==="male"?(lang==="en"?"Male":"Masculina"):(lang==="en"?"Female":"Femenina"),press:()=>model.setSpeech({gender,voiceId:null})}))])
      :<Text testID="central-ai-gender-unreported" style={{fontSize:13,color:"#475569"}}>{lang==="en"?"Voice type: the device does not report male/female. Choose an available voice by its name.":"Tipo de voz: el dispositivo no informa si es masculina o femenina. Elige una voz disponible por su nombre."}</Text>}
    {field("central-ai-native-voice",lang==="en"?"Available voices":"Voces disponibles",selected?.name??(lang==="en"?"System voice":"Voz del sistema"),available.map(voice=>({id:voice.identifier,label:voice.name+" · "+voice.language,press:()=>model.setSpeech({voiceId:voice.identifier})})))}
    {!loading&&!available.length&&<Text style={{fontSize:13,color:"#475569"}}>{lang==="en"?"No selectable device voices for this language/accent.":"No hay voces seleccionables para este idioma/acento en el dispositivo."}</Text>}
    {field("central-ai-reading-rate",lang==="en"?"Reading speed":"Velocidad de lectura",prefs.rate+"×",[.75,1,1.25,1.5,2].map(rate=>({id:String(rate),label:rate+"×",press:()=>model.setSpeech({rate})})))}
    <TouchableOpacity testID="central-ai-speak" disabled={!model.ready} accessibilityRole="checkbox" accessibilityState={{checked:model.voice,disabled:!model.ready}} onPress={()=>model.setVoice(!model.voice)} style={{minHeight:48,padding:10,borderRadius:12,borderWidth:1,borderColor:"#CBD5E1",backgroundColor:"#FFF"}}><Text style={{fontSize:14,color:"#183955",flexShrink:1}}>{model.voice?"☑":"☐"} {lang==="en"?"Read replies automatically":"Lectura automática de respuestas"}</Text></TouchableOpacity>
  </View>;
}
