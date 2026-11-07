/** Reusable, presentation-independent people browser. A source must supply authorized records. */
export type OrbitalPerson = {
  id: string;
  code: string;
  name: string;
  role: string;
  active: boolean;
  assignedRequests?: number | null;
  pendingTasks?: number | null;
  handledRequests?: number | null;
};

export type OrbitalPeopleInsets = { top: number; bottom: number; left: number; right: number };

/** Keep the Landing's 128/99/65 GO–radius–satellite proportions; scroll only when the keyboard reduces the viewport. */
export function orbitalPeopleLayout(width: number, height: number, insets: OrbitalPeopleInsets, keyboardHeight = 0) {
  const scale = Math.min(1.08, Math.max(0.83, (width - insets.left - insets.right - 28) / 280));
  const goSize = Math.round(128 * scale), orbitSize = Math.round(65 * scale), radius = Math.round(99 * scale);
  const wrap = Math.round((radius + orbitSize / 2) * 2 + 12);
  // On narrow phones, leave room for the existing 64 pt floating back control beside the lower satellites.
  const bottom = (keyboardHeight > 0 ? keyboardHeight : insets.bottom) + (width < 370 ? 30 : 12);
  const navigationBottom = keyboardHeight > 0 ? keyboardHeight + 8 : insets.bottom;
  const viewportHeight = Math.max(1, height - bottom);
  const searchHeight = 44, searchGap = 8, groupHeight = searchHeight + searchGap + wrap;
  const contentHeight = Math.max(viewportHeight, insets.top + 95 + groupHeight + 12);
  return { goSize, orbitSize, radius, wrap, bottom, navigationBottom, viewportHeight, contentHeight, searchHeight, searchGap,
    groupHeight, searchTop: contentHeight - groupHeight, orbitTop: contentHeight - wrap,
    scrollNeeded: contentHeight > viewportHeight };
}

/** Keep the search visible on very short keyboard viewports without forcing the orbits over it. */
export function orbitalPeopleSearchScrollOffset(layout: ReturnType<typeof orbitalPeopleLayout>, insets: OrbitalPeopleInsets) {
  const desiredTop = Math.max(8, Math.min(insets.top + 72, layout.viewportHeight - layout.searchHeight - 12));
  return Math.min(Math.max(0, layout.contentHeight - layout.viewportHeight), Math.max(0, layout.searchTop - desiredTop));
}

/** Orbital controls and search expressed in the floating navigation host's coordinates. */
export function orbitalPeopleAvoidRects(width: number, height: number, insets: OrbitalPeopleInsets,
  layout: ReturnType<typeof orbitalPeopleLayout>, showOrbit = true) {
  const wrapLeft = (width - layout.wrap) / 2;
  const hostTop = insets.top + 72;
  const scrollOffset = orbitalPeopleSearchScrollOffset(layout, insets);
  const wrapTop = layout.orbitTop - scrollOffset - hostTop;
  const rects = showOrbit ? Array.from({ length: 8 }, (_, slot) => {
    const angle = -Math.PI / 2 + slot * Math.PI / 4;
    return { x: wrapLeft + layout.wrap / 2 + Math.cos(angle) * layout.radius - layout.orbitSize / 2,
      y: wrapTop + layout.wrap / 2 + Math.sin(angle) * layout.radius - layout.orbitSize / 2,
      width: layout.orbitSize, height: layout.orbitSize };
  }) : [];
  if (showOrbit) rects.push({ x: wrapLeft + (layout.wrap - layout.goSize) / 2,
    y: wrapTop + (layout.wrap - layout.goSize) / 2, width: layout.goSize, height: layout.goSize });
  rects.push({ x: (width - Math.min(width - insets.left - insets.right - 36, 320)) / 2,
    y: layout.searchTop - scrollOffset - hostTop,
    width: Math.min(width - insets.left - insets.right - 36, 320), height: layout.searchHeight });
  return rects;
}

export const ORBITAL_PEOPLE_PAGE_SIZE = 7;

export function normalizePeopleSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es-ES");
}

export function browsePeople(people: readonly OrbitalPerson[], query: string): OrbitalPerson[] {
  const term = normalizePeopleSearch(query);
  const seen = new Set<string>();
  return people.filter(person => {
    if (!person.active || seen.has(person.id) || term && !normalizePeopleSearch(person.name).includes(term)
      && !normalizePeopleSearch(person.code).includes(term)) return false;
    seen.add(person.id);
    return true;
  })
    .sort((a, b) => normalizePeopleSearch(a.name).localeCompare(normalizePeopleSearch(b.name), "es")
      || a.code.localeCompare(b.code, "es") || a.id.localeCompare(b.id, "es"));
}

export function peopleOrbitPage(people: readonly OrbitalPerson[], page: number) {
  const totalPages = Math.max(1, Math.ceil(people.length / ORBITAL_PEOPLE_PAGE_SIZE));
  const currentPage = Math.min(Math.max(0, Math.trunc(Number.isFinite(page) ? page : 0)), totalPages - 1);
  return { people: people.slice(currentPage * ORBITAL_PEOPLE_PAGE_SIZE, (currentPage + 1) * ORBITAL_PEOPLE_PAGE_SIZE),
    page: currentPage, total: people.length, totalPages, hasNext: currentPage + 1 < totalPages };
}
