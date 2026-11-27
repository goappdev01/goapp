import {centralMessageSchema,centralProposalSchema,type CentralMessage,type CentralProposal} from "@workspace/api-zod";
import {centralSpeechPreferences,type CentralSpeechPreferences} from "./centralVoicePreferences";

export type CentralReply={answer:string;proposal?:CentralProposal;metrics?:{latencyMs?:number;inputTokens?:number;outputTokens?:number;
  actualMicroUsd?:number;estimatedMaximumMicroUsd?:number;chargedMicroUsd?:number;remainingMicroUsd?:number}};

export type CentralConversationDependencies={
  read:(key:string)=>Promise<string|null>;write:(key:string,value:string)=>Promise<void>;remove:(key:string)=>Promise<void>;
  respond:(messages:CentralMessage[],signal:AbortSignal)=>Promise<CentralReply>;
  confirm?:(id:string)=>Promise<{bookingId:string;status:string}>;
  cancelProposal?:()=>Promise<unknown>;
  speak:(text:string,onStart:()=>void,onDone:()=>void,onError:()=>void)=>void;stop:()=>void;
  pause?:()=>Promise<void>;resume?:()=>Promise<void>;
  cloud?:{read:()=>Promise<{revision:number;messages:CentralMessage[]}>;
    write:(revision:number,messages:CentralMessage[])=>Promise<{revision:number}>};
};
export class CentralHistoryConflict extends Error{}
/** Increment only when a changed disclosure requires a new informed decision. */
export const CENTRAL_CONSENT_VERSION=2;
/** Only explicit conversation text is ever transmitted. No GO data/action dispatcher. */
export class CentralConversation{
  messages:CentralMessage[]=[];consent=false;consentReviewed=false;remember=false;voice=true;busy=false;speaking=false;speechPaused=false;speechMessageIndex:number|null=null;speechError="";completed=false;notice="";ready=false;cloudEnabled=false;
  speech=centralSpeechPreferences(null);
  usage={inputTokens:0,outputTokens:0,lastLatencyMs:0,measuredCalls:0};
  proposal:CentralProposal|null=null;submitting=false;
  budget:{actualMicroUsd:number;estimatedMaximumMicroUsd:number;chargedMicroUsd:number;remainingMicroUsd:number}|null=null;
  private epoch=0;private speechEpoch=0;private completionTimer:ReturnType<typeof setTimeout>|null=null;private controller:AbortController|null=null;private writes=Promise.resolve();
  private cloudRevision=0;private cloudEpoch=0;
  private restoring:Promise<void>|null=null;
  private listeners=new Set<()=>void>();
  readonly key:string;
  constructor(readonly userId:string,private deps:CentralConversationDependencies){this.key="go_central_conversation_v1:"+encodeURIComponent(userId);}
  subscribe(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  private change(){for(const listener of this.listeners)listener();}
  get revision(){return this.epoch;}
  restoreProposal(value:unknown,revision=this.epoch){if(revision!==this.epoch||this.busy||this.submitting)return;this.proposal=value==null?null:centralProposalSchema.parse(value);this.change();}
  restore(){if(this.ready)return Promise.resolve();return this.restoring??=this.restoreStored().finally(()=>{this.restoring=null;});}
  private async restoreStored(){const epoch=this.epoch;try{const [raw,preferences]=await Promise.all([this.deps.read(this.key),this.deps.read(this.key+":preferences")]);if(epoch!==this.epoch)return;
    const prefs=preferences?JSON.parse(preferences):null;
    if(prefs&&typeof prefs==="object"&&!Array.isArray(prefs)){
      this.voice=prefs.voice!==false;this.remember=prefs.remember===true;
      this.speech=centralSpeechPreferences(prefs.speech);
      this.consentReviewed=prefs.consentVersion===CENTRAL_CONSENT_VERSION&&typeof prefs.consent==="boolean";
      this.consent=this.consentReviewed&&prefs.consent===true;
    }
    if(raw){const saved=JSON.parse(raw);if((!prefs||this.remember)&&saved.remember===true&&Array.isArray(saved.messages)&&saved.messages.length<=20){const messages=saved.messages.map((m:unknown)=>centralMessageSchema.parse(m));if(messages.reduce((n:number,m:CentralMessage)=>n+m.text.length,0)<=12000){this.messages=messages;this.remember=true;}}}
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
    await this.deps.write(this.key+":cloud","true");this.remember=true;this.cloudEnabled=true;this.cloudEpoch++;this.notice="";this.persistPreferences();this.change();
  }
  async restoreCloudPreference(){
    if(!this.ready||!this.deps.cloud||await this.deps.read(this.key+":cloud")!=="true")return;
    try{await this.enableCloud(false,false);
    }catch{this.cloudEnabled=false;this.notice="No se pudo recuperar el historial de la cuenta. Se conserva la copia de este dispositivo.";this.change();}
  }
  async disableCloud(){await this.deps.remove(this.key+":cloud");this.cloudEnabled=false;this.cloudEpoch++;this.change();}
  private persistPreferences(){if(!this.ready)return;const saved=JSON.stringify({consentVersion:CENTRAL_CONSENT_VERSION,consent:this.consent,remember:this.remember,voice:this.voice,speech:this.speech});
    this.writes=this.writes.then(()=>this.deps.write(this.key+":preferences",saved)).catch(()=>{this.notice="No se pudo guardar la preferencia. Compruébala al volver a entrar.";this.change();});}
  setConsent(value:boolean){if(!this.ready)return;this.consent=value;this.consentReviewed=true;if(!value)this.interrupt();this.persistPreferences();this.change();}
  setRemember(value:boolean){if(!this.ready||this.cloudEnabled&&!value)return;this.remember=value;this.persistPreferences();void this.persist();this.change();}
  setVoice(value:boolean){if(!this.ready)return;this.voice=value;if(!value)this.stopSpeech();this.persistPreferences();this.change();}
  setSpeech(value:Partial<CentralSpeechPreferences>){if(!this.ready)return;this.speech=centralSpeechPreferences({...this.speech,...value});this.persistPreferences();this.change();}
  private startSpeech(text:string,index:number,epoch=this.epoch){
    this.stopSpeech();const token=++this.speechEpoch;this.speechMessageIndex=index;this.speechError="";this.change();
    this.deps.speak(text,
      ()=>{if(epoch===this.epoch&&token===this.speechEpoch){this.speaking=true;this.change();}},
      ()=>{if(epoch===this.epoch&&token===this.speechEpoch){this.speaking=false;this.speechPaused=false;this.speechMessageIndex=null;this.finish();}},
      ()=>{if(epoch===this.epoch&&token===this.speechEpoch){this.speaking=false;this.speechPaused=false;this.speechMessageIndex=null;this.speechError="No se pudo reproducir la respuesta. Puedes leerla en el chat.";this.change();}});
  }
  playResponse(index:number){const message=this.messages[index];if(!message||message.role!=="assistant")return;this.startSpeech(message.text,index);}
  stopSpeech(){this.speechEpoch++;this.speaking=false;this.speechPaused=false;this.speechMessageIndex=null;this.deps.stop();this.change();}
  async pauseSpeech(){if(!this.speaking||this.speechMessageIndex===null||!this.deps.pause)return;const token=this.speechEpoch;
    try{await this.deps.pause();if(token===this.speechEpoch){this.speaking=false;this.speechPaused=true;this.change();}}
    catch{if(token===this.speechEpoch){this.speechError="Este dispositivo no permite pausar la lectura.";this.change();}}}
  async resumeSpeech(){if(!this.speechPaused||this.speechMessageIndex===null||!this.deps.resume)return;const token=this.speechEpoch;
    try{await this.deps.resume();if(token===this.speechEpoch){this.speaking=true;this.speechPaused=false;this.change();}}
    catch{if(token===this.speechEpoch){this.speechError="Este dispositivo no permite reanudar la lectura.";this.change();}}}
  private finish(){this.completed=true;this.change();if(this.completionTimer)clearTimeout(this.completionTimer);this.completionTimer=setTimeout(()=>{this.completed=false;this.completionTimer=null;this.change();},900);}
  interrupt(){this.epoch++;if(this.completionTimer)clearTimeout(this.completionTimer);this.completionTimer=null;this.completed=false;this.controller?.abort();this.controller=null;this.busy=false;this.stopSpeech();this.change();}
  clear(){if(this.submitting)return;const hadProposal=!!this.proposal;this.interrupt();this.messages=[];this.proposal=null;this.notice="";
    if(hadProposal)void this.deps.cancelProposal?.().catch(()=>{this.notice="No se pudo confirmar la retirada de la propuesta. Ninguna reserva se cancela al borrar el chat.";this.change();});
    void this.persist();this.change();}
  async cancelProposal(){if(this.submitting)return;await this.deps.cancelProposal?.();this.proposal=null;this.change();}
  async confirmProposal(){
    if(this.submitting||!this.consent||!this.proposal||!this.deps.confirm)throw Error("Revisa y autoriza la propuesta antes de confirmar.");
    const proposal=this.proposal,epoch=this.epoch;this.submitting=true;this.notice="Enviando la reserva a GO…";this.change();
    try{const result=await this.deps.confirm(proposal.id);
      if(!result.bookingId||!["PENDING","CONFIRMED"].includes(result.status))throw Error("GO no confirmó el resultado de la reserva.");
      if(epoch!==this.epoch)return;
      this.proposal=null;this.notice=result.status==="PENDING"?"Reserva solicitada y guardada en GO. Pendiente de aceptación.":"Reserva confirmada y guardada en GO.";
      this.messages=[...this.messages,{role:"assistant" as const,text:this.notice}].slice(-20);void this.persist();
    }catch(error){if(epoch===this.epoch){this.notice=error instanceof Error?error.message:"No se pudo comprobar el resultado. Reintenta la misma propuesta sin duplicarla.";
      const status=(error as {status?:number})?.status;
      if(status&&[400,403,409,422].includes(status))this.proposal=null;
      else this.proposal={...proposal,state:"submitting"};
    }throw error;}
    finally{this.submitting=false;this.change();}
  }
  async respond(text:string){
    if(this.submitting)throw Error("Espera el resultado de la reserva antes de cambiar la propuesta.");
    if(!this.ready||!this.consent)throw Error("Autoriza el envío de los mensajes a OpenAI para conversar.");
    if(!text.trim()||text.length>4000)throw Error("Escribe un mensaje de hasta 4.000 caracteres.");
    this.interrupt();const epoch=this.epoch,controller=new AbortController();this.controller=controller;this.busy=true;this.proposal=null;this.notice="";this.change();
    const input:CentralMessage[]=[...this.messages,{role:"user",text:text.trim()}];
    while(input.length>19||input.reduce((n,m)=>n+m.text.length,0)>8000)input.shift();
    try{const result=await this.deps.respond(input,controller.signal);if(epoch!==this.epoch)throw Error("Consulta interrumpida.");
      const answer=centralMessageSchema.parse({role:"assistant",text:result.answer});
      this.proposal=result.proposal?centralProposalSchema.parse(result.proposal):null;
      const cost=result.metrics;
      if(cost&&[cost.actualMicroUsd,cost.estimatedMaximumMicroUsd,cost.chargedMicroUsd,cost.remainingMicroUsd].every(n=>Number.isSafeInteger(n)&&Number(n)>=0))
        this.budget={actualMicroUsd:cost.actualMicroUsd!,estimatedMaximumMicroUsd:cost.estimatedMaximumMicroUsd!,chargedMicroUsd:cost.chargedMicroUsd!,remainingMicroUsd:cost.remainingMicroUsd!};
      const inputTokens=result.metrics?.inputTokens,outputTokens=result.metrics?.outputTokens,latencyMs=result.metrics?.latencyMs;
      if(typeof inputTokens==="number"&&Number.isSafeInteger(inputTokens)&&inputTokens>=0
        &&typeof outputTokens==="number"&&Number.isSafeInteger(outputTokens)&&outputTokens>=0){
        this.usage={inputTokens:this.usage.inputTokens+inputTokens,outputTokens:this.usage.outputTokens+outputTokens,
          lastLatencyMs:typeof latencyMs==="number"&&Number.isSafeInteger(latencyMs)&&latencyMs>=0?latencyMs:0,
          measuredCalls:this.usage.measuredCalls+1};
      }
      this.messages=[...input,answer];void this.persist();
      if(this.voice)this.startSpeech(answer.text,this.messages.length-1,epoch);
      else this.finish();
      return {answer:answer.text};
    }finally{if(epoch===this.epoch){this.busy=false;this.controller=null;this.change();}}
  }
}
