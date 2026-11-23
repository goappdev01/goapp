import {centralMessageSchema,type CentralMessage} from "@workspace/api-zod";

export type CentralConversationDependencies={
  read:(key:string)=>Promise<string|null>;write:(key:string,value:string)=>Promise<void>;remove:(key:string)=>Promise<void>;
  respond:(messages:CentralMessage[],signal:AbortSignal)=>Promise<{answer:string}>;
  speak:(text:string,onStart:()=>void,onDone:()=>void,onError:()=>void)=>void;stop:()=>void;
};
/** Only explicit conversation text is ever transmitted. No GO data/action dispatcher. */
export class CentralConversation{
  messages:CentralMessage[]=[];consent=false;remember=false;voice=false;busy=false;speaking=false;completed=false;notice="";ready=false;
  private epoch=0;private speechEpoch=0;private completionTimer:ReturnType<typeof setTimeout>|null=null;private controller:AbortController|null=null;private writes=Promise.resolve();
  private listeners=new Set<()=>void>();
  readonly key:string;
  constructor(readonly userId:string,private deps:CentralConversationDependencies){this.key="go_central_conversation_v1:"+encodeURIComponent(userId);}
  subscribe(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  private change(){for(const listener of this.listeners)listener();}
  async restore(){const epoch=this.epoch;try{const raw=await this.deps.read(this.key);if(epoch!==this.epoch)return;
    if(raw){const saved=JSON.parse(raw);if(saved.remember===true&&Array.isArray(saved.messages)&&saved.messages.length<=20){const messages=saved.messages.map((m:unknown)=>centralMessageSchema.parse(m));if(messages.reduce((n:number,m:CentralMessage)=>n+m.text.length,0)<=12000){this.messages=messages;this.remember=true;}}}
  }catch{if(epoch===this.epoch)this.notice="No se pudo recuperar el historial local. No se ha transmitido ningún dato.";}
    finally{if(epoch===this.epoch){this.ready=true;this.change();}}}
  private persist(){const saved=this.remember?JSON.stringify({remember:true,messages:this.messages}):null;
    this.writes=this.writes.then(()=>saved?this.deps.write(this.key,saved):this.deps.remove(this.key)).catch(()=>{this.notice="No se pudo guardar el historial local. La conversación sigue disponible mientras esté abierta.";this.change();});return this.writes;}
  setConsent(value:boolean){this.consent=value;if(!value)this.interrupt();this.change();}
  setRemember(value:boolean){if(!this.ready)return;this.remember=value;void this.persist();this.change();}
  setVoice(value:boolean){this.voice=value;if(!value){this.speechEpoch++;this.speaking=false;this.deps.stop();}this.change();}
  private finish(){this.completed=true;this.change();if(this.completionTimer)clearTimeout(this.completionTimer);this.completionTimer=setTimeout(()=>{this.completed=false;this.completionTimer=null;this.change();},900);}
  interrupt(){this.epoch++;this.speechEpoch++;if(this.completionTimer)clearTimeout(this.completionTimer);this.completionTimer=null;this.completed=false;this.controller?.abort();this.controller=null;this.busy=false;this.speaking=false;this.deps.stop();this.change();}
  clear(){this.interrupt();this.messages=[];this.notice="";void this.persist();this.change();}
  async respond(text:string){
    if(!this.ready||!this.consent)throw Error("Autoriza el envío de los mensajes a OpenAI para conversar.");
    if(!text.trim()||text.length>4000)throw Error("Escribe un mensaje de hasta 4.000 caracteres.");
    this.interrupt();const epoch=this.epoch,controller=new AbortController();this.controller=controller;this.busy=true;this.notice="";this.change();
    const input:CentralMessage[]=[...this.messages,{role:"user",text:text.trim()}];
    while(input.length>19||input.reduce((n,m)=>n+m.text.length,0)>8000)input.shift();
    try{const result=await this.deps.respond(input,controller.signal);if(epoch!==this.epoch)throw Error("Consulta interrumpida.");
      const answer=centralMessageSchema.parse({role:"assistant",text:result.answer});
      this.messages=[...input,answer];void this.persist();
      if(this.voice){const speechToken=++this.speechEpoch;this.deps.speak(answer.text,
        ()=>{if(epoch===this.epoch&&speechToken===this.speechEpoch){this.speaking=true;this.change();}},
        ()=>{if(epoch===this.epoch&&speechToken===this.speechEpoch){this.speaking=false;this.finish();}},
        ()=>{if(epoch===this.epoch&&speechToken===this.speechEpoch){this.speaking=false;this.notice="No se pudo reproducir la respuesta. Puedes leerla en el chat.";this.change();}});}
      else this.finish();
      return {answer:answer.text};
    }finally{if(epoch===this.epoch){this.busy=false;this.controller=null;this.change();}}
  }
}
