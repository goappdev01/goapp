import type {Request,Response} from "express";
import {bearerHeader,supabaseRequest} from "./supabase";
/** Refuse writes through an old database rather than confirm under a different predicate. */
export async function requireBookingGapPolicy(req:Request,res:Response):Promise<boolean>{
 try{
  const upstream=await supabaseRequest("/rest/v1/rpc/go_booking_gap_policy_version",{method:"POST",headers:{...bearerHeader(req.header("authorization")),"Content-Type":"application/json"},body:"{}"});
  if(upstream.ok&&await upstream.json()===1)return true;
 }catch{/* Availability remains unconfirmed; do not attempt the booking write. */}
 res.status(503).json({code:"BOOKING_GAP_POLICY_UNAVAILABLE",error:"El servidor debe activar la validación de huecos antes de confirmar nuevos horarios. No se ha cambiado ninguna reserva."});return false;
}
