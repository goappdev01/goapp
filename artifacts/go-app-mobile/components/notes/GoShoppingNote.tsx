import {ShoppingOrbitControl,ShoppingOrbitContents} from "./ShoppingOrbitControl";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View, type TextInputProps, type ViewInstance } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { GoAiIdentity } from "@/components/ai/GoAiIdentity";
import { assistantActivity } from "@/lib/goAiVisualState";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GoEntry } from "@/components/AgendaOperativa";
import { GoScreenModal } from "@/components/ui/GoScreenModal";
import { GO_NAVIGATION_SIZE } from "@/components/ui/GoCloseButton";
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
import { isShoppingQuantity, legacyShoppingCandidates, SHOPPING_QUANTITY_ERROR, sameShoppingPresentation, shoppingEditor, shoppingEstimate, shoppingId, shoppingName, shoppingPresentationPrice, stepShoppingDraftQuantity, suggestShoppingCategory, visibleShopping, groupedShopping,
  SHOPPING_CATEGORIES, type ShoppingDocument, type ShoppingEditorDraft, type ShoppingFilter, type ShoppingItem, type ShoppingOperation, type ShoppingCatalogReference } from "@/lib/shoppingNote";
import { SHOPPING_ORBITS, SHOPPING_ENTRANCES, shoppingCommand, shoppingOrbitLayout, shoppingOrbitTypography, shoppingRoute } from "@/lib/shoppingExperience";
import { shoppingCatalogGroups, shoppingPersonalCatalog, shoppingEntrance, shoppingCatalogItem, shoppingFavorites } from "@/lib/shoppingCatalog";
import { shoppingProductArt } from "@/lib/shoppingProductArt";
import { initialShoppingLandingText, shoppingLandingRows, shoppingShortcutLayout, shoppingThumbMenu, clipShoppingContent, shoppingCircleObstacles, type ShoppingLandingText } from "@/lib/shoppingScreenLayout";
import { shoppingShareText } from "@/lib/shoppingShare";
import { ShoppingProductRow } from "./ShoppingProductRow";
import { ShoppingCatalogChoice } from "./ShoppingCatalogChoice";
import { ShoppingReorderHandle, ShoppingReorderRow, ShoppingReorderSurface } from "./ShoppingReorderSurface";

