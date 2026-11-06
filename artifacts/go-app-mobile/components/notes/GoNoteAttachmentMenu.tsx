import React from "react";
import {View,Text,TouchableOpacity,ScrollView,StyleSheet} from "react-native";

/** The same attachment choices used inside Notes; callers own their private files. */
export function GoNoteAttachmentMenu({onFile,onPhotos,onAddLink,link,renderAction,disabled=false,tray,handedness="right",maxHeight=260}:{
 onFile:()=>void;onPhotos:()=>void;onAddLink?:()=>void;link?:React.ReactNode;
 renderAction?:(label:string,onPress:()=>void)=>React.ReactNode;disabled?:boolean;tray?:boolean;handedness?:"left"|"right";maxHeight?:number;
}){
 const action=renderAction??((label:string,onPress:()=>void)=><TouchableOpacity key={label} accessibilityRole="button" disabled={disabled} onPress={onPress} style={s.choice}><Text style={s.text}>{label}</Text></TouchableOpacity>);
 const choices=<>{link}{onAddLink&&action("Añadir enlace",onAddLink)}{action("PDF o documento",onFile)}{action("Fotografías",onPhotos)}</>;
 return tray?<View testID="note-attachment-menu" style={[s.tray,{maxHeight,width:"56%",[handedness==="right"?"right":"left"]:0}]}><Text style={s.title}>ADJUNTAR</Text><ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:10,padding:10}}>{choices}</ScrollView></View>:choices;
}
const s=StyleSheet.create({tray:{position:"absolute",bottom:8,borderWidth:1,borderColor:"#b2bdc5",borderRadius:20,backgroundColor:"rgba(249,252,251,0.97)",zIndex:5,shadowColor:"#2b3d45",shadowOpacity:0.17,shadowRadius:16,shadowOffset:{width:0,height:6},elevation:5},title:{color:"#17212b",fontSize:13,fontWeight:"700",textAlign:"center",padding:10},choice:{minHeight:44,paddingVertical:8,paddingHorizontal:10,borderWidth:1,borderColor:"#adbac3",borderTopColor:"#ffffff",backgroundColor:"rgba(231,237,242,0.96)",borderRadius:12,justifyContent:"center",shadowColor:"#2b3d45",shadowOpacity:0.13,shadowRadius:5,shadowOffset:{width:0,height:3},elevation:3},text:{color:"#17212b",fontSize:13,textAlign:"center",flexShrink:1}});
