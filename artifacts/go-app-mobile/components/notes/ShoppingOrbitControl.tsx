import React,{useState} from "react";
import {StyleSheet,Text,View,type ViewProps,type ViewInstance,type StyleProp,type ViewStyle} from "react-native";
import type {shoppingOrbitTypography} from "@/lib/shoppingExperience";
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

/** Decorative category content; the parent circle retains its original hit path and name. */
export function ShoppingOrbitContents({id,art,layout}:{id:string;art:string;layout:ReturnType<typeof shoppingOrbitTypography>}){
  const [widths,setWidths]=useState<Record<string,number>>({});
  return <View testID={"shopping-orbit-content-"+id} pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
    <View testID={"shopping-orbit-icon-zone-"+id} style={{position:"absolute",top:layout.iconTop,left:"50%",marginLeft:-layout.iconWidth/2,width:layout.iconWidth,height:layout.iconHeight,alignItems:"center",justifyContent:"center"}}>
      <Text testID={"shopping-orbit-art-"+id} accessible={false} allowFontScaling={false} numberOfLines={1} style={{fontSize:layout.icon,lineHeight:layout.iconHeight,textAlign:"center",includeFontPadding:false}}>{art}</Text>
    </View>
    <View testID={"shopping-orbit-label-"+id} pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      {layout.labelRows.map((row,index)=><React.Fragment key={row.text}>
        <Text testID={"shopping-orbit-measure-"+id+"-"+index} accessible={false} allowFontScaling={false} numberOfLines={1}
          onTextLayout={event=>{const width=event.nativeEvent.lines[0]?.width;if(typeof width==="number"&&Number.isFinite(width)&&width>0)setWidths(old=>Math.abs((old[row.text]??0)-width)<.1?old:{...old,[row.text]:width});}}
          style={{position:"absolute",left:0,top:0,width:1024,opacity:0,fontSize:12,lineHeight:18,fontWeight:"700"}}>{row.text}</Text>
        <Text testID={"shopping-orbit-line-"+id+"-"+index} accessible={false} allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.5}
          style={{position:"absolute",left:row.left,top:row.top,width:row.width,height:row.height,fontSize:Math.min(row.fontSize,widths[row.text]?row.width*12/widths[row.text]*.97:row.fontSize),lineHeight:row.height,fontWeight:"700",color:"#17365f",textAlign:"center",includeFontPadding:false}}>{row.text}</Text>
      </React.Fragment>)}
    </View>
  </View>;
}
