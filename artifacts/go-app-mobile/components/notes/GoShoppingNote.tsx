import React, { useEffect, useRef, useState } from "react";
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputProps } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GoEntry } from "@/components/AgendaOperativa";
import { GoScreenModal } from "@/components/ui/GoScreenModal";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import { useGoNoteKeyboard } from "@/hooks/useGoNoteKeyboard";
import type { TaskScope } from "@/lib/goTaskReminders";
import { subscribeGoLog, getGoLogSnapshot } from "@/lib/goLogStore";
import { noteInScope } from "@/lib/unifiedNotes";
import { openShoppingNote, oldShoppingNotes, runShoppingOperation } from "@/lib/shoppingNoteStore";
import { comparableShoppingPrices, legacyShoppingCandidates, normalizedShoppingPrice, shoppingEditor, shoppingEstimate, shoppingId, suggestShoppingCategory, visibleShopping,
  SHOPPING_CATEGORIES, SHOPPING_UNITS, type MeasureUnit, type ShoppingDocument, type ShoppingEditorDraft, type ShoppingFilter, type ShoppingItem, type ShoppingOperation } from "@/lib/shoppingNote";
import { ShoppingReorderHandle, ShoppingReorderRow, ShoppingReorderSurface } from "./ShoppingReorderSurface";

