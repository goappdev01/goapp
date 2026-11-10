import React, { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { DraggableFAB } from "./DraggableFAB";
import { ContactPlacesPanel, openPlace } from "./contactos/ContactPlacesPanel";
import { coordinateLabel, normalizePlace, type PlaceDraft } from "@/data/contactPlaces";

type Tool = "capture" | "places" | "save";

export function MessageLocationTools({ handedness, bounds, incoming, onIncomingHandled, canSend, recipient, onSend }: {
  handedness: "left" | "right"; bounds: {width:number;height:number}; incoming?: PlaceDraft;
  onIncomingHandled: () => void; canSend: boolean; recipient: string; onSend: (place:PlaceDraft) => Promise<boolean>;
}) {
  const [open,setOpen]=useState(false), [tool,setTool]=useState<Tool>();
  const [preview,setPreview]=useState<PlaceDraft>(), [manual,setManual]=useState("");
  const [notice,setNotice]=useState(""), [busy,setBusy]=useState(false);
  const active=useRef(true), revision=useRef(0), inFlight=useRef(false);
  const press=useRef({dragging:false,suppress:false});
  useEffect(()=>{active.current=true;return()=>{active.current=false;revision.current++;};},[]);
  useEffect(()=>{
    if(incoming){setOpen(true);setTool("save");setPreview(incoming);onIncomingHandled();}
  },[incoming]);
  const close=()=>{revision.current++;setTool(undefined);setPreview(undefined);setNotice("");setBusy(false);setOpen(false);};
  const capture=async()=>{
    const token=++revision.current;
    setOpen(true);setTool("capture");setPreview(undefined);setManual("");setNotice("");setBusy(true);
    try{
      let permission=await Location.getForegroundPermissionsAsync();
      if(token!==revision.current||!active.current)return;
      if(permission.status!=="granted"&&permission.canAskAgain)permission=await Location.requestForegroundPermissionsAsync();
      if(token!==revision.current||!active.current)return;
      if(permission.status!=="granted"){setNotice("Ubicación no autorizada. Puedes indicar una dirección manualmente.");return;}
      const point=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
      if(token!==revision.current||!active.current)return;
      const coordinates={latitude:Number(point.coords.latitude.toFixed(5)),longitude:Number(point.coords.longitude.toFixed(5))};
      setPreview(normalizePlace({title:"Estoy aquí",source:"current",coordinates,approximate:point.coords.accuracy==null||point.coords.accuracy>100}));
    }catch{if(token===revision.current&&active.current)setNotice("No se pudo obtener tu posición. Puedes indicar una dirección.");}
    finally{if(token===revision.current&&active.current)setBusy(false);}
  };
  const choose=(next:Tool)=>{revision.current++;setBusy(false);setPreview(undefined);setNotice("");setTool(next);};
  const confirm=async()=>{
    if(!preview || inFlight.current)return;
    if(!canSend){setNotice("Esta conversación no tiene un canal compartido confirmado. Tu selección se conserva; no se ha enviado.");return;}
    const token=revision.current;
    inFlight.current=true;setBusy(true);setNotice("");
    try{
      if(await onSend(preview)&&active.current&&revision.current===token)close();
    }catch(error){if(active.current&&revision.current===token)setNotice(error instanceof Error?error.message:"No se confirmó el envío.");}
    finally{inFlight.current=false;if(active.current&&revision.current===token)setBusy(false);}
  };
  const action=(label:string, onPress:()=>void, disabled=false)=><TouchableOpacity accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled}
    style={[s.action,disabled&&{opacity:0.45}]} onPress={onPress}><Text style={s.label}>{label}</Text></TouchableOpacity>;
  const side=handedness==="right"?"right":"left";
  return <>
    {open && <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={[s.tools,{[side]:50,maxHeight:Math.max(0,bounds.height-8)}]} contentContainerStyle={{gap:5}} testID="message-location-panel">
      <View style={s.buttons}>
        {action("Estoy aquí",()=>void capture(),inFlight.current)}
        {action("IR",()=>choose("places"),inFlight.current)}
        {action("Guardar ubicación",()=>choose("save"),inFlight.current)}
      </View>
      {tool==="capture" && <View style={s.content}>
        {busy&&!preview && <Text style={s.text}>Consultando tu ubicación…</Text>}
        {preview ? <>
          <Text style={s.text}>{preview.title} · {preview.coordinates ? coordinateLabel(preview.coordinates) : preview.address || "Enlace de Google Maps"}</Text>
          {preview.approximate&&<Text style={s.text}>Ubicación aproximada</Text>}
          <Text style={s.text}>Compartir con {recipient}. Se enviará una sola ubicación.</Text>
          {!canSend&&<Text style={s.text}>Canal compartido sin confirmar. Puedes guardar el lugar en privado.</Text>}
          <View style={s.buttons}>
            {action("Compartir esta ubicación",()=>void confirm(),busy||!canSend)}
            {action("Guardar en contacto GO",()=>setTool("save"),busy)}
            {action("Cancelar",close,busy)}
          </View>
        </> : !busy && <>
          <TextInput accessibilityLabel="Dirección manual" placeholder="Dirección manual" placeholderTextColor="#a1a1aa" style={s.input}
            value={manual} maxLength={240} onChangeText={setManual}/>
          <View style={s.buttons}>{action("Ver destino",()=>{
            try{setPreview(normalizePlace({title:"Lugar indicado",source:"manual",address:manual}));setNotice("");}
            catch(error){setNotice(error instanceof Error?error.message:"Dirección no válida.");}
          },!manual.trim())}{action("Cancelar",close)}</View>
        </>}
        {!!notice&&<Text accessibilityLiveRegion="polite" style={s.text}>{notice}</Text>}
      </View>}
      {(tool==="places"||tool==="save")&&<ContactPlacesPanel key={tool} initial={tool==="save"?(preview??{title:"",source:"manual"}):undefined} onClose={close}
        onShare={place=>{setPreview(place);setTool("capture");}}/>}
    </ScrollView>}
    {bounds.width>=100 && bounds.height>=58&&<DraggableFAB screenKey="messages" buttonKey={"location-tools-"+handedness}
      bounds={bounds} boundsVerticalInset={4} keyboardResponsive buttonWidth={44} maxH={44} initialTop={Math.max(4,bounds.height-122)}
      fixedLeft={handedness==="right"?bounds.width-48:4}
      onDragStart={()=>{press.current={dragging:true,suppress:true};}} onDragEnd={()=>{press.current.dragging=false;}}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Herramientas de ubicación" accessibilityState={{expanded:open}} style={s.toggle}
        onPressIn={()=>{if(!press.current.dragging)press.current.suppress=false;}} onPress={()=>{if(!press.current.suppress){if(open)close();else setOpen(true);}}}>
        <Feather name={(open===(handedness==="right"))?"chevron-right":"chevron-left"} size={20} color="#fff"/>
      </TouchableOpacity>
    </DraggableFAB>}
  </>;
}

