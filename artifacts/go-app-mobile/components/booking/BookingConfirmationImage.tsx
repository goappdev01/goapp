import React,{forwardRef} from "react";
import Svg,{Rect,Text as SvgText} from "react-native-svg";
import type {ConfirmationImageRenderer} from "@/data/bookingConfirmationShare";

/** A shareable rendering of the existing confirmation, never a new screen. */
export const BookingConfirmationImage=forwardRef<ConfirmationImageRenderer,{message:string;accent:string}>(function BookingConfirmationImage({message,accent},ref){
 const lines=confirmationImageLines(message),height=44+lines.length*25;
 return <Svg ref={ref as React.Ref<Svg>} width="100%" height={height} viewBox={`0 0 400 ${height}`} accessibilityLabel="Vista previa de la confirmación compartida">
  <Rect width={400} height={height} rx={20} fill="#0e0e10" stroke={accent} strokeWidth={2}/>
  {lines.map((line,index)=><SvgText key={index} x={22} y={34+index*25} fill={index===0?accent:"#FFFFFF"} fontSize={index===0?18:15} fontWeight={index===0?"800":"500"}>{line}</SvgText>)}
 </Svg>;
});
export function confirmationImageLines(message:string):string[]{
 const width=(value:string)=>Array.from(value).reduce((sum,char)=>sum+(/[MW@%#]/.test(char)?15:/[A-ZÁÉÍÓÚÑ]/.test(char)?12:/\s/.test(char)?5:/[a-z0-9.,:;/-]/.test(char)?9:16),0);
 return message.split('\n').flatMap(paragraph=>{const result:string[]=[];let line='';
  for(const word of paragraph.split(/\s+/)){
   if(line&&width(line+' '+word)>340){result.push(line);line='';}
   if(line)line+=' ';
   for(const char of word){if(line&&width(line+char)>340){result.push(line);line='';}line+=char;}
  }
  if(line||!result.length)result.push(line);return result;});
}
