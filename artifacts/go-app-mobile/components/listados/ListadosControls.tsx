import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

/** Native flex measures the available width; only these two labels shrink, never the whole card. */
export function ListEntryHeader({id,title,status,statusColor,followUp,scale=1,lang="es"}: {
  id:string;title:string;status?:string;statusColor?:string;followUp?:"done"|"pending";scale?:number;lang?:string;
}) {
  const followUpLabel=followUp==="done"?(lang==="en"?"DONE":"REALIZADA")
    :followUp==="pending"?(lang==="en"?"PENDING":"PENDIENTE"):(lang==="en"?"Unmarked":"Sin marcar");
  return <View testID={"list-header-"+id} style={{gap:3,marginBottom:4}}>
    <View testID={"list-header-line-"+id} style={{flexDirection:"row",alignItems:"center",flexWrap:"nowrap",gap:8}}>
      <Text testID={"list-title-"+id} accessibilityLabel={title} numberOfLines={1} ellipsizeMode="tail"
        adjustsFontSizeToFit minimumFontScale={0.82} maxFontSizeMultiplier={1.8}
        style={{flex:1,minWidth:0,color:"#ffffff",fontSize:Math.max(14,Math.round(14*scale)),fontWeight:"700"}}>{title}</Text>
      {!!status && <View testID={"list-reservation-status-"+id} style={{flexShrink:1,maxWidth:"55%",minWidth:0,
        paddingHorizontal:5,paddingVertical:3,borderRadius:5,borderWidth:1,borderColor:"rgba(255,255,255,0.14)",backgroundColor:"rgba(255,255,255,0.04)"}}>
        <Text accessibilityLabel={status} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.4}
          style={{color:statusColor||"#ffffff",fontSize:Math.max(11,Math.round(11*scale)),fontWeight:"800",textAlign:"right"}}>{status}</Text>
      </View>}
    </View>
    <Text testID={"list-follow-up-"+id} accessibilityLiveRegion="polite"
      style={{color:"#d6d6dc",fontSize:12,textAlign:"right",alignSelf:"stretch"}}>
      {lang==="en"?"Follow-up: ":"Seguimiento: "}{followUpLabel}
    </Text>
  </View>;
}

type ListSize = "compacto" | "medio" | "grande";
const sizeLabels = (lang:string) => lang === "en"
  ? {compacto:"Small",medio:"Medium",grande:"Large"}
  : {compacto:"Pequeño",medio:"Mediano",grande:"Grande"};

/** Direct access shares the list's existing preference; only disclosure is local. */
export function ListadosSizeControl({lang="es",size,handedness="right",onSelectSize}: {
  lang?:string;size:ListSize;handedness?:"left"|"right";onSelectSize:(size:ListSize)=>void;
}) {
  const [open,setOpen] = useState(false);
  const labels = sizeLabels(lang);
  return <View testID="listados-size-direct" style={{gap:4,marginBottom:4}}>
    {open && <View accessibilityRole="radiogroup" accessibilityLabel={lang==="en"?"Card size":"Tamaño de las fichas"}
      style={{flexDirection:"row",gap:6}}>
      {(["compacto","medio","grande"] as const).map(value => <TouchableOpacity key={value}
        testID={"listados-size-"+value} accessibilityRole="radio" accessibilityLabel={labels[value]}
        accessibilityState={{checked:size===value}} onPress={()=>{onSelectSize(value);setOpen(false);}}
        style={{flex:1,minWidth:0,minHeight:44,paddingHorizontal:6,paddingVertical:8,borderRadius:10,
          borderWidth:size===value?2:1,borderColor:size===value?"#ffffff":"#4A80BD",backgroundColor:"#172738",justifyContent:"center"}}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.6}
          style={{color:"#ffffff",fontWeight:"700",fontSize:13,textAlign:"center"}}>{labels[value]}{size===value?" ✓":""}</Text>
      </TouchableOpacity>)}
    </View>}
    <TouchableOpacity testID="listados-size-toggle" accessibilityRole="button"
      accessibilityLabel={(lang==="en"?"Card size: ":"Tamaño de las fichas: ")+labels[size]}
      accessibilityState={{expanded:open}} onPress={()=>setOpen(value=>!value)}
      style={{alignSelf:handedness==="left"?"flex-start":"flex-end",maxWidth:"100%",minHeight:44,
        paddingHorizontal:12,paddingVertical:8,borderRadius:10,borderWidth:1,borderColor:"#4A80BD",backgroundColor:"#172738",justifyContent:"center"}}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.6}
        style={{color:"#ffffff",fontWeight:"700",fontSize:14}}>{lang==="en"?"Size · ":"Tamaño · "}{labels[size]} {open?"▴":"▾"}</Text>
    </TouchableOpacity>
  </View>;
}

/** Contextual entry into the existing global Tools panel; no new preference or expansion mode. */
export function ListadosTools({lang="es",sortOrder,size,onToggleSort,onCycleSize}: {
  lang?:string;sortOrder:"asc"|"desc";size:"compacto"|"medio"|"grande";onToggleSort:()=>void;onCycleSize:()=>void;
}) {
  const sizeLabel=sizeLabels(lang)[size];
  const style={minHeight:44,padding:12,borderRadius:10,borderWidth:1,borderColor:"#4A80BD",backgroundColor:"#172738",justifyContent:"center" as const};
  return <View testID="listados-tools" style={{padding:14,gap:10,borderRadius:14,backgroundColor:"rgba(74,128,189,0.10)"}}>
    <Text accessibilityRole="header" style={{color:"#ffffff",fontWeight:"800",fontSize:16}}>{lang==="en"?"List tools":"Herramientas de Listados"}</Text>
    <TouchableOpacity testID="listados-sort-tool" accessibilityRole="button" onPress={onToggleSort} style={style}>
      <Text style={{color:"#ffffff",fontSize:15}}>{lang==="en"?"Date order: ":"Orden por fecha: "}{sortOrder==="asc"?(lang==="en"?"Ascending":"Ascendente"):(lang==="en"?"Descending":"Descendente")}</Text>
    </TouchableOpacity>
    <TouchableOpacity testID="listados-size-tool" accessibilityRole="button" onPress={onCycleSize} style={style}>
      <Text style={{color:"#ffffff",fontSize:15}}>{lang==="en"?"Card size: ":"Tamaño de ficha: "}{sizeLabel}</Text>
    </TouchableOpacity>
  </View>;
}
