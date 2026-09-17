import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "go_recent_businesses_v1";
const MAX_STORED = 20;

interface VisitRecord {
  businessId: string;
  count: number;
  lastUsed: string;
}

async function loadRecords(): Promise<VisitRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveRecords(records: VisitRecord[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(records));
}

export async function recordBusinessVisit(businessId: string): Promise<void> {
  const records = await loadRecords();
  const idx = records.findIndex((r) => r.businessId === businessId);
  if (idx >= 0) {
    records[idx].count += 1;
    records[idx].lastUsed = new Date().toISOString();
  } else {
    records.push({ businessId, count: 1, lastUsed: new Date().toISOString() });
  }
  // Mantener sólo los MAX_STORED más recientes
  records.sort((a, b) => b.lastUsed.localeCompare(a.lastUsed));
  await saveRecords(records.slice(0, MAX_STORED));
}

/** IDs ordenados por uso más reciente */
export async function getRecentBusinessIds(limit = 5): Promise<string[]> {
  const records = await loadRecords();
  return records
    .sort((a, b) => b.lastUsed.localeCompare(a.lastUsed))
    .slice(0, limit)
    .map((r) => r.businessId);
}

/** IDs ordenados por frecuencia (más visitados primero) */
export async function getFrequentBusinessIds(limit = 5): Promise<string[]> {
  const records = await loadRecords();
  return records
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((r) => r.businessId);
}

export async function clearRecentBusinesses(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
