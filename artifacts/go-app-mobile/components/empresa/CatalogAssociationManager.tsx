import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { createBookableItem, saveBookableItem, getOwnedBookableItems, isCloudId, type BookableItem } from "@/data/booking";
import { manageAssociations, associationMode, type AssociationMode, type CatalogAssociation } from "@/data/catalogAssociations";
import { useLanguage } from "@/contexts/LanguageContext";
import { onSessionChanged } from "@/lib/sessionEvents";
import { useBusinessConfig } from "@/contexts/GoBusinessConfigContext";
import { createDemoBookingRepository } from "@/data/demoBookingRepository";

export function CatalogAssociationManager({ businessId, demo, beforeOpen }: { businessId?: string; demo: boolean; beforeOpen?: () => Promise<void> }) {
  const { lang } = useLanguage(); const label = (es: string, en: string) => lang === "en" ? en : es;
  const { demo: localStore } = useBusinessConfig();
  const local = demo && localStore?.businessId === businessId ? localStore : undefined;
  const manage = (operation: "list" | "create" | "update" | "delete", input: object = {}) => local
    ? createDemoBookingRepository(local).manageAssociations(operation, input)
    : manageAssociations(businessId!, operation, input);
  const [open, setOpen] = useState(false), [items, setItems] = useState<BookableItem[]>([]), [relations, setRelations] = useState<CatalogAssociation[]>([]);
  const [source, setSource] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const [name, setName] = useState(""), [price, setPrice] = useState("");
  const scope = useRef(businessId); scope.current = businessId;
  const inFlight = useRef(false);
  const generation = useRef(0), accountEpoch = useRef(0);
  useEffect(() => onSessionChanged(() => { accountEpoch.current++; generation.current++; setOpen(false); setItems([]); setRelations([]); setSource(""); setName(""); setPrice(""); }), []);
  const load = useCallback(async () => {
    if (!businessId || demo && !local || !demo && !isCloudId(businessId)) return;
    const ticket = ++generation.current;
    setLoading(true);
    try {
      const [catalogue, associations] = await Promise.all([local ? createDemoBookingRepository(local).getCatalogItems(businessId) : getOwnedBookableItems(businessId), manage("list")]);
      if (scope.current === businessId && ticket === generation.current) { setItems(catalogue); setRelations(associations); }
    } finally { if (scope.current === businessId && ticket === generation.current) setLoading(false); }
  }, [businessId, demo, local]);
  useEffect(() => { if (!open || !local) return; return local.subscribe(() => { void load().catch(e => setError(e.message)); }); }, [open, local, load]);
  useEffect(() => { setItems([]); setRelations([]); setSource(""); setError(""); if (open) void load().catch(e => setError(e.message)); }, [businessId, open, load]);
  const editingProduct = items.find(item => item.id === source && item.catalogKind === "product");
  useEffect(() => { setName(editingProduct?.title ?? ""); setPrice(editingProduct ? String(editingProduct.price) : ""); }, [editingProduct?.id]);
  const action = async (operation: () => Promise<unknown>) => {
    if (inFlight.current) return; inFlight.current = true; const current = businessId, epoch = accountEpoch.current; setBusy(true); setError("");
    try { await operation(); if (scope.current === current && epoch === accountEpoch.current) await load(); } catch (e) { if (scope.current === current && epoch === accountEpoch.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { inFlight.current = false; if (scope.current === current) setBusy(false); }
  };
  const button = (text: string, press: () => void, selected = false) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy, selected }} disabled={busy} onPress={press}
    style={{ minHeight: 44, maxWidth: "100%", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: selected ? "#65b883" : "#555", justifyContent: "center" }}><Text style={{ color: "#111827", flexShrink: 1 }}>{text}</Text></TouchableOpacity>;
  const modes: AssociationMode[] = ["included", "optional", "recommended"];
  const titles = { included: label("Incluido", "Included"), optional: label("Opcional", "Optional"), recommended: label("Recomendado", "Recommended") };
  return <View style={{ gap: 8, paddingVertical: 8 }}>
    {button(label("Asociaciones de productos y servicios", "Product and service associations"), () => { if (open) { setOpen(false); return; } void action(async () => { await beforeOpen?.(); setOpen(true); }); }, open)}
    {!!error && <Text accessibilityRole="alert" style={{ color: "#B91C1C" }}>{local
      ? label("No se pudo cargar o guardar el catálogo DEMO. ", "Could not load or save the DEMO catalogue. ")
      : label("No se pudo cargar o guardar el catálogo del servidor. ", "Could not load or save the server catalogue. ")}{error}</Text>}
    {open && <>
      {(!local && (demo || !isCloudId(businessId))) ? <Text style={{ color: "#6B7280" }}>{label("Guarda y verifica el catálogo de la empresa para configurar asociaciones en el servidor.", "Save and verify the business catalogue to configure server associations.")}</Text> : <>
        <Text style={{ color: "#111827" }}>{label("Elemento principal", "Main item")}</Text>
        {loading && <Text accessibilityLiveRegion="polite" style={{ color: "#6B7280" }}>{label("Cargando catálogo…", "Loading catalogue…")}</Text>}
        {!loading && !error && items.length === 0 && <Text style={{ color: "#6B7280" }}>{label("No hay productos ni servicios en el catálogo. Añade un servicio o un producto antes de crear asociaciones.", "There are no products or services in the catalogue. Add a service or a product before creating associations.")}</Text>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{items.map(item => <React.Fragment key={item.id}>{button(`${item.title} · ${item.catalogKind === "product" ? label("Producto", "Product") : label("Servicio", "Service")}${item.active ? "" : label(" · inactivo", " · inactive")}`, () => setSource(item.id), source === item.id)}</React.Fragment>)}</View>
        {relations.filter(row => !items.some(item => item.id === row.source_id) || !items.some(item => item.id === row.target_id)).map(row => <View key={row.id} style={{ gap: 6 }}>
          <Text style={{ color: "#6B7280" }}>{label("Asociación con elemento retirado del catálogo", "Association with an archived catalogue item")} · {row.id.slice(-6)}</Text>
          {button(label("Eliminar asociación", "Delete association"), () => void action(() => manage("delete", { id: row.id, revision: row.revision })))}
        </View>)}
        {source && items.filter(item => item.id !== source).map(item => {
          const relation = relations.find(row => row.source_id === source && row.target_id === item.id);
          return <View key={item.id} style={{ gap: 6, paddingVertical: 8 }}>
            <Text style={{ color: "#111827" }}>{item.title} · {item.price.toFixed(2)} {item.currency ?? "EUR"}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{modes.map(mode => <React.Fragment key={mode}>{button(titles[mode], () => void action(() => relation
              ? manage("update", { id: relation.id, revision: relation.revision, mode })
              : manage("create", { sourceId: source, targetId: item.id, mode })), !!relation && associationMode(relation.mode) === mode)}</React.Fragment>)}</View>
            {relation && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {button(relation.active ? label("Desactivar", "Deactivate") : label("Activar", "Activate"), () => void action(() => manage("update", { id: relation.id, revision: relation.revision, active: !relation.active })))}
              {button(label("Eliminar asociación", "Delete association"), () => void action(() => manage("delete", { id: relation.id, revision: relation.revision })))}
            </View>}
          </View>;
        })}
        <Text style={{ color: "#111827" }}>{editingProduct ? label("Editar producto del catálogo", "Edit catalogue product") : label("Añadir un producto al catálogo existente", "Add a product to the existing catalogue")}</Text>
        {editingProduct && button(label("Nuevo producto", "New product"), () => { setSource(""); setName(""); setPrice(""); })}
        <TextInput accessibilityLabel={label("Nombre del producto", "Product name")} value={name} onChangeText={setName} placeholder={label("Nombre", "Name")} placeholderTextColor="#6B7280" style={{ color: "#111827", minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderColor: "#9CA3AF", borderRadius: 10, backgroundColor: "#F3F4F6" }} />
        <TextInput accessibilityLabel={label("Precio del producto", "Product price")} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0,00 EUR" placeholderTextColor="#6B7280" style={{ color: "#111827", minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderColor: "#9CA3AF", borderRadius: 10, backgroundColor: "#F3F4F6" }} />
        {button(editingProduct ? label("Guardar cambios del producto", "Save product changes") : label("Guardar producto", "Save product"), () => void action(async () => {
          const value = price.replace(",", ".");
          if (!name.trim() || !/^\d+(\.\d{1,2})?$/.test(value) || items.some(item => item.id !== editingProduct?.id && item.title.toLocaleLowerCase() === name.trim().toLocaleLowerCase())) throw Error(label("Revisa nombre y precio. No dupliques un elemento existente.", "Check the name and price. Do not duplicate an existing item."));
          if (local) await createDemoBookingRepository(local).saveCatalogProduct({ ...(editingProduct ?? { id: `${businessId}_product_${Date.now()}_${Math.random().toString(36).slice(2)}`, businessId: businessId!, type: "product", catalogKind: "product", durationMinutes: 0, currency: "EUR", customerCapacity: 1, unitQuantity: 1, paymentRequired: false, active: true, visible: true }), title: name.trim(), price: Number(value) });
          else if (editingProduct) await saveBookableItem({ ...editingProduct, title: name.trim(), price: Number(value) });
          else await createBookableItem({ businessId: businessId!, title: name.trim(), type: "product", catalogKind: "product", durationMinutes: 0, price: Number(value), currency: "EUR", customerCapacity: 1, unitQuantity: 1, paymentRequired: false, active: true, visible: true });
          setName(""); setPrice("");
        }))}
      </>}
    </>}
  </View>;
}
