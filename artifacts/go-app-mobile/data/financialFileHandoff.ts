import { onSessionChanged } from "@/lib/sessionEvents";

export type FinancialFileAsset = { name: string; uri: string; size?: number; file?: { text(): Promise<string> } };
type PendingFile = { userId: string; planId: string; asset: FinancialFileAsset };
let pending: PendingFile | null = null;
let generation = 0;
const listeners = new Set<() => void>();
const publish = () => { for (const listener of listeners) listener(); };

// Only the native picker descriptor crosses a temporary administrator revalidation.
// No financial inputs are cached. A changed session also rejects late picker results.
onSessionChanged(() => { ++generation; pending = null; publish(); });
export const financialFileGeneration = () => generation;
export function queueFinancialFile(userId: string, planId: string, asset: FinancialFileAsset, token: number): boolean {
  if (token !== generation) return false;
  pending = { userId, planId, asset }; publish(); return true;
}
export function pendingFinancialFile(userId: string): Readonly<PendingFile> | null {
  return pending?.userId === userId ? pending : null;
}
export function takeFinancialFile(userId: string, planId: string): FinancialFileAsset | null {
  if (pending?.userId !== userId || pending.planId !== planId) return null;
  const asset = pending.asset; pending = null; return asset;
}
export function discardFinancialFile(userId: string): void {
  if (pending?.userId === userId) { pending = null; publish(); }
}
export function onFinancialFile(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
