import type { HumanityRect } from "./humanityPlacement";

/** Place the existing QR target in the dominant-hand lower corner. */
export function placeLandingQr({ company: _company, size, hitSlop, bounds, obstacles, handedness = "right" }: {
  company: HumanityRect; size: number; hitSlop: number;
  bounds: HumanityRect; obstacles: readonly HumanityRect[];
  handedness?: "left" | "right";
}): { x: number; y: number } | null {
  const clearance = 2;
  const hand = handedness;
  const preferred = { x: hand === "right"
      ? bounds.x + bounds.width - size - hitSlop
      : bounds.x + hitSlop,
    y: bounds.y + bounds.height - size - hitSlop };
  const valid = ({ x, y }: { x: number; y: number }) => {
    const left = x - hitSlop, top = y - hitSlop;
    const right = x + size + hitSlop, bottom = y + size + hitSlop;
    return left >= bounds.x && right <= bounds.x + bounds.width
      && bottom <= bounds.y + bounds.height
      && !obstacles.some(o => left < o.x + o.width + clearance - 0.001 && right + clearance > o.x + 0.001
        && top < o.y + o.height + clearance - 0.001 && bottom + clearance > o.y + 0.001);
  };
  if (valid(preferred)) return preferred;
  // Candidate edges retain the nearest free position without moving any other control.
  const xs = [preferred.x, hand === "right" ? bounds.x + hitSlop : bounds.x + bounds.width - size - hitSlop, ...obstacles.flatMap(o =>
    [o.x - clearance - size - hitSlop, o.x + o.width + clearance + hitSlop])];
  const ys = [preferred.y, bounds.y + hitSlop, ...obstacles.flatMap(o =>
    [o.y - clearance - size - hitSlop, o.y + o.height + clearance + hitSlop])];
  let best: { x: number; y: number } | null = null, distance = Infinity;
  for (const x of xs) for (const y of ys) {
    if (x < bounds.x + hitSlop || x + size + hitSlop > bounds.x + bounds.width) continue;
    if (y < bounds.y + hitSlop || y + size + hitSlop > bounds.y + bounds.height) continue;
    const score = (x - preferred.x) ** 2 + (y - preferred.y) ** 2;
    if (score < distance && valid({ x, y })) { best = { x, y }; distance = score; }
  }
  return best;
}
