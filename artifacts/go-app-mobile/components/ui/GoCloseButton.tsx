import React from "react";
import {StyleSheet,TouchableOpacity,useColorScheme,type StyleProp,type ViewStyle} from "react-native";
import {Feather} from "@expo/vector-icons";
import {useNavigationOpacity} from "./goNavigationAppearance";
export const GO_NAVIGATION_SIZE=64;
type Props={disabled?:boolean;level:"panel"|"container"|"settings";onPress:()=>void;accessibilityLabel:string;hitSlop?:number;touchSize?:number;preserveTouchSize?:boolean;appearance?:"default"|"light";style?:StyleProp<ViewStyle>;testID?:string;activeOpacity?:number;onPressIn?:()=>void};
/** Visual equivalents only: the caller's original callback defines every action. */
export function GoCloseButton({level,onPress,accessibilityLabel,disabled=false,hitSlop=2,touchSize=GO_NAVIGATION_SIZE,preserveTouchSize=false,style,testID,activeOpacity=.75,onPressIn,appearance}:Props){
 const size=Math.max(preserveTouchSize?44:GO_NAVIGATION_SIZE,touchSize),exit=level==="container";
 const opacity=useNavigationOpacity(),scheme=useColorScheme?.(),light=appearance==="light"||scheme==="light";
 return <TouchableOpacity testID={testID} onPress={event=>{event?.stopPropagation();onPress();}} onPressIn={onPressIn} disabled={disabled} accessibilityState={{disabled}} accessibilityRole="button" accessibilityLabel={accessibilityLabel} activeOpacity={activeOpacity} hitSlop={Math.min(2,hitSlop)} delayPressIn={0} style={[style,s.button,{backgroundColor:light?`rgba(215,221,226,${opacity/100})`:`rgba(60,68,78,${opacity/100})`,borderColor:light?"rgba(40,50,60,.28)":"rgba(235,241,246,.35)"},{width:size,height:size},disabled&&s.disabled]}>
  <Feather name={level==="settings"?"settings":exit?"x":"arrow-left"} size={30} color={light?"#17212B":"#FFFFFF"} style={{textShadowColor:light?"rgba(255,255,255,.95)":"rgba(0,0,0,.95)",textShadowOffset:{width:0,height:0},textShadowRadius:2}}/>
 </TouchableOpacity>;
}
GoCloseButton.displayName="GoCloseButton";
const s=StyleSheet.create({button:{flexDirection:"column",paddingVertical:0,paddingHorizontal:0,paddingTop:0,paddingBottom:0,paddingLeft:0,paddingRight:0,borderRadius:21,borderWidth:1,alignItems:"center",justifyContent:"center",padding:0,flexShrink:0,shadowColor:"#18202A",shadowOffset:{width:0,height:2},shadowOpacity:.16,shadowRadius:5,elevation:3},disabled:{opacity:.45}});
