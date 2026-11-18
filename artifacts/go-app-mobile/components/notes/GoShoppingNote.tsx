import React, { useEffect, useRef, useState } from "react";
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View, type TextInputProps } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GoEntry } from "@/components/AgendaOperativa";
import { GoScreenModal } from "@/components/ui/GoScreenModal";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import { GoNavigationFloating } from "@/components/ui/GoNavigationFloating";
import { useGoNoteKeyboard } from "@/hooks/useGoNoteKeyboard";
import { useBookingVoice } from "@/hooks/useBookingVoice";
import { useAdminAccess } from "@/contexts/GoAdminAccessContext";
import { useGoView } from "@/contexts/GoViewContext";
import type { TaskScope } from "@/lib/goTaskReminders";
import { subscribeGoLog, getGoLogSnapshot } from "@/lib/goLogStore";
import { noteInScope } from "@/lib/unifiedNotes";
import { createShoppingList, deleteShoppingList, listShoppingLists, openShoppingNote, oldShoppingNotes, renameShoppingList, restoreShoppingNote, runShoppingOperation, ShoppingNoteDeletedError } from "@/lib/shoppingNoteStore";
import { comparableShoppingPrices, isShoppingMeasure, legacyShoppingCandidates, normalizedShoppingPrice, shoppingEditor, shoppingEstimate, shoppingId, shoppingName, shoppingSubtotal, stepShoppingQuantity, suggestShoppingCategory, visibleShopping,
  SHOPPING_CATEGORIES, SHOPPING_UNITS, type MeasureUnit, type ShoppingDocument, type ShoppingEditorDraft, type ShoppingFilter, type ShoppingItem, type ShoppingOperation } from "@/lib/shoppingNote";
import { SHOPPING_ORBITS, shoppingCommand, shoppingOrbitLayout, shoppingRoute } from "@/lib/shoppingExperience";
import { shoppingCatalogGroups, shoppingCatalogItem, shoppingCatalogUnit, shoppingFavorites, shoppingNeedsDetails } from "@/lib/shoppingCatalog";
import { ShoppingProductRow } from "./ShoppingProductRow";
import { ShoppingCatalogChoice } from "./ShoppingCatalogChoice";
import { ShoppingReorderHandle, ShoppingReorderRow, ShoppingReorderSurface } from "./ShoppingReorderSurface";

