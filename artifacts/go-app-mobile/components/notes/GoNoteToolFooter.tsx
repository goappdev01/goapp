import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/** A tool can finish by its footer or the editor's single back control. */
export type NoteToolEdit<T> = { changed:boolean; value?:T; error?:string };
export function GoNoteToolFooter({ onSave, onRemove, removeLabel, testID, removeID, disabled=false, handedness="right", besideHandle=true }: {
  onSave:()=>void; onRemove?:()=>void; removeLabel?:string; testID:string; removeID?:string;
  disabled?:boolean; handedness?:"left"|"right"; besideHandle?:boolean;
}) {
  return <View testID={testID+"-footer"} style={[s.row,{flexDirection:handedness==="left"?"row-reverse":"row",justifyContent:"flex-end",...(besideHandle?handedness==="left"?{paddingLeft:44}:{paddingRight:44}:{})}]}>
    {onRemove&&<TouchableOpacity testID={removeID} accessibilityRole="button" disabled={disabled} onPress={onRemove} style={s.remove}>
      <Text style={s.removeText}>{removeLabel}</Text>
    </TouchableOpacity>}
    <View style={{flex:1}}/>
    <TouchableOpacity testID={testID} accessibilityRole="button" accessibilityLabel="Guardar configuración" disabled={disabled} activeOpacity={0.75} onPress={onSave} style={s.save}>
      <Text style={s.saveText}>GUARDAR</Text>
    </TouchableOpacity>
  </View>;
}
const s=StyleSheet.create({row:{flexDirection:"row",alignItems:"center",gap:8,flexWrap:"wrap",paddingTop:4},save:{minHeight:48,minWidth:104,paddingHorizontal:14,paddingVertical:10,borderWidth:1,borderColor:"#7da891",borderRadius:13,backgroundColor:"#c3e9d3",shadowColor:"#2b3d45",shadowOpacity:0.10,shadowRadius:4,shadowOffset:{width:0,height:2},alignItems:"center",justifyContent:"center"},saveText:{color:"#17212b",fontSize:13,fontWeight:"800",textAlign:"center"},remove:{minHeight:44,maxWidth:"100%",justifyContent:"center",paddingHorizontal:4},removeText:{color:"#8a3d0a",fontSize:12,fontWeight:"600"}});
