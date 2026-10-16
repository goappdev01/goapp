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
export function redistributeLandingLowerArc(input: Input) {
  const { center, bounds } = input;
  const nodes: Node[] = [{ key: 'GO', ...center, radius: input.goSize / 2 }];
  const add = (key: string, degrees: number, radius: number, size: number) => {
    const angle = degrees * Math.PI / 180;
    nodes.push({ key, x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius,
      radius: Math.max(44, size) / 2 });
  };
  if (input.orbitVisible) for (let i = 0; i < input.orbitCount; i++)
    add(`orbit-${i}`, -90 + i * 360 / input.orbitCount, input.orbitRadius, input.orbitSize);
  for (const satellite of input.satellites) add(satellite.key, satellite.degrees, input.satelliteRadius, input.satelliteSize);
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
