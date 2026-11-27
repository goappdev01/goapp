import React,{useEffect,useState} from "react";
import {Text,TouchableOpacity,View,useColorScheme} from "react-native";
import colors from "@/constants/colors";
import {useLanguage} from "@/contexts/LanguageContext";
import {useTesoThemeOptional} from "@/theme/TesoThemeContext";

/** Measured composer footer; central GO IA can dismiss it and keeps the copy in settings. */
export function GoAiLimitNotice({uiScale="estandar",dismissible=false,visible=true,appearance,autoDismissMs}:{uiScale?:"compacto"|"estandar"|"grande";dismissible?:boolean;visible?:boolean;appearance?:"light";autoDismissMs?:number}){
  const {t,lang}=useLanguage(),theme=useTesoThemeOptional(),scheme=useColorScheme();
  const [dismissed,setDismissed]=useState(false);useEffect(()=>{if(visible)setDismissed(false);},[visible]);
  useEffect(()=>{if(!visible||!dismissible||!autoDismissMs)return;const timer=setTimeout(()=>setDismissed(true),autoDismissMs);return()=>clearTimeout(timer);},[visible,dismissible,autoDismissMs]);
  const palette=colors[appearance!=="light"&&scheme==="dark"?"dark":"light"];
  const fontSize=Math.max(13,Math.round((uiScale==="grande"?15:13)*(theme?.typography.scale??1)));
  if(!visible||dismissible&&dismissed)return null;
  return <View testID="go-ai-limit-notice" pointerEvents={dismissible?"auto":"none"} style={{paddingHorizontal:16,paddingTop:4,paddingBottom:6,flexDirection:"row",alignItems:"center",
    backgroundColor:appearance==="light"?palette.background:theme?.colors.surface??palette.background}}>
    <Text testID="go-ai-limit-notice-text" accessibilityRole="text" accessible allowFontScaling maxFontSizeMultiplier={0}
      style={{flex:1,fontSize,lineHeight:Math.ceil(fontSize*1.4),textAlign:"center",color:appearance==="light"?palette.secondaryForeground:theme?.colors.text.primary??palette.secondaryForeground}}>
      {t("go_ai_limit_notice")}
    </Text>
    {dismissible&&<TouchableOpacity testID="go-ai-limit-notice-close" accessibilityRole="button" accessibilityLabel={lang==="en"?"Close AI limitations notice":"Cerrar aviso de limitaciones de IA"} onPress={()=>setDismissed(true)} style={{minWidth:44,minHeight:44,alignItems:"center",justifyContent:"center"}}><Text style={{fontSize:24,color:palette.secondaryForeground}}>×</Text></TouchableOpacity>}
  </View>;
}
