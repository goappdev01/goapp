import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, type TextStyle } from "react-native";
export const financeStyles = StyleSheet.create({
 root:{flex:1,backgroundColor:"#F7F8FA"}, content:{padding:16,paddingBottom:110,gap:12}, card:{backgroundColor:"#FFFFFF",borderRadius:16,padding:16,gap:10,borderWidth:1,borderColor:"#E2E6EB"},
 activityRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:10},
 nav:{flexDirection:"row",flexWrap:"wrap",gap:8}, navCard:{flexBasis:"47%",flexGrow:1,minHeight:54,flexDirection:"row",alignItems:"center",borderWidth:1,borderColor:"#E2E6EB",borderRadius:13,paddingHorizontal:10,paddingVertical:12,gap:6,backgroundColor:"#FFFFFF"},navLabel:{flex:1,color:"#232A35",fontSize:12.5,fontWeight:"600"},
 planBar:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:12}, pill:{color:"#34445D",fontSize:12},
 footer:{backgroundColor:"#FFFFFF",paddingTop:10,paddingBottom:12,paddingLeft:16,paddingRight:84,gap:8,borderTopWidth:1,borderTopColor:"#E2E6EB"},
 metricGrid:{flexDirection:"row",flexWrap:"wrap",gap:10},metric:{width:"47%",flexGrow:1,padding:14,borderRadius:14,backgroundColor:"#FFFFFF",gap:7},metricValue:{fontSize:21,fontWeight:"800",color:"#171B22",fontVariant:["tabular-nums"]},
 empty:{padding:20,borderRadius:16,backgroundColor:"#FFFFFF",gap:12}, sectionLink:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#E2E6EB"},
 title:{fontSize:18,fontWeight:"800",color:"#171B22"}, heading:{fontSize:16,fontWeight:"700",color:"#171B22"}, text:{color:"#232A35",fontSize:14}, note:{color:"#626A77",fontSize:12},
 row:{flexDirection:"row",flexWrap:"wrap",gap:8,alignItems:"center"}, input:{color:"#171B22",backgroundColor:"#F6F7F9",borderWidth:1,borderColor:"#CBD1DA",borderRadius:8,padding:10,minHeight:44},
 label:{color:"#505A69",fontSize:12,marginBottom:4}, button:{borderRadius:9,borderWidth:1,borderColor:"#CAD1DC",paddingVertical:10,paddingHorizontal:13,minHeight:44,maxWidth:"100%",justifyContent:"center",backgroundColor:"#FFFFFF"},
 selected:{backgroundColor:"#EDF1F7",borderColor:"#8195B3"}, error:{color:"#A33436",padding:8}, calculated:{color:"#34445D",fontVariant:["tabular-nums"]},
 cell:{width:165,padding:9,borderBottomWidth:1,borderColor:"#E6E9EF",color:"#344052",fontSize:12}, check:{color:"#465E80",fontSize:17},
});
export function FinanceButton({label,onPress,selected=false,disabled=false}:{label:string;onPress:()=>void;selected?:boolean;disabled?:boolean}) {
 return <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled,selected}} disabled={disabled} onPress={onPress} style={[financeStyles.button,selected&&financeStyles.selected,disabled&&{opacity:0.4}]}><Text style={financeStyles.text}>{label}</Text></TouchableOpacity>;
}
export function FinanceField({label,value,onChange,placeholder,multiline=false,disabled=false}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;multiline?:boolean;disabled?:boolean}) {
 return <View style={{minWidth:155,flexGrow:1}}><Text style={financeStyles.label}>{label}</Text><TextInput accessibilityLabel={label} editable={!disabled} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#747D8C" multiline={multiline} style={[financeStyles.input,multiline&&{minHeight:100}]}/></View>;
}
export function FinanceNumber({label,value,onChange,placeholder,disabled=false,compact=false}:{label:string;value:number|null;onChange:(v:number|null)=>void;placeholder?:string;disabled?:boolean;compact?:boolean}) {
 const [draft,setDraft]=useState(value===null?"":String(value));
 useEffect(()=>{if(!Number.isNaN(value))setDraft(value===null?"":String(value));},[value]);
 return <View style={compact?{minWidth:0,flex:1}:{minWidth:155,flexGrow:1}}>{!compact&&<Text style={financeStyles.label}>{label}</Text>}<TextInput accessibilityLabel={label} editable={!disabled} value={draft} onChangeText={text=>{setDraft(text);const normalized=text.trim().replace(",",".");if(!normalized)onChange(null);else if(/^-?\d+(?:\.\d*)?$/.test(normalized))onChange(Number(normalized));else onChange(Number.NaN);}} placeholder={placeholder||"Sin dato"} placeholderTextColor="#747D8C" keyboardType="numbers-and-punctuation" style={[financeStyles.input,compact&&{fontSize:17,fontWeight:"500"}]}/></View>;
}
export function FinanceTable({headers,rows,valueStyle}:{headers:string[];rows:(string|number)[][];valueStyle?:TextStyle}) {
 return <ScrollView horizontal><View><View style={{flexDirection:"row"}}>{headers.map((h,i)=><Text key={i} style={[financeStyles.cell,{fontWeight:"800",color:"#171B22"}]}>{h}</Text>)}</View>{rows.map((row,i)=><View key={i} style={{flexDirection:"row"}}>{row.map((cell,j)=><Text key={j} selectable numberOfLines={valueStyle&&j>0?1:undefined} adjustsFontSizeToFit={!!valueStyle&&j>0} minimumFontScale={0.75} style={[financeStyles.cell,financeStyles.calculated,j>0&&cell!=="Sin dato"&&valueStyle]}>{cell}</Text>)}</View>)}</View></ScrollView>;
}
export const financialMoney=(value:number|null|undefined,currency:string,fractionDigits?:number)=>value===null||value===undefined?"Sin dato":new Intl.NumberFormat("es-ES",{style:"currency",currency,...(fractionDigits===undefined?{}:{minimumFractionDigits:fractionDigits,maximumFractionDigits:fractionDigits})}).format(value);
export const financialCount=(value:number|null|undefined)=>value===null||value===undefined?"Sin dato":new Intl.NumberFormat("es-ES",{maximumFractionDigits:2}).format(value);

export function FinanceChoice({label,value,options,onChange,disabled=false}:{label:string;value:string;options:{value:string;label:string}[];onChange:(value:string)=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false);const selected=options.find(item=>item.value===value);
 return <View style={{flexGrow:1,minWidth:135,gap:6}}><Text style={financeStyles.label}>{label}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{expanded:open,disabled}} disabled={disabled} onPress={()=>setOpen(v=>!v)} style={financeStyles.input}><Text style={financeStyles.text}>{selected?.label||"Seleccionar"} ▾</Text></TouchableOpacity>{open&&<ScrollView nestedScrollEnabled style={{maxHeight:225,borderRadius:10,backgroundColor:"#F6F7F9"}} keyboardShouldPersistTaps="handled">{options.map(item=><TouchableOpacity key={item.value} accessibilityRole="button" accessibilityState={{selected:item.value===value}} onPress={()=>{onChange(item.value);setOpen(false);}} style={{padding:13}}><Text style={financeStyles.text}>{item.label}</Text></TouchableOpacity>)}</ScrollView>}</View>;
}
