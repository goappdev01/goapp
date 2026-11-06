import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export function ListadosSwipeHint({ scopeKey, used, visible }: { scopeKey: string | null; used: boolean; visible: boolean }) {
  const [learned, setLearned] = useState(true);
  const [reduced, setReduced] = useState(true);
  const shift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    setLearned(true);
    if (scopeKey) AsyncStorage.getItem("listados_swipe_known:"+scopeKey)
      .then(value=>{if(active)setLearned(value==="1");}).catch(()=>{});
    return () => { active = false; };
  }, [scopeKey]);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReduced(value);}).catch(()=>{});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged",setReduced);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (used && scopeKey) {
      setLearned(true);
      void AsyncStorage.setItem("listados_swipe_known:"+scopeKey,"1").catch(()=>{});
    }
  }, [used,scopeKey]);
  useEffect(() => {
    if (!visible || learned || reduced || used) return;
    const cycle = Animated.sequence([
      Animated.delay(1200),
      Animated.timing(shift,{toValue:10,duration:400,useNativeDriver:true}),
      Animated.timing(shift,{toValue:-10,duration:700,useNativeDriver:true}),
      Animated.timing(shift,{toValue:0,duration:350,useNativeDriver:true}),
      Animated.delay(14000),
    ]);
    const animation = Animated.loop(cycle,{iterations:3});
    animation.start();
    return () => { animation.stop(); shift.setValue(0); };
  }, [visible,learned,reduced,used,shift]);
  if (!visible || learned || used) return null;
  return <View testID="list-swipe-hint" pointerEvents="none" style={{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,minHeight:24,marginBottom:4}}>
    <Animated.View style={{transform:[{translateX:shift}]}}><MaterialCommunityIcons name="gesture-swipe-horizontal" size={18} color="#cbd5e1"/></Animated.View>
    <Text style={{fontSize:11,color:"#cbd5e1"}}>Desliza a los lados para cambiar el estado</Text>
  </View>;
}
