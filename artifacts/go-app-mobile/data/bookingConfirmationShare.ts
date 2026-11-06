import type { Booking, Business } from "./booking";

/** Trusted deployment configuration only. Leave unset until the official public page is verified. */
export function officialGoDiscoveryLink(value: unknown = process.env.EXPO_PUBLIC_GO_DISCOVERY_URL): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.port
      || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)
      || /(^|\.)(localhost|local|invalid|test|internal)$/i.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

export function bookingConfirmationMessage(booking: Omit<Booking,"customerId">, business: Business, professionalName: string, discovery: string | null): string {
  if (booking.status !== "CONFIRMED" || booking.businessId !== business.id || !booking.id) throw new Error("Comparte únicamente una reserva confirmada de este establecimiento.");
  const services = booking.catalogSnapshot?.lines.map(line => line.name).join(" + ")
    || booking.services?.map(service => service.title).join(" + ") || booking.receipt?.serviceName;
  if (!services || !booking.startDatetime || !booking.endDatetime) throw new Error("No se pudieron comprobar los datos de la confirmación.");
  const date = booking.startDatetime.slice(0, 10).split("-").reverse().join("/");
  const price = booking.catalogSnapshot?.totalPrice ?? booking.totalPrice;
  const lines = ["RESERVA CONFIRMADA", business.name, services, `${date} · ${booking.startDatetime.slice(11, 16)}–${booking.endDatetime.slice(11, 16)}`];
  if (professionalName) lines.push(`Profesional: ${professionalName}`);
  if (booking.timingSnapshot) lines.push(`Duración: ${booking.timingSnapshot.totalClientMinutes} min`);
  if (typeof price === "number" && Number.isFinite(price)) lines.push(`Precio: ${price.toFixed(2)} ${booking.catalogSnapshot?.currency ?? booking.currency ?? "EUR"}`);
  if (business.location) lines.push(business.location);
  lines.push(`Referencia: ${booking.id}`);
  const link = officialGoDiscoveryLink(discovery);
  if (link) lines.push("", "También puedes descubrir GO y gestionar tus próximas reservas desde la aplicación.", link);
  // No private reservation ID, phone, access token or claim credential in any public URL/QR.
  return lines.join("\n");
}

export type ConfirmationImageRenderer={toDataURL(callback:(png:string)=>void):void};
/** Uses the existing SVG/native share modules, no upload or WhatsApp delivery claim. */
export async function shareConfirmationImage(renderer:ConfirmationImageRenderer,message:string,dependencies:{
  cacheDirectory:string|null;makeDirectoryAsync(uri:string,options:{intermediates:boolean}):Promise<void>;
  writeAsStringAsync(uri:string,data:string,options:{encoding:"base64"}):Promise<void>;
  deleteAsync(uri:string,options:{idempotent:boolean}):Promise<void>;
  share(content:{message:string;url:string}):Promise<unknown>;stillCurrent():boolean|Promise<boolean>;
}){
 if(!dependencies.cacheDirectory||!await dependencies.stillCurrent())throw Error("No se pudo preparar la imagen.");
 const png=await new Promise<string>((resolve,reject)=>{try{renderer.toDataURL(value=>{
  if(typeof value!=="string"||!value.startsWith('iVBORw0KGgo')||!/^[a-zA-Z0-9+/=]+$/.test(value)||value.length>12*1024*1024)reject(Error("No se pudo preparar la imagen PNG."));else resolve(value);
 });}catch(error){reject(error);}});
 const directory=dependencies.cacheDirectory+`go-confirmations/${Date.now().toString(36)}${Math.random().toString(36).slice(2)}/`,url=directory+'reserva.png';
 try{await dependencies.makeDirectoryAsync(directory,{intermediates:true});await dependencies.writeAsStringAsync(url,png,{encoding:'base64'});
  if(!await dependencies.stillCurrent())throw Error("La sesión ha cambiado. Abre de nuevo la reserva.");
  await dependencies.share({message,url});
 }finally{await dependencies.deleteAsync(directory,{idempotent:true}).catch(()=>{});}
}

/** No country is guessed from a local number; the native share sheet remains available. */
export function whatsappConfirmationURL(phone: string, message: string): string | null {
  const international = phone.trim().replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(international)
    ? `https://wa.me/${international.slice(1)}?text=${encodeURIComponent(message)}` : null;
}
