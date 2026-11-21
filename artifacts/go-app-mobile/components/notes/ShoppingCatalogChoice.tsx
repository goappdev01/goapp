import React, { useMemo, useRef } from "react";
import { PanResponder, Text, TouchableOpacity, View } from "react-native";

export function ShoppingCatalogChoice({name,art,status,checked=false,disabled=false,favorite=false,favoriteDisabled=false,onToggleFavorite,onChoose,testID}: {name:string;art:string;status:string;checked?:boolean;disabled?:boolean;favorite?:boolean;favoriteDisabled?:boolean;onToggleFavorite?:()=>void;onChoose:()=>void;testID:string}){
  const latest=useRef({onChoose,disabled,consumed:false,favoriteContact:false});latest.current={...latest.current,onChoose,disabled};
  const gesture=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>!latest.current.disabled&&!latest.current.favoriteContact&&g.dx>22&&g.dx>Math.abs(g.dy)*1.6,
    onPanResponderGrant:()=>{latest.current.consumed=true;},
    onPanResponderRelease:(_,g)=>{if(!latest.current.disabled&&!latest.current.favoriteContact&&g.dx>60&&Math.abs(g.dy)<45)latest.current.onChoose();},
  }),[]);
  const choose=()=>{if(!latest.current.consumed)onChoose();};
  return <View testID={testID+"-swipe"} {...gesture.panHandlers} onTouchStart={()=>{latest.current.consumed=false;}}>
    <View style={{minHeight:48,flexDirection:"row",alignItems:"center",gap:5,paddingHorizontal:9,paddingVertical:3,backgroundColor:"#fff",borderRadius:12,borderWidth:1,borderColor:"#dce7f2"}}>
      <TouchableOpacity testID={testID} accessibilityRole="checkbox" accessibilityState={{checked,disabled}} disabled={disabled} accessibilityLabel={name+", "+status+". Preparar para guardar."}
        onPressIn={()=>{latest.current.favoriteContact=false;}} onPress={choose} style={{flex:1,minWidth:0,minHeight:44,flexDirection:"row",alignItems:"center",gap:7}}>
        <Text style={{fontSize:23,width:31,textAlign:"center"}}>{art}</Text>
        <Text style={{flex:1,minWidth:0,fontSize:15,fontWeight:"600",color:"#17365f"}}>{name}</Text>
      </TouchableOpacity>
      {!!onToggleFavorite&&<View onTouchStart={()=>{latest.current.favoriteContact=true;}}><TouchableOpacity testID={testID+"-favorite"} accessibilityRole="checkbox" accessibilityLabel={"Favorito: "+name} accessibilityState={{checked:favorite,disabled:favoriteDisabled}} disabled={favoriteDisabled}
        onPressIn={()=>{latest.current.favoriteContact=true;}} onPress={()=>{if(!latest.current.consumed)onToggleFavorite();}} style={{width:44,minHeight:44,alignItems:"center",justifyContent:"center"}}><Text allowFontScaling={false} style={{fontSize:26,color:"#FFD600",textShadowColor:"#A66D00",textShadowOffset:{width:0,height:0},textShadowRadius:1}}>{favorite?"★":"☆"}</Text></TouchableOpacity></View>}
      <TouchableOpacity testID={testID+"-select"} accessible={false} disabled={disabled} onPressIn={()=>{latest.current.favoriteContact=false;}} onPress={choose} style={{minHeight:44,justifyContent:"center"}}><Text style={{fontSize:12,fontWeight:"700",color:"#1872b5"}}>{checked?"✓ ":"☐ "}{status}</Text></TouchableOpacity>
    </View>
  </View>;
}
