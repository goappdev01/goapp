import { SHOPPING_QUANTITY_ERROR, isShoppingQuantity, shoppingEditor, shoppingEstimate, shoppingId, shoppingName, shoppingQuantity, suggestShoppingCategory, type ShoppingCategory, type ShoppingDocument, type ShoppingItem, type ShoppingOperation, type ShoppingUnit } from "./shoppingNote";

/** The eight visual entrances cover the existing catalog without changing stored categories. */
export const SHOPPING_ORBITS = [
  {id:"food",label:"Alimentos",art:"🥖",categories:["bakery","meat","fish","dairy","pantry"]},
  {id:"drinks",label:"Bebidas",art:"🧃",categories:["drinks"]},
  {id:"home",label:"Hogar",art:"🏠",categories:["cleaning","pets"]},
  {id:"other",label:"Otros",art:"•••",categories:["other"]},
  {id:"care",label:"Higiene",art:"🧴",categories:["care"]},
  {id:"favorites",label:"Favoritos",art:"⭐",categories:[]},
  {id:"produce",label:"Frescos",art:"🥕",categories:["produce"]},
  {id:"frozen",label:"Congelados",art:"❄️",categories:["frozen"]},
] as const;
export const SHOPPING_SUGGESTIONS:Partial<Record<ShoppingCategory,string[]>>={
  produce:["Manzanas","Plátanos","Tomates","Patatas"],bakery:["Pan","Baguette"],meat:["Pollo","Ternera"],fish:["Merluza","Salmón"],
  dairy:["Leche","Huevos","Yogur","Queso"],frozen:["Guisantes congelados","Helados"],pantry:["Arroz","Pasta","Aceite"],drinks:["Agua","Zumo"],
  care:["Champú","Pasta de dientes"],cleaning:["Detergente","Lavavajillas"],pets:["Pienso"],other:[],
};
export function shoppingOrbitLayout(width:number,fontScale=1){
  const size=Math.min(Math.max(240,width-24),480),button=Math.min(108,Math.max(72,size*.245)),radius=(size-button)/2*.95;
  // Larger accessible text expands vertically; the eight entrances still surround GO on every side.
  const buttonHeight=Math.max(button,36+36*fontScale),verticalRadius=radius*buttonHeight/button,height=buttonHeight+2*verticalRadius;
  const center=Math.min(142,Math.max(108,size*.34));
  return {size,button,buttonHeight,height,center,radius,verticalRadius,points:SHOPPING_ORBITS.map((_,i)=>{
    const angle=(-90+i*45)*Math.PI/180;return{x:size/2+Math.cos(angle)*radius-button/2,y:height/2+Math.sin(angle)*verticalRadius-buttonHeight/2};
  })};
}

export type ShoppingIndoorMap={store:string; nodes:{id:string;aisle?:string}[]; edges:{from:string;to:string;distance:number}[];
  products:Record<string,string>; entrance:string; checkout?:string};
function distances(map:ShoppingIndoorMap,start:string){
  const d=new Map(map.nodes.map(n=>[n.id,Infinity]));d.set(start,0);const remaining=new Set(d.keys());
  while(remaining.size){const id=[...remaining].sort((a,b)=>d.get(a)!-d.get(b)!)[0];remaining.delete(id);if(!Number.isFinite(d.get(id)))break;
    for(const e of map.edges){const next=e.from===id?e.to:e.to===id?e.from:undefined;if(next&&remaining.has(next)&&e.distance>=0&&Number.isFinite(e.distance))d.set(next,Math.min(d.get(next)!,d.get(id)!+e.distance));}}
  return d;
}
const temperature=(i:ShoppingItem)=>i.category==="frozen"?2:["dairy","meat","fish"].includes(i.category)?1:0;
/** Graph distances respect walls; a manual list never claims indoor positioning or shortest-path precision. */
export function shoppingRoute(doc:ShoppingDocument,map?:ShoppingIndoorMap){
  const usable=map&&shoppingName(map.store)===shoppingName(doc.store||"")&&map.nodes.some(n=>n.id===map.entrance)?map:undefined;
  const remaining=doc.items.filter(i=>i.selected&&!i.bought).sort((a,b)=>temperature(a)-temperature(b)||doc.categoryOrder.indexOf(a.category)-doc.categoryOrder.indexOf(b.category)||a.order-b.order);
  const result:{item:ShoppingItem;aisle?:string;located:boolean}[]=[];let cursor=usable?.entrance;
  while(remaining.length){let index=0;
    if(usable&&cursor){const d=distances(usable,cursor),stage=temperature(remaining[0]);let best=Infinity;
      remaining.forEach((i,n)=>{const distance=d.get(usable.products[i.id]);if(temperature(i)===stage&&distance!==undefined&&distance<best){best=distance;index=n;}});}
    const [item]=remaining.splice(index,1),node=usable?.nodes.find(n=>n.id===usable.products[item.id]);
    const aisle=node?.aisle||doc.locations?.find(l=>shoppingName(l.store)===shoppingName(doc.store||"")&&l.itemId===item.id)?.aisle;
    result.push({item,aisle,located:!!node});if(node)cursor=node.id;
  }
  const checkout=usable?.nodes.find(n=>n.id===usable.checkout);
  return {mode:usable?"map" as const:"manual" as const,steps:result,checkout:checkout?{id:checkout.id,aisle:checkout.aisle}:undefined,
    navigationAvailable:false as const,unknown:result.filter(s=>!s.aisle).length};
}

