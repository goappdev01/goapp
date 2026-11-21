import {shoppingName,type ShoppingCategory,type ShoppingItem} from './shoppingNote';
/** Presentation only. The twelve persisted V1 categories and item identifiers stay intact. */
export const SHOPPING_ENTRANCES=[
 {id:'produce',label:'FRUTAS Y VERDURAS',art:'🥕',category:'produce'},
 {id:'protein',label:'CARNICERÍA Y PESCADERÍA',art:'🐟',category:'meat'},
 {id:'drinks',label:'BEBIDAS',art:'🧃',category:'drinks'},
 {id:'bakery',label:'PANADERÍA Y REPOSTERÍA',art:'🥖',category:'bakery'},
 {id:'dairy',label:'LÁCTEOS Y REFRIGERADOS',art:'🥛',category:'dairy'},
 {id:'pantry',label:'DESPENSA',art:'🍚',category:'pantry'},
 {id:'care',label:'HIGIENE, DROGUERÍA Y PERFUMERÍA',art:'🧴',category:'care'},
 {id:'home',label:'OTROS (HOGAR)',art:'🏠',category:'other'},
] as const;
export type ShoppingEntrance=typeof SHOPPING_ENTRANCES[number]['id'];
export function shoppingEntrance(name:string,category:ShoppingCategory,explicitHome=false):ShoppingEntrance|undefined{
 const n=shoppingName(name);
 if(category==='frozen'){
  if(/guisant|espinac|menestra|verdura|patata/.test(n))return 'produce';
  if(/merluza|salmon|gamba|calamar|pescado|hamburgues|pollo|nugget/.test(n))return 'protein';
  if(/tarta/.test(n))return 'bakery';
  if(/pizza|lasana|helad|polos/.test(n))return 'dairy';
  return undefined;
 }
 if(category==='produce')return 'produce';
 if(category==='meat'||category==='fish')return 'protein';
 if(category==='drinks')return 'drinks';
 if(category==='bakery')return 'bakery';
 if(category==='dairy')return 'dairy';
 if(category==='pantry'){
  if(n==='judias verdes')return 'produce';
  if(n==='bizcochos')return 'bakery';
  return 'pantry';
 }
 if(category==='care')return 'care';
 if(category==='cleaning')return /film|aluminio|papel de horno|bolsas reutilizables|pilas|bombillas/.test(n)?'home':'care';
 if(category==='pets')return 'home';
 if(/panal|toallita/.test(n))return 'care';
 if(/mascota|perros|gatos|papeleria/.test(n)||explicitHome)return 'home';
 return undefined;
}
export const shoppingItemEntrance=(item:ShoppingItem)=>shoppingEntrance(item.name,item.category,item.customCatalog===true);
