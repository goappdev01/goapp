import { shoppingDecimal, shoppingEditor, shoppingId, shoppingName, suggestShoppingCategory, type ShoppingCategory, type ShoppingDocument, type ShoppingItem, type ShoppingOperation, type ShoppingUnit } from "./shoppingNote";

/** Eight entrances retain all twelve existing categories and their stored order. */
export const SHOPPING_ORBITS = [
  {id:"produce",label:"Fruta y verdura",icon:"food-apple-outline",categories:["produce"]},
  {id:"bakery",label:"Panadería",icon:"bread-slice-outline",categories:["bakery"]},
  {id:"meat",label:"Carne y pescado",icon:"fish",categories:["meat","fish"]},
  {id:"other",label:"Otros",icon:"basket-outline",categories:["other","cleaning","pets"]},
  {id:"frozen",label:"Congelados",icon:"snowflake",categories:["frozen"]},
  {id:"pantry",label:"Despensa y bebidas",icon:"bottle-soda-outline",categories:["pantry","drinks"]},
  {id:"dairy",label:"Lácteos y huevos",icon:"egg-outline",categories:["dairy"]},
  {id:"care",label:"Higiene",icon:"hand-wash-outline",categories:["care"]},
] as const;
export const SHOPPING_SUGGESTIONS:Partial<Record<ShoppingCategory,string[]>>={
  produce:["Manzanas","Plátanos","Tomates","Patatas"],bakery:["Pan","Baguette"],meat:["Pollo","Ternera"],fish:["Merluza","Salmón"],
  dairy:["Leche","Huevos","Yogur","Queso"],frozen:["Guisantes congelados","Helados"],pantry:["Arroz","Pasta","Aceite"],drinks:["Agua","Zumo"],
  care:["Champú","Pasta de dientes"],cleaning:["Detergente","Lavavajillas"],pets:["Pienso"],other:[],
};
export function shoppingOrbitLayout(width:number,fontScale=1){
  const size=Math.min(Math.max(240,width-24),480),button=Math.min(100,Math.max(72,size*.235)),radius=(size-button)/2;
  // Larger accessible text expands vertically; the eight entrances still surround GO on every side.
  const buttonHeight=Math.max(button,36+36*fontScale),verticalRadius=radius*buttonHeight/button,height=buttonHeight+2*verticalRadius;
  return {size,button,buttonHeight,height,points:SHOPPING_ORBITS.map((_,i)=>{
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
  if(/^(?:que (?:queda|falta)|pendientes|mostrar pendientes)/.test(normalized)){const pending=doc.items.filter(i=>i.selected&&!i.bought);return{message:pending.length?`Pendientes: ${pending.map(i=>`${i.name}: ${i.quantity} ${i.unit}`).join("; ")}.`:"Ya has cogido todo lo incluido en la lista."};}
  if(/^(?:ruta|gestionar ruta|recalcula(?:r)? ruta|ir a caja)$/.test(normalized))return{message:"Recorrido actualizado con los productos pendientes.",route:true};
  const add=raw.match(/^(?:añade|añadir|agrega)\s+(?:(\d+(?:[.,]\d+)?)\s+(?:(kg|g|litros|ml|paquetes|unidades)\s+(?:de\s+)?)?)?(.+)$/i);
  if(add){const name=add[3].trim();if(!name)return{message:"Indica el producto que quieres añadir."};if(/\s+(?:y|luego|despues)\s+|[;\n]/i.test(name))return{message:"Da una orden cada vez para identificar el producto."};const matches=doc.items.filter(i=>shoppingName(i.name)===shoppingName(name));
    if(matches.length>1)return{message:"Hay varias marcas o presentaciones. Elige la fila que quieres cambiar."};
    if(matches.length){const i=matches[0];if(add[2]&&add[2]!==i.unit)return{message:"La unidad es distinta. Cambia la presentación desde su fila."};return{message:`${i.name} añadido a la compra.`,operations:[{type:"select",id:i.id,value:true,operationId:shoppingId()},{type:"bought",id:i.id,value:false,operationId:shoppingId()},...(add[1]?[{type:"quantity" as const,id:i.id,value:shoppingDecimal(add[1])!,operationId:shoppingId()}]:[])]};}
    const draft={...shoppingEditor(),name,quantity:add[1]||"1",unit:(add[2] as ShoppingUnit)||"unidades",category:suggestShoppingCategory(name,doc),store:doc.store||""};
    return{message:`${name} añadido.`,operations:[{type:"saveItem",draft,operationId:shoppingId()}]};}
  const quantity=raw.match(/^(?:cambia(?:r)? (?:la )?cantidad (?:de )?|cantidad (?:de )?)(.+?)\s+(?:a|por)\s+(\d+(?:[.,]\d+)?)$/i);
  const picked=raw.match(/^(?:marca(?:r)? (?:como )?cogido|cogido)\s+(.+)$/i),remove=raw.match(/^(?:quita(?:r)?|retira(?:r)?)\s+(.+)$/i);
  const name=quantity?.[1]||picked?.[1]||remove?.[1];
  if(name){const matches=doc.items.filter(i=>shoppingName(i.name)===shoppingName(name));if(matches.length!==1)return{message:matches.length?"Hay varias presentaciones. Selecciona su fila.":"No encuentro ese producto. Indica su nombre tal como aparece en la lista."};const i=matches[0];
    if(quantity)return{message:`Cantidad de ${i.name} actualizada.`,operations:[{type:"quantity",id:i.id,value:shoppingDecimal(quantity[2])!,operationId:shoppingId()}]};
    if(picked)return{message:`${i.name} marcado como cogido.`,operations:[{type:"bought",id:i.id,value:true,operationId:shoppingId()}]};
    return{message:`${i.name} retirado de esta compra. Se conserva en tus productos.`,operations:[{type:"select",id:i.id,value:false,operationId:shoppingId()}]};}
  return{message:"Puedes decir «Añade 2 kg de manzanas», «Cantidad de manzanas a 1,5», «Marca cogido manzanas», «Quita manzanas», «Qué queda» o «Ruta». Para varias acciones, da una orden cada vez."};
}
