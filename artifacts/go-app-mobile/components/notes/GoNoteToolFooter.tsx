import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/** A tool can finish by its footer or the editor's single back control. */
export type NoteToolEdit<T> = { changed:boolean; value?:T; error?:string };
export function GoNoteToolFooter({ onSave, onRemove, removeLabel, testID, removeID, disabled=false, handedness="right", besideHandle=true }: {
  onSave:()=>void; onRemove?:()=>void; removeLabel?:string; testID:string; removeID?:string;
  disabled?:boolean; handedness?:"left"|"right"; besideHandle?:boolean;
}) {
  return <View testID={testID+"-footer"} style={[s.row,besideHandle&&(handedness==="left"?{paddingLeft:44}:{paddingRight:44})]}>
    <TouchableOpacity testID={removeID||testID+"-remove"} accessibilityRole="button" accessibilityState={{disabled:disabled||!onRemove}} disabled={disabled||!onRemove} onPress={onRemove} activeOpacity={0.75} style={[s.button,onRemove?s.remove:s.neutral]}>
      <Text maxFontSizeMultiplier={1.3} style={[s.label,onRemove?s.removeText:s.neutralText]}>{removeLabel||"QUITAR"}</Text>
    </TouchableOpacity>
    <TouchableOpacity testID={testID} accessibilityRole="button" accessibilityLabel="Guardar configuración" disabled={disabled} activeOpacity={0.75} onPress={onSave} style={s.save}>
      <Text maxFontSizeMultiplier={1.3} style={s.saveText}>GUARDAR</Text>
    </TouchableOpacity>
  </View>;
}
const geometry={flex:1,flexBasis:0,minWidth:0,minHeight:48,paddingHorizontal:4,paddingVertical:8,borderWidth:1,borderRadius:13,shadowColor:"#2b3d45",shadowOpacity:0.10,shadowRadius:4,shadowOffset:{width:0,height:2},alignItems:"center" as const,justifyContent:"center" as const};
const s=StyleSheet.create({row:{width:"100%",flexDirection:"row",alignItems:"stretch",gap:8,paddingTop:4},button:geometry,save:{...geometry,borderColor:"#7da891",backgroundColor:"#c3e9d3"},label:{fontSize:13,fontWeight:"800",textAlign:"center"},saveText:{color:"#17212b",fontSize:13,fontWeight:"800",textAlign:"center"},remove:{borderColor:"#991b1b",backgroundColor:"#b91c1c"},removeText:{color:"#ffffff"},neutral:{borderColor:"#b6c0c7",backgroundColor:"#e7edf2",shadowOpacity:0},neutralText:{color:"#626e79"}});