type CommandResult={message:string;operations?:ShoppingOperation[];confirm?:boolean;route?:boolean};
/** Deliberately bounded local commands. No generated products, aisles, prices or remote writes. */
export function shoppingCommand(doc:ShoppingDocument,text:string):CommandResult{
  const raw=text.trim(),normalized=shoppingName(raw);
  if(/^(?:cuanto llevo|gasto|total de compra|cuanto he gastado)$/.test(normalized)){
    const estimate=shoppingEstimate(doc,true),amount=Object.entries(estimate.totals).map(([currency,value])=>`${value.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}`).join(" + ")||"0,00 EUR";
    return{message:`Compra cogida con precio: ${amount}${estimate.unknown?`. ${estimate.unknown} productos sin precio.`:"."}`};
  }
  if(/^(?:que (?:queda|falta)|pendientes|mostrar pendientes)/.test(normalized)){const pending=doc.items.filter(i=>i.selected&&!i.bought);return{message:pending.length?`Pendientes: ${pending.map(i=>`${i.name}: ${i.quantity} ${i.unit}`).join("; ")}.`:"Ya has cogido todo lo incluido en la lista."};}
  if(/^(?:ruta|gestionar ruta|recalcula(?:r)? ruta|ir a caja)$/.test(normalized))return{message:"Recorrido actualizado con los productos pendientes.",route:true};
  const combined=raw.match(/^(?:añade|añadir|agrega)\s+(.+?)\s+y\s+(.+)$/i);
  if(combined){
    const numbers:Record<string,string>={un:"1",una:"1",dos:"2",tres:"3",cuatro:"4",cinco:"5",seis:"6",siete:"7",ocho:"8",nueve:"9",diez:"10"};
    const parts=[combined[1],combined[2]].map(part=>part.replace(/^([\p{L}]+)\b/u,(word)=>numbers[shoppingName(word)]||word));
    if(parts.every(part=>/^\d+(?:[.,]\d+)?\s+\S+/.test(part))){
      const plans=parts.map(part=>shoppingCommand(doc,"Añade "+part));
      if(plans.every(plan=>plan.operations?.length))return{message:"Productos añadidos a la lista.",operations:plans.flatMap(plan=>plan.operations||[])};
    }
    return{message:"Aclara cada producto y su cantidad antes de añadir varios a la vez."};
  }
  const add=raw.match(/^(?:añade|añadir|agrega)\s+(?:(\d+(?:[.,]\d+)?)\s+(?:(kg|g|litros|ml|docenas|paquetes|unidades)\s+(?:de\s+)?)?)?(.+)$/i);
  if(add){const name=add[3].trim();if(!name)return{message:"Indica el producto que quieres añadir."};if(/\s+(?:y|luego|despues)\s+|[;\n]/i.test(name))return{message:"Da una orden cada vez para identificar el producto."};const matches=doc.items.filter(i=>shoppingName(i.name)===shoppingName(name));
    if(add[1]&&(!/^\d+$/.test(add[1])||!isShoppingQuantity(Number(add[1]))))return{message:SHOPPING_QUANTITY_ERROR};
    if(matches.length>1)return{message:"Hay varias marcas o presentaciones. Elige la fila que quieres cambiar."};
    if(matches.length){const i=matches[0];if(add[2]&&add[2]!==i.unit)return{message:"Esa presentación es distinta. Indica el nombre del producto tal como aparece en la lista."};return{message:`${i.name} añadido a la compra.`,operations:[{type:"select",id:i.id,value:true,operationId:shoppingId()},{type:"bought",id:i.id,value:false,operationId:shoppingId()},...(add[1]?[{type:"quantity" as const,id:i.id,value:shoppingQuantity(add[1]),operationId:shoppingId()}]:[])]};}
    const draft={...shoppingEditor(),name,quantity:add[1]||"1",unit:(add[2] as ShoppingUnit)||"unidades",category:suggestShoppingCategory(name,doc),store:doc.store||""};
    return{message:`${name} añadido.`,operations:[{type:"saveItem",draft,operationId:shoppingId()}]};}
  const quantity=raw.match(/^(?:cambia(?:r)? (?:la )?cantidad (?:de )?|cantidad (?:de )?)(.+?)\s+(?:a|por)\s+(\d+(?:[.,]\d+)?)$/i);
  const picked=raw.match(/^(?:marca(?:r)? (?:como )?cogido|cogido)\s+(.+)$/i),remove=raw.match(/^(?:quita(?:r)?|retira(?:r)?)\s+(.+)$/i);
  const name=quantity?.[1]||picked?.[1]||remove?.[1];
  if(name){const matches=doc.items.filter(i=>shoppingName(i.name)===shoppingName(name));if(matches.length!==1)return{message:matches.length?"Hay varias presentaciones. Selecciona su fila.":"No encuentro ese producto. Indica su nombre tal como aparece en la lista."};const i=matches[0];
    if(quantity){
      if(!/^\d+$/.test(quantity[2])||!isShoppingQuantity(Number(quantity[2])))return{message:SHOPPING_QUANTITY_ERROR};
      return{message:`Cantidad de ${i.name} actualizada.`,operations:[{type:"quantity",id:i.id,value:shoppingQuantity(quantity[2]),operationId:shoppingId()}]};
    }
    if(picked)return{message:`${i.name} marcado como cogido.`,operations:[{type:"bought",id:i.id,value:true,operationId:shoppingId()}]};
    return{message:`${i.name} retirado de esta compra. Se conserva en tus productos.`,operations:[{type:"select",id:i.id,value:false,operationId:shoppingId()}]};}
  return{message:"Puedes decir «Añade 2 manzanas», «Cantidad de manzanas a 3», «Marca cogido manzanas», «Quita manzanas», «Qué queda» o «Ruta». Para varias acciones, da una orden cada vez."};
}
