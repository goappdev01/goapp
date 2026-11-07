export type SupportKind = "incident" | "improvement" | "help";
/** The mobile circuit stays read-only until the real schema, API and identity path are verified. */
export const GO_SUPPORT_LIVE_ENABLED = false;
export const newSupportRequestKey=()=>globalThis.crypto?.randomUUID?.()??"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
  const value=Math.floor(Math.random()*16);return (c==="x"?value:(value&3)|8).toString(16);
});
import type { SupportAttachment } from "./supportAttachments";
export const SUPPORT_ORBIT_ACTIONS = [
  {kind:"incident",label:"INCIDENCIA",title:"Comunicar incidencia",icon:"alert-circle",slot:4},
  {kind:"improvement",label:"MEJORA",title:"Proponer mejora",icon:"edit-3",slot:2},
  {kind:"help",label:"AYUDA",title:"Necesito ayuda",icon:"help-circle",slot:5},
  {kind:"mine",label:"SOLICITUDES",title:"Mis solicitudes",icon:"inbox",slot:1},
] as const;
/** ADMIN uses the same eight orbital coordinates, with no extra satellite. */
export const SUPPORT_ADMIN_ORBITS = [
  {view:"received",label:"SOLICITUDES",title:"Solicitudes recibidas",icon:"inbox"},
  {view:"incident",label:"INCIDENCIAS",title:"Incidencias",icon:"alert-circle"},
  {view:"improvement",label:"MEJORAS",title:"Propuestas de mejora",icon:"edit-3"},
  {view:"help",label:"CONSULTAS",title:"Consultas de ayuda",icon:"help-circle"},
  {view:"all",label:"LISTADOS",title:"Listados de AYUDA",icon:"list"},
  {view:"pending",label:"PENDIENTES",title:"En revisión y pendientes",icon:"clock"},
  {view:"archive",label:"ARCHIVO",title:"Historial y archivo",icon:"archive"},
  {view:"team",label:"EQUIPO",title:"Equipo de SOPORTE",icon:"users"},
] as const;
/** Reflect functions only; the original eight coordinates/colours never move. */
export const supportOrbitSlot=(slot:number,hand:"left"|"right")=>hand==="left"?(8-slot)%8:slot;
export type SupportStatus = "received"|"in_review"|"pending"|"solved"|"rejected";
export type SupportCommand = { kind:SupportKind; message:string; context?:"Landing"; requestKey:string; businessId?:string|null };
export type SupportMessage = {id:string;authorId:string;body:string;internal:boolean;createdAt:string};
export type SupportEvent = {id:number;actorId:string;action:string;fromStatus?:SupportStatus|null;toStatus?:SupportStatus|null;reason?:string|null;createdAt:string};
export type SupportReceipt = { id:string; reference:string; requestKey:string; status:SupportStatus; response?:string;
  kind?:SupportKind;summary?:string;createdAt?:string;detail?:string;revision?:number;archivedAt?:string|null;hasResponse?:boolean;
  senderId?:string;senderName?:string|null;businessId?:string|null;businessName?:string|null;messages?:SupportMessage[];
  attachments?:{id:string;name:string;clientId:string;mime?:string;size?:number}[];history?:SupportEvent[] };
export type SupportListFilter={status?:SupportStatus;kind?:SupportKind;archived?:boolean;offset?:number;limit?:number;from?:string;to?:string;sender?:string};
export type SupportPage={items:SupportReceipt[];total:number};
export type SupportAction={key:string;action:"reply"|"internal_note"|"status"|"archive"|"reopen";body?:string;status?:SupportStatus;revision:number};
/** Server must derive the sender and scope listOwn; no arbitrary sender/recipient IDs. */
export type SupportGateway = { supportsAttachments?:boolean;create(command:SupportCommand, files?:readonly SupportAttachment[]):Promise<SupportReceipt>;
  listOwn():Promise<SupportReceipt[]>;listOwnPage?(offset:number,limit:number):Promise<SupportPage>;listAdmin?(filter?:SupportListFilter):Promise<SupportPage>;
  detail?(id:string):Promise<SupportReceipt>;act?(id:string,command:SupportAction):Promise<SupportReceipt>;
  fileUrl?(id:string):Promise<string>;purgeExpired?():Promise<{purged:number;pending:number}> };
export async function sendSupportRequest(gateway:SupportGateway, command:SupportCommand, files:readonly SupportAttachment[]=[]):Promise<SupportReceipt> {
  const message=command.message.trim();
  if(!["incident","improvement","help"].includes(command.kind)||!message||message.length>4000||!command.requestKey||command.context!==undefined&&command.context!=="Landing")throw Error("Solicitud inválida");
  if(files.length&&!gateway.supportsAttachments)throw Error("El servicio no admite adjuntos todavía.");
  const receipt=await gateway.create({...command,message},files);
  if(!receipt?.id||!receipt.reference||receipt.requestKey!==command.requestKey||!["received","in_review","pending","solved","rejected"].includes(receipt.status))throw Error("Recepción no confirmada");
  if(files.length&&(receipt.attachments?.length!==files.length||new Set(receipt.attachments.map(a=>a.clientId)).size!==files.length
    ||files.some(f=>!receipt.attachments?.some(a=>a.clientId===f.id&&!!a.id))))throw Error("Adjuntos sin confirmar.");
  return receipt;
}
export function supportOrbitRect(width:number,height:number,insets:{left:number;right:number;bottom:number;top?:number},hand:"left"|"right",minimumSize=44,obstacles:readonly {x:number;y:number;width:number;height:number;circular?:boolean}[]=[]) {
  const size=Math.max(minimumSize,width<440?48:60),edge=12;
  const rect={x:hand==="right"?width-insets.right-edge-size:insets.left+edge,y:height-insets.bottom-8-size,width:size,height:size};
  // Move only AYUDA upward along its own edge, keeping every existing satellite fixed.
  const minY=Math.max(8,(insets.top??0)+8);
  while(rect.y>minY&&obstacles.some(o=>o.circular
    ? Math.hypot(rect.x+size/2-o.x-o.width/2,rect.y+size/2-o.y-o.height/2)<(size+o.width)/2+2
    : rect.x<o.x+o.width+8&&rect.x+size+8>o.x&&rect.y<o.y+o.height+8&&rect.y+size+8>o.y))rect.y=Math.max(minY,rect.y-4);
  return rect;
}
