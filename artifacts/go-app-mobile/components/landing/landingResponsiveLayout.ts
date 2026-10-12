export type LandingPreset = "compacto" | "estandar" | "grande";
export type LandingInsets = { top: number; bottom: number; left: number; right: number };
export type LandingFrame = {
  virtual: boolean; scroll: boolean; left: number; top: number;
  width: number; height: number; contentHeight: number; baseline: number; naturalHeight: number;
};
const SATELLITE_EXTENT = Math.cos(Math.PI / 8);
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
  // Existing compact size is the readability floor; content scrolls separately.
  let scale = requested;
  while (scale > 0.83 && !fits(scale)) scale = Math.max(0.83, Math.round((scale - 0.005) * 1000) / 1000);
  return scale;
}
/** Use the outer satellites, rather than the inner circle, to enforce safe dock limits. */
export function landingDockBounds({ width, insets, dockRight, boundingRadius, wrapSize, satelliteRadius, satelliteSize }: {
  width: number; insets: LandingInsets; dockRight: number; boundingRadius: number;
  wrapSize: number; satelliteRadius: number; satelliteSize: number;
}) {
  const extent = satelliteRadius * SATELLITE_EXTENT + satelliteSize / 2;
  const anchorX = width - dockRight - boundingRadius;
  const rightLimit = Math.floor(width - insets.right - 4 - extent - anchorX);
  const leftLimit = Math.ceil(insets.left + 4 + extent - anchorX);
  const maxX = Math.min(rightLimit, Math.max(Math.min(5, rightLimit), leftLimit));
  const legacyMinX = Math.min(0, Math.round(10 + 2 * boundingRadius - width));
  const minX = Math.max(legacyMinX, Math.ceil(insets.left + 4 + extent - anchorX));
  return { minX: Math.min(minX, maxX), maxX, maxY: Math.min(0, Math.floor(wrapSize / 2 - extent)) };
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
/** Introduce a bounded viewport only when natural content no longer fits. */
export function landingContentFrame({ width, height, insets, safeTop, baseline, naturalHeight, boundingRadius, handedness, controlSize }: {
  width: number; height: number; insets: LandingInsets; safeTop: number; baseline: number;
  naturalHeight: number; boundingRadius: number; handedness: "left" | "right"; controlSize: number;
}): LandingFrame {
  const contentWidth = landingContentWidth(width, height, insets, boundingRadius);
  const sideColumn = contentWidth !== width;
  const actualBottom = sideColumn ? insets.bottom + 8 : baseline;
  const top = Math.max(insets.top + 12, safeTop) + controlSize + 8;
  const available = Math.max(1, height - actualBottom - top);
  const virtual = sideColumn || naturalHeight > available;
  const left = sideColumn ? handedness === "right" ? insets.left : width - insets.right - contentWidth : 0;
  return { virtual, scroll: naturalHeight > available, left, top, width: contentWidth,
    height: available, contentHeight: Math.max(available, naturalHeight), baseline, naturalHeight };
}
export function landingContentBottom(bottom: number, frame: LandingFrame) {
  return frame.virtual ? bottom - frame.baseline : bottom;
}
export function clampLandingControlBottom(bottom: number, height: number, controlSize: number, safeTop: number, bottomInset: number) {
  return Math.max(bottomInset + 8, Math.min(bottom, height - safeTop - controlSize));
}
