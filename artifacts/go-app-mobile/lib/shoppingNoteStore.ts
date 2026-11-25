import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { TaskScope } from "./goTaskReminders";
import { assertTaskUser } from "./goTaskAccess";
import { readGoLog } from "./goLogStore";
import { buildNoteEntry, isNoteEntry, noteDraft, noteInScope } from "./unifiedNotes";
import { applyShoppingOperation, emptyShopping, legacyShoppingCandidates, shoppingEditor, shoppingId, shoppingName, sameShoppingPresentation, suggestShoppingCategory, validateShopping, type ShoppingOperation } from "./shoppingNote";
import { selectShoppingList, syncShopping, updateShoppingLog } from "./shoppingSync";

export const shoppingNoteId=(scope:TaskScope)=>"shopping_note:"+encodeURIComponent(scope.userId)+":"+encodeURIComponent(scope.context);
const activeListKey=(scope:TaskScope)=>shoppingNoteId(scope)+":active_list";
export class ShoppingNoteDeletedError extends Error{
  constructor(readonly noteId:string){super("La compra canónica está eliminada. Restaura la nota antes de continuar.");this.name="ShoppingNoteDeletedError";}
}
// The screen binds ADMIN's active() guard to verified access; all store operations still check the session owner.
function assertShoppingScope(scope:TaskScope){if(!scope.userId||! /^(live:ADMIN|(live|demo):USER|live:BUSINESS|demo:BUSINESS:[^:]+)$/.test(scope.context))throw Error("COMPRAS requiere una sesión autenticada de GO.");}
async function check(scope:TaskScope,active:()=>boolean){assertShoppingScope(scope);await assertTaskUser(scope.userId);if(!active())throw Error("La cuenta o el contexto ha cambiado. Vuelve a abrir COMPRAS.");}
function canonical(rows:GoEntry[],scope:TaskScope,listId?:string){
  const matches=rows.filter(row=>noteInScope(row,scope)&&row.note?.shopping!==undefined);
  if(new Set(matches.map(row=>row.id)).size!==matches.length)throw Error("Hay listas duplicadas. Se conservan para revisión.");
  const chosen=listId?matches.find(row=>row.id===listId):matches.find(row=>!row.deleted&&row.estado!=="rechazado")||matches.find(row=>row.id===shoppingNoteId(scope));
  if(chosen&&(chosen.deleted||chosen.estado==="rechazado"))throw new ShoppingNoteDeletedError(chosen.id);
  const entry=chosen;
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
export async function openShoppingNote(scope:TaskScope,active:()=>boolean,listId?:string):Promise<GoEntry>{
  await check(scope,active);await syncShopping(scope,active);
  const selected=listId||await AsyncStorage.getItem(activeListKey(scope))||undefined;
  const entry=await updateShoppingLog(scope,active,async rows=>{
    await check(scope,active);
    const existingSelected=rows.some(row=>row.id===selected&&noteInScope(row,scope)&&row.note?.shopping!==undefined);
    if(selected&&!existingSelected)throw Error("No se encuentra la lista activa guardada. Se conservan los registros y su identificador; no se ha creado una lista de sustitución.");
    const found=canonical(rows,scope,existingSelected?selected:undefined);if(found)return {entries:rows,result:found};
    const id=shoppingNoteId(scope);
    if(rows.some(row=>row.id===id))throw Error("El identificador de COMPRAS ya está ocupado. No se ha modificado ninguna nota.");
    const draft={...noteDraft(),id,title:"COMPRAS",content:"Lista personal de compra",destination:"pending" as const};
    const created=buildNoteEntry(draft,scope);created.note!.shopping=emptyShopping();
    return {entries:[created,...rows],result:created};
  });
  const saved=await verified(entry,undefined,scope,active);await selectShoppingList(scope,active,saved.id);return saved;
}
/** A deleted shopping list remains in the trash until its owner explicitly confirms restoration. */
export async function restoreShoppingNote(scope:TaskScope,active:()=>boolean,noteId:string):Promise<GoEntry>{
  await check(scope,active);
  const entry=await updateShoppingLog(scope,active,async rows=>{
    await check(scope,active);
    const matches=rows.filter(row=>noteInScope(row,scope)&&row.note?.shopping!==undefined);
    if(rows.filter(row=>row.id===noteId).length!==1)throw Error("La lista de COMPRAS cambió. Revisa la papelera antes de restaurarla.");
    const previous=matches.find(row=>row.id===noteId);if(!previous)throw Error("La lista no pertenece a esta cuenta.");
    if(!previous.deleted&&previous.estado!=="rechazado")throw Error("La lista ya está activa. Pulsa Reintentar.");
    validateShopping(previous.note!.shopping!);
    const restored={...previous,deleted:false,estado:"pendiente" as const};
    return {entries:rows.map(row=>row.id===noteId?restored:row),result:restored};
  });
  const saved=await verified(entry,undefined,scope,active);await selectShoppingList(scope,active,saved.id);return saved;
}
export async function runShoppingOperation(scope:TaskScope,active:()=>boolean,op:ShoppingOperation,listId?:string):Promise<GoEntry>{
  await check(scope,active);
  const entry=await updateShoppingLog(scope,active,async rows=>{
    await check(scope,active);const catalogWrite=op.type==="catalogVisibility"||(op.type==="saveItem"||op.type==="draft")&&op.draft?.catalogOnly===true;
    if(catalogWrite&&listId&&rows.filter(row=>row.id===listId).length!==1)throw Error("La lista del catálogo cambió o está duplicada. Se conserva sin modificar.");
    const previous=catalogWrite&&listId?rows.find(row=>row.id===listId&&noteInScope(row,scope)&&row.note?.shopping):canonical(rows,scope,listId);if(previous)validateShopping(previous.note!.shopping!);if(!previous)throw Error("Abre COMPRAS antes de añadir productos.");
    const old=previous.note!.shopping!;let shopping;
    if(op.type==="saveItem"&&op.draft.catalogOnly&&!op.draft.expectedRevision){
      const d=op.draft;const duplicate=rows.filter(row=>noteInScope(row,scope)&&row.note?.shopping).flatMap(row=>row.note!.shopping!.items).find(i=>i.id!==d.id&&!i.catalogHidden&&i.category===d.category&&shoppingName(i.name)===shoppingName(d.name)&&shoppingName(i.brand??"")===shoppingName(d.brand)&&shoppingName(i.format??"")===shoppingName(d.format)&&shoppingName(i.variety??"")===shoppingName(d.variety??"")&&i.unit===d.unit);
      if(duplicate)throw Error("Este producto ya está en tu catálogo. Selecciónalo o edita su ficha, sin duplicarlo.");
    }
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
    }else if(op.type==="addCatalog"&&op.products.some(p=>p.sourceListId)||op.type==="favorite"&&"product" in op&&op.product.sourceListId){
      const prepared:typeof old=JSON.parse(JSON.stringify(old));
      const products=(op.type==="addCatalog"?op.products:[op.product]).map(product=>{
        if(!product.sourceListId)return product;
        const source=rows.find(row=>row.id===product.sourceListId&&noteInScope(row,scope)&&row.note?.shopping);
        if(!source||rows.filter(row=>row.id===product.sourceListId).length!==1)throw Error("El catálogo no pertenece a esta cuenta o contexto.");validateShopping(source.note!.shopping!);
        const item=source.note!.shopping!.items.find(item=>item.id===product.id);
        if(!item||item.catalogHidden||item.name!==product.name||item.category!==product.category)throw Error("El producto personalizado cambió. Revisa el catálogo.");
        const equivalent=prepared.items.find(i=>sameShoppingPresentation(i,item));
        if(equivalent)return {...product,id:equivalent.id};
        prepared.items.push({...JSON.parse(JSON.stringify(item)),selected:false,bought:false,order:Math.max(-1,...prepared.items.map(i=>i.order))+1});
        return product;
      });
      shopping=applyShoppingOperation(prepared,op.type==="addCatalog"?{...op,products}:{...op,product:products[0]});
    }else shopping=applyShoppingOperation(old,op);
    const next={...previous,note:{...previous.note!,revision:previous.note!.revision+1,operationId:op.operationId,shopping}};
    return {entries:rows.map(row=>row.id===next.id?next:row),result:next};
  });
  return verified(entry,op.operationId,scope,active);
}
export async function oldShoppingNotes(scope:TaskScope,active:()=>boolean){
  await check(scope,active);const rows=await readGoLog();await check(scope,active);
  return rows.filter(row=>isNoteEntry(row)&&noteInScope(row,scope)&&!row.deleted&&row.estado!=="rechazado"&&!row.note?.shopping
    &&shoppingName(row.note?.title??row.notes??"")==="compras");
}
export async function listShoppingLists(scope:TaskScope,active:()=>boolean):Promise<GoEntry[]>{
  await check(scope,active);await syncShopping(scope,active);const rows=await readGoLog();await check(scope,active);
  const lists=rows.filter(row=>noteInScope(row,scope)&&row.note?.shopping!==undefined);
  for(const row of lists)validateShopping(row.note!.shopping!);
  return lists;
}
export async function createShoppingList(scope:TaskScope,active:()=>boolean,name:string):Promise<GoEntry>{
  await check(scope,active);if(!name.trim())throw Error("Escribe un nombre para la lista.");
  const entry=await updateShoppingLog(scope,active,async rows=>{
    await check(scope,active);
    const draft={...noteDraft(),title:name.trim(),content:"Lista personal de compra",destination:"pending" as const};
    if(rows.some(row=>row.id===draft.id))throw Error("El identificador de la lista ya existe.");
    const created=buildNoteEntry(draft,scope);created.note!.shopping=emptyShopping();
    return {entries:[created,...rows],result:created};
  });
  const saved=await verified(entry,undefined,scope,active);await selectShoppingList(scope,active,saved.id);return saved;
}
export async function renameShoppingList(scope:TaskScope,active:()=>boolean,listId:string,name:string):Promise<GoEntry>{
  await check(scope,active);if(!name.trim())throw Error("Escribe un nombre para la lista.");
  const entry=await updateShoppingLog(scope,active,async rows=>{
    await check(scope,active);const previous=canonical(rows,scope,listId);if(!previous)throw Error("Lista no disponible.");
    const next={...previous,notes:name.trim(),note:{...previous.note!,title:name.trim(),revision:previous.note!.revision+1}};
    return {entries:rows.map(row=>row.id===listId?next:row),result:next};
  });
  return verified(entry,undefined,scope,active);
}
export async function deleteShoppingList(scope:TaskScope,active:()=>boolean,listId:string):Promise<GoEntry>{
  await check(scope,active);
  const entry=await updateShoppingLog(scope,active,async rows=>{
    await check(scope,active);const previous=canonical(rows,scope,listId);if(!previous)throw Error("Lista no disponible.");
    const next={...previous,deleted:true,estado:"rechazado" as const};
    return {entries:rows.map(row=>row.id===listId?next:row),result:next};
  });
  await check(scope,active);const remaining=(await listShoppingLists(scope,active)).find(row=>row.id!==listId&&!row.deleted&&row.estado!=="rechazado");
  await selectShoppingList(scope,active,remaining?.id??null);
  return entry;
}
export const newShoppingOperationId=shoppingId;
