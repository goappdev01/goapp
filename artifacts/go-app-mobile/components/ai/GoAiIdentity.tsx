import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import { goAiActivityIsAnimated, visibleExpression, type GoAiActivity, type GoAiExpression } from "@/lib/goAiVisualState";

const ICON: Partial<Record<GoAiActivity, keyof typeof Feather.glyphMap>> = {
  listening: "mic", processing: "bar-chart-2", speaking: "volume-2",
  executing: "settings", completed: "check-circle", error: "alert-circle",
};

/** Passive vector identity. Its parent keeps the existing button, gestures and accessibility action. */
export function GoAiIdentity({ size, activity = "available", expression = "friendly", testID }: {
  size: number; activity?: GoAiActivity; expression?: GoAiExpression; testID?: string;
}) {
  const [reduceMotion, setReduceMotion] = useState(true);
  const pulse = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const face = visibleExpression(activity, expression);
  const active = goAiActivityIsAnimated(activity);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { mounted = false; listener.remove(); };
  }, []);
  useEffect(() => {
    pulse.stopAnimation(); pulse.setValue(0);
    if (!active || reduceMotion) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }));
    loop.start();
    return () => loop.stop();
  }, [active, pulse, reduceMotion]);
  useEffect(() => {
    if (reduceMotion) { fade.setValue(1); return; }
    fade.setValue(0.65);
    const change = Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true });
    change.start();
    return () => change.stop();
  }, [activity, face, fade, reduceMotion]);
  const wink = face === "wink";
  const serious = face === "serious" || face === "informative" || face === "confirmation";
  const surprise = face === "attention";
  const mouth = surprise ? <Circle cx="50" cy="77" r="4" fill="#21180D" />
    : <Path d={serious ? "M38 76 Q50 78 62 76" : face === "positive" ? "M34 72 Q50 88 66 72" : "M36 73 Q50 84 64 73"}
        fill="none" stroke="#21180D" strokeWidth="3" strokeLinecap="round" />;
  const icon = ICON[activity];
  return <View testID={testID} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width:size, height:size, alignItems:"center", justifyContent:"center" }}>
    {active && !reduceMotion && <Animated.View style={{ position:"absolute", width:size, height:size, borderRadius:size/2,
      borderWidth:2, borderColor:"#F6D979", opacity:pulse.interpolate({inputRange:[0,0.45,1],outputRange:[0,.7,0]}),
      transform:[{scale:pulse.interpolate({inputRange:[0,1],outputRange:[1,1.18]})}] }} />}
    <Animated.View style={{ width:size, height:size, opacity:fade }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs><LinearGradient id="go-ai-gold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFF0A5"/><Stop offset="0.45" stopColor="#EBC251"/><Stop offset="1" stopColor="#A66C15"/>
        </LinearGradient></Defs>
        <Circle cx="50" cy="50" r="47" fill="url(#go-ai-gold)" stroke="#FFF4C7" strokeWidth="3" />
        <Circle cx="50" cy="50" r="42" fill="none" stroke="#BB8127" strokeWidth="1.2" />
        <SvgText x="18" y="64" fontSize="48" fontWeight="900" fill="#21180D">G</SvgText>
        {wink ? <Path d="M55 52 Q68 38 82 52" fill="none" stroke="#21180D" strokeWidth="5" strokeLinecap="round" />
          : <Circle cx="69" cy="48" r="15" fill="none" stroke="#21180D" strokeWidth="5.5" />}
        {mouth}
      </Svg>
    </Animated.View>
    {icon && <View style={{ position:"absolute", top:size*.04, right:size*.10, minWidth:size*.26, minHeight:size*.26,
      borderRadius:size*.16, backgroundColor:"#FFF2B9", alignItems:"center", justifyContent:"center" }}>
      <Feather name={icon} size={Math.max(10, Math.round(size*.21))} color="#30230E" />
    </View>}
  </View>;
}
