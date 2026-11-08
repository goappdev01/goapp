import type { OrbitalPerson } from "./orbitalPeople";

/** Local rehearsal data only. These identifiers can never be submitted as real team members. */
export type OrbitalDemoDirectory = { version: 1; enabled: boolean; nextId: number; people: OrbitalPerson[] };

export function orbitalDemoStorageKey(directory: string, account: string): string {
  return `go_orbital_people_demo_v1:${encodeURIComponent(directory)}:${encodeURIComponent(account)}`;
}

export function newOrbitalDemoDirectory(): OrbitalDemoDirectory {
  return { version: 1, enabled: false, nextId: 8,
    people: Array.from({ length: 7 }, (_, index) => ({
      id: `demo:${index + 1}`, code: `DEMO-${String(index + 1).padStart(3, "0")}`,
      name: `Prueba ${index + 1}`, role: "Miembro de prueba", active: true,
    })) };
}

export function parseOrbitalDemoDirectory(raw: string | null): OrbitalDemoDirectory {
  if (raw === null) return newOrbitalDemoDirectory();
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw Error("Directorio de demostración inválido");
  const candidate = value as Partial<OrbitalDemoDirectory>;
  if (candidate.version !== 1 || typeof candidate.enabled !== "boolean" ||
    !Number.isSafeInteger(candidate.nextId) || (candidate.nextId ?? 0) < 1 ||
    !Array.isArray(candidate.people) || candidate.people.length > 1000) throw Error("Directorio de demostración inválido");
  const ids = new Set<string>(), codes = new Set<string>();
  for (const person of candidate.people) {
    if (!person || typeof person.id !== "string" || !/^demo:\d+$/.test(person.id) ||
      typeof person.code !== "string" || !/^DEMO-[A-Z0-9_-]{1,30}$/.test(person.code) ||
      typeof person.name !== "string" || !validVisibleName(person.name) ||
      typeof person.role !== "string" || !validVisibleName(person.role) ||
      typeof person.active !== "boolean" || ids.has(person.id) || codes.has(person.code))
      throw Error("Directorio de demostración inválido");
    ids.add(person.id); codes.add(person.code);
  }
  return candidate as OrbitalDemoDirectory;
}

export function validVisibleName(value: string): boolean {
  const name = value.trim();
  return name.length >= 2 && name.length <= 80 && !/[\u0000-\u001f\u007f]/.test(name);
}

export function normalizeDemoCode(input: string): string | null {
  const value = input.trim().toUpperCase();
  if (!value) return null;
  const suffix = value.startsWith("DEMO-") ? value.slice(5) : value;
  return /^[A-Z0-9_-]{1,30}$/.test(suffix) ? `DEMO-${suffix}` : null;
}

export function createOrbitalDemoPerson(directory: OrbitalDemoDirectory, nameInput: string, codeInput = ""):
  { directory: OrbitalDemoDirectory; person: OrbitalPerson } {
  const name = nameInput.trim();
  if (!validVisibleName(name)) throw Error("Escribe un nombre visible de 2 a 80 caracteres.");
  if (directory.people.length >= 1000) throw Error("Se alcanzó el límite de registros de prueba.");
  let number = directory.nextId;
  const takenIds = new Set(directory.people.map(person => person.id));
  const takenCodes = new Set(directory.people.map(person => person.code.toUpperCase()));
  while (takenIds.has(`demo:${number}`) || (!codeInput.trim() && takenCodes.has(`DEMO-${String(number).padStart(3, "0")}`))) number++;
  const code = codeInput.trim() ? normalizeDemoCode(codeInput) : `DEMO-${String(number).padStart(3, "0")}`;
  if (!code) throw Error("El código solo admite letras, números, guion y guion bajo.");
  if (takenCodes.has(code)) throw Error("El código ya pertenece a otra persona.");
  const person: OrbitalPerson = { id: `demo:${number}`, code, name, role: "Miembro de prueba", active: true };
  return { person, directory: { ...directory, nextId: number + 1, people: [...directory.people, person] } };
}

export function updateOrbitalDemoPerson(directory: OrbitalDemoDirectory, id: string,
  changes: { name: string; role: string; active: boolean }): OrbitalDemoDirectory {
  if (!id.startsWith("demo:") || !validVisibleName(changes.name) || !validVisibleName(changes.role))
    throw Error("Comprueba el nombre y la función antes de guardar.");
  const index = directory.people.findIndex(person => person.id === id);
  if (index < 0) throw Error("La persona de prueba ya no está disponible.");
  const people = [...directory.people];
  people[index] = { ...people[index], name: changes.name.trim(), role: changes.role.trim(), active: changes.active };
  return { ...directory, people };
}
