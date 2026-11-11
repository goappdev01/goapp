/** Local, versioned extension of NoteDocument. No remote catalogue or inferred package sizes. */
export const SHOPPING_CATEGORIES = [
  ["produce", "A", "Frutas y verduras"], ["bakery", "B", "Panadería y bollería"],
  ["meat", "C", "Carnicería y charcutería"], ["fish", "D", "Pescadería"],
  ["dairy", "E", "Lácteos y huevos"], ["frozen", "F", "Congelados"],
  ["pantry", "G", "Despensa y alimentación seca"], ["drinks", "H", "Bebidas"],
  ["care", "I", "Higiene y cuidado personal"], ["cleaning", "J", "Limpieza y hogar"],
  ["pets", "K", "Mascotas"], ["other", "L", "Otros / sin clasificar"],
] as const;
export type ShoppingCategory = typeof SHOPPING_CATEGORIES[number][0];
export const SHOPPING_UNITS = ["unidades", "paquetes", "kg", "g", "litros", "ml"] as const;
export type ShoppingUnit = typeof SHOPPING_UNITS[number];
export type MeasureUnit = Exclude<ShoppingUnit, "paquetes">;
export type ShoppingPrice = {
  id:string; store:string; price:number; currency:string; observedOn:string;
  purchaseUnit:ShoppingUnit; packageQuantity?:number; packageUnit?:MeasureUnit; brand:string; format:string;
};
export type ShoppingItem = {
  id:string; revision:number; name:string; category:ShoppingCategory; quantity:number; unit:ShoppingUnit;
  packageQuantity?:number; packageUnit?:MeasureUnit; bought:boolean; usual:boolean; selected:boolean;
  order:number; notes:string; preferredStore?:string; prices:ShoppingPrice[]; selectedPriceId?:string;
};
/** Raw input is deliberately retained: an unfinished decimal is not a committed item. */
export type ShoppingEditorDraft = {
  id:string; expectedRevision?:number; name:string; category:ShoppingCategory; quantity:string; unit:ShoppingUnit;
  packageQuantity:string; packageUnit:MeasureUnit; notes:string; usual:boolean;
  store:string; price:string; currency:string; observedOn:string; priceQuantity:string; priceUnit:MeasureUnit;
  brand:string; format:string; observationId:string;
};
export type ShoppingDocument = {
  version:1; categoryOrder:ShoppingCategory[]; collapsed:ShoppingCategory[]; items:ShoppingItem[];
  operations:string[]; pendingEditor?:ShoppingEditorDraft;
};
export type ShoppingOperation = { operationId:string } & (
  {type:"saveItem"; draft:ShoppingEditorDraft} | {type:"draft"; draft?:ShoppingEditorDraft} |
  {type:"bought"; id:string; value:boolean} | {type:"select"; id:string; value:boolean} |
  {type:"quantity"; id:string; value:number} | {type:"delete"; id:string; confirmed:true} |
  {type:"category"; id:string; category:ShoppingCategory} |
  {type:"collapse"; category:ShoppingCategory; value:boolean} |
  {type:"reorderItems"; category:ShoppingCategory; ids:string[]} |
  {type:"reorderCategories"; ids:ShoppingCategory[]} |
  {type:"next"; ids:string[]; confirmed:true} |
  {type:"selectPrice"; id:string; priceId:string} |
  {type:"importLegacy"; sourceId:string; names:string[]; confirmed:true}
);
export const shoppingId = () => "shop_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2);
export const shoppingName = (s:string) => s.trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g," ");
export const emptyShopping = ():ShoppingDocument => ({version:1,categoryOrder:SHOPPING_CATEGORIES.map(c=>c[0]),collapsed:[],items:[],operations:[]});
export function shoppingDecimal(value:string, optional=false):number|undefined {
  const s=value.trim(); if(!s && optional)return undefined;
  if(!/^\d+(?:[.,]\d+)?$/.test(s))throw Error("Introduce un número válido, por ejemplo 1,5.");
  const n=Number(s.replace(",","."));
  if(!Number.isFinite(n)||n<=0||n>1e9)throw Error("La cantidad o el precio debe ser mayor que 0 y menor o igual a 1.000.000.000.");
  return n;
}
const categoryValid = (v:unknown):v is ShoppingCategory => SHOPPING_CATEGORIES.some(c=>c[0]===v);
const unitValid = (v:unknown):v is ShoppingUnit => SHOPPING_UNITS.includes(v as ShoppingUnit);
const positive = (v:unknown):v is number => typeof v==="number"&&Number.isFinite(v)&&v>0&&v<=1e9;
export function shoppingDate(value:string) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+"T12:00:00"),[y,m,day]=value.split("-").map(Number);
  return d.getFullYear()===y&&d.getMonth()+1===m&&d.getDate()===day;
}
const checkSize = (quantity:unknown,unit:unknown) => {
  if(quantity===undefined&&unit===undefined)return;
  if(!positive(quantity)||!unitValid(unit)||unit==="paquetes")throw Error("Indica tamaño y unidad verificables del envase.");
};
export function validateShopping(doc:ShoppingDocument):void {
  if(doc?.version!==1||!Array.isArray(doc.items)||!Array.isArray(doc.operations)||doc.operations.some(id=>typeof id!=="string")
    ||!Array.isArray(doc.categoryOrder)||doc.categoryOrder.length!==12||new Set(doc.categoryOrder).size!==12||doc.categoryOrder.some(c=>!categoryValid(c))
    ||!Array.isArray(doc.collapsed)||doc.collapsed.some(c=>!categoryValid(c)))throw Error("La compra guardada no es válida. Se conserva sin modificar.");
  const ids=new Set<string>();
  for(const item of doc.items){
    if(!item.id||ids.has(item.id)||!Number.isInteger(item.revision)||item.revision<1||typeof item.name!=="string"||!item.name.trim()
      ||!categoryValid(item.category)||!positive(item.quantity)||!unitValid(item.unit)||!Number.isFinite(item.order)
      ||[item.bought,item.usual,item.selected].some(v=>typeof v!=="boolean")||typeof item.notes!=="string"||!Array.isArray(item.prices))throw Error("Hay un artículo inválido. No se ha cambiado la lista.");
    ids.add(item.id); checkSize(item.packageQuantity,item.packageUnit);
    const priceIds=new Set<string>();
    for(const p of item.prices){
      if(!p.id||priceIds.has(p.id)||!positive(p.price)||typeof p.store!=="string"||!p.store.trim()||!/^[A-Z]{3}$/.test(p.currency)
        ||!shoppingDate(p.observedOn)||!unitValid(p.purchaseUnit)||typeof p.brand!=="string"||typeof p.format!=="string")throw Error("Hay un precio inválido. No se ha cambiado la lista.");
      checkSize(p.packageQuantity,p.packageUnit);priceIds.add(p.id);
    }
    if(item.selectedPriceId&&!priceIds.has(item.selectedPriceId))throw Error("El precio seleccionado ya no está disponible.");
  }
  if(doc.pendingEditor)validateEditorShape(doc.pendingEditor);
}
function validateEditorShape(d:ShoppingEditorDraft) {
  if(!d||!d.id||!d.observationId||!categoryValid(d.category)||!unitValid(d.unit)||!unitValid(d.packageUnit)||d.packageUnit as string==="paquetes"
    ||!unitValid(d.priceUnit)||d.priceUnit as string==="paquetes"||typeof d.usual!=="boolean"
    ||[d.name,d.quantity,d.packageQuantity,d.notes,d.store,d.price,d.currency,d.observedOn,d.priceQuantity,d.brand,d.format].some(v=>typeof v!=="string"))throw Error("El borrador no es válido.");
}
const catalogue:Partial<Record<ShoppingCategory,string[]>> = {
  produce:["manzana","manzanas","platano","platanos","tomate","tomates","patata","patatas","lechuga","cebolla","zanahoria"],
  bakery:["pan","baguette","bollos","croissant"],meat:["pollo","ternera","jamon","carne","pavo"],
  fish:["merluza","salmon","sardinas","pescado"],dairy:["leche","huevos","huevo","yogur","queso","mantequilla"],
  frozen:["helado","helados","guisantes congelados"],pantry:["azucar","sal","arroz","pasta","harina","lentejas","garbanzos","aceite","conservas"],
  drinks:["agua","cerveza","vino","zumo"],care:["champu","gel de ducha","pasta de dientes","desodorante"],
  cleaning:["detergente","lejia","lavavajillas","suavizante","papel higienico"],pets:["pienso","arena para gatos"],
};
export function suggestShoppingCategory(name:string,doc:ShoppingDocument):ShoppingCategory {
  const n=shoppingName(name),previous=doc.items.find(i=>shoppingName(i.name)===n);
  if(previous)return previous.category;
  // Exact local terms only; uncertain combinations stay in Otros.
  return (Object.entries(catalogue).find(([,names])=>names?.includes(n))?.[0] as ShoppingCategory)||"other";
}
export function shoppingEditor(item?:ShoppingItem):ShoppingEditorDraft {
  return {id:item?.id||shoppingId(),expectedRevision:item?.revision,name:item?.name||"",category:item?.category||"other",quantity:String(item?.quantity??1),unit:item?.unit||"unidades",
    packageQuantity:item?.packageQuantity===undefined?"":String(item.packageQuantity),packageUnit:item?.packageUnit||"kg",notes:item?.notes||"",usual:item?.usual??true,
    store:item?.preferredStore||"",price:"",currency:"EUR",observedOn:localShoppingDate(),priceQuantity:"",priceUnit:"kg",brand:"",format:"",observationId:shoppingId()};
}
export function localShoppingDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function editorItem(d:ShoppingEditorDraft,doc:ShoppingDocument):ShoppingItem {
  validateEditorShape(d);
  const old=doc.items.find(i=>i.id===d.id),name=d.name.trim();
  if(!name)throw Error("Escribe el nombre del producto.");
  if(old?.revision!==d.expectedRevision)throw Error("El artículo cambió durante la edición. Conserva el borrador y vuelve a abrir el artículo.");
  if(doc.items.some(i=>i.id!==d.id&&shoppingName(i.name)===shoppingName(name)))throw Error("Ya existe ese producto. Edita su fila para cambiar cantidad o supermercado.");
  const quantity=shoppingDecimal(d.quantity||"1")!,size=shoppingDecimal(d.packageQuantity,true);
  const prices=[...(old?.prices||[])];let selectedPriceId=old?.selectedPriceId;
  if(d.price.trim()){
    if(!d.store.trim())throw Error("Indica el supermercado del precio observado.");
    if(!/^[A-Z]{3}$/.test(d.currency.trim().toUpperCase()))throw Error("Usa una moneda de tres letras, por ejemplo EUR.");
    if(!shoppingDate(d.observedOn))throw Error("La fecha del precio debe ser AAAA-MM-DD y existir.");
    const size=shoppingDecimal(d.priceQuantity,true);
    prices.push({id:d.observationId,store:d.store.trim(),price:shoppingDecimal(d.price)!,currency:d.currency.trim().toUpperCase(),observedOn:d.observedOn,
      purchaseUnit:d.unit,packageQuantity:size,packageUnit:size===undefined?undefined:d.priceUnit,brand:d.brand.trim(),format:d.format.trim()});
    selectedPriceId=d.observationId;
  }
  return {...old,id:d.id,revision:(old?.revision||0)+1,name,category:d.category,quantity,unit:d.unit,
    packageQuantity:size,packageUnit:size===undefined?undefined:d.packageUnit,bought:old?.bought??false,usual:d.usual,selected:old?.selected??true,
    order:old?.category===d.category?old.order:Math.max(-1,...doc.items.filter(i=>i.category===d.category).map(i=>i.order))+1,notes:d.notes,preferredStore:d.store.trim(),prices,selectedPriceId};
}
export function legacyShoppingCandidates(content:string):string[] {
  return [...new Set(content.split(/\r?\n/).map(s=>s.replace(/^\s*(?:[-•*]|\d+[.)])?\s*(?:\[[ xX]\])?\s*/,"").trim()).filter(Boolean))];
}
export function applyShoppingOperation(current:ShoppingDocument,op:ShoppingOperation):ShoppingDocument {
  validateShopping(current);
  if(!op.operationId||typeof op.operationId!=="string")throw Error("Falta el identificador de operación.");
  if(current.operations.includes(op.operationId))return current;
  const doc:ShoppingDocument=JSON.parse(JSON.stringify(current));
  const item=(id:string)=>{const i=doc.items.find(i=>i.id===id);if(!i)throw Error("El producto ya no está disponible.");return i;};
  const permutation=(before:string[],after:string[])=>before.length===after.length&&new Set(after).size===after.length&&after.every(id=>before.includes(id));
  switch(op.type){
    case "draft": if(op.draft){validateEditorShape(op.draft);if(doc.pendingEditor&&doc.pendingEditor.id!==op.draft.id)throw Error("Hay otro borrador pendiente. Recupéralo o descártalo antes de editar otro producto.");}doc.pendingEditor=op.draft;break;
    case "saveItem": {const next=editorItem(op.draft,doc);doc.items=doc.items.some(i=>i.id===next.id)?doc.items.map(i=>i.id===next.id?next:i):[...doc.items,next];if(doc.pendingEditor?.id===next.id)delete doc.pendingEditor;break;}
    // Status and participation do not conflict with an editor: saveItem retains their current values.
    case "bought": {if(typeof op.value!=="boolean")throw Error("Estado inválido.");item(op.id).bought=op.value;break;}
    case "select": {if(typeof op.value!=="boolean")throw Error("Selección inválida.");item(op.id).selected=op.value;break;}
    case "quantity": {if(!positive(op.value))throw Error("La cantidad debe ser mayor que 0.");const i=item(op.id);i.quantity=op.value;i.revision++;break;}
    case "delete": if(op.confirmed!==true)throw Error("Confirma la eliminación.");item(op.id);doc.items=doc.items.filter(i=>i.id!==op.id);break;
    case "category": {if(!categoryValid(op.category))throw Error("Categoría inválida.");const i=item(op.id);i.category=op.category;i.order=Math.max(-1,...doc.items.filter(other=>other.id!==i.id&&other.category===op.category).map(i=>i.order))+1;i.revision++;break;}
    case "collapse": if(!categoryValid(op.category)||typeof op.value!=="boolean")throw Error("Categoría inválida.");doc.collapsed=doc.collapsed.filter(c=>c!==op.category);if(op.value)doc.collapsed.push(op.category);break;
    case "reorderItems": {const group=doc.items.filter(i=>i.category===op.category);if(!categoryValid(op.category)||!permutation(group.map(i=>i.id),op.ids))throw Error("El bloque cambió. Repite el arrastre.");for(const i of group)i.order=op.ids.indexOf(i.id);break;}
    case "reorderCategories": if(!permutation(doc.categoryOrder,op.ids))throw Error("El orden de secciones no es válido.");doc.categoryOrder=op.ids;break;
    case "next": if(op.confirmed!==true||!op.ids.length)throw Error("Selecciona y confirma los productos habituales.");for(const id of op.ids){const i=item(id);if(!i.usual)throw Error("Selecciona solo productos habituales.");i.bought=false;i.selected=true;}break;
    case "selectPrice": {const i=item(op.id);if(!i.prices.some(p=>p.id===op.priceId))throw Error("Precio no disponible.");i.selectedPriceId=op.priceId;break;}
    case "importLegacy": throw Error("La incorporación requiere comprobar la nota de origen en el almacén.");
    default: throw Error("Operación de compra desconocida.");
  }
  doc.operations=[...doc.operations,op.operationId].slice(-200);validateShopping(doc);return doc;
}
export type ShoppingFilter="all"|"pending"|"bought";
export function visibleShopping(doc:ShoppingDocument,filter:ShoppingFilter) {
  let number=0;
  return doc.categoryOrder.map(category=>({category,items:doc.collapsed.includes(category)?[]:doc.items.filter(i=>i.category===category&&(filter==="all"||i.selected&&(filter==="bought"?i.bought:!i.bought)))
    .sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)).map(item=>({item,number:++number}))}));
}
export function normalizedShoppingPrice(p:ShoppingPrice):{value:number;unit:"kg"|"l"|"unidad"}|null {
  if(!positive(p.packageQuantity)||!p.packageUnit)return null;
  const divisor=p.packageQuantity*(p.packageUnit==="g"||p.packageUnit==="ml"?0.001:1);
  return {value:p.price/divisor,unit:p.packageUnit==="kg"||p.packageUnit==="g"?"kg":p.packageUnit==="litros"||p.packageUnit==="ml"?"l":"unidad"};
}
export function comparableShoppingPrices(prices:ShoppingPrice[]) {
  const groups=new Map<string,ShoppingPrice[]>();
  for(const p of prices){const n=normalizedShoppingPrice(p);if(!n||!p.brand.trim()||!p.format.trim())continue;
    const key=[p.currency,n.unit,shoppingName(p.brand),shoppingName(p.format)].join("|");groups.set(key,[...(groups.get(key)||[]),p]);}
  return [...groups.values()].filter(g=>g.length>1).map(g=>g.sort((a,b)=>normalizedShoppingPrice(a)!.value-normalizedShoppingPrice(b)!.value));
}
export function shoppingEstimate(doc:ShoppingDocument) {
  const totals:Record<string,number>={};let unknown=0;
  for(const i of doc.items.filter(i=>i.selected)){
    const p=i.prices.find(p=>p.id===i.selectedPriceId);let amount:number|undefined;
    if(p){const n=normalizedShoppingPrice(p);
      const counted=i.unit==="paquetes"||i.unit==="unidades";
      if(counted&&i.unit===p.purchaseUnit&&i.packageQuantity===undefined)amount=i.quantity*p.price;
      else if(n){const size=counted?i.packageQuantity:i.quantity,unit=counted?i.packageUnit:i.unit;
        const base=unit==="kg"||unit==="g"?"kg":unit==="litros"||unit==="ml"?"l":unit==="unidades"?"unidad":undefined;
        if(size!==undefined&&base===n.unit)amount=size*(counted?i.quantity:1)*(unit==="g"||unit==="ml"?0.001:1)*n.value;}
    }
    if(amount===undefined||!Number.isFinite(amount))unknown++;else totals[p!.currency]=(totals[p!.currency]||0)+amount;
  }
  return {totals,unknown};
}
/** Future GO IA adapter accepts structured fields only. The caller must show this preview and confirm it. */
export function previewShoppingInput(doc:ShoppingDocument,input:{name:string;quantity?:string;unit?:ShoppingUnit;category?:ShoppingCategory;id?:string}) {
  const matches=doc.items.filter(i=>shoppingName(i.name)===shoppingName(input.name));
  if(!input.name.trim()||!input.quantity||!input.unit||matches.length&&!input.id)return {needsCorrection:true as const,message:"Confirma producto, cantidad y unidad; si ya existe, selecciona su fila."};
  const existing=input.id?doc.items.find(i=>i.id===input.id):undefined;
  if(input.id&&!existing)throw Error("El producto seleccionado ya no existe.");
  const draft={...shoppingEditor(existing),name:input.name,quantity:input.quantity,unit:input.unit,category:input.category||suggestShoppingCategory(input.name,doc)};
  editorItem(draft,doc);
  return {needsCorrection:false as const,requiresConfirmation:true as const,draft,operation:{type:"saveItem" as const,operationId:shoppingId(),draft}};
}
