import React,{useContext,useState} from "react";
import {View,useWindowDimensions,type ViewInstance} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {DraggableFAB} from "@/components/DraggableFAB";
import {GoNavigationHand} from "./GoNavigationHand";
import {GestureHandlerRootView} from "react-native-gesture-handler";

/** A full-size touch host for the existing persistent drag recognizer. No navigation logic. */
export function GoNavigationFloating({screenKey,buttonKey="navigation",children,width=64,height=64,protectedBottom=0,protectedTop=0,safeArea=true,handedness,initialBottom=8,initialTop,initialRight=12,testID,pointerEvents="box-none",keyboardResponsive=false,boundsVerticalInset=0,avoidRects,onDragStart,onDragEnd,contentRef}:{
 screenKey:string;buttonKey?:string;children:React.ReactNode;width?:number;height?:number;protectedBottom?:number;protectedTop?:number;safeArea?:boolean;handedness?:"left"|"right";initialBottom?:number;initialTop?:number;initialRight?:number;testID?:string;pointerEvents?:"box-none"|"none";keyboardVisible?:boolean;keyboardResponsive?:boolean;boundsVerticalInset?:number;avoidRects?:readonly {x:number;y:number;width:number;height:number}[];onDragStart?:()=>void;onDragEnd?:()=>void;contentRef?:React.RefObject<ViewInstance|null>;
}){
 const window=useWindowDimensions(),insets=useSafeAreaInsets(),preferred=useContext(GoNavigationHand);
 const [bounds,setBounds]=useState({width:window.width-(safeArea?insets.left+insets.right:0),height:window.height-protectedTop-protectedBottom-(safeArea?insets.top+insets.bottom:0)});
 return <GestureHandlerRootView testID={testID??screenKey+"-navigation-host"} pointerEvents={pointerEvents} onLayout={event=>{const {width,height}=event.nativeEvent.layout;setBounds(old=>old.width===width&&old.height===height?old:{width,height});}}
  style={{position:"absolute",left:safeArea?insets.left:0,right:safeArea?insets.right:0,top:protectedTop+(safeArea?insets.top:0),bottom:protectedBottom+(safeArea?insets.bottom:0),zIndex:80}}>
  <DraggableFAB navigation keyboardResponsive={keyboardResponsive} handedness={handedness??preferred} screenKey={screenKey} buttonKey={buttonKey} bounds={bounds} boundsVerticalInset={boundsVerticalInset} buttonWidth={width} maxH={height} initialTop={initialTop} initialBottom={initialBottom} initialRight={initialRight} avoidRects={avoidRects} onDragStart={onDragStart} onDragEnd={onDragEnd}><View ref={contentRef} collapsable={contentRef?false:undefined} style={{flexDirection:(handedness??preferred)==="left"?"row-reverse":"row",alignItems:"flex-end",gap:8}}>{children}</View></DraggableFAB>
 </GestureHandlerRootView>;
}
