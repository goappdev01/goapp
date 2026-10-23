import React,{useEffect,useRef,useState} from "react";
import {ActivityIndicator,Alert,AppState,KeyboardAvoidingView,Modal,Platform,ScrollView,Share,StyleSheet,Text,TextInput,TouchableOpacity,View} from "react-native";
import {CameraView,useCameraPermissions} from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {useLanguage} from "@/contexts/LanguageContext";
import {getAuthenticatedUserId} from "@/data/booking";
import {bookingVerification,type VerificationCommand,type VerificationResult,type VerificationSummary} from "@/data/bookingVerification";
import {onSessionChanged} from "@/lib/sessionEvents";
import {GoCloseButton} from "@/components/ui/GoCloseButton";

export function ReservationVerificationPanel({bookingId,businessId,onClose}:{bookingId?:string;businessId?:string;onClose:()=>void}){
 const {t,lang}=useLanguage(),insets=useSafeAreaInsets();
 const [permission,askPermission]=useCameraPermissions();
 const [result,setResult]=useState<VerificationResult>(),[input,setInput]=useState(""),[scanning,setScanning]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const closeRef=useRef(onClose);closeRef.current=onClose;
 const generation=useRef(0),locked=useRef(false),identity=useRef<string|null>(null),initial=useRef(bookingId);
 const clear=()=>{generation.current++;locked.current=false;setBusy(false);setResult(undefined);setInput("");setScanning(false);};
 useEffect(()=>{
  const account=onSessionChanged(()=>{clear();identity.current=null;closeRef.current();});
  const background=AppState.addEventListener("change",state=>{if(state!=="active")clear();});
  return()=>{generation.current++;account();background.remove();};
 },[]);
 const request=async(command:VerificationCommand)=>{
  if(locked.current)return;locked.current=true;setBusy(true);setError("");setScanning(false);
  const version=++generation.current;setInput("");
  try{
   const user=await getAuthenticatedUserId();if(!user)throw Error(t('verification_sign_in'));
   if(identity.current && user!==identity.current)throw Error(t('verification_account_changed'));identity.current=user;
   const response=await bookingVerification(command,user);
   if(version===generation.current){setResult(response);if(response.bookingId)initial.current=response.bookingId;}
  }catch(issue){if(version===generation.current){setResult(undefined);setError(issue instanceof Error?issue.message:t('verification_unavailable'));}}
  finally{if(version===generation.current){locked.current=false;setBusy(false);}}
 };
 useEffect(()=>{clear();initial.current=bookingId;if(!businessId)void request(bookingId?{operation:"issue",bookingId}:{operation:"wallet"});},[bookingId,businessId]);
 useEffect(()=>{
  if(!result?.expiresAt)return;const expires=Date.parse(result.expiresAt);if(!Number.isFinite(expires))return;
  const timer=setTimeout(()=>{setResult(undefined);setError(t('verification_expired'));setScanning(false);},Math.max(0,expires-Date.now()));return()=>clearTimeout(timer);
 },[result?.expiresAt,t]);
 const summary:VerificationSummary|undefined=result?.summary??(result?.valid?result as VerificationSummary:undefined);
 const scan=async()=>{try{const granted=permission?.granted || (await askPermission()).granted;if(granted){setResult(undefined);setScanning(true);setError("");}else setError(t('verification_camera_denied'));}catch{setError(t('verification_camera_unavailable'));}};
 const button=(label:string,action:()=>void,color="#93c5fd")=><TouchableOpacity accessibilityRole="button" disabled={busy} onPress={action} style={[s.button,{borderColor:color,opacity:busy?0.5:1}]}><Text style={[s.buttonText,{color}]}>{label}</Text></TouchableOpacity>;
 const preview=(secret:string)=>{if(businessId)void request({operation:"preview",businessId,secret});};
 return <Modal transparent animationType="fade" onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":undefined} style={{flex:1,backgroundColor:"#080b12",paddingTop:insets.top,paddingBottom:insets.bottom}}>
  <View style={{flexDirection:"row",alignItems:"center",padding:12,gap:12}}><Text style={[s.title,{flex:1}]}>{businessId?t('verification_title'):t('verification_wallet')}</Text><GoCloseButton level="panel" onPress={onClose} accessibilityLabel={t('cancel')}/></View>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:18,gap:12}}>
   <Text style={s.secondary}>{t('verification_explanation')}</Text>
   {busy && <ActivityIndicator accessibilityLabel={t('verification_loading')} color="#93c5fd"/>}
   {!!error && <Text accessibilityRole="alert" style={{color:"#f87171"}}>{error}</Text>}
   {!!summary && <View style={s.summary}>
    <Text style={s.title}>{summary.customerName || t('booking_customer_unknown')}</Text>
    {!!summary.authorizedPersonName && <Text style={s.text}>{t('verification_authorized_person')}: {summary.authorizedPersonName}</Text>}
    <Text style={s.text}>{summary.businessName} · {summary.serviceName}</Text>
    <Text style={s.text}>{new Date(summary.startsAt).toLocaleString(lang,{timeZone:summary.timezone})}</Text>
    <Text style={{color:summary.arrivalVerified?"#22c55e":"#93c5fd"}}>{summary.arrivalVerified?t('verification_arrived'):result?.valid?t('verification_valid'):t('booking_state_accepted')}</Text>
    <Text style={s.secondary}>{t('verification_identity_notice')}</Text>
   </View>}
   {!!result?.qrPayload && <View style={{alignItems:"center",gap:12}}>
    <View accessibilityLabel={t('verification_qr')} style={{backgroundColor:"white",padding:16,borderRadius:12}}><QRCode value={result.qrPayload} size={200}/></View>
    <Text selectable accessibilityLabel={t('verification_manual')} style={s.code}>{result.manualCode?.match(/.{1,4}/g)?.join(" ")}</Text>
    <Text style={s.secondary}>{t('verification_short_lived')}</Text>
   </View>}
   {!!result?.invitation && <View style={s.summary}><Text style={s.text}>{t('verification_handover_notice')}</Text><Text selectable style={s.code}>{result.invitation}</Text>
    {button(t('verification_share'),()=>void Share.share({message:t('verification_receive_instructions')+"\n\ngo-app://reservation-right\n\n"+result.invitation}))}
   </View>}
   {!!result?.items && result.items.map(item=><View key={item.bookingId} style={s.summary}><Text style={s.text}>{item.summary.businessName} · {item.summary.serviceName}</Text>{button(t('verification_show'),()=>{initial.current=item.bookingId;void request({operation:"issue",bookingId:item.bookingId});})}</View>)}
   {businessId ? <>
    {scanning && permission?.granted && <CameraView style={{height:280,width:"100%"}} facing="back" barcodeScannerSettings={{barcodeTypes:["qr"]}} onMountError={()=>{setScanning(false);setError(t('verification_camera_unavailable'));}} onBarcodeScanned={({data})=>{if(!locked.current)preview(data);}}/>}
    {button(t('verification_scan'),()=>void scan())}
    <TextInput accessibilityLabel={t('verification_manual')} value={input} onChangeText={setInput} style={s.input} multiline autoCapitalize="none" autoCorrect={false} placeholder={t('verification_manual')} placeholderTextColor="#94a3b8" maxLength={160}/>
    {button(t('verification_check'),()=>preview(input))}
    {!!result?.challenge && !result.arrivalVerified && result.canConfirmArrival && button(t('verification_confirm_arrival'),()=>void request({operation:"arrive",businessId,challenge:result.challenge}),"#22c55e")}
    {!!result?.valid && !result.arrivalVerified && !result.canConfirmArrival && <Text style={s.secondary}>{t('verification_not_arrival_time')}</Text>}
   </> : <>
    {!!initial.current && <>
     {button(t('verification_show'),()=>void request({operation:"issue",bookingId:initial.current}))}
     {button(t('verification_transfer'),()=>Alert.alert(t('verification_transfer'),t('verification_handover_notice'),[{text:t('cancel'),style:"cancel"},{text:t('verification_continue'),onPress:()=>void request({operation:"invite",bookingId:initial.current})}]),"#FF8C00")}
     {button(t('verification_revoke'),()=>Alert.alert(t('verification_revoke'),t('verification_revoke_notice'),[{text:t('cancel'),style:"cancel"},{text:t('verification_continue'),onPress:()=>void request({operation:"revoke",bookingId:initial.current})}]),"#f87171")}
    </>}
    <Text style={s.text}>{t('verification_receive')}</Text><TextInput accessibilityLabel={t('verification_invitation')} value={input} onChangeText={setInput} style={s.input} multiline autoCapitalize="none" autoCorrect={false} placeholder={t('verification_invitation')} placeholderTextColor="#94a3b8" maxLength={160}/>
    {button(t('verification_accept_right'),()=>Alert.alert(t('verification_receive'),t('verification_accept_notice'),[{text:t('cancel'),style:"cancel"},{text:t('verification_accept_right'),onPress:()=>void request({operation:"claim",secret:input.trim()})}]))}
    {button(t('verification_refresh_wallet'),()=>void request({operation:"wallet"}))}
   </>}
  </ScrollView>
 </KeyboardAvoidingView></Modal>;
}
const s=StyleSheet.create({title:{fontSize:18,fontWeight:"700",color:"#fff"},text:{fontSize:15,color:"#fff"},secondary:{fontSize:13,color:"#b6c3d6",lineHeight:19},button:{minHeight:48,borderRadius:12,borderWidth:1,padding:12,alignItems:"center",justifyContent:"center"},buttonText:{fontSize:15,fontWeight:"700",textAlign:"center"},summary:{padding:14,borderRadius:12,borderWidth:1,borderColor:"#374151",gap:8},code:{color:"#fff",fontSize:16,textAlign:"center",lineHeight:24},input:{borderWidth:1,borderColor:"#64748b",borderRadius:10,color:"white",padding:12,minHeight:52,fontSize:16}});