export function MessageLocationBubble({ place, mine, onSave }: { place:PlaceDraft; mine:boolean; onSave:()=>void }) {
  return <View style={s.content}>
    <Text style={s.text}>{place.title}</Text>
    <Text style={s.text}>{mine?"Ubicación que compartiste":"Ubicación recibida"} · instantánea{place.approximate?" aproximada":""}</Text>
    <Text style={s.text}>{place.coordinates ? coordinateLabel(place.coordinates) : place.address || "Enlace de Google Maps"}</Text>
    <View style={s.buttons}>
      <TouchableOpacity style={s.action} accessibilityRole="button" onPress={()=>void openPlace(place).catch(()=>Alert.alert("Google Maps","No se pudo abrir el destino."))}><Text style={s.label}>IR</Text></TouchableOpacity>
      <TouchableOpacity style={s.action} accessibilityRole="button" onPress={onSave}><Text style={s.label}>Guardar ubicación</Text></TouchableOpacity>
    </View>
  </View>;
}

const s=StyleSheet.create({
  tools:{position:"absolute",top:4,left:5,right:5,maxWidth:405,zIndex:12,elevation:12,gap:5},
  content:{padding:8,borderRadius:10,backgroundColor:"#202024",gap:7},
  buttons:{flexDirection:"row",flexWrap:"wrap",gap:5},
  action:{minHeight:44,paddingHorizontal:8,borderRadius:8,backgroundColor:"#302e32",justifyContent:"center"},
  toggle:{width:44,height:44,borderRadius:22,backgroundColor:"#29272a",borderColor:"#d4af37",borderWidth:1,alignItems:"center",justifyContent:"center"},
  label:{color:"#fff",fontWeight:"700",fontSize:12},text:{color:"#fff",fontSize:13},
  input:{backgroundColor:"#171719",color:"#fff",borderRadius:8,minHeight:44,padding:8},
});
