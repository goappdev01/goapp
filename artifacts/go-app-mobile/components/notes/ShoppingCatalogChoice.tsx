import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, Text, TouchableOpacity, View } from "react-native";

type Props={name:string;art:string;status:string;checked?:boolean;disabled?:boolean;favorite?:boolean;favoriteDisabled?:boolean;
  quantity?:number;onStepQuantity?:(direction:-1|1)=>void;onToggleFavorite?:()=>void;onChoose:()=>void;testID:string};

export function ShoppingCatalogChoice({name,art,status,checked=false,disabled=false,favorite=false,favoriteDisabled=false,quantity,onStepQuantity,onToggleFavorite,onChoose,testID}:Props){
  const latest=useRef({onChoose,disabled,consumed:false,childContact:false});latest.current={...latest.current,onChoose,disabled};
  const wasChecked=useRef(checked),[highlight,setHighlight]=useState(false);
  useEffect(()=>{
    const selectedNow=checked&&!wasChecked.current;wasChecked.current=checked;
    if(!selectedNow){setHighlight(false);return;}
    let active=true;let timer:ReturnType<typeof setTimeout>|undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced=>{
      if(!active||reduced)return;
      setHighlight(true);timer=setTimeout(()=>{if(active)setHighlight(false);},220);
    }).catch(()=>{});
    return ()=>{active=false;if(timer)clearTimeout(timer);};
  },[checked]);
  const gesture=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>!latest.current.disabled&&!latest.current.childContact&&g.dx>22&&g.dx>Math.abs(g.dy)*1.6,
    onPanResponderGrant:()=>{latest.current.consumed=true;},
    onPanResponderRelease:(_,g)=>{if(!latest.current.disabled&&!latest.current.childContact&&g.dx>60&&Math.abs(g.dy)<45)latest.current.onChoose();},
  }),[]);
  const choose=()=>{if(!latest.current.consumed)onChoose();};
  const hasQuantity=checked&&!disabled&&quantity!==undefined&&!!onStepQuantity;
  return <View testID={testID+"-swipe"} {...gesture.panHandlers} onTouchStart={()=>{latest.current.consumed=false;latest.current.childContact=false;}}>
    <View style={{minHeight:48,paddingHorizontal:9,paddingVertical:3,backgroundColor:highlight?"#d6f3df":checked?"#f1fbf4":"#fff",borderRadius:12,borderWidth:1,borderColor:checked?"#63ba81":"#dce7f2"}}>
      <View style={{minHeight:44,flexDirection:"row",alignItems:"center",gap:5}}>
        <TouchableOpacity testID={testID} accessibilityRole="checkbox" accessibilityState={{checked,disabled}} disabled={disabled} accessibilityLabel={name+", "+status+(hasQuantity?", cantidad "+quantity:"")}
          onPressIn={()=>{latest.current.childContact=false;}} onPress={choose} style={{flex:1,minWidth:0,minHeight:44,flexDirection:"row",alignItems:"center",gap:7}}>
          <Text style={{fontSize:23,width:31,textAlign:"center"}}>{art}</Text>
          <Text style={{flex:1,minWidth:0,fontSize:15,fontWeight:"600",color:"#17365f"}}>{name}</Text>
        </TouchableOpacity>
        {!!onToggleFavorite&&<View onTouchStart={()=>{latest.current.childContact=true;}}><TouchableOpacity testID={testID+"-favorite"} accessibilityRole="checkbox" accessibilityLabel={"Favorito: "+name} accessibilityState={{checked:favorite,disabled:favoriteDisabled}} disabled={favoriteDisabled}
          onPressIn={()=>{latest.current.childContact=true;}} onPress={()=>{if(!latest.current.consumed)onToggleFavorite();}} style={{width:44,minHeight:44,alignItems:"center",justifyContent:"center"}}><Text allowFontScaling={false} style={{fontSize:26,color:"#FFD600",textShadowColor:"#A66D00",textShadowOffset:{width:0,height:0},textShadowRadius:1}}>{favorite?"★":"☆"}</Text></TouchableOpacity></View>}
        <TouchableOpacity testID={testID+"-select"} accessible={false} disabled={disabled} onPressIn={()=>{latest.current.childContact=false;}} onPress={choose} style={{minHeight:44,justifyContent:"center"}}><Text style={{fontSize:12,fontWeight:"700",color:checked?"#137b3a":"#1872b5"}}>{checked?"✓ ":"☐ "}{status}</Text></TouchableOpacity>
      </View>
      {hasQuantity&&<View testID={testID+"-quantity"} onTouchStart={()=>{latest.current.childContact=true;}} style={{flexDirection:"row",alignItems:"center",justifyContent:"flex-end",gap:5,paddingTop:2}}>
        <Text style={{fontSize:12,color:"#266447",marginRight:4}}>Cantidad</Text>
        <TouchableOpacity testID={testID+"-minus"} accessibilityRole="button" accessibilityLabel={"Reducir cantidad de "+name} accessibilityState={{disabled:quantity<=1}} disabled={quantity<=1} onPressIn={()=>{latest.current.childContact=true;}} onPress={()=>onStepQuantity?.(-1)} style={{width:44,minHeight:44,alignItems:"center",justifyContent:"center"}}><Text style={{fontSize:22,color:quantity<=1?"#729884":"#137b3a"}}>−</Text></TouchableOpacity>
        <Text testID={testID+"-quantity-value"} accessibilityLabel={"Cantidad "+quantity} style={{minWidth:28,textAlign:"center",fontSize:17,fontWeight:"700",color:"#17365f"}}>{quantity}</Text>
        <TouchableOpacity testID={testID+"-plus"} accessibilityRole="button" accessibilityLabel={"Aumentar cantidad de "+name} accessibilityState={{disabled:quantity>=1e9}} disabled={quantity>=1e9} onPressIn={()=>{latest.current.childContact=true;}} onPress={()=>onStepQuantity?.(1)} style={{width:44,minHeight:44,alignItems:"center",justifyContent:"center"}}><Text style={{fontSize:22,color:quantity>=1e9?"#729884":"#137b3a"}}>+</Text></TouchableOpacity>
      </View>}
    </View>
  </View>;
}
