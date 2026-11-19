import React from "react";
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

/** Contextual entry into the existing global Tools panel; no new preference or expansion mode. */
export function ListadosTools({lang="es",sortOrder,size,onToggleSort,onCycleSize}: {
  lang?:string;sortOrder:"asc"|"desc";size:"compacto"|"medio"|"grande";onToggleSort:()=>void;onCycleSize:()=>void;
}) {
  const sizeLabel=lang==="en"?{compacto:"Small",medio:"Medium",grande:"Large"}[size]
    :{compacto:"Pequeño",medio:"Medio",grande:"Grande"}[size];
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
