import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { createBookableItem, getOwnedBookableItems, isCloudId, saveBookableItem, type BookableItem } from "@/data/booking";
import { manageAssociations, parseEuroSupplement, type CatalogAssociation } from "@/data/catalogAssociations";
import { createDemoBookingRepository } from "@/data/demoBookingRepository";
import { useBusinessConfig } from "@/contexts/GoBusinessConfigContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { onSessionChanged } from "@/lib/sessionEvents";

type Catalog = { items: BookableItem[]; relations: CatalogAssociation[] };
const empty: Catalog = { items: [], relations: [] };
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** The existing catalogue is read once for the whole service step. */
export function useServiceComplementCatalog(businessId: string | undefined, demo: boolean, enabled: boolean) {
  const { demo: store } = useBusinessConfig();
  const local = demo && store?.businessId === businessId ? store : undefined;
  const [catalog, setCatalog] = useState<Catalog>(empty);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), accountEpoch = useRef(0), scope = useRef(businessId), queue = useRef<Promise<unknown>>(Promise.resolve());
  scope.current = businessId;
  useEffect(() => onSessionChanged(() => { accountEpoch.current++; generation.current++; setCatalog(empty); setError(""); }), []);
  const read = useCallback(async (): Promise<Catalog> => {
    if (!businessId || demo && !local || !demo && !isCloudId(businessId)) throw Error("Guarda primero la empresa para añadir productos asociados.");
    const ticket = ++generation.current, epoch = accountEpoch.current;
    setLoading(true);
    try {
      const [items, relations] = await Promise.all([
        local ? createDemoBookingRepository(local).getCatalogItems(businessId) : getOwnedBookableItems(businessId),
        local ? createDemoBookingRepository(local).manageAssociations("list") : manageAssociations<CatalogAssociation[]>(businessId, "list"),
      ]);
      if (scope.current !== businessId || epoch !== accountEpoch.current) throw Error("La cuenta o empresa cambió; vuelve a abrir sus servicios.");
      const next = { items: items.filter(item => item.businessId === businessId), relations: relations.filter(edge => edge.business_id === businessId) };
      if (ticket === generation.current) setCatalog(next);
      return next;
    } finally { if (scope.current === businessId && ticket === generation.current) setLoading(false); }
  }, [businessId, demo, local]);
  useEffect(() => {
    generation.current++; setCatalog(empty); setError("");
    const epoch = accountEpoch.current;
    if (enabled && businessId) void read().catch(e => { if (epoch === accountEpoch.current) setError(e instanceof Error ? e.message : String(e)); });
  }, [enabled, businessId, read]);
  useEffect(() => { if (!enabled || !local) return; return local.subscribe(() => {
    const epoch = accountEpoch.current;
    void read().catch(e => { if (epoch === accountEpoch.current) setError(e instanceof Error ? e.message : String(e)); });
  }); }, [enabled, local, read]);
  const mutate = useCallback((work: (fresh: Catalog) => Promise<void>): Promise<void> => {
    const operation = queue.current.then(async () => {
      const current = businessId, epoch = accountEpoch.current;
      setBusy(true); setError("");
      try {
        const fresh = await read();
        if (scope.current !== current || epoch !== accountEpoch.current) throw Error("La cuenta o empresa cambió; no se guardó el producto.");
        await work(fresh);
        if (scope.current === current) await read();
      } catch (e) { if (scope.current === current && epoch === accountEpoch.current) setError(e instanceof Error ? e.message : String(e)); throw e; }
      finally { if (scope.current === current) setBusy(false); }
    });
    queue.current = operation.catch(() => {});
    return operation;
  }, [businessId, read]);
  const associate = (operation: "create" | "delete", input: object) => local
    ? createDemoBookingRepository(local).manageAssociations(operation, input)
    : manageAssociations(businessId!, operation, input);
  const saveProduct = (item: BookableItem) => local ? createDemoBookingRepository(local).saveCatalogProduct(item) : saveBookableItem(item);
  const createProduct = async (item: Omit<BookableItem, "id">): Promise<string> => {
    if (local) {
      const id = `${businessId}_product_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await createDemoBookingRepository(local).saveCatalogProduct({ ...item, id });
      return id;
    }
    return (await createBookableItem(item)).id;
  };
  return { ...catalog, loading, busy, error, mutate, associate, saveProduct, createProduct };
}

type CatalogController = ReturnType<typeof useServiceComplementCatalog>;

function ProductRow({ id, serviceName, initialName, initialPrice, onSave, onDelete }: {
  id: string; serviceName: string; initialName?: string; initialPrice?: number;
  onSave: (name: string, price: string) => Promise<void>; onDelete: () => Promise<void> | void;
}) {
  const { lang } = useLanguage();
  const label = (es: string, en: string) => lang === "en" ? en : es;
  const [name, setName] = useState(initialName ?? ""), [price, setPrice] = useState(initialPrice === undefined ? "" : initialPrice.toFixed(2));
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const latest = useRef({ name, price }); latest.current = { name, price };
  const saved = useRef(initialName === undefined ? "" : JSON.stringify([initialName, initialPrice?.toFixed(2)]));
  const commit = async () => {
    if (saving) return;
    const draft = latest.current;
    if (!draft.name.trim() && !draft.price.trim()) return;
    if (!draft.name.trim() || !draft.price.trim()) { setError(label("Completa nombre y precio.", "Enter a name and price.")); return; }
    const signature = JSON.stringify([draft.name.trim(), draft.price]);
    if (signature === saved.current) return;
    setSaving(true); setError("");
    try { await onSave(draft.name, draft.price); saved.current = signature; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };
  return <View testID={`associated-product-${id}`} style={{ gap: 3 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <TextInput accessibilityLabel={label("Nombre del producto asociado de ", "Associated product name for ") + serviceName}
        value={name} editable={!saving} onChangeText={setName} onBlur={() => { void commit(); }} onSubmitEditing={() => { void commit(); }}
        placeholder={label("Producto", "Product")} placeholderTextColor="#6B7280" returnKeyType="done"
        style={{ flex: 1, minWidth: 72, minHeight: 44, color: "#111827", borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 9, paddingHorizontal: 9, backgroundColor: "#FFFFFF" }} />
      <TextInput accessibilityLabel={label("Precio de ", "Price for ") + (name.trim() || serviceName)}
        value={price} editable={!saving} onChangeText={setPrice} onBlur={() => { void commit(); }} onSubmitEditing={() => { void commit(); }}
        keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor="#6B7280" returnKeyType="done"
        style={{ width: 70, minHeight: 44, color: "#111827", textAlign: "right", borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 9, paddingHorizontal: 5, backgroundColor: "#FFFFFF" }} />
      <Text style={{ color: "#111827" }}>€</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={label("Eliminar ", "Remove ") + (name.trim() || label("fila", "row"))}
        onPress={() => { void Promise.resolve(onDelete()).catch(e => setError(e instanceof Error ? e.message : String(e))); }} disabled={saving}
        style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#6B7280", fontSize: 22 }}>×</Text>
      </TouchableOpacity>
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ color: "#B91C1C", fontSize: 12 }}>{error}</Text>}
  </View>;
}

export function ServiceAssociatedProducts({ serviceName, catalog, beforeSave }: {
  serviceName: string; catalog: CatalogController; beforeSave: () => Promise<void>;
}) {
  const { lang } = useLanguage();
  const label = (es: string, en: string) => lang === "en" ? en : es;
  const [drafts, setDrafts] = useState<string[]>([]);
  useEffect(() => onSessionChanged(() => setDrafts([])), []);
  const matching = catalog.items.find(item => item.catalogKind !== "product" && sameName(item.title, serviceName));
  const source = matching;
  const edges = catalog.relations.filter(edge => edge.source_id === source?.id && edge.mode === "optional" && edge.active
    && catalog.items.some(item => item.id === edge.target_id && item.catalogKind === "product"))
    .sort((a, b) => (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER));
  const save = async (id: string | null, draftId: string | null, name: string, price: string) => {
    const title = name.trim(), value = parseEuroSupplement(price);
    if (!title) throw Error(label("Escribe el nombre del producto.", "Enter the product name."));
    await beforeSave();
    await catalog.mutate(async fresh => {
      const root = fresh.items.find(item => item.catalogKind !== "product" && sameName(item.title, serviceName));
      if (!root) throw Error(label("El servicio aún se está guardando. Inténtalo de nuevo.", "The service is still being saved. Try again."));
      const current = id ? fresh.relations.find(edge => edge.id === id && edge.source_id === root.id) : undefined;
      if (id && !current) throw Error(label("El producto cambió. Vuelve a abrir la ficha.", "The product changed. Reopen the service."));
      const duplicate = fresh.relations.some(edge => edge.id !== id && edge.source_id === root.id && edge.active
        && fresh.items.some(item => item.id === edge.target_id && sameName(item.title, title)));
      if (duplicate) throw Error(label("Ese producto ya está asociado a este servicio.", "That product is already associated with this service."));
      if (current) {
        const item = fresh.items.find(row => row.id === current.target_id && row.catalogKind === "product");
        if (!item || item.businessId !== root.businessId) throw Error(label("Producto no disponible.", "Product unavailable."));
        if (fresh.relations.some(edge => edge.id !== current.id && edge.target_id === item.id && edge.active))
          throw Error(label("Producto compartido: edítalo en el catálogo general.", "Shared product: edit it in the main catalogue."));
        await catalog.saveProduct({ ...item, title, price: value });
      } else {
        const orphan = fresh.items.find(item => item.catalogKind === "product" && item.businessId === root.businessId
          && item.catalogMetadata?.goAddonFor === root.id && sameName(item.title, title) && item.price === value
          && !fresh.relations.some(edge => edge.target_id === item.id));
        const targetId = orphan?.id ?? await catalog.createProduct({ businessId: root.businessId, title, type: "product", catalogKind: "product",
          durationMinutes: 0, price: value, currency: "EUR", customerCapacity: 1, unitQuantity: 1,
          paymentRequired: false, active: true, visible: true, catalogMetadata: { goAddonFor: root.id } });
        await catalog.associate("create", { sourceId: root.id, targetId, mode: "optional" });
      }
    });
    if (draftId) setDrafts(current => current.filter(value => value !== draftId));
  };
  const remove = async (edge: CatalogAssociation) => {
    await catalog.mutate(async fresh => {
      const current = fresh.relations.find(row => row.id === edge.id && row.source_id === source?.id);
      if (!current) throw Error(label("El producto ya cambió. Reabre la ficha.", "The product changed. Reopen the service."));
      await catalog.associate("delete", { id: current.id, revision: current.revision });
    });
  };
  return <View style={{ gap: 5, paddingTop: 7 }}>
    <Text style={{ color: "#111827", fontSize: 13, fontWeight: "600" }}>{label("Productos asociados", "Associated products")}</Text>
    {edges.map(edge => {
      const item = catalog.items.find(row => row.id === edge.target_id)!;
      return <ProductRow key={edge.id} id={edge.id} serviceName={serviceName} initialName={item.title} initialPrice={item.price}
        onSave={(name, price) => save(edge.id, null, name, price)} onDelete={() => remove(edge)} />;
    })}
    {drafts.map(id => <ProductRow key={id} id={id} serviceName={serviceName}
      onSave={(name, price) => save(null, id, name, price)} onDelete={() => setDrafts(current => current.filter(value => value !== id))} />)}
    <TouchableOpacity testID="add-associated-product" accessibilityRole="button" accessibilityLabel={label("Añadir producto asociado a ", "Add associated product to ") + serviceName}
      onPress={() => setDrafts(current => [...current, `draft_${Date.now()}_${Math.random().toString(36).slice(2)}`])}
      style={{ width: 44, height: 44, borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 9, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#2563EB", fontSize: 25, lineHeight: 30 }}>+</Text>
    </TouchableOpacity>
  </View>;
}
