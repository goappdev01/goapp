import AsyncStorage from "@react-native-async-storage/async-storage";
import { financialDocumentSchema, type FinancialDocument } from "@workspace/api-zod";
import { createFinancialDemoDocument } from "./financialDemo";
import { calculatorCatalog } from "./financialRevenueCalculator";

export type FinancialDemoState = {
  doc: FinancialDocument;
  countryCode: string;
  activityId: string;
};

type StoredDemo = { version: 1; state: FinancialDemoState };
const pending = new Map<string, Promise<void>>();
const latest = new Map<string, { state: FinancialDemoState; unsaved: boolean }>();
const key = (userId: string) => "go_finance_demo_v1:" + encodeURIComponent(userId);

function validate(state: FinancialDemoState): FinancialDemoState {
  const parsed = financialDocumentSchema.safeParse(state?.doc);
  if (!parsed.success) throw new Error("La simulación local contiene datos no válidos. No se ha sobrescrito.");
  const catalog = calculatorCatalog(parsed.data);
  return {
    doc: parsed.data,
    countryCode: catalog.countries.some(item => item.code === state.countryCode)
      ? state.countryCode : catalog.countries[0]?.code ?? "ES",
    activityId: catalog.activities.some(item => item.id === state.activityId && item.enabled)
      ? state.activityId : catalog.activities.find(item => item.enabled)?.id ?? "go_peluquerias",
  };
}

export async function loadFinancialDemo(userId: string): Promise<{ state: FinancialDemoState; unsaved: boolean }> {
  if (!userId) throw new Error("Debes iniciar sesión para abrir la simulación local.");
  await pending.get(userId)?.catch(() => {});
  const current = latest.get(userId);
  if (current) return current;
  const raw = await AsyncStorage.getItem(key(userId));
  if (!raw) {
    const state = validate({ doc: createFinancialDemoDocument(), countryCode: "ES", activityId: "go_peluquerias" });
    latest.set(userId, { state, unsaved: true });
    return { state, unsaved: true };
  }
  let stored: StoredDemo;
  try { stored = JSON.parse(raw) as StoredDemo; }
  catch { throw new Error("No se pudo leer la simulación guardada. No se ha sobrescrito."); }
  if (stored?.version !== 1) throw new Error("La versión de la simulación guardada no es compatible. No se ha sobrescrito.");
  const state = validate(stored.state);
  latest.set(userId, { state, unsaved: false });
  return { state, unsaved: false };
}

export function saveFinancialDemo(userId: string, input: FinancialDemoState): Promise<void> {
  if (!userId) return Promise.reject(new Error("La sesión ha cambiado. No se guardaron los cambios."));
  const state = validate(input);
  latest.set(userId, { state, unsaved: true });
  const operation = (pending.get(userId) ?? Promise.resolve()).catch(() => {}).then(async () => {
    await AsyncStorage.setItem(key(userId), JSON.stringify({ version: 1, state } satisfies StoredDemo));
    if (latest.get(userId)?.state === state) latest.set(userId, { state, unsaved: false });
  });
  pending.set(userId, operation);
  void operation.finally(() => { if (pending.get(userId) === operation) pending.delete(userId); }).catch(() => {});
  return operation;
}
