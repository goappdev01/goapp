import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { TaskScope } from "./goTaskReminders";
import { assertTaskUser } from "./goTaskAccess";
import { readGoLog, updateGoLog } from "./goLogStore";
import { buildNoteEntry, isNoteEntry, noteDraft, noteInScope } from "./unifiedNotes";
import { applyShoppingOperation, emptyShopping, legacyShoppingCandidates, shoppingEditor, shoppingId, shoppingName, suggestShoppingCategory, validateShopping, type ShoppingOperation } from "./shoppingNote";

export const shoppingNoteId=(scope:TaskScope)=>"shopping_note:"+encodeURIComponent(scope.userId)+":"+encodeURIComponent(scope.context);
function assertPersonal(scope:TaskScope){if(!scope.userId||! /^(live|demo):USER$/.test(scope.context))throw Error("COMPRAS requiere una sesión en el ámbito personal de GO.");}
async function check(scope:TaskScope,active:()=>boolean){assertPersonal(scope);await assertTaskUser(scope.userId);if(!active())throw Error("La cuenta o el contexto ha cambiado. Vuelve a abrir COMPRAS.");}
function canonical(rows:GoEntry[],scope:TaskScope){
  const matches=rows.filter(row=>noteInScope(row,scope)&&row.note?.shopping!==undefined);
  if(matches.length>1)throw Error("Hay más de una nota de compra especializada. Se conservan sin fusionar; revisa los datos.");
  const entry=matches[0];
  if(entry&&(entry.deleted||entry.estado==="rechazado"))throw Error("La compra canónica está eliminada. Restaura la nota antes de continuar.");
  if(entry)validateShopping(entry.note!.shopping!);
  return entry;
}
async function verified(entry:GoEntry,operationId:string|undefined,scope:TaskScope,active:()=>boolean){
  await check(scope,active);
  const raw:unknown=JSON.parse(await AsyncStorage.getItem("go_log_v1")||"null");
  const matches=Array.isArray(raw)?raw.filter(row=>row?.id===entry.id):[];
  const doc=matches[0]?.note?.shopping;
  if(matches.length!==1||!noteInScope(matches[0],scope)||!doc||operationId&&!doc.operations.includes(operationId))throw Error("No se ha podido verificar el guardado local. El borrador sigue disponible; reintenta.");
  validateShopping(doc);await check(scope,active);return entry;
}
/** Creation, writes and readback all use the existing unified GO log and its serialized queue. */
export async function openShoppingNote(scope:TaskScope,active:()=>boolean):Promise<GoEntry>{
  await check(scope,active);
  const entry=await updateGoLog(async rows=>{
    await check(scope,active);const found=canonical(rows,scope);if(found)return {entries:rows,result:found};
    const id=shoppingNoteId(scope);
    if(rows.some(row=>row.id===id))throw Error("El identificador de COMPRAS ya está ocupado. No se ha modificado ninguna nota.");
    const draft={...noteDraft(),id,title:"COMPRAS",content:"Lista personal de compra",destination:"pending" as const};
    const created=buildNoteEntry(draft,scope);created.note!.shopping=emptyShopping();
    return {entries:[created,...rows],result:created};
  },()=>{if(!active())throw Error("El contexto de compra ha cambiado.");});
  return verified(entry,undefined,scope,active);
}
export async function runShoppingOperation(scope:TaskScope,active:()=>boolean,op:ShoppingOperation):Promise<GoEntry>{
  await check(scope,active);
  const entry=await updateGoLog(async rows=>{
    await check(scope,active);const previous=canonical(rows,scope);if(!previous)throw Error("Abre COMPRAS antes de añadir productos.");
    const old=previous.note!.shopping!;let shopping;
    if(old.operations.includes(op.operationId))return {entries:rows,result:previous};
    if(op.type==="importLegacy"){
      if(op.confirmed!==true||!op.names.length)throw Error("Selecciona y confirma los productos a incorporar.");
      const source=rows.find(row=>row.id===op.sourceId&&isNoteEntry(row)&&noteInScope(row,scope)&&!row.deleted&&row.estado!=="rechazado"&&!row.note?.shopping);
      if(!source)throw Error("La nota antigua ya no está disponible en esta cuenta.");
      const candidates=legacyShoppingCandidates(source.note?.content??source.detail??"");
      if(op.names.some(name=>!candidates.includes(name)))throw Error("La nota antigua cambió. Revisa su contenido antes de incorporar.");
      shopping=old;
      for(const [index,name] of op.names.entries()){
        if(shopping.items.some(i=>shoppingName(i.name)===shoppingName(name)))continue;
        const draft={...shoppingEditor(),name,category:suggestShoppingCategory(name,shopping)};
        shopping=applyShoppingOperation(shopping,{type:"saveItem",operationId:op.operationId+":"+index,draft});
      }
      shopping={...shopping,operations:[...shopping.operations,op.operationId].slice(-200)};
    }else shopping=applyShoppingOperation(old,op);
    const next={...previous,note:{...previous.note!,revision:previous.note!.revision+1,operationId:op.operationId,shopping}};
    return {entries:rows.map(row=>row.id===next.id?next:row),result:next};
  },()=>{if(!active())throw Error("El contexto de compra ha cambiado.");});
  return verified(entry,op.operationId,scope,active);
}
export async function oldShoppingNotes(scope:TaskScope,active:()=>boolean){
  await check(scope,active);const rows=await readGoLog();await check(scope,active);
  return rows.filter(row=>isNoteEntry(row)&&noteInScope(row,scope)&&!row.deleted&&row.estado!=="rechazado"&&!row.note?.shopping
    &&shoppingName(row.note?.title??row.notes??"")==="compras");
}
export const newShoppingOperationId=shoppingId;
