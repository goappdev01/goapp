import type { BusinessConfig } from "@/contexts/GoBusinessConfigContext";
import { businessDemoStorageKey, createBusinessDemoStore, type BusinessDemoStore } from "./businessDemoStore";
type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };
export type DemoCompany = { id: string; name: string; archived: boolean; createdAt: number };
type Document = { version: 1; ownerUserId: string; selected: string; companies: DemoCompany[] };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const queues = new Map<string, Promise<unknown>>();
const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => { const n = Math.floor(Math.random() * 16); return (char === "x" ? n : (n & 3) | 8).toString(16); });
/** Directory for the existing isolated DEMO documents. Never opens a live repository. */
export function createBusinessDemoCatalog(options: { ownerUserId: string; storage: Storage; canUse: () => boolean; initialConfig: BusinessConfig }) {
  const key = businessDemoStorageKey(options.ownerUserId) + ":catalog";
  let document: Document = { version: 1, ownerUserId: options.ownerUserId, selected: "legacy", companies: [{ id: "legacy", name: "", archived: false, createdAt: 0 }] };
  // Only the original document may use its compatibility seed. New businesses
  // start independently, even if a caller passes an already configured business.
  const seedFor = (company: DemoCompany): BusinessConfig => company.id === "legacy"
    ? { ...clone(options.initialConfig), businessName: company.name }
    : { businessName: company.name, address: "", cartaUrl: "", sectorId: null, subId: null,
      plantillaItems: [], activeDays: [0, 1, 2, 3, 4], openFrom: "09:00", openTo: "20:00",
      daySchedules: {}, services: [], paymentPolicy: 0, approvalPolicy: 0, cancelPolicy: 0,
      bookingEnabled: false, completedSteps: [], paymentMethod: null, isBusinessActive: false, staffSchedules: {} };
  const stores = new Map<string, BusinessDemoStore>(), listeners = new Set<() => void>();
  const allowed = () => { if (!options.canUse()) throw new Error("El propietario DEMO no está autorizado."); };
  const emit = () => { for (const listener of listeners) listener(); };
  const enqueue = <T,>(fn: () => Promise<T>) => { const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(() => { allowed(); return fn(); }); queues.set(key, next.then(() => undefined, () => undefined)); return next; };
  const validate = (value: Document) => {
    if (value.version !== 1 || value.ownerUserId !== options.ownerUserId || !Array.isArray(value.companies) || !value.companies.length) throw new Error("Catálogo DEMO no válido. Se conserva sin sobrescribir.");
    const seen = new Set<string>();
    for (const company of value.companies) {
      if (!company || typeof company.name !== "string" || typeof company.archived !== "boolean" || !Number.isFinite(company.createdAt) || seen.has(company.id.toLowerCase())) throw new Error("Empresa DEMO no válida.");
      businessDemoStorageKey(options.ownerUserId, company.id === "legacy" ? undefined : company.id); seen.add(company.id.toLowerCase());
    }
    if (!value.companies.some(company => company.id === value.selected && !company.archived)) throw new Error("La empresa DEMO seleccionada no está disponible.");
    return clone(value);
  };
  const refresh = async () => { const raw = await options.storage.getItem(key); allowed(); if (raw) document = validate(JSON.parse(raw)); };
  const persist = async (next: Document) => { validate(next); allowed(); await options.storage.setItem(key + ":backup", JSON.stringify(document)); allowed(); await options.storage.setItem(key, JSON.stringify(next)); allowed(); document = next; emit(); };
  const getStore = (id: string) => {
    if (!document.companies.some(company => company.id === id)) throw new Error("Empresa ajena al catálogo DEMO.");
    if (!stores.has(id)) {
      const company = document.companies.find(value => value.id === id)!;
      const store = createBusinessDemoStore({ ...options, companyId: id === "legacy" ? undefined : id, keepBackup: true,
        initialConfig: seedFor(company),
        canUse: () => options.canUse() && document.companies.some(company => company.id === id && !company.archived),
      });
      store.subscribe(emit); stores.set(id, store);
    }
    return stores.get(id)!;
  };
  return {
    ownerUserId: options.ownerUserId,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getCompanies: () => document.companies.map(company => {
      const data = stores.get(company.id)?.getSnapshot(), cfg = data?.config;
      const name = cfg?.businessName || company.name;
      // Keep the empty compatibility document recoverable, outside the business count.
      // Any saved business content makes it a normal selectable business.
      const hasContent = !!name || !!cfg && (!!cfg.sectorId || !!cfg.subId || !!cfg.address || !!cfg.cartaUrl
        || !!cfg.phone || !!cfg.mobile || !!cfg.whatsapp || !!cfg.coordinates || !!cfg.countryCode
        || cfg.services.length > 0 || cfg.plantillaItems.length > 0 || cfg.completedSteps.length > 0
        || Object.keys(cfg.daySchedules ?? {}).length > 0 || Object.keys(cfg.staffSchedules ?? {}).length > 0
        || cfg.openFrom !== options.initialConfig.openFrom || cfg.openTo !== options.initialConfig.openTo
        || JSON.stringify(cfg.activeDays) !== JSON.stringify(options.initialConfig.activeDays))
        || !!data?.plan || !!data?.reservations.length || !!data?.bookings.length || !!data?.entries.length;
      return { ...company, name, placeholder: company.id === "legacy" && !hasContent };
    }),
    getSelectedId: () => document.selected,
    getSelectedStore: () => getStore(document.selected),
    getStores: () => { allowed(); return document.companies.filter(company => !company.archived).map(company => getStore(company.id)); },
    load: () => enqueue(async () => { await refresh(); await Promise.all(document.companies.filter(company => !company.archived).map(company => getStore(company.id).load())); allowed(); return clone(document); }),
    select: (id: string) => enqueue(async () => { await refresh(); const next = { ...clone(document), selected: id }; validate(next); await getStore(id).load(); await persist(next); }),
    create: (name: string) => enqueue(async () => {
      await refresh(); const trimmed = name.trim();
      if (!trimmed || trimmed.length > 100) throw new Error("Introduce un nombre de empresa de 1 a 100 caracteres.");
      let id = uuid(); while (document.companies.some(company => company.id === id)) id = uuid();
      await persist({ ...clone(document), selected: id, companies: [...document.companies, { id, name: trimmed, archived: false, createdAt: Date.now() }] });
      await getStore(id).load(); return id;
    }),
    archive: (id: string) => enqueue(async () => {
      await refresh(); if (!document.companies.some(company => company.id === id && !company.archived)) throw new Error("Empresa DEMO no disponible.");
      const remaining = document.companies.filter(company => company.id !== id && !company.archived);
      if (!remaining.length) throw new Error("Crea otra empresa antes de archivar la última.");
      const next = clone(document); next.companies.find(company => company.id === id)!.archived = true;
      if (next.selected === id) next.selected = remaining[0].id;
      await persist(next);
    }),
    recover: (id: string) => enqueue(async () => { await refresh(); const next = clone(document), company = next.companies.find(company => company.id === id); if (!company) throw new Error("Empresa DEMO no disponible."); company.archived = false; next.selected = id; await persist(next); await getStore(id).load(); }),
    importBackup: (text: string) => enqueue(async () => {
      await refresh(); if (text.length > 10000000) throw new Error("La copia supera el tamaño permitido.");
      const backup = JSON.parse(text);
      if (backup.format !== "go-demo-backup" || backup.version !== 1 || backup.ownerUserId !== options.ownerUserId || !Array.isArray(backup.companies)) throw new Error("La copia DEMO no pertenece a este propietario.");
      const incoming = validate({ version: 1, ownerUserId: options.ownerUserId, selected: backup.selected, companies: backup.companies.map((record: { company: DemoCompany }) => record.company) });
      const incomingIds = new Set(incoming.companies.map(company => company.id));
      const merged = validate({ ...incoming, companies: [...document.companies.filter(company => !incomingIds.has(company.id)), ...incoming.companies] });
      // Fully validate all company namespaces before any storage write.
      const imports: { store: BusinessDemoStore; data: import("./businessDemoStore").BusinessDemoData }[] = [];
      for (const record of backup.companies) {
        const opts = { ...options, companyId: record.company.id === "legacy" ? undefined : record.company.id, initialConfig: seedFor(record.company) };
        const validator = createBusinessDemoStore({ ...opts, storage: { getItem: async () => JSON.stringify(record.data), setItem: async () => {} } });
        imports.push({ store: createBusinessDemoStore({ ...opts, keepBackup: true }), data: await validator.load() });
      }
      for (const record of imports) { allowed(); await record.store.importSnapshot(record.data); }
      await persist(merged);
      await Promise.all(document.companies.filter(company => !company.archived).map(company => getStore(company.id).load())); emit();
    }),
    exportBackup: () => enqueue(async () => { await refresh(); const companies = [];
      for (const company of document.companies) {
        const reader = createBusinessDemoStore({ ...options, companyId: company.id === "legacy" ? undefined : company.id, initialConfig: seedFor(company) });
        companies.push({ company: clone(company), data: await reader.load() });
      }
      allowed(); return JSON.stringify({ format: "go-demo-backup", version: 1, ownerUserId: options.ownerUserId, selected: document.selected, companies }, null, 2);
    }),
  };
}
export type BusinessDemoCatalog = ReturnType<typeof createBusinessDemoCatalog>;
