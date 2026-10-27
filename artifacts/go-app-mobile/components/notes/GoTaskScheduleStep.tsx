import React, { useEffect, useRef, useState } from "react";
import { Keyboard, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import { GoScreenCloseGuide, GoScreenCloseSurface } from "@/components/ui/GoScreenCloseSurface";

/** Exact-time input for notes/tasks only; Calendar's own clock is unchanged. */
export function GoTaskScheduleStep({ step, dateLabel, time, duration, handedness, onTime, onDuration, onDurationDraft, onDate, onBack }: {
  step: "clock" | "ampm" | "duration"; dateLabel: string; time: string; duration: string;
  handedness: "left" | "right"; onTime: (time: string) => void; onDuration: (duration: string) => void;
  onDurationDraft: (duration: string) => void;
  onDate: () => void; onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const locked = useRef(false);
  const edited = useRef(false);
  const [pending, setPending] = useState(false);
  const [hour, setHour] = useState(time.split(":")[0] || "00"), [minute, setMinute] = useState(time.split(":")[1] || "00");
  const [selected, setSelected] = useState(duration || "30m"), [error, setError] = useState("");
  useEffect(() => { if (time) { setHour(time.split(":")[0]); setMinute(time.split(":")[1]); } }, [time]);
  const clock = step !== "duration";
  const exact = `${String(Number(hour)).padStart(2,"0")}:${String(Number(minute)).padStart(2,"0")}`;
  const valid = /^\d{1,2}$/.test(hour) && /^\d{1,2}$/.test(minute) && Number(hour) <= 23 && Number(minute) <= 59;
  const back = () => { if (locked.current) return; if (clock && edited.current && valid) onTime(exact); onBack(); };
  const date = () => { if (locked.current) return; if (clock && edited.current && valid) onTime(exact); onDate(); };
  return <GoScreenCloseSurface testID="note-schedule-step" handedness={handedness} onClose={back} enabled={!pending} scrollRefs={[scroll]}
    style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 190,
      backgroundColor: "#0e0e10" }}>
    <KeyboardAvoidingView behavior="height" style={{flex:1,paddingTop:insets.top+16,paddingBottom:Math.max(insets.bottom,12),paddingHorizontal:18}}>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24, gap: 18,
      ...(handedness === "left" ? { paddingLeft: 62 } : { paddingRight: 62 }) }}>
      <Text style={{ color: "#ffffff", fontSize: 20, fontWeight: "800" }}>{clock ? "HORA" : "DURACIÓN"}</Text>
      <Text style={{ color: "#ffffff", fontSize: 14 }}>{dateLabel}{time ? ` · ${time}` : ""}</Text>
      {clock ? <>
        <View style={{ flexDirection: "row", gap: 16 }}>
          {[["HORAS (00–23)",hour,setHour,"note-hour"],["MINUTOS (00–59)",minute,setMinute,"note-minute"]].map(([label,value,setter,id]) =>
            <View key={id as string} style={{ flex: 1, gap: 8 }}>
              <Text style={{ color: "#ffffff", fontSize: 13 }}>{label as string}</Text>
              <TextInput testID={id as string} accessibilityLabel={label as string} value={value as string}
                onChangeText={value => { edited.current = true; (setter as (value: string) => void)(value); }} keyboardType="number-pad" maxLength={2} selectTextOnFocus
                style={{ minHeight: 64, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)", borderRadius: 12,
                  color: "#ffffff", fontSize: 30, textAlign: "center" }} />
            </View>)}
        </View>
        <Text testID="note-exact-time" style={{ color: "#ffffff", fontSize: 28, textAlign: "center" }}>{exact}</Text>
      </> : <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {[["15m","15 minutos"],["30m","30 minutos"],["1h","1 hora"],["2h","2 horas"]].map(([value,label]) =>
          <TouchableOpacity key={value} testID={"note-duration-"+value} accessibilityRole="radio" accessibilityState={{checked:selected===value}}
            onPress={()=>{setSelected(value);onDurationDraft(value);}} style={{ minHeight: 52, minWidth: 120, flexGrow: 1, alignItems: "center", justifyContent: "center", borderRadius: 12,
              borderWidth: 1.5, borderColor: selected===value?"#6ee7b7":"rgba(255,255,255,0.35)", backgroundColor:selected===value?"rgba(110,231,183,0.15)":"transparent" }}>
            <Text style={{color:"#ffffff",fontSize:16}}>{label}</Text>
          </TouchableOpacity>)}
      </View>}
      {!!error&&<Text accessibilityRole="alert" style={{color:"#fbbf24"}}>{error}</Text>}
      <TouchableOpacity testID="note-schedule-continue" accessibilityRole="button" disabled={pending} onPress={()=>{
        if(locked.current)return;
        if(clock && !valid){setError("Introduce una hora entre 00:00 y 23:59.");return;}
        locked.current=true;setPending(true);
        if(clock){Keyboard.dismiss();onTime(exact);}
        else onDuration(selected);
      }} style={{minHeight:48,borderRadius:12,backgroundColor:"#6ee7b7",alignItems:"center",justifyContent:"center"}}>
        <Text style={{color:"#0e0e10",fontSize:15,fontWeight:"800"}}>CONTINUAR</Text>
      </TouchableOpacity>
    </ScrollView>
    <GoScreenCloseGuide/>
    <View testID="note-schedule-navigation" style={{ position:"absolute",bottom:Math.max(insets.bottom,12),gap:10,
      ...(handedness==="left"?{left:18+insets.left}:{right:18+insets.right}) }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cambiar fecha" onPress={date} disabled={pending}
        style={{width:44,height:44,borderRadius:16,borderWidth:1.5,borderColor:"rgba(255,255,255,0.5)",alignItems:"center",justifyContent:"center",backgroundColor:"#0e0e10"}}>
        <Feather name="calendar" size={20} color="#ffffff"/>
      </TouchableOpacity>
      <GoCloseButton level="panel" accessibilityLabel="Volver" onPress={back} disabled={pending}/>
    </View>
    </KeyboardAvoidingView>
  </GoScreenCloseSurface>;
}
