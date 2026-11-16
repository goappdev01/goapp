import React, { useEffect, useRef, useState } from "react";
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View, type TextInputProps } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GoEntry } from "@/components/AgendaOperativa";
import { GoScreenModal } from "@/components/ui/GoScreenModal";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import { GoNavigationFloating } from "@/components/ui/GoNavigationFloating";
import { useGoNoteKeyboard } from "@/hooks/useGoNoteKeyboard";
import { useBookingVoice } from "@/hooks/useBookingVoice";
import type { TaskScope } from "@/lib/goTaskReminders";
import { subscribeGoLog, getGoLogSnapshot } from "@/lib/goLogStore";
import { noteInScope } from "@/lib/unifiedNotes";
import { openShoppingNote, oldShoppingNotes, runShoppingOperation } from "@/lib/shoppingNoteStore";
import { comparableShoppingPrices, legacyShoppingCandidates, normalizedShoppingPrice, shoppingEditor, shoppingEstimate, shoppingId, suggestShoppingCategory, visibleShopping,
  SHOPPING_CATEGORIES, SHOPPING_UNITS, type MeasureUnit, type ShoppingDocument, type ShoppingEditorDraft, type ShoppingFilter, type ShoppingItem, type ShoppingOperation } from "@/lib/shoppingNote";
import { SHOPPING_ORBITS, SHOPPING_SUGGESTIONS, shoppingCommand, shoppingOrbitLayout, shoppingRoute } from "@/lib/shoppingExperience";
import { ShoppingProductRow } from "./ShoppingProductRow";
import { ShoppingReorderHandle, ShoppingReorderRow, ShoppingReorderSurface } from "./ShoppingReorderSurface";

