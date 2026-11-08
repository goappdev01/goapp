import AsyncStorage from "@react-native-async-storage/async-storage";
import type {SupportAttachment} from "@/lib/supportAttachments";
import type {SupportKind} from "@/lib/supportRequests";
export type PendingSupportDraft={key:string;message:string;businessId:string|null;fileIds:string};
export type SupportDraftSnapshot={
 drafts:Record<SupportKind,string>;files:Record<SupportKind,SupportAttachment[]>;
 pending:Partial<Record<SupportKind,PendingSupportDraft>>;
};
const kinds=["incident","improvement","help"] as const;
const writes=new Map<string,Promise<void>>();
export const supportDraftScope=(user:string,business?:string|null)=>JSON.stringify([user,business??null]);
const storageKey=(scope:string)=>"go_support_draft_v1:"+scope;
function valid(value:unknown):SupportDraftSnapshot|null{
 if(!value||typeof value!=="object")return null;
 const row=value as SupportDraftSnapshot;
 if(!row.drafts||!row.files||!row.pending)return null;
 for(const kind of kinds){
  if(typeof row.drafts[kind]!=="string"||row.drafts[kind].length>4000||!Array.isArray(row.files[kind])||row.files[kind].length>5)return null;
  if(row.files[kind].some(f=>!f||typeof f.id!=="string"||!/^[a-z0-9]+$/i.test(f.id)||typeof f.uri!=="string"||!f.uri.startsWith("file://")||typeof f.name!=="string"||f.name.length>180||typeof f.mime!=="string"||!Number.isSafeInteger(f.size)||f.size<1||f.size>10485760))return null;
  const p=row.pending[kind];
  if(p&&(typeof p.key!=="string"||!/^[0-9a-f-]{36}$/i.test(p.key)||typeof p.message!=="string"||p.message.length>4000||typeof p.fileIds!=="string"||p.businessId!==null&&typeof p.businessId!=="string"))return null;
 }
 return row;
}
export async function loadSupportDraft(scope:string){
 await writes.get(scope)?.catch(()=>{});
 const text=await AsyncStorage.getItem(storageKey(scope));if(!text)return null;
 try{return valid(JSON.parse(text));}catch{return null;}
}
export function saveSupportDraft(scope:string,snapshot:SupportDraftSnapshot){
 const text=JSON.stringify(snapshot);
 if(!valid(JSON.parse(text)))return Promise.reject(Error("Borrador inválido."));
 const next=(writes.get(scope)??Promise.resolve()).catch(()=>{}).then(()=>AsyncStorage.setItem(storageKey(scope),text));
 writes.set(scope,next);
 void next.finally(()=>{if(writes.get(scope)===next)writes.delete(scope);}).catch(()=>{});
 return next;
}
