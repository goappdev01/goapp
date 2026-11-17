import type { ShoppingCategory, ShoppingDocument, ShoppingItem, ShoppingUnit } from "./shoppingNote";
import { shoppingName } from "./shoppingNote";

type Group = { orbit:string; label:string; category:ShoppingCategory; products:readonly string[] };
const group=(orbit:string,label:string,category:ShoppingCategory,names:string):Group=>({orbit,label,category,products:names.split("|")});
/** Presentation catalog. Names and order follow the owner's V1 list; no prices or brands. */
export const SHOPPING_CATALOG:readonly Group[]=[
  group("food","Panadería y bollería","bakery","Pan común|Barra de pan|Baguette|Pan integral|Pan de molde|Pan sin gluten|Panecillos|Tostadas|Picos|Croissants|Magdalenas|Galletas|Bollería"),
  group("food","Arroz, pasta y cereales","pantry","Arroz blanco|Arroz integral|Macarrones|Espaguetis|Fideos|Lasaña|Cuscús|Avena|Cereales de desayuno|Harina"),
  group("food","Legumbres","pantry","Lentejas|Garbanzos|Alubias|Judías verdes|Guisantes|Habas|Legumbres cocidas"),
  group("food","Conservas","pantry","Atún en conserva|Sardinas|Mejillones|Tomate triturado|Tomate frito|Maíz|Aceitunas|Espárragos|Pimientos en conserva|Caldos|Sopas"),
  group("food","Aceites, salsas y condimentos","pantry","Aceite de oliva|Aceite de girasol|Vinagre|Sal|Azúcar|Pimienta|Especias|Mayonesa|Kétchup|Mostaza|Salsa de tomate|Miel"),
  group("food","Desayuno y dulces","pantry","Café|Cacao|Infusiones|Mermelada|Crema de cacao|Chocolate|Bizcochos|Frutos secos"),
  group("drinks","Agua","drinks","Agua mineral|Agua con gas"),
  group("drinks","Refrescos","drinks","Coca-Cola|Cola genérica|Refresco de naranja|Refresco de limón|Tónica|Bebida isotónica"),
  group("drinks","Zumos","drinks","Zumo de naranja|Zumo de manzana|Zumo de piña|Zumo multifrutas"),
  group("drinks","Otras","drinks","Bebida de avena|Bebida de soja|Bebida de almendras|Batidos"),
  group("home","Limpieza","cleaning","Detergente de ropa|Suavizante|Lavavajillas|Pastillas de lavavajillas|Limpiador multiusos|Limpiacristales|Limpiador de baño|Lejía|Desengrasante|Limpiador de suelos"),
  group("home","Papel y consumibles","cleaning","Papel higiénico|Papel de cocina|Servilletas|Pañuelos|Bolsas de basura|Film transparente|Papel de aluminio|Papel de horno"),
  group("home","Utensilios","cleaning","Estropajos|Bayetas|Esponjas|Guantes|Bolsas reutilizables|Pilas|Bombillas"),
  group("other","Otros","other","Mascotas|Alimentación para perros|Alimentación para gatos|Arena para gatos|Bebé|Pañales|Toallitas infantiles|Papelería|Productos de temporada|Producto personalizado"),
  group("care","Corporal","care","Gel de ducha|Champú|Acondicionador|Jabón de manos|Desodorante|Crema corporal"),
  group("care","Bucal","care","Pasta de dientes|Cepillo de dientes|Colutorio|Hilo dental"),
  group("care","Personal","care","Papel facial|Compresas|Tampones|Productos de afeitado|Crema facial|Protector solar|Algodón"),
  group("produce","Frutas","produce","Plátanos|Manzanas|Peras|Naranjas|Mandarinas|Limones|Fresas|Uvas|Melón|Sandía|Kiwi|Piña|Melocotones|Aguacates"),
  group("produce","Verduras y hortalizas","produce","Tomates|Lechuga|Zanahorias|Patatas|Cebollas|Ajos|Pimientos|Pepinos|Calabacín|Berenjena|Brócoli|Coliflor|Espinacas|Champiñones"),
  group("produce","Carnicería","meat","Pollo|Pechuga de pollo|Ternera|Carne picada|Cerdo|Lomo|Hamburguesas|Salchichas"),
  group("produce","Charcutería","meat","Jamón cocido|Jamón serrano|Pavo|Chorizo|Salchichón|Bacon"),
  group("produce","Pescadería y marisco","fish","Salmón|Merluza|Bacalao|Dorada|Lubina|Sardinas frescas|Gambas|Mejillones|Calamares"),
  group("produce","Lácteos y huevos","dairy","Leche entera|Leche semidesnatada|Leche desnatada|Leche sin lactosa|Yogur natural|Yogur de sabores|Queso fresco|Queso curado|Queso rallado|Mantequilla|Nata|Huevos"),
  group("frozen","Verduras","frozen","Guisantes|Espinacas|Menestra|Verduras variadas"),
  group("frozen","Pescado y marisco","frozen","Merluza|Salmón|Gambas|Calamares|Varitas de pescado"),
  group("frozen","Carne","frozen","Hamburguesas|Pollo|Croquetas|Nuggets"),
  group("frozen","Preparados","frozen","Pizza|Lasaña|Patatas fritas|Verduras salteadas"),
  group("frozen","Postres","frozen","Helado|Polos|Tartas congeladas"),
];
export function shoppingCatalogGroups(orbit:string,query=""){
  const q=shoppingName(query);
  return SHOPPING_CATALOG.filter(g=>orbit==="search"||g.orbit===orbit)
    .map(g=>({...g,products:q?g.products.filter(name=>shoppingName(name).includes(q)):g.products}))
    .filter(g=>g.products.length);
}
export function shoppingCatalogItem(doc:ShoppingDocument,category:ShoppingCategory,name:string){
  return doc.items.find(item=>item.category===category&&shoppingName(item.name)===shoppingName(name));
}
export function shoppingCatalogUnit(category:ShoppingCategory,name:string):ShoppingUnit{
  if(category==="produce"||category==="meat"||category==="fish")return "kg";
  if(category==="drinks"&&/^(agua|zumo|bebida|refresco|tónica|batidos)/i.test(name))return "litros";
  return "unidades";
}
export function shoppingNeedsDetails(category:ShoppingCategory){return category==="produce"||category==="meat"||category==="fish";}
export function shoppingFavorites(doc:ShoppingDocument):ShoppingItem[]{
  const recency=new Map<string,number>(),frequency=new Map<string,number>();
  doc.purchases?.forEach((p,index)=>p.items.forEach(i=>{recency.set(i.id,index);frequency.set(i.id,(frequency.get(i.id)||0)+1);}));
  return doc.items.filter(i=>i.favorite).sort((a,b)=>(recency.get(b.id)??-1)-(recency.get(a.id)??-1)||(frequency.get(b.id)||0)-(frequency.get(a.id)||0)||a.name.localeCompare(b.name,"es"));
}
