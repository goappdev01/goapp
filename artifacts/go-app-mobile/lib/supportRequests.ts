export type SupportKind = "incident" | "improvement" | "help";
export const SUPPORT_ORBIT_ACTIONS = [
  {kind:"incident",label:"INCIDENCIA",title:"Comunicar incidencia",icon:"alert-circle",slot:0},
  {kind:"improvement",label:"MEJORA",title:"Proponer mejora",icon:"edit-3",slot:2},
  {kind:"help",label:"AYUDA",title:"Necesito ayuda",icon:"help-circle",slot:4},
  {kind:"mine",label:"SOLICITUDES",title:"Mis solicitudes",icon:"inbox",slot:6},
] as const;
export type SupportCommand = { kind:SupportKind; message:string; context?:"Landing"; requestKey:string };
export type SupportReceipt = { id:string; reference:string; requestKey:string; status:"received"|"in_progress"|"answered"|"closed"; response?:string };
/** Server must derive the sender and scope listOwn; no arbitrary sender/recipient IDs. */
export type SupportGateway = { create(command:SupportCommand):Promise<SupportReceipt>; listOwn():Promise<SupportReceipt[]> };
export async function sendSupportRequest(gateway:SupportGateway, command:SupportCommand):Promise<SupportReceipt> {
  const message=command.message.trim();
  if(!["incident","improvement","help"].includes(command.kind)||!message||message.length>4000||!command.requestKey||command.context!==undefined&&command.context!=="Landing")throw Error("Solicitud inválida");
  const receipt=await gateway.create({...command,message});
  if(!receipt?.id||!receipt.reference||receipt.requestKey!==command.requestKey||!["received","in_progress","answered","closed"].includes(receipt.status))throw Error("Recepción no confirmada");
  return receipt;
}
export function supportOrbitRect(width:number,height:number,insets:{left:number;right:number;bottom:number},hand:"left"|"right") {
  const size=width<440?48:60,edge=12;
  return {x:hand==="right"?insets.left+edge:width-insets.right-edge-size,y:height-insets.bottom-8-size,width:size,height:size};
}
