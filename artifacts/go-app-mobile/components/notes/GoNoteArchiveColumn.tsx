import React from "react";
import { ScrollView, Text, TouchableOpacity, View, type ScrollViewProps, type ViewProps, type ScrollViewInstance, type ViewInstance } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { NoteDestination } from "@/lib/unifiedNotes";

type Focus={entryId:string;highlightEntryId:string|null;registerScroll:(node:ScrollViewInstance|null)=>void;registerCard:(id:string,node:ViewInstance|null)=>void;onCardLayout:ViewProps["onLayout"];onLayout:ScrollViewProps["onLayout"];onContentSizeChange:ScrollViewProps["onContentSizeChange"];onScroll:ScrollViewProps["onScroll"];onScrollBeginDrag:ScrollViewProps["onScrollBeginDrag"]};
export function GoNoteArchiveColumn({entries,expanded,onToggle,onOpen,onMove,focus}: {entries:GoEntry[];expanded:boolean;onToggle:()=>void;onOpen:(entry:GoEntry)=>void;onMove?:(entry:GoEntry,destination:NoteDestination)=>void;focus?:Focus}) {
 return <View testID="calendar-notes-column" style={{flex:1,borderWidth:1,borderColor:"rgba(255,255,255,0.25)",borderRadius:12,overflow:"hidden",backgroundColor:"#111116"}}>
  <TouchableOpacity testID="toggle-notes-column" accessibilityRole="button" accessibilityState={{expanded}} onPress={onToggle} style={{minHeight:60,alignItems:"center",justifyContent:"center",gap:4}}>
    <Text style={{color:"#ffffff",fontSize:expanded?13:10,fontWeight:"800"}}>NOTAS</Text><Text style={{color:"#d4d4d8",fontSize:12}}>{entries.length}</Text><Feather name={expanded?"chevron-left":"chevron-right"} size={16} color="#ffffff"/>
  </TouchableOpacity>
  {expanded&&<ScrollView testID="archived-notes-list" ref={focus?.registerScroll} onLayout={focus?.onLayout} onContentSizeChange={focus?.onContentSizeChange} onScroll={focus?.onScroll} onScrollBeginDrag={focus?.onScrollBeginDrag} scrollEventThrottle={50} contentContainerStyle={{gap:10,padding:8}} keyboardShouldPersistTaps="handled">
    {!entries.length&&<Text style={{color:"#a1a1aa",fontSize:12}}>No hay notas en ARCHIVO.</Text>}
    {entries.map(entry=><View key={entry.id} testID={"calendar-archived-note-"+entry.id} collapsable={false} ref={focus?node=>focus.registerCard(entry.id,node):undefined} onLayout={focus?.onCardLayout} style={{borderWidth:focus?.highlightEntryId===entry.id?2:1,borderColor:entry.color||"#7c3aed",borderRadius:10,padding:8,gap:6}}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={"Abrir nota "+entry.notes} onPress={()=>onOpen(entry)} style={{minHeight:44,justifyContent:"center"}}>
        <Text style={{color:"#ffffff",fontWeight:"700",fontSize:13}}>{entry.note?.title||entry.notes||"Nota"}</Text>
        {!!entry.note?.attachments.length&&<Text style={{color:"#a1a1aa",fontSize:11}}>{entry.note.attachments.length} adjuntos</Text>}
      </TouchableOpacity>
      {onMove&&<View style={{flexDirection:"row",flexWrap:"wrap",gap:4}}>{[["pending","Pendientes"],["calendar","Programar"]].map(([dest,label])=><TouchableOpacity key={dest} accessibilityRole="button" onPress={()=>onMove(entry,dest as NoteDestination)} style={{minHeight:44,padding:6,justifyContent:"center",borderWidth:1,borderColor:"rgba(255,255,255,0.3)",borderRadius:8}}><Text style={{color:"#ffffff",fontSize:11}}>{label}</Text></TouchableOpacity>)}</View>}
    </View>)}
  </ScrollView>}
 </View>;
}
