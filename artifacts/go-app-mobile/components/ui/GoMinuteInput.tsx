import React from "react";
import { Text, TextInput, TouchableOpacity, View, type TextInputProps } from "react-native";

export type TimePeriod = "AM" | "PM";

export function periodForHour(hour: string): TimePeriod | null {
  if (!/^\d{1,2}$/.test(hour)) return null;
  const value = Number(hour);
  if (value === 0) return "AM";
  if (value > 12 && value < 24) return "PM";
  return null;
}

export function manualTime(hour: string, minute: string, period: TimePeriod | null): string | null {
  if (!/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute)) return null;
  const value = Number(hour);
  if (value > 23 || Number(minute) > 59 || value >= 1 && value <= 12 && !period) return null;
  const h24 = value >= 1 && value <= 12 ? value % 12 + (period === "PM" ? 12 : 0) : value;
  return String(h24).padStart(2,"0") + ":" + minute.padStart(2,"0");
}

export function GoTimePeriodButtons({ value, onChange, disabled, light = false, invalid = false }: {
  value: TimePeriod | null; onChange: (value: TimePeriod) => void; disabled?: boolean; light?: boolean; invalid?: boolean;
}) {
  return <View style={{flexDirection:"row",gap:8,justifyContent:"center"}}>
    {(["AM","PM"] as const).map(period => <TouchableOpacity key={period} testID={"time-period-"+period}
      accessibilityRole="radio" accessibilityState={{checked:value===period,disabled:!!disabled}} disabled={disabled}
      onPress={()=>onChange(period)} style={{minWidth:60,minHeight:44,borderRadius:12,borderWidth:2,
        borderColor:invalid?"#b45309":value===period?"#16834a":light?"#677681":"#aaa",
        backgroundColor:value===period?"#d6f1df":light?"#fff":"#202025",alignItems:"center",justifyContent:"center"}}>
      <Text style={{fontSize:16,fontWeight:"800",color:value===period||light?"#17212b":"#fff"}}>{period}</Text>
    </TouchableOpacity>)}
  </View>;
}

export function GoMinuteInput(props: TextInputProps) {
  return <TextInput accessibilityLabel="Minutos (00–59)" {...props}
    keyboardType="number-pad" inputMode="numeric" maxLength={2} selectTextOnFocus />;
}
