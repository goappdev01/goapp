import type { HumanityRect } from "./humanityPlacement";

/** Place only the existing QR target in the free pocket immediately above EMPRESA. */
export function placeLandingQr({ company, size, hitSlop, bounds, obstacles }: {
  company: HumanityRect; size: number; hitSlop: number;
  bounds: HumanityRect; obstacles: readonly HumanityRect[];
}): { x: number; y: number } | null {
  const gap = 8;
  const clearance = 2; // Full touch rectangles stay independent, including the compact preset.
  const preferred = { x: company.x + (company.width - size) / 2,
    y: company.y - gap - hitSlop - size };
  const valid = ({ x, y }: { x: number; y: number }) => {
    const left = x - hitSlop, top = y - hitSlop;
    const right = x + size + hitSlop, bottom = y + size + hitSlop;
    return left >= bounds.x && right <= bounds.x + bounds.width
      && top >= bounds.y && bottom <= company.y - gap
      && bottom <= bounds.y + bounds.height
      && !obstacles.some(o => left < o.x + o.width + clearance - 0.001 && right + clearance > o.x + 0.001
        && top < o.y + o.height + clearance - 0.001 && bottom + clearance > o.y + 0.001);
  };
  if (valid(preferred)) return preferred;
  // Candidate edges retain the nearest free position without moving any other control.
  const xs = [preferred.x, bounds.x + hitSlop, ...obstacles.flatMap(o =>
    [o.x - clearance - size - hitSlop, o.x + o.width + clearance + hitSlop])];
  const ys = [preferred.y, bounds.y + hitSlop, ...obstacles.flatMap(o =>
    [o.y - clearance - size - hitSlop, o.y + o.height + clearance + hitSlop])];
  let best: { x: number; y: number } | null = null, distance = Infinity;
  for (const x of xs) for (const y of ys) {
    // Stay on the left of the company/orbit group and below the command row when it overlaps.
    if (x > preferred.x + company.width / 2 || y > preferred.y) continue;
    const score = (x - preferred.x) ** 2 + (y - preferred.y) ** 2;
    if (score < distance && valid({ x, y })) { best = { x, y }; distance = score; }
  }
  return best;
}
