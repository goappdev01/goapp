import React from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";

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

/** The original three-circle control cycles the existing preference in one touch. */
export function ListadosSizeControl({lang="es",size,touchSize=44,onCycleSize}: {
  lang?:string;size:ListSize;touchSize?:number;onCycleSize:()=>void;
}) {
  const diameter=Math.max(44,touchSize),labels=sizeLabels(lang);
  const next=({compacto:"medio",medio:"grande",grande:"compacto"} as const)[size];
  return <Pressable testID="listados-size-direct" accessibilityRole="button"
    accessibilityLabel={(lang==="en"?"Card size: ":"Tamaño de ficha: ")+labels[size]}
    accessibilityHint={(lang==="en"?"Change to ":"Cambiar a ")+labels[next]} onPress={onCycleSize} hitSlop={0}
    style={({pressed})=>({width:diameter,height:diameter,borderRadius:999,flexShrink:0,backgroundColor:"#1a1a1c",
      borderWidth:1.5,borderColor:"rgba(255,255,255,0.35)",alignItems:"center",justifyContent:"center",
      transform:[{scale:pressed?0.95:1}]})}>
    <View style={{flexDirection:"row",alignItems:"center",gap:3}} pointerEvents="none" accessible={false}>
      {(["compacto","medio","grande"] as const).map((value,index)=>{
        const diameter=[5,8,12][index];
        return <View key={value} testID={"listados-size-circle-"+value} style={{width:diameter,height:diameter,
          borderRadius:diameter/2,backgroundColor:"#ffffff",opacity:size===value?1:0.4}}/>;
      })}
    </View>
  </Pressable>;
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
