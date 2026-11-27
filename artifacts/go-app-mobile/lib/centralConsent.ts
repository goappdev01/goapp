import {Alert} from "react-native";
import type {CentralConversation} from "./centralConversation";
const pending=new WeakMap<CentralConversation,Promise<void>>();
export const CENTRAL_PRIVACY_DISCLOSURE="OpenAI recibirá solo los mensajes que escribas o que transcribas localmente para responderte. Evita datos personales innecesarios. No se envía audio a OpenAI ni se solicita guardar sus respuestas; esto no acredita retención cero. Recordar el historial es opcional. Puedes revocar el envío y borrar tus conversaciones en GO → Configuración → Preferencias → Privacidad. Las operaciones que requieran autorización mantienen revisión y confirmación expresa.";
export function requestCentralConsent(model:CentralConversation,isCurrent:()=>boolean){
  if(!model.ready)return Promise.reject(Error("Espera a que se recuperen tus preferencias."));
  if(model.consent)return Promise.resolve();const current=pending.get(model);if(current)return current;
  const promise=new Promise<void>((resolve,reject)=>Alert.alert("Permitir envío a OpenAI",CENTRAL_PRIVACY_DISCLOSURE,[
    {text:"Ahora no",style:"cancel",onPress:()=>{if(isCurrent())model.setConsent(false);reject(Error("Puedes autorizar el envío desde Preferencias → Privacidad."));}},
    {text:"Permitir",onPress:()=>{if(!isCurrent()){reject(Error("La sesión ha cambiado."));return;}model.setConsent(true);resolve();}},
  ],{cancelable:false})).finally(()=>pending.delete(model));pending.set(model,promise);return promise;
}
