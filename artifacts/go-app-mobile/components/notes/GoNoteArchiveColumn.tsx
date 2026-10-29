import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View, type ScrollViewProps, type ViewProps, type ScrollViewInstance, type ViewInstance } from "react-native";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { NoteDestination } from "@/lib/unifiedNotes";
import { goCalendarColumnHeaderStyles as header } from "../ui/goCalendarColumnStyles";
import { GO_PENDING_YELLOW } from "../../constants/colors";

type Focus={entryId:string;highlightEntryId:string|null;registerScroll:(node:ScrollViewInstance|null)=>void;registerCard:(id:string,node:ViewInstance|null)=>void;onCardLayout:ViewProps["onLayout"];onLayout:ScrollViewProps["onLayout"];onContentSizeChange:ScrollViewProps["onContentSizeChange"];onScroll:ScrollViewProps["onScroll"];onScrollBeginDrag:ScrollViewProps["onScrollBeginDrag"]};
export function GoNoteArchiveColumn({entries,expanded,onToggle,onOpen,onMove,focus,compact=false,headerHeight,titleFont=13,dateFont=10,dropActive=false}: {entries:GoEntry[];expanded:boolean;onToggle:()=>void;onOpen:(entry:GoEntry)=>void;onMove?:(entry:GoEntry,destination:NoteDestination)=>void;focus?:Focus;compact?:boolean;headerHeight?:number;titleFont?:number;dateFont?:number;dropActive?:boolean}) {
 const [titleLines,setTitleLines]=useState(1);
 return <View testID="calendar-notes-column" style={{flex:1,minHeight:0,overflow:"hidden",backgroundColor:"#111822"}}>
  <View testID="notes-archive-header" style={[header.colHeader,compact&&header.compactColHeader,{backgroundColor:dropActive?"#163c2d":"#243044",borderBottomColor:dropActive?"#22c55e":"#64748b"},headerHeight?{height:headerHeight}:undefined]}>
   <TouchableOpacity testID="toggle-notes-column" accessibilityRole="button" accessibilityLabel={dropActive?"NOTAS ARCHIVO. Soltar para archivar":"NOTAS ARCHIVO"} accessibilityState={{expanded}} onPress={onToggle} activeOpacity={0.78} style={[header.colHeaderContent,compact&&header.compactColHeaderContent,{justifyContent:"center",minHeight:compact?44:undefined}]}>
    <Text testID="notes-archive-heading" maxFontSizeMultiplier={1.3} onTextLayout={event=>{const count=event.nativeEvent.lines.length;setTitleLines(previous=>previous===count?previous:count);}} style={[header.colHeaderDayName,{fontSize:titleFont,width:"100%",paddingHorizontal:16}]} numberOfLines={2}>NOTAS ARCHIVO</Text>
    {titleLines===1&&<Text style={[header.colHeaderDayDate,{fontSize:dateFont,opacity:0}]} aria-hidden> </Text>}
   </TouchableOpacity>
   <View testID="notes-archive-count" style={[header.colCountBadge,{position:"absolute",right:5,top:5}]}><Text accessibilityLabel={entries.length+" notas archivadas"} style={header.colCount}>{entries.length}</Text></View>
  </View>
  {expanded&&<ScrollView testID="archived-notes-list" accessibilityLabel="Notas archivadas" style={{flex:1,minHeight:0,backgroundColor:"#111822"}} ref={focus?.registerScroll} onLayout={focus?.onLayout} onContentSizeChange={focus?.onContentSizeChange} onScroll={focus?.onScroll} onScrollBeginDrag={focus?.onScrollBeginDrag} scrollEventThrottle={50} contentContainerStyle={{gap:10,padding:8}} keyboardShouldPersistTaps="handled">
    {entries.map(entry=><View key={entry.id} testID={"calendar-archived-note-"+entry.id} collapsable={false} ref={focus?node=>focus.registerCard(entry.id,node):undefined} onLayout={focus?.onCardLayout} style={{borderWidth:focus?.highlightEntryId===entry.id?2:1,borderColor:entry.color||"#7c3aed",borderRadius:10,padding:8,gap:8,backgroundColor:"#1c2635"}}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={"Abrir nota "+entry.notes} onPress={()=>onOpen(entry)} style={{minHeight:44,justifyContent:"center"}}>
        <Text style={{color:"#ffffff",fontWeight:"700",fontSize:13}}>{entry.note?.title||entry.notes||"Nota"}</Text>
        {!!entry.note?.attachments.length&&<Text style={{color:"#a1a1aa",fontSize:11}}>{entry.note.attachments.length} adjuntos</Text>}
      </TouchableOpacity>
      {onMove&&<View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{[["pending","PENDIENTE"],["calendar","PROGRAMAR"]].map(([dest,label])=><TouchableOpacity key={dest} testID={"archive-note-"+dest+"-"+entry.id} accessibilityRole="button" accessibilityLabel={(dest==="pending"?"Pasar a pendientes: ":"Programar: ")+(entry.note?.title||entry.notes||"Nota")} activeOpacity={0.78} onPress={()=>onMove(entry,dest as NoteDestination)} style={{flexGrow:1,flexBasis:100,minWidth:100,minHeight:44,paddingHorizontal:6,paddingVertical:8,alignItems:"center",justifyContent:"center",backgroundColor:dest==="pending"?GO_PENDING_YELLOW:"#23674f",borderWidth:1,borderColor:dest==="pending"?GO_PENDING_YELLOW:"#3d8b6c",borderRadius:10}}><Text maxFontSizeMultiplier={1.3} style={{color:"#ffffff",fontSize:12,fontWeight:"900",textAlign:"center",...(dest==="pending"?{textShadowColor:"#3b3000",textShadowOffset:{width:0,height:1},textShadowRadius:2}:{})}}>{label}</Text></TouchableOpacity>)}</View>}
    </View>)}
  </ScrollView>}
 </View>;
}
