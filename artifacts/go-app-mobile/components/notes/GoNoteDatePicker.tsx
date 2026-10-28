import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { formatISODate, getToday } from "@/lib/time";

/** Inline optional date selection: never opens or changes the Calendar screen. */
export function GoNoteDatePicker({value,onChange,disabled=false,light=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean;light?:boolean}){
 const text=light?"#17212b":"#ffffff",secondary=light?"#515d69":"#a1a1aa";
 const [month,setMonth]=useState(()=>{const candidate=/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+"T12:00:00"):getToday();const initial=Number.isFinite(candidate.getTime())?candidate:getToday();return new Date(initial.getFullYear(),initial.getMonth(),1);});
 const length=new Date(month.getFullYear(),month.getMonth()+1,0).getDate(),offset=(month.getDay()+6)%7;
 const move=(delta:number)=>setMonth(current=>new Date(current.getFullYear(),current.getMonth()+delta,1));
 return <View testID="note-inline-date-picker" style={{gap:8}}>
  <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mes anterior" disabled={disabled} onPress={()=>move(-1)} style={{width:44,height:44,alignItems:"center",justifyContent:"center"}}><Feather name="chevron-left" size={20} color={text}/></TouchableOpacity>
   <Text style={{color:text,fontSize:14,flexShrink:1}}>{month.toLocaleDateString("es-ES",{month:"long",year:"numeric"})}</Text>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mes siguiente" disabled={disabled} onPress={()=>move(1)} style={{width:44,height:44,alignItems:"center",justifyContent:"center"}}><Feather name="chevron-right" size={20} color={text}/></TouchableOpacity>
  </View>
  <View style={{flexDirection:"row",flexWrap:"wrap"}}>
   {["L","M","X","J","V","S","D"].map((day,i)=><Text key={i} style={{width:"14.2857%",textAlign:"center",color:secondary,fontSize:12}}>{day}</Text>)}
   {Array.from({length:offset+length},(_,index)=>{const day=index-offset+1;if(day<1)return <View key={index} style={{width:"14.2857%",height:44}}/>;
    const iso=formatISODate(new Date(month.getFullYear(),month.getMonth(),day));
    return <TouchableOpacity key={index} testID={"note-date-"+iso} accessibilityRole="button" accessibilityLabel={iso} accessibilityState={{selected:iso===value}} disabled={disabled} onPress={()=>onChange(iso)} style={{width:"14.2857%",minHeight:44,alignItems:"center",justifyContent:"center",borderRadius:8,backgroundColor:iso===value?"rgba(34,197,94,0.2)":"transparent"}}><Text style={{color:text,fontSize:14}}>{day}</Text></TouchableOpacity>;
   })}
  </View>
 </View>;
}
