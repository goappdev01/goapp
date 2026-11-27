import React from "react";
import {Text,View,useColorScheme} from "react-native";
import colors from "@/constants/colors";
import {useLanguage} from "@/contexts/LanguageContext";
import {useTesoThemeOptional} from "@/theme/TesoThemeContext";

/** A measured footer sibling of the composer, never a dismissible message or overlay. */
export function GoAiLimitNotice({uiScale="estandar"}:{uiScale?:"compacto"|"estandar"|"grande"}){
  const {t}=useLanguage(),theme=useTesoThemeOptional(),scheme=useColorScheme();
  const palette=colors[scheme==="dark"?"dark":"light"];
  const fontSize=Math.max(13,Math.round((uiScale==="grande"?15:13)*(theme?.typography.scale??1)));
  return <View testID="go-ai-limit-notice" pointerEvents="none" style={{paddingHorizontal:16,paddingTop:4,paddingBottom:6,
    backgroundColor:theme?.colors.surface??palette.background}}>
    <Text testID="go-ai-limit-notice-text" accessibilityRole="text" accessible allowFontScaling maxFontSizeMultiplier={0}
      style={{fontSize,lineHeight:Math.ceil(fontSize*1.4),textAlign:"center",color:theme?.colors.text.primary??palette.secondaryForeground}}>
      {t("go_ai_limit_notice")}
    </Text>
  </View>;
}
