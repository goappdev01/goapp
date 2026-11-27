export type CentralSpeechPreferences={locale:string|null;voiceId:string|null;gender:"male"|"female"|null;rate:number};
export type DeviceVoice={identifier:string;name:string;language:string;gender?:"male"|"female"};
export const defaultCentralSpeech:CentralSpeechPreferences={locale:null,voiceId:null,gender:null,rate:1};
export function centralSpeechPreferences(value:unknown):CentralSpeechPreferences{
  const v=value&&typeof value==="object"?value as Record<string,unknown>:{};
  return{locale:typeof v.locale==="string"&&/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(v.locale)?v.locale:null,
    voiceId:typeof v.voiceId==="string"&&v.voiceId.length>0&&v.voiceId.length<=240?v.voiceId:null,
    gender:v.gender==="male"||v.gender==="female"?v.gender:null,
    rate:typeof v.rate==="number"&&Number.isFinite(v.rate)?Math.max(.75,Math.min(2,v.rate)):1};
}
/** Gender is used only if the native provider actually reports it; never infer from names or pitch. */
export function deviceVoices(value:unknown):DeviceVoice[]{
  if(!Array.isArray(value))return[];const seen=new Set<string>();return value.flatMap(v=>{
    if(!v||typeof v.identifier!=="string"||!v.identifier||seen.has(v.identifier)||typeof v.name!=="string"||typeof v.language!=="string"
      ||!centralSpeechPreferences({locale:v.language}).locale)return[];
    seen.add(v.identifier);return[{identifier:v.identifier,name:v.name,language:v.language,
      ...(v.gender==="male"||v.gender==="female"?{gender:v.gender}:{})}];
  });
}
export function matchingDeviceVoices(voices:DeviceVoice[],prefs:CentralSpeechPreferences,fallbackLocale:string){
  const locale=prefs.locale??fallbackLocale;
  return voices.filter(v=>v.language.toLowerCase()===locale.toLowerCase()&&(!prefs.gender||v.gender===prefs.gender));
}
export function centralSpeechOptions(voices:DeviceVoice[],prefs:CentralSpeechPreferences,fallbackLocale:string){
  const matches=matchingDeviceVoices(voices,prefs,fallbackLocale),selected=matches.find(v=>v.identifier===prefs.voiceId);
  return{language:prefs.locale??fallbackLocale,rate:prefs.rate,...(selected?{voice:selected.identifier}:matches[0]?{voice:matches[0].identifier}:{})};
}
