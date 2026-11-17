import React, { useMemo, useRef } from "react";
import { PanResponder, Text, TouchableOpacity, View } from "react-native";

export function ShoppingCatalogChoice({name,art,status,onChoose,testID}: {name:string;art:string;status:string;onChoose:()=>void;testID:string}){
  const latest=useRef(onChoose);latest.current=onChoose;
  const gesture=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>g.dx>22&&g.dx>Math.abs(g.dy)*1.6,
    onPanResponderRelease:(_,g)=>{if(g.dx>60&&Math.abs(g.dy)<45)latest.current();},
  }),[]);
  return <View testID={testID+"-swipe"} {...gesture.panHandlers}>
    <TouchableOpacity testID={testID} accessibilityRole="button" accessibilityLabel={`${name}, ${status}. Toca o desliza a la derecha para añadir.`}
      onPress={onChoose}
      style={{minHeight:48,flexDirection:"row",alignItems:"center",gap:9,paddingHorizontal:11,paddingVertical:5,backgroundColor:"#fff",borderRadius:12,borderWidth:1,borderColor:"#dce7f2"}}>
      <Text style={{fontSize:23,width:31,textAlign:"center"}}>{art}</Text>
      <Text style={{flex:1,minWidth:0,fontSize:15,fontWeight:"600",color:"#17365f"}}>{name}</Text>
      <Text style={{fontSize:12,fontWeight:"700",color:"#1872b5"}}>{status}</Text>
    </TouchableOpacity>
  </View>;
}
