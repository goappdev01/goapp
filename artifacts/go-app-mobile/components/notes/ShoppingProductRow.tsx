import React, { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { shoppingDecimal, shoppingId, shoppingName, shoppingPriceFor, shoppingSubtotal, SHOPPING_UNITS, type ShoppingDocument, type ShoppingItem, type ShoppingOperation } from "@/lib/shoppingNote";

const number=(n:number)=>n.toLocaleString("es-ES",{maximumFractionDigits:3});
const money=(n:number,currency:string)=>n.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})+" "+(currency==="EUR"?"€":currency);
const shortUnit=(unit:string)=>({unidades:"ud",paquetes:"paq",litros:"l"} as Record<string,string>)[unit]||unit;
function productArt(item:ShoppingItem){
  const name=shoppingName(item.name);
  for(const [pattern,art] of [["leche","🥛"],["platano","🍌"],["pan","🥖"],["huevo","🥚"],["salmon","🐟"],["yogur","🥛"],["helado","🍦"],["manzana","🍎"],["tomate","🍅"],["queso","🧀"],["agua","💧"],["zumo","🧃"]] as const)
    if(name.includes(pattern))return art;
  return {produce:"🥕",bakery:"🥖",meat:"🥩",fish:"🐟",dairy:"🥛",frozen:"❄️",pantry:"🛒",drinks:"🧃",care:"🧴",cleaning:"🧽",pets:"🐾",other:"🛒"}[item.category];
}
type Operation=ShoppingOperation extends infer O?O extends ShoppingOperation?Omit<O,"operationId">:never:never;
export function ShoppingProductRow({item,doc,handedness,disabled,onOperation,onEdit,onRoute,onLocation,dragHandle}: {
  item:ShoppingItem;doc:ShoppingDocument;handedness:"left"|"right";disabled:boolean;
  onOperation:(op:Operation)=>Promise<unknown>;onEdit:()=>void;onRoute:()=>void;onLocation:()=>void;dragHandle?:React.ReactNode;
}){
  const price=shoppingPriceFor(item,doc.store),subtotal=shoppingSubtotal(item,doc.store);
  const narrow=useWindowDimensions().width<390;
  const [quantity,setQuantity]=useState(String(item.quantity)),[value,setValue]=useState(price?String(price.price):"");
  const [details,setDetails]=useState(false),[error,setError]=useState("");
  const quantityFocused=useRef(false),priceFocused=useRef(false),saving=useRef(false);
  useEffect(()=>{if(!quantityFocused.current)setQuantity(String(item.quantity));},[item.quantity]);
  useEffect(()=>{if(!priceFocused.current)setValue(price?String(price.price):"");},[price?.id,doc.store]);
  useEffect(()=>{priceFocused.current=false;setValue(price?String(price.price):"");},[doc.store]);
  const apply=(op:Operation)=>{void onOperation(op).catch(e=>setError((e as Error).message));};
  const commit=async(kind:"quantity"|"price")=>{
    if(saving.current)return;const raw=kind==="quantity"?quantity:value;
    if(kind==="price"&&!raw.trim()){priceFocused.current=false;return;}
    try{const n=shoppingDecimal(raw)!;saving.current=true;setError("");
      if(kind==="quantity"&&n!==item.quantity)await onOperation({type:"quantity",id:item.id,value:n});
      if(kind==="price"&&n!==price?.price)await onOperation({type:"price",id:item.id,value:n,unit:price?.purchaseUnit||item.unit,observationId:shoppingId()});
      if(kind==="quantity")quantityFocused.current=false;else priceFocused.current=false;
    }catch(e){setError((e as Error).message);}finally{saving.current=false;}
  };
  const icon=(name:React.ComponentProps<typeof Feather>["name"],label:string,onPress:()=>void,id?:string)=><TouchableOpacity testID={id} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={s.icon}><Feather name={name} size={19} color="#39688f"/></TouchableOpacity>;
  const brand=item.brand??price?.brand,format=item.format??price?.format;
  const step=item.unit==="kg"||item.unit==="litros" ? .1 : 1;
  const changeQuantity=(direction:number)=>{
    try{const next=Number((shoppingDecimal(quantity)!+direction*step).toFixed(3));if(next<=0)return;
      setQuantity(String(next));setError("");apply({type:"quantity",id:item.id,value:next});
    }catch(e){setError((e as Error).message);}
  };
  const quantityControl=<View testID={"shopping-quantity-controls-"+item.id} style={[s.quantityControls,narrow&&s.quantityControlsNarrow]}>
    <TouchableOpacity testID={"shopping-minus-"+item.id} accessibilityRole="button" accessibilityLabel={"Restar cantidad de "+item.name} disabled={disabled} hitSlop={{left:7,right:7}} onPress={()=>changeQuantity(-1)} style={s.step}><Feather name="minus" size={18} color="#0876ca"/></TouchableOpacity>
    <TextInput testID={"shopping-quantity-"+item.id} accessibilityLabel={"Cantidad de "+item.name+" en "+item.unit} value={quantity} keyboardType="decimal-pad" selectTextOnFocus editable={!disabled}
      onFocus={()=>{quantityFocused.current=true;}} onChangeText={setQuantity} onEndEditing={()=>void commit("quantity")} style={s.quantityInput}/>
    <TouchableOpacity testID={"shopping-plus-"+item.id} accessibilityRole="button" accessibilityLabel={"Sumar cantidad de "+item.name} disabled={disabled} hitSlop={{left:7,right:7}} onPress={()=>changeQuantity(1)} style={s.step}><Feather name="plus" size={18} color="#0876ca"/></TouchableOpacity>
  </View>;
  const routeButton=<TouchableOpacity testID={"shopping-ir-"+item.id} accessibilityRole="button" accessibilityLabel={"Ir a "+item.name} disabled={disabled} onPress={onRoute} style={s.ir}><Feather name="navigation" size={20} color="#125caa"/></TouchableOpacity>;
  const boughtButton=<TouchableOpacity testID={"shopping-bought-"+item.id} accessibilityRole="checkbox" accessibilityLabel={"Cogido: "+item.name} accessibilityState={{checked:item.bought,disabled:disabled||!item.selected}} disabled={disabled||!item.selected}
    onPress={()=>apply({type:"bought",id:item.id,value:!item.bought})} style={[s.check,item.bought&&s.checked]}><Feather name="check" size={25} color={item.bought?"#fff":"#31a522"}/></TouchableOpacity>;
  const subtotalLabel=subtotal.amount===undefined?"Sin precio":money(subtotal.amount,subtotal.currency);
  const subtotalText=<Text testID={"shopping-subtotal-"+item.id} accessibilityLabel={"Subtotal de "+item.name+": "+subtotalLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.78} style={s.total}>{subtotal.amount===undefined?"—":subtotalLabel}</Text>;
  return <View testID={"shopping-item-"+item.id} style={[s.card,item.bought&&s.picked,!item.selected&&{opacity:.65}]}>
    <View testID={"shopping-product-main-row-"+item.id} style={[s.mainRow,{flexDirection:handedness==="left"?"row-reverse":"row"}]}>
      <View testID={"shopping-product-info-"+item.id} style={[s.productInfo,narrow&&{flex:1}]}>
        <TouchableOpacity testID={"shopping-details-"+item.id} accessibilityRole="button" accessibilityLabel={"Detalles de "+item.name} onPress={()=>setDetails(v=>!v)} style={s.artwork}><Text style={s.artworkText}>{productArt(item)}</Text></TouchableOpacity>
        <View style={{flex:1,minWidth:0}}>
          <TouchableOpacity testID={"shopping-edit-"+item.id} accessibilityRole="button" accessibilityLabel={"Editar "+item.name} onPress={onEdit}><Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={.8} style={[s.name,item.bought&&s.boughtName]}>{item.name}</Text></TouchableOpacity>
          <View style={s.priceLine}><TextInput testID={"shopping-price-input-"+item.id} accessibilityLabel={"Precio unitario de "+item.name} placeholder="Sin precio" placeholderTextColor="#647b8e" value={value} keyboardType="decimal-pad" editable={!disabled} selectTextOnFocus
            onFocus={()=>{priceFocused.current=true;}} onChangeText={setValue} onEndEditing={()=>void commit("price")} style={s.priceInput}/>
            {(price||value.trim())&&<TouchableOpacity testID={"shopping-price-unit-"+item.id} accessibilityRole="button" accessibilityLabel={"Unidad del precio de "+item.name} disabled={disabled} style={s.priceUnit}
              onPress={()=>Alert.alert("Precio por",item.name,[...SHOPPING_UNITS.map(unit=>({text:unit,onPress:()=>{try{apply({type:"price",id:item.id,value:shoppingDecimal(value)!,unit,observationId:shoppingId()});}catch(e){setError((e as Error).message);}}})),{text:"Cancelar",style:"cancel"}])}><Text numberOfLines={1} style={s.meta}>{price?.currency==="EUR"||!price?"€":price.currency}/{shortUnit(price?.purchaseUnit||item.unit)}</Text></TouchableOpacity>}
          </View>
          {!!brand&&<Text numberOfLines={1} style={s.brand}>{brand}{format?" · "+format:""}</Text>}
        </View>
      </View>
      {!narrow&&<>{quantityControl}{subtotalText}{routeButton}{boughtButton}</>}
      {narrow&&subtotalText}
    </View>
    {narrow&&<View testID={"shopping-product-narrow-controls-"+item.id} style={[s.narrowControls,{flexDirection:handedness==="left"?"row-reverse":"row"}]}>{quantityControl}{routeButton}{boughtButton}</View>}
    {!item.selected&&<Text style={s.meta}>Guardado fuera de esta compra</Text>}
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {details&&<View style={{gap:6}}>
      <View style={[s.row,{flexWrap:"wrap"}]}>
        {icon("star",item.favorite?"Quitar favorito":"Guardar favorito",()=>apply({type:"favorite",id:item.id,value:!item.favorite}),"shopping-favorite-"+item.id)}<Text style={s.meta}>{item.favorite?"Favorito · ":""}{item.usual?"Habitual":"Ocasional"}</Text>
        {icon("map-pin","Anotar pasillo de "+item.name,onLocation,"shopping-location-"+item.id)}
        {icon(item.selected?"archive":"plus",item.selected?"Retirar de esta compra":"Incluir en esta compra",()=>apply({type:"select",id:item.id,value:!item.selected}),"shopping-select-"+item.id)}
        {icon("trash-2","Eliminar producto",()=>Alert.alert("Eliminar producto",`Se eliminarán «${item.name}» y sus precios. Retirarlo de la compra conserva ambos.`,[{text:"Cancelar",style:"cancel"},{text:"ELIMINAR",style:"destructive",onPress:()=>apply({type:"delete",id:item.id,confirmed:true})}]),"shopping-delete-"+item.id)}
        {dragHandle}
      </View>
      {!!item.notes&&<Text style={s.meta}>{item.notes}</Text>}
      {price&&<Text style={s.meta}>{price.store} · precio anotado el {price.observedOn}</Text>}
      {item.prices.map(p=><Text key={p.id} style={s.meta}>{p.observedOn} · {p.store}: {number(p.price)} {p.currency}/{p.purchaseUnit} · {p.brand} {p.format}</Text>)}
    </View>}
  </View>;
}
const s=StyleSheet.create({
  card:{paddingHorizontal:6,paddingVertical:5,gap:5,borderRadius:15,borderWidth:1,borderColor:"#e1e7f0",backgroundColor:"#fff",shadowColor:"#284568",shadowOpacity:.08,shadowRadius:5,shadowOffset:{width:0,height:2}},
  picked:{backgroundColor:"#edf9ee",borderColor:"#8bd17e"},mainRow:{flexDirection:"row",alignItems:"center",gap:4,minHeight:62},narrowControls:{alignItems:"center",justifyContent:"flex-end",gap:8},
  productInfo:{flex:1,minWidth:86,flexDirection:"row",alignItems:"center",gap:4},artwork:{width:40,height:48,alignItems:"center",justifyContent:"center",borderRadius:10,backgroundColor:"#eff7ff"},artworkText:{fontSize:27},
  row:{flexDirection:"row",gap:4,alignItems:"center"},name:{fontSize:14,fontWeight:"700",color:"#1c2f49",lineHeight:17},boughtName:{color:"#396044"},brand:{fontSize:10,color:"#587087"},meta:{fontSize:10,color:"#536a80",flexShrink:1},
  priceLine:{flexDirection:"row",alignItems:"center",minHeight:24},priceInput:{flex:1,minWidth:0,padding:0,fontSize:11,fontWeight:"600",color:"#2d4357",minHeight:27},priceUnit:{minWidth:28,minHeight:28,justifyContent:"center"},
  quantityControls:{width:94,minHeight:44,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderRadius:11,borderWidth:1,borderColor:"#d9e3ed",backgroundColor:"#fff"},quantityControlsNarrow:{width:132},step:{width:30,minHeight:44,alignItems:"center",justifyContent:"center"},quantityInput:{flex:1,minWidth:27,padding:0,textAlign:"center",fontSize:14,fontWeight:"700",color:"#1e344c"},
  total:{width:53,fontSize:12,fontWeight:"700",color:"#21364e",textAlign:"center"},ir:{width:44,minHeight:44,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:"#e4f0ff"},
  check:{width:44,minHeight:44,borderRadius:10,borderWidth:1,borderColor:"#55bc4b",backgroundColor:"#e8f8e5",alignItems:"center",justifyContent:"center"},checked:{backgroundColor:"#34b929",borderColor:"#269f1e"},
  icon:{minWidth:44,minHeight:44,alignItems:"center",justifyContent:"center"},error:{fontSize:12,color:"#a33035"},
});
