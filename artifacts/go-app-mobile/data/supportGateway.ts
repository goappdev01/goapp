import * as FileSystem from "expo-file-system/legacy";
import { supabaseApiRequest } from "./booking";
import { captureAuthIdentity, ensureAuthSession, getAuthApiBase, isAuthIdentityCurrent } from "@/lib/authSession";
import type { SupportAttachment } from "@/lib/supportAttachments";
import type { SupportAction, SupportCommand, SupportEvent, SupportGateway, SupportKind, SupportListFilter, SupportMessage, SupportPage, SupportReceipt, SupportStatus } from "@/lib/supportRequests";

type RawFile = { id:string;clientId:string;fileName:string;status:string };
type RawRow = {id:string;reference:string;request_key?:string;kind:SupportKind;body:string;status:SupportStatus;has_response?:boolean;
  sender_id:string;sender_name?:string|null;business_id:string|null;business_name?:string|null;created_at:string;revision:number;archived_at:string|null;
  messages?:{id:string;author_id:string;body:string;internal:boolean;created_at:string}[];
  history?:{id:number;actor_id:string;action:string;from_status?:SupportStatus|null;to_status?:SupportStatus|null;reason?:string|null;created_at:string}[];
  files?:{id:string;client_id:string;file_name:string;mime_type:string;byte_size:number}[]};
const endpoint="/supabase/support";
function mapped(row:RawRow):SupportReceipt {
  return {id:row.id,reference:row.reference,requestKey:row.request_key??"",kind:row.kind,status:row.status,
    summary:row.body.slice(0,100),detail:row.body,createdAt:row.created_at,revision:row.revision,hasResponse:row.has_response,
    senderId:row.sender_id,senderName:row.sender_name,businessId:row.business_id,businessName:row.business_name,archivedAt:row.archived_at,
    messages:row.messages?.map((m):SupportMessage=>({id:m.id,authorId:m.author_id,body:m.body,internal:m.internal,createdAt:m.created_at})),
    attachments:row.files?.map(f=>({id:f.id,clientId:f.client_id,name:f.file_name,mime:f.mime_type,size:f.byte_size})),
    history:row.history?.map((e):SupportEvent=>({id:e.id,actorId:e.actor_id,action:e.action,fromStatus:e.from_status,toStatus:e.to_status,reason:e.reason,createdAt:e.created_at}))};
}
async function identity() {
  const current=await captureAuthIdentity();
  if (!current) throw Error("Inicia sesión para utilizar AYUDA.");
  return current;
}
async function checked<T>(path:string,init:RequestInit={},expected?:string):Promise<T> {
  const owner=expected??(await identity()).userId;
  const result=await supabaseApiRequest<T>(endpoint+path,init,true,owner);
  return result;
}
async function uploadFile(id:string,file:SupportAttachment,expectedUserId:string) {
  const reserved=await checked<RawFile>(`/requests/${id}/files`,{method:"POST",body:JSON.stringify({clientId:file.id,name:file.name,mime:file.mime,size:file.size})},expectedUserId);
  if(reserved.clientId!==file.id||!reserved.id)throw Error("No se confirmó la reserva del archivo.");
  if(reserved.status!=="ready"){
    const send=async(token:string)=>FileSystem.uploadAsync(`${getAuthApiBase()}${endpoint}/files/${reserved.id}/content`,file.uri,{
      httpMethod:"POST",uploadType:FileSystem.FileSystemUploadType.BINARY_CONTENT,mimeType:file.mime,
      headers:{Authorization:`Bearer ${token}`,"Content-Type":file.mime},
    });
    let session=await ensureAuthSession();if(!session||session.user.id!==expectedUserId)throw Error("La sesión ha cambiado.");
    let result=await send(session.access_token);
    if(result.status===401){session=await ensureAuthSession({force:true,rejectedAccessToken:session.access_token});
      if(!session||session.user.id!==expectedUserId)throw Error("La sesión ha cambiado.");result=await send(session.access_token);}
    if(result.status<200||result.status>=300)throw Error("No se pudo guardar un adjunto. Reintenta el envío.");
  }
  const confirmed=await checked<{id:string;status:string}>(`/files/${reserved.id}/confirm`,{method:"POST"},expectedUserId);
  if(confirmed.id!==reserved.id||confirmed.status!=="ready")throw Error("El adjunto no quedó confirmado.");
  return {id:reserved.id,clientId:file.id,name:file.name};
}
export const supportGateway:SupportGateway={
  supportsAttachments:true,
  async create(command:SupportCommand,files:readonly SupportAttachment[]=[]):Promise<SupportReceipt>{
    const owner=await identity();
    const raw=await checked<RawRow>("/requests",{method:"POST",body:JSON.stringify({kind:command.kind,body:command.message,
      requestKey:command.requestKey,businessId:command.businessId??null})},owner.userId);
    if(!raw?.id||raw.request_key!==command.requestKey||raw.sender_id!==owner.userId)throw Error("No se confirmó la solicitud.");
    const attachments=[];
    for(const file of files)attachments.push(await uploadFile(raw.id,file,owner.userId));
    if(!await isAuthIdentityCurrent(owner))throw Error("La sesión ha cambiado.");
    return {...mapped(raw),attachments};
  },
  async listOwn(){return (await this.listOwnPage!(0,30)).items;},
  async listOwnPage(offset:number,limit:number):Promise<SupportPage>{const owner=await identity();
    const params=new URLSearchParams({offset:String(offset),limit:String(limit)});
    const data=await checked<{items:RawRow[];total:number}>(`/requests?${params}`,{},owner.userId);
    if(!await isAuthIdentityCurrent(owner))throw Error("La sesión ha cambiado.");return {items:data.items.map(mapped),total:data.total};},
  async listAdmin(filter:SupportListFilter={}):Promise<SupportPage>{const owner=await identity();
    const params=new URLSearchParams({admin:"true",archived:String(filter.archived??false),offset:String(filter.offset??0),limit:String(filter.limit??30)});
    if(filter.status)params.set("status",filter.status);if(filter.kind)params.set("kind",filter.kind);
    if(filter.from)params.set("from",filter.from);if(filter.to)params.set("to",filter.to);if(filter.sender)params.set("sender",filter.sender);
    const data=await checked<{items:RawRow[];total:number}>(`/requests?${params}`,{},owner.userId);
    if(!await isAuthIdentityCurrent(owner))throw Error("La sesión ha cambiado.");return{items:data.items.map(mapped),total:data.total};},
  async detail(id:string){const owner=await identity();const data=await checked<RawRow>(`/requests/${id}`,{},owner.userId);
    if(!await isAuthIdentityCurrent(owner))throw Error("La sesión ha cambiado.");return mapped(data);},
  async act(id:string,command:SupportAction){const owner=await identity();const data=await checked<RawRow>(`/requests/${id}/actions`,{
    method:"POST",body:JSON.stringify(command)},owner.userId);
    if(!await isAuthIdentityCurrent(owner))throw Error("La sesión ha cambiado.");return mapped(data);},
  fileUrl: supportPrivateFileLink,
  async purgeExpired(){const owner=await identity();return checked<{purged:number;pending:number}>("/retention/purge",{method:"POST"},owner.userId);},
};
export async function supportPrivateFileLink(id:string):Promise<string>{const owner=await identity();
  const result=await checked<{url:string}>(`/files/${id}/link`,{},owner.userId);
  if(!await isAuthIdentityCurrent(owner)||!result.url.startsWith("https://"))throw Error("No se pudo abrir el archivo privado.");
  return result.url;}
