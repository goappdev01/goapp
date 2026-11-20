import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, PanResponder, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { shoppingProductArt } from "@/lib/shoppingProductArt";
import { Feather } from "@expo/vector-icons";
import { isShoppingQuantity, SHOPPING_QUANTITY_ERROR, shoppingDecimal, shoppingId, shoppingPresentationPrice, shoppingQuantity, stepShoppingDraftQuantity, stepShoppingQuantity, type ShoppingDocument, type ShoppingItem, type ShoppingOperation } from "@/lib/shoppingNote";

type Operation=ShoppingOperation extends infer O?O extends ShoppingOperation?Omit<O,"operationId">:never:never;
export function ShoppingProductRow({item,doc,handedness,disabled,onOperation,onEdit,onRoute,onLocation,onRemove,dragHandle,contact}: {
  item:ShoppingItem;doc:ShoppingDocument;handedness:"left"|"right";disabled:boolean;
  onOperation:(op:Operation)=>Promise<unknown>;onEdit:(quantity?:string)=>void;onRoute:()=>void;onLocation:()=>void;onRemove:()=>void;dragHandle?:React.ReactNode;contact?:{consumed:boolean;released:boolean};
}){
  const price=shoppingPresentationPrice(item,doc.store);
  const legacyQuantity=!isShoppingQuantity(item.quantity);
  const [quantity,setQuantity]=useState(String(item.quantity).replace(".",",")),[value,setValue]=useState(price?String(price.price):"");
  const [details,setDetails]=useState(false),[error,setError]=useState("");
  const localContact=useRef({consumed:false,released:false}),swipeContact=contact??localContact.current;
  const swipe=useRef({disabled,item,onOperation,onRemove});swipe.current={disabled,item,onOperation,onRemove};
  const quantityFocused=useRef(false),priceFocused=useRef(false),saving=useRef(false);
  const activation=useRef({dx:0,dy:0});
  const pan=useMemo(()=>{
    const claim=(_:unknown,gesture:{dx:number;dy:number;numberActiveTouches?:number})=>{
      if(swipeContact.consumed||swipe.current.disabled||quantityFocused.current||priceFocused.current||gesture.numberActiveTouches!==undefined&&gesture.numberActiveTouches!==1)return false;
      if(Math.abs(gesture.dx)<=22||Math.abs(gesture.dx)<=Math.abs(gesture.dy)*1.6)return false;
      // RN resets dx/dy when granting the responder. Retain the recognized prefix.
      activation.current={dx:gesture.dx,dy:gesture.dy};return true;
    };
    return PanResponder.create({
      onStartShouldSetPanResponderCapture:()=>{activation.current={dx:0,dy:0};swipeContact.consumed=false;swipeContact.released=false;return false;},
      onMoveShouldSetPanResponderCapture:claim,onMoveShouldSetPanResponder:claim,
      onPanResponderGrant:()=>{swipeContact.consumed=true;},
      onPanResponderTerminationRequest:()=>!swipeContact.consumed,
      onPanResponderTerminate:()=>{swipeContact.released=true;},
      onPanResponderRelease:(_,gesture)=>{
        const dx=activation.current.dx+gesture.dx,dy=activation.current.dy+gesture.dy;
        if(swipeContact.released||swipe.current.disabled||Math.abs(dy)>45||Math.abs(dx)<60||Math.abs(dx)<=Math.abs(dy)*1.6)return;
        swipeContact.released=true;
        if(dx<0)swipe.current.onRemove();
        else void swipe.current.onOperation({type:"bought",id:swipe.current.item.id,value:true}).catch(e=>setError((e as Error).message));
      },
    });
  },[]);
  useEffect(()=>{if(!quantityFocused.current){setQuantity(String(item.quantity).replace(".",","));setError("");}},[item.quantity]);
  useEffect(()=>{if(!priceFocused.current)setValue(price?String(price.price):"");},[price?.id,doc.store]);
  useEffect(()=>{priceFocused.current=false;setValue(price?String(price.price):"");},[doc.store]);
  const apply=(op:Operation)=>{void onOperation(op).catch(e=>setError((e as Error).message));};
  const commit=async(kind:"quantity"|"price")=>{
    if(saving.current)return;const raw=kind==="quantity"?quantity:value;
    if(kind==="price"&&!raw.trim()){priceFocused.current=false;return;}
    if(kind==="quantity"&&(!raw.trim()||raw===String(item.quantity).replace(".",","))){
      quantityFocused.current=false;setQuantity(String(item.quantity).replace(".",","));return;
    }
    try{const n=kind==="quantity"?shoppingQuantity(raw):shoppingDecimal(raw)!;saving.current=true;setError("");
      if(kind==="quantity"&&n!==item.quantity)await onOperation({type:"quantity",id:item.id,value:n});
      if(kind==="price"&&n!==price?.price)await onOperation({type:"price",id:item.id,value:n,unit:item.unit,observationId:shoppingId()});
    }catch(e){setError((e as Error).message);}finally{
      if(kind==="quantity")quantityFocused.current=false;else priceFocused.current=false;
      saving.current=false;
    }
  };
  const icon=(name:React.ComponentProps<typeof Feather>["name"],label:string,onPress:()=>void,id?:string)=><TouchableOpacity testID={id} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={()=>{if(!swipeContact.consumed)onPress();}} style={s.icon}><Feather name={name} size={19} color={name==="trash-2"?"#c52e38":"#39688f"}/></TouchableOpacity>;
  const brand=item.brand??price?.brand;
  const changeQuantity=(direction:-1|1)=>{
    if(legacyQuantity){onEdit(stepShoppingDraftQuantity(quantity||String(item.quantity),direction));return;}
    try{const next=stepShoppingQuantity(quantity,direction);if(next===undefined)return;
      setQuantity(next);setError("");apply({type:"quantity",id:item.id,value:shoppingQuantity(next)});
    }catch(e){setError((e as Error).message);}
  };
  const quantityControl=<View testID={"shopping-quantity-controls-"+item.id} style={s.quantityControls}>
    <TouchableOpacity testID={"shopping-minus-"+item.id} accessibilityRole="button" accessibilityLabel={"Restar cantidad de "+item.name} disabled={disabled} hitSlop={{left:7,right:7}} onPress={()=>{if(!swipeContact.consumed)changeQuantity(-1);}} style={s.step}><Feather name="minus" size={18} color="#0876ca"/></TouchableOpacity>
    {legacyQuantity?<TouchableOpacity testID={"shopping-quantity-"+item.id} accessibilityRole="button"
      accessibilityLabel={`Corregir cantidad de ${item.name}: ${quantity}`} disabled={disabled} onPress={()=>{if(!swipeContact.consumed)onEdit();}} style={s.legacyQuantity}>
      <Text numberOfLines={1} style={s.quantityInput}>{quantity}</Text>
    </TouchableOpacity>:<TextInput testID={"shopping-quantity-"+item.id} accessibilityLabel={"Cantidad de "+item.name} value={quantity} keyboardType="number-pad" selectTextOnFocus editable={!disabled}
      onFocus={()=>{quantityFocused.current=true;}} onChangeText={text=>{if(/^\d*$/.test(text)){setQuantity(text);setError("");}else setError(SHOPPING_QUANTITY_ERROR);}} onEndEditing={()=>void commit("quantity")} style={s.quantityInput}/>}
    <TouchableOpacity testID={"shopping-plus-"+item.id} accessibilityRole="button" accessibilityLabel={"Sumar cantidad de "+item.name} disabled={disabled} hitSlop={{left:7,right:7}} onPress={()=>{if(!swipeContact.consumed)changeQuantity(1);}} style={s.step}><Feather name="plus" size={18} color="#0876ca"/></TouchableOpacity>
  </View>;
  const routeButton=<TouchableOpacity testID={"shopping-ir-"+item.id} accessibilityRole="button" accessibilityLabel={"Ir a "+item.name} disabled={disabled} onPress={()=>{if(!swipeContact.consumed)onRoute();}} style={s.ir}><Feather name="navigation" size={20} color="#125caa"/></TouchableOpacity>;
  const boughtButton=<TouchableOpacity testID={"shopping-bought-"+item.id} accessibilityRole="checkbox" accessibilityLabel={"Cogido: "+item.name} accessibilityState={{checked:item.bought,disabled:disabled||!item.selected}} disabled={disabled||!item.selected}
    onPress={()=>{if(!swipeContact.consumed)apply({type:"bought",id:item.id,value:!item.bought});}} style={[s.check,item.bought&&s.checked]}><Feather name="check" size={24} color={item.bought?"#fff":"#64748b"}/></TouchableOpacity>;
  return <View testID={"shopping-item-"+item.id} onTouchStart={()=>{swipeContact.consumed=false;swipeContact.released=false;}} {...pan.panHandlers} style={[s.card,item.bought&&s.picked,!item.selected&&{opacity:.65}]}>
    <View testID={"shopping-product-info-"+item.id} style={s.productInfo}>
      <TouchableOpacity testID={"shopping-details-"+item.id} accessibilityRole="button" accessibilityLabel={"Editar "+item.name} accessibilityHint="Mantener pulsado muestra más acciones" onPress={()=>{if(!swipeContact.consumed)onEdit();}} onLongPress={()=>setDetails(v=>!v)} style={s.artwork}><Text style={s.artworkText}>{shoppingProductArt(item.name).art}</Text></TouchableOpacity>
      <View style={{flex:1,minWidth:0}}>
      <TouchableOpacity testID={"shopping-edit-"+item.id} accessibilityRole="button" accessibilityLabel={"Editar "+item.name} onPress={()=>onEdit()}>
        <Text lineBreakStrategyIOS="standard" style={[s.name,item.bought&&s.boughtName]}>{item.name}</Text>
      </TouchableOpacity>
      {!!brand&&<Text numberOfLines={1} style={s.brand}>{brand}</Text>}
    </View>
      {icon("trash-2","Retirar "+item.name+" de esta lista",onRemove,"shopping-trash-"+item.id)}
    </View>
    <View testID={"shopping-product-main-row-"+item.id} style={[s.mainRow,{flexDirection:handedness==="left"?"row-reverse":"row"}]}>
      <View style={s.priceBlock}>
          <View style={s.priceLine}><TextInput testID={"shopping-price-input-"+item.id} accessibilityLabel={"Precio unitario de "+item.name} placeholder="Sin precio" placeholderTextColor="#647b8e" value={value} keyboardType="decimal-pad" editable={!disabled} selectTextOnFocus
            onFocus={()=>{priceFocused.current=true;}} onChangeText={setValue} onEndEditing={()=>void commit("price")} style={[s.priceInput,!value.trim()&&s.missingPrice]}/>
            {(price||value.trim())&&<Text style={s.meta}>{price?.currency==="EUR"||!price?"€":price.currency}</Text>}
          </View>

      </View>
      {quantityControl}{routeButton}{boughtButton}
    </View>
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
    </View>}
  </View>;
}
const s=StyleSheet.create({
  card:{paddingHorizontal:6,paddingVertical:5,gap:5,borderRadius:15,borderWidth:1,borderColor:"#e1e7f0",backgroundColor:"#fff",shadowColor:"#284568",shadowOpacity:.08,shadowRadius:5,shadowOffset:{width:0,height:2}},
  picked:{backgroundColor:"#edf9ee",borderColor:"#8bd17e"},mainRow:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:4,minHeight:44},
  productInfo:{paddingHorizontal:4,flexDirection:"row",alignItems:"center",gap:6},artwork:{width:40,height:44,alignItems:"center",justifyContent:"center",borderRadius:10,backgroundColor:"#eff7ff"},artworkText:{fontSize:26},
  row:{flexDirection:"row",gap:4,alignItems:"center"},name:{fontSize:18,fontWeight:"800",color:"#1c2f49"},boughtName:{color:"#396044"},brand:{fontSize:10,color:"#587087"},meta:{fontSize:10,color:"#536a80",flexShrink:1},
  priceBlock:{flex:1,minWidth:88,justifyContent:"center",borderWidth:1,borderColor:"#b9cadd",borderRadius:11,backgroundColor:"#f6faff",paddingHorizontal:4},
  priceLine:{flexDirection:"row",alignItems:"center",justifyContent:"center",minHeight:44},priceInput:{flex:1,minWidth:0,padding:0,textAlign:"center",fontSize:20,fontWeight:"700",color:"#2d4357",minHeight:44},
  missingPrice:{fontSize:13,fontWeight:"400",color:"#647b8e"},
  quantityControls:{width:94,minHeight:44,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderRadius:11,borderWidth:1,borderColor:"#d9e3ed",backgroundColor:"#fff"},step:{width:30,minHeight:44,alignItems:"center",justifyContent:"center"},quantityInput:{flex:1,minWidth:27,padding:0,textAlign:"center",fontSize:14,fontWeight:"700",color:"#1e344c"},legacyQuantity:{flex:1,minHeight:44,justifyContent:"center"},
  total:{fontSize:12,fontWeight:"700",color:"#21364e"},ir:{width:44,minHeight:44,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:"#e4f0ff"},
  check:{width:44,minHeight:44,borderRadius:10,borderWidth:1,borderColor:"#a5b5c6",backgroundColor:"#f1f5f9",alignItems:"center",justifyContent:"center"},checked:{backgroundColor:"#217a34",borderColor:"#1d6a2e"},
  icon:{minWidth:44,minHeight:44,alignItems:"center",justifyContent:"center"},error:{fontSize:12,color:"#a33035"},
  removeAction:{minHeight:44,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,borderRadius:10,backgroundColor:"#fff4f4",borderWidth:1,borderColor:"#e9b1b8"},removeText:{fontSize:13,fontWeight:"700",color:"#a12b37"},
});