type Props={visible:boolean;scope:TaskScope|null;ready:boolean;handedness:"left"|"right";onClose:()=>void;closeRequested?:boolean;initialListId?:string};
type InputOperation=ShoppingOperation extends infer O?O extends ShoppingOperation?Omit<O,"operationId">:never:never;
const decimal=(n:number)=>n.toLocaleString("es-ES",{maximumFractionDigits:3});
const money=(n:number,currency:string)=>n.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})+" "+(currency==="EUR"?"€":currency);
const priceBasis=(draft:ShoppingEditorDraft)=>{
  if(draft.priceQuantity.trim())return `${draft.priceQuantity.replace(".",",")} ${draft.priceUnit}`;
  if(draft.unit==="unidades")return "unidad";
  if(draft.unit==="paquetes")return "envase";
  if(draft.unit==="litros")return "litro";
  return draft.unit==="docenas"?"docena":draft.unit;
};
// Only view position is cached; product data always comes from the verified canonical store.
const shoppingPositions=new Map<string,number>();
export function GoShoppingNote({visible,scope,ready:scopeReady,handedness,onClose,closeRequested,initialListId}:Props){
  const admin=useAdminAccess(),view=useGoView();
  const isAdminView=view.view==="ADMIN";
  const authorizedAdmin=!!scope && view.isAdminView && admin.allowed
    && !admin.checking && !admin.unavailable && admin.userId===scope.userId;
  const personalScope=scope?.context==="live:USER" || scope?.context==="demo:USER";
  // A retained scope from the previous view must never activate its lists or actions.
  const ready=scopeReady && (isAdminView ? authorizedAdmin && scope?.context==="live:ADMIN" : view.view==="USER" && personalScope);
  const changingScope=(isAdminView && authorizedAdmin) || (view.view==="USER" && scope?.context==="live:ADMIN");
  const accessMessage=!scopeReady || (isAdminView && admin.checking) || changingScope
    ? "Verificando tu acceso a Compras…"
    : !scope ? "Inicia sesión en GO para usar Compras."
    : isAdminView && admin.unavailable ? "No se pudo verificar el acceso ADMIN a Compras."
    : isAdminView ? "Necesitas acceso ADMIN verificado para usar Compras."
    : "Compras está disponible en tu perfil personal o en ADMIN.";
  const insets=useSafeAreaInsets(),keyboard=useGoNoteKeyboard(visible);
  const viewport=useWindowDimensions();
  const [entry,setEntry]=useState<GoEntry|null>(null),[lists,setLists]=useState<GoEntry[]>([]),[listName,setListName]=useState(""),[error,setError]=useState(""),[restoreId,setRestoreId]=useState<string|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
  const [filter,setFilter]=useState<ShoppingFilter>("all"),[arrange,setArrange]=useState(false),[dragging,setDragging]=useState(false);
  const [editor,setEditor]=useState<ShoppingEditorDraft|null>(null),[draftStatus,setDraftStatus]=useState(""),[next,setNext]=useState<string[]|null>(null);
  const [editorDetails,setEditorDetails]=useState<"product"|"price"|"history"|null>(null);
  const [repeat,setRepeat]=useState<{purchaseId:string;ids:string[]}|null>(null);
  const [oldNotes,setOldNotes]=useState<GoEntry[]>([]),[legacy,setLegacy]=useState<GoEntry|null>(null),[legacySelected,setLegacySelected]=useState<string[]>([]);
  const [retry,setRetry]=useState(0),scroll=useRef<React.ElementRef<typeof ScrollView>>(null),editScroll=useRef<React.ElementRef<typeof ScrollView>>(null);
  const [screen,setScreen]=useState<"list"|"add">("add"),[orbit,setOrbit]=useState<string|null>(null),[subgroup,setSubgroup]=useState<string|null>(null),[more,setMore]=useState(false),[options,setOptions]=useState(false);
  const [searchQuery,setSearchQuery]=useState("");
  const [utility,setUtility]=useState<"lists"|"store"|"route"|"map"|"history"|"assistant"|"location"|null>(null),[utilityItem,setUtilityItem]=useState<ShoppingItem|null>(null);
  const [storeName,setStoreName]=useState(""),[aisle,setAisle]=useState(""),[command,setCommand]=useState(""),[answer,setAnswer]=useState("");
  const commandLock=useRef(false),voiceIdentity=useRef("");
  const mounted=useRef(true),generation=useRef(0),lock=useRef(false),draftSequence=useRef(0),draftRef=useRef(editor);draftRef.current=editor;
  const retries=useRef(new Map<string,string>());
  const identity=JSON.stringify(scope),latest=useRef({scope,ready,visible,identity});latest.current={scope,ready,visible,identity};
  const currentEntry=useRef(entry);currentEntry.current=entry;
  const active=(expected:string,epoch:number)=>mounted.current&&latest.current.visible&&latest.current.ready&&latest.current.identity===expected&&generation.current===epoch;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
  useEffect(()=>{
    const epoch=++generation.current;setEntry(null);setLists([]);setEditor(null);setEditorDetails(null);setRepeat(null);setNext(null);setLegacy(null);setOldNotes([]);setError("");setRestoreId(null);setFilter("all");setArrange(false);setBusy(false);setScreen("add");setOrbit(null);setSubgroup(null);setSearchQuery("");setUtility(null);setAnswer("");setCommand("");lock.current=false;retries.current.clear();draftSequence.current++;
    if(!visible||!ready||!scope)return;
    const expected=identity,valid=()=>active(expected,epoch);setLoading(true);
    void openShoppingNote(scope,valid,initialListId).then(async row=>{
      const [old,known]=await Promise.all([oldShoppingNotes(scope,valid),listShoppingLists(scope,valid)]);if(!valid())return;setEntry(row);setLists(known);setEditor(null);setOldNotes(old);
      setDraftStatus(row.note!.shopping!.pendingEditor?"Borrador recuperado del teléfono. Revisa y guarda el producto.":"");
    }).catch(e=>{if(valid()){setError((e as Error).message);setRestoreId(e instanceof ShoppingNoteDeletedError?e.noteId:null);}}).finally(()=>{if(valid())setLoading(false);});
    return()=>{generation.current++;};
  },[visible,ready,identity,retry,initialListId]);
  useEffect(()=>subscribeGoLog(()=>{
    const current=currentEntry.current;if(!current||!latest.current.ready||!latest.current.scope||!noteInScope(current,latest.current.scope))return;
    const row=getGoLogSnapshot().find(row=>row.id===current.id&&noteInScope(row,latest.current.scope!));if(row)setEntry(row);
  }),[]);
  const validView=visible&&ready&&scope&&entry&&noteInScope(entry,scope),doc=validView?entry.note?.shopping:undefined;
  async function operate(input:InputOperation,blocking=true){
    if(!scope||!ready||!entry||!noteInScope(entry,scope))throw Error("Espera a verificar tu acceso a Compras.");
    if(blocking&&lock.current)throw Error("Espera a que termine el guardado.");
    const expected=identity,epoch=generation.current,valid=()=>active(expected,epoch);
    const signature=JSON.stringify(input),operationId=retries.current.get(signature)||shoppingId();retries.current.set(signature,operationId);
    if(blocking){lock.current=true;setBusy(true);}setError("");
    try{
      const result=await runShoppingOperation(scope,valid,{...input,operationId} as ShoppingOperation,entry.id);retries.current.delete(signature);
      if(valid())setEntry(old=>(old?.note?.revision||0)>result.note!.revision?old:result);
      return result;
    }catch(e){if(valid())setError((e as Error).message);throw e;}
    finally{if(blocking){lock.current=false;if(valid())setBusy(false);}}
  }
  const action=(input:InputOperation)=>{void operate(input,false).catch(()=>{});};
  function writeDraft(draft:ShoppingEditorDraft){
    draftRef.current=draft;setEditor(draft);setDraftStatus("Guardando borrador…");const sequence=++draftSequence.current;
    if(doc?.pendingEditor&&doc.pendingEditor.id!==draft.id){setDraftStatus("Otro borrador sigue guardado. Este producto se guardará al confirmar.");return;}
    void operate({type:"draft",draft},false).then(()=>{if(sequence===draftSequence.current)setDraftStatus("Borrador guardado en el teléfono.");})
      .catch(()=>{if(sequence===draftSequence.current)setDraftStatus("Borrador pendiente de guardar. Reintenta antes de salir.");});
  }
  function change(patch:Partial<ShoppingEditorDraft>){const d=draftRef.current;if(d)writeDraft({...d,...patch});}
  function stepDraftQuantity(direction:-1|1){
    const draft=draftRef.current;if(!draft)return;
    try{const quantity=stepShoppingQuantity(draft.quantity,draft.unit,direction);if(quantity!==undefined)change({quantity});}
    catch(e){setError((e as Error).message);}
  }
  function startEditor(item?:ShoppingItem,name="",category?:ShoppingItem["category"],unit?:ShoppingItem["unit"]){
    if(busy||dragging)return;
    setNext(null);setLegacy(null);setArrange(false);setMore(false);setOptions(false);setEditorDetails(null);
    const draft=shoppingEditor(item);
    writeDraft({...draft,quantity:draft.quantity.replace(".",","),...(!item?{name,category:category||suggestShoppingCategory(name,doc!),unit:unit||"unidades",store:doc?.store||""}:{})});
  }
  function back(){
    if(busy||dragging)return;
    if(keyboard.isActive()){void keyboard.dismiss();return;}
    if(utility){voice.abort();setUtility(null);setUtilityItem(null);return;}
    if(editor&&draftStatus.startsWith("Borrador pendiente")){setError("El borrador aún no está guardado. Reintenta su guardado o descártalo expresamente.");return;}
    if(editor&&draftStatus==="Guardando borrador…"){setError("Espera a que termine el guardado del borrador antes de volver.");return;}
    if(editor){setEditor(null);draftRef.current=null;return;}
    if(next){setNext(null);return;}if(legacy){setLegacy(null);return;}if(arrange){setArrange(false);return;}
    if(screen==="add"){if(subgroup){setSubgroup(null);return;}if(orbit){setOrbit(null);return;}setScreen("list");return;}
    onClose();
  }
  useEffect(()=>{if(closeRequested)back();},[closeRequested]);
  async function save(){
    const draft=draftRef.current;if(!doc||!draft||lock.current)return;
    const expected=identity,epoch=generation.current;
    try{
      await operate({type:"saveItem",draft});if(!active(expected,epoch))return;draftSequence.current++;setEditor(null);draftRef.current=null;setScreen("list");setOrbit(null);Keyboard.dismiss();
    }catch(e){if(active(expected,epoch))setError((e as Error).message);}
  }
  async function chooseCatalog(name:string,category:ShoppingItem["category"]){
    if(!doc||busy)return;
    if(name==="Producto personalizado"){startEditor(undefined,"","other");return;}
    const existing=shoppingCatalogItem(doc,category,name);
    if(existing){
      if(existing.selected){startEditor(existing);return;}
      try{await operate({type:"select",id:existing.id,value:true});await operate({type:"bought",id:existing.id,value:false});setScreen("list");setOrbit(null);setSubgroup(null);}catch{}return;
    }
    if(shoppingNeedsDetails(category)){startEditor(undefined,name,category,shoppingCatalogUnit(category,name));return;}
    try{await operate({type:"saveItem",draft:{...shoppingEditor(),name,category,unit:shoppingCatalogUnit(category,name)}});setScreen("list");setOrbit(null);setSubgroup(null);}catch{}
  }
  async function runCommand(text:string){
    const current=currentEntry.current?.note?.shopping;if(!current||commandLock.current||!latest.current.ready)return;
    const expected=identity,epoch=generation.current;commandLock.current=true;
    try{const plan=shoppingCommand(current,text);
      const execute=async()=>{if(!active(expected,epoch))return;for(const op of plan.operations||[])await operate(op,false);if(active(expected,epoch)){setAnswer(plan.confirm?"Producto retirado; se conservan sus datos.":plan.message);if(plan.route)setUtility("route");}};
      if(plan.confirm)Alert.alert("GO Compras",plan.message,[{text:"Cancelar",style:"cancel"},{text:"RETIRAR",onPress:()=>{void execute().catch(()=>{});}}]);
      else await execute();
    }catch(e){if(active(expected,epoch))setAnswer((e as Error).message);}finally{commandLock.current=false;}
  }
  const voice=useBookingVoice(text=>{if(latest.current.visible&&voiceIdentity.current===latest.current.identity){setCommand(text);void runCommand(text);}},{requireTranscriptionReady:true});
  useEffect(()=>{voice.abort();},[identity,visible]);
  useEffect(()=>{if(utility!=="assistant")voice.abort();},[utility]);
  const button=(label:string,onPress:()=>void,testID?:string,selected=false,disabled=false)=><TouchableOpacity testID={testID} accessibilityRole="button" accessibilityState={{selected,disabled:disabled||busy}} disabled={disabled||busy} onPress={onPress}
    style={[s.button,selected&&s.chosen,(disabled||busy)&&{opacity:.45}]}><Text style={[s.buttonText,selected&&{color:"#fff"}]}>{label}</Text></TouchableOpacity>;
  const navButton=(id:string,label:string,icon:React.ComponentProps<typeof Feather>["name"],onPress:()=>void,selected=false)=><TouchableOpacity testID={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected,disabled:busy||dragging}} disabled={busy||dragging} onPress={onPress} style={[s.navItem,selected&&s.navSelected]}><Feather name={icon} size={22} color={selected?"#fff":"#173a68"}/><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.8} style={[s.navText,selected&&{color:"#fff"}]}>{label}</Text></TouchableOpacity>;
  const checkButton=(label:string,checked:boolean,onPress:()=>void,testID?:string)=><TouchableOpacity testID={testID} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked,disabled:busy}} disabled={busy} onPress={onPress} style={[s.button,checked&&s.checked]}><Text style={s.text}>{checked?"☑":"☐"} {label}</Text></TouchableOpacity>;
  const field=(key:keyof ShoppingEditorDraft,label:string,extra:TextInputProps={})=><View style={{gap:4}}><Text style={s.label}>{label}</Text><TextInput testID={"shopping-field-"+key} accessibilityLabel={label} value={String(editor?.[key]??"")} editable={!busy} onChangeText={value=>change({[key]:value})}
    onFocus={event=>{if(event.target!==undefined)editScroll.current?.scrollResponderScrollNativeHandleToKeyboard(event.target,12,true);}} style={s.input} {...extra}/></View>;
  function reorder(source:{id:string;kind:string;group:string},target:{id:string}){
    if(!doc||busy)return;
    if(source.kind==="column"){
      const ids=[...doc.categoryOrder],from=ids.indexOf(source.id as typeof ids[number]),to=ids.indexOf(target.id as typeof ids[number]);if(from<0||to<0)return;
      ids.splice(to,0,ids.splice(from,1)[0]);action({type:"reorderCategories",ids});
    }else{
      const group=doc.items.filter(i=>i.category===source.group).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
      const ids=group.map(i=>i.id),from=ids.indexOf(source.id),to=ids.indexOf(target.id);if(from<0||to<0)return;ids.splice(to,0,ids.splice(from,1)[0]);
      action({type:"reorderItems",category:source.group as ShoppingItem["category"],ids});
    }
  }
  const totals=doc?shoppingEstimate(doc):{totals:{},unknown:0},pickedTotals=doc?shoppingEstimate(doc,true):{totals:{},unknown:0},items=doc?.items||[];
  const panel=!!editor||!!next||!!legacy||!!utility,adding=screen==="add",listHome=!!doc&&!panel&&!adding,orbitHome=!!doc&&adding&&!panel&&!orbit;
  const orbital=shoppingOrbitLayout(viewport.width-insets.left-insets.right,viewport.fontScale),route=doc?shoppingRoute(doc):undefined;
  const displayTotal=(v:typeof totals)=>Object.entries(v.totals).map(([currency,value])=>money(value,currency)).join(" + ")||"0,00 €";
  const confirmRestore=()=>{
    if(!scope||!ready||!restoreId)return;
    const expected=identity,epoch=generation.current,noteId=restoreId,valid=()=>active(expected,epoch);
    Alert.alert("Restaurar COMPRAS","La lista está en la papelera. ¿Quieres recuperar esta misma lista y sus productos?",[
      {text:"Cancelar",style:"cancel"},
      {text:"RESTAURAR",onPress:()=>{setLoading(true);void restoreShoppingNote(scope,valid,noteId)
        .then(()=>{if(valid())setRetry(value=>value+1);})
        .catch(e=>{if(valid())setError((e as Error).message);})
        .finally(()=>{if(valid())setLoading(false);});}},
    ]);
  };
  const openRoute=(item?:ShoppingItem)=>{setUtilityItem(item||null);setUtility("route");};
  const go=()=>{setAnswer("");setUtility("assistant");};
  async function refreshLists(){if(scope&&ready)setLists(await listShoppingLists(scope,()=>latest.current.visible&&latest.current.ready&&latest.current.identity===identity));}
  async function openList(id:string){if(!scope)return;try{const row=await openShoppingNote(scope,()=>latest.current.visible&&latest.current.ready&&latest.current.identity===identity,id);setEntry(row);setUtility(null);setScreen("list");setEditor(null);await refreshLists();}catch(e){setError((e as Error).message);}}
  async function shareList(){if(!doc)return;const title=entry?.note?.title||"Compras";
    const lines=doc.items.filter(i=>i.selected).map(i=>{const subtotal=shoppingSubtotal(i,doc.store);return `${i.bought?"✓ ":"☐ "}${i.name} · ${i.quantity} ${i.unit}${subtotal.amount===undefined?" · Sin precio":" · "+money(subtotal.amount,subtotal.currency)}`;});
    try{await Share.share({message:[title,...lines].join("\n")});}catch(e){setError((e as Error).message);}}
  async function newList(name:string){if(!scope)return;try{const row=await createShoppingList(scope,()=>latest.current.visible&&latest.current.ready&&latest.current.identity===identity,name);setEntry(row);setListName("");setScreen("add");setOrbit(null);setUtility(null);setError("");setRestoreId(null);await refreshLists();}catch(e){setError((e as Error).message);}}
  if(!visible)return null;
  return <GoScreenModal visible animationType="slide" onRequestClose={back}>
    <GestureHandlerRootView style={s.root}><KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":"height"} style={[s.root,{paddingTop:insets.top,paddingBottom:Math.max(8,insets.bottom),paddingHorizontal:Math.max(insets.left,insets.right)}]}>
      <View style={[s.header,listHome&&s.listHeader,orbitHome&&s.orbitHeader,!!editor&&{display:"none"}]}>
        {listHome?<><View testID="shopping-live-totals" accessibilityLiveRegion="polite" style={s.summaryRow}>
          <TouchableOpacity testID="shopping-store" accessibilityRole="button" accessibilityLabel="Seleccionar supermercado" style={s.storeCard} onPress={()=>{setStoreName(doc.store||"");setUtility("store");}}>
            <Feather name="shopping-cart" size={22} color="#0879ca"/><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.75} style={s.storeName}>{doc.store||"Supermercado"}</Text><Feather name="chevron-down" size={16} color="#224b7c"/>
          </TouchableOpacity>
          <View style={[s.totalCard,s.currentTotal]}><Text style={s.totalLabel}>Compra</Text><Text testID="shopping-picked-total" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.7} style={s.totalAmount}>{displayTotal(pickedTotals)}</Text>{!!pickedTotals.unknown&&<Text style={s.totalUnknown}>+ {pickedTotals.unknown} sin precio</Text>}</View>
          <View style={s.totalCard}><Text style={s.totalLabel}>Total prev.</Text><Text testID="shopping-estimate" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.7} style={s.totalAmount}>{displayTotal(totals)}</Text>{!!totals.unknown&&<Text style={s.totalUnknown}>+ {totals.unknown} sin precio</Text>}</View>
        </View><TouchableOpacity testID="shopping-active-list" accessibilityRole="button" accessibilityLabel="Gestionar listas de compra" onPress={()=>{setListName("");setUtility("lists");void refreshLists();}} style={s.activeListBar}><Text numberOfLines={1} style={s.activeListName}>{entry?.note?.title||"Compras"}</Text><Text style={s.savedLabel}>Guardado · Mis listas ›</Text></TouchableOpacity></>:orbitHome?<LinearGradient colors={["#ffffff","#e9f4ff","#cfe8ff"]} style={s.orbitBanner}><View style={s.bannerCart}><Feather name="shopping-cart" size={27} color="#fff"/></View><View style={{flex:1}}><Text accessibilityRole="header" style={s.bannerTitle}>GO Compras</Text><Text style={s.bannerSubtitle}>Añadir productos</Text></View><Text style={s.bannerArt}>🧺</Text></LinearGradient>
          :<Text accessibilityRole="header" style={s.heading}>{editor?(editor.expectedRevision?"Editar producto":"Añadir producto"):next?"Habituales":legacy?"Incorporar nota":utility==="assistant"?"GO Compras":utility==="lists"?"Mis listas":utility==="route"?"Ruta de compra":utility==="map"?"Mapa de la tienda":utility==="history"?"Compras realizadas":utility==="store"?"Supermercado":utility==="location"?"Ubicación manual":adding?"Elegir producto":"Compras"}</Text>}
      </View>
      {!ready||!scope?<Text style={s.message}>{accessMessage}</Text>:loading?<Text style={s.message}>Abriendo tu lista personal…</Text>:null}
      {!!error&&<View style={s.message}><Text testID="shopping-error" accessibilityRole="alert" style={s.error}>{error}</Text>{!doc&&restoreId&&button("Restaurar mi lista",confirmRestore,"shopping-restore",true,loading)}{!doc&&restoreId&&button("Crear otra lista",()=>void newList("Compras"),"shopping-create-after-delete",false,loading)}{!doc&&button("Reintentar",()=>setRetry(v=>v+1),"shopping-retry",false,loading)}</View>}
      {doc&&<>
      <View style={[{flex:1,minHeight:0},(panel||adding)&&{display:"none"}]}>
        <ShoppingReorderSurface enabled={!busy&&!panel&&!adding&&!keyboard.visible&&!loading} onDrop={reorder} onDragging={setDragging} scrollRef={scroll}
          initialOffset={shoppingPositions.get(identity)||0} onOffsetChange={offset=>shoppingPositions.set(identity,offset)}>
          {doc.pendingEditor&&!editor&&<TouchableOpacity testID="shopping-resume-draft" accessibilityRole="button" onPress={()=>{setEditor(doc.pendingEditor!);draftRef.current=doc.pendingEditor!;}} style={s.draftNotice}><Text style={s.hint}>Continuar producto pendiente: {doc.pendingEditor.name||"sin nombre"}</Text></TouchableOpacity>}
          {more&&<View style={s.details}>
            <View style={s.row}>{([["pending","Pendientes"],["all","Todos"],["bought","Cogidos"]] as const).map(([key,label])=><React.Fragment key={key}>{button(label,()=>{if(!dragging)setFilter(key);},"shopping-filter-"+key,filter===key,dragging)}</React.Fragment>)}</View>
            {button("Habituales",()=>{setNext([]);setArrange(false);},"shopping-next")}
            {button("Compras realizadas",()=>{setRepeat(null);setUtility("history");},"shopping-history")}
            {button("Guardar compra en el historial",()=>Alert.alert("Guardar compra en el historial","Se guardarán los productos marcados como cogidos con sus precios. Los pendientes seguirán en la lista.",[{text:"Cancelar",style:"cancel"},{text:"GUARDAR",onPress:()=>action({type:"finish",confirmed:true})}]),"shopping-finish",false,!items.some(i=>i.selected&&i.bought))}
            {button(arrange?"Terminar orden":"Ordenar secciones",()=>setArrange(v=>!v),"shopping-arrange-categories",arrange,dragging)}
            {oldNotes.map((old,index)=><React.Fragment key={old.id}>{button("Revisar Compras antigua "+(index+1),()=>{setLegacy(old);setLegacySelected([]);},"shopping-legacy-"+index)}</React.Fragment>)}
          </View>}
          {visibleShopping(doc,filter).filter(group=>arrange||group.items.length||doc.collapsed.includes(group.category)&&items.some(i=>i.category===group.category)).map(({category,items:visibleItems})=>{
            const definition=SHOPPING_CATEGORIES.find(c=>c[0]===category)!,collapsed=doc.collapsed.includes(category),showHeader=more||arrange||collapsed;
            const target={id:category,group:"categories",kind:"column" as const,label:definition[2]};
            return <View key={category} testID={"shopping-section-"+category} style={s.section}>
              {showHeader&&<ShoppingReorderRow target={target}><View style={s.row}>
                <TouchableOpacity testID={"shopping-collapse-"+category} accessibilityRole="button" accessibilityLabel={(collapsed?"Expandir ":"Contraer ")+definition[2]} accessibilityState={{expanded:!collapsed}} disabled={busy||dragging} style={{flex:1,minHeight:44,justifyContent:"center"}} onPress={()=>action({type:"collapse",category,value:!collapsed})}><Text style={s.sectionTitle}>{definition[2]} {collapsed?"+":"−"}</Text></TouchableOpacity>
                {arrange&&<ShoppingReorderHandle target={target}/>}</View></ShoppingReorderRow>}
              {!arrange&&visibleItems.map(({item})=>{const target={id:item.id,group:category,kind:"card" as const,label:item.name};return <ShoppingReorderRow key={item.id} target={target}><ShoppingProductRow item={item} doc={doc} handedness={handedness} disabled={busy||dragging} onOperation={op=>operate(op,false)} onEdit={()=>startEditor(item)} onRemove={()=>Alert.alert("Retirar de esta lista",`¿Retirar «${item.name}»? El producto y sus precios se conservan.`,[{text:"Cancelar",style:"cancel"},{text:"RETIRAR",style:"destructive",onPress:()=>action({type:"select",id:item.id,value:false})}])} onRoute={()=>openRoute(item)} onLocation={()=>{setUtilityItem(item);setAisle(doc.locations?.find(l=>l.store===doc.store&&l.itemId===item.id)?.aisle||"");setUtility("location");}} dragHandle={filter==="all"?<ShoppingReorderHandle target={target}/>:undefined}/></ShoppingReorderRow>;})}
            </View>;
          })}
          {!items.length&&<Text style={s.hint}>Tu lista está lista. Pulsa Añadir para elegir productos.</Text>}
          {!!items.length&&!visibleShopping(doc,filter).some(g=>g.items.length)&&<Text style={s.hint}>No hay productos en esta vista.</Text>}
        </ShoppingReorderSurface>
      </View>
      {adding&&!panel&&<View testID="shopping-add-screen" style={{flex:1,minHeight:0}}>
        {orbit?<ScrollView testID="shopping-products-scroll" keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal:12,paddingTop:8,paddingBottom:16,gap:6}}>
          <Text accessibilityRole="header" style={s.sectionTitle}>{orbit==="search"?"Buscar producto":subgroup||SHOPPING_ORBITS.find(o=>o.id===orbit)?.label}</Text>
          {orbit==="search"&&<TextInput testID="shopping-product-search" accessibilityLabel="Buscar producto" value={searchQuery} onChangeText={setSearchQuery} style={s.input} placeholder="Escribe el producto" autoFocus/>}
          {orbit==="search"&&!!searchQuery.trim()&&items.filter(item=>shoppingName(item.name).includes(shoppingName(searchQuery))).map(item=><TouchableOpacity key={item.id} testID={"shopping-saved-"+item.id} accessibilityRole="button" accessibilityLabel={item.name+", "+(item.selected?"en lista, editar":"recuperar")} onPress={()=>item.selected?startEditor(item):void chooseCatalog(item.name,item.category)} style={s.catalogRow}><Text style={s.catalogIcon}>🛒</Text><Text style={s.catalogName}>{item.name}</Text><Text style={s.catalogStatus}>{item.selected?"En lista":"Recuperar"}</Text></TouchableOpacity>)}
          {orbit==="favorites"?shoppingFavorites(doc).map(item=><TouchableOpacity key={item.id} testID={"shopping-favorite-item-"+item.id} accessibilityRole="button" accessibilityLabel={item.name+", "+(item.selected?"en lista, editar":"añadir a la lista")} onPress={()=>item.selected?startEditor(item):void chooseCatalog(item.name,item.category)} style={s.catalogRow}><Text style={s.catalogIcon}>⭐</Text><Text style={s.catalogName}>{item.name}</Text><Text style={s.catalogStatus}>{item.selected?"En lista":"Añadir"}</Text></TouchableOpacity>):
            !subgroup&&orbit!=="search"?shoppingCatalogGroups(orbit).map((group,index)=><TouchableOpacity key={group.label+index} testID={"shopping-subgroup-"+index} accessibilityRole="button" accessibilityLabel={group.label} onPress={()=>setSubgroup(group.label)} style={s.catalogRow}><Feather name="folder" size={21} color="#2177bd"/><Text style={s.catalogName}>{group.label}</Text><Feather name="chevron-right" size={20} color="#527ca3"/></TouchableOpacity>):
            orbit==="search"&&!searchQuery.trim()?<Text style={s.hint}>Escribe el nombre para buscar en todas las categorías.</Text>:
            shoppingCatalogGroups(orbit,orbit==="search"?searchQuery:"").filter(group=>!subgroup||group.label===subgroup).map((group,index)=><View key={group.orbit+group.label+index} style={{gap:4}}><Text style={s.catalogGroup}>{group.label}</Text>{group.products.map(name=>{const existing=shoppingCatalogItem(doc,group.category,name);return <ShoppingCatalogChoice key={name} testID={"shopping-catalog-"+group.orbit+"-"+name} name={name} art={SHOPPING_ORBITS.find(o=>o.id===group.orbit)?.art||"🛒"} status={existing?.selected?"En lista":existing?"Recuperar":"Añadir"} onChoose={()=>void chooseCatalog(name,group.category)}/>;})}</View>)}
          {orbit==="favorites"&&!shoppingFavorites(doc).length&&<Text style={s.hint}>Aún no tienes favoritos. Márcalos desde cada producto.</Text>}
          {(orbit==="other"||orbit==="search")&&button("Producto personalizado",()=>startEditor(undefined,orbit==="search"?searchQuery:"",orbit==="search"?suggestShoppingCategory(searchQuery,doc):"other"),"shopping-new-product")}
        </ScrollView>:<LinearGradient colors={["#ffffff","#f4faff","#e7f4ff"]} style={{flex:1}}><ScrollView testID="shopping-orbit-scroll" contentContainerStyle={{flexGrow:1,justifyContent:"center",alignItems:"center",paddingBottom:12}}>
          <View style={{flexDirection:"row",gap:8,alignItems:"center"}}><TouchableOpacity testID="shopping-search-open" accessibilityRole="button" accessibilityLabel="Buscar producto" onPress={()=>{setSearchQuery("");setSubgroup(null);setOrbit("search");}} style={s.searchEntrance}><Feather name="search" size={18} color="#316b9a"/><Text style={s.searchEntranceText}>Buscar producto</Text></TouchableOpacity><TouchableOpacity testID="shopping-manage-lists" accessibilityRole="button" accessibilityLabel="Mis listas de compra" onPress={()=>{setListName("");setUtility("lists");void refreshLists();}} style={s.searchEntrance}><Feather name="list" size={18} color="#316b9a"/><Text style={s.searchEntranceText}>Mis listas</Text></TouchableOpacity></View>
          <View testID="shopping-eight-orbits" style={{width:orbital.size,height:orbital.height}}>
            <View pointerEvents="none" style={[s.orbitRing,{left:orbital.button/2,top:orbital.buttonHeight/2,width:orbital.size-orbital.button,height:orbital.height-orbital.buttonHeight}]}/>
            {SHOPPING_ORBITS.map((o,index)=><TouchableOpacity key={o.id} testID={"shopping-orbit-"+o.id} accessibilityRole="button" accessibilityLabel={o.label} onPress={()=>{setSubgroup(null);setOrbit(o.id);}} style={[s.orbit,{left:orbital.points[index].x,top:orbital.points[index].y,width:orbital.button,minHeight:orbital.buttonHeight,borderRadius:orbital.buttonHeight/2}]}><Text style={[s.orbitArtwork,o.id==="other"&&s.orbitDots]}>{o.art}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.8} style={s.orbitLabel}>{o.label}</Text></TouchableOpacity>)}
            <TouchableOpacity testID="shopping-go-orbit" accessibilityRole="button" accessibilityLabel="Hablar o escribir a GO Compras" onPress={go} style={[s.goOrbit,{left:(orbital.size-orbital.center)/2,top:(orbital.height-orbital.center)/2,width:orbital.center,height:orbital.center,borderRadius:orbital.center/2}]}><Feather name="mic" size={28} color="#10315a"/><Text style={s.goOrbitText}>GO</Text></TouchableOpacity>
          </View>
        </ScrollView></LinearGradient>}
      </View>}
      {editor&&<ScrollView ref={editScroll} testID="shopping-editor-scroll" keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" style={{flex:1,minHeight:0}} contentContainerStyle={{padding:12,flexGrow:1,justifyContent:"flex-end"}}><View style={s.editorCard}>
        {field("name","Producto",{onChangeText:name=>change({name,...(editor.category==="other"?{category:suggestShoppingCategory(name,doc)}:{})}),autoCapitalize:"sentences"})}
        <View style={[s.row,{flexWrap:"nowrap"}]}><TouchableOpacity testID="shopping-editor-minus" accessibilityRole="button" accessibilityLabel="Restar cantidad" onPress={()=>stepDraftQuantity(-1)} style={s.editorStep}><Feather name="minus" size={20} color="#0876ca"/></TouchableOpacity><View style={{flex:1}}>{field("quantity","Cantidad",{keyboardType:"decimal-pad"})}</View><TouchableOpacity testID="shopping-editor-plus" accessibilityRole="button" accessibilityLabel="Sumar cantidad" onPress={()=>stepDraftQuantity(1)} style={s.editorStep}><Feather name="plus" size={20} color="#0876ca"/></TouchableOpacity>{button(editor.unit,()=>setOptions(v=>!v),"shopping-unit-picker")}</View>
        {options&&<View style={s.row}>{SHOPPING_UNITS.map(unit=><React.Fragment key={unit}>{button(unit,()=>{change({unit});setOptions(false);},"shopping-unit-"+unit,editor.unit===unit)}</React.Fragment>)}</View>}
        {field("price",`Precio (${editor.currency==="EUR"?"€":editor.currency}/${priceBasis(editor)}) · opcional`,{keyboardType:"decimal-pad"})}
        {field("brand","Marca · opcional")}
        {button(more?"Ocultar detalles":"Más detalles",()=>{setMore(v=>!v);setEditorDetails(null);},"shopping-editor-options")}
        {more&&<View style={s.row}>
          {button("Producto",()=>setEditorDetails(editorDetails==="product"?null:"product"),"shopping-details-product",editorDetails==="product")}
          {button("Precio",()=>setEditorDetails(editorDetails==="price"?null:"price"),"shopping-details-price",editorDetails==="price")}
          {button("Historial de precios",()=>setEditorDetails(editorDetails==="history"?null:"history"),"shopping-details-prices",editorDetails==="history")}
        </View>}
        {more&&editorDetails==="product"&&<>
          {field("format","Formato · opcional")}
          {field("variety","Variedad · opcional")}
          {field("packageQuantity","Tamaño del envase",{keyboardType:"decimal-pad"})}
          <View style={s.row}>{(["kg","g","litros","ml","unidades"] as MeasureUnit[]).map(unit=><React.Fragment key={unit}>{button(unit,()=>change({packageUnit:unit}),"shopping-package-unit-"+unit,editor.packageUnit===unit)}</React.Fragment>)}</View>
          <Text style={s.label}>Categoría</Text><View style={s.row}>{SHOPPING_CATEGORIES.map(([id,,label])=><React.Fragment key={id}>{button(label,()=>change({category:id}),"shopping-category-"+id,editor.category===id)}</React.Fragment>)}</View>
          {field("notes","Observaciones")}
          {checkButton("Producto habitual",editor.usual,()=>change({usual:!editor.usual}),"shopping-usual")}
          {checkButton("Favorito por marca y presentación",editor.favorite||false,()=>change({favorite:!editor.favorite}),"shopping-editor-favorite")}
        </>}
        {more&&editorDetails==="price"&&<>
          {field("store","Supermercado del precio")}
          {field("currency","Moneda")}{field("observedOn","Fecha de observación · AAAA-MM-DD")}
          {field("priceQuantity","Contenido al que corresponde el precio",{keyboardType:"decimal-pad"})}
          <View style={s.row}>{(["kg","g","litros","ml","unidades"] as MeasureUnit[]).map(unit=><React.Fragment key={unit}>{button(unit,()=>change({priceUnit:unit}),"shopping-price-unit-"+unit,editor.priceUnit===unit)}</React.Fragment>)}</View>
        </>}
        {more&&editorDetails==="history"&&<>
          {items.find(i=>i.id===editor.id)?.prices.map(p=>{const n=normalizedShoppingPrice(p);return <View key={p.id} testID={"shopping-price-"+p.id} style={s.details}><Text style={s.text}>{p.store} · {p.observedOn} · {money(p.price,p.currency)}/{p.purchaseUnit}</Text><Text style={s.hint}>{p.brand} · {p.format} · {n?money(n.value,p.currency)+"/"+n.unit:"Sin medida comparable"}</Text>{button("Usar para estimación",()=>action({type:"selectPrice",id:editor.id,priceId:p.id}),"shopping-use-price-"+p.id,items.find(i=>i.id===editor.id)?.selectedPriceId===p.id)}</View>;})}
          {comparableShoppingPrices(items.find(i=>i.id===editor.id)?.prices||[]).map((group,index)=><View key={index} testID="shopping-price-comparison" style={s.details}><Text style={s.label}>Misma marca, variedad y formato</Text>{group.map(p=><Text key={p.id} style={s.text}>{p.store}: {money(normalizedShoppingPrice(p)!.value,p.currency)}/{normalizedShoppingPrice(p)!.unit} · {p.observedOn}</Text>)}</View>)}
        </>}
        {(more||draftStatus.startsWith("Borrador pendiente"))&&<Text testID="shopping-draft-status" accessibilityLiveRegion="polite" style={s.hint}>{draftStatus}</Text>}
        {draftStatus.startsWith("Borrador pendiente")&&button("Reintentar guardar borrador",()=>writeDraft(editor),"shopping-retry-draft")}
        {more&&button("Descartar borrador",()=>Alert.alert("Descartar borrador","El producto guardado y sus precios se conservarán.",[{text:"Cancelar",style:"cancel"},{text:"DESCARTAR",style:"destructive",onPress:()=>{if(doc.pendingEditor&&doc.pendingEditor.id!==editor.id){setEditor(null);draftRef.current=null;draftSequence.current++;return;}void operate({type:"draft"}).then(()=>{setEditor(null);draftRef.current=null;draftSequence.current++;}).catch(()=>{});}}]),"shopping-discard-draft")}
      </View></ScrollView>}
      {utility&&<ScrollView testID={"shopping-"+utility+"-scroll"} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:12}}>
        {utility==="lists"&&<>
          <Text style={s.hint}>Cada cambio queda guardado en este dispositivo.</Text>
          <TextInput testID="shopping-list-name" accessibilityLabel="Nombre de la lista" value={listName} onChangeText={setListName} style={s.input} placeholder="Nombre de la lista"/>
          {button("Crear lista",()=>void newList(listName),"shopping-list-create",false,!listName.trim())}
          {button("Renombrar lista actual",()=>{if(!scope||!entry)return;void renameShoppingList(scope,()=>latest.current.visible&&latest.current.ready&&latest.current.identity===identity,entry.id,listName).then(async row=>{setEntry(row);setListName("");await refreshLists();}).catch(e=>setError((e as Error).message));},"shopping-list-rename",false,!listName.trim())}
          {lists.map(list=><TouchableOpacity key={list.id} testID={"shopping-list-select-"+list.id} accessibilityRole="button" accessibilityLabel={(list.note?.title||"Compras")+(list.deleted?", en papelera":"")} onPress={()=>list.deleted?Alert.alert("Restaurar lista",list.note?.title||"Compras",[{text:"Cancelar",style:"cancel"},{text:"RESTAURAR",onPress:()=>{if(!scope)return;void restoreShoppingNote(scope,()=>latest.current.visible&&latest.current.ready&&latest.current.identity===identity,list.id).then(async row=>{setEntry(row);setUtility(null);setScreen("list");await refreshLists();}).catch(e=>setError((e as Error).message));}}]):void openList(list.id)} style={s.catalogRow}><Feather name={list.deleted?"trash-2":"list"} size={20} color="#2177bd"/><Text style={s.catalogName}>{list.note?.title||"Compras"}</Text><Text style={s.catalogStatus}>{list.deleted?"Restaurar":entry?.id===list.id?"Activa":"Abrir"}</Text></TouchableOpacity>)}
          {button("Compartir lista",()=>void shareList(),"shopping-list-share")}
          {button("Eliminar lista actual",()=>Alert.alert("Eliminar lista","La lista quedará en la papelera y podrá recuperarse.",[{text:"Cancelar",style:"cancel"},{text:"ELIMINAR",style:"destructive",onPress:()=>{if(!scope||!entry)return;void deleteShoppingList(scope,()=>latest.current.visible&&latest.current.ready&&latest.current.identity===identity,entry.id).then(async()=>{await refreshLists();const next=lists.find(list=>list.id!==entry.id&&!list.deleted);if(next)await openList(next.id);else{setEntry(null);setUtility(null);setRetry(v=>v+1);}}).catch(e=>setError((e as Error).message));}}]),"shopping-list-delete")}
        </>}
        {utility==="store"&&<>
          <TextInput testID="shopping-store-name" accessibilityLabel="Nombre del supermercado" value={storeName} onChangeText={setStoreName} style={s.input} placeholder="Nombre del supermercado"/>
          {button("Usar supermercado",()=>{void operate({type:"store",value:storeName}).then(()=>setUtility(null)).catch(()=>{});},"shopping-store-save",true)}
          {[...new Set(items.flatMap(i=>[i.preferredStore||"",...i.prices.map(p=>p.store)]).filter(Boolean))].map(name=><React.Fragment key={name}>{button(name,()=>{void operate({type:"store",value:name}).then(()=>setUtility(null)).catch(()=>{});},"shopping-store-option-"+name)}</React.Fragment>)}
        </>}
        {utility==="location"&&utilityItem&&<>
          <Text style={s.text}>{utilityItem.name} · {doc.store||"Selecciona primero un supermercado"}</Text>
          <TextInput testID="shopping-aisle" accessibilityLabel="Pasillo anotado por ti" value={aisle} onChangeText={setAisle} style={s.input} placeholder="Pasillo o referencia que conoces"/>
          {button("Guardar referencia",()=>{void operate({type:"location",id:utilityItem.id,aisle}).then(()=>setUtility(null)).catch(()=>{});},"shopping-location-save",true,!doc.store)}
        </>}
        {utility==="route"&&route&&<>
          <Text testID="shopping-route-status" style={s.hint}>Recorrido orientativo. No hay un plano interior ni posicionamiento disponible para esta tienda. Los pasillos anotados por ti sirven de referencia.</Text>
          {!!utilityItem&&<View style={s.details}><Text style={s.product}>{utilityItem.name}</Text><Text style={s.text}>{doc.locations?.find(l=>l.store===doc.store&&l.itemId===utilityItem.id)?.aisle||"Sin ubicación conocida. Consulta al personal de la tienda."}</Text></View>}
          {route.steps.map(({item,aisle},index)=><View key={item.id} style={[s.details,s.row]}><View style={{flex:1}}><Text style={s.text}>{index+1}. {item.name}</Text><Text style={s.hint}>{aisle||"Sin ubicación conocida"}{item.category==="frozen"?" · congelado":["dairy","meat","fish"].includes(item.category)?" · refrigerado":""}</Text></View>{checkButton("Cogido",item.bought,()=>action({type:"bought",id:item.id,value:true}),"shopping-route-bought-"+item.id)}</View>)}
          {!route.steps.length&&<Text style={s.text}>No quedan productos pendientes.</Text>}
          <Text style={s.hint}>{route.checkout?"Termina en caja: "+(route.checkout.aisle||"Caja del plano"):"Caja sin ubicación conocida."}</Text>
        </>}
        {utility==="map"&&<View style={s.details}><Text style={s.text}>No hay plano interior de {doc.store||"esta tienda"}. Puedes guardar pasillos conocidos desde cada producto y consultar la ruta orientativa.</Text>{button("Ver ruta",()=>setUtility("route"),"shopping-map-route")}</View>}
        {utility==="history"&&<>
          {!doc.purchases?.length&&<Text style={s.hint}>Aún no hay compras archivadas. La lista actual se guarda automáticamente.</Text>}
          {[...(doc.purchases||[])].reverse().map(p=><View key={p.id} style={s.details}>
            <Text style={s.label}>{p.date} · {p.store||"Sin supermercado"}</Text>
            {repeat?.purchaseId===p.id?<>{p.items.map(i=><React.Fragment key={i.id}>{checkButton(
              `${i.name} · ${decimal(i.quantity)} ${i.unit}`,repeat.ids.includes(i.id),
              ()=>setRepeat(current=>current?.purchaseId===p.id?{purchaseId:p.id,ids:current.ids.includes(i.id)?current.ids.filter(id=>id!==i.id):[...current.ids,i.id]}:current),
              "shopping-history-select-"+i.id)}</React.Fragment>)}
              {button("Añadir seleccionados a la lista",()=>{const expected=identity,epoch=generation.current;void operate({type:"repeatPurchase",purchaseId:p.id,ids:repeat.ids}).then(()=>{
                if(active(expected,epoch)){setRepeat(null);setUtility(null);setScreen("list");setFilter("pending");}
              }).catch(()=>{});},"shopping-history-add",true,!repeat.ids.length)}
            </>:<>{p.items.map(i=><Text key={i.id} style={s.text}>{i.name} · {i.brand} · {decimal(i.quantity)} {i.unit}</Text>)}
              {button("Elegir productos para repetir",()=>setRepeat({purchaseId:p.id,ids:[]}),"shopping-history-repeat-"+p.id)}
            </>}
          </View>)}
        </>}
        {utility==="assistant"&&<>
          <Text accessibilityRole="header" style={s.heading}>¿Qué necesitas comprar?</Text><Text style={s.assistantExample}>«Añade dos litros de leche y seis huevos»</Text>
          <TextInput testID="shopping-command" accessibilityLabel="Orden para GO Compras" value={command} onChangeText={setCommand} onSubmitEditing={()=>void runCommand(command)} style={s.input} placeholder="Añade 2 kg de manzanas"/>
          {button("Ejecutar",()=>void runCommand(command),"shopping-command-send",true,!command.trim())}
          <TouchableOpacity testID="shopping-voice" accessibilityRole="button" accessibilityLabel={voice.status==="listening"?"Detener dictado":"Hablar con GO"} onPress={()=>{if(voice.status==="listening")void voice.stop();else{voiceIdentity.current=identity;void voice.start();}}} disabled={voice.status!=="idle"&&voice.status!=="listening"} style={s.voiceButton}><Feather name="mic" size={22} color="#fff"/><Text style={s.saveText}>{voice.status==="listening"?"Detener dictado":voice.status==="idle"?"Hablar":"Preparando…"}</Text></TouchableOpacity>
          {!!voice.error&&<Text accessibilityRole="alert" style={s.error}>{voice.error}</Text>}
          {!!answer&&<Text testID="shopping-command-result" accessibilityLiveRegion="polite" style={s.text}>{answer}</Text>}
        </>}
      </ScrollView>}
      {next&&<ScrollView testID="shopping-next-scroll" contentContainerStyle={{padding:16,gap:12}}><Text style={s.text}>Elige los productos habituales para repetir. Solo los elegidos volverán a PENDIENTE; se conservan todos los precios y secciones.</Text>
        {items.filter(i=>i.usual).map(i=><React.Fragment key={i.id}>{checkButton(i.name,next.includes(i.id),()=>setNext(ids=>ids?.includes(i.id)?ids.filter(id=>id!==i.id):[...(ids||[]),i.id]),"shopping-next-select-"+i.id)}</React.Fragment>)}
        {!items.some(i=>i.usual)&&<Text style={s.hint}>Marca «Producto habitual» al editar un producto para poder repetirlo.</Text>}
        {button("CONFIRMAR PRÓXIMA COMPRA",()=>Alert.alert("Preparar próxima compra",`Restablecer ${next.length} productos elegidos a PENDIENTE. El resto conserva su estado.`,[{text:"Cancelar",style:"cancel"},{text:"PREPARAR",onPress:()=>{void operate({type:"next",ids:next,confirmed:true}).then(()=>{setNext(null);setFilter("pending");}).catch(()=>{});}}]),"shopping-next-confirm",false,!next.length)}
      </ScrollView>}
      {legacy&&<ScrollView contentContainerStyle={{padding:16,gap:12}} testID="shopping-legacy-scroll"><Text style={s.text}>Revisa cada línea de la nota antigua. Se incorporará como nombre con cantidad 1. La nota de origen se conserva; los nombres ya existentes se omiten.</Text>
        {legacyShoppingCandidates(legacy.note?.content??legacy.detail??"").map((name,index)=><React.Fragment key={index}>{checkButton(name,legacySelected.includes(name),()=>setLegacySelected(values=>values.includes(name)?values.filter(v=>v!==name):[...values,name]),"shopping-legacy-select-"+index)}</React.Fragment>)}
        {button("INCORPORAR SELECCIONADOS",()=>Alert.alert("Incorporar productos","¿Incorporar los nombres seleccionados sin modificar la nota antigua? Revisa después sus cantidades y unidades.",[{text:"Cancelar",style:"cancel"},{text:"INCORPORAR",onPress:()=>{void operate({type:"importLegacy",sourceId:legacy.id,names:legacySelected,confirmed:true}).then(()=>setLegacy(null)).catch(()=>{});}}]),"shopping-legacy-confirm",false,!legacySelected.length)}
      </ScrollView>}
      </>}
      {listHome&&<View testID="shopping-secondary-navigation" style={s.secondaryNav}>
        {navButton("shopping-purchase","Compra","shopping-cart",()=>{setFilter("all");setMore(false);},true)}
        {navButton("shopping-route","Ruta","navigation",()=>openRoute())}
        {navButton("shopping-map","Mapa","map",()=>setUtility("map"))}
        {navButton("shopping-favorites","Favoritos","star",()=>{setScreen("add");setSubgroup(null);setOrbit("favorites");setMore(false);})}
        {navButton("shopping-more","Más","grid",()=>setMore(value=>!value),more)}
      </View>}
      {!!doc&&<View testID="shopping-thumb-controls" style={[s.footer,{flexDirection:"row",paddingLeft:handedness==="left"?70:12,paddingRight:handedness==="right"?70:12}]}>
        <TouchableOpacity testID="shopping-list" accessibilityRole="button" accessibilityLabel="Volver a la lista de compra" disabled={busy||dragging} style={s.listTab}
          onPress={()=>{if(editor&&(draftStatus==="Guardando borrador…"||draftStatus.startsWith("Borrador pendiente"))){setError("Espera a guardar el borrador antes de volver a la lista.");return;}voice.abort();setEditor(null);draftRef.current=null;setUtility(null);setNext(null);setLegacy(null);if(listHome){setListName("");setUtility("lists");void refreshLists();}else{setScreen("list");setOrbit(null);setSubgroup(null);}}}><Feather name="list" size={21} color="#123e72"/><Text style={s.listTabText}>Lista</Text></TouchableOpacity>
        {(listHome||orbitHome)&&<TouchableOpacity testID="shopping-go" accessibilityRole="button" accessibilityLabel="Hablar o escribir a GO Compras" disabled={busy||dragging} onPress={go} style={s.go}><Feather name="mic" size={19} color="#fff"/><Text style={s.goText}>GO</Text></TouchableOpacity>}
        {(listHome||orbitHome)&&<TouchableOpacity testID="shopping-add" accessibilityRole="button" accessibilityLabel="Volver a las categorías de productos" disabled={busy||dragging} style={s.addTab} onPress={()=>{setUtility(null);setNext(null);setLegacy(null);setScreen("add");setOrbit(null);setSubgroup(null);setSearchQuery("");setMore(false);}}><Feather name="plus" size={20} color="#fff"/><Text style={s.addTabText}>Añadir</Text></TouchableOpacity>}
        {!!editor&&<TouchableOpacity testID="shopping-save" accessibilityRole="button" accessibilityLabel="Guardar producto" disabled={busy} onPress={()=>void save()} style={s.saveTab}><Text style={s.saveText}>GUARDAR</Text></TouchableOpacity>}
      </View>}
    <GoNavigationFloating screenKey={"shopping-"+(editor?"editor":utility?utility:next?"next":legacy?"legacy":adding?(subgroup?"products-"+orbit+"-"+shoppingName(subgroup):orbit?"groups-"+orbit:"orbit"):"list")} safeArea={false} handedness={handedness} keyboardResponsive keyboardVisible={keyboard.visible} protectedTop={insets.top+48} protectedBottom={Math.max(8,insets.bottom)+4} initialBottom={4}>
      <GoCloseButton testID="shopping-back" level="panel" appearance="light" touchSize={56} hitSlop={0} disabled={busy||dragging} keyboardVisible={keyboard.visible} onPress={back} accessibilityLabel={keyboard.visible?"Ocultar teclado":panel||arrange||adding?"Volver a COMPRAS":"Volver a NOTAS"}/>
    </GoNavigationFloating>
    </KeyboardAvoidingView>
    </GestureHandlerRootView>
  </GoScreenModal>;
}
const s=StyleSheet.create({
  root:{flex:1,backgroundColor:"#f7fbff"},header:{paddingHorizontal:14,paddingTop:8,paddingBottom:8},listHeader:{paddingHorizontal:8,paddingTop:5,paddingBottom:7},orbitHeader:{paddingHorizontal:14,paddingTop:6,paddingBottom:4},heading:{fontSize:20,fontWeight:"700",color:"#172d51"},
  summaryRow:{flexDirection:"row",alignItems:"stretch",gap:6},activeListBar:{minHeight:32,flexDirection:"row",alignItems:"center",gap:8,paddingHorizontal:5},activeListName:{fontSize:13,fontWeight:"700",color:"#173a68",flex:1},savedLabel:{fontSize:11,color:"#587087"},storeCard:{flex:1.5,minWidth:0,minHeight:69,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5,paddingHorizontal:7,borderRadius:15,borderWidth:1,borderColor:"#dce5f2",backgroundColor:"#fff",shadowColor:"#284568",shadowOpacity:.1,shadowRadius:5,shadowOffset:{width:0,height:2}},storeName:{flex:1,minWidth:0,fontSize:15,fontWeight:"700",color:"#153861"},
  totalCard:{flex:1,minWidth:0,minHeight:69,alignItems:"center",justifyContent:"center",paddingHorizontal:3,borderRadius:15,borderWidth:1,borderColor:"#e3e8f0",backgroundColor:"#f8fbff",shadowColor:"#284568",shadowOpacity:.06,shadowRadius:4,shadowOffset:{width:0,height:2}},currentTotal:{backgroundColor:"#ebf6ff",borderColor:"#d9ebfa"},totalLabel:{fontSize:11,fontWeight:"600",color:"#45617c"},totalAmount:{fontSize:17,fontWeight:"800",color:"#17477a",textAlign:"center"},totalUnknown:{fontSize:9,color:"#617486",textAlign:"center"},
  orbitBanner:{minHeight:77,borderRadius:24,borderWidth:1,borderColor:"#dbeafa",paddingHorizontal:16,flexDirection:"row",alignItems:"center",gap:12,shadowColor:"#3474b1",shadowOpacity:.13,shadowRadius:9,shadowOffset:{width:0,height:4}},bannerCart:{width:46,height:46,borderRadius:23,backgroundColor:"#087deb",alignItems:"center",justifyContent:"center",borderWidth:2,borderColor:"#acd8ff"},bannerTitle:{fontSize:25,fontWeight:"800",color:"#133361"},bannerSubtitle:{fontSize:17,fontWeight:"700",color:"#5da0d9"},bannerArt:{fontSize:35},
  hint:{fontSize:12,color:"#647c92",lineHeight:18},text:{fontSize:15,color:"#304c64",flexShrink:1},label:{fontSize:12,fontWeight:"600",color:"#607b91"},sectionTitle:{fontSize:14,fontWeight:"700",color:"#416d95",flexShrink:1},row:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:6},
  button:{minHeight:44,minWidth:44,paddingVertical:9,paddingHorizontal:11,borderWidth:1,borderColor:"#dce7f0",borderRadius:11,backgroundColor:"#fff",justifyContent:"center"},chosen:{backgroundColor:"#277ec1",borderColor:"#277ec1"},buttonText:{fontSize:13,fontWeight:"600",color:"#416b8d",textAlign:"center",flexShrink:1},checked:{backgroundColor:"#e5f0fa"},
  input:{minHeight:48,borderWidth:1,borderColor:"#cfdeeb",backgroundColor:"#fff",borderRadius:11,fontSize:16,color:"#29465e",padding:11},section:{gap:5},product:{fontSize:16,fontWeight:"600",color:"#2a4a64",flexShrink:1},details:{gap:8,padding:12,backgroundColor:"#f5f9fd",borderWidth:1,borderColor:"#e0eaf3",borderRadius:12},draftNotice:{gap:4,padding:8,backgroundColor:"#f4f9ff",borderRadius:12,borderWidth:1,borderColor:"#dce9f5"},
  searchEntrance:{minHeight:44,minWidth:0,flex:1,borderRadius:22,marginBottom:13,paddingHorizontal:10,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5,backgroundColor:"#fff",borderWidth:1,borderColor:"#dceafa"},searchEntranceText:{fontSize:13,fontWeight:"600",color:"#316b9a"},
  catalogRow:{minHeight:48,flexDirection:"row",alignItems:"center",gap:9,paddingHorizontal:11,paddingVertical:5,backgroundColor:"#fff",borderRadius:12,borderWidth:1,borderColor:"#dce7f2"},catalogIcon:{fontSize:23,width:31,textAlign:"center"},catalogName:{flex:1,minWidth:0,fontSize:15,fontWeight:"600",color:"#17365f"},catalogStatus:{fontSize:12,fontWeight:"700",color:"#1872b5"},catalogGroup:{fontSize:13,fontWeight:"700",color:"#436d91",paddingTop:9,paddingBottom:3},assistantExample:{fontSize:17,fontWeight:"600",color:"#436d91",paddingVertical:8},voiceButton:{minHeight:52,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:10,backgroundColor:"#087def",borderRadius:15},
  editorCard:{gap:10,padding:14,backgroundColor:"#fff",borderRadius:22,borderWidth:1,borderColor:"#dce7f2",shadowColor:"#264e76",shadowOpacity:.12,shadowRadius:10,shadowOffset:{width:0,height:4}},editorStep:{width:44,minHeight:48,borderRadius:11,borderWidth:1,borderColor:"#cfdeeb",backgroundColor:"#fff",alignItems:"center",justifyContent:"center",alignSelf:"flex-end"},
  orbitRing:{position:"absolute",borderRadius:400,borderWidth:3,borderColor:"#9fd3fa",backgroundColor:"transparent"},orbit:{position:"absolute",padding:4,borderWidth:2,borderColor:"#fff",backgroundColor:"#fff",gap:1,alignItems:"center",justifyContent:"center",shadowColor:"#2776b0",shadowOpacity:.22,shadowRadius:8,shadowOffset:{width:0,height:4}},orbitArtwork:{fontSize:31,lineHeight:39},orbitDots:{fontSize:29,fontWeight:"800",color:"#168beb"},orbitLabel:{fontSize:11,fontWeight:"700",textAlign:"center",color:"#17365f"},
  goOrbit:{position:"absolute",alignItems:"center",justifyContent:"center",backgroundColor:"#f9cb55",borderWidth:5,borderColor:"#fff2ba",shadowColor:"#2875b3",shadowOpacity:.3,shadowRadius:14,shadowOffset:{width:0,height:5}},goOrbitText:{fontSize:43,fontWeight:"900",color:"#123466",lineHeight:47},
  secondaryNav:{minHeight:68,flexDirection:"row",alignItems:"center",gap:5,paddingHorizontal:8,paddingVertical:4,backgroundColor:"#f7fbff"},navItem:{flex:1,minWidth:0,minHeight:60,borderRadius:15,backgroundColor:"#fff",borderWidth:1,borderColor:"#e6eaf0",alignItems:"center",justifyContent:"center",gap:2,shadowColor:"#244c7b",shadowOpacity:.1,shadowRadius:5,shadowOffset:{width:0,height:3}},navSelected:{backgroundColor:"#0689ed",borderColor:"#43b1fb"},navText:{fontSize:11,fontWeight:"700",color:"#173a68"},
  footer:{minHeight:74,alignItems:"center",justifyContent:"space-between",gap:7,paddingVertical:5,backgroundColor:"#f7fbff"},listTab:{flex:1,minWidth:0,minHeight:56,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5,borderRadius:27,borderWidth:1,borderColor:"#dce4ef",backgroundColor:"#fff",shadowColor:"#244c7b",shadowOpacity:.1,shadowRadius:5,shadowOffset:{width:0,height:3}},listTabText:{fontSize:14,fontWeight:"700",color:"#173a68"},
  go:{width:68,height:68,borderRadius:34,alignItems:"center",justifyContent:"center",backgroundColor:"#0089ed",borderWidth:3,borderColor:"#b7eaff",shadowColor:"#1285c8",shadowOpacity:.28,shadowRadius:8,shadowOffset:{width:0,height:3}},goText:{color:"#fff",fontSize:22,fontWeight:"800"},addTab:{flex:1,minWidth:0,minHeight:56,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:3,borderRadius:27,backgroundColor:"#087def",borderWidth:1,borderColor:"#57b6ff",shadowColor:"#1376c5",shadowOpacity:.18,shadowRadius:6,shadowOffset:{width:0,height:3}},addTabText:{fontSize:14,fontWeight:"700",color:"#fff"},saveTab:{flex:1,minWidth:110,minHeight:56,borderRadius:22,alignItems:"center",justifyContent:"center",backgroundColor:"#0789e5",borderWidth:1,borderColor:"#54baff"},saveText:{fontSize:16,fontWeight:"800",color:"#fff"},
  error:{color:"#9e2929",fontSize:14},message:{padding:16,gap:8},smallAction:{minHeight:44,minWidth:44,flexDirection:"row",gap:6,alignItems:"center",justifyContent:"center"},
});
