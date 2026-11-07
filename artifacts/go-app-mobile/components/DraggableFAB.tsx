/**
 * DraggableFAB
 * ────────────
 * Envuelve cualquier botón flotante y lo hace arrastrable mediante
 * long-press (500ms). Guarda la posición por pantalla en AsyncStorage.
 *
 * Props:
 *   screenKey   — clave única de la pantalla (ej: "perfil", "plano")
 *   buttonKey   — clave única del botón dentro de la pantalla (ej: "main", "close")
 *   initialRight  — distancia inicial al borde derecho (px)
 *   initialBottom — distancia inicial al borde inferior (px); usa esto O initialTop
 *   initialTop    — distancia inicial al borde superior (px)
 *   maxH          — altura máxima del cluster (para clamping); default 40
 *
 * Comportamiento:
 *   • Long-press 500ms → modo arrastre (escala + sombra)
 *   • Soltar → guarda posición + haptic + spring de vuelta a scale=1
 *   • Posición clampeada a safe areas en todo momento
 *   • Taps cortos pasan a los hijos normalmente (TouchableOpacity funciona)
 */
import React, { useCallback, useEffect, useMemo, useContext, useRef } from "react";
import {GoNavigationHand} from "@/components/ui/GoNavigationHand";
import { Dimensions, StyleSheet } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const FAB_BTN = 40;
const EDGE = 8;
type FabRect={x:number;y:number;width:number;height:number};

/** Let the finger cross occupied areas; settle only in a free position on release. */
function settleClearPosition(x:number,y:number,originX:number,originY:number,width:number,height:number,
  minL:number,maxL:number,minT:number,maxT:number,rects:readonly FabRect[]){
  "worklet";
  const clear=(left:number,top:number)=>!rects.some(rect=>left<rect.x+rect.width+2&&left+width>rect.x-2
    &&top<rect.y+rect.height+2&&top+height>rect.y-2);
  if(clear(x,y))return{x,y};
  const xs=[x,originX,minL,maxL],ys=[y,originY,minT,maxT];
  for(const rect of rects){xs.push(rect.x-width-2,rect.x+rect.width+2);ys.push(rect.y-height-2,rect.y+rect.height+2);}
  let bestX=originX,bestY=originY,best=Number.POSITIVE_INFINITY;
  for(const candidateX of xs)for(const candidateY of ys){
    const left=Math.max(minL,Math.min(maxL,candidateX)),top=Math.max(minT,Math.min(maxT,candidateY));
    if(!clear(left,top))continue;
    const distance=(left-x)**2+(top-y)**2;
    if(distance<best){best=distance;bestX=left;bestY=top;}
  }
  return{x:bestX,y:bestY};
}

interface DraggableFABProps {
  navigation?:boolean;
  keyboardResponsive?:boolean;
  handedness?:"left"|"right";
  screenKey: string;
  buttonKey: string;
  initialRight?: number;
  initialBottom?: number;
  initialTop?: number;
  maxH?: number;
  bounds?: { width: number; height: number };
  /** Local bounds already inside a safe area may opt out of the extra vertical inset. */
  boundsVerticalInset?: number;
  buttonWidth?: number;
  /** Opt-in vertical rail, inside an already safe local viewport. */
  fixedLeft?: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Optional clear-space constraint for a control with a movable home, such as Landing QR. */
  avoidRects?: readonly {x:number;y:number;width:number;height:number}[];
  children: React.ReactNode;
}

