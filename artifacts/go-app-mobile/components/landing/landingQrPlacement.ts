import type { HumanityRect } from "./humanityPlacement";

/** Pair the two existing targets in the lower hand-side gap. Decorative orbit shells are excluded by the caller. */
export function placeLandingHelpQr({ width, height, insets, handedness, helpSize, qrSize, qrHit, obstacles }: {
  width: number; height: number; insets: { top: number; bottom: number; left: number; right: number };
  handedness: "left" | "right"; helpSize: number; qrSize: number; qrHit: number;
  obstacles: readonly (HumanityRect & { circular?: boolean })[];
}): { help: HumanityRect; qr: { x: number; y: number } } | null {
  const qrTouch = qrSize + 2 * qrHit;
  const minY = Math.max(insets.top + 8, Math.floor(height * .55));
  const maxY = height - Math.max(insets.bottom, 8) - helpSize;
  const gap = 2;
  const clear = (rect: HumanityRect) => obstacles.every(other => other.circular
    ? Math.hypot(rect.x + rect.width / 2 - other.x - other.width / 2,
        rect.y + rect.height / 2 - other.y - other.height / 2) >= (rect.width + other.width) / 2
    : rect.x + rect.width <= other.x || rect.x >= other.x + other.width
      || rect.y + rect.height <= other.y || rect.y >= other.y + other.height);
  for (let y = maxY; y >= minY; y--) {
    const edge = handedness === "right" ? width - insets.right - 8 - helpSize : insets.left + 8;
    const limit = handedness === "right" ? Math.floor(width / 2) : Math.ceil(width / 2) - helpSize;
    for (let x = edge; handedness === "right" ? x >= limit : x <= limit; x += handedness === "right" ? -1 : 1) {
      const help = { x, y, width: helpSize, height: helpSize };
      const touch = { x: handedness === "right" ? x - qrTouch - gap : x + helpSize + gap,
        y: y + Math.floor((helpSize - qrTouch) / 2), width: qrTouch, height: qrTouch };
      if (touch.x < insets.left + 8 || touch.x + touch.width > width - insets.right - 8
        || touch.y < insets.top + 8 || touch.y + touch.height > height - insets.bottom
        || !clear(help) || !clear(touch)) continue;
      // Keep the 44pt touch area fixed; use its upper allowance to lower the smaller visible QR.
      return { help, qr: { x: touch.x + qrHit, y: touch.y + 2 * qrHit } };
    }
  }
  return null;
}

/** Place the existing QR target beside AYUDA when a safe shared gap exists. */
export function placeLandingQr({ company: _company, size, hitSlop, bounds, obstacles, handedness = "right", companion }: {
  company: HumanityRect; size: number; hitSlop: number;
  bounds: HumanityRect; obstacles: readonly HumanityRect[];
  handedness?: "left" | "right";
  companion?: HumanityRect;
}): { x: number; y: number } | null {
  const clearance = 2;
  const hand = handedness;
  const preferred = companion ? {x: hand === "right" ? companion.x - size - 2 * hitSlop - 8 : companion.x + companion.width + hitSlop + 8,
    y: companion.y + (companion.height - size) / 2} : { x: hand === "right"
      ? bounds.x + bounds.width - size - hitSlop
      : bounds.x + hitSlop,
    y: bounds.y + bounds.height - size - hitSlop };
  const valid = ({ x, y }: { x: number; y: number }) => {
    const left = x - hitSlop, top = y - hitSlop;
    const right = x + size + hitSlop, bottom = y + size + hitSlop;
    return left >= bounds.x && top >= bounds.y && right <= bounds.x + bounds.width
      && bottom <= bounds.y + bounds.height
      && !obstacles.some(o => left < o.x + o.width + clearance - 0.001 && right + clearance > o.x + 0.001
        && top < o.y + o.height + clearance - 0.001 && bottom + clearance > o.y + 0.001);
  };
  if (valid(preferred)) return preferred;
  // Candidate edges retain the nearest free position without moving any other control.
  const xs = [preferred.x, companion?.x, ...(companion ? Array.from({length:25},(_,i)=>preferred.x-48+i*4) : []), hand === "right" ? bounds.x + hitSlop : bounds.x + bounds.width - size - hitSlop, ...obstacles.flatMap(o =>
    [o.x - clearance - size - hitSlop, o.x + o.width + clearance + hitSlop])];
  const ys = [preferred.y, companion?.y, ...(companion ? Array.from({length:46},(_,i)=>companion.y-120+i*4) : []), companion ? companion.y - size - 2 * hitSlop - 8 : undefined,
    companion ? companion.y + companion.height + hitSlop + 8 : undefined, bounds.y + hitSlop, ...obstacles.flatMap(o =>
    [o.y - clearance - size - hitSlop, o.y + o.height + clearance + hitSlop])];
  let best: { x: number; y: number } | null = null, distance = Infinity;
  for (const x of xs) for (const y of ys) {
    if(x===undefined||y===undefined)continue;
    if (x < bounds.x + hitSlop || x + size + hitSlop > bounds.x + bounds.width) continue;
    if (y < bounds.y + hitSlop || y + size + hitSlop > bounds.y + bounds.height) continue;
    const score = (x - preferred.x) ** 2 + (y - preferred.y) ** 2;
    if (score < distance && valid({ x, y })) { best = { x, y }; distance = score; }
  }
  return best;
}
