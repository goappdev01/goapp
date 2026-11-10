import React, { useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, type ScrollViewInstance } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Contacts from "expo-contacts/legacy";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { getAuthenticatedUserId } from "@/data/booking";
import { coordinateLabel, normalizePlace, readCoordinates, readMapsLink, routeForPlace, type PlaceDraft, type SavedPlace } from "@/data/contactPlaces";
import { arrangeContactPlace, deleteContactPlace, favoriteContactPlace, privateContactId, readPlacesContacts, saveContactPlace, type PlacesContact } from "@/data/contactPlacesStore";
import { onSessionChanged } from "@/lib/sessionEvents";

type ContactChoice = Pick<PlacesContact, "id" | "name">;
type Editor = { id?: string; place: PlaceDraft; point: string };

export function openPlace(place: PlaceDraft) {
  const url = routeForPlace(place);
  if (!url) return Promise.reject(Error("El lugar no tiene un destino válido."));
  return Linking.openURL(url);
}

function Action({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled}
    onPress={onPress} style={[s.button, disabled && { opacity: 0.45 }]}><Text style={s.buttonText}>{title}</Text></TouchableOpacity>;
}

export function ContactPlacesPanel({ initial, onShare, onClose }: { initial?: PlaceDraft; onShare?: (place: PlaceDraft) => void; onClose: () => void }) {
  const [owner, setOwner] = useState<string | null>(null);
  const [contacts, setContacts] = useState<PlacesContact[]>([]);
  const [contact, setContact] = useState<ContactChoice>();
  const [manual, setManual] = useState("");
  const [editor, setEditor] = useState<Editor | undefined>(() => initial && {place:initial,point:initial.coordinates ? coordinateLabel(initial.coordinates) : ""});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const live = useRef(false), pending = useRef(false);
  const list = useRef<ScrollViewInstance>(null), listHost = useRef<React.ComponentRef<typeof View>>(null);
  const rowBounds = useRef(new Map<string,{top:number;height:number}>());
  const viewport = useRef({ top:0, height:0, content:0, offset:0 });
  const drag = useRef<{ id:string; y:number } | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const [moving, setMoving] = useState<string>();

  useEffect(() => {
    live.current=true;
    let active=true;
    const close=onSessionChanged(() => { live.current=false;setOwner(null);setContacts([]);setContact(undefined);setEditor(undefined);onClose(); });
    void getAuthenticatedUserId().then(async id => {
      if (!active || !live.current) return;
      if (!id) { setNotice("Inicia sesión para usar tus lugares privados."); return; }
      const saved=await readPlacesContacts(id);
      if (active && live.current) { setOwner(id);setContacts(saved); }
    }).catch(() => { if (active && live.current) setNotice("No se pudo leer tu agenda privada."); });
    return () => { active=false;live.current=false;close();if(timer.current)clearInterval(timer.current); };
  }, []);

  const fail = (error: unknown) => { if (live.current) setNotice(error instanceof Error ? error.message : "No se pudo completar la operación."); };
  const run = async (task: (id:string) => Promise<void>) => {
    if (!owner || pending.current) return;
    pending.current=true;setBusy(true);setNotice("");
    try { if (await getAuthenticatedUserId()!==owner || !live.current) return; await task(owner); }
    catch (error) { fail(error); }
    finally { pending.current=false;if(live.current)setBusy(false); }
  };
  const entries=contacts.find(item=>item.id===contact?.id)?.places ?? [];
  const choose=(choice:ContactChoice) => { setContact(choice);rowBounds.current.clear(); };
  const add=() => setEditor({place:{title:"",source:"manual"},point:""});
  const patch=(next:Partial<PlaceDraft>) => setEditor(value=>value && {...value,place:{...value.place,...next}});
  const open=(place:PlaceDraft) => void openPlace(place).catch(fail);
  const pick = () => void run(async () => {
    const permission=await Contacts.requestPermissionsAsync();
    if (permission.status!=="granted") throw Error("Puedes escribir el nombre de un contacto sin dar acceso a tu agenda.");
    const selected=await Contacts.presentContactPickerAsync();
    if (selected?.id && selected.name && live.current) choose({id:"device:"+selected.id,name:selected.name});
  });
  const paste = () => void run(async () => {
    const value=(await Clipboard.getStringAsync()).trim(), map=readMapsLink(value), point=readCoordinates(value);
    if (!map && !point) throw Error("Copia un enlace válido de Google Maps o un par de coordenadas.");
    if (!live.current) return;
    setEditor(current=>({id:current?.id,point:point?coordinateLabel(point):map?.coordinates?coordinateLabel(map.coordinates):"",
      place:{title:current?.place.title || "",address:map?.address, mapUrl:map?.mapUrl,source:map?"link":"manual"}}));
    if (map && !map.address && !map.coordinates) setNotice("Enlace sin destino verificable. Ponle un nombre o añade una dirección; se conserva el enlace.");
  });
  const save = () => void run(async id => {
    if (!contact || !editor) return;
    const coordinates=readCoordinates(editor.point);
    if (editor.point.trim() && !coordinates) throw Error("Introduce coordenadas válidas, por ejemplo 40.4, -3.7.");
    const saved=await saveContactPlace(id,contact,{...editor.place,coordinates},editor.id);
    if (live.current) { setContacts(saved);setEditor(undefined);setNotice("Lugar guardado en tu agenda privada de este dispositivo."); }
  });
  const mutate = (task:(id:string, contactId:string)=>Promise<PlacesContact[]>) => {
    if (contact) void run(async id => {
      const next=await task(id,contact.id);
      if (live.current) setContacts(next);
    });
  };
  const reorder=(id:string,index:number) => mutate((ownerId,contactId)=>arrangeContactPlace(ownerId,contactId,id,index));

  const endDrag=(commit:boolean) => {
    const active=drag.current;
    if(timer.current)clearInterval(timer.current);
    timer.current=undefined;drag.current=undefined;setMoving(undefined);
    if(!active || !commit)return;
    const position=active.y-viewport.current.top+viewport.current.offset;
    const index=entries.findIndex(place=>{const row=rowBounds.current.get(place.id);return !!row && position<=row.top+row.height;});
    reorder(active.id,index<0?entries.length-1:index);
  };
  const startDrag=(id:string,y:number) => {
    if (pending.current) return;
    if(timer.current)clearInterval(timer.current);
    drag.current={id,y};setMoving(id);
    listHost.current?.measureInWindow((_x,top,_w,height)=>{viewport.current.top=top;viewport.current.height=height;});
    timer.current=setInterval(()=>{
      const active=drag.current,v=viewport.current;
      if(!active)return;
      const direction=active.y<v.top+25?-1:active.y>v.top+v.height-25?1:0;
      if(direction)list.current?.scrollTo({y:Math.max(0,Math.min(v.content-v.height,v.offset+direction*8)),animated:false});
    },32);
  };

  return <View style={s.panel} testID="go-contact-places">
    <View style={s.row}><Text style={s.heading}>Ubicaciones de contacto</Text><Action title="Cerrar" onPress={onClose}/></View>
    <Text style={s.hint}>Agenda privada de esta cuenta en este dispositivo.</Text>
    {owner && !contact && <>
      <ScrollView style={s.contacts} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {contacts.map(item=><Action key={item.id} title={item.places[0]?`${item.name} · ${item.places[0].title}`:item.name} onPress={()=>choose(item)}/>)}
      </ScrollView>
      {Platform.OS!=="web" && <Action title="Elegir en la agenda" onPress={pick} disabled={busy}/>}
      <View style={s.row}>
        <TextInput accessibilityLabel="Nombre del contacto" placeholder="Nombre del contacto privado" placeholderTextColor="#9ca3af" style={[s.input,s.grow]} value={manual} maxLength={100} onChangeText={setManual}/>
        <Action title="Elegir" disabled={!manual.trim()} onPress={()=>choose({id:privateContactId(),name:manual.trim()})}/>
      </View>
    </>}
    {contact && <View style={s.row}><Text style={s.heading}>{contact.name}</Text><Action title="Otro contacto" disabled={busy} onPress={()=>setContact(undefined)}/></View>}
    {contact && !editor && <>
      {entries[0] && <Action title={`IR · ${entries[0].title}`} onPress={()=>open(entries[0])}/>}
      <View ref={listHost} style={s.listHost}>
        <ScrollView ref={list} nestedScrollEnabled keyboardShouldPersistTaps="handled" scrollEnabled={!moving}
          scrollEventThrottle={16} onScroll={event=>{viewport.current.offset=event.nativeEvent.contentOffset.y;}}
          onContentSizeChange={(_,height)=>{viewport.current.content=height;}}>
          {entries.map((place,index)=>{
            const gesture=Gesture.Pan().activateAfterLongPress(500).runOnJS(true)
              .onStart(event=>startDrag(place.id,event.absoluteY))
              .onUpdate(event=>{if(drag.current)drag.current.y=event.absoluteY;})
              .onEnd((_event,success)=>endDrag(success)).onFinalize(()=>{if(drag.current)endDrag(false);});
            return <View key={place.id} onLayout={event=>rowBounds.current.set(place.id,{top:event.nativeEvent.layout.y,height:event.nativeEvent.layout.height})} style={[s.place,moving===place.id && {borderColor:"#d4af37"}]}>
              <GestureDetector gesture={gesture}><View accessible accessibilityLabel={`Mantén pulsado para mover ${place.title}`} style={s.drag}>
                <Text style={s.heading}>{place.title}{index===0?" · PRINCIPAL":""}</Text>
                <Text style={s.hint}>{place.address || (place.coordinates && coordinateLabel(place.coordinates)) || "Enlace de Google Maps"}</Text>
                <Text style={s.hint}>{place.source==="received"?"Lugar recibido · no es ubicación en vivo":"Lugar guardado"}</Text>
              </View></GestureDetector>
              <View style={s.wrap}>
                <Action title="IR" onPress={()=>open(place)}/>
                {onShare && <Action title="Compartir" onPress={()=>onShare(place)}/>}
                <Action title="Editar" onPress={()=>setEditor({id:place.id,place,point:place.coordinates?coordinateLabel(place.coordinates):""})}/>
                <Action title={place.favorite?"Quitar favorito":"Favorito"} onPress={()=>mutate((id,contactId)=>favoriteContactPlace(id,contactId,place.id))}/>
                {index>0 && <Action title="Subir" onPress={()=>reorder(place.id,index-1)}/>}
                {index<entries.length-1 && <Action title="Bajar" onPress={()=>reorder(place.id,index+1)}/>}
                <Action title="Eliminar" onPress={()=>Alert.alert("Eliminar lugar",`¿Eliminar «${place.title}» de tu agenda privada?`,[
                  {text:"Cancelar",style:"cancel"},{text:"Eliminar",style:"destructive",onPress:()=>mutate((id,contactId)=>deleteContactPlace(id,contactId,place.id))}])}/>
              </View>
            </View>;
          })}
        </ScrollView>
      </View>
      <View style={s.wrap}><Action title="Añadir lugar" onPress={add}/><Action title="Pegar enlace" onPress={paste} disabled={busy}/></View>
    </>}
    {editor && <View style={s.editor}>
      <TextInput accessibilityLabel="Nombre del lugar" placeholder="Nombre del lugar" placeholderTextColor="#9ca3af" style={s.input} value={editor.place.title} maxLength={80} onChangeText={title=>patch({title})}/>
      <TextInput accessibilityLabel="Dirección" placeholder="Dirección" placeholderTextColor="#9ca3af" style={s.input} value={editor.place.address||""} maxLength={240} onChangeText={address=>patch({address})}/>
      <TextInput accessibilityLabel="Coordenadas" placeholder="Latitud, longitud (opcional)" placeholderTextColor="#9ca3af" style={s.input} value={editor.point} maxLength={75} onChangeText={point=>setEditor(value=>value && {...value,point})}/>
      <TextInput accessibilityLabel="Enlace de Google Maps" placeholder="Enlace de Google Maps (opcional)" placeholderTextColor="#9ca3af" style={s.input} value={editor.place.mapUrl||""} autoCapitalize="none" maxLength={1800} onChangeText={mapUrl=>setEditor(value=>value && {
        ...value,point:value.place.mapUrl?"":value.point,place:{...value.place,mapUrl,
          address:value.place.mapUrl?undefined:value.place.address,source:mapUrl?"link":"manual"},
      })}/>
      <View style={s.wrap}>
        <Action title="Pegar enlace" onPress={paste} disabled={!owner||busy}/>
        {editor.place.mapUrl && <Action title="Ver en Maps" onPress={()=>{try{open(normalizePlace({...editor.place,title:editor.place.title||"Lugar",coordinates:readCoordinates(editor.point)}));}catch(error){fail(error);}}}/>}
        <Action title="Guardar en contacto GO" disabled={!contact||busy} onPress={save}/>
        <Action title="Cancelar" onPress={()=>setEditor(undefined)}/>
      </View>
    </View>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.hint}>{notice}</Text>}
  </View>;
}

const s=StyleSheet.create({
  panel:{backgroundColor:"#171719",borderColor:"#49433b",borderWidth:1,borderRadius:14,padding:9,gap:6},
  row:{flexDirection:"row",alignItems:"center",gap:6,justifyContent:"space-between"},
  wrap:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:5},
  grow:{flex:1}, heading:{color:"#fff",fontSize:14,fontWeight:"700",flexShrink:1},
  hint:{color:"#d1d5db",fontSize:12,flexShrink:1},
  button:{minHeight:44,justifyContent:"center",alignItems:"center",paddingHorizontal:9,borderRadius:9,backgroundColor:"#333136"},
  buttonText:{color:"#fff",fontWeight:"600",fontSize:12},
  input:{minHeight:44,color:"#fff",paddingHorizontal:9,paddingVertical:7,backgroundColor:"#232329",borderRadius:8},
  contacts:{maxHeight:124}, listHost:{maxHeight:222},
  place:{borderColor:"#383840",borderWidth:1,borderRadius:8,padding:5,marginBottom:5},
  drag:{minHeight:44,justifyContent:"center",gap:3,paddingHorizontal:5},
  editor:{gap:5},
});
