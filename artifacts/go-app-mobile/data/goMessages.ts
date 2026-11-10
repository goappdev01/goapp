import { getAuthenticatedUserId, supabaseApiRequest } from "./booking";
import type { GoConversation } from "@/components/MessagesScreen";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type BookingConversation = GoConversation & { bookingId: string; businessId: string; counterpartId: string;inboxScope?:string };
function receipt(row:BookingConversation,bookingId:string|undefined,owner:string):BookingConversation{
  if(!row||typeof row.bookingId!=="string"||row.id!=="booking:"+row.bookingId||bookingId&&row.bookingId!==bookingId
    ||typeof row.businessId!=="string"||typeof row.counterpartId!=="string"||!row.counterpartId
    ||!Array.isArray(row.messages)||row.messages.some(m=>!m||typeof m.id!=="string"||typeof m.senderId!=="string"||typeof m.text!=="string"||!Number.isFinite(m.createdAt)))
    throw Error("No se confirmó la conversación del servidor.");
  const sender=(id:string)=>id==="yo"?owner:id;
  const messages=[...row.messages].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)||sender(a.senderId).localeCompare(sender(b.senderId)));
  return {...row,messages,isGoUser:true,contactPhone:row.contactPhone||"",contactName:row.contactName||"GO",unread:0};
}
export async function readBookingConversations(owner: string, bookingId?: string,businessId?:string|null): Promise<BookingConversation[]> {
  const params:string[]=[];
  if(bookingId)params.push("booking_id="+encodeURIComponent(bookingId));
  if(businessId!==undefined){params.push("scope="+(businessId?"business":"personal"));if(businessId)params.push("business_id="+encodeURIComponent(businessId));}
  const rows=await supabaseApiRequest<BookingConversation[]>("/supabase/booking-conversations"+(params.length?"?"+params.join("&"):""),{},true,owner);
  if(await getAuthenticatedUserId()!==owner) throw new Error("La cuenta ha cambiado.");
  if(!Array.isArray(rows))throw Error("No se confirmó la bandeja del servidor.");
  if(businessId!==undefined&&rows.some(row=>row.inboxScope!==(businessId?"business:"+businessId:"personal")||businessId&&row.businessId!==businessId))
    throw Error("El servidor aún no confirma el contexto de esta bandeja. Actualiza la conexión antes de consultar mensajes.");
  return rows.map(row=>receipt(row,bookingId,owner));
}
export async function sendBookingMessage(owner:string,bookingId:string,messageId:string,text:string):Promise<BookingConversation>{
  const row=await supabaseApiRequest<BookingConversation>("/supabase/bookings/"+encodeURIComponent(bookingId)+"/messages",{method:"POST",body:JSON.stringify({messageId,text})},true,owner);
  if(await getAuthenticatedUserId()!==owner)throw new Error("La cuenta ha cambiado.");
  const saved=receipt(row,bookingId,owner);
  if(saved.messages.filter(m=>m.id===messageId&&m.senderId==="yo"&&m.text===text.trim()).length!==1)
    throw Error("No se confirmó la persistencia del mensaje. Tu texto se conserva.");
  return saved;
}

/** A persisted retry key prevents duplication even after Reload or a lost response.
 * This random identifier is not an authentication credential. JWT stays authoritative. */
const deliveries=new Map<string,{text:string;promise:Promise<BookingConversation>}>();
const draftWrites=new Map<string,Promise<void>>();
const draftKey=(owner:string,id:string)=>"go_message_draft_v1:"+owner+":"+id;
function draftOperation(owner:string,id:string,operation:(key:string)=>Promise<void>){
  const key=draftKey(owner,id),next=(draftWrites.get(key)??Promise.resolve()).catch(()=>{}).then(()=>operation(key));
  draftWrites.set(key,next);void next.finally(()=>{if(draftWrites.get(key)===next)draftWrites.delete(key);}).catch(()=>{});
  return next;
}
export async function loadBookingMessageDraft(owner:string,id:string){const key=draftKey(owner,id);await draftWrites.get(key)?.catch(()=>{});return await AsyncStorage.getItem(key)||"";}
export const saveBookingMessageDraft=(owner:string,id:string,text:string)=>draftOperation(owner,id,key=>AsyncStorage.setItem(key,text));
export const clearBookingMessageDraft=(owner:string,id:string,expectedText:string)=>draftOperation(owner,id,async key=>{if(await AsyncStorage.getItem(key)===expectedText)await AsyncStorage.removeItem(key);});
export function deliverBookingMessage(owner:string,bookingId:string,text:string,kind:"text"|"location"="text"):Promise<BookingConversation>{
  const key=owner+":"+bookingId,active=deliveries.get(key);
  if(active)return active.text===text?active.promise:Promise.reject(Error("Espera a que termine el envío anterior."));
  const promise=deliver(owner,bookingId,text,kind);deliveries.set(key,{text,promise});
  void promise.finally(()=>{if(deliveries.get(key)?.promise===promise)deliveries.delete(key);}).catch(()=>{});
  return promise;
}
async function deliver(owner:string,bookingId:string,text:string,kind:"text"|"location"):Promise<BookingConversation>{
  const key=`go_message_outbox_v1:${owner}:${bookingId}`+(kind==="location"?":location":"");
  let previous:{messageId:string;text:string}|null=null;
  try{previous=JSON.parse(await AsyncStorage.getItem(key)||"null");}catch{/* A corrupt draft cannot authorize a message. */}
  const pending=previous?.text===text&&typeof previous.messageId==="string"?previous:{text,messageId:"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==="x"?r:(r&3)|8).toString(16);})};
  await AsyncStorage.setItem(key,JSON.stringify(pending));
  const saved=await sendBookingMessage(owner,bookingId,pending.messageId,text);
  if(await AsyncStorage.getItem(key)===JSON.stringify(pending))await AsyncStorage.removeItem(key);
  return saved;
}
