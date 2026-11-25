import {centralMessageSchema,type CentralMessage} from "@workspace/api-zod";

export type CentralConversationDependencies={
  read:(key:string)=>Promise<string|null>;write:(key:string,value:string)=>Promise<void>;remove:(key:string)=>Promise<void>;
  respond:(messages:CentralMessage[],signal:AbortSignal)=>Promise<{answer:string;metrics?:{latencyMs?:number;inputTokens?:number;outputTokens?:number}}>;
  speak:(text:string,onStart:()=>void,onDone:()=>void,onError:()=>void)=>void;stop:()=>void;
  cloud?:{read:()=>Promise<{revision:number;messages:CentralMessage[]}>;
    write:(revision:number,messages:CentralMessage[])=>Promise<{revision:number}>};
};
export class CentralHistoryConflict extends Error{}
/** Only explicit conversation text is ever transmitted. No GO data/action dispatcher. */
export class CentralConversation{
  messages:CentralMessage[]=[];consent=false;remember=false;voice=false;busy=false;speaking=false;completed=false;notice="";ready=false;cloudEnabled=false;
  usage={inputTokens:0,outputTokens:0,lastLatencyMs:0,measuredCalls:0};
  private epoch=0;private speechEpoch=0;private completionTimer:ReturnType<typeof setTimeout>|null=null;private controller:AbortController|null=null;private writes=Promise.resolve();
  private cloudRevision=0;private cloudEpoch=0;
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
    const cloudMessages=[...this.messages],cloudEpoch=this.cloudEpoch;
    this.writes=this.writes.then(async()=>{
      await (saved?this.deps.write(this.key,saved):this.deps.remove(this.key));
      if(this.cloudEnabled&&cloudEpoch===this.cloudEpoch&&this.deps.cloud){
        try{const result=await this.deps.cloud.write(this.cloudRevision,cloudMessages);this.cloudRevision=result.revision;}
        catch{this.cloudEnabled=false;this.cloudEpoch++;await this.deps.remove(this.key+":cloud").catch(()=>{});
          this.notice=cloudMessages.length?"No se pudo sincronizar el historial. Se conserva en este dispositivo; vuelve a conectarlo antes de cambiar de equipo.":"No se confirmó el borrado del historial de la cuenta. Inténtalo de nuevo.";this.change();}
      }
    }).catch(()=>{this.notice="No se pudo guardar el historial local. La conversación sigue disponible mientras esté abierta.";this.change();});return this.writes;}
  async enableCloud(preferRemote=false,allowCreate=true){
    if(!this.ready||!this.deps.cloud)throw Error("La sincronización no está disponible.");
    await this.writes;const remote=await this.deps.cloud.read();
    const checked=remote.messages.map(message=>centralMessageSchema.parse(message));
    if(!Number.isSafeInteger(remote.revision)||remote.revision<0||checked.length>20||checked.reduce((n,m)=>n+m.text.length,0)>12000)
      throw Error("El historial remoto no es válido.");
    if(remote.revision>0&&this.messages.length&&JSON.stringify(checked)!==JSON.stringify(this.messages)&&!preferRemote)
      throw new CentralHistoryConflict("Ya existe una conversación diferente en esta cuenta.");
    if(remote.revision>0){this.messages=checked;this.cloudRevision=remote.revision;}
    else if(!allowCreate){await this.deps.remove(this.key+":cloud");return;}
    else{const result=await this.deps.cloud.write(0,[...this.messages]);this.cloudRevision=result.revision;}
    await this.deps.write(this.key,JSON.stringify({remember:true,messages:this.messages}));
    await this.deps.write(this.key+":cloud","true");this.remember=true;this.cloudEnabled=true;this.cloudEpoch++;this.notice="";this.change();
  }
  async restoreCloudPreference(){
    if(!this.ready||!this.deps.cloud||await this.deps.read(this.key+":cloud")!=="true")return;
    try{await this.enableCloud(false,false);
    }catch{this.cloudEnabled=false;this.notice="No se pudo recuperar el historial de la cuenta. Se conserva la copia de este dispositivo.";this.change();}
  }
  async disableCloud(){await this.deps.remove(this.key+":cloud");this.cloudEnabled=false;this.cloudEpoch++;this.change();}
  setConsent(value:boolean){this.consent=value;if(!value)this.interrupt();this.change();}
  setRemember(value:boolean){if(!this.ready||this.cloudEnabled&&!value)return;this.remember=value;void this.persist();this.change();}
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
      const inputTokens=result.metrics?.inputTokens,outputTokens=result.metrics?.outputTokens,latencyMs=result.metrics?.latencyMs;
      if(typeof inputTokens==="number"&&Number.isSafeInteger(inputTokens)&&inputTokens>=0
        &&typeof outputTokens==="number"&&Number.isSafeInteger(outputTokens)&&outputTokens>=0){
        this.usage={inputTokens:this.usage.inputTokens+inputTokens,outputTokens:this.usage.outputTokens+outputTokens,
          lastLatencyMs:typeof latencyMs==="number"&&Number.isSafeInteger(latencyMs)&&latencyMs>=0?latencyMs:0,
          measuredCalls:this.usage.measuredCalls+1};
      }
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
