import {supabaseApiRequest,getAuthenticatedUserId} from "./booking";
export type VerificationSummary={customerName?:string;authorizedPersonName?:string;businessName:string;serviceName:string;startsAt:string;endsAt:string;timezone:string;bookingStatus:string;arrivalVerified:boolean;arrivalAt?:string;civilIdentityVerified:false;servicePerformed:boolean};
export type VerificationResult={qrPayload?:string;manualCode?:string;expiresAt?:string;invitation?:string;challenge?:string;canConfirmArrival?:boolean;valid?:boolean;arrivalVerified?:boolean;arrivalAlreadyVerified?:boolean;summary?:VerificationSummary;bookingId?:string;revoked?:boolean;items?:{bookingId:string;summary:VerificationSummary}[]}&Partial<VerificationSummary>;
export type VerificationCommand={operation:"issue"|"preview"|"arrive"|"invite"|"claim"|"revoke"|"wallet";bookingId?:string;businessId?:string;secret?:string;challenge?:string};
/** No credential cache: every request is tied to the currently signed-in user. */
export async function bookingVerification(command:VerificationCommand,expectedUserId:string):Promise<VerificationResult>{
 if(!expectedUserId || await getAuthenticatedUserId()!==expectedUserId)throw Error("La cuenta ha cambiado. Vuelve a abrir la reserva.");
 return supabaseApiRequest<VerificationResult>("/supabase/booking-verification",{method:"POST",body:JSON.stringify(command)},true,expectedUserId);
}
