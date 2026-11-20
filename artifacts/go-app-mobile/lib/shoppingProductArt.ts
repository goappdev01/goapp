import { shoppingName } from "./shoppingNote";

// Product terms, never category inheritance. Longer/specific terms take priority.
// A package is explicitly neutral when there is no reliable product drawing.
const drawings:readonly [RegExp,string][]=[
  [/\b(papel|panal|toallita|servilleta|film|aluminio|bolsa|detergente|suavizante|limpi|lejia|desengrasante|pastillas de lavavajillas|colutorio|hilo dental|compresa|tampon|afeitado|algodon)/,"📦"],
  [/\b(zumo|jugo|batido|bebida de|refresco|cola |coca.cola|tonica|isotonica)/,"🧃"],
  [/\b(mermelada|conserva|tomate frito|tomate triturado|salsa|mayonesa|ketchup|mostaza|crema de cacao)/,"🥫"],
  [/\b(pasta de dientes|cepillo de dientes)/,"🪥"], [/\b(jabon|gel de ducha)/,"🧼"],
  [/\b(champu|acondicionador|desodorante|crema corporal|crema facial|protector solar)/,"🧴"],
  [/\b(croissant)/,"🥐"], [/\b(galleta)/,"🍪"], [/\b(magdalena)/,"🧁"],
  [/\b(tarta|bizcocho)/,"🍰"], [/\b(helado|polos)/,"🍦"], [/\b(chocolate|cacao)/,"🍫"],
  [/\b(pan|barra de pan|baguette|panecillo|tostada|picos)/,"🥖"],
  [/\b(platano|banana)/,"🍌"], [/\b(manzana)/,"🍎"], [/\b(pera)/,"🍐"],
  [/\b(naranja|mandarina)/,"🍊"], [/\b(limon)/,"🍋"], [/\b(fresa)/,"🍓"],
  [/\b(uva)/,"🍇"], [/\b(sandia)/,"🍉"], [/\b(melon)/,"🍈"], [/\b(kiwi)/,"🥝"],
  [/\b(pina)/,"🍍"], [/\b(melocoton)/,"🍑"], [/\b(aguacate)/,"🥑"],
  [/\b(zanahoria)/,"🥕"], [/\b(tomate)/,"🍅"], [/\b(patata)/,"🥔"],
  [/\b(cebolla)/,"🧅"], [/\b(ajo)/,"🧄"], [/\b(pepino)/,"🥒"],
  [/\b(berenjena)/,"🍆"], [/\b(brocoli)/,"🥦"], [/\b(champinon)/,"🍄"],
  [/\b(lechuga|espinaca)/,"🥬"], [/\b(pimiento)/,"🫑"], [/\b(maiz)/,"🌽"],
  [/\b(aceituna)/,"🫒"], [/\b(guisante|judias verdes|habas)/,"🫛"],
  [/\b(garbanzo|alubia|lenteja)/,"🫘"],
  [/\b(huevo)/,"🥚"], [/\b(queso)/,"🧀"], [/\b(mantequilla)/,"🧈"],
  [/\b(yogur|yogurt|yoghurt)/,"🥣"], [/\b(leche)/,"🥛"],
  [/\b(hamburguesa)/,"🍔"], [/\b(salchicha)/,"🌭"], [/\b(pollo|pechuga|pavo)/,"🍗"],
  [/\b(ternera|cerdo|lomo|carne|jamon)/,"🥩"], [/\b(bacon)/,"🥓"],
  [/\b(gamba)/,"🦐"], [/\b(calamares)/,"🦑"],
  [/\b(salmon|merluza|bacalao|dorada|lubina|sardina|atun|pescado)/,"🐟"],
  [/\b(arroz)/,"🍚"], [/\b(macarron|espagueti|fideo|lasana|pasta)/,"🍝"],
  [/\b(pizza)/,"🍕"], [/\b(caldo|sopa)/,"🍲"], [/\b(cereal|avena)/,"🥣"],
  [/\b(cafe)/,"☕"], [/\b(infusion|te)/,"🍵"], [/\b(miel)/,"🍯"],
  [/\b(sal)\b/,"🧂"], [/\b(frutos secos)/,"🥜"],
  [/\b(agua)/,"💧"], [/\b(vino)/,"🍷"], [/\b(cerveza)/,"🍺"],
  [/\b(esponja|estropajo)/,"🧽"], [/\b(guante)/,"🧤"],
  [/\b(pila)/,"🔋"], [/\b(bombilla)/,"💡"],
];
export function shoppingProductArt(name:string):{art:string; specific:boolean}{
  const normalized=shoppingName(name);
  const match=drawings.find(([pattern])=>pattern.test(normalized));
  return {art:match?.[1]||"📦",specific:!!match&&match[1]!=="📦"};
}