type Props={visible:boolean;scope:TaskScope|null;ready:boolean;handedness:"left"|"right";onClose:()=>void;closeRequested?:boolean};
type InputOperation=ShoppingOperation extends infer O?O extends ShoppingOperation?Omit<O,"operationId">:never:never;
const decimal=(n:number)=>n.toLocaleString("es-ES",{maximumFractionDigits:3});
const money=(n:number,currency:string)=>decimal(Math.round(n*100)/100)+" "+currency;
export function GoShoppingNote({visible,scope,ready,handedness,onClose,closeRequested}:Props){
  const insets=useSafeAreaInsets(),keyboard=useGoNoteKeyboard(visible);
  const [entry,setEntry]=useState<GoEntry|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
  const [filter,setFilter]=useState<ShoppingFilter>("all"),[expanded,setExpanded]=useState<string|null>(null),[arrange,setArrange]=useState(false),[dragging,setDragging]=useState(false);
  const [editor,setEditor]=useState<ShoppingEditorDraft|null>(null),[draftStatus,setDraftStatus]=useState(""),[next,setNext]=useState<string[]|null>(null);
  const [oldNotes,setOldNotes]=useState<GoEntry[]>([]),[legacy,setLegacy]=useState<GoEntry|null>(null),[legacySelected,setLegacySelected]=useState<string[]>([]);
  const [retry,setRetry]=useState(0),scroll=useRef<React.ElementRef<typeof ScrollView>>(null),editScroll=useRef<React.ElementRef<typeof ScrollView>>(null);
  const mounted=useRef(true),generation=useRef(0),lock=useRef(false),draftSequence=useRef(0),draftRef=useRef(editor);draftRef.current=editor;
  const retries=useRef(new Map<string,string>());
  const identity=JSON.stringify(scope),latest=useRef({scope,ready,visible,identity});latest.current={scope,ready,visible,identity};
  const currentEntry=useRef(entry);currentEntry.current=entry;
  const active=(expected:string,epoch:number)=>mounted.current&&latest.current.visible&&latest.current.ready&&latest.current.identity===expected&&generation.current===epoch;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
  useEffect(()=>{
    const epoch=++generation.current;setEntry(null);setEditor(null);setNext(null);setLegacy(null);setOldNotes([]);setError("");setFilter("all");setExpanded(null);setArrange(false);setBusy(false);lock.current=false;retries.current.clear();draftSequence.current++;
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
  const action=(input:InputOperation)=>{void operate(input).catch(()=>{});};
  function writeDraft(draft:ShoppingEditorDraft){
    draftRef.current=draft;setEditor(draft);setDraftStatus("Guardando borrador…");const sequence=++draftSequence.current;
    void operate({type:"draft",draft},false).then(()=>{if(sequence===draftSequence.current)setDraftStatus("Borrador guardado en el teléfono.");})
      .catch(()=>{if(sequence===draftSequence.current)setDraftStatus("Borrador pendiente de guardar. Reintenta antes de salir.");});
  }
  function change(patch:Partial<ShoppingEditorDraft>){const d=draftRef.current;if(d)writeDraft({...d,...patch});}
  function startEditor(item?:ShoppingItem){
    if(busy||dragging)return;
    if(doc?.pendingEditor){Alert.alert("Borrador pendiente","Recupera o descarta el borrador antes de editar otro producto.",[{text:"Cancelar",style:"cancel"},{text:"RECUPERAR",onPress:()=>{setEditor(doc.pendingEditor!);draftRef.current=doc.pendingEditor!;}}]);return;}
    setNext(null);setLegacy(null);setArrange(false);writeDraft(shoppingEditor(item));
  }
  function back(){
    if(busy||dragging)return;
    if(keyboard.isActive()){void keyboard.dismiss();return;}
    if(editor&&draftStatus.startsWith("Borrador pendiente")){setError("El borrador aún no está guardado. Reintenta su guardado o descártalo expresamente.");return;}
    if(editor&&draftStatus==="Guardando borrador…"){setError("Espera a que termine el guardado del borrador antes de volver.");return;}
    if(editor){setEditor(null);draftRef.current=null;return;}
    if(next){setNext(null);return;}if(legacy){setLegacy(null);return;}if(arrange){setArrange(false);return;}
    onClose();
  }
  useEffect(()=>{if(closeRequested)back();},[closeRequested]);
  async function save(){
    const draft=draftRef.current;if(!doc||!draft||lock.current)return;
    const expected=identity,epoch=generation.current;
    try{
      await operate({type:"saveItem",draft});if(!active(expected,epoch))return;draftSequence.current++;setEditor(null);draftRef.current=null;Keyboard.dismiss();
    }catch(e){if(active(expected,epoch))setError((e as Error).message);}
  }
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
  const totals=doc?shoppingEstimate(doc):{totals:{},unknown:0},items=doc?.items||[],pending=items.filter(i=>i.selected&&!i.bought).length,bought=items.filter(i=>i.selected&&i.bought).length;
  const panel=!!editor||!!next||!!legacy;
  if(!visible)return null;
  return <GoScreenModal visible animationType="slide" onRequestClose={back}>
    <GestureHandlerRootView style={s.root}><KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":"height"} style={[s.root,{paddingTop:insets.top,paddingBottom:Math.max(8,insets.bottom),paddingHorizontal:Math.max(insets.left,insets.right)}]}>
      <View style={s.header}><Text accessibilityRole="header" style={s.heading}>{editor?"EDITAR PRODUCTO":next?"PRÓXIMA COMPRA":legacy?"INCORPORAR NOTA ANTIGUA":"COMPRAS"}</Text>
        {!panel&&<Text style={s.hint}>{pending} pendientes · {bought} comprados · {items.length} guardados</Text>}</View>
      {!ready||!scope?<Text style={s.message}>Inicia sesión y abre el ámbito personal de GO para usar COMPRAS.</Text>:loading?<Text style={s.message}>Abriendo tu lista personal…</Text>:null}
      {!!error&&<View style={s.message}><Text testID="shopping-error" accessibilityRole="alert" style={s.error}>{error}</Text>{!doc&&button("REINTENTAR",()=>setRetry(v=>v+1),"shopping-retry")}</View>}
      {doc&&<>
      <View style={[{flex:1,minHeight:0},panel&&{display:"none"}]}>
        <View style={[s.row,{paddingHorizontal:12}]}>{([["pending","PENDIENTES"],["all","TODOS"],["bought","COMPRADOS"]] as const).map(([key,label])=><React.Fragment key={key}>{button(label,()=>{if(!dragging)setFilter(key);},"shopping-filter-"+key,filter===key,dragging)}</React.Fragment>)}</View>
        <ShoppingReorderSurface enabled={!busy&&!panel&&!keyboard.visible&&!loading} onDrop={reorder} onDragging={setDragging} scrollRef={scroll}>
          {doc.pendingEditor&&!editor&&<View style={s.details}><Text style={s.text}>Hay un producto sin terminar. Sus datos están guardados como borrador.</Text>{button("RECUPERAR BORRADOR",()=>{setEditor(doc.pendingEditor!);draftRef.current=doc.pendingEditor!;},"shopping-resume-draft")}</View>}
          <Text style={s.hint}>{arrange?"Mantén pulsada el asa de una sección y arrastra. Este recorrido es personal.":filter!=="all"?"Para arrastrar productos, selecciona TODOS.":"Mantén pulsada el asa ≡ medio segundo para arrastrar dentro de su sección."}</Text>
          {visibleShopping(doc,filter).map(({category,items:visibleItems})=>{
            const definition=SHOPPING_CATEGORIES.find(c=>c[0]===category)!,all=items.filter(i=>i.category===category),collapsed=doc.collapsed.includes(category);
            const target={id:category,group:"categories",kind:"column" as const,label:definition[2]};
            return <View key={category} testID={"shopping-section-"+category} style={s.section}>
              <ShoppingReorderRow target={target}><View style={s.row}>
                <TouchableOpacity testID={"shopping-collapse-"+category} accessibilityRole="button" accessibilityLabel={(collapsed?"Expandir ":"Contraer ")+definition[2]} accessibilityState={{expanded:!collapsed}} disabled={busy||dragging} style={{flex:1,minHeight:52,justifyContent:"center"}} onPress={()=>action({type:"collapse",category,value:!collapsed})}>
                  <Text style={s.sectionTitle}>{definition[1]} · {definition[2]} {collapsed?"▸":"▾"}</Text><Text style={s.hint}>{all.filter(i=>i.selected&&!i.bought).length} pendientes · {all.filter(i=>i.selected&&i.bought).length} comprados</Text>
                </TouchableOpacity>{arrange&&<ShoppingReorderHandle target={target}/>}</View></ShoppingReorderRow>
              {!arrange&&visibleItems.map(({item,number})=>{
                const target={id:item.id,group:category,kind:"card" as const,label:item.name},price=item.prices.find(p=>p.id===item.selectedPriceId),last=item.prices[item.prices.length-1],norm=price&&normalizedShoppingPrice(price),step=item.unit==="kg"||item.unit==="litros" ? 0.1 : 1;
                return <ShoppingReorderRow key={item.id} target={target}><View testID={"shopping-item-"+item.id} style={[s.item,item.bought&&s.bought,!item.selected&&{backgroundColor:"#f1f1ed"}]}>
                  <View style={[s.row,{flexDirection:handedness==="left"?"row-reverse":"row",flexWrap:"nowrap"}]}>
                    <View style={{flex:1,gap:4}}><Text style={[s.product,item.bought&&{textDecorationLine:"line-through",color:"#50645b"}]}>{number}. {item.name}</Text><Text style={s.text}>{decimal(item.quantity)} {item.unit}{item.packageQuantity!==undefined?` · ${decimal(item.packageQuantity)} ${item.packageUnit}/${item.unit==="paquetes"?"paquete":"unidad"}`:""}</Text><Text style={s.hint}>{!item.selected?"Guardado · fuera de esta compra":item.bought?"COMPRADO":"PENDIENTE"}{item.usual?" · habitual":""}</Text></View>
                    <TouchableOpacity testID={"shopping-bought-"+item.id} accessibilityRole="checkbox" accessibilityLabel={"COMPRADO: "+item.name} accessibilityState={{checked:item.bought,disabled:busy||!item.selected}} disabled={busy||!item.selected||dragging} onPress={()=>action({type:"bought",id:item.id,value:!item.bought})} style={s.checkbox}><Text style={{fontSize:30,color:"#20603f"}}>{item.bought?"☑":"☐"}</Text></TouchableOpacity>
                    {filter==="all"&&<ShoppingReorderHandle target={target}/>}
                  </View>
                  <View style={s.row}>{button("−",()=>action({type:"quantity",id:item.id,value:Number((item.quantity-step).toFixed(3))}),"shopping-minus-"+item.id,false,item.quantity<=step||dragging)}{button("+",()=>action({type:"quantity",id:item.id,value:Number((item.quantity+step).toFixed(3))}),"shopping-plus-"+item.id,false,dragging)}{button("EDITAR",()=>startEditor(item),"shopping-edit-"+item.id,false,dragging)}{button(expanded===item.id?"MENOS":"DETALLES",()=>setExpanded(expanded===item.id?null:item.id),"shopping-details-"+item.id,false,dragging)}</View>
                  {expanded===item.id&&<View style={s.details}>
                    {price?<><Text style={s.text}>Precio elegido para estimación: {money(price.price,price.currency)}</Text><Text style={s.hint}>{norm?money(norm.value,price.currency)+"/"+norm.unit:"No comparable"} · {price.store} · {price.observedOn}</Text></>:<Text style={s.hint}>Sin precio anotado{item.preferredStore?" · "+item.preferredStore:""}</Text>}
                    {last&&<Text style={s.hint}>Última anotación: {last.store} · {last.observedOn} · {money(last.price,last.currency)}</Text>}
                    {!!item.notes&&<Text style={s.text}>{item.notes}</Text>}
                    {button(item.selected?"RETIRAR DE ESTA COMPRA":"INCLUIR EN ESTA COMPRA",()=>action({type:"select",id:item.id,value:!item.selected}),"shopping-select-"+item.id)}
                    {button("ELIMINAR PRODUCTO",()=>Alert.alert("Eliminar producto",`Se eliminarán «${item.name}» y sus precios guardados. Marcar COMPRADO conserva ambos.`,[{text:"Cancelar",style:"cancel"},{text:"ELIMINAR",style:"destructive",onPress:()=>action({type:"delete",id:item.id,confirmed:true})}]),"shopping-delete-"+item.id)}
                  </View>}
                </View></ShoppingReorderRow>;
              })}
              {!arrange&&!collapsed&&!visibleItems.length&&<Text style={s.hint}>Sin productos en esta vista.</Text>}
            </View>;
          })}
          <View style={s.details}><Text style={s.label}>TOTAL ESTIMADO DE ESTA COMPRA</Text><Text testID="shopping-estimate" style={s.text}>{Object.entries(totals.totals).map(([currency,value])=>money(value,currency)).join(" + ")||"Sin precios conocidos"}</Text><Text style={s.hint}>{totals.unknown} artículos sin precio aplicable. Importe parcial; los precios anotados no son precios actuales verificados.</Text></View>
          {button(arrange?"TERMINAR ORDEN DE SECCIONES":"ORDENAR SECCIONES",()=>setArrange(v=>!v),"shopping-arrange-categories",arrange,dragging)}
          {button("PREPARAR PRÓXIMA COMPRA",()=>{setNext([]);setArrange(false);},"shopping-next",false,dragging)}
          {oldNotes.length>0&&<View style={s.details}><Text style={s.label}>NOTAS ANTIGUAS «COMPRAS»</Text><Text style={s.hint}>Se conservan intactas. Selecciona expresamente qué nombres quieres incorporar; revisa cantidades después.</Text>{oldNotes.map((old,index)=><React.Fragment key={old.id}>{button("REVISAR COMPRAS ANTIGUA "+(index+1),()=>{setLegacy(old);setLegacySelected([]);},"shopping-legacy-"+index,false,dragging)}</React.Fragment>)}</View>}
          <Text testID="shopping-ai-status" style={s.hint}>GO IA no está conectada a COMPRAS en esta versión. Añade y corrige productos manualmente, incluso sin conexión. No se realizan pedidos ni pagos.</Text>
        </ShoppingReorderSurface>
      </View>
      {editor&&<ScrollView ref={editScroll} testID="shopping-editor-scroll" keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{padding:16,gap:14}}>
        <Text style={s.hint}>Solo el nombre es obligatorio. Cantidad por defecto: 1. El borrador se conserva sin modificar aún el producto.</Text>
        {field("name","NOMBRE DEL PRODUCTO",{onChangeText:name=>change({name,...(editor.category==="other"?{category:suggestShoppingCategory(name,doc)}:{})}),autoCapitalize:"sentences"})}
        <Text style={s.label}>CATEGORÍA · sugerencia local, puedes cambiarla</Text><View style={s.row}>{SHOPPING_CATEGORIES.map(([id,letter,label])=><React.Fragment key={id}>{button(letter+" · "+label,()=>change({category:id}),"shopping-category-"+id,editor.category===id)}</React.Fragment>)}</View>
        {field("quantity","CANTIDAD",{keyboardType:"decimal-pad"})}<Text style={s.label}>UNIDAD</Text><View style={s.row}>{SHOPPING_UNITS.map(unit=><React.Fragment key={unit}>{button(unit,()=>change({unit}),"shopping-unit-"+unit,editor.unit===unit)}</React.Fragment>)}</View>
        {field("packageQuantity","TAMAÑO POR UNIDAD / PAQUETE (OPCIONAL)",{keyboardType:"decimal-pad"})}<View style={s.row}>{SHOPPING_UNITS.filter(u=>u!=="paquetes").map(unit=><React.Fragment key={unit}>{button(unit,()=>change({packageUnit:unit as MeasureUnit}),undefined,editor.packageUnit===unit)}</React.Fragment>)}</View>
        {checkButton("Producto habitual",editor.usual,()=>change({usual:!editor.usual}),"shopping-usual")}{field("notes","NOTAS (OPCIONAL)",{multiline:true})}
        <View style={s.details}><Text style={s.sectionTitle}>Nueva observación de precio (opcional)</Text><Text style={s.hint}>{editor.unit==="paquetes"||editor.unit==="unidades"?"Precio por cada "+editor.unit+" de esta fila.":"Precio del envase observado: indica su contenido para calcular por peso o volumen."} Añade otra observación para cambiar de tienda; las anteriores se conservan.</Text>
          {field("store","SUPERMERCADO (OPCIONAL SIN PRECIO)")}{field("price",editor.unit==="paquetes"||editor.unit==="unidades"?"PRECIO POR "+editor.unit.toLocaleUpperCase("es"):"PRECIO DEL ENVASE OBSERVADO",{keyboardType:"decimal-pad"})}
          {field("currency","MONEDA",{autoCapitalize:"characters",maxLength:3})}{field("observedOn","FECHA DE OBSERVACIÓN (AAAA-MM-DD)",{keyboardType:"numbers-and-punctuation"})}
          {field("priceQuantity","CONTENIDO DEL ENVASE OBSERVADO (OPCIONAL)",{keyboardType:"decimal-pad"})}<View style={s.row}>{SHOPPING_UNITS.filter(u=>u!=="paquetes").map(unit=><React.Fragment key={unit}>{button(unit,()=>change({priceUnit:unit as MeasureUnit}),undefined,editor.priceUnit===unit)}</React.Fragment>)}</View>
          {field("brand","MARCA / VARIEDAD (OPCIONAL)")}{field("format","FORMATO (OPCIONAL, EJ. SECO, FRESCO)")}
          <Text style={s.hint}>Sin contenido y unidad: «No comparable». Solo se comparan observaciones con la misma moneda, marca y formato declarados y una medida equivalente.</Text>
        </View>
        {items.find(i=>i.id===editor.id)?.prices.map(p=>{const n=normalizedShoppingPrice(p);return <View key={p.id} testID={"shopping-price-"+p.id} style={s.details}><Text style={s.text}>{p.store} · {p.observedOn} · {money(p.price,p.currency)} / {p.purchaseUnit}</Text><Text style={s.hint}>{p.packageQuantity!==undefined?decimal(p.packageQuantity)+" "+p.packageUnit+" · ":""}{p.brand} {p.format}</Text><Text style={s.text}>{n?money(n.value,p.currency)+"/"+n.unit:"No comparable"}</Text>{button("USAR PARA ESTIMACIÓN",()=>{
          void operate({type:"selectPrice",id:editor.id,priceId:p.id}).then(row=>{const saved=row.note!.shopping!.items.find(i=>i.id===editor.id)!;change({expectedRevision:saved.revision});}).catch(()=>{});
        },"shopping-use-price-"+p.id,items.find(i=>i.id===editor.id)?.selectedPriceId===p.id)}</View>;})}
        {comparableShoppingPrices(items.find(i=>i.id===editor.id)?.prices||[]).map((group,index)=><View key={index} testID="shopping-price-comparison" style={s.details}><Text style={s.label}>MISMA MARCA Y FORMATO · ORDEN POR PRECIO UNITARIO</Text>{group.map(p=><Text key={p.id} style={s.text}>{p.store}: {money(normalizedShoppingPrice(p)!.value,p.currency)}/{normalizedShoppingPrice(p)!.unit} · {p.observedOn}</Text>)}</View>)}
        <Text testID="shopping-draft-status" accessibilityLiveRegion="polite" style={s.hint}>{draftStatus}</Text>
        {button("REINTENTAR GUARDAR BORRADOR",()=>writeDraft(editor),"shopping-retry-draft")}
        {button("DESCARTAR BORRADOR",()=>Alert.alert("Descartar borrador","El producto guardado y sus precios se conservarán.",[{text:"Cancelar",style:"cancel"},{text:"DESCARTAR",style:"destructive",onPress:()=>{void operate({type:"draft"}).then(()=>{setEditor(null);draftRef.current=null;draftSequence.current++;}).catch(()=>{});}}]),"shopping-discard-draft")}
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
      <View testID="shopping-thumb-controls" style={[s.footer,{flexDirection:handedness==="left"?"row-reverse":"row"}]}>
        {!!doc&&!panel&&<View style={{flex:1,minWidth:0}}>{button("AÑADIR PRODUCTO",()=>startEditor(),"shopping-add",true,dragging)}</View>}
        {!!doc&&editor&&<View style={{flex:1,minWidth:0}}>{button("GUARDAR PRODUCTO",()=>void save(),"shopping-save",true)}</View>}
        <GoCloseButton testID="shopping-back" level="panel" appearance="light" touchSize={56} disabled={busy||dragging} keyboardVisible={keyboard.visible} onPress={back} accessibilityLabel={keyboard.visible?"Ocultar teclado":panel||arrange?"Volver a COMPRAS":"Volver a NOTAS"}/>
      </View>
    </KeyboardAvoidingView></GestureHandlerRootView>
  </GoScreenModal>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:"#f6f8f2"},header:{padding:12,gap:4},heading:{fontSize:22,fontWeight:"800",color:"#173e2c"},hint:{fontSize:14,color:"#506057",lineHeight:21},text:{fontSize:17,color:"#1c3025",flexShrink:1},label:{fontSize:15,fontWeight:"700",color:"#2b4938"},sectionTitle:{fontSize:18,fontWeight:"700",color:"#214831",flexShrink:1},row:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:6},button:{minHeight:48,minWidth:48,paddingVertical:10,paddingHorizontal:12,borderWidth:1,borderColor:"#9baea0",borderRadius:12,backgroundColor:"#fff",justifyContent:"center"},chosen:{backgroundColor:"#245b3d",borderColor:"#245b3d"},buttonText:{fontSize:15,fontWeight:"700",color:"#23402d",textAlign:"center",flexShrink:1},checked:{backgroundColor:"#d9eddb"},input:{minHeight:52,borderWidth:1,borderColor:"#82998a",backgroundColor:"#fff",borderRadius:12,fontSize:18,color:"#182e21",padding:12},section:{backgroundColor:"#e7efe3",borderRadius:14,padding:10,gap:8},item:{borderWidth:1,borderColor:"#b4c5b4",borderRadius:12,padding:10,gap:8,backgroundColor:"#fff"},bought:{backgroundColor:"#deecdf",borderColor:"#728d78"},product:{fontSize:21,fontWeight:"700",color:"#173c27",flexShrink:1},checkbox:{minWidth:52,minHeight:56,alignItems:"center",justifyContent:"center"},details:{gap:8,padding:12,backgroundColor:"#eff4eb",borderWidth:1,borderColor:"#b5c7b4",borderRadius:12},footer:{paddingHorizontal:12,paddingTop:8,gap:8,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",borderTopWidth:1,borderColor:"#cad6c8"},error:{color:"#9e2929",fontSize:16},message:{padding:16,gap:8}});
