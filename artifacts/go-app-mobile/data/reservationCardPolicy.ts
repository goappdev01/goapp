import type {GoEntry} from "@/components/AgendaOperativa";
/** Render policy only. JWT/RLS and the server recheck every actual operation. */
export function reservationCardPolicy(entry:GoEntry){
 const canonical=!!(entry.customerBooking || entry.businessBooking);
 const active=canonical && !entry.deleted && ["pendiente","confirmada","cambio_pendiente"].includes(entry.bookingStatus??"");
 const received=active && !!entry.changeProposal && entry.estado==="propuesto";
 const real=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(entry.reservationId??""));
 return {canonical,active,received,canCancel:active,canPropose:active,
  canConfirm:real && active && !!entry.businessBooking && entry.bookingStatus==="pendiente" && !entry.changeProposal,
  canShowQr:real && !!entry.customerBooking && entry.bookingStatus==="confirmada" && !entry.deleted,
  canVerify:real && !!entry.businessBooking,
  stateKey:entry.bookingServerStatus==="NO_SHOW"?"booking_state_no_show":entry.bookingServerStatus==="EXPIRED"?"booking_state_expired":entry.bookingServerStatus==="REJECTED"?"booking_state_rejected":entry.bookingStatus==="confirmada"?"booking_state_accepted":entry.bookingStatus==="cancelada"?"booking_state_cancelled":entry.bookingStatus==="completada"?"booking_state_completed":"booking_state_pending",
  stateColor:entry.bookingStatus==="confirmada"?"#22c55e":entry.bookingStatus==="cancelada"?"#f87171":entry.bookingStatus==="completada"?"#93c5fd":"#FF8C00"};
}
