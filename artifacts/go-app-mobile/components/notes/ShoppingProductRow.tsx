import React, { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { shoppingDecimal, shoppingId, shoppingPriceFor, shoppingSubtotal, SHOPPING_UNITS, type ShoppingDocument, type ShoppingItem, type ShoppingOperation } from "@/lib/shoppingNote";

const number=(n:number)=>n.toLocaleString("es-ES",{maximumFractionDigits:3});
type Operation=ShoppingOperation extends infer O?O extends ShoppingOperation?Omit<O,"operationId">:never:never;
export function ShoppingProductRow({item,doc,handedness,disabled,onOperation,onEdit,onRoute,onLocation,dragHandle}: {
  item:ShoppingItem;doc:ShoppingDocument;handedness:"left"|"right";disabled:boolean;
  onOperation:(op:Operation)=>Promise<unknown>;onEdit:()=>void;onRoute:()=>void;onLocation:()=>void;dragHandle?:React.ReactNode;
}){
  const price=shoppingPriceFor(item,doc.store),subtotal=shoppingSubtotal(item,doc.store);
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
  return <View testID={"shopping-item-"+item.id} style={[s.card,item.bought&&s.picked,!item.selected&&{opacity:.65}]}>
    <View style={[s.row,{alignItems:"stretch",flexDirection:handedness==="left"?"row-reverse":"row"}]}>
      <View style={{flex:1,minWidth:0,gap:2}}>
        <View style={s.row}><Text style={[s.name,item.bought&&{color:"#526a7e"}]}>{item.name}</Text>{icon("edit-2","Editar "+item.name,onEdit,"shopping-edit-"+item.id)}</View>
        {!!brand&&<Text style={s.brand}>{brand}</Text>}
        <Text style={s.meta}>{[!item.selected?"Guardado · fuera de esta compra":"",item.variety,format,item.packageQuantity!==undefined?`${number(item.packageQuantity)} ${item.packageUnit} / ${item.unit==="paquetes"?"paquete":"unidad"}`:item.unit].filter(Boolean).join(" · ")}</Text>
        <View style={[s.row,{flexWrap:"wrap"}]}>
          {icon("minus","Restar cantidad de "+item.name,()=>changeQuantity(-1),"shopping-minus-"+item.id)}
          <TextInput testID={"shopping-quantity-"+item.id} accessibilityLabel={"Cantidad de "+item.name+" en "+item.unit} value={quantity} keyboardType="decimal-pad" selectTextOnFocus editable={!disabled}
            onFocus={()=>{quantityFocused.current=true;}} onChangeText={setQuantity} onEndEditing={()=>void commit("quantity")} style={s.numeric}/>
          {icon("plus","Sumar cantidad de "+item.name,()=>changeQuantity(1),"shopping-plus-"+item.id)}
          <Text style={s.meta}>{item.unit}</Text>
        </View>
      </View>
      <View style={s.actions}>
        <TouchableOpacity testID={"shopping-bought-"+item.id} accessibilityRole="checkbox" accessibilityLabel={"Cogido: "+item.name} accessibilityState={{checked:item.bought,disabled:disabled||!item.selected}} disabled={disabled||!item.selected}
          onPress={()=>apply({type:"bought",id:item.id,value:!item.bought})} style={[s.check,item.bought&&s.checked]}>
          <Feather name={item.bought?"check-square":"square"} size={29} color={item.bought?"#fff":"#376f9e"}/><Text style={[s.checkText,item.bought&&{color:"#fff"}]}>Cogido</Text>
        </TouchableOpacity>
        <TouchableOpacity testID={"shopping-ir-"+item.id} accessibilityRole="button" accessibilityLabel={"Ir a "+item.name} disabled={disabled} onPress={onRoute} style={s.ir}><Text style={s.link}>IR</Text><Feather name="navigation" size={14} color="#477394"/></TouchableOpacity>
      </View>
    </View>
    <View style={[s.row,{flexWrap:"wrap",justifyContent:"space-between"}]}>
      <View style={s.row}><TextInput testID={"shopping-price-input-"+item.id} accessibilityLabel={"Precio unitario de "+item.name} placeholder="Sin precio" value={value} keyboardType="decimal-pad" editable={!disabled} selectTextOnFocus
        onFocus={()=>{priceFocused.current=true;}} onChangeText={setValue} onEndEditing={()=>void commit("price")} style={[s.numeric,{minWidth:85,textAlign:"left"}]}/>
        <TouchableOpacity testID={"shopping-price-unit-"+item.id} accessibilityRole="button" accessibilityLabel={"Unidad del precio de "+item.name} disabled={disabled} style={s.unit}
          onPress={()=>Alert.alert("Precio por",item.name,[...SHOPPING_UNITS.map(unit=>({text:unit,onPress:()=>{try{apply({type:"price",id:item.id,value:shoppingDecimal(value)!,unit,observationId:shoppingId()});}catch(e){setError((e as Error).message);}}})),{text:"Cancelar",style:"cancel"}])}><Text style={s.meta}>{price?.currency||"EUR"}/{price?.purchaseUnit||item.unit}</Text></TouchableOpacity>
      </View>
      <Text testID={"shopping-subtotal-"+item.id} style={s.total}>{subtotal.amount===undefined?"Subtotal pendiente":`${number(subtotal.amount)} ${subtotal.currency}`}</Text>
      {icon(details?"chevron-up":"more-horizontal","Detalles de "+item.name,()=>setDetails(v=>!v),"shopping-details-"+item.id)}
    </View>
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
const s=StyleSheet.create({card:{padding:10,gap:6,borderRadius:14,borderWidth:1,borderColor:"#dee7ef",backgroundColor:"#fff",shadowColor:"#294b69",shadowOpacity:.035,shadowRadius:5,shadowOffset:{width:0,height:2}},picked:{backgroundColor:"#f1f7fc"},row:{flexDirection:"row",gap:4,alignItems:"center"},name:{fontSize:17,fontWeight:"600",color:"#203b52",flex:1},brand:{fontSize:12,fontWeight:"700",color:"#4b6780"},meta:{fontSize:12,color:"#64788a",flexShrink:1},icon:{minWidth:44,minHeight:44,alignItems:"center",justifyContent:"center"},numeric:{minHeight:44,minWidth:54,maxWidth:105,borderWidth:1,borderColor:"#d6e3ee",borderRadius:9,paddingHorizontal:8,color:"#243e56",fontSize:15,textAlign:"center",backgroundColor:"#fff"},actions:{alignItems:"center",justifyContent:"space-between",gap:5,width:66},check:{minWidth:64,minHeight:70,borderRadius:12,backgroundColor:"#eaf3fb",alignItems:"center",justifyContent:"center",gap:4},checked:{backgroundColor:"#477ea9"},checkText:{fontSize:11,fontWeight:"600",color:"#376f9e"},ir:{minHeight:44,minWidth:54,flexDirection:"row",gap:6,alignItems:"center",justifyContent:"center"},link:{fontSize:12,fontWeight:"600",color:"#477394"},unit:{minHeight:44,justifyContent:"center",maxWidth:104},total:{fontSize:13,fontWeight:"600",color:"#2e587b",flexShrink:1},error:{fontSize:12,color:"#a33035"}});
