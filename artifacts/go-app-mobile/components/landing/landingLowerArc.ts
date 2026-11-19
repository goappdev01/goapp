type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type Node = Point & { key: string; radius: number };
type Bounds = { left: number; right: number; top: number; bottom: number };
type Input = {
  center: Point; bounds: Bounds; goSize: number;
  orbitRadius: number; orbitSize: number; orbitCount: number; orbitVisible: boolean;
  satelliteRadius: number; satelliteSize: number;
  satellites: readonly { key: string; degrees: number }[];
  /** Geometry-only reference; omitted satellite slots never create controls or hitboxes. */
  anchorSatelliteDegrees?: readonly number[];
};

/** Anchor the complete concentric system at the supplied viewport floor.
 * All angles, radii and sizes are immutable: only ONE shared vertical translation is allowed.
 * The close button is placed separately by its existing full-touch-area resolver.
 */
export function landingOrbitNodes(input: Omit<Input, "bounds">) {
  const { center } = input;
  const nodes: Node[] = [{ key: 'GO', ...center, radius: input.goSize / 2 }];
  const add = (key: string, degrees: number, radius: number, size: number) => {
    const angle = degrees * Math.PI / 180;
    nodes.push({ key, x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius,
      radius: Math.max(44, size) / 2 });
  };
  if (input.orbitVisible) for (let i = 0; i < input.orbitCount; i++)
    add(`orbit-${i}`, -90 + i * 360 / input.orbitCount, input.orbitRadius, input.orbitSize);
  for (const satellite of input.satellites) add(satellite.key, satellite.degrees, input.satelliteRadius, input.satelliteSize);
  return nodes;
}

export function redistributeLandingLowerArc(input: Input) {
  const { center, bounds } = input;
  const nodes = landingOrbitNodes(input);
  // The caller supplies the Landing edge gap; independent navigation keeps its own safe bounds.
  // The approved ADMIN ring is a shared geometric anchor, independent of profile visibility.
  // Reference angles affect only the center; obstacles still contain actual controls only.
  const anchorBottom = Math.max(...nodes.map(node => node.y + node.radius),
    ...(input.anchorSatelliteDegrees ?? []).map(degrees => center.y
      + Math.sin(degrees * Math.PI / 180) * input.satelliteRadius + Math.max(44, input.satelliteSize) / 2));
  const offsetY = Math.max(0, bounds.bottom - anchorBottom);
  const translated = nodes.map(node => ({ ...node, y: node.y + offsetY }));
  const fitted = translated.every(node => node.x - node.radius >= bounds.left - 0.001
    && node.x + node.radius <= bounds.right + 0.001 && node.y - node.radius >= bounds.top - 0.001
    && node.y + node.radius <= bounds.bottom + 0.001);
  const offsets: Record<string, Point> = Object.fromEntries(nodes.map(node => [node.key, { x: 0, y: 0 }]));
  const obstacles: Rect[] = (fitted ? translated : nodes).map(node => ({
    x: node.x - node.radius, y: node.y - node.radius, width: node.radius * 2, height: node.radius * 2 }));
  return { offsetY: fitted ? offsetY : 0, offsets, fitted, obstacles };
}


/** Window safe edges expressed in the measured Landing surface coordinates.
 * A navigator may already exclude an inset: never subtract it a second time.
 * The safe bottom itself is the floor; there is no preset-dependent lift. */
export function landingOrbitSafeBounds({ surface, viewport, insets }: {
  surface: Rect; viewport: { width: number; height: number };
  insets: { left: number; right: number; top: number; bottom: number };
}): Bounds {
  return {
    left: Math.max(0, insets.left - surface.x),
    right: Math.min(surface.width, viewport.width - insets.right - surface.x),
    top: Math.max(0, insets.top - surface.y) + 4,
    bottom: Math.min(surface.height, viewport.height - insets.bottom - surface.y),
  };
}

