import { getAuthenticatedUserId, supabaseApiRequest } from "./booking";
import type { GoConversation } from "@/components/MessagesScreen";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type BookingConversation = GoConversation & { bookingId: string; businessId: string; counterpartId: string };
export async function readBookingConversations(owner: string, bookingId?: string): Promise<BookingConversation[]> {
  const rows=await supabaseApiRequest<BookingConversation[]>("/supabase/booking-conversations"+(bookingId?"?booking_id="+encodeURIComponent(bookingId):""),{},true,owner);
  if(await getAuthenticatedUserId()!==owner) throw new Error("La cuenta ha cambiado.");
  return rows.map(row=>({...row,isGoUser:true,contactPhone:row.contactPhone||"",contactName:row.contactName||"GO",unread:0}));
}
export async function sendBookingMessage(owner:string,bookingId:string,messageId:string,text:string):Promise<BookingConversation>{
  const row=await supabaseApiRequest<BookingConversation>("/supabase/bookings/"+encodeURIComponent(bookingId)+"/messages",{method:"POST",body:JSON.stringify({messageId,text})},true,owner);
  if(await getAuthenticatedUserId()!==owner)throw new Error("La cuenta ha cambiado.");
  return {...row,isGoUser:true,contactPhone:row.contactPhone||"",contactName:row.contactName||"GO",unread:0};
}

/** A persisted retry key prevents duplication even after Reload or a lost response.
 * This random identifier is not an authentication credential. JWT stays authoritative. */
export async function deliverBookingMessage(owner:string,bookingId:string,text:string):Promise<BookingConversation>{
  const key=`go_message_outbox_v1:${owner}:${bookingId}`;
  let previous:{messageId:string;text:string}|null=null;
  try{previous=JSON.parse(await AsyncStorage.getItem(key)||"null");}catch{/* A corrupt draft cannot authorize a message. */}
  const pending=previous?.text===text&&typeof previous.messageId==="string"?previous:{text,messageId:"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==="x"?r:(r&3)|8).toString(16);})};
  await AsyncStorage.setItem(key,JSON.stringify(pending));
  const saved=await sendBookingMessage(owner,bookingId,pending.messageId,text);
  if(await AsyncStorage.getItem(key)===JSON.stringify(pending))await AsyncStorage.removeItem(key);
  return saved;
}
