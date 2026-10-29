import React from "react";
import { ScrollView, Text, TouchableOpacity, View, type ScrollViewProps, type ViewProps, type ScrollViewInstance, type ViewInstance } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { NoteDestination } from "@/lib/unifiedNotes";

type Focus={entryId:string;highlightEntryId:string|null;registerScroll:(node:ScrollViewInstance|null)=>void;registerCard:(id:string,node:ViewInstance|null)=>void;onCardLayout:ViewProps["onLayout"];onLayout:ScrollViewProps["onLayout"];onContentSizeChange:ScrollViewProps["onContentSizeChange"];onScroll:ScrollViewProps["onScroll"];onScrollBeginDrag:ScrollViewProps["onScrollBeginDrag"]};
/** Its own readable width; day columns and calendar zoom retain their existing sizing. */
export function noteArchiveColumnWidth(viewportWidth:number,fontScale:number,expanded:boolean){
 const available=Math.max(0,viewportWidth-24),heading=Math.ceil(176*Math.min(1.5,Math.max(1,fontScale)));
 return Math.min(available,Math.max(heading,expanded?Math.min(288,Math.round(available*.62)):0));
}
export function GoNoteArchiveColumn({entries,expanded,onToggle,onOpen,onMove,focus}: {entries:GoEntry[];expanded:boolean;onToggle:()=>void;onOpen:(entry:GoEntry)=>void;onMove?:(entry:GoEntry,destination:NoteDestination)=>void;focus?:Focus}) {
 return <View testID="calendar-notes-column" style={{flex:1,minHeight:0,borderWidth:1,borderColor:"#475569",borderRadius:12,overflow:"hidden",backgroundColor:"#111822"}}>
  <TouchableOpacity testID="toggle-notes-column" accessibilityRole="button" accessibilityLabel="NOTAS ARCHIVO" accessibilityState={{expanded}} onPress={onToggle} activeOpacity={0.78} style={{minHeight:72,paddingHorizontal:8,paddingVertical:8,alignItems:"center",justifyContent:"center",gap:6,backgroundColor:"#243044",borderBottomWidth:1,borderBottomColor:"#64748b"}}>
    <Text testID="notes-archive-heading" maxFontSizeMultiplier={1.3} style={{color:"#ffffff",fontSize:13,fontWeight:"800",textAlign:"center"}}>NOTAS ARCHIVO</Text>
    <View style={{flexDirection:"row",alignItems:"center",gap:10}}><Text accessibilityLabel={entries.length+" notas archivadas"} style={{color:"#e2e8f0",fontSize:12}}>{entries.length}</Text><Feather name={expanded?"chevron-left":"chevron-right"} size={16} color="#ffffff"/></View>
  </TouchableOpacity>
  {expanded&&<ScrollView testID="archived-notes-list" accessibilityLabel="Notas archivadas" style={{flex:1,minHeight:0,backgroundColor:"#111822"}} ref={focus?.registerScroll} onLayout={focus?.onLayout} onContentSizeChange={focus?.onContentSizeChange} onScroll={focus?.onScroll} onScrollBeginDrag={focus?.onScrollBeginDrag} scrollEventThrottle={50} contentContainerStyle={{gap:10,padding:8}} keyboardShouldPersistTaps="handled">
    {entries.map(entry=><View key={entry.id} testID={"calendar-archived-note-"+entry.id} collapsable={false} ref={focus?node=>focus.registerCard(entry.id,node):undefined} onLayout={focus?.onCardLayout} style={{borderWidth:focus?.highlightEntryId===entry.id?2:1,borderColor:entry.color||"#7c3aed",borderRadius:10,padding:8,gap:8,backgroundColor:"#1c2635"}}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={"Abrir nota "+entry.notes} onPress={()=>onOpen(entry)} style={{minHeight:44,justifyContent:"center"}}>
        <Text style={{color:"#ffffff",fontWeight:"700",fontSize:13}}>{entry.note?.title||entry.notes||"Nota"}</Text>
        {!!entry.note?.attachments.length&&<Text style={{color:"#a1a1aa",fontSize:11}}>{entry.note.attachments.length} adjuntos</Text>}
      </TouchableOpacity>
      {onMove&&<View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{[["pending","PENDIENTE"],["calendar","PROGRAMAR"]].map(([dest,label])=><TouchableOpacity key={dest} testID={"archive-note-"+dest+"-"+entry.id} accessibilityRole="button" accessibilityLabel={(dest==="pending"?"Pasar a pendientes: ":"Programar: ")+(entry.note?.title||entry.notes||"Nota")} activeOpacity={0.78} onPress={()=>onMove(entry,dest as NoteDestination)} style={{flexGrow:1,flexBasis:100,minWidth:100,minHeight:44,paddingHorizontal:6,paddingVertical:8,alignItems:"center",justifyContent:"center",backgroundColor:dest==="pending"?"#806017":"#23674f",borderWidth:1,borderColor:dest==="pending"?"#a58132":"#3d8b6c",borderRadius:10}}><Text maxFontSizeMultiplier={1.3} style={{color:"#ffffff",fontSize:12,fontWeight:"800",textAlign:"center"}}>{label}</Text></TouchableOpacity>)}</View>}
    </View>)}
  </ScrollView>}
 </View>;
}
