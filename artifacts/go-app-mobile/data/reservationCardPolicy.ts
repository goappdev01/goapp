import type {GoEntry} from "@/components/AgendaOperativa";
/** Render policy only. JWT/RLS and the server recheck every actual operation. */
export function reservationCardPolicy(entry:GoEntry){
 const canonical=!!(entry.customerBooking || entry.businessBooking);
 // Current receipts may carry only server status; old cache projections carry the
 // translated status. Never gate equivalent actions by the age of the record.
 const server=entry.bookingServerStatus;
 const terminal=server && ["CANCELLED","REJECTED","EXPIRED","COMPLETED","NO_SHOW"].includes(server);
 const status=terminal ? server : entry.bookingStatus ?? (server && ["CONFIRMED","ACCEPTED"].includes(server) ? "confirmada"
  : server === "PENDING" ? "pendiente" : entry.estado === "aceptado" ? "confirmada" : entry.estado === "rechazado" ? "cancelada" : "pendiente");
 const active=canonical && !entry.deleted && ["pendiente","confirmada","cambio_pendiente"].includes(status);
 const received=active && !!entry.changeProposal && entry.estado==="propuesto";
 const real=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(entry.reservationId??""));
 return {canonical,active,received,canCancel:active,canPropose:active,
  canConfirm:real && active && !!entry.businessBooking && status==="pendiente" && !entry.changeProposal,
  canShowQr:real && !!entry.customerBooking && status==="confirmada" && !entry.deleted,
  canVerify:real && !!entry.businessBooking,
  stateKey:server==="NO_SHOW"?"booking_state_no_show":server==="EXPIRED"?"booking_state_expired":server==="REJECTED"?"booking_state_rejected":status==="confirmada"?"booking_state_accepted":["cancelada","CANCELLED"].includes(status??"")?"booking_state_cancelled":["completada","COMPLETED"].includes(status??"")?"booking_state_completed":"booking_state_pending",
  stateColor:status==="confirmada"?"#22c55e":["cancelada","CANCELLED","REJECTED"].includes(status??"")?"#f87171":["completada","COMPLETED"].includes(status??"")?"#93c5fd":"#FF8C00"};
}
