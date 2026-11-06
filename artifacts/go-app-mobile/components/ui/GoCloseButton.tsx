import React from "react";
import {StyleSheet,TouchableOpacity,Text,View,type StyleProp,type ViewStyle} from "react-native";
import {Feather} from "@expo/vector-icons";
import {LinearGradient} from "expo-linear-gradient";
export const GO_NAVIGATION_SIZE=64;
type Props={disabled?:boolean;level:"panel"|"container";onPress:()=>void;accessibilityLabel:string;hitSlop?:number;touchSize?:number;appearance?:"default"|"light";style?:StyleProp<ViewStyle>;testID?:string;activeOpacity?:number;onPressIn?:()=>void};
/** Visual equivalents only: the caller's original callback defines every action. */
export function GoCloseButton({level,onPress,accessibilityLabel,disabled=false,hitSlop=2,touchSize=GO_NAVIGATION_SIZE,style,testID,activeOpacity=.75,onPressIn}:Props){
 const size=Math.max(GO_NAVIGATION_SIZE,touchSize),exit=level==="container";
 return <TouchableOpacity testID={testID} onPress={event=>{event?.stopPropagation();onPress();}} onPressIn={onPressIn} disabled={disabled} accessibilityState={{disabled}} accessibilityRole="button" accessibilityLabel={accessibilityLabel} activeOpacity={activeOpacity} hitSlop={Math.min(2,hitSlop)} delayPressIn={0} style={[style,s.button,exit?s.exit:s.back,{width:size,height:size},disabled&&s.disabled]}>
  <LinearGradient pointerEvents="none" colors={exit?["#F84350","#D51326","#A7091A"]:["#FFAF2B","#E57600","#B94C00"]} style={[StyleSheet.absoluteFill,s.surface]}/>
  <View pointerEvents="none" style={s.sheen}/><Feather name={exit?"x":"corner-up-left"} size={32} color="#FFFFFF"/>
  <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={s.label}>{exit?"SALIR":"ATRÁS"}</Text>
 </TouchableOpacity>;
}
GoCloseButton.displayName="GoCloseButton";
const s=StyleSheet.create({button:{flexDirection:"column",paddingVertical:0,paddingHorizontal:0,paddingTop:0,paddingBottom:0,paddingLeft:0,paddingRight:0,borderRadius:17,borderWidth:1.5,alignItems:"center",justifyContent:"center",padding:0,gap:1,flexShrink:0,shadowColor:"#281900",shadowOffset:{width:0,height:3},shadowOpacity:.22,shadowRadius:5,elevation:4},surface:{borderRadius:15},back:{backgroundColor:"#D66500",borderColor:"#FFCA64"},exit:{backgroundColor:"#C61325",borderColor:"#FF7D89"},sheen:{position:"absolute",top:3,left:4,right:4,height:18,borderRadius:12,backgroundColor:"rgba(255,255,255,.18)",borderTopWidth:1,borderTopColor:"rgba(255,255,255,.55)"},label:{color:"#FFFFFF",fontSize:13,fontWeight:"800",lineHeight:16,textAlign:"center",letterSpacing:.2},disabled:{opacity:.45}});