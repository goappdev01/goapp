import React,{useState} from "react";
import {StyleSheet,View,type ViewProps,type ViewInstance,type StyleProp,type ViewStyle} from "react-native";
import Svg,{Circle} from "react-native-svg";

/** Native SVG path hit-testing leaves the transparent corners available to neighbours. */
export function ShoppingOrbitControl({diameter,label,onPress,testID,style,children,controlRef,onLayout,fill="#ffffff",stroke="#ffffff",strokeWidth=2}: {
  diameter:number;label:string;onPress:()=>void;testID:string;style?:StyleProp<ViewStyle>;children:React.ReactNode;
  controlRef?:(node:ViewInstance|null)=>void;onLayout?:ViewProps["onLayout"];fill?:string;stroke?:string;strokeWidth?:number;
}){
  const [pressed,setPressed]=useState(false);
  return <View ref={controlRef} collapsable={false} testID={testID} onLayout={onLayout} pointerEvents="box-none"
    accessible accessibilityRole="button" accessibilityLabel={label} onAccessibilityTap={onPress}
    accessibilityActions={[{name:"activate"}]} onAccessibilityAction={event=>{if(event.nativeEvent.actionName==="activate")onPress();}}
    style={[style,{width:diameter,height:diameter,minHeight:diameter,maxHeight:diameter,borderRadius:diameter/2,borderWidth:0,backgroundColor:"transparent",opacity:pressed ? .7 : 1}]}>
    <Svg width={diameter} height={diameter} style={StyleSheet.absoluteFill} pointerEvents="box-none" accessible={false}>
      <Circle testID={testID+"-hit"} cx={diameter/2} cy={diameter/2} r={(diameter-strokeWidth)/2} fill={fill} stroke={stroke} strokeWidth={strokeWidth}
        onPress={onPress} onPressIn={()=>setPressed(true)} onPressOut={()=>setPressed(false)}/>
    </Svg>
    <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill,{alignItems:"center",justifyContent:"center"}]}>{children}</View>
  </View>;
}
