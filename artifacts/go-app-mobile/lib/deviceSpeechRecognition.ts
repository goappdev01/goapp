import {isRunningInExpoGo,requireOptionalNativeModule} from "expo";

export type DeviceSpeechCallbacks={started:()=>void;partial:(text:string)=>void;ended:(text:string)=>void;failed:(message:string)=>void};
export type DeviceSpeechPort={start:(callbacks:DeviceSpeechCallbacks)=>Promise<void>;stop:()=>void;abort:()=>void};
type NativeRecognition={isRecognitionAvailable:()=>boolean;supportsOnDeviceRecognition:()=>boolean;
  requestMicrophonePermissionsAsync:()=>Promise<{granted:boolean;canAskAgain?:boolean}>;
  start:(options:object)=>void;stop:()=>void;abort:()=>void;
  addListener:(name:string,listener:(event:any)=>void)=>{remove:()=>void}};

/** Uses only an already compiled local recognizer. Never records files or calls a paid/network fallback. */
export function createDeviceSpeechRecognition(locale:string):DeviceSpeechPort{
  let module:NativeRecognition|null=null,subscriptions:{remove:()=>void}[]=[],generation=0;
  const clean=()=>{subscriptions.splice(0).forEach(subscription=>subscription.remove());};
  const abort=()=>{generation++;clean();try{module?.abort();}catch{}module=null;};
  return {abort,stop:()=>{module?.stop();},async start(callbacks){
    abort();const epoch=generation;
    if(isRunningInExpoGo())throw Error("Expo Go no incluye reconocimiento de voz directo. Puedes escribir o usar el dictado del teclado. Escuchar al pulsar GO necesita una compilación nativa con reconocimiento local; no se ha contratado audio de pago.");
    module=requireOptionalNativeModule<NativeRecognition>("ExpoSpeechRecognition");
    if(!module)throw Error("Esta compilación no incluye reconocimiento de voz nativo. Puedes escribir o usar el dictado del teclado; no se ha iniciado una grabación.");
    const native=module;
    if(!native.isRecognitionAvailable()||!native.supportsOnDeviceRecognition())throw Error("El reconocimiento local no está disponible en este dispositivo o idioma. Puedes escribir o usar el dictado del teclado. No se enviará audio a un servicio externo.");
    const permission=await native.requestMicrophonePermissionsAsync();if(epoch!==generation)return;
    if(!permission.granted)throw Error(permission.canAskAgain===false?"El permiso del micrófono está denegado. Puedes cambiarlo en los ajustes del dispositivo o escribir.":"Permite el acceso al micrófono para hablar con GO o continúa escribiendo.");
    let finalText="",finished=false;
    const fail=(message:string)=>{if(epoch!==generation||finished)return;finished=true;clean();try{native.abort();}catch{}callbacks.failed(message);};
    try{
      subscriptions.push(native.addListener("start",()=>{if(epoch===generation)callbacks.started();}));
      subscriptions.push(native.addListener("result",event=>{if(epoch!==generation||finished)return;const text=event?.results?.[0]?.transcript;
        if(typeof text!=="string"||text.length>4000)return;callbacks.partial(text);if(event.isFinal===true)finalText=text.trim();}));
      subscriptions.push(native.addListener("error",()=>fail("No se pudo reconocer tu voz localmente. Revisa el permiso y el idioma, o escribe tu mensaje.")));
      subscriptions.push(native.addListener("end",()=>{if(epoch!==generation||finished)return;finished=true;clean();callbacks.ended(finalText);}));
      native.start({lang:locale,interimResults:true,continuous:false,requiresOnDeviceRecognition:true,recordingOptions:{persist:false}});
    }catch{clean();try{native.abort();}catch{}throw Error("No se pudo iniciar el reconocimiento local. Puedes escribir sin perder la conversación.");}
  }};
}