/** Pack AYUDA into the corner between VIAJE and RESERVAS. The same relative
 * geometry is mirrored as a unit; labels/icons are never visually flipped. */
export function compactLandingOrbit(input: Omit<Input, "center" | "bounds"> & {
  helpSize: number; alignment: "left" | "center" | "right"; bounds: Bounds; obstacles?: readonly Rect[]; preferredCenterX?: number;
}) {
  const gap = 2;
  const canonical = landingOrbitNodes({ ...input, center: { x: 0, y: 0 } });
  const travel = canonical.find(n => n.key === "orbit-3")!;
  const reservations = canonical.find(n => n.key === "calendar")!;
  const help = { x: travel.x + travel.radius + gap,
    y: reservations.y + reservations.radius + gap, width: Math.max(44, input.helpSize), height: Math.max(44, input.helpSize) };
  const mirrored = input.alignment === "left";
  if (mirrored) help.x = -help.x - help.width;
  const nodes = mirrored ? canonical.map(n => ({ ...n, x: -n.x })) : canonical;
  const relative = nodes.map(n => ({ key: n.key, x: n.x - n.radius, y: n.y - n.radius,
    width: n.radius * 2, height: n.radius * 2 }));
  const all = [...relative, help];
  const left = Math.min(...all.map(r => r.x)), right = Math.max(...all.map(r => r.x + r.width));
  const top = Math.min(...all.map(r => r.y)), bottom = Math.max(...all.map(r => r.y + r.height));
  // Keep the existing side breathing room when it fits. On narrow surfaces
  // consume only that decorative margin before changing any circle's size.
  const sideGap = Math.max(0, Math.min(4, (input.bounds.right-input.bounds.left-(right-left))/2));
  const bounds = { ...input.bounds, left: input.bounds.left+sideGap, right: input.bounds.right-sideGap };
  const center = { x: input.alignment === "left" ? bounds.left - left
    : input.alignment === "right" ? bounds.right - right
    : (input.preferredCenterX ?? (bounds.left + bounds.right) / 2) - (left + right) / 2,
    y: bounds.bottom - bottom };
  const preferred = { ...center }, fixed = input.obstacles ?? [];
  const minCx = bounds.left - left, maxCx = bounds.right - right;
  const minCy = bounds.top - top, maxCy = bounds.bottom - bottom;
  const clear = (cx: number, cy: number) => all.every(r => fixed.every(o =>
    cx + r.x + r.width + gap <= o.x + .001 || cx + r.x >= o.x + o.width + gap - .001
    || cy + r.y + r.height + gap <= o.y + .001 || cy + r.y >= o.y + o.height + gap - .001));
  const xs = [...new Set([center.x, minCx, maxCx, ...fixed.flatMap(o => all.flatMap(r =>
    [o.x - gap - r.x - r.width, o.x + o.width + gap - r.x]))])].filter(x => x >= minCx && x <= maxCx)
    .sort((a,b) => Math.abs(a-preferred.x)-Math.abs(b-preferred.x));
  const ys = [...new Set([center.y, ...fixed.flatMap(o => all.map(r => o.y-gap-r.y-r.height))])]
    .filter(y => y >= minCy && y <= maxCy).sort((a,b) => b-a);
  let found = false;
  // Keep the bottom anchor first; only real fixed controls can require a minimal correction.
  for (const cy of ys) { for (const cx of xs) if (clear(cx,cy)) {
    center.x=cx; center.y=cy; found=true; break;
  } if (found) break; }
  const move = <T extends Rect>(r: T): T => ({ ...r, x: r.x + center.x, y: r.y + center.y });
  return { center, help: move(help), helpVisualSize: input.helpSize, obstacles: relative.map(move), mirrored, gap, fixedObstacles: fixed, bounds,
    fitted: found && right - left <= bounds.right - bounds.left + .001
      && bottom - top <= bounds.bottom - bounds.top + .001,
    frame: { x: center.x + left, y: center.y + top, width: right - left, height: bottom - top } };
}
