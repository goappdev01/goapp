import { isLandingVisualVariant, type LandingVisualVariant } from "./landingVariant";

type Saved = { version: 1; confirmed: true; active: LandingVisualVariant;
  previous: LandingVisualVariant; lastGood: LandingVisualVariant };
export type LandingVisualState = { ready: boolean; active: LandingVisualVariant;
  previous: LandingVisualVariant; lastGood: LandingVisualVariant; preview: LandingVisualVariant | null;
  busy: boolean; error: string | null };
export interface VisualStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
export const initialLandingVisualState = (): LandingVisualState => ({
  ready: false, active: "actual", previous: "actual", lastGood: "actual", preview: null, busy: false, error: null,
});
export function landingVisualStorageKey(userId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return null;
  return "go_user_landing_visual_v2:" + userId.toLowerCase();
}
export function readLandingVisualPreference(raw: string | null): Saved | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || value.confirmed !== true) return null;
    const previous = isLandingVisualVariant(value.previous) ? value.previous : "actual";
    const lastGood = isLandingVisualVariant(value.lastGood) ? value.lastGood : "actual";
    return { version: 1, confirmed: true, active: isLandingVisualVariant(value.active) ? value.active : lastGood,
      previous, lastGood };
  } catch { return null; }
}
/** Local appearance preferences. No access to auth, booking or business storage. */
export function createLandingVisualPreference(storage: VisualStorage, key: string, changed: (state: LandingVisualState) => void) {
  let state = initialLandingVisualState();
  let alive = true;
  let loaded = false;
  let revision = 0;
  let writes: Promise<void> = Promise.resolve();
  const persist = (value: Saved) => {
    writes = writes.catch(() => {}).then(() => storage.setItem(key, JSON.stringify(value)));
    return writes;
  };
  const emit = (patch: Partial<LandingVisualState>) => { state = { ...state, ...patch }; if (alive) changed({ ...state }); };
  const saved = (active: LandingVisualVariant, previous: LandingVisualVariant, lastGood: LandingVisualVariant): Saved =>
    ({ version: 1, confirmed: true, active, previous, lastGood });
  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      const result = readLandingVisualPreference(await storage.getItem(key));
      if (!alive) return;
      emit({ ...(result ? { active: result.active, previous: result.previous, lastGood: result.lastGood } : {}), ready: true });
    } catch {
      if (alive) emit({ ready: true, error: "No se pudo leer la preferencia visual. Se conserva el Landing actual." });
    }
  }
  const preview = (variant: LandingVisualVariant) => {
    if (!alive || !state.ready || state.busy || !isLandingVisualVariant(variant)) return false;
    emit({ preview: variant, error: null }); return true;
  };
  const cancel = () => { if (alive && !state.busy) emit({ preview: null, error: null }); };
  async function confirm() {
    if (!alive || !state.ready || state.busy || state.preview === null) return false;
    const candidate = state.preview, previous = state.active;
    if (candidate === previous) { cancel(); return true; }
    const operation = ++revision;
    emit({ busy: true, error: null });
    try {
      await persist(saved(candidate, previous, previous));
      if (!alive || operation !== revision) return false;
      emit({ active: candidate, previous, lastGood: previous, preview: null, busy: false }); return true;
    } catch {
      if (alive && operation === revision) emit({ busy: false, error: "No se pudo guardar la variante. La presentación activa no ha cambiado." });
      return false;
    }
  }
  async function recover() {
    if (!alive) return;
    const operation = ++revision;
    const previewFailed = state.preview !== null;
    if (previewFailed && !state.busy) {
      emit({ preview: null, error: "La vista previa falló. Se recuperó la presentación activa." }); return;
    }
    const failed = state.active;
    const fallback = previewFailed ? state.active : state.lastGood !== failed ? state.lastGood : "actual";
    const previous = previewFailed ? state.previous : failed;
    const lastGood = previewFailed ? state.lastGood : fallback;
    emit({ active: fallback, previous, lastGood, preview: null, busy: true,
      error: "La variante falló. Se recuperó una presentación funcional." });
    try { await persist(saved(fallback, previous, lastGood)); }
    catch { if (alive && operation === revision) emit({ error: "Se recuperó el Landing, pero no se pudo guardar la recuperación." }); }
    finally { if (alive && operation === revision) emit({ busy: false }); }
  }
  return { load, preview, cancel, confirm, recover,
    snapshot: () => ({ ...state }), dispose: () => { alive = false; } };
}
