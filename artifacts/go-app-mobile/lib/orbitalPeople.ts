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
