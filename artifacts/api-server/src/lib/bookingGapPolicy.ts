import type {Request,Response} from "express";
import {bearerHeader,supabaseRequest} from "./supabase";
/** Refuse writes unless the database enforces both canonical admission policies. */
export async function requireBookingGapPolicy(req:Request,res:Response):Promise<boolean>{
 const checks=[
  {rpc:"go_booking_gap_policy_version",code:"BOOKING_GAP_POLICY_UNAVAILABLE",error:"El servidor debe activar la validación de huecos antes de confirmar nuevos horarios. No se ha cambiado ninguna reserva."},
  {rpc:"go_booking_phase_policy_version",code:"BOOKING_PHASE_POLICY_UNAVAILABLE",error:"El servidor debe activar los tiempos del servicio antes de confirmar nuevos horarios. No se ha cambiado ninguna reserva."},
 ];
 for(const check of checks){
  try{
   const upstream=await supabaseRequest("/rest/v1/rpc/"+check.rpc,{method:"POST",headers:{...bearerHeader(req.header("authorization")),"Content-Type":"application/json"},body:"{}"});
   if(upstream.ok&&await upstream.json()===1)continue;
  }catch{/* An unconfirmed capability can never authorize a booking write. */}
  res.status(503).json({code:check.code,error:check.error});return false;
 }
 return true;
}
