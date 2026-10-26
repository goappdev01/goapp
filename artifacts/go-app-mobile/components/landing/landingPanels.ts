import type { LandingFrame } from "./landingResponsiveLayout";
import type { HumanityRect } from "./humanityPlacement";

/** Classify by stable record type, never by translated labels or names. */
export function splitLandingAppointments<T extends { g: { type?: string } }>(items: readonly T[]) {
  const task = (item: T) => item.g.type === "TAREA" || item.g.type === "TAREA_INTERNA";
  return { visit: items.filter(item => !task(item)), task: items.filter(task) };
}

/** One fixed card region shared by all panels; opening never moves other controls. */
export function landingPanelFrames({ frame, screenHeight, insets }: {
  frame: LandingFrame; screenHeight: number; insets: { left: number; right: number };
}) {
  const left = Math.max(18, insets.left + 18), right = Math.max(18, insets.right + 18);
  const width = Math.max(1, frame.width - left - right);
  const commandHeight = 46;
  const bottom = frame.virtual ? frame.height - commandHeight - 8 : screenHeight - frame.baseline;
  const available = Math.max(0, frame.virtual ? bottom : frame.height);
  const region: HumanityRect = { x: left, y: bottom - available, width, height: available };
  return { commands: { x: left, y: bottom + 8, width, height: commandHeight }, region, next: region, changes: region };
}

/** Keep readable labels and 46pt touch targets in a narrow fixed side column. */
export function landingCommandSlots(frame: HumanityRect) {
  const columns = 3;
  const width = (frame.width - (columns - 1) * 8) / columns;
  return Array.from({ length: 3 }, (_, index) => ({
    x: index % columns * (width + 8), y: Math.floor(index / columns) * 54,
    width, height: 46,
  }));
}

export const LANDING_COMMAND_ORDER = ["changes", "visit", "task"] as const;

/** Prefer the frozen close position, changing only the minimum needed for its touch area. */
export function placeLandingClose(preferred: HumanityRect, bounds: HumanityRect, obstacles: readonly HumanityRect[]) {
  const hitSlop = 8;
  const valid = (rect: HumanityRect) => {
    const touch = { x: rect.x - hitSlop, y: rect.y - hitSlop, width: rect.width + hitSlop * 2, height: rect.height + hitSlop * 2 };
    if (touch.x < bounds.x || touch.y < bounds.y || touch.x + touch.width > bounds.x + bounds.width || touch.y + touch.height > bounds.y + bounds.height) return false;
    return !obstacles.some(o => touch.x < o.x + o.width + 2 && touch.x + touch.width + 2 > o.x && touch.y < o.y + o.height + 2 && touch.y + touch.height + 2 > o.y);
  };
  if (valid(preferred)) return preferred;
  let best: HumanityRect | null = null, bestScore = Infinity;
  for (let dx = -160; dx <= 160; dx += 4) for (let dy = -160; dy <= 160; dy += 4) {
    const score = dx * dx + dy * dy;
    if (score >= bestScore) continue;
    const candidate = { ...preferred, x: preferred.x + dx, y: preferred.y + dy };
    if (valid(candidate)) { best = candidate; bestScore = score; }
  }
  if (best) return best;
  // Defensive fallback for unusual aspect ratios; retain the same control, not a new route.
  for (let x = bounds.x + hitSlop; x <= bounds.x + bounds.width - preferred.width - hitSlop; x += 8)
    for (let y = bounds.y + hitSlop; y <= bounds.y + bounds.height - preferred.height - hitSlop; y += 8) {
      const candidate = { ...preferred, x, y }, score = (x - preferred.x) ** 2 + (y - preferred.y) ** 2;
      if (score < bestScore && valid(candidate)) { best = candidate; bestScore = score; }
    }
  return best;
}

/** Read-only current data for operations, including legacy records moved to a proposed slot.
 * A pending proposal never authorizes applying its new date, place, duration or payment state. */
export function landingCurrentEntry<T extends {
  estado?: string; dateISO?: string; date?: string; time?: string; duration?: string; place?: string;
  changeProposal?: { originalDateISO?: string; originalDate?: string; originalTime?: string;
    originalDuration?: string; originalPlace?: string } | null;
}>(entry: T): T {
  const proposal = entry.changeProposal;
  if (!proposal || (entry.estado !== "propuesto" && entry.estado !== "propuesta_pendiente")) return entry;
  return { ...entry, dateISO: proposal.originalDateISO ?? entry.dateISO,
    date: proposal.originalDate ?? entry.date, time: proposal.originalTime ?? entry.time,
    duration: proposal.originalDuration ?? entry.duration, place: proposal.originalPlace ?? entry.place };
}

/** Shared safe space for changes, visits and tasks; only real side controls reserve space. */
export function landingAdaptivePanelSpace({ panel, frame, insets, titleBottom, controls }: {
  panel: HumanityRect; frame: LandingFrame; insets: { top: number };
  titleBottom: number; controls: readonly HumanityRect[];
}) {
  const panelFloor = panel.y + panel.height;
  const panelCeiling = frame.virtual ? 0 : Math.max(insets.top, titleBottom);
  const headerObstacles = controls.map(rect => ({
    x: rect.x - (frame.virtual ? frame.left : 0) - panel.x,
    y: rect.y - (frame.virtual ? frame.top : 0) - panelCeiling,
    width: rect.width, height: rect.height,
  })).filter(rect => rect.x < panel.width && rect.x + rect.width > 0 && rect.y + rect.height > 0);
  return { availableHeight: Math.max(0, panelFloor - panelCeiling), width: panel.width, headerObstacles };
}

/** Cap only the card. The existing selectors, orbit and bottom anchor never move. */
export function landingScrollPanelSpace({ panel, frame, insets, titleBottom, controls, offsetY = 0,
  confirmationHeight = 0, confirmationGap = 16 }: {
  panel: HumanityRect; frame: LandingFrame; insets: { top: number };
  titleBottom: number; controls: readonly HumanityRect[]; offsetY?: number;
  confirmationHeight?: number; confirmationGap?: number;
}) {
  const x = panel.x + (frame.virtual ? frame.left : 0);
  const floor = panel.y + panel.height + (frame.virtual ? frame.top : 0) + offsetY;
  const obstacles = controls.filter(rect => rect.x < x + panel.width && rect.x + rect.width > x);
  const safeTop = Math.max(insets.top + 8, titleBottom + 8);
  // The summary already excludes the header buttons horizontally; share that free lane.
  const top = Math.max(safeTop + (confirmationHeight > 0 ? confirmationHeight + confirmationGap : 0),
    ...obstacles.map(rect => rect.y + rect.height + 8));
  return { availableHeight: Math.max(1, floor - top), width: panel.width, headerObstacles: [] };
}
