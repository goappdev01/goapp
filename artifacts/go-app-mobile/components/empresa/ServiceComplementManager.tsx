import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { createBookableItem, getOwnedBookableItems, isCloudId, saveBookableItem, type BookableItem } from "@/data/booking";
import { manageAssociations, parseEuroSupplement, type CatalogAssociation } from "@/data/catalogAssociations";
import { createDemoBookingRepository } from "@/data/demoBookingRepository";
import { useBusinessConfig } from "@/contexts/GoBusinessConfigContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { onSessionChanged } from "@/lib/sessionEvents";

/** Adds optional zero-duration catalogue products to an existing service.
 * The server's catalogue quote and booking snapshot remain the price authority. */
export function ServiceComplementManager({ businessId, demo, beforeOpen }: { businessId?: string; demo: boolean; beforeOpen: () => Promise<void> }) {
  const { lang } = useLanguage();
  const label = (es: string, en: string) => lang === "en" ? en : es;
  const { demo: store } = useBusinessConfig();
  const local = demo && store?.businessId === businessId ? store : undefined;
  const [open, setOpen] = useState(false), [items, setItems] = useState<BookableItem[]>([]), [relations, setRelations] = useState<CatalogAssociation[]>([]);
  const [source, setSource] = useState(""), [editing, setEditing] = useState(""), [name, setName] = useState(""), [price, setPrice] = useState("");
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const epoch = useRef(0), inFlight = useRef(false);
  useEffect(() => onSessionChanged(() => { epoch.current++; setOpen(false); setItems([]); setRelations([]); setSource(""); setEditing(""); setName(""); setPrice(""); }), []);
  useEffect(() => { epoch.current++; setOpen(false); setItems([]); setRelations([]); setSource(""); setEditing(""); setName(""); setPrice(""); setError(""); }, [businessId]);

  const manage = (operation: "list" | "create" | "update" | "delete", input: object = {}) => local
    ? createDemoBookingRepository(local).manageAssociations(operation, input)
    : manageAssociations<CatalogAssociation[]>(businessId!, operation, input);
  const load = useCallback(async () => {
    if (!businessId || demo && !local || !demo && !isCloudId(businessId)) return;
    const ticket = epoch.current;
    setLoading(true);
    try {
      const [catalogue, edges] = await Promise.all([
        local ? createDemoBookingRepository(local).getCatalogItems(businessId) : getOwnedBookableItems(businessId),
        local ? createDemoBookingRepository(local).manageAssociations("list") : manageAssociations<CatalogAssociation[]>(businessId, "list"),
      ]);
      if (ticket !== epoch.current) return;
      setItems(catalogue.filter(item => item.businessId === businessId));
      setRelations(edges.filter(edge => edge.business_id === businessId));
    } finally { if (ticket === epoch.current) setLoading(false); }
  }, [businessId, demo, local]);
  useEffect(() => { if (open) void load().catch(e => setError(e instanceof Error ? e.message : String(e))); }, [open, load]);

  const run = async (work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; const ticket = epoch.current;
    setBusy(true); setError("");
    try { await work(); if (ticket === epoch.current) await load(); }
    catch (e) { if (ticket === epoch.current) { await load().catch(() => {}); setError(e instanceof Error ? e.message : String(e)); } }
    finally { inFlight.current = false; if (ticket === epoch.current) setBusy(false); }
  };
  const resetDraft = () => { setEditing(""); setName(""); setPrice(""); };
  const services = items.filter(item => item.catalogKind !== "product" && item.active && item.visible);
  const selectedService = services.find(item => item.id === source);
  const supplements = relations.filter(edge => edge.source_id === source && items.some(item => item.id === edge.target_id && item.catalogKind === "product"))
    .sort((a, b) => (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER));
  const productFor = (edge: CatalogAssociation) => items.find(item => item.id === edge.target_id)!;
  const save = () => void run(async () => {
    if (!selectedService || !businessId) throw Error(label("Elige un servicio guardado.", "Select a saved service."));
    const title = name.trim(), supplement = parseEuroSupplement(price);
    if (!title) throw Error(label("Escribe el nombre del complemento.", "Enter the supplement name."));
    if (supplements.some(edge => edge.id !== editing && productFor(edge).title.toLocaleLowerCase() === title.toLocaleLowerCase()))
      throw Error(label("Ese complemento ya existe para el servicio.", "This supplement already exists for the service."));
    if (editing) {
      const edge = supplements.find(row => row.id === editing), item = edge && productFor(edge);
      if (!edge || !item || item.businessId !== businessId || item.currency !== "EUR") throw Error(label("El complemento ha cambiado. Vuelve a abrirlo.", "The supplement changed. Open it again."));
      if (relations.some(row => row.id !== edge.id && row.target_id === item.id && row.active))
        throw Error(label("Este producto está compartido por otros servicios. Edítalo desde el catálogo general.", "This product is shared by other services. Edit it in the main catalogue."));
      const updated = { ...item, title, price: supplement };
      if (local) await createDemoBookingRepository(local).saveCatalogProduct(updated);
      else await saveBookableItem(updated);
    } else {
      // A failed association leaves a recoverable catalogue product; reuse it on retry.
      const orphan = items.find(item => item.catalogKind === "product" && item.businessId === businessId
        && item.catalogMetadata?.goAddonFor === source && item.title === title && item.price === supplement
        && !relations.some(edge => edge.target_id === item.id));
      let targetId = orphan?.id;
      if (!targetId) {
        const product = { businessId, title, type: "product", catalogKind: "product" as const, durationMinutes: 0,
          price: supplement, currency: "EUR", customerCapacity: 1, unitQuantity: 1, paymentRequired: false,
          active: true, visible: true, catalogMetadata: { goAddonFor: source } };
        if (local) {
          targetId = `${businessId}_product_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          await createDemoBookingRepository(local).saveCatalogProduct({ ...product, id: targetId });
        } else targetId = (await createBookableItem(product)).id;
      }
      await manage("create", { sourceId: source, targetId, mode: "optional" });
    }
    resetDraft();
  });
  const reorder = (index: number, direction: -1 | 1) => void run(async () => {
    if (!local || !source || index + direction < 0 || index + direction >= supplements.length) return;
    const ordered = supplements.map(edge => edge.id);
    [ordered[index], ordered[index + direction]] = [ordered[index + direction], ordered[index]];
    await local.transformConfig(config => {
      const ranks = new Map(ordered.map((id, position) => [id, (position + 1) * 10]));
      return { ...config, catalogAssociations: (config.catalogAssociations ?? []).map(edge => edge.business_id === businessId && edge.source_id === source && ranks.has(edge.id)
        ? { ...edge, sort_order: ranks.get(edge.id), revision: edge.revision + 1 } : edge) };
    });
  });
  const button = (title: string, onPress: () => void, selected = false, disabled = false, accessibilityLabel = title) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ selected, disabled: busy || disabled }} disabled={busy || disabled} onPress={onPress}
    style={{ minHeight: 44, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
      borderColor: selected ? "#008754" : "#9CA3AF", backgroundColor: selected ? "#E7F5ED" : "#FFFFFF", justifyContent: "center" }}>
    <Text style={{ color: "#111827", fontWeight: selected ? "700" : "500" }}>{title}</Text>
  </TouchableOpacity>;

  return <View style={{ gap: 8, paddingVertical: 8 }}>
    {button(label("Complementos por servicio", "Supplements by service"), () => {
      if (open) { setOpen(false); resetDraft(); return; }
      void run(async () => { await beforeOpen(); setOpen(true); });
    }, open)}
    {!!error && <Text accessibilityRole="alert" style={{ color: "#B91C1C" }}>{error}</Text>}
    {open && <View style={{ gap: 10 }}>
      {loading && <Text style={{ color: "#374151" }}>{label("Cargando servicios…", "Loading services…")}</Text>}
      {!loading && !services.length && <Text style={{ color: "#374151" }}>{label("Guarda primero un servicio principal.", "Save a main service first.")}</Text>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{services.map(service => <React.Fragment key={service.id}>
        {button(service.title, () => { setSource(service.id); resetDraft(); }, source === service.id)}
      </React.Fragment>)}</View>
      {selectedService && <View style={{ gap: 8 }}>
        <Text style={{ color: "#111827", fontWeight: "700" }}>{label("Complementos opcionales de", "Optional supplements for")} {selectedService.title}</Text>
        {supplements.map((edge, index) => {
          const item = productFor(edge);
          return <View key={edge.id} style={{ padding: 8, borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10, gap: 4 }}>
            <Text style={{ color: "#111827" }}>{item.title} · {item.price.toFixed(2)} €{edge.active ? "" : label(" · inactivo", " · inactive")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {button(label("Editar", "Edit"), () => { setEditing(edge.id); setName(item.title); setPrice(item.price.toFixed(2)); }, false, false, label("Editar ", "Edit ") + item.title)}
              {button(edge.active ? label("Desactivar", "Deactivate") : label("Activar", "Activate"), () => void run(async () => { await manage("update", { id: edge.id, revision: edge.revision, active: !edge.active }); }), false, false, (edge.active ? label("Desactivar ", "Deactivate ") : label("Activar ", "Activate ")) + item.title)}
              {button(label("Quitar", "Remove"), () => void run(async () => { await manage("delete", { id: edge.id, revision: edge.revision }); if (editing === edge.id) resetDraft(); }), false, false, label("Quitar ", "Remove ") + item.title)}
              {local && button("↑", () => reorder(index, -1), false, index === 0, label("Subir ", "Move up ") + item.title)}
              {local && button("↓", () => reorder(index, 1), false, index === supplements.length - 1, label("Bajar ", "Move down ") + item.title)}
            </View>
          </View>;
        })}
        {!local && supplements.length > 1 && <Text style={{ color: "#6B7280" }}>{label("El orden manual espera la actualización del catálogo del servidor.", "Manual ordering awaits the server catalogue update.")}</Text>}
        <TextInput accessibilityLabel={label("Nombre del complemento", "Supplement name")} value={name} onChangeText={setName}
          placeholder={label("Nombre del complemento", "Supplement name")} placeholderTextColor="#6B7280"
          style={{ minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderColor: "#9CA3AF", borderRadius: 10, color: "#111827" }} />
        <TextInput accessibilityLabel={label("Suplemento en euros", "Supplement in euros")} value={price} onChangeText={setPrice}
          keyboardType="decimal-pad" placeholder="0,00 €" placeholderTextColor="#6B7280"
          style={{ minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderColor: "#9CA3AF", borderRadius: 10, color: "#111827" }} />
        <Text style={{ color: "#6B7280" }}>{label("Escribe 0,00 si es gratuito. Un producto complementario no añade minutos ni cambia la capacidad.", "Enter 0.00 if free. A product supplement adds no time and does not change capacity.")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {button(editing ? label("Guardar complemento", "Save supplement") : label("Añadir complemento", "Add supplement"), save)}
          {editing && button(label("Cancelar edición", "Cancel editing"), resetDraft)}
        </View>
      </View>}
    </View>}
  </View>;
}
