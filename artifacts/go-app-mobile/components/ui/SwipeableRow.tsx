import React, {useRef, useMemo} from "react";
import {Animated, StyleSheet, Text, View} from "react-native";
import {Feather} from "@expo/vector-icons";
import {Gesture, GestureDetector} from "react-native-gesture-handler";

type SwipeableRowProps = {
  children: React.ReactNode;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  leftLabel: string;
  leftIcon: keyof typeof Feather.glyphMap;
  leftColor: string;
  rightLabel: string;
  rightIcon: keyof typeof Feather.glyphMap;
  rightColor: string;
  borderRadius?: number;
  disabled?: boolean;
  testID?: string;
  onContactStart?: () => void;
  onSwipeStart?: () => void;
};
export function SwipeableRow({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftLabel,
  leftIcon,
  leftColor,
  rightLabel,
  rightIcon,
  rightColor,
  borderRadius = 16,
  disabled = false, testID, onContactStart, onSwipeStart,
}: SwipeableRowProps) {
  const tx = useRef(new Animated.Value(0)).current;
  // Ref con los handlers MÁS RECIENTES para evitar closures obsoletos.
  const handlersRef = useRef({ onSwipeLeft, onSwipeRight, onContactStart, onSwipeStart });
  const swipeContact=useRef({active:false,suppress:false,committed:false,dispatched:false,generation:0});
  handlersRef.current = { onSwipeLeft, onSwipeRight, onContactStart, onSwipeStart };

  // Usamos RNGH Gesture.Pan en lugar del antiguo PanResponder.
  // Ventaja clave: activeOffsetX / failOffsetY se evalúan ANTES de que
  // cualquier hijo (checkbox, TouchableOpacity) reclame el gesto, por lo
  // que el swipe funciona desde TODA la tarjeta independientemente del
  // modo diestro/zurdo y de dónde esté el checkbox.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        .runOnJS(true)
        .cancelsTouchesInView(true)
        .onStart(()=>{swipeContact.current.active=true;swipeContact.current.suppress=true;handlersRef.current.onSwipeStart?.();})
        // Activa el gesto solo cuando el movimiento horizontal supera 8px.
        // Antes de ese umbral los eventos pasan a los hijos (taps funcionan).
        .activeOffsetX([-8, 8])
        // Si el movimiento vertical supera 15px ANTES que el horizontal,
        // el gesto falla y el ScrollView padre puede tomar el scroll.
        .failOffsetY([-15, 15])
        .onBegin(() => {
          swipeContact.current={active:false,suppress:false,committed:false,dispatched:false,generation:swipeContact.current.generation+1};
          handlersRef.current.onContactStart?.();
          tx.stopAnimation(() => tx.setValue(0));
        })
        .onUpdate((e) => {
          tx.setValue(e.translationX);
        })
        .onEnd((e,success) => {
          if(success===false)return;
          if(swipeContact.current.committed)return;
          const generation=swipeContact.current.generation;
          const invoke=(action:()=>void)=>{if(swipeContact.current.generation!==generation||swipeContact.current.dispatched)return;swipeContact.current.dispatched=true;action();};
          const DIST = 40;
          // RNGH velocityX está en px/s; equivalente al vx (px/ms) × 1000.
          const VEL = 400;
          const dx = e.translationX;
          const vx = e.velocityX;
          const goRight = dx > DIST || (dx > 15 && vx > VEL);
          const goLeft = dx < -DIST || (dx < -15 && vx < -VEL);
          if(goRight||goLeft)swipeContact.current.committed=true;
          if (goRight) {
            const action=handlersRef.current.onSwipeRight;
            const dur = Math.max(140, Math.min(220, 220 - Math.abs(vx / 1000) * 60));
            Animated.timing(tx, {
              toValue: 500,
              duration: dur,
              useNativeDriver: true,
            }).start(result => {
              if(result?.finished===false)return;
              invoke(action);
              // Defer reset so LayoutAnimation (triggered inside the handler) runs
              // before we snap the card back to center — prevents the gap flash.
              setTimeout(() => {if(swipeContact.current.generation===generation)tx.setValue(0);}, 0);
            });
          } else if (goLeft) {
            const action=handlersRef.current.onSwipeLeft;
            const dur = Math.max(140, Math.min(220, 220 - Math.abs(vx / 1000) * 60));
            Animated.timing(tx, {
              toValue: -500,
              duration: dur,
              useNativeDriver: true,
            }).start(result => {
              if(result?.finished===false)return;
              invoke(action);
              setTimeout(() => {if(swipeContact.current.generation===generation)tx.setValue(0);}, 0);
            });
          } else {
            Animated.spring(tx, {
              toValue: 0,
              useNativeDriver: true,
              speed: 30,
              bounciness: 0,
            }).start();
          }
        })
        .onFinalize((_e, success) => {
          swipeContact.current.active=false;
          if (!success) {
            Animated.spring(tx, {
              toValue: 0,
              useNativeDriver: true,
              speed: 30,
              bounciness: 0,
            }).start();
          }
        }),
    // tx es un ref estable; no necesita entrar en deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled],
  );

  const guardedChildren=(nodes:React.ReactNode):React.ReactNode=>React.Children.map(nodes,child=>{
    if(!React.isValidElement<{children?:React.ReactNode;onPress?:(...args:any[])=>void;onLongPress?:(...args:any[])=>void;onDone?:()=>void;onPending?:()=>void;onDiscard?:()=>void}>(child))return child;
    const guard=(fn:((...args:any[])=>void)|undefined)=>fn?(...args:any[])=>{if(!swipeContact.current.active&&!swipeContact.current.suppress)fn(...args);}:undefined;
    return React.cloneElement(child,{onPress:guard(child.props.onPress),onLongPress:guard(child.props.onLongPress),onDone:guard(child.props.onDone),onPending:guard(child.props.onPending),onDiscard:guard(child.props.onDiscard),...(child.props.children?{children:guardedChildren(child.props.children)}:{})});
  });

  // Gesture.Native() permite que los TouchableOpacity internos (checkbox,
  // cuerpo de la tarjeta) respondan a taps al mismo tiempo que el pan
  // gesture escucha movimientos horizontales. Sin esto, GestureDetector
  // bloquea los taps de los hijos hasta que el pan decide si activa o no.
  const nativeGesture = useMemo(() => Gesture.Native(), []);
  const combinedGesture = useMemo(
    () => Gesture.Simultaneous(panGesture, nativeGesture),
    [panGesture, nativeGesture],
  );

  const rightHintOpacity = tx.interpolate({
    inputRange: [0, 12, 60],
    outputRange: [0, 0.5, 1],
    extrapolate: "clamp",
  });
  const leftHintOpacity = tx.interpolate({
    inputRange: [-60, -12, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: "clamp",
  });
  return (
    <View style={{ position: "relative", borderRadius, overflow: "hidden" }}>
      <Animated.View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFill,
          backgroundColor: rightColor,
          opacity: rightHintOpacity,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 18,
          gap: 8,
        }}
      >
        <Feather name={rightIcon} size={18} color="#ffffff" />
        <Text style={{ color: "#ffffff", fontFamily: "Inter_900Black", fontWeight: "900", fontSize: 12, letterSpacing: 0.6 }}>
          {rightLabel}
        </Text>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFill,
          backgroundColor: leftColor,
          opacity: leftHintOpacity,
          flexDirection: "row-reverse",
          alignItems: "center",
          paddingHorizontal: 18,
          gap: 8,
        }}
      >
        <Feather name={leftIcon} size={18} color="#ffffff" />
        <Text style={{ color: "#ffffff", fontFamily: "Inter_900Black", fontWeight: "900", fontSize: 12, letterSpacing: 0.6 }}>
          {leftLabel}
        </Text>
      </Animated.View>
      <GestureDetector gesture={combinedGesture}>
        <Animated.View testID={testID} style={{ transform: [{ translateX: tx }] }}>
          {guardedChildren(children)}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