type Props={visible:boolean;scope:TaskScope|null;ready:boolean;handedness:"left"|"right";onClose:()=>void;closeRequested?:boolean;initialListId?:string};
type InputOperation=ShoppingOperation extends infer O?O extends ShoppingOperation?Omit<O,"operationId">:never:never;
const decimal=(n:number)=>n.toLocaleString("es-ES",{maximumFractionDigits:3});
const money=(n:number,currency:string)=>n.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})+" "+(currency==="EUR"?"€":currency);
// Only view position is cached; product data always comes from the verified canonical store.
const shoppingPositions=new Map<string,number>();
export function GoShoppingNote({visible,scope,ready:scopeReady,handedness,onClose,closeRequested,initialListId}:Props){
  const admin=useAdminAccess(),view=useGoView();
  const isAdminView=view.view==="ADMIN";
  const authorizedAdmin=!!scope && view.isAdminView && admin.allowed
    && !admin.checking && !admin.unavailable && admin.userId===scope.userId;
  const personalScope=scope?.context==="live:USER" || scope?.context==="demo:USER";
  const businessScope=scope?.context==="live:BUSINESS" || /^demo:BUSINESS:[^:]+$/.test(scope?.context??"");
  // A retained scope from the previous view must never activate its lists or actions.
  const ready=scopeReady && (isAdminView ? authorizedAdmin && scope?.context==="live:ADMIN"
    : view.view==="USER" ? personalScope : view.view==="BUSINESS" && businessScope);
  const changingScope=scopeReady && !!scope && (isAdminView && authorizedAdmin && scope.context!=="live:ADMIN"
    || view.view==="USER" && !personalScope || view.view==="BUSINESS" && !businessScope);
  const accessMessage=!scopeReady || (isAdminView && admin.checking) || changingScope
    ? "Verificando tu acceso a Compras…"
    : !scope ? "Inicia sesión en GO para usar Compras."
    : isAdminView && admin.unavailable ? "No se pudo verificar el acceso ADMIN a Compras."
    : isAdminView ? "Necesitas acceso ADMIN verificado para usar Compras."
    : "No se pudo verificar el acceso a Compras en este perfil.";
  const insets=useSafeAreaInsets(),keyboard=useGoNoteKeyboard(visible);
  const viewport=useWindowDimensions();
  const frameRef=useRef<ViewInstance>(null),actionsRef=useRef<ViewInstance>(null),shortcutsRef=useRef<ViewInstance>(null),orbitRef=useRef<ViewInstance>(null),headerRef=useRef<ViewInstance>(null),listViewportRef=useRef<ViewInstance>(null),utilityContentRef=useRef<ViewInstance>(null),utilityViewportRef=useRef<ViewInstance>(null),orbitViewportRef=useRef<ViewInstance>(null);
  const [actionsHeight,setActionsHeight]=useState(68),[landingDockHeight,setLandingDockHeight]=useState(68+44+8+4);
  const orbitalControls=useRef(new Map<string,ViewInstance>());
  const registerOrbitControl=(id:string,node:ViewInstance|null)=>{if(node)orbitalControls.current.set(id,node);else orbitalControls.current.delete(id);};
  const fontScaleRef=useRef(viewport.fontScale);fontScaleRef.current=viewport.fontScale;
  const [shortcutText,setShortcutText]=useState({scale:viewport.fontScale,...initialShoppingLandingText(viewport.fontScale)});
  const recordShortcutText=(key:keyof ShoppingLandingText,width:number)=>{
    const scale=viewport.fontScale;if(!Number.isFinite(width)||width<=0||fontScaleRef.current!==scale)return;
    setShortcutText(old=>{const current=old.scale===scale?old:{scale,...initialShoppingLandingText(scale)};return Math.abs(current[key]-width)<.5?current:{...current,[key]:width};});
  };
  const obstacleMeasure=useRef(0);
  const [navigationObstacles,setNavigationObstacles]=useState<{x:number;y:number;width:number;height:number}[]>([]);
  const measureNavigationObstacles=()=>{const token=++obstacleMeasure.current;frameRef.current?.measureInWindow((fx,fy)=>{
    const orbitNodes=orbitRef.current?[...orbitalControls.current.values()]:[];
    const nodes=(orbitHome?orbitNodes:[shortcutsRef.current,actionsRef.current,...orbitNodes,headerRef.current,listViewportRef.current,utilityContentRef.current]).filter((node):node is ViewInstance=>!!node);
    if(!nodes.length)return;
    const measure=(viewport?:{x:number;y:number;width:number;height:number})=>{
      const rects:{x:number;y:number;width:number;height:number}[]=[];let remaining=nodes.length;
      nodes.forEach(node=>node.measureInWindow((x,y,width,height)=>{
        const measured=orbitHome&&orbitNodes.includes(node)?shoppingCircleObstacles({x,y,width,height}):[{x,y,width,height}];
        for(const rect of measured){const nativeRect=(node===utilityContentRef.current||orbitNodes.includes(node))&&viewport?clipShoppingContent(rect,viewport):rect;
          if(nativeRect.width>0&&nativeRect.height>0)rects.push({...nativeRect,x:nativeRect.x-fx,y:nativeRect.y-fy-insets.top-48});}
        if(!--remaining&&mounted.current&&token===obstacleMeasure.current)setNavigationObstacles(old=>JSON.stringify(old)===JSON.stringify(rects)?old:rects);
      }));
    };
    const clippingViewport=utilityContentRef.current?utilityViewportRef.current:orbitRef.current?orbitViewportRef.current:null;
    if(clippingViewport)clippingViewport.measureInWindow((x,y,width,height)=>measure({x,y,width,height}));else measure();
  });};
  const [entry,setEntry]=useState<GoEntry|null>(null),[lists,setLists]=useState<GoEntry[]>([]),[listName,setListName]=useState(""),[error,setError]=useState(""),[restoreId,setRestoreId]=useState<string|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
  const [filter,setFilter]=useState<ShoppingFilter>("all"),[arrange,setArrange]=useState(false),[dragging,setDragging]=useState(false);
  const [editor,setEditor]=useState<ShoppingEditorDraft|null>(null),[draftStatus,setDraftStatus]=useState(""),[next,setNext]=useState<string[]|null>(null);
  const [repeat,setRepeat]=useState<{purchaseId:string;ids:string[]}|null>(null);
  const [oldNotes,setOldNotes]=useState<GoEntry[]>([]),[legacy,setLegacy]=useState<GoEntry|null>(null),[legacySelected,setLegacySelected]=useState<string[]>([]);
  const [retry,setRetry]=useState(0),scroll=useRef<React.ElementRef<typeof ScrollView>>(null),editScroll=useRef<React.ElementRef<typeof ScrollView>>(null);
  const [screen,setScreen]=useState<"list"|"add">("add"),[orbit,setOrbit]=useState<string|null>(null),[subgroup,setSubgroup]=useState<string|null>(null),[more,setMore]=useState(false);
  const [searchQuery,setSearchQuery]=useState("");
  const [catalogSelection,setCatalogSelection]=useState<ShoppingCatalogReference[]>([]),[catalogMessage,setCatalogMessage]=useState("");
  const catalogSelectionRef=useRef(catalogSelection);catalogSelectionRef.current=catalogSelection;
  const [utility,setUtility]=useState<"lists"|"store"|"route"|"map"|"history"|"assistant"|"location"|null>(null),[utilityItem,setUtilityItem]=useState<ShoppingItem|null>(null);
  const [storeName,setStoreName]=useState(""),[aisle,setAisle]=useState(""),[command,setCommand]=useState(""),[answer,setAnswer]=useState("");
  const commandLock=useRef(false),voiceIdentity=useRef("");
  const mounted=useRef(true),generation=useRef(0),lock=useRef(false),draftSequence=useRef(0),draftRef=useRef(editor);draftRef.current=editor;
  const retries=useRef(new Map<string,string>());
  const rowContacts=useRef(new Map<string,{consumed:boolean;released:boolean}>());
  const rowContact=(id:string)=>{let contact=rowContacts.current.get(id);if(!contact){contact={consumed:false,released:false};rowContacts.current.set(id,contact);}return contact;};
  const identity=JSON.stringify(scope),latest=useRef({scope,ready,visible,identity});latest.current={scope,ready,visible,identity};
  const editorTarget=useRef<string|undefined>(undefined),catalogEditor=useRef(false);
  const currentEntry=useRef(entry);currentEntry.current=entry;
  const active=(expected:string,epoch:number)=>mounted.current&&latest.current.visible&&latest.current.ready&&latest.current.identity===expected&&generation.current===epoch;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
  useEffect(()=>{
    const epoch=++generation.current;setEntry(null);setLists([]);setEditor(null);setRepeat(null);setNext(null);setLegacy(null);setOldNotes([]);setError("");setRestoreId(null);setFilter("all");setArrange(false);setBusy(false);setScreen("add");setOrbit(null);setSubgroup(null);setSearchQuery("");setCatalogSelection([]);setCatalogMessage("");setUtility(null);setAnswer("");setCommand("");lock.current=false;retries.current.clear();rowContacts.current.clear();draftSequence.current++;
    if(!visible||!ready||!scope)return;
    const expected=identity,valid=()=>active(expected,epoch);setLoading(true);
    void openShoppingNote(scope,valid,initialListId).then(async row=>{
      const [old,known]=await Promise.all([oldShoppingNotes(scope,valid),listShoppingLists(scope,valid)]);if(!valid())return;setEntry(row);setLists(known);setEditor(null);setOldNotes(old);
      setDraftStatus(row.note!.shopping!.pendingEditor?"Borrador recuperado del teléfono. Revisa y guarda el producto.":"");
    }).catch(async e=>{if(valid()){setError((e as Error).message);setRestoreId(e instanceof ShoppingNoteDeletedError?e.noteId:null);try{const known=await listShoppingLists(scope,valid);if(valid())setLists(known);}catch{ /* Preserve the original failure; never repair malformed records implicitly. */ }}}).finally(()=>{if(valid())setLoading(false);});
    return()=>{generation.current++;};
  },[visible,ready,identity,retry,initialListId]);
  useEffect(()=>subscribeGoLog(()=>{
    const current=currentEntry.current;if(!current||!latest.current.ready||!latest.current.scope||!noteInScope(current,latest.current.scope))return;
    const snapshot=getGoLogSnapshot();const row=snapshot.find(row=>row.id===current.id&&noteInScope(row,latest.current.scope!));if(row)setEntry(row);setLists(snapshot.filter(row=>noteInScope(row,latest.current.scope!)&&row.note?.shopping));
  }),[]);
  const validView=visible&&ready&&scope&&entry&&noteInScope(entry,scope),doc=validView?entry.note?.shopping:undefined;
  const editorDocument=editorTarget.current&&editorTarget.current!==entry?.id?lists.find(row=>row.id===editorTarget.current)?.note?.shopping:doc;
  const editorItem=editor&&editorDocument?.items.find(item=>item.id===editor.id);
  const editorPrice=editorItem?shoppingPresentationPrice(editorItem,doc?.store):undefined;
  async function operate(input:InputOperation,blocking=true,targetListId=entry?.id){
    if(!scope||!ready||!entry||!noteInScope(entry,scope))throw Error("Espera a verificar tu acceso a Compras.");
    if(blocking&&lock.current)throw Error("Espera a que termine el guardado.");
    const expected=identity,epoch=generation.current,valid=()=>active(expected,epoch);
    const signature=JSON.stringify([targetListId,input]),operationId=retries.current.get(signature)||shoppingId();retries.current.set(signature,operationId);
    if(blocking){lock.current=true;setBusy(true);}setError("");
    try{
      const result=await runShoppingOperation(scope,valid,{...input,operationId} as ShoppingOperation,targetListId);retries.current.delete(signature);
      if(valid()){if(result.id===entry.id)setEntry(old=>(old?.note?.revision||0)>result.note!.revision?old:result);setLists(old=>old.map(row=>row.id===result.id?result:row));}
      return result;
    }catch(e){if(valid())setError((e as Error).message);throw e;}
    finally{if(blocking){lock.current=false;if(valid())setBusy(false);}}
  }
  const action=(input:InputOperation)=>{void operate(input,false).catch(()=>{});};
  function writeDraft(draft:ShoppingEditorDraft){
    draftRef.current=draft;setEditor(draft);setDraftStatus("Guardando borrador…");const sequence=++draftSequence.current;
    if(editorDocument?.pendingEditor&&editorDocument.pendingEditor.id!==draft.id){setDraftStatus("Otro borrador sigue guardado. Este producto se guardará al confirmar.");return;}
    void operate({type:"draft",draft},false,editorTarget.current??entry?.id).then(()=>{if(sequence===draftSequence.current)setDraftStatus("Borrador guardado en el teléfono.");})
      .catch(()=>{if(sequence===draftSequence.current)setDraftStatus("Borrador pendiente de guardar. Reintenta antes de salir.");});
  }
  function change(patch:Partial<ShoppingEditorDraft>){
    const draft=draftRef.current;if(!draft)return;
    setError("");
    const originalQuantity=draft.originalQuantity??(patch.quantity!==undefined&&draft.quantity&&!/^\d+$/.test(draft.quantity)?draft.quantity:undefined);
    writeDraft({...draft,...patch,originalQuantity});
  }
  function stepDraftQuantity(direction:-1|1){
    const draft=draftRef.current;if(!draft)return;
    const quantity=stepShoppingDraftQuantity(draft.quantity,direction);
    if(quantity!==undefined)change({quantity});
  }
  function startEditor(item?:ShoppingItem,name="",category?:ShoppingItem["category"],unit?:ShoppingItem["unit"],suggestedQuantity?:string,targetListId=entry?.id,fromCatalog=false){
    if(busy||dragging)return;
    setNext(null);setLegacy(null);setArrange(false);setMore(false);setError("");
    editorTarget.current=targetListId;catalogEditor.current=fromCatalog;
    const pending=(targetListId===entry?.id?doc:lists.find(row=>row.id===targetListId)?.note?.shopping)?.pendingEditor;
    const draft=item&&pending?.id===item.id&&pending.expectedRevision===item.revision?pending:shoppingEditor(item);
    const previous=draft.quantity.replace(".",",");
    writeDraft({...draft,quantity:suggestedQuantity??previous,originalQuantity:draft.originalQuantity??(suggestedQuantity!==undefined&&!/^\d+$/.test(previous)?previous:undefined),...(fromCatalog?{catalogOnly:true,customCatalog:true}:{}),...(!item?{name,category:category||suggestShoppingCategory(name,doc!),unit:unit||"unidades",store:doc?.store||""}:{})});
  }
  function leaveCatalog(next:()=>void){
    if(!catalogSelection.length){next();return;}
    Alert.alert("Productos sin guardar","Los productos marcados todavía no están en la lista. ¿Descartar esta selección?",[{text:"Seguir eligiendo",style:"cancel"},{text:"DESCARTAR",style:"destructive",onPress:()=>{setCatalogSelection([]);setCatalogMessage("");next();}}]);
  }
  function back(){
    if(busy||dragging)return;
    if(keyboard.isActive()){void keyboard.dismiss();return;}
    if(utility){voice.abort();setUtility(null);setUtilityItem(null);return;}
    if(editor&&draftStatus.startsWith("Borrador pendiente")){setError("No se guardó el borrador. Reintenta.");return;}
    if(editor&&draftStatus==="Guardando borrador…")return;
    if(editor){setEditor(null);draftRef.current=null;setError("");return;}
    if(next){setNext(null);return;}if(legacy){setLegacy(null);return;}if(arrange){setArrange(false);return;}
    if(catalogSelection.length){leaveCatalog(()=>{setSubgroup(null);setOrbit(null);});return;}
    if(screen==="add"){if(subgroup){setSubgroup(null);return;}if(orbit){setOrbit(null);return;}setScreen("list");return;}
    onClose();
  }
  useEffect(()=>{if(closeRequested)back();},[closeRequested]);
  async function save(){
    const draft=draftRef.current;if(!doc||!draft||lock.current)return;
    const expected=identity,epoch=generation.current;
    try{
      await operate({type:"saveItem",draft},true,editorTarget.current??entry?.id);if(!active(expected,epoch))return;draftSequence.current++;setEditor(null);draftRef.current=null;if(draft.catalogOnly||catalogEditor.current){setScreen("add");if(!orbit)setOrbit(shoppingEntrance(draft.name,draft.category,true)??"review");}else{setScreen("list");setOrbit(null);}Keyboard.dismiss();
    }catch(e){if(active(expected,epoch))setError((e as Error).message);}
  }
  function chooseCatalog(name:string,category:ShoppingItem["category"],id?:string,sourceListId?:string){
    if(!doc||busy)return;
    const existing=id?doc.items.find(i=>i.id===id):shoppingCatalogItem(doc,category,name);
    if(existing?.selected)return;
    const product={name,category,id:existing?.id??id,sourceListId:sourceListId!==entry?.id?sourceListId:undefined};
    setCatalogMessage("");
    setCatalogSelection(previous=>previous.some(p=>sameCatalogChoice(p,product))?previous.filter(p=>!sameCatalogChoice(p,product)):[...previous,product]);
  }
  async function saveCatalog(){
    const products=catalogSelectionRef.current;if(!products.length||lock.current)return;
    const expected=identity,epoch=generation.current,target=entry?.id;
    try{const result=await operate({type:"addCatalog",products});
      if(active(expected,epoch)&&currentEntry.current?.id===target){catalogSelectionRef.current=[];setCatalogSelection([]);setCatalogMessage("Selección guardada en «"+(result.note?.title||"Compras")+"».");setSubgroup(null);setOrbit(null);setSearchQuery("");setScreen("add");Keyboard.dismiss();}
    }catch{ /* operate reports the error; keep the selection and current category for retry. */ }
  }
  function sameCatalogChoice(a:ShoppingCatalogReference,b:ShoppingCatalogReference){return a.id&&b.id?a.id===b.id:a.category===b.category&&shoppingName(a.name)===shoppingName(b.name);}
  const prepared=(name:string,category:ShoppingItem["category"],id?:string)=>catalogSelection.some(p=>sameCatalogChoice(p,{name,category,id}));
  function catalogFavorite(product:ShoppingCatalogReference,fallback=false){
    const source=product.sourceListId?lists.find(row=>row.id===product.sourceListId)?.note?.shopping?.items.find(i=>i.id===product.id):undefined;
    const existing=(product.id?doc?.items.find(i=>i.id===product.id):doc&&shoppingCatalogItem(doc,product.category,product.name))??(source?doc?.items.find(i=>sameShoppingPresentation(i,source)):undefined);
    const favorite=existing?.favorite??fallback;
    return {favorite,favoriteDisabled:busy,onToggleFavorite:()=>{if(!doc||lock.current)return;void operate(existing?{type:"favorite",id:existing.id,value:!favorite}:{type:"favorite",product,value:!favorite}).catch(()=>{});}};
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
  const isListMenuAction=(id?:string)=>utility==="lists"&&["shopping-list-create","shopping-list-rename","shopping-list-share","shopping-list-delete"].includes(id??"");
  const button=(label:string,onPress:()=>void,testID?:string,selected=false,disabled=false,compact=false)=><TouchableOpacity testID={testID} accessibilityRole="button" accessibilityState={{selected,disabled:disabled||busy}} disabled={disabled||busy} onPress={onPress}
    style={[s.button,compact&&s.compactButton,isListMenuAction(testID)&&s.listTab,compact&&testID==="shopping-list-delete"&&s.destructiveButton,selected&&s.chosen,(disabled||busy)&&{opacity:.45}]}><Text testID={isListMenuAction(testID)?testID+"-label":undefined} numberOfLines={isListMenuAction(testID)?1:undefined} adjustsFontSizeToFit={isListMenuAction(testID)} minimumFontScale={.7} style={[s.buttonText,compact&&s.compactButtonText,isListMenuAction(testID)&&s.listTabText,isListMenuAction(testID)&&s.fittedListLabel,compact&&testID==="shopping-list-delete"&&s.destructiveText,selected&&{color:"#fff"}]}>{label}</Text></TouchableOpacity>;
  const navButton=(id:string,label:string,icon:React.ComponentProps<typeof Feather>["name"],onPress:()=>void,selected=false)=><TouchableOpacity testID={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected,disabled:busy||dragging}} disabled={busy||dragging} onPress={onPress} style={[s.navItem,{minWidth:Math.max(44,44*viewport.fontScale),flexBasis:Math.max(44,44*viewport.fontScale)},selected&&s.navSelected]}><Feather name={icon} size={22} color={selected?"#fff":"#173a68"}/><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.8} style={[s.navText,selected&&{color:"#fff"}]}>{label}</Text></TouchableOpacity>;
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
  const withoutPrice=totals.unknown-items.filter(item=>item.selected&&!isShoppingQuantity(item.quantity)).length;
  const originalQuantity=editor?.originalQuantity??(editor?.quantity&&!/^\d+$/.test(editor.quantity)?editor.quantity:undefined);
  const panel=!!editor||!!next||!!legacy||!!utility,adding=screen==="add",listHome=!!doc&&!panel&&!adding,orbitHome=!!doc&&adding&&!panel&&!orbit;
  const verticalNavigation=orbitHome||listHome||utility==="assistant"||utility==="lists";
  const listsHome=utility==="lists";
  const primaryFullWidth=orbitHome||listHome, fullWidthDock=primaryFullWidth||listsHome, navigationSize=orbitHome?56:GO_NAVIGATION_SIZE;
  const navigationWidth=verticalNavigation?navigationSize:GO_NAVIGATION_SIZE*2+8;
  const navigationHeight=verticalNavigation?navigationSize*2+8:GO_NAVIGATION_SIZE;
  const [listMenuWidth,setListMenuWidth]=useState(Math.max(0,viewport.width-insets.left-insets.right-24));
  const [listActionText,setListActionText]=useState<{scale:number;values:number[]}>({scale:viewport.fontScale,values:[]});
  const listMenu=shoppingThumbMenu(listMenuWidth,viewport.fontScale,handedness,listActionText.scale===viewport.fontScale?listActionText.values:undefined);
  const personalCatalog=shoppingPersonalCatalog(lists.map(row=>({id:row.id,items:row.note?.shopping?.items??[]})),orbit??"search",orbit==="search"?searchQuery:"");
  const measuredText=shortcutText.scale===viewport.fontScale?shortcutText:initialShoppingLandingText(viewport.fontScale);
  const landingRows=shoppingLandingRows(viewport.width-insets.left-insets.right-24,measuredText);
  const shortcutLayout=orbitHome?{columns:2,searchLines:measuredText.search+35<=viewport.width-insets.left-insets.right-24?1:2,listLines:1}:shoppingShortcutLayout(Math.max(0,viewport.width-insets.left-insets.right-24-navigationWidth-8),measuredText);
  useEffect(()=>{measureNavigationObstacles();},[keyboard.visible,viewport.width,viewport.height,viewport.fontScale,handedness,screen,orbit,utility,editor?.id]);
  const orbital=shoppingOrbitLayout(viewport.width-insets.left-insets.right,viewport.fontScale,handedness),route=doc?shoppingRoute(doc):undefined;
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
  async function openList(id:string){if(!scope)return;try{const row=await openShoppingNote(scope,()=>latest.current.visible&&latest.current.ready&&latest.current.identity===identity,id);setError("");setEntry(row);setUtility(null);setScreen("list");setEditor(null);await refreshLists();}catch(e){setError((e as Error).message);}}
  async function shareList(){if(!doc)return;
    try{await Share.share({message:shoppingShareText(entry?.note?.title||"Compras",doc)});}catch(e){setError((e as Error).message);}}
  async function newList(name:string){if(!scope)return;try{const row=await createShoppingList(scope,()=>latest.current.visible&&latest.current.ready&&latest.current.identity===identity,name);setEntry(row);setListName("");setScreen("add");setOrbit(null);setUtility(null);setError("");setRestoreId(null);await refreshLists();}catch(e){setError((e as Error).message);}}
  if(!visible)return null;
  return <GoScreenModal visible animationType="slide" onRequestClose={back}>
    <GestureHandlerRootView style={s.root}><View testID="shopping-layout-frame" ref={frameRef} collapsable={false} style={s.root} onLayout={measureNavigationObstacles}><KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":"height"} style={[s.root,{paddingTop:insets.top,paddingBottom:Math.max(8,insets.bottom),paddingHorizontal:Math.max(insets.left,insets.right)}]}>
      <View ref={headerRef} collapsable={false} onLayout={measureNavigationObstacles} style={[s.header,listHome&&s.listHeader,orbitHome&&s.orbitHeader,!!editor&&{display:"none"}]}>
        {listHome?<><View testID="shopping-live-totals" accessibilityLiveRegion="polite" style={s.summaryRow}>
          <TouchableOpacity testID="shopping-store" accessibilityRole="button" accessibilityLabel={"Seleccionar supermercado: "+(doc.store||"Sin seleccionar")} style={s.storeCard} onPress={()=>{setStoreName(doc.store||"");setUtility("store");}}>
            <Feather name="shopping-cart" size={16} color="#0879ca"/><Text testID="shopping-store-title" numberOfLines={2} style={s.storeName}>{doc.store||"Supermercado"}</Text><Feather name="chevron-down" size={12} color="#224b7c"/>
          </TouchableOpacity>
          <View style={[s.totalCard,s.currentTotal]}><Text style={s.totalLabel}>Compra</Text><Text testID="shopping-picked-total" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.7} style={s.totalAmount}>{displayTotal(pickedTotals)}</Text></View>
          <View testID="shopping-total-card" style={s.totalCard} accessibilityLabel={"Total previsto conocido. "+withoutPrice+" productos sin precio"}><Text testID="shopping-total-title" style={s.totalLabel}>TOTAL PREVISTO</Text><Text testID="shopping-estimate" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.7} style={s.totalAmount}>{displayTotal(totals)}</Text><Text testID="shopping-total-products" style={s.totalUnknown}>{items.filter(i=>i.selected).length} productos</Text></View>
        </View><View testID="shopping-active-list" style={s.activeListBar}><Text numberOfLines={1} accessibilityRole="header" style={s.activeListName}>{entry?.note?.title||"Compras"}</Text></View></>:orbitHome?<LinearGradient colors={["#ffffff","#e9f4ff","#cfe8ff"]} style={s.orbitBanner}><View style={s.bannerCart}><Feather name="shopping-cart" size={27} color="#fff"/></View><View style={{flex:1}}><Text testID="shopping-banner-title" accessibilityRole="header" accessibilityLabel="GO Compras" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.75} style={s.bannerTitle}>{"GO Compras"}</Text><Text style={s.bannerSubtitle}>Añadir productos</Text><Text testID="shopping-orbit-active-list" style={s.activeListIndicator}>Lista activa: {entry?.note?.title||"Compras"}</Text></View><Text style={s.bannerArt}>🧺</Text></LinearGradient>
          :<Text accessibilityRole="header" style={[s.heading,(utility==="assistant"||utility==="lists")&&s.compactHeading]}>{editor?(editor.expectedRevision?"Editar producto":"Añadir producto"):next?"Habituales":legacy?"Incorporar nota":utility==="assistant"?"GO Compras":utility==="lists"?"Mis listas":utility==="route"?"Ruta de compra":utility==="map"?"Mapa de la tienda":utility==="history"?"Compras realizadas":utility==="store"?"Supermercado":utility==="location"?"Ubicación manual":adding?"Elegir producto":"Compras"}</Text>}
      </View>
      {!ready||!scope?<Text style={s.message}>{accessMessage}</Text>:loading?<Text style={s.message}>Abriendo tu lista personal…</Text>:null}
      {!!error&&<View style={s.message}><Text testID="shopping-error" accessibilityRole="alert" style={s.error}>{error}</Text>{!doc&&restoreId&&button("Restaurar mi lista",confirmRestore,"shopping-restore",true,loading)}{!doc&&restoreId&&button("Crear otra lista",()=>void newList("Compras"),"shopping-create-after-delete",false,loading)}{!doc&&lists.filter(row=>!row.deleted&&row.estado!=="rechazado").map(row=><React.Fragment key={row.id}>{button("Abrir «"+(row.note?.title||"Compras")+"»",()=>void openList(row.id),"shopping-recover-list-"+row.id)}</React.Fragment>)}{!doc&&button("Reintentar",()=>setRetry(v=>v+1),"shopping-retry",false,loading)}</View>}
      {doc&&<>
      <View testID="shopping-list-viewport" ref={listViewportRef} collapsable={false} onLayout={measureNavigationObstacles} style={[{flex:1,minHeight:0},(panel||adding)&&{display:"none"}]}>
        <ShoppingReorderSurface enabled={!busy&&!panel&&!adding&&!keyboard.visible&&!loading} onDrop={reorder} onDragging={setDragging} scrollRef={scroll}
          initialOffset={shoppingPositions.get(identity)||0} onOffsetChange={offset=>shoppingPositions.set(identity,offset)}>
          {more&&<View style={s.details}>
            {doc.pendingEditor&&!editor&&button("Recuperar borrador",()=>{const draft=doc.pendingEditor;if(draft){setEditor(draft);draftRef.current=draft;setError("");}},"shopping-resume-draft")}
            <View style={s.row}>{([["pending","Pendientes"],["all","Todos"],["bought","Cogidos"]] as const).map(([key,label])=><React.Fragment key={key}>{button(label,()=>{if(!dragging)setFilter(key);},"shopping-filter-"+key,filter===key,dragging)}</React.Fragment>)}</View>
            {button("Habituales",()=>{setNext([]);setArrange(false);},"shopping-next")}
            {button("Compras realizadas",()=>{setRepeat(null);setUtility("history");},"shopping-history")}
            {button("Guardar compra en el historial",()=>Alert.alert("Guardar compra en el historial","Se guardarán los productos marcados como cogidos con sus precios. Los pendientes seguirán en la lista.",[{text:"Cancelar",style:"cancel"},{text:"GUARDAR",onPress:()=>action({type:"finish",confirmed:true})}]),"shopping-finish",false,!items.some(i=>i.selected&&i.bought))}
            {button(arrange?"Terminar orden":"Ordenar secciones",()=>setArrange(v=>!v),"shopping-arrange-categories",arrange,dragging)}
            {oldNotes.map((old,index)=><React.Fragment key={old.id}>{button("Revisar Compras antigua "+(index+1),()=>{setLegacy(old);setLegacySelected([]);},"shopping-legacy-"+index)}</React.Fragment>)}
          </View>}
          {(arrange?visibleShopping(doc,filter).map(g=>({...g,key:g.category})):groupedShopping(doc,filter)).filter(group=>arrange||group.items.length||doc.collapsed.includes(group.category)&&items.some(i=>i.category===group.category)).map(({category,items:visibleItems,key})=>{
            const definition=SHOPPING_CATEGORIES.find(c=>c[0]===category)!,collapsed=doc.collapsed.includes(category),showHeader=more||arrange||collapsed;
            const target={id:category,group:"categories",kind:"column" as const,label:definition[2]};
            return <View key={key} testID={"shopping-section-"+category} style={s.section}>
              {showHeader&&<ShoppingReorderRow target={target}><View style={s.row}>
                <TouchableOpacity testID={"shopping-collapse-"+category} accessibilityRole="button" accessibilityLabel={(collapsed?"Expandir ":"Contraer ")+definition[2]} accessibilityState={{expanded:!collapsed}} disabled={busy||dragging} style={{flex:1,minHeight:44,justifyContent:"center"}} onPress={()=>action({type:"collapse",category,value:!collapsed})}><Text style={s.sectionTitle}>{definition[2]} {collapsed?"+":"−"}</Text></TouchableOpacity>
                {arrange&&<ShoppingReorderHandle target={target}/>}</View></ShoppingReorderRow>}
              {!arrange&&visibleItems.map(({item})=>{const target={id:item.id,group:category,kind:"card" as const,label:item.name};return <ShoppingReorderRow key={item.id} target={target}><ShoppingProductRow contact={rowContact(item.id)} item={item} doc={doc} handedness={handedness} disabled={busy||dragging} onOperation={op=>operate(op,false)} onEdit={quantity=>startEditor(item,undefined,undefined,undefined,quantity)} onRemove={()=>Alert.alert("Retirar de esta lista",`¿Retirar «${item.name}»? El producto y sus precios se conservan.`,[{text:"Cancelar",style:"cancel"},{text:"RETIRAR",style:"destructive",onPress:()=>action({type:"select",id:item.id,value:false})}])} onRoute={()=>openRoute(item)} onLocation={()=>{setUtilityItem(item);setAisle(doc.locations?.find(l=>l.store===doc.store&&l.itemId===item.id)?.aisle||"");setUtility("location");}} dragHandle={filter==="all"?<ShoppingReorderHandle target={target}/>:undefined}/></ShoppingReorderRow>;})}
            </View>;
          })}
          {!items.length&&<Text style={s.hint}>Tu lista está lista. Pulsa Añadir para elegir productos.</Text>}
          {!!items.length&&!groupedShopping(doc,filter).some(g=>g.items.length)&&<Text style={s.hint}>No hay productos en esta vista.</Text>}
        </ShoppingReorderSurface>
      </View>
      {adding&&!panel&&<View testID="shopping-add-screen" ref={orbitViewportRef} collapsable={false} onLayout={measureNavigationObstacles} style={{flex:1,minHeight:0}}>
        {!!catalogMessage&&<Text testID="shopping-catalog-result" accessibilityLiveRegion="polite" style={s.text}>{catalogMessage}</Text>}
        {orbit?<ScrollView testID="shopping-products-scroll" keyboardShouldPersistTaps="never" contentContainerStyle={{paddingHorizontal:12,paddingTop:8,paddingBottom:16,gap:6}}>
          <Text testID="shopping-catalog-active-list" style={s.hint}>Lista: {entry?.note?.title||"Compras"}</Text>
          <Text testID="shopping-catalog-heading" accessibilityRole="header" style={s.sectionTitle}>{orbit==="search"?"Buscar producto":orbit==="favorites"?"FAVORITOS":orbit==="review"?"Productos por revisar":subgroup||SHOPPING_ENTRANCES.find(o=>o.id===orbit)?.label}</Text>
          {orbit==="search"&&<TextInput testID="shopping-product-search" accessibilityLabel="Buscar producto" value={searchQuery} onChangeText={setSearchQuery} style={s.input} placeholder="Escribe el producto" autoFocus/>}
          {orbit==="search"&&!!searchQuery.trim()&&items.filter(item=>shoppingName(item.name).includes(shoppingName(searchQuery))).map(item=><ShoppingCatalogChoice key={item.id} testID={"shopping-saved-"+item.id} name={item.name} art={shoppingProductArt(item.name).art} checked={item.selected||prepared(item.name,item.category,item.id)} disabled={busy||item.selected} status={item.selected?"En lista":prepared(item.name,item.category,item.id)?"Preparado":"Seleccionar"} {...catalogFavorite({name:item.name,category:item.category,id:item.id})} onChoose={()=>chooseCatalog(item.name,item.category,item.id)}/>)}
          {orbit==="favorites"?shoppingFavorites(doc).map(item=><ShoppingCatalogChoice key={item.id} testID={"shopping-favorite-item-"+item.id} name={item.name} art={shoppingProductArt(item.name).art} checked={item.selected||prepared(item.name,item.category,item.id)} disabled={busy} status={item.selected?"En lista":prepared(item.name,item.category,item.id)?"Preparado":"Seleccionar"} {...catalogFavorite({name:item.name,category:item.category,id:item.id})} onChoose={()=>item.selected?startEditor(item):chooseCatalog(item.name,item.category,item.id)}/>):
            !subgroup&&orbit!=="search"?shoppingCatalogGroups(orbit).map((group,index)=><TouchableOpacity key={group.label+index} testID={"shopping-subgroup-"+index} accessibilityRole="button" accessibilityLabel={group.label} onPress={()=>setSubgroup(group.label)} style={s.catalogRow}><Feather name="folder" size={21} color="#2177bd"/><Text style={s.catalogName}>{group.label}</Text><Feather name="chevron-right" size={20} color="#527ca3"/></TouchableOpacity>):
            orbit==="search"&&!searchQuery.trim()?<Text style={s.hint}>Escribe el nombre para buscar en todas las categorías.</Text>:
            shoppingCatalogGroups(orbit,orbit==="search"?searchQuery:"").filter(group=>!subgroup||group.label===subgroup).map((group,index)=><View key={group.orbit+group.label+index} style={{gap:4}}>{shoppingName(group.label)!==shoppingName(subgroup||SHOPPING_ENTRANCES.find(o=>o.id===orbit)?.label||"")&&<Text testID={"shopping-catalog-group-heading-"+index} style={s.catalogGroup}>{group.label}</Text>}{group.products.map(name=>{const existing=shoppingCatalogItem(doc,group.category,name);return <ShoppingCatalogChoice key={name} testID={"shopping-catalog-"+group.orbit+"-"+name} name={name} art={shoppingProductArt(name).art} checked={!!existing?.selected||prepared(name,group.category,existing?.id)} disabled={busy||!!existing?.selected} status={existing?.selected?"En lista":prepared(name,group.category,existing?.id)?"Preparado":"Seleccionar"} {...catalogFavorite({name,category:group.category,id:existing?.id})} onChoose={()=>chooseCatalog(name,group.category,existing?.id)}/>;})}</View>)}
          {orbit==="favorites"&&!shoppingFavorites(doc).length&&<Text style={s.hint}>Aún no tienes favoritos. Márcalos desde cada producto.</Text>}
          {personalCatalog.map(({item,sourceListId})=><View key={item.id} testID={"shopping-custom-"+item.id} style={{gap:4}}>
            <ShoppingCatalogChoice testID={"shopping-custom-choice-"+item.id} name={[item.name,item.brand,item.format,item.variety].filter(Boolean).join(" · ")} art={shoppingProductArt(item.name).art} checked={!!doc.items.find(i=>i.id===item.id)?.selected||prepared(item.name,item.category,item.id)} disabled={busy||!!doc.items.find(i=>i.id===item.id)?.selected} status={doc.items.find(i=>i.id===item.id)?.selected?"En lista":prepared(item.name,item.category,item.id)?"Preparado":"Seleccionar"} {...catalogFavorite({name:item.name,category:item.category,id:item.id,sourceListId},item.favorite)} onChoose={()=>chooseCatalog(item.name,item.category,item.id,sourceListId)}/>
            <View style={s.row}>{button("Editar",()=>startEditor(item,"",undefined,undefined,undefined,sourceListId,true),"shopping-custom-edit-"+item.id)}{button("Quitar del catálogo",()=>Alert.alert("Quitar del catálogo", "Se ocultará la definición del catálogo personal. Sus compras e historial se conservan.",[{text:"Cancelar",style:"cancel"},{text:"QUITAR",style:"destructive",onPress:()=>{void operate({type:"catalogVisibility",id:item.id,hidden:true},true,sourceListId).catch(()=>{});}}]),"shopping-custom-remove-"+item.id)}</View>
          </View>)}
          {orbit==="search"&&button("Productos por revisar",()=>{setOrbit("review");setSubgroup(null);},"shopping-catalog-review")}
          {SHOPPING_ENTRANCES.some(o=>o.id===orbit)&&button("OTRO",()=>startEditor(undefined,"",SHOPPING_ENTRANCES.find(o=>o.id===orbit)!.category,undefined,undefined,entry?.id,true),"shopping-new-product")}
          {orbit==="search"&&button("Producto personalizado",()=>startEditor(undefined,searchQuery,suggestShoppingCategory(searchQuery,doc),undefined,undefined,entry?.id,true),"shopping-new-product")}
        </ScrollView>:<LinearGradient colors={["#ffffff","#f4faff","#e7f4ff"]} style={{flex:1}}><ScrollView testID="shopping-orbit-scroll" contentContainerStyle={{flexGrow:1,justifyContent:"flex-end",alignItems:handedness==="left"?"flex-start":"flex-end",paddingHorizontal:12,paddingBottom:0}}>
          <View testID="shopping-seven-orbits" ref={orbitRef} collapsable={false} onLayout={measureNavigationObstacles} style={{width:orbital.size,height:orbital.height}}>
            <View pointerEvents="none" style={[s.orbitRing,{left:orbital.centerX-orbital.radius,top:orbital.centerY-orbital.verticalRadius,width:orbital.radius*2,height:orbital.verticalRadius*2}]}/>
            {SHOPPING_ORBITS.map((o,index)=>{const typography=shoppingOrbitTypography(o.id,orbital.button,viewport.fontScale);return <ShoppingOrbitControl key={o.id} testID={"shopping-orbit-"+o.id} controlRef={node=>registerOrbitControl(o.id,node)} onLayout={measureNavigationObstacles} diameter={orbital.button} label={o.label} onPress={()=>{setSubgroup(null);setOrbit(o.id);}} style={[s.orbit,{left:orbital.points[index].x,top:orbital.points[index].y}]}><ShoppingOrbitContents id={o.id} art={o.art} layout={typography}/></ShoppingOrbitControl>;})}
            <ShoppingOrbitControl testID="shopping-go-orbit" controlRef={node=>registerOrbitControl("go",node)} onLayout={measureNavigationObstacles} diameter={orbital.center} fill="#f9cb55" stroke="#fff2ba" strokeWidth={5} label="Hablar o escribir a GO Compras" onPress={go} style={[s.goOrbit,{left:orbital.centerX-orbital.center/2,top:orbital.centerY-orbital.center/2}]}><GoAiIdentity testID="shopping-orbit-go-identity" size={orbital.center-8} activity={assistantActivity({voice:voice.status,busy,error:!!voice.error})}/></ShoppingOrbitControl>
            {([{id:"favorites",label:"FAVORITOS",art:"★",geometry:orbital.favorite},{id:"home",label:"OTROS (HOGAR)",art:"🏠",geometry:orbital.home}] as const).map(satellite=><ShoppingOrbitControl key={satellite.id} testID={"shopping-orbit-"+satellite.id} controlRef={node=>registerOrbitControl(satellite.id,node)} onLayout={measureNavigationObstacles} diameter={satellite.geometry.diameter} label={satellite.label} onPress={()=>{setSubgroup(null);setOrbit(satellite.id);}} style={[s.favoriteOrbit,{left:satellite.geometry.x,top:satellite.geometry.y}]}><Text accessible={false} allowFontScaling={false} style={{fontSize:satellite.geometry.diameter*.40,lineHeight:satellite.geometry.diameter*.45,...(satellite.id==="favorites"?{color:"#FFD600",textShadowColor:"#A66D00",textShadowOffset:{width:0,height:0},textShadowRadius:1}:{})}}>{satellite.art}</Text><Text accessible={false} numberOfLines={satellite.id==="home"?2:1} adjustsFontSizeToFit minimumFontScale={.65} maxFontSizeMultiplier={1.4} style={{fontSize:satellite.geometry.diameter*.13,lineHeight:satellite.geometry.diameter*.15,fontWeight:"800",textAlign:"center",color:"#15385b",width:satellite.geometry.diameter*.85}}>{satellite.id==="home"?"OTROS\n(HOGAR)":satellite.label}</Text></ShoppingOrbitControl>)}

          </View>

        </ScrollView></LinearGradient>}
      </View>}
      {editor&&<ScrollView ref={editScroll} testID="shopping-editor-scroll" keyboardShouldPersistTaps="never" keyboardDismissMode="interactive" style={{flex:1,minHeight:0}} contentContainerStyle={{padding:12,flexGrow:1,justifyContent:"flex-end"}}><View style={s.editorCard}>
        {field("name","Producto",{onChangeText:name=>change({name,...(editor.category==="other"&&!editor.customCatalog?{category:suggestShoppingCategory(name,doc)}:{})}),autoCapitalize:"sentences"})}
        {field("brand","Marca · opcional")}
        <View style={[s.row,{alignItems:"flex-end",flexWrap:"wrap",flexDirection:handedness==="left"?"row-reverse":"row"}]}>
          <View style={{flex:1,minWidth:116}}>{field("price","Precio por producto · opcional",{keyboardType:"decimal-pad",value:editor.pricePerPresentation?editor.price:"",placeholder:editorPrice?String(editorPrice.price).replace(".",","):"",onChangeText:price=>change({price,pricePerPresentation:true,store:doc.store||editor.store})})}</View>
          <View style={{flex:1,minWidth:156}}><View style={[s.row,{flexWrap:"nowrap"}]}>
            <TouchableOpacity testID="shopping-editor-minus" accessibilityRole="button" accessibilityLabel="Restar cantidad" onPress={()=>stepDraftQuantity(-1)} style={s.editorStep}><Feather name="minus" size={20} color="#0876ca"/></TouchableOpacity>
            <View style={{flex:1}}>{field("quantity","Cantidad",{keyboardType:"number-pad",selectTextOnFocus:true,onChangeText:quantity=>{if(/^\d*$/.test(quantity))change({quantity});else setError(SHOPPING_QUANTITY_ERROR);}})}</View>
            <TouchableOpacity testID="shopping-editor-plus" accessibilityRole="button" accessibilityLabel="Sumar cantidad" onPress={()=>stepDraftQuantity(1)} style={s.editorStep}><Feather name="plus" size={20} color="#0876ca"/></TouchableOpacity>
          </View></View>
        </View>
        {originalQuantity&&<Text style={s.hint}>Antes: {originalQuantity}. Guarda para confirmar.</Text>}
        {editor.price&&!editor.pricePerPresentation&&<Text style={s.hint}>Precio anterior del borrador conservado. Escribe un precio nuevo si quieres sustituirlo.</Text>}
        {draftStatus.startsWith("Borrador pendiente")&&<>
          <Text testID="shopping-draft-status" accessibilityLiveRegion="polite" style={s.hint}>{draftStatus}</Text>
          {button("Reintentar guardar borrador",()=>writeDraft(editor),"shopping-retry-draft")}
        </>}
      </View></ScrollView>}
      {utility&&<View testID="shopping-utility-viewport" ref={utilityViewportRef} collapsable={false} onLayout={measureNavigationObstacles} style={{flex:1,minHeight:0}}><ScrollView ref={utility==="lists"||utility==="assistant"?editScroll:undefined} testID={"shopping-"+utility+"-scroll"} keyboardShouldPersistTaps="never" onScrollEndDrag={measureNavigationObstacles} onMomentumScrollEnd={measureNavigationObstacles} contentContainerStyle={utility==="lists"?s.listsContent:utility==="assistant"?s.assistantContent:{padding:16,gap:12}}>
        {utility==="lists"&&<View testID="shopping-lists-content" ref={utilityContentRef} collapsable={false} onLayout={measureNavigationObstacles} style={{gap:6}}>
          <Text testID="shopping-lists-active" style={s.activeListIndicator}>Lista activa: {entry?.note?.title||"Compras"}</Text>
          {lists.map(list=><TouchableOpacity key={list.id} testID={"shopping-list-select-"+list.id} accessibilityRole="button" accessibilityLabel={(list.note?.title||"Compras")+(list.deleted?", en papelera":"")} onPress={()=>list.deleted?Alert.alert("Restaurar lista",list.note?.title||"Compras",[{text:"Cancelar",style:"cancel"},{text:"RESTAURAR",onPress:()=>{if(!scope)return;void restoreShoppingNote(scope,()=>latest.current.visible&&latest.current.ready&&latest.current.identity===identity,list.id).then(async row=>{setEntry(row);setUtility(null);setScreen("list");await refreshLists();}).catch(e=>setError((e as Error).message));}}]):void openList(list.id)} style={[s.catalogRow,s.listChoice,s.listTab,{width:listMenu.formWidth,marginLeft:listMenu.formLeft}]}><Feather name={list.deleted?"trash-2":"list"} size={20} color="#2177bd"/><Text style={[s.catalogName,s.listChoiceName]}>{list.note?.title||"Compras"}</Text><Text style={s.catalogStatus}>{list.deleted?"Restaurar":entry?.id===list.id?"Activa":"Abrir"}</Text></TouchableOpacity>)}
          <View testID="shopping-lists-editor" onLayout={event=>setListMenuWidth(event.nativeEvent.layout.width)} style={s.listsEditor}>
            <TextInput testID="shopping-list-name" accessibilityLabel="Nombre de la lista" value={listName} onChangeText={setListName} onFocus={event=>{if(event.target!==undefined)editScroll.current?.scrollResponderScrollNativeHandleToKeyboard(event.target,12,true);}} style={[s.input,s.compactInput,{width:listMenu.formWidth,marginLeft:listMenu.formLeft,borderRadius:27}]} placeholder="Nombre de la lista"/>
            <View testID="shopping-lists-thumb-menu" style={s.thumbMenu}>
              <View testID="shopping-lists-action-0" style={{width:listMenu.widths[0],marginLeft:listMenu.offsets[0]}}>{button("Crear lista",()=>void newList(listName),"shopping-list-create",true,!listName.trim(),true)}</View>
              <View testID="shopping-lists-action-1" style={{width:listMenu.widths[1],marginLeft:listMenu.offsets[1]}}>{button("Renombrar",()=>{if(!scope||!entry)return;void renameShoppingList(scope,()=>latest.current.visible&&latest.current.ready&&latest.current.identity===identity,entry.id,listName).then(async row=>{setEntry(row);setListName("");await refreshLists();}).catch(e=>setError((e as Error).message));},"shopping-list-rename",false,!listName.trim(),true)}</View>
              <View testID="shopping-lists-action-2" style={{width:listMenu.widths[2],marginLeft:listMenu.offsets[2]}}>{button("Compartir",()=>void shareList(),"shopping-list-share",false,false,true)}</View>
              <View testID="shopping-lists-action-3" style={{width:listMenu.widths[3],marginLeft:listMenu.offsets[3]}}>{button("Eliminar lista",()=>Alert.alert("Eliminar lista","La lista quedará en la papelera y podrá recuperarse.",[{text:"Cancelar",style:"cancel"},{text:"ELIMINAR",style:"destructive",onPress:()=>{if(!scope||!entry)return;void deleteShoppingList(scope,()=>latest.current.visible&&latest.current.ready&&latest.current.identity===identity,entry.id).then(async()=>{await refreshLists();const next=lists.find(list=>list.id!==entry.id&&!list.deleted);if(next)await openList(next.id);else{setEntry(null);setUtility(null);setRetry(v=>v+1);}}).catch(e=>setError((e as Error).message));}}]),"shopping-list-delete",false,false,true)}</View>
            </View>
          </View>
        </View>}
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
        {utility==="assistant"&&<View testID="shopping-assistant-content" ref={utilityContentRef} collapsable={false} onLayout={measureNavigationObstacles} style={s.assistantForm}>
          <Text testID="shopping-assistant-question" accessibilityRole="header" style={s.assistantHeading}>¿Qué necesitas comprar?</Text><Text testID="shopping-assistant-example" style={s.assistantExample}>«Añade dos botellas de leche y seis huevos»</Text>
          <TextInput testID="shopping-command" accessibilityLabel="Orden para GO Compras" value={command} onChangeText={setCommand} onSubmitEditing={()=>void runCommand(command)} onFocus={event=>{if(event.target!==undefined)editScroll.current?.scrollResponderScrollNativeHandleToKeyboard(event.target,12,true);}} style={[s.input,s.compactInput]} placeholder="Añade 2 botellas de agua"/>
          <View testID="shopping-assistant-actions" style={s.assistantActions}><View style={s.listAction}>{button("Ejecutar",()=>void runCommand(command),"shopping-command-send",true,!command.trim(),true)}</View>
          <TouchableOpacity testID="shopping-voice" accessibilityRole="button" accessibilityLabel={voice.status==="listening"?"Detener dictado":"Hablar con GO"} onPress={()=>{if(voice.status==="listening")void voice.stop();else{voiceIdentity.current=identity;void voice.start();}}} disabled={voice.status!=="idle"&&voice.status!=="listening"} style={s.voiceButton}><Feather name="mic" size={20} color="#fff"/><Text style={s.voiceText}>{voice.status==="listening"?"Detener dictado":voice.status==="idle"?"Hablar":"Preparando…"}</Text></TouchableOpacity></View>
          {!!voice.error&&<Text accessibilityRole="alert" style={s.error}>{voice.error}</Text>}
          {!!answer&&<Text testID="shopping-command-result" accessibilityLiveRegion="polite" style={s.text}>{answer}</Text>}
        </View>}
      </ScrollView></View>}
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
      {!!doc&&<View testID="shopping-thumb-controls" onLayout={event=>{if(fullWidthDock){setLandingDockHeight(event.nativeEvent.layout.height);measureNavigationObstacles();}}} style={[s.footer,verticalNavigation&&!fullWidthDock&&{flexDirection:handedness==="left"?"row-reverse":"row",alignItems:"flex-end"}]}><View testID="shopping-dock-content" style={verticalNavigation&&!fullWidthDock?s.dockColumn:undefined}>
        <View testID="shopping-navigation-row" style={[s.dockNavigationRow,{flexDirection:handedness==="left"?"row-reverse":"row",minHeight:verticalNavigation?0:GO_NAVIGATION_SIZE}]}>
          {orbitHome&&!keyboard.visible&&<View testID="shopping-shortcut-row" ref={shortcutsRef} collapsable={false} onLayout={measureNavigationObstacles} style={[s.dockTools,orbitHome&&s.landingShortcutRow,shortcutLayout.columns===1&&s.shortcutColumn]}><TouchableOpacity testID="shopping-search-open" accessibilityRole="button" accessibilityLabel="Buscar producto" onPress={()=>{setSearchQuery("");setSubgroup(null);setOrbit("search");}} style={[s.searchEntrance,shortcutLayout.columns===1&&s.shortcutStackButton,false&&s.landingIconAbove]}><Feather name="search" size={18} color="#316b9a"/><Text testID="shopping-search-label" numberOfLines={shortcutLayout.searchLines} adjustsFontSizeToFit={orbitHome} minimumFontScale={.85} style={s.searchEntranceText}>{shortcutLayout.searchLines===2?"Buscar\nproductos":"Buscar productos"}</Text></TouchableOpacity></View>}
          {listHome&&!keyboard.visible&&<View testID="shopping-secondary-navigation" ref={shortcutsRef} collapsable={false} onLayout={measureNavigationObstacles} style={s.dockTools}>
        {navButton("shopping-purchase","Compra","shopping-cart",()=>{setFilter("all");setMore(false);},true)}
        {navButton("shopping-route","Ruta","navigation",()=>openRoute())}
        {navButton("shopping-map","Mapa","map",()=>setUtility("map"))}
        {navButton("shopping-favorites","Favoritos","star",()=>{setScreen("add");setSubgroup(null);setOrbit("favorites");setMore(false);})}
        {navButton("shopping-more","Más","grid",()=>setMore(value=>!value),more)}
      </View>}
          {!verticalNavigation&&<View pointerEvents="none" testID="shopping-navigation-space" style={{width:navigationWidth,height:navigationHeight}}/>}
        </View>
        <View testID="shopping-primary-actions" ref={actionsRef} collapsable={false} onLayout={event=>{setActionsHeight(event.nativeEvent.layout.height);measureNavigationObstacles();}} style={[s.primaryActions,{flexDirection:orbitHome?"row":handedness==="left"?"row-reverse":"row"},primaryFullWidth&&s.landingPrimaryActions,listsHome&&{flexDirection:"row",justifyContent:"flex-start",paddingLeft:listMenu.offsets[4]}]}>
        {keyboard.visible?<TouchableOpacity testID="shopping-keyboard-done" accessibilityRole="button" accessibilityLabel="Listo, ocultar teclado"
          onPress={()=>void keyboard.dismiss()} style={[s.listTab,listsHome&&{width:listMenu.widths[4]},primaryFullWidth&&s.landingAction,primaryFullWidth&&landingRows.actionsIconAbove&&s.landingIconAbove]}><Feather name="check" size={21} color="#123e72"/><Text style={s.listTabText}>Listo</Text></TouchableOpacity>:orbitHome?<TouchableOpacity testID="shopping-manage-lists" accessibilityRole="button" accessibilityLabel="Mis listas de compra" onPress={()=>{setListName("");setUtility("lists");void refreshLists();}} style={[s.listTab,s.landingAction,landingRows.actionsIconAbove&&s.landingIconAbove]}><Feather name="list" size={18} color="#316b9a"/><Text testID="shopping-lists-label" numberOfLines={2} adjustsFontSizeToFit={orbitHome} minimumFontScale={.85} style={s.listTabText}>Mis listas</Text></TouchableOpacity>:<TouchableOpacity testID="shopping-list" accessibilityRole="button" accessibilityLabel="Volver a la lista de compra" disabled={busy||dragging} style={[s.listTab,listsHome&&{width:listMenu.widths[4]},primaryFullWidth&&s.landingAction,primaryFullWidth&&landingRows.actionsIconAbove&&s.landingIconAbove]}
          onPress={()=>leaveCatalog(()=>{if(editor&&(draftStatus==="Guardando borrador…"||draftStatus.startsWith("Borrador pendiente"))){setError("Espera a guardar el borrador antes de volver a la lista.");return;}voice.abort();if(editor)setError("");setEditor(null);draftRef.current=null;setUtility(null);setNext(null);setLegacy(null);if(listHome){setListName("");setUtility("lists");void refreshLists();}else{setScreen("list");setOrbit(null);setSubgroup(null);}})}><Feather name="list" size={21} color="#123e72"/><Text numberOfLines={primaryFullWidth||listsHome?1:undefined} adjustsFontSizeToFit={orbitHome||listsHome} minimumFontScale={.7} style={[s.listTabText,listsHome&&s.fittedListLabel]}>Lista</Text></TouchableOpacity>}
        {!keyboard.visible&&listHome&&<TouchableOpacity testID="shopping-go" accessibilityRole="button" accessibilityLabel="Hablar o escribir a GO Compras" disabled={busy||dragging} onPress={go} style={[s.go,{backgroundColor:"transparent",borderWidth:0,shadowOpacity:0}]}><GoAiIdentity testID="shopping-dock-go-identity" size={64} activity={assistantActivity({voice:voice.status,busy,error:!!voice.error})}/></TouchableOpacity>}
        {!keyboard.visible&&listHome&&<TouchableOpacity testID="shopping-add" accessibilityRole="button" accessibilityLabel="Volver a las categorías de productos" disabled={busy||dragging} style={[s.addTab,primaryFullWidth&&s.landingAction,primaryFullWidth&&landingRows.actionsIconAbove&&s.landingIconAbove]} onPress={()=>{setUtility(null);setNext(null);setLegacy(null);setScreen("add");setOrbit(null);setSubgroup(null);setSearchQuery("");setMore(false);}}><Feather name="plus" size={20} color="#fff"/><Text numberOfLines={primaryFullWidth?1:undefined} adjustsFontSizeToFit={orbitHome} minimumFontScale={.85} style={s.addTabText}>Añadir</Text></TouchableOpacity>}
        {orbitHome&&!keyboard.visible&&<TouchableOpacity testID="shopping-list" accessibilityRole="button" accessibilityLabel="Abrir la lista de compra activa" disabled={busy||dragging} onPress={()=>{setScreen("list");setOrbit(null);setSubgroup(null);}} style={[s.listTab,s.landingAction,landingRows.actionsIconAbove&&s.landingIconAbove]}><Feather name="list" size={21} color="#123e72"/><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.85} style={s.listTabText}>Lista</Text></TouchableOpacity>}
        {adding&&!!orbit&&!panel&&<TouchableOpacity testID="shopping-catalog-save" accessibilityRole="button" accessibilityLabel={"Guardar "+catalogSelection.length+" productos en "+(entry?.note?.title||"Compras")} disabled={busy||!catalogSelection.length} onPress={()=>void saveCatalog()} style={[s.saveTab,(busy||!catalogSelection.length)&&{opacity:.45}]}><Text style={s.saveText}>GUARDAR {catalogSelection.length||""}</Text></TouchableOpacity>}
        {!!editor&&<TouchableOpacity testID="shopping-save" accessibilityRole="button" accessibilityLabel="Guardar producto" disabled={busy} onPress={()=>void save()} style={s.saveTab}><Text style={s.saveText}>GUARDAR</Text></TouchableOpacity>}
        </View>
        </View>{verticalNavigation&&!fullWidthDock&&<View pointerEvents="none" testID="shopping-navigation-space" style={{width:navigationWidth,height:navigationHeight}}/>}
      </View>}
      {listsHome&&<View key={"list-actions-"+viewport.fontScale} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{position:"absolute",width:10000,opacity:0}}>
        {["Crear lista","Renombrar","Compartir","Eliminar lista","Lista"].map((label,index)=><Text key={label} testID={"shopping-list-action-measure-"+index} style={s.listTabText} onTextLayout={event=>{const width=event.nativeEvent.lines[0]?.width;if(!Number.isFinite(width)||width<=0)return;setListActionText(old=>{const values=old.scale===viewport.fontScale?[...old.values]:[];if(Math.abs((values[index]??0)-width)<.5)return old;values[index]=width;return {scale:viewport.fontScale,values};});}}>{label}</Text>)}
      </View>}
      {primaryFullWidth&&<View key={viewport.fontScale} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{position:"absolute",width:10000,opacity:0}}>
        {([['search','Buscar productos'],['lists','Mis listas'],['searchWord','productos'],['listWord','listas'],['actionList',orbitHome?'Mis listas':'Lista'],['actionAdd',orbitHome?'Lista':'Añadir']] as const).map(([key,label])=><Text key={key} testID={"shopping-label-measure-"+key} onTextLayout={event=>recordShortcutText(key,event.nativeEvent.lines[0]?.width)} style={key==="actionList"||key==="actionAdd"?s.listTabText:s.searchEntranceText}>{label}</Text>)}
      </View>}
    <GoNavigationFloating screenKey={"shopping-"+(editor?"editor":utility?utility:next?"next":legacy?"legacy":adding?(subgroup?"products-"+orbit+"-"+shoppingName(subgroup):orbit?"groups-"+orbit:"orbit"):"list")} width={navigationWidth} height={navigationHeight} allowUserOverlap={fullWidthDock&&!orbitHome} avoidRects={navigationObstacles} safeArea={false} handedness={handedness} keyboardResponsive keyboardVisible={keyboard.visible} protectedTop={insets.top+48} protectedBottom={Math.max(8,insets.bottom)+4} initialBottom={fullWidthDock?landingDockHeight+8:verticalNavigation?0:actionsHeight+8}><View testID="shopping-floating-buttons" style={{flexDirection:verticalNavigation?"column":handedness==="left"?"row-reverse":"row",gap:8}}>
      <GoCloseButton testID="shopping-back" level="panel" appearance="light" touchSize={56} preserveTouchSize={orbitHome} iconSize={orbitHome?26:30} cornerRadius={orbitHome?18:21} hitSlop={0} disabled={busy||dragging} keyboardVisible={keyboard.visible} onPress={back} accessibilityLabel={keyboard.visible?"Ocultar teclado":panel||arrange||adding?"Volver a COMPRAS":"Volver a NOTAS"}/>
      <GoCloseButton testID="shopping-close" level="container" appearance="light" touchSize={orbitHome?56:64} preserveTouchSize={orbitHome} iconSize={orbitHome?26:30} cornerRadius={orbitHome?18:21} hitSlop={0} disabled={busy||dragging} onPress={()=>{if(keyboard.isActive()){void keyboard.dismiss();return;}if(editor&&(draftStatus==="Guardando borrador…"||draftStatus.startsWith("Borrador pendiente"))){setError("Espera a guardar el borrador antes de cerrar.");return;}leaveCatalog(onClose);}} accessibilityLabel="Cerrar Compras y volver al Landing"/>
    </View></GoNavigationFloating>
    </KeyboardAvoidingView></View>
    </GestureHandlerRootView>
  </GoScreenModal>;
}
const s=StyleSheet.create({
  root:{flex:1,backgroundColor:"#f7fbff"},header:{paddingHorizontal:14,paddingTop:8,paddingBottom:8},listHeader:{paddingHorizontal:8,paddingTop:3,paddingBottom:3},orbitHeader:{paddingHorizontal:14,paddingTop:6,paddingBottom:4},heading:{fontSize:20,fontWeight:"700",color:"#172d51"},
  summaryRow:{flexDirection:"row",alignItems:"stretch",gap:5},activeListBar:{minHeight:44,alignItems:"center",justifyContent:"center",gap:2,paddingHorizontal:5},activeListName:{fontSize:18,fontWeight:"700",color:"#173a68",textAlign:"center"},savedLabel:{fontSize:11,color:"#587087"},storeCard:{flex:2,minWidth:0,minHeight:48,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:3,paddingHorizontal:5,borderRadius:15,borderWidth:1,borderColor:"#dce5f2",backgroundColor:"#fff",shadowColor:"#284568",shadowOpacity:.1,shadowRadius:5,shadowOffset:{width:0,height:2}},storeName:{flex:1,minWidth:0,fontSize:12,lineHeight:16,fontWeight:"600",color:"#153861"},
  totalCard:{flex:1,minWidth:0,minHeight:48,alignItems:"center",justifyContent:"center",gap:2,paddingHorizontal:5,paddingVertical:5,borderRadius:15,borderWidth:1,borderColor:"#e3e8f0",backgroundColor:"#f8fbff",shadowColor:"#284568",shadowOpacity:.06,shadowRadius:4,shadowOffset:{width:0,height:2}},currentTotal:{backgroundColor:"#ebf6ff",borderColor:"#d9ebfa"},totalLabel:{fontSize:11,fontWeight:"600",color:"#45617c",textAlign:"center",alignSelf:"stretch"},totalAmount:{fontSize:15,fontWeight:"800",color:"#17477a",textAlign:"center"},totalUnknown:{fontSize:9,color:"#617486",textAlign:"center"},
  activeListIndicator:{fontSize:12,color:"#45617c",fontWeight:"600"},
  fittedListLabel:{minWidth:0,maxWidth:"100%",flexShrink:1,textAlign:"center"},compactHeading:{fontSize:18},compactInput:{minHeight:44,fontSize:14,paddingHorizontal:10,paddingVertical:8},compactButton:{minHeight:44,paddingVertical:6,paddingHorizontal:10},compactButtonText:{fontSize:13},destructiveButton:{backgroundColor:"#fff2f2",borderColor:"#e6a8ad"},destructiveText:{color:"#b42332"},listChoice:{minHeight:44,paddingVertical:4},listChoiceName:{fontSize:14},
  landingShortcutRow:{flexWrap:"nowrap"},landingPrimaryActions:{flexWrap:"nowrap",alignSelf:"stretch",justifyContent:"space-between"},landingAction:{flex:1,flexShrink:1,minWidth:44,paddingHorizontal:8},landingIconAbove:{flexDirection:"column",paddingVertical:4},
  dockColumn:{flex:1,gap:8},shortcutColumn:{flexDirection:"column",alignItems:"stretch"},shortcutStackButton:{flexBasis:"auto",flexGrow:0,width:"100%"},
  listsEditor:{gap:6,paddingTop:4},thumbMenu:{gap:6,alignItems:"flex-start"},listAction:{flex:1,minWidth:120},
  listsContent:{padding:12,gap:6,flexGrow:1,justifyContent:"flex-end"},
  orbitBanner:{minHeight:77,borderRadius:24,borderWidth:1,borderColor:"#dbeafa",paddingHorizontal:16,flexDirection:"row",alignItems:"center",gap:12,shadowColor:"#3474b1",shadowOpacity:.13,shadowRadius:9,shadowOffset:{width:0,height:4}},bannerCart:{width:46,height:46,borderRadius:23,backgroundColor:"#087deb",alignItems:"center",justifyContent:"center",borderWidth:2,borderColor:"#acd8ff"},bannerTitle:{textAlign:"center",fontSize:25,fontWeight:"800",color:"#133361"},bannerSubtitle:{fontSize:17,fontWeight:"700",color:"#5da0d9"},bannerArt:{fontSize:35},
  hint:{fontSize:12,color:"#647c92",lineHeight:18},text:{fontSize:15,color:"#304c64",flexShrink:1},label:{fontSize:12,fontWeight:"600",color:"#607b91"},sectionTitle:{fontSize:14,fontWeight:"700",color:"#416d95",flexShrink:1},row:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:6},
  button:{minHeight:44,minWidth:44,paddingVertical:9,paddingHorizontal:11,borderWidth:1,borderColor:"#dce7f0",borderRadius:11,backgroundColor:"#fff",justifyContent:"center"},chosen:{backgroundColor:"#277ec1",borderColor:"#277ec1"},buttonText:{fontSize:13,fontWeight:"600",color:"#416b8d",textAlign:"center",flexShrink:1},checked:{backgroundColor:"#e5f0fa"},
  input:{minHeight:48,borderWidth:1,borderColor:"#cfdeeb",backgroundColor:"#fff",borderRadius:11,fontSize:16,color:"#29465e",padding:11},section:{gap:5},product:{fontSize:16,fontWeight:"600",color:"#2a4a64",flexShrink:1},details:{gap:8,padding:12,backgroundColor:"#f5f9fd",borderWidth:1,borderColor:"#e0eaf3",borderRadius:12},
  searchEntrance:{minHeight:44,minWidth:64,flexGrow:1,flexBasis:64,borderRadius:16,paddingHorizontal:6,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5,backgroundColor:"#fff",borderWidth:1,borderColor:"#dceafa"},searchEntranceText:{fontSize:13,fontWeight:"600",color:"#316b9a",flexShrink:1},
  catalogRow:{minHeight:48,flexDirection:"row",alignItems:"center",gap:9,paddingHorizontal:11,paddingVertical:5,backgroundColor:"#fff",borderRadius:12,borderWidth:1,borderColor:"#dce7f2"},catalogIcon:{fontSize:23,width:31,textAlign:"center"},catalogName:{flex:1,minWidth:0,fontSize:15,fontWeight:"600",color:"#17365f"},catalogStatus:{fontSize:12,fontWeight:"700",color:"#1872b5"},catalogGroup:{fontSize:13,fontWeight:"700",color:"#436d91",paddingTop:9,paddingBottom:3},assistantContent:{padding:12,gap:8,flexGrow:1,justifyContent:"flex-end"},assistantForm:{gap:8},assistantHeading:{fontSize:16,fontWeight:"700",color:"#172d51"},assistantActions:{flexDirection:"row",flexWrap:"wrap",alignItems:"stretch",gap:8},assistantExample:{fontSize:13,lineHeight:18,fontWeight:"400",color:"#607b91"},voiceText:{fontSize:14,fontWeight:"700",color:"#fff",textAlign:"center",flexShrink:1},voiceButton:{flex:1,minWidth:120,minHeight:44,paddingHorizontal:10,paddingVertical:6,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:6,backgroundColor:"#087def",borderRadius:15},
  editorCard:{gap:10,padding:14,backgroundColor:"#fff",borderRadius:22,borderWidth:1,borderColor:"#dce7f2",shadowColor:"#264e76",shadowOpacity:.12,shadowRadius:10,shadowOffset:{width:0,height:4}},editorStep:{width:44,minHeight:48,borderRadius:11,borderWidth:1,borderColor:"#cfdeeb",backgroundColor:"#fff",alignItems:"center",justifyContent:"center",alignSelf:"flex-end"},
  favoriteOrbit:{position:"absolute",padding:0,gap:0,alignItems:"center",justifyContent:"center",borderWidth:2,borderColor:"#fff",backgroundColor:"#fff",shadowColor:"#2776b0",shadowOpacity:.22,shadowRadius:8,shadowOffset:{width:0,height:4}},
  orbitRing:{position:"absolute",borderRadius:400,borderWidth:3,borderColor:"#9fd3fa",backgroundColor:"transparent"},orbit:{position:"absolute",padding:4,borderWidth:2,borderColor:"#fff",backgroundColor:"#fff",gap:1,alignItems:"center",justifyContent:"center",shadowColor:"#2776b0",shadowOpacity:.22,shadowRadius:8,shadowOffset:{width:0,height:4}},orbitArtwork:{fontSize:31,lineHeight:39},orbitDots:{fontSize:29,fontWeight:"800",color:"#168beb"},orbitLabel:{fontSize:10,fontWeight:"700",textAlign:"center",color:"#17365f"},
  goOrbit:{position:"absolute",alignItems:"center",justifyContent:"center",backgroundColor:"#f9cb55",borderWidth:5,borderColor:"#fff2ba",shadowColor:"#2875b3",shadowOpacity:.3,shadowRadius:14,shadowOffset:{width:0,height:5}},goOrbitText:{fontSize:43,fontWeight:"900",color:"#123466",lineHeight:47},
  secondaryNav:{minHeight:68,flexDirection:"row",alignItems:"center",gap:5,paddingHorizontal:8,paddingVertical:4,backgroundColor:"#f7fbff"},navItem:{flexGrow:1,flexBasis:44,minWidth:44,minHeight:44,borderRadius:15,backgroundColor:"#fff",borderWidth:1,borderColor:"#e6eaf0",alignItems:"center",justifyContent:"center",gap:2,shadowColor:"#244c7b",shadowOpacity:.1,shadowRadius:5,shadowOffset:{width:0,height:3}},navSelected:{backgroundColor:"#0689ed",borderColor:"#43b1fb"},navText:{fontSize:11,fontWeight:"700",color:"#173a68"},
  footer:{paddingHorizontal:12,paddingBottom:4,gap:8,backgroundColor:"#f7fbff"},dockNavigationRow:{flexDirection:"row",alignItems:"flex-end",gap:8},dockTools:{flex:1,flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:5},primaryActions:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"flex-end",gap:7},listTab:{flexShrink:0,minWidth:44,minHeight:56,paddingHorizontal:12,paddingVertical:8,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5,borderRadius:27,borderWidth:1,borderColor:"#dce4ef",backgroundColor:"#fff",shadowColor:"#244c7b",shadowOpacity:.1,shadowRadius:5,shadowOffset:{width:0,height:3}},listTabText:{fontSize:14,fontWeight:"700",color:"#173a68"},
  go:{width:68,height:68,borderRadius:34,alignItems:"center",justifyContent:"center",backgroundColor:"#0089ed",borderWidth:3,borderColor:"#b7eaff",shadowColor:"#1285c8",shadowOpacity:.28,shadowRadius:8,shadowOffset:{width:0,height:3}},goText:{color:"#fff",fontSize:22,fontWeight:"800"},addTab:{flexShrink:0,minWidth:44,minHeight:56,paddingHorizontal:12,paddingVertical:8,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:3,borderRadius:27,backgroundColor:"#087def",borderWidth:1,borderColor:"#57b6ff",shadowColor:"#1376c5",shadowOpacity:.18,shadowRadius:6,shadowOffset:{width:0,height:3}},addTabText:{fontSize:14,fontWeight:"700",color:"#fff"},saveTab:{flexShrink:0,minWidth:110,minHeight:56,paddingHorizontal:14,paddingVertical:8,borderRadius:22,alignItems:"center",justifyContent:"center",backgroundColor:"#0789e5",borderWidth:1,borderColor:"#54baff"},saveText:{fontSize:16,fontWeight:"800",color:"#fff"},
  error:{color:"#9e2929",fontSize:14},message:{padding:16,gap:8},smallAction:{minHeight:44,minWidth:44,flexDirection:"row",gap:6,alignItems:"center",justifyContent:"center"},
});
