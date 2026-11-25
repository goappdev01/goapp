import {shoppingName,type ShoppingCategory,type ShoppingItem} from './shoppingNote';
/** Presentation only. The twelve persisted V1 categories and item identifiers stay intact. */
export const SHOPPING_ENTRANCES=[
 {id:'produce',label:'FRUTAS Y VERDURAS',art:'🥕🍎',category:'produce'},
 {id:'protein',label:'CARNICERÍA Y PESCADERÍA',art:'🥩🐟',category:'meat'},
 {id:'drinks',label:'BEBIDAS',art:'💧🧃',category:'drinks'},
 {id:'bakery',label:'PANADERÍA Y REPOSTERÍA',art:'🥖🧁',category:'bakery'},
 {id:'dairy',label:'LÁCTEOS Y REFRIGERADOS',art:'🥛🧀',category:'dairy'},
 {id:'pantry',label:'ALIMENTOS',art:'🍚🥫',category:'pantry'},
 {id:'care',label:'HIGIENE Y PERFUMERÍA',art:'🧼🧴',category:'care'},
 {id:'home',label:'OTROS (HOGAR)',art:'🏠',category:'other'},
] as const;
export type ShoppingEntrance=typeof SHOPPING_ENTRANCES[number]['id'];
export function shoppingEntrance(name:string,category:ShoppingCategory,explicitHome=false):ShoppingEntrance|undefined{
 const n=shoppingName(name);
 // Read-only regrouping: retain each stored category, price and product identity.
 const foodPasta=/^pasta(?: alimenticia| seca| fresca| rellena| integral| de trigo| sin gluten)?$/.test(n)||/^(?:espaguetis|espagueti|spaghetti|macarrones|tallarines|fideos|lasana|canelones|fusilli|penne|tagliatelle)(?:$| )/.test(n);
 const sweetBakery=/galleta|croissant|magdalena|bolleria|bizcocho|pastel|tarta|reposteria|donut|pastas? de te|confiteria/.test(n);
 if((category==='pantry'||category==='bakery'||category==='other'||category==='frozen')&&foodPasta)return 'pantry';
 if((category==='pantry'||category==='bakery'||category==='other'||category==='frozen')&&sweetBakery)return 'bakery';
 if(category==='frozen'){
  if(/guisant|espinac|menestra|verdura|patata/.test(n))return 'produce';
  if(/merluza|salmon|gamba|calamar|pescado|hamburgues|pollo|nugget/.test(n))return 'protein';
  if(/pizza|helad|polos/.test(n))return 'dairy';
  return undefined;
 }
 if(category==='produce')return 'produce';
 if(category==='meat'||category==='fish')return 'protein';
 if(category==='drinks')return 'drinks';
 if(category==='bakery')return 'bakery';
 if(category==='dairy')return 'dairy';
 if(category==='pantry'){
  if(n==='judias verdes')return 'produce';
  return 'pantry';
 }
 if(category==='care')return 'care';
 if(category==='cleaning')return /papel higienico|panuelos|papel facial/.test(n)?'care':'home';
 if(category==='pets')return 'home';
 if(/panal|toallita/.test(n))return 'care';
 if(/mascota|perros|gatos|papeleria/.test(n)||explicitHome)return 'home';
 return undefined;
}
export const shoppingItemEntrance=(item:ShoppingItem)=>shoppingEntrance(item.name,item.category,item.customCatalog===true);