type Props={visible:boolean;scope:TaskScope|null;ready:boolean;handedness:"left"|"right";onClose:()=>void;closeRequested?:boolean};
type InputOperation=ShoppingOperation extends infer O?O extends ShoppingOperation?Omit<O,"operationId">:never:never;
const decimal=(n:number)=>n.toLocaleString("es-ES",{maximumFractionDigits:3});
const money=(n:number,currency:string)=>decimal(Math.round(n*100)/100)+" "+currency;
// Only view position is cached; product data always comes from the verified canonical store.
const shoppingPositions=new Map<string,number>();
export function GoShoppingNote({visible,scope,ready,handedness,onClose,closeRequested}:Props){
  const insets=useSafeAreaInsets(),keyboard=useGoNoteKeyboard(visible);
  const viewport=useWindowDimensions();
  const [entry,setEntry]=useState<GoEntry|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
  const [filter,setFilter]=useState<ShoppingFilter>("all"),[arrange,setArrange]=useState(false),[dragging,setDragging]=useState(false);
  const [editor,setEditor]=useState<ShoppingEditorDraft|null>(null),[draftStatus,setDraftStatus]=useState(""),[next,setNext]=useState<string[]|null>(null);
  const [oldNotes,setOldNotes]=useState<GoEntry[]>([]),[legacy,setLegacy]=useState<GoEntry|null>(null),[legacySelected,setLegacySelected]=useState<string[]>([]);
  const [retry,setRetry]=useState(0),scroll=useRef<React.ElementRef<typeof ScrollView>>(null),editScroll=useRef<React.ElementRef<typeof ScrollView>>(null);
  const [screen,setScreen]=useState<"list"|"add">("list"),[orbit,setOrbit]=useState<string|null>(null),[more,setMore]=useState(false),[options,setOptions]=useState(false);
  const [utility,setUtility]=useState<"store"|"route"|"history"|"assistant"|"location"|null>(null),[utilityItem,setUtilityItem]=useState<ShoppingItem|null>(null);
  const [storeName,setStoreName]=useState(""),[aisle,setAisle]=useState(""),[command,setCommand]=useState(""),[answer,setAnswer]=useState("");
  const commandLock=useRef(false),voiceIdentity=useRef("");
  const mounted=useRef(true),generation=useRef(0),lock=useRef(false),draftSequence=useRef(0),draftRef=useRef(editor);draftRef.current=editor;
  const retries=useRef(new Map<string,string>());
  const identity=JSON.stringify(scope),latest=useRef({scope,ready,visible,identity});latest.current={scope,ready,visible,identity};
  const currentEntry=useRef(entry);currentEntry.current=entry;
  const active=(expected:string,epoch:number)=>mounted.current&&latest.current.visible&&latest.current.ready&&latest.current.identity===expected&&generation.current===epoch;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
  useEffect(()=>{
    const epoch=++generation.current;setEntry(null);setEditor(null);setNext(null);setLegacy(null);setOldNotes([]);setError("");setFilter("all");setArrange(false);setBusy(false);setScreen("list");setOrbit(null);setUtility(null);setAnswer("");setCommand("");lock.current=false;retries.current.clear();draftSequence.current++;
    if(!visible||!ready||!scope)return;
    const expected=identity,valid=()=>active(expected,epoch);setLoading(true);
    void openShoppingNote(scope,valid).then(async row=>{
      const old=await oldShoppingNotes(scope,valid);if(!valid())return;setEntry(row);setEditor(row.note!.shopping!.pendingEditor||null);setOldNotes(old);
      setDraftStatus(row.note!.shopping!.pendingEditor?"Borrador recuperado del teléfono. Revisa y guarda el producto.":"");
    }).catch(e=>{if(valid())setError((e as Error).message);}).finally(()=>{if(valid())setLoading(false);});
    return()=>{generation.current++;};
  },[visible,ready,identity,retry]);
  useEffect(()=>subscribeGoLog(()=>{
    const current=currentEntry.current;if(!current||!latest.current.ready||!latest.current.scope||!noteInScope(current,latest.current.scope))return;
    const row=getGoLogSnapshot().find(row=>row.id===current.id&&noteInScope(row,latest.current.scope!));if(row)setEntry(row);
  }),[]);
  const validView=visible&&ready&&scope&&entry&&noteInScope(entry,scope),doc=validView?entry.note?.shopping:undefined;
  async function operate(input:InputOperation,blocking=true){
    if(!scope||!ready||!entry||!noteInScope(entry,scope))throw Error("Espera a verificar tu cuenta personal.");
    if(blocking&&lock.current)throw Error("Espera a que termine el guardado.");
    const expected=identity,epoch=generation.current,valid=()=>active(expected,epoch);
    const signature=JSON.stringify(input),operationId=retries.current.get(signature)||shoppingId();retries.current.set(signature,operationId);
    if(blocking){lock.current=true;setBusy(true);}setError("");
    try{
      const result=await runShoppingOperation(scope,valid,{...input,operationId} as ShoppingOperation);retries.current.delete(signature);
      if(valid())setEntry(old=>(old?.note?.revision||0)>result.note!.revision?old:result);
      return result;
    }catch(e){if(valid())setError((e as Error).message);throw e;}
    finally{if(blocking){lock.current=false;if(valid())setBusy(false);}}
  }
  const action=(input:InputOperation)=>{void operate(input,false).catch(()=>{});};
  function writeDraft(draft:ShoppingEditorDraft){
    draftRef.current=draft;setEditor(draft);setDraftStatus("Guardando borrador…");const sequence=++draftSequence.current;
    void operate({type:"draft",draft},false).then(()=>{if(sequence===draftSequence.current)setDraftStatus("Borrador guardado en el teléfono.");})
      .catch(()=>{if(sequence===draftSequence.current)setDraftStatus("Borrador pendiente de guardar. Reintenta antes de salir.");});
  }
  function change(patch:Partial<ShoppingEditorDraft>){const d=draftRef.current;if(d)writeDraft({...d,...patch});}
  function startEditor(item?:ShoppingItem,name="",category?:ShoppingItem["category"]){
    if(busy||dragging)return;
    if(doc?.pendingEditor){Alert.alert("Borrador pendiente","Recupera o descarta el borrador antes de editar otro producto.",[{text:"Cancelar",style:"cancel"},{text:"RECUPERAR",onPress:()=>{setEditor(doc.pendingEditor!);draftRef.current=doc.pendingEditor!;}}]);return;}
    setNext(null);setLegacy(null);setArrange(false);setMore(false);setOptions(false);writeDraft({...shoppingEditor(item),...(!item?{name,category:category||suggestShoppingCategory(name,doc!),store:doc?.store||""}:{})});
  }
  function back(){
    if(busy||dragging)return;
    if(keyboard.isActive()){void keyboard.dismiss();return;}
    if(utility){voice.abort();setUtility(null);setUtilityItem(null);return;}
    if(editor&&draftStatus.startsWith("Borrador pendiente")){setError("El borrador aún no está guardado. Reintenta su guardado o descártalo expresamente.");return;}
    if(editor&&draftStatus==="Guardando borrador…"){setError("Espera a que termine el guardado del borrador antes de volver.");return;}
    if(editor){setEditor(null);draftRef.current=null;return;}
    if(next){setNext(null);return;}if(legacy){setLegacy(null);return;}if(arrange){setArrange(false);return;}
    if(screen==="add"){if(orbit){setOrbit(null);return;}setScreen("list");return;}
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
  const panel=!!editor||!!next||!!legacy||!!utility,adding=screen==="add";
  const orbital=shoppingOrbitLayout(viewport.width-insets.left-insets.right,viewport.fontScale),route=doc?shoppingRoute(doc):undefined;
  const displayTotal=(v:typeof totals)=>Object.entries(v.totals).map(([currency,value])=>money(value,currency)).join(" + ")||"0 EUR";
  const openRoute=(item?:ShoppingItem)=>{setUtilityItem(item||null);setUtility("route");};
  const go=()=>{setAnswer("");setUtility("assistant");};
  if(!visible)return null;
  return <GoScreenModal visible animationType="slide" onRequestClose={back}>
    <GestureHandlerRootView style={s.root}><KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":"height"} style={[s.root,{paddingTop:insets.top,paddingBottom:Math.max(8,insets.bottom),paddingHorizontal:Math.max(insets.left,insets.right)}]}>
      <View style={s.header}><Text accessibilityRole="header" style={s.heading}>{editor?(editor.expectedRevision?"Editar producto":"Añadir producto"):next?"Habituales":legacy?"Incorporar nota":utility==="assistant"?"GO Compras":utility==="route"?"Ruta de compra":utility==="history"?"Compras realizadas":utility==="store"?"Supermercado":utility==="location"?"Ubicación manual":adding?"Añadir":"Compras"}</Text>
        {doc&&!panel&&<View style={[s.row,{justifyContent:"space-between"}]}><TouchableOpacity testID="shopping-store" accessibilityRole="button" accessibilityLabel="Seleccionar supermercado" style={s.store} onPress={()=>{setStoreName(doc.store||"");setUtility("store");}}><Feather name="map-pin" size={15} color="#477394"/><Text numberOfLines={1} style={s.text}>{doc.store||"Seleccionar supermercado"}</Text><Feather name="chevron-down" size={15} color="#477394"/></TouchableOpacity>
          <TouchableOpacity testID="shopping-route" accessibilityRole="button" accessibilityLabel="Ruta general de compra" style={s.smallAction} onPress={()=>openRoute()}><Feather name="navigation" size={18} color="#477394"/><Text style={s.buttonText}>Ruta</Text></TouchableOpacity></View>}
        {doc&&!panel&&!adding&&<View testID="shopping-live-totals" accessibilityLiveRegion="polite" style={s.totals}>
          <View style={{flex:1,gap:2}}><Text style={s.label}>Cogido · {items.filter(i=>i.selected&&i.bought).length}</Text><Text testID="shopping-picked-total" style={s.amount}>{displayTotal(pickedTotals)}</Text><Text style={s.hint}>{pickedTotals.unknown?"+ "+pickedTotals.unknown+" sin precio":"Importe conocido"}</Text></View>
          <View style={{flex:1,gap:2}}><Text style={s.label}>Previsto · {items.filter(i=>i.selected).length}</Text><Text testID="shopping-estimate" style={s.amount}>{displayTotal(totals)}</Text><Text style={s.hint}>{totals.unknown?"+ "+totals.unknown+" sin precio":"Precios anotados"}</Text></View>
        </View>}
      </View>
      {!ready||!scope?<Text style={s.message}>Abre el ámbito personal de GO con tu sesión para usar Compras.</Text>:loading?<Text style={s.message}>Abriendo tu lista personal…</Text>:null}
      {!!error&&<View style={s.message}><Text testID="shopping-error" accessibilityRole="alert" style={s.error}>{error}</Text>{!doc&&button("Reintentar",()=>setRetry(v=>v+1),"shopping-retry")}</View>}
      {doc&&<>
      <View style={[{flex:1,minHeight:0},(panel||adding)&&{display:"none"}]}>
        <View style={[s.row,{paddingHorizontal:12}]}>{([["pending","Pendientes"],["all","Todos"],["bought","Cogidos"]] as const).map(([key,label])=><React.Fragment key={key}>{button(label,()=>{if(!dragging)setFilter(key);},"shopping-filter-"+key,filter===key,dragging)}</React.Fragment>)}
          <TouchableOpacity testID="shopping-more" accessibilityRole="button" accessibilityLabel="Más acciones de compra" disabled={busy||dragging} onPress={()=>setMore(v=>!v)} style={s.smallAction}><Feather name="more-horizontal" size={22} color="#477394"/></TouchableOpacity>
        </View>
        <ShoppingReorderSurface enabled={!busy&&!panel&&!adding&&!keyboard.visible&&!loading} onDrop={reorder} onDragging={setDragging} scrollRef={scroll}
          initialOffset={shoppingPositions.get(identity)||0} onOffsetChange={offset=>shoppingPositions.set(identity,offset)}>
          {doc.pendingEditor&&!editor&&<View style={s.details}>{button("Continuar producto sin terminar",()=>{setEditor(doc.pendingEditor!);draftRef.current=doc.pendingEditor!;},"shopping-resume-draft")}</View>}
          {more&&<View style={s.details}>
            {button("Habituales",()=>{setNext([]);setArrange(false);},"shopping-next")}
            {button("Favoritos",()=>{setScreen("add");setOrbit("favorites");},"shopping-favorites")}
            {button("Compras realizadas",()=>setUtility("history"),"shopping-history")}
            {button("Guardar compra",()=>Alert.alert("Guardar compra","Guardar los productos cogidos en el historial. Sus filas y precios se conservarán.",[{text:"Cancelar",style:"cancel"},{text:"GUARDAR",onPress:()=>action({type:"finish",confirmed:true})}]),"shopping-finish",false,!items.some(i=>i.selected&&i.bought))}
            {button(arrange?"Terminar orden":"Ordenar secciones",()=>setArrange(v=>!v),"shopping-arrange-categories",arrange,dragging)}
            {oldNotes.map((old,index)=><React.Fragment key={old.id}>{button("Revisar Compras antigua "+(index+1),()=>{setLegacy(old);setLegacySelected([]);},"shopping-legacy-"+index)}</React.Fragment>)}
          </View>}
          {visibleShopping(doc,filter).filter(group=>arrange||group.items.length||doc.collapsed.includes(group.category)&&items.some(i=>i.category===group.category)).map(({category,items:visibleItems})=>{
            const definition=SHOPPING_CATEGORIES.find(c=>c[0]===category)!,collapsed=doc.collapsed.includes(category);
            const target={id:category,group:"categories",kind:"column" as const,label:definition[2]};
            return <View key={category} testID={"shopping-section-"+category} style={s.section}>
              <ShoppingReorderRow target={target}><View style={s.row}>
                <TouchableOpacity testID={"shopping-collapse-"+category} accessibilityRole="button" accessibilityLabel={(collapsed?"Expandir ":"Contraer ")+definition[2]} accessibilityState={{expanded:!collapsed}} disabled={busy||dragging} style={{flex:1,minHeight:44,justifyContent:"center"}} onPress={()=>action({type:"collapse",category,value:!collapsed})}><Text style={s.sectionTitle}>{definition[2]} {collapsed?"+":"−"}</Text></TouchableOpacity>
                {arrange&&<ShoppingReorderHandle target={target}/>}</View></ShoppingReorderRow>
              {!arrange&&visibleItems.map(({item})=>{const target={id:item.id,group:category,kind:"card" as const,label:item.name};return <ShoppingReorderRow key={item.id} target={target}><ShoppingProductRow item={item} doc={doc} handedness={handedness} disabled={busy||dragging} onOperation={op=>operate(op,false)} onEdit={()=>startEditor(item)} onRoute={()=>openRoute(item)} onLocation={()=>{setUtilityItem(item);setAisle(doc.locations?.find(l=>l.store===doc.store&&l.itemId===item.id)?.aisle||"");setUtility("location");}} dragHandle={filter==="all"?<ShoppingReorderHandle target={target}/>:undefined}/></ShoppingReorderRow>;})}
            </View>;
          })}
          {!items.length&&<Text style={s.hint}>Tu lista está lista. Pulsa Añadir para elegir productos.</Text>}
          {!!items.length&&!visibleShopping(doc,filter).some(g=>g.items.length)&&<Text style={s.hint}>No hay productos en esta vista.</Text>}
        </ShoppingReorderSurface>
      </View>
      {adding&&!panel&&<View testID="shopping-add-screen" style={{flex:1,minHeight:0}}>
        {orbit?<ScrollView testID="shopping-products-scroll" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:8}}>
          <Text accessibilityRole="header" style={s.sectionTitle}>{orbit==="favorites"?"Favoritos":SHOPPING_ORBITS.find(o=>o.id===orbit)?.label}</Text>
          {items.filter(i=>orbit==="favorites"?i.favorite:SHOPPING_ORBITS.find(o=>o.id===orbit)?.categories.some(c=>c===i.category)).map(i=><View key={i.id} style={[s.details,s.row]}><View style={{flex:1}}><Text style={s.product}>{i.name}</Text><Text style={s.hint}>{[i.brand??i.prices.at(-1)?.brand,i.variety,i.format,decimal(i.quantity)+" "+i.unit].filter(Boolean).join(" · ")}</Text></View>{button(i.selected&&!i.bought?"En lista":"Añadir",()=>{action({type:"select",id:i.id,value:true});action({type:"bought",id:i.id,value:false});},"shopping-reuse-"+i.id,false,i.selected&&!i.bought)}{button("Editar",()=>startEditor(i),"shopping-reuse-edit-"+i.id)}</View>)}
          {SHOPPING_ORBITS.find(o=>o.id===orbit)?.categories.flatMap(category=>(SHOPPING_SUGGESTIONS[category]||[]).map(name=><React.Fragment key={category+name}>{button(name,()=>startEditor(undefined,name,category),"shopping-suggestion-"+name)}</React.Fragment>))}
          {button("Otro producto",()=>startEditor(undefined,"",SHOPPING_ORBITS.find(o=>o.id===orbit)?.categories[0]),"shopping-new-product")}
        </ScrollView>:<ScrollView testID="shopping-orbit-scroll" contentContainerStyle={{flexGrow:1,justifyContent:"flex-end",alignItems:"center",paddingBottom:8}}>
          <View testID="shopping-eight-orbits" style={{width:orbital.size,height:orbital.height}}>
            <View pointerEvents="none" style={{position:"absolute",left:orbital.button/2,top:orbital.buttonHeight/2,width:orbital.size-orbital.button,height:orbital.height-orbital.buttonHeight,borderRadius:orbital.height,borderWidth:1,borderColor:"#edf2f7"}}/>
            {SHOPPING_ORBITS.map((o,index)=><TouchableOpacity key={o.id} testID={"shopping-orbit-"+o.id} accessibilityRole="button" accessibilityLabel={o.label} onPress={()=>setOrbit(o.id)} style={[s.orbit,{left:orbital.points[index].x,top:orbital.points[index].y,width:orbital.button,minHeight:orbital.buttonHeight}]}><MaterialCommunityIcons name={o.icon} size={28} color="#527d9f"/><Text style={s.orbitLabel}>{o.label}</Text></TouchableOpacity>)}
            <TouchableOpacity testID="shopping-go-orbit" accessibilityRole="button" accessibilityLabel="Hablar o escribir a GO Compras" onPress={go} style={[s.go,s.goOrbit,{left:(orbital.size-76)/2,top:(orbital.height-76)/2}]}><Text style={s.goText}>GO</Text><Feather name="mic" size={17} color="#fff"/></TouchableOpacity>
          </View>
        </ScrollView>}
      </View>}
      {editor&&<ScrollView ref={editScroll} testID="shopping-editor-scroll" keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{padding:16,gap:10}}>
        {field("name","Producto",{onChangeText:name=>change({name,...(editor.category==="other"?{category:suggestShoppingCategory(name,doc)}:{})}),autoCapitalize:"sentences"})}
        <View style={s.row}><View style={{flex:1}}>{field("quantity","Cantidad",{keyboardType:"decimal-pad"})}</View>{button(editor.unit,()=>setOptions(v=>!v),"shopping-unit-picker")}</View>
        {options&&<View style={s.row}>{SHOPPING_UNITS.map(unit=><React.Fragment key={unit}>{button(unit,()=>{change({unit});setOptions(false);},"shopping-unit-"+unit,editor.unit===unit)}</React.Fragment>)}</View>}
        {field("brand","Marca · opcional")}{field("format","Formato · opcional")}
        {button(more?"Menos opciones":"Más opciones",()=>setMore(v=>!v),"shopping-editor-options")}
        {more&&<>
          {field("variety","Variedad · opcional")}
          {field("packageQuantity","Tamaño del envase",{keyboardType:"decimal-pad"})}
          <View style={s.row}>{(["kg","g","litros","ml","unidades"] as MeasureUnit[]).map(unit=><React.Fragment key={unit}>{button(unit,()=>change({packageUnit:unit}),"shopping-package-unit-"+unit,editor.packageUnit===unit)}</React.Fragment>)}</View>
          <Text style={s.label}>Categoría</Text><View style={s.row}>{SHOPPING_CATEGORIES.map(([id,,label])=><React.Fragment key={id}>{button(label,()=>change({category:id}),"shopping-category-"+id,editor.category===id)}</React.Fragment>)}</View>
          {field("store","Supermercado del precio")}{field("price","Precio observado · opcional",{keyboardType:"decimal-pad"})}
          {field("currency","Moneda")}{field("observedOn","Fecha de observación · AAAA-MM-DD")}
          {field("priceQuantity","Contenido al que corresponde el precio",{keyboardType:"decimal-pad"})}
          <View style={s.row}>{(["kg","g","litros","ml","unidades"] as MeasureUnit[]).map(unit=><React.Fragment key={unit}>{button(unit,()=>change({priceUnit:unit}),"shopping-price-unit-"+unit,editor.priceUnit===unit)}</React.Fragment>)}</View>
          {field("notes","Observaciones")}
          {checkButton("Producto habitual",editor.usual,()=>change({usual:!editor.usual}),"shopping-usual")}
          {checkButton("Favorito por marca y presentación",editor.favorite||false,()=>change({favorite:!editor.favorite}),"shopping-editor-favorite")}
          {items.find(i=>i.id===editor.id)?.prices.map(p=>{const n=normalizedShoppingPrice(p);return <View key={p.id} testID={"shopping-price-"+p.id} style={s.details}><Text style={s.text}>{p.store} · {p.observedOn} · {money(p.price,p.currency)}/{p.purchaseUnit}</Text><Text style={s.hint}>{p.brand} · {p.format} · {n?money(n.value,p.currency)+"/"+n.unit:"Sin medida comparable"}</Text>{button("Usar para estimación",()=>action({type:"selectPrice",id:editor.id,priceId:p.id}),"shopping-use-price-"+p.id,items.find(i=>i.id===editor.id)?.selectedPriceId===p.id)}</View>;})}
          {comparableShoppingPrices(items.find(i=>i.id===editor.id)?.prices||[]).map((group,index)=><View key={index} testID="shopping-price-comparison" style={s.details}><Text style={s.label}>Misma marca, variedad y formato</Text>{group.map(p=><Text key={p.id} style={s.text}>{p.store}: {money(normalizedShoppingPrice(p)!.value,p.currency)}/{normalizedShoppingPrice(p)!.unit} · {p.observedOn}</Text>)}</View>)}
        </>}
        <Text testID="shopping-draft-status" accessibilityLiveRegion="polite" style={s.hint}>{draftStatus}</Text>
        {draftStatus.startsWith("Borrador pendiente")&&button("Reintentar guardar borrador",()=>writeDraft(editor),"shopping-retry-draft")}
        {button("Descartar borrador",()=>Alert.alert("Descartar borrador","El producto guardado y sus precios se conservarán.",[{text:"Cancelar",style:"cancel"},{text:"DESCARTAR",style:"destructive",onPress:()=>{void operate({type:"draft"}).then(()=>{setEditor(null);draftRef.current=null;draftSequence.current++;}).catch(()=>{});}}]),"shopping-discard-draft")}
      </ScrollView>}
      {utility&&<ScrollView testID={"shopping-"+utility+"-scroll"} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:12}}>
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
        {utility==="history"&&<>
          {!doc.purchases?.length&&<Text style={s.hint}>Aún no has guardado una compra. Al terminar, usa «Más acciones de compra» → «Guardar compra».</Text>}
          {[...(doc.purchases||[])].reverse().map(p=><View key={p.id} style={s.details}><Text style={s.label}>{p.date} · {p.store||"Sin supermercado"}</Text>{p.items.map(i=><Text key={i.id} style={s.text}>{i.name} · {i.brand} · {decimal(i.quantity)} {i.unit}</Text>)}</View>)}
        </>}
        {utility==="assistant"&&<>
          <Text style={s.hint}>Da una orden cada vez. Puedes añadir, cambiar cantidades, marcar cogido, consultar pendientes o ver la ruta.</Text>
          <TextInput testID="shopping-command" accessibilityLabel="Orden para GO Compras" value={command} onChangeText={setCommand} onSubmitEditing={()=>void runCommand(command)} style={s.input} placeholder="Añade 2 kg de manzanas"/>
          {button("Ejecutar",()=>void runCommand(command),"shopping-command-send",true,!command.trim())}
          <TouchableOpacity testID="shopping-voice" accessibilityRole="button" accessibilityLabel={voice.status==="listening"?"Detener dictado":"Dictar orden a GO"} onPress={()=>{if(voice.status==="listening")void voice.stop();else{voiceIdentity.current=identity;void voice.start();}}} disabled={voice.status!=="idle"&&voice.status!=="listening"} style={s.button}><Text style={s.buttonText}>{voice.status==="listening"?"Detener dictado":voice.status==="idle"?"Dictar orden":"Preparando dictado…"}</Text></TouchableOpacity>
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
      <View testID="shopping-thumb-controls" style={[s.footer,{flexDirection:"row"}]}>
        {!!doc&&<TouchableOpacity testID="shopping-list" accessibilityRole="button" accessibilityLabel="Volver a la lista de compra" disabled={busy||dragging} style={s.tab}
          onPress={()=>{if(editor&&(draftStatus==="Guardando borrador…"||draftStatus.startsWith("Borrador pendiente"))){setError("Espera a guardar el borrador antes de volver a la lista.");return;}voice.abort();setEditor(null);draftRef.current=null;setUtility(null);setNext(null);setLegacy(null);setScreen("list");setOrbit(null);}}><Feather name="list" size={22} color="#477394"/><Text style={s.buttonText}>Lista</Text></TouchableOpacity>}
        {!!doc&&(!adding||!!orbit||panel)&&<TouchableOpacity testID="shopping-go" accessibilityRole="button" accessibilityLabel="Hablar o escribir a GO Compras" disabled={busy||dragging} onPress={go} style={s.go}><Text style={s.goText}>GO</Text><Feather name="mic" size={15} color="#fff"/></TouchableOpacity>}
        {!!doc&&adding&&!orbit&&!panel&&<View style={{width:64}}/>}
        {!!doc&&!editor&&<TouchableOpacity testID="shopping-add" accessibilityRole="button" accessibilityLabel="Añadir productos por categorías" disabled={busy||dragging} style={s.tab} onPress={()=>{setUtility(null);setNext(null);setLegacy(null);setScreen("add");setOrbit(null);setMore(false);}}><Feather name="plus" size={22} color="#477394"/><Text style={s.buttonText}>Añadir</Text></TouchableOpacity>}
        {!!doc&&editor&&<View style={{width:76}}>{button("Guardar",()=>void save(),"shopping-save",true)}</View>}
      </View>
    <GoNavigationFloating screenKey="shopping-navigation" safeArea={false} handedness="right" keyboardResponsive keyboardVisible={keyboard.visible} protectedTop={insets.top+48} protectedBottom={Math.max(8,insets.bottom)+78} initialBottom={4}>
      <GoCloseButton testID="shopping-back" level="panel" appearance="light" touchSize={56} hitSlop={0} disabled={busy||dragging} keyboardVisible={keyboard.visible} onPress={back} accessibilityLabel={keyboard.visible?"Ocultar teclado":panel||arrange||adding?"Volver a COMPRAS":"Volver a NOTAS"}/>
    </GoNavigationFloating>
    </KeyboardAvoidingView>
    </GestureHandlerRootView>
  </GoScreenModal>;
}
const s=StyleSheet.create({
  root:{flex:1,backgroundColor:"#fff"},header:{paddingHorizontal:16,paddingTop:8,paddingBottom:10,gap:6},heading:{fontSize:19,fontWeight:"600",color:"#253f55"},
  hint:{fontSize:12,color:"#697e90",lineHeight:18},text:{fontSize:15,color:"#304c64",flexShrink:1},label:{fontSize:12,fontWeight:"600",color:"#607b91"},
  sectionTitle:{fontSize:13,fontWeight:"600",color:"#517594",flexShrink:1},row:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:6},
  button:{minHeight:44,minWidth:44,paddingVertical:9,paddingHorizontal:11,borderWidth:1,borderColor:"#dce7f0",borderRadius:11,backgroundColor:"#fff",justifyContent:"center"},
  chosen:{backgroundColor:"#477ea9",borderColor:"#477ea9"},buttonText:{fontSize:13,fontWeight:"600",color:"#416b8d",textAlign:"center",flexShrink:1},checked:{backgroundColor:"#e5f0fa"},
  input:{minHeight:48,borderWidth:1,borderColor:"#cfdeeb",backgroundColor:"#fff",borderRadius:11,fontSize:16,color:"#29465e",padding:11},
  section:{gap:6},product:{fontSize:16,fontWeight:"600",color:"#2a4a64",flexShrink:1},details:{gap:8,padding:12,backgroundColor:"#f5f9fd",borderWidth:1,borderColor:"#e0eaf3",borderRadius:12},
  footer:{paddingHorizontal:16,paddingTop:8,paddingBottom:4,gap:12,alignItems:"center",justifyContent:"space-between",borderTopWidth:1,borderColor:"#e2ebf3",backgroundColor:"#fff"},
  error:{color:"#9e2929",fontSize:14},message:{padding:16,gap:8},store:{flex:1,minWidth:0,minHeight:44,flexDirection:"row",alignItems:"center",gap:6},
  smallAction:{minHeight:44,minWidth:44,flexDirection:"row",gap:6,alignItems:"center",justifyContent:"center"},
  totals:{flexDirection:"row",padding:10,borderRadius:12,backgroundColor:"#f0f6fc",gap:16},amount:{fontSize:18,fontWeight:"600",color:"#315e82"},
  tab:{minWidth:76,minHeight:60,alignItems:"center",justifyContent:"center",gap:4},
  go:{width:64,height:64,borderRadius:32,alignItems:"center",justifyContent:"center",gap:2,backgroundColor:"#477ea9",borderWidth:1,borderColor:"#3e7299",shadowColor:"#335e80",shadowOpacity:.1,shadowRadius:5,shadowOffset:{width:0,height:2}},
  goText:{color:"#fff",fontSize:19,fontWeight:"700"},goOrbit:{position:"absolute",width:76,height:76,borderRadius:38},
  orbit:{position:"absolute",padding:6,borderWidth:1,borderColor:"#dce7f1",borderRadius:22,backgroundColor:"#f3f8fd",gap:3,alignItems:"center",justifyContent:"center"},
  orbitLabel:{fontSize:11,fontWeight:"500",textAlign:"center",color:"#446781"},
});
