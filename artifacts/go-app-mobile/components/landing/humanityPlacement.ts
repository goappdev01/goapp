export type HumanityRect = { x: number; y: number; width: number; height: number };
export function overlapsHumanity(a: HumanityRect, b: HumanityRect, gap = 8) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}
/** Upper-left orbital placement, including the label and full touch rectangle. */
export function placeHumanity({ cx, cy, radius, buttonSize, satelliteRadius, satelliteSize, count, bounds, obstacles, scale }: {
  cx: number; cy: number; radius: number; buttonSize: number;
  satelliteRadius: number; satelliteSize: number; count: number;
  bounds: HumanityRect; obstacles: HumanityRect[]; scale: number;
}) {
  const occupied = [...obstacles];
  const add = (angle: number, r: number, size: number) => occupied.push({ x: cx + Math.cos(angle) * r - size / 2, y: cy + Math.sin(angle) * r - size / 2, width: size, height: size });
  // Include animation clearance; reserve all satellite slots, even hidden ones.
  for (let i = 0; i < count; i++) add(-Math.PI / 2 + i * 2 * Math.PI / count, radius, buttonSize + 8);
  for (let i = 0; i < 8; i++) add((-112.5 + i * 45) * Math.PI / 180, satelliteRadius, satelliteSize + 8);
  // Prefer the enlarged globe nearby; a tighter slot can use the intermediate
  // size (still larger than the original 52), before searching further upward.
  for (const [baseSize, extendUpward] of [[56, false], [54, false], [54, true]] as const) {
    const globe = Math.round(baseSize * scale);
    // Enlarge the image inside the previous footprint, retaining room for the
    // one-line label; do not unnecessarily discard an already safe orbital slot.
    const width = Math.max(62, Math.round(52 * scale) + 10);
    const height = Math.max(Math.round(52 * scale) + 20, globe + 16);
    const candidates: { rect: HumanityRect; score: number }[] = [];
    for (let dx = 80 * scale; dx <= satelliteRadius + 105; dx += 4) {
      const maxDy = extendUpward ? Math.max(satelliteRadius + 100, cy - bounds.y - height / 2) : satelliteRadius + 100;
      for (let dy = 65 * scale; dy <= maxDy; dy += 4) {
        const rect = { x: Math.round(cx - dx - width / 2), y: Math.round(cy - dy - height / 2), width, height };
        if (rect.x < bounds.x || rect.y < bounds.y || rect.x + width > bounds.x + bounds.width || rect.y + height > bounds.y + bounds.height) continue;
        if (occupied.some(o => overlapsHumanity(rect, o))) continue;
        candidates.push({ rect, score: Math.hypot(dx - satelliteRadius * 1.12, dy - (satelliteRadius * 0.90 + 16 * scale)) });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    if (candidates.length) return { ...candidates[0].rect, globe };
  }
  return null;
}
