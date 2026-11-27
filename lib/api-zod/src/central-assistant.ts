import {z} from "zod";

export const centralMessageSchema=z.object({role:z.enum(["user","assistant"]),text:z.string().trim().min(1).max(4000)}).strict();
export const centralConversationSchema=z.object({consent:z.literal(true),requestId:z.string().uuid().optional(),messages:z.array(centralMessageSchema).min(1).max(20)})
  .strict().refine(body=>body.messages.at(-1)?.role==="user"&&body.messages.reduce((n,m)=>n+m.text.length,0)<=12000,"Contexto demasiado extenso");
/** A separate, explicit choice is required before storing conversation text across devices. */
export const centralHistoryWriteSchema=z.object({consent:z.literal(true),revision:z.number().int().min(0),
  messages:z.array(centralMessageSchema).max(20)}).strict()
  .refine(body=>body.messages.reduce((n,m)=>n+m.text.length,0)<=12000,"Historial demasiado extenso");
export type CentralMessage=z.infer<typeof centralMessageSchema>;
export const centralProposalSchema=z.object({id:z.string().uuid(),state:z.enum(["prepared","submitting"]).default("prepared"),summary:z.object({
  business:z.string().min(1).max(240),services:z.array(z.string().min(1).max(240)).min(1).max(32),
  startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),
  total:z.number().finite().nonnegative(),currency:z.string().length(3),timezone:z.string().min(1).max(100),
}).strict()}).strict();
export type CentralProposal=z.infer<typeof centralProposalSchema>;
/** Model-visible operations cannot execute a booking. Execution stays in GO's explicit confirmation route. */
export type CentralToolRegistration={module:string;name:string;requiresConfirmation:boolean;enabled:boolean};
export const CENTRAL_AI_TOOLS:readonly CentralToolRegistration[]=Object.freeze([
  {module:"bookings",name:"read_catalog",requiresConfirmation:false,enabled:true},
  {module:"bookings",name:"read_availability",requiresConfirmation:false,enabled:true},
  {module:"bookings",name:"prepare_booking",requiresConfirmation:true,enabled:true},
]);
