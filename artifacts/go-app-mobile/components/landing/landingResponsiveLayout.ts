export type LandingPreset = "compacto" | "estandar" | "grande";
export type LandingInsets = { top: number; bottom: number; left: number; right: number };
export type LandingFrame = {
  virtual: boolean; scroll: boolean; left: number; top: number;
  width: number; height: number; contentHeight: number; baseline: number; naturalHeight: number;
};
const SATELLITE_EXTENT = Math.cos(Math.PI / 8);
// Same angular slots as the existing satellite renderer; visibility comes from its V1 policy.
export const LANDING_SATELLITE_DEGREES: Record<string, number> = {
  bell: -112.5, list: -67.5, map: -22.5, calendar: 22.5,
  contacts: 67.5, messages: 112.5, settings: 157.5, payment: 157.5, mas: 202.5,
};

/** Only the cart size is new; all orbital centers and radii remain frozen. */
export function landingShoppingShortcut(scale: number) {
  const visualSize = Math.max(34, Math.round(42 * scale));
  const touchSize = Math.max(44, visualSize);
  return { touchSize, visualSize };
}

type ShoppingRect = { x: number; y: number; width: number; height: number };
/** Intersect the two circles whose radii include the cart and the measured
 * clearance of LIST to its two neighbouring orbits. Choose the outer corner. */
