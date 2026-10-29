import React, { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { formatISODate, getToday } from "@/lib/time";
import { validNoteDate } from "@/lib/unifiedNotes";
export const noteDateLabel=(value:string)=>validNoteDate(value)?value.split("-").reverse().join("/"):value;
const monthStart=(value:Date)=>{const date=new Date(value);date.setDate(1);return date;};

/** Inline optional date selection: never opens or changes the Calendar screen. */
export function GoNoteDatePicker({value,onChange,disabled=false,light=false,compact=false,clearControl,onPreferredHeight}:{value:string;onChange:(value:string)=>void;disabled?:boolean;light?:boolean;compact?:boolean;clearControl?:React.ReactNode;onPreferredHeight?:(height:number)=>void}){
 const text=light?"#17212b":"#ffffff",secondary=light?"#515d69":"#a1a1aa",today=getToday(),todayISO=formatISODate(today);
 const {fontScale}=useWindowDimensions(),stackedMonth=compact&&fontScale>1.25;
 const [sizes,setSizes]=useState({header:0,weekdays:0,grid:0,footer:0});
 const measure=(part:keyof typeof sizes,height:number)=>setSizes(current=>Math.abs(current[part]-height)<1?current:{...current,[part]:height});
 useEffect(()=>{if(compact&&Object.values(sizes).every(height=>height>0))onPreferredHeight?.(Math.ceil(sizes.header+sizes.weekdays+sizes.grid+sizes.footer+22));},[compact,sizes,onPreferredHeight]);
 const [month,setMonth]=useState(()=>monthStart(validNoteDate(value)?new Date(value+"T12:00:00"):today));
 const [focusToday,setFocusToday]=useState(false),[viewEpoch,setViewEpoch]=useState(0);
 const end=new Date(month);end.setMonth(end.getMonth()+1);end.setDate(0);
 const length=end.getDate(),offset=(month.getDay()+6)%7;
 const move=(delta:number)=>{setFocusToday(false);setMonth(current=>{const next=new Date(current);next.setMonth(next.getMonth()+delta);return Number.isFinite(next.getTime())?next:current;});};
 const shownISO=formatISODate(month).slice(0,7),focusDay=focusToday&&shownISO===todayISO.slice(0,7)?today.getDate():validNoteDate(value)&&value.slice(0,7)===shownISO?Number(value.slice(8)):shownISO===todayISO.slice(0,7)?today.getDate():1;
 const previous=<TouchableOpacity accessibilityRole="button" accessibilityLabel="Mes anterior" disabled={disabled} onPress={()=>move(-1)} style={{width:44,height:44,alignItems:"center",justifyContent:"center"}}><Feather name="chevron-left" size={20} color={text}/></TouchableOpacity>;
 const next=<TouchableOpacity accessibilityRole="button" accessibilityLabel="Mes siguiente" disabled={disabled} onPress={()=>move(1)} style={{width:44,height:44,alignItems:"center",justifyContent:"center"}}><Feather name="chevron-right" size={20} color={text}/></TouchableOpacity>;
 const todayControl=<TouchableOpacity testID="note-date-today" accessibilityRole="button" accessibilityLabel="Volver al mes de hoy" disabled={disabled} onPress={()=>{setFocusToday(true);setViewEpoch(epoch=>epoch+1);setMonth(monthStart(getToday()));}} style={{minWidth:64,minHeight:44,alignItems:"center",justifyContent:"center",borderRadius:12,backgroundColor:"rgba(59,130,246,0.12)"}}><Text style={{color:light?"#1758a6":"#93c5fd",fontSize:13,fontWeight:"700"}}>HOY</Text></TouchableOpacity>;
 const monthTitle=<Text testID="note-date-month" accessibilityRole="header" style={{color:text,fontSize:16,fontWeight:"700",textAlign:"center",...(compact&&!stackedMonth?{flex:1}:{})}}>{month.toLocaleDateString("es-ES",{month:"long",year:"numeric"})}</Text>;
 return <View testID="note-inline-date-picker" style={{flex:1,minHeight:0,gap:compact?4:8}}>
  {compact?<View style={{gap:4}} onLayout={event=>measure("header",event.nativeEvent.layout.height)}>{stackedMonth&&monthTitle}<View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>{previous}{!stackedMonth&&monthTitle}{next}</View></View>:<>{monthTitle}<View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>{previous}{todayControl}{next}</View></>}
  <View testID="note-date-weekdays" style={{flexDirection:"row"}} onLayout={event=>measure("weekdays",event.nativeEvent.layout.height)}>
   {["L","M","X","J","V","S","D"].map((day,i)=><Text key={i} style={{width:"14.2857%",textAlign:"center",color:secondary,fontSize:12}}>{day}</Text>)}
  </View>
  <ScrollView key={shownISO+":"+viewEpoch} testID="note-date-grid" style={{flex:1,minHeight:44}} contentContainerStyle={{flexDirection:"row",flexWrap:"wrap"}} onContentSizeChange={(_width,height)=>measure("grid",height)} contentOffset={{x:0,y:Math.floor((offset+focusDay-1)/7)*44}} bounces={false} alwaysBounceVertical={false} overScrollMode="never" contentInsetAdjustmentBehavior="never" automaticallyAdjustKeyboardInsets={false} keyboardShouldPersistTaps="handled">
   {Array.from({length:offset+length},(_,index)=>{const day=index-offset+1;if(day<1)return <View key={index} style={{width:"14.2857%",height:44}}/>;
    const date=new Date(month);date.setDate(day);const iso=formatISODate(date),isToday=iso===todayISO,selected=iso===value;
    return <TouchableOpacity key={index} testID={"note-date-"+iso} accessibilityRole="button" accessibilityLabel={[noteDateLabel(iso),isToday?"hoy":"",selected?"seleccionada":""].filter(Boolean).join(", ")} accessibilityState={{selected}} disabled={disabled} onPress={()=>onChange(iso)} style={{width:"14.2857%",minHeight:44,alignItems:"center",justifyContent:"center"}}>
     <View testID={isToday?"note-date-today-ring":undefined} style={{width:38,height:38,borderRadius:19,borderWidth:isToday?2:1,borderColor:isToday?"#2563eb":selected?"#16834a":"transparent",backgroundColor:selected?"#d6f1df":isToday?"#eaf3ff":"transparent",alignItems:"center",justifyContent:"center"}}><Text style={{color:isToday||selected?"#17212b":text,fontSize:14}}>{day}</Text>{selected&&<View style={{position:"absolute",bottom:2,width:4,height:4,borderRadius:2,backgroundColor:"#16834a"}}/>}</View>
    </TouchableOpacity>;
   })}
  </ScrollView>
  {compact?<View style={{flexDirection:"row",alignItems:"center",gap:8}} onLayout={event=>measure("footer",event.nativeEvent.layout.height)}>{todayControl}{clearControl}</View>:!!value&&<Text testID="note-date-selection" style={{color:text,fontSize:13,textAlign:"center"}}>{noteDateLabel(value)}</Text>}
 </View>;
}
