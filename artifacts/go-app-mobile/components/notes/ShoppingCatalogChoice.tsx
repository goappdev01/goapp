import React, { useMemo, useRef } from "react";
import { PanResponder, Text, TouchableOpacity, View } from "react-native";

export function ShoppingCatalogChoice({name,art,status,checked=false,disabled=false,onChoose,testID}: {name:string;art:string;status:string;checked?:boolean;disabled?:boolean;onChoose:()=>void;testID:string}){
  const latest=useRef({onChoose,disabled,consumed:false});latest.current={...latest.current,onChoose,disabled};
  const gesture=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>!latest.current.disabled&&g.dx>22&&g.dx>Math.abs(g.dy)*1.6,
    onPanResponderGrant:()=>{latest.current.consumed=true;},
    onPanResponderRelease:(_,g)=>{if(!latest.current.disabled&&g.dx>60&&Math.abs(g.dy)<45)latest.current.onChoose();},
  }),[]);
  return <View testID={testID+"-swipe"} {...gesture.panHandlers} onTouchStart={()=>{latest.current.consumed=false;}}>
    <TouchableOpacity testID={testID} accessibilityRole="checkbox" accessibilityState={{checked,disabled}} disabled={disabled} accessibilityLabel={`${name}, ${status}. Preparar para guardar.`}
      onPress={()=>{if(!latest.current.consumed)onChoose();}}
      style={{minHeight:48,flexDirection:"row",alignItems:"center",gap:9,paddingHorizontal:11,paddingVertical:5,backgroundColor:"#fff",borderRadius:12,borderWidth:1,borderColor:"#dce7f2"}}>
      <Text style={{fontSize:23,width:31,textAlign:"center"}}>{art}</Text>
      <Text style={{flex:1,minWidth:0,fontSize:15,fontWeight:"600",color:"#17365f"}}>{name}</Text>
      <Text style={{fontSize:12,fontWeight:"700",color:"#1872b5"}}>{checked?"✓ ":"☐ "}{status}</Text>
    </TouchableOpacity>
  </View>;
}
