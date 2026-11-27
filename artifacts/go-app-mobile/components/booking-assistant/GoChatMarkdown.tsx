import React from "react";
import {Linking,Text,View} from "react-native";
import {parseChatMarkdown} from "@/lib/chatMarkdown";

export function GoChatMarkdown({text,color}:{text:string;color:string}){
  return <View style={{minWidth:0}}>{parseChatMarkdown(text).map((line,index)=><Text key={index} selectable
    style={{fontSize:16,lineHeight:23,color,fontWeight:line.kind==="heading"?"700":"400",marginTop:index&&line.kind==="heading"?5:0,marginBottom:line.segments.length?0:4}}>
    {line.segments.map((segment,i)=><Text key={i} accessibilityRole={segment.href?"link":undefined} onPress={segment.href?()=>{void Linking.openURL(segment.href!).catch(()=>{});}:undefined}
      style={{fontWeight:segment.style==="bold"?"700":undefined,fontStyle:segment.style==="italic"?"italic":undefined,
        fontFamily:segment.style==="code"?"monospace":undefined,textDecorationLine:segment.href?"underline":undefined}}>{segment.text}</Text>)}
  </Text>)}</View>;
}
