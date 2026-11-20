import { isShoppingQuantity, shoppingPresentationPrice, type ShoppingDocument } from "./shoppingNote";

/** Only the active purchase, never history, drafts, account ids or temporary catalog choices. */
export function shoppingShareText(title:string,doc:ShoppingDocument):string{
  const items=doc.items.filter(item=>item.selected);
  return [title,...(items.length?items.map(item=>{
    const price=shoppingPresentationPrice(item,doc.store);
    const brand=item.brand||price?.brand;
    const quantity=item.quantity.toLocaleString("es-ES",{maximumFractionDigits:3});
    return `${item.bought?"✓ Comprado":"☐ Pendiente"} · ${item.name}${brand?" · "+brand:""} × ${quantity} ${item.unit}${isShoppingQuantity(item.quantity)?"":" · Cantidad antigua"}`;
  }):["Lista vacía"])].join("\n");
}
