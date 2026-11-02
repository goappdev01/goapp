/** Fit the account label inside its existing circle; never change orbit geometry. */
export function orbitAccountLabelSize(label: string, diameter: number, padding: number, scale: number): number {
  const available = Math.max(1, diameter - 2 * padding - 4);
  return Math.min(Math.max(1, Math.round(12 * scale)), available / Math.max(1, Array.from(label).length * 0.72));
}
