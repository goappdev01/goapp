export type SupportKind = "incident" | "improvement" | "help";
import type { SupportAttachment } from "./supportAttachments";
export const SUPPORT_ORBIT_ACTIONS = [
  {kind:"incident",label:"INCIDENCIA",title:"Comunicar incidencia",icon:"alert-circle",slot:4},
  {kind:"improvement",label:"MEJORA",title:"Proponer mejora",icon:"edit-3",slot:2},
  {kind:"help",label:"AYUDA",title:"Necesito ayuda",icon:"help-circle",slot:5},
  {kind:"mine",label:"SOLICITUDES",title:"Mis solicitudes",icon:"inbox",slot:1},
] as const;
/** Reflect functions only; the original eight coordinates/colours never move. */
export const supportOrbitSlot=(slot:number,hand:"left"|"right")=>hand==="left"?(8-slot)%8:slot;
export type SupportCommand = { kind:SupportKind; message:string; context?:"Landing"; requestKey:string };
export type SupportReceipt = { id:string; reference:string; requestKey:string; status:"received"|"in_progress"|"answered"|"closed"; response?:string;
  kind?:SupportKind;summary?:string;createdAt?:string;detail?:string;attachments?:{id:string;name:string;clientId:string}[] };
/** Server must derive the sender and scope listOwn; no arbitrary sender/recipient IDs. */
export type SupportGateway = { supportsAttachments?:boolean;create(command:SupportCommand, files?:readonly SupportAttachment[]):Promise<SupportReceipt>; listOwn():Promise<SupportReceipt[]> };
export async function sendSupportRequest(gateway:SupportGateway, command:SupportCommand, files:readonly SupportAttachment[]=[]):Promise<SupportReceipt> {
  const message=command.message.trim();
  if(!["incident","improvement","help"].includes(command.kind)||!message||message.length>4000||!command.requestKey||command.context!==undefined&&command.context!=="Landing")throw Error("Solicitud inválida");
  if(files.length&&!gateway.supportsAttachments)throw Error("El servicio no admite adjuntos todavía.");
  const receipt=await gateway.create({...command,message},files);
  if(!receipt?.id||!receipt.reference||receipt.requestKey!==command.requestKey||!["received","in_progress","answered","closed"].includes(receipt.status))throw Error("Recepción no confirmada");
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
