import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
export const financeStyles = StyleSheet.create({
 root:{flex:1,backgroundColor:"#0D0E11"}, content:{padding:16,paddingBottom:110,gap:14}, card:{backgroundColor:"#1A1B1F",borderRadius:14,padding:14,gap:10,borderWidth:1,borderColor:"#34363C"},
 activityRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:10},
 nav:{flexDirection:"row",flexWrap:"wrap",gap:8}, navCard:{width:"31%",flexGrow:1,minHeight:66,borderWidth:1,borderColor:"#34363C",borderRadius:14,padding:10,gap:6,backgroundColor:"#1A1B1F"},navLabel:{color:"#F4F5F7",fontSize:12,fontWeight:"700"},
 planBar:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:12}, pill:{color:"#B8DEC6",fontSize:12},
 footer:{backgroundColor:"#1A1B1F",paddingTop:10,paddingBottom:12,paddingLeft:16,paddingRight:84,gap:8,borderTopWidth:1,borderTopColor:"#34363C"},
 metricGrid:{flexDirection:"row",flexWrap:"wrap",gap:10},metric:{width:"47%",flexGrow:1,padding:14,borderRadius:14,backgroundColor:"#1A1B1F",gap:7},metricValue:{fontSize:21,fontWeight:"800",color:"#F4F5F7",fontVariant:["tabular-nums"]},
 empty:{padding:20,borderRadius:16,backgroundColor:"#1A1B1F",gap:12}, sectionLink:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#34363C"},
 title:{fontSize:20,fontWeight:"800",color:"#fff"}, heading:{fontSize:16,fontWeight:"700",color:"#fff"}, text:{color:"#D8DBE2",fontSize:14}, note:{color:"#ACB4C2",fontSize:12},
 row:{flexDirection:"row",flexWrap:"wrap",gap:8,alignItems:"center"}, input:{color:"#fff",backgroundColor:"#252831",borderWidth:1,borderColor:"#646D7F",borderRadius:8,padding:10,minHeight:44},
 label:{color:"#CFD7E7",fontSize:12,marginBottom:4}, button:{borderRadius:9,borderWidth:1,borderColor:"#69778F",paddingVertical:10,paddingHorizontal:13,minHeight:44,justifyContent:"center"},
 selected:{backgroundColor:"#273E35",borderColor:"#59BA83"}, error:{color:"#FFB3AC",padding:8}, calculated:{color:"#B8DEC6",fontVariant:["tabular-nums"]},
 cell:{width:165,padding:9,borderBottomWidth:1,borderColor:"#30333A",color:"#DCE2EC",fontSize:12}, check:{color:"#A5E2B9",fontSize:17},
});
export function FinanceButton({label,onPress,selected=false,disabled=false}:{label:string;onPress:()=>void;selected?:boolean;disabled?:boolean}) {
 return <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled,selected}} disabled={disabled} onPress={onPress} style={[financeStyles.button,selected&&financeStyles.selected,disabled&&{opacity:0.4}]}><Text style={financeStyles.text}>{label}</Text></TouchableOpacity>;
}
export function FinanceField({label,value,onChange,placeholder,multiline=false,disabled=false}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;multiline?:boolean;disabled?:boolean}) {
 return <View style={{minWidth:155,flexGrow:1}}><Text style={financeStyles.label}>{label}</Text><TextInput accessibilityLabel={label} editable={!disabled} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#808999" multiline={multiline} style={[financeStyles.input,multiline&&{minHeight:100}]}/></View>;
}
export function FinanceNumber({label,value,onChange,placeholder,disabled=false}:{label:string;value:number|null;onChange:(v:number|null)=>void;placeholder?:string;disabled?:boolean}) {
 const [draft,setDraft]=useState(value===null?"":String(value));
 useEffect(()=>{if(!Number.isNaN(value))setDraft(value===null?"":String(value));},[value]);
 return <View style={{minWidth:155,flexGrow:1}}><Text style={financeStyles.label}>{label}</Text><TextInput accessibilityLabel={label} editable={!disabled} value={draft} onChangeText={text=>{setDraft(text);const normalized=text.trim().replace(",",".");if(!normalized)onChange(null);else if(/^-?\d+(?:\.\d*)?$/.test(normalized))onChange(Number(normalized));else onChange(Number.NaN);}} placeholder={placeholder||"Sin dato"} placeholderTextColor="#808999" keyboardType="numbers-and-punctuation" style={financeStyles.input}/></View>;
}
export function FinanceTable({headers,rows}:{headers:string[];rows:(string|number)[][]}) {
 return <ScrollView horizontal><View><View style={{flexDirection:"row"}}>{headers.map((h,i)=><Text key={i} style={[financeStyles.cell,{fontWeight:"800",color:"#fff"}]}>{h}</Text>)}</View>{rows.map((row,i)=><View key={i} style={{flexDirection:"row"}}>{row.map((cell,j)=><Text key={j} selectable style={[financeStyles.cell,financeStyles.calculated]}>{cell}</Text>)}</View>)}</View></ScrollView>;
}
export const financialMoney=(value:number|null|undefined,currency:string)=>value===null||value===undefined?"Sin dato":new Intl.NumberFormat("es-ES",{style:"currency",currency}).format(value);
export const financialCount=(value:number|null|undefined)=>value===null||value===undefined?"Sin dato":new Intl.NumberFormat("es-ES",{maximumFractionDigits:2}).format(value);

export function FinanceChoice({label,value,options,onChange,disabled=false}:{label:string;value:string;options:{value:string;label:string}[];onChange:(value:string)=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false);const selected=options.find(item=>item.value===value);
 return <View style={{flexGrow:1,minWidth:135,gap:6}}><Text style={financeStyles.label}>{label}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{expanded:open,disabled}} disabled={disabled} onPress={()=>setOpen(v=>!v)} style={financeStyles.input}><Text style={financeStyles.text}>{selected?.label||"Seleccionar"} ▾</Text></TouchableOpacity>{open&&<ScrollView nestedScrollEnabled style={{maxHeight:225,borderRadius:10,backgroundColor:"#252831"}} keyboardShouldPersistTaps="handled">{options.map(item=><TouchableOpacity key={item.value} accessibilityRole="button" accessibilityState={{selected:item.value===value}} onPress={()=>{onChange(item.value);setOpen(false);}} style={{padding:13}}><Text style={financeStyles.text}>{item.label}</Text></TouchableOpacity>)}</ScrollView>}</View>;
}
