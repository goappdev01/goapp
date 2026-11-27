import React,{useEffect,useState} from "react";
import {Text,TouchableOpacity,View} from "react-native";
import {useAdminAccess} from "@/contexts/GoAdminAccessContext";
import {GoAiPrivacySettings,GoAiAdminStatus} from "./GoAiPrivacySettings";
export function GoAiPreferences({visible}:{visible:boolean}){
  const [privacy,setPrivacy]=useState(false),[technical,setTechnical]=useState(false),admin=useAdminAccess();
  const allowed=admin.allowed&&!admin.checking&&!admin.unavailable&&!!admin.userId;
  useEffect(()=>{if(!visible){setPrivacy(false);setTechnical(false);}},[visible]);
  if(!visible)return null;
  return <View testID="go-general-preferences" style={{marginHorizontal:16,marginBottom:12,padding:12,gap:10,minWidth:0,borderRadius:16,backgroundColor:"#F8FAFC",borderWidth:1,borderColor:"#CBD5E1"}}>
    <Text accessibilityRole="header" style={{fontSize:16,fontWeight:"700",color:"#183955"}}>Preferencias</Text>
    <TouchableOpacity testID="go-preferences-privacy" accessibilityRole="button" accessibilityState={{expanded:privacy}} onPress={()=>setPrivacy(value=>!value)} style={{minHeight:48,padding:10,justifyContent:"center",borderRadius:12,backgroundColor:"#FFF"}}><Text style={{fontSize:15,color:"#183955"}}>Privacidad</Text></TouchableOpacity>
    {privacy&&<GoAiPrivacySettings visible={privacy}/>}
    {allowed&&<TouchableOpacity testID="go-preferences-ai-admin" accessibilityRole="button" accessibilityState={{expanded:technical}} onPress={()=>setTechnical(value=>!value)} style={{minHeight:44,padding:10,borderRadius:12,backgroundColor:"#FFF"}}><Text style={{fontSize:14,color:"#183955"}}>ADMIN · GO IA</Text></TouchableOpacity>}
    {allowed&&technical&&<GoAiAdminStatus visible={technical}/>}
  </View>;
}
