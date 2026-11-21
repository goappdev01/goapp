import {z} from "zod";

export const centralMessageSchema=z.object({role:z.enum(["user","assistant"]),text:z.string().trim().min(1).max(4000)}).strict();
export const centralConversationSchema=z.object({consent:z.literal(true),messages:z.array(centralMessageSchema).min(1).max(20)})
  .strict().refine(body=>body.messages.at(-1)?.role==="user"&&body.messages.reduce((n,m)=>n+m.text.length,0)<=12000,"Contexto demasiado extenso");
export type CentralMessage=z.infer<typeof centralMessageSchema>;
/** Reserved registry. No executable handlers or model tools are authorized in V1. */
export type CentralToolRegistration={module:string;name:string;requiresConfirmation:true;enabled:false};
export const CENTRAL_AI_TOOLS:readonly CentralToolRegistration[]=Object.freeze([]);