export function landingShoppingPreferred(list: ShoppingRect, reunion: ShoppingRect,
  food: ShoppingRect, size: number, mirrored: boolean): ShoppingRect {
  const center = (rect: ShoppingRect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  const a = center(list), b = center(food), c = center(reunion);
  const listRadius = list.width / 2, foodRadius = food.width / 2, cartRadius = size / 2;
  const edgeGap = (other: ShoppingRect, point: { x: number; y: number }) =>
    Math.hypot(point.x - a.x, point.y - a.y) - listRadius - other.width / 2;
  // The frozen orbits can be almost tangent. Keep the minimum touch clearance,
  // otherwise reproduce each measured edge gap independently.
  const first = listRadius + cartRadius + Math.max(2, edgeGap(reunion, c));
  const second = foodRadius + cartRadius + Math.max(2, edgeGap(food, b));
  const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
  if (!distance) return { x: a.x + (mirrored ? -first : first) - cartRadius,
    y: a.y - cartRadius, width: size, height: size };
  const along = (first * first - second * second + distance * distance) / (2 * distance);
  const across = Math.sqrt(Math.max(0, first * first - along * along));
  const middleX = a.x + along * dx / distance, middleY = a.y + along * dy / distance;
  const candidates = [
    { x: middleX - across * dy / distance, y: middleY + across * dx / distance },
    { x: middleX + across * dy / distance, y: middleY - across * dx / distance },
  ];
  const chosen = candidates.sort((left, right) => mirrored ? left.x - right.x : right.x - left.x)[0];
  return { x: chosen.x - cartRadius, y: chosen.y - cartRadius, width: size, height: size };
}
/** Move only the new cart when a frozen orbit or floating close occupies its ideal spot. */
export function fitLandingShoppingShortcut(preferred: ShoppingRect,
  bounds: { left: number; right: number; top: number; bottom: number },
  obstacles: readonly ShoppingRect[], list: ShoppingRect, food: ShoppingRect): ShoppingRect | null {
  const gap = 2, size = preferred.width;
  const within = (r: ShoppingRect) => r.x >= bounds.left && r.x + size <= bounds.right
    && r.y >= bounds.top && r.y + size <= bounds.bottom;
  const clear = (r: ShoppingRect) => within(r) && obstacles.every(o => {
    // Orbit hit targets are circles. Their bounding squares overlap at the
    // correct tangent position and used to push the cart away from COMIDA.
    const orbitKey = "key" in o ? String(o.key) : "";
    if (orbitKey === "list" || orbitKey.startsWith("orbit-"))
      return Math.hypot(r.x + size / 2 - o.x - o.width / 2,
        r.y + size / 2 - o.y - o.height / 2) >= size / 2 + o.width / 2 + gap - 0.001;
    return r.x + size + gap <= o.x || o.x + o.width + gap <= r.x
      || r.y + size + gap <= o.y || o.y + o.height + gap <= r.y;
  });
  if (clear(preferred)) return preferred;
  const xs = [preferred.x, bounds.left, bounds.right - size,
    ...obstacles.flatMap(o => [o.x - size - gap, o.x + o.width + gap])];
  const ys = [preferred.y, bounds.top, bounds.bottom - size,
    ...obstacles.flatMap(o => [o.y - size - gap, o.y + o.height + gap])];
  let best: ShoppingRect | null = null, bestScore = Infinity;
  for (const x of xs) for (const y of ys) {
    const r = { x, y, width: size, height: size };
    if (!clear(r)) continue;
    const centerDistance = (other: ShoppingRect) => Math.hypot(x + size / 2 - other.x - other.width / 2,
      y + size / 2 - other.y - other.height / 2);
    const score = Math.hypot(x - preferred.x, y - preferred.y)
      + Math.abs(centerDistance(list) - centerDistance(food)) * 0.35;
    if (score < bestScore) { best = r; bestScore = score; }
  }
  return best;
}
export function landingPresetScale(preset: LandingPreset) {
  return preset === "compacto" ? 0.83 : preset === "grande" ? 1.12 : 1;
}
/** Constrain a requested size only when the actual orbital buttons would be clipped. */
export function fitLandingScale(preset: LandingPreset, width: number, height: number, insets: LandingInsets) {
  const requested = landingPresetScale(preset);
  const room = Math.min(width - insets.left - insets.right - 10, height - insets.top - insets.bottom - 20);
  const fits = (scale: number) => {
    const radius = Math.round(99 * scale) + Math.round(35 * scale);
    return 2 * (radius * SATELLITE_EXTENT + Math.round(50 * scale) / 2) <= room;
  };
  if (fits(requested)) return requested;
  // Existing compact size is the readability floor; the Landing stays static.
  let scale = requested;
  while (scale > 0.83 && !fits(scale)) scale = Math.max(0.83, Math.round((scale - 0.005) * 1000) / 1000);
  return scale;
}
/** Use the outer satellites, rather than the inner circle, to enforce safe dock limits. */
export function landingDockBounds({ width, insets, dockRight, boundingRadius, wrapSize, satelliteRadius, satelliteSize,
  visibleSatelliteKeys, orbitRadius = 0, orbitButtonSize = 0, orbitCount = 7, orbitVisible = true, goSize = 0 }: {
  width: number; insets: LandingInsets; dockRight: number; boundingRadius: number;
  wrapSize: number; satelliteRadius: number; satelliteSize: number;
  visibleSatelliteKeys?: readonly string[]; orbitRadius?: number; orbitButtonSize?: number;
  orbitCount?: number; orbitVisible?: boolean; goSize?: number;
}) {
  const extent = satelliteRadius * SATELLITE_EXTENT + satelliteSize / 2;
  const anchorX = width - dockRight - boundingRadius;
  const rightLimit = Math.floor(width - insets.right - 4 - extent - anchorX);
  const leftLimit = Math.ceil(insets.left + 4 + extent - anchorX);
  const maxX = Math.min(rightLimit, Math.max(Math.min(5, rightLimit), leftLimit));
  const legacyMinX = Math.min(0, Math.round(10 + 2 * boundingRadius - width));
  const minX = Math.max(legacyMinX, Math.ceil(insets.left + 4 + extent - anchorX));
  const satelliteBottom = visibleSatelliteKeys === undefined ? extent : Math.max(0,
    ...visibleSatelliteKeys.map(key => {
      const degrees = LANDING_SATELLITE_DEGREES[key];
      return degrees === undefined ? 0 : Math.sin(degrees * Math.PI / 180) * satelliteRadius + satelliteSize / 2;
    }));
  const orbitBottom = orbitVisible && orbitRadius > 0 ? Math.max(0,
    ...Array.from({ length: orbitCount }, (_, i) => Math.sin(-Math.PI / 2 + i * 2 * Math.PI / orbitCount) * orbitRadius + orbitButtonSize / 2)) : 0;
  const visibleBottom = Math.max(goSize / 2, satelliteBottom, orbitBottom);
  // Positive translation is safe when lower satellite slots are hidden; the
  // lowest visible control stays six points above the real bottom safe area.
  return { minX: Math.min(minX, maxX), maxX, maxY: Math.floor(wrapSize / 2 - visibleBottom) };
}
export function landingContentWidth(width: number, height: number, insets: LandingInsets, boundingRadius: number) {
  const column = width - insets.left - insets.right - boundingRadius * 2 - 18;
  return width > height && column >= 180 ? column : width;
}
/** Keep the original grid when it fits; reserve legible transport beside it. */
export function landingActionGrid({ width, leftInset, rightInset, scale, large, columns, transport, transportWidth = 70 }: {
  width: number; leftInset: number; rightInset: number; scale: number;
  large: boolean; columns: number; transport: boolean; transportWidth?: number;
}) {
  const edge = Math.max(18, Math.max(leftInset, rightInset) + 18);
  const height = Math.round(Math.min(80, Math.max(56, 64 * scale)));
  const gap = Math.round(6 * scale);
  const preferred = Math.round(height * (large ? 1.18 : 1.28));
  const available = Math.min(width - leftInset - rightInset - 2 * edge,
    transport ? width - edge - Math.max(4, leftInset + 4) - transportWidth - 8 : Infinity);
  const buttonWidth = Math.min(preferred, Math.floor((available - (columns - 1) * gap) / columns));
  return { height, buttonWidth: Math.max(44, buttonWidth), gap,
    width: columns * Math.max(44, buttonWidth) + (columns - 1) * gap, compressed: buttonWidth < preferred };
}
/** Static content frame. Long bodies stay within their existing card, never move the Landing. */
export function landingContentFrame({ width, height, insets, safeTop, baseline, naturalHeight, boundingRadius, handedness, controlSize }: {
  width: number; height: number; insets: LandingInsets; safeTop: number; baseline: number;
  naturalHeight: number; boundingRadius: number; handedness: "left" | "right"; controlSize: number;
}): LandingFrame {
  const contentWidth = landingContentWidth(width, height, insets, boundingRadius);
  const sideColumn = contentWidth !== width;
  const actualBottom = sideColumn ? insets.bottom + 8 : baseline;
  const top = Math.max(insets.top + 12, safeTop) + controlSize + 8;
  const available = Math.max(1, height - actualBottom - top);
  const virtual = sideColumn;
  const left = sideColumn ? handedness === "right" ? insets.left : width - insets.right - contentWidth : 0;
  return { virtual, scroll: false, left, top, width: contentWidth,
    height: available, contentHeight: available, baseline, naturalHeight };
}
export function landingContentBottom(bottom: number, frame: LandingFrame) {
  return frame.virtual ? bottom - frame.baseline : bottom;
}
export function clampLandingControlBottom(bottom: number, height: number, controlSize: number, safeTop: number, bottomInset: number) {
  return Math.max(bottomInset + 8, Math.min(bottom, height - safeTop - controlSize));
}

/** Largest whole-point descent preserving the safe floor and fixed controls below each layer. */
export function landingSafeVerticalShift({ safeBottom, moving, fixed }: {
  safeBottom: number;
  moving: readonly { x: number; y: number; width: number; height: number }[];
  fixed: readonly { x: number; y: number; width: number; height: number }[];
}) {
  if (!moving.length) return 0;
  let available = Math.min(...moving.map(rect => safeBottom - rect.y - rect.height));
  for (const rect of moving) for (const control of fixed) {
    const bottom = rect.y + rect.height;
    if (rect.x < control.x + control.width && rect.x + rect.width > control.x && bottom <= control.y)
      available = Math.min(available, control.y - bottom);
  }
  return Math.max(0, Math.floor(available));
}