export function DraggableFAB({
  screenKey,
  buttonKey,
  initialRight = 20,
  initialBottom,
  initialTop,
  maxH = FAB_BTN,
  bounds,
  boundsVerticalInset,
  buttonWidth = FAB_BTN,
  fixedLeft,
  onDragStart,
  onDragEnd,
  avoidRects,
  navigation=false,
  keyboardResponsive=false,
  handedness,
  children,
}: DraggableFABProps) {
  const { width: SW, height: SH } = bounds || Dimensions.get("window");
  const insets = useSafeAreaInsets();
  const preferredHand=useContext(GoNavigationHand),hand=handedness??preferredHand;
  const storageKey = `fab_pos:${screenKey}:${buttonKey}`+(navigation?":"+hand:"");
  const dragPress=useRef({active:false,suppress:false});
  const markNavigationDrag=useCallback(()=>{dragPress.current={active:true,suppress:true};},[]);
  const finishNavigationDrag=useCallback(()=>{dragPress.current.active=false;},[]);

  // ── Compute initial (left, top) ──────────────────────────────────────────
  const initLeft = navigation&&hand==="left"?initialRight:SW - initialRight - buttonWidth;
  const initTop =
    initialTop !== undefined
      ? initialTop
      : initialBottom !== undefined
      ? SH - initialBottom - maxH
      : SH - 120 - maxH;

  // ── Shared values ────────────────────────────────────────────────────────
  const posL = useSharedValue(initLeft);
  const posT = useSharedValue(initTop);
  const startL = useSharedValue(initLeft);
  const startT = useSharedValue(initTop);
  const originL = useSharedValue(initLeft);
  const originT = useSharedValue(initTop);
  const scale = useSharedValue(1);
  const shadowOp = useSharedValue(0.18);
  const isDragging = useSharedValue(false);
  const dragStarted = useSharedValue(false);
  const hasDragged = useSharedValue(false);
  const lastBoundsHeight=useRef<number|null>(null),currentBoundsHeight=useRef(SH);
  currentBoundsHeight.current=SH;
  useEffect(()=>{
    if(!keyboardResponsive||!bounds)return;
    const previous=lastBoundsHeight.current;lastBoundsHeight.current=bounds.height;
    if(previous!==null&&previous!==bounds.height)posT.value+=bounds.height-previous;
  },[keyboardResponsive,bounds?.height]);

  // ── Safe area clamp bounds ───────────────────────────────────────────────
  const fixed = fixedLeft === undefined ? undefined : Math.max(0, Math.min(SW - buttonWidth, fixedLeft));
  const minL = fixed ?? (bounds ? 0 : insets.left) + EDGE;
  const maxL = fixed ?? Math.max(minL, SW - (bounds ? 0 : insets.right) - EDGE - buttonWidth);
  const verticalEdge = bounds ? Math.max(0,boundsVerticalInset??EDGE) : EDGE;
  const minT = (bounds ? 0 : insets.top) + verticalEdge;
  const maxT = Math.max(minT, SH - (bounds ? 0 : insets.bottom) - verticalEdge - maxH);
  const clearAt=(l:number,t:number)=>!avoidRects?.some(rect=>l<rect.x+rect.width+2&&l+buttonWidth>rect.x-2
    &&t<rect.y+rect.height+2&&t+maxH>rect.y-2);

  // ── Persist ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let active=true;
    if(navigation){posL.value=initLeft;posT.value=initTop;hasDragged.value=false;}
    AsyncStorage.getItem(storageKey).then(async(raw) => {
      if(!raw&&navigation&&hand==="right")raw=await AsyncStorage.getItem(`fab_pos:${screenKey}:${buttonKey}`);
      if (!active||!raw) return;
      try {
        const { l, t, h } = JSON.parse(raw) as { l: number; t: number; h?:number };
        if (!Number.isFinite(l) || !Number.isFinite(t) || hasDragged.value) return;
        const nextL=Math.max(minL,Math.min(maxL,l));
        const restored=keyboardResponsive&&typeof h==="number"&&Number.isFinite(h)?t+currentBoundsHeight.current-h:t;
        const nextT=Math.max(minT,Math.min(maxT,restored));
        if(avoidRects?.length){posL.value=clearAt(nextL,nextT)?nextL:initLeft;
          posT.value=clearAt(nextL,nextT)?nextT:initTop;}
        else{posL.value=bounds?l:nextL;posT.value=bounds?restored:nextT;}
      } catch {
        // ignore corrupt data
      }
    }).catch(() => console.info("[fab-preference]", { code: "READ_FAILED" }));
    return()=>{active=false;};
  }, [storageKey]);

  useEffect(()=>{if(!bounds||!avoidRects?.length||clearAt(posL.value,posT.value))return;
    posL.value=Math.max(minL,Math.min(maxL,initLeft));
    posT.value=Math.max(minT,Math.min(maxT,initTop));
  },[bounds?.width,bounds?.height,JSON.stringify(avoidRects)]);

  useEffect(() => {
    if (bounds) return; // Keep the chosen position while the keyboard temporarily clamps its display.
    posL.value = Math.max(minL, Math.min(maxL, posL.value));
    posT.value = Math.max(minT, Math.min(maxT, posT.value));
  }, [minL, maxL, minT, maxT]);

  const savePos = useCallback(
    (l: number, t: number) => {
      AsyncStorage.setItem(storageKey, JSON.stringify(keyboardResponsive&&bounds?{l,t,h:currentBoundsHeight.current}:{l,t})).catch(() => console.info("[fab-preference]", { code: "WRITE_FAILED" }));
    },
    [storageKey,keyboardResponsive,!!bounds]
  );

  // ── Gesture ──────────────────────────────────────────────────────────────
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(500)
        .onStart((event) => {
          "worklet";
          isDragging.value = true;
          dragStarted.value = true;
          hasDragged.value = true;
          if (onDragStart) runOnJS(onDragStart)();
          if(navigation)runOnJS(markNavigationDrag)();
          originL.value=posL.value;
          originT.value=posT.value;
          startL.value = Math.max(minL, Math.min(maxL, posL.value)) - event.translationX;
          startT.value = Math.max(minT, Math.min(maxT, posT.value)) - event.translationY;
          scale.value = withSpring(fixed === undefined && !navigation ? 1.1 : 1, { damping: 10, stiffness: 180 });
          shadowOp.value = fixed === undefined ? 0.42 : 0.22;
          runOnJS(Haptics.selectionAsync)();
        })
        .onUpdate((e) => {
          "worklet";
          const nextL=Math.max(minL, Math.min(maxL, startL.value + e.translationX));
          const nextT=Math.max(minT, Math.min(maxT, startT.value + e.translationY));
          posL.value=nextL;posT.value=nextT;
        })
        .onEnd(() => {
          "worklet";
          if(avoidRects?.length){
            const target=settleClearPosition(posL.value,posT.value,originL.value,originT.value,
              buttonWidth,maxH,minL,maxL,minT,maxT,avoidRects);
            posL.value=withSpring(target.x);
            posT.value=withSpring(target.y);
            runOnJS(savePos)(target.x,target.y);
          }else runOnJS(savePos)(posL.value,posT.value);
          isDragging.value = false;
          scale.value = withSpring(1, { damping: 14, stiffness: 160 });
          shadowOp.value = 0.18;
          runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
        })
        .onFinalize(() => {
          "worklet";
          if(isDragging.value&&avoidRects?.length){
            // A cancelled pan never parks the QR over another live control.
            posL.value=withSpring(originL.value);
            posT.value=withSpring(originT.value);
          }
          isDragging.value = false;
          scale.value = withSpring(1);
          shadowOp.value = 0.18;
          if(navigation)runOnJS(finishNavigationDrag)();
          if(dragStarted.value&&onDragEnd)runOnJS(onDragEnd)();
          dragStarted.value=false;
        }),
    [minL, maxL, minT, maxT, savePos, onDragStart, onDragEnd, avoidRects, buttonWidth, maxH, fixed,navigation,markNavigationDrag,finishNavigationDrag]
  );

  // ── Animated style ───────────────────────────────────────────────────────
  const animStyle = useAnimatedStyle(() => ({
    left: bounds ? Math.max(minL, Math.min(maxL, posL.value)) : posL.value,
    top: bounds ? Math.max(minT, Math.min(maxT, posT.value)) : posT.value,
    transform: [{ scale: scale.value }],
    zIndex: isDragging.value ? 300 : 99,
    shadowOpacity: shadowOp.value,
    shadowRadius: isDragging.value ? (fixed === undefined ? 18 : 8) : 6,
    elevation: isDragging.value ? (fixed === undefined ? 20 : 6) : 4,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.cluster, animStyle]}>
        {navigation?guardNavigationPress(children,dragPress):children}
      </Animated.View>
    </GestureDetector>
  );
}

/** The existing recognizer owns movement; suppress only the trailing drag touch. */
function guardNavigationPress(children:React.ReactNode,state:React.RefObject<{active:boolean;suppress:boolean}>):React.ReactNode{
 return React.Children.map(children,child=>{
  if(!React.isValidElement<{children?:React.ReactNode;onPress?:()=>void;onPressIn?:()=>void}>(child))return child;
  if(["GoCloseButton","GoNavigationButton"].includes((child.type as {displayName?:string})?.displayName??""))return React.cloneElement(child,{
   onPressIn:()=>{if(!state.current.active)state.current.suppress=false;child.props.onPressIn?.();},
   onPress:()=>{if(!state.current.suppress&&!state.current.active)child.props.onPress?.();}
  });
  return child.props.children?React.cloneElement(child,{},guardNavigationPress(child.props.children,state)):child;
 });
}

const styles = StyleSheet.create({
  cluster: {
    position: "absolute",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
  },
});
