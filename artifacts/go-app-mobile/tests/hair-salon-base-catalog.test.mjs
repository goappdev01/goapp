import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";

const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");
const file = "data/hairSalonBaseCatalog.ts";
const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports });

test("new hair salon template has fourteen ordered, categorized services and distinct local photos", () => {
  const { HAIR_SALON_BASE_CATALOG: rows, hairSalonBaseServices } = exports;
  assert.deepEqual(Array.from(rows, row => [row.name, row.category, row.duration]), [
    ["Corte caballero", "Cortes", 30], ["Corte señora", "Cortes", 45],
    ["Corte infantil", "Cortes", 25], ["Lavado", "Lavado y peinado", 15],
    ["Peinado y secado", "Lavado y peinado", 30], ["Tinte / coloración", "Color", 90],
    ["Mechas", "Color", 120], ["Tratamiento capilar", "Tratamientos", 45],
    ["Ampolla / mascarilla", "Tratamientos", 15], ["Alisado", "Alisados", 120],
    ["Plancha", "Alisados", 30], ["Rizos / ondas", "Lavado y peinado", 30],
    ["Arreglo de barba", "Barbería", 15], ["Corte + barba", "Barbería", 45],
  ]);
  assert.equal(new Set(rows.map(row => row.name)).size, 14);
  assert.equal(new Set(rows.map(row => row.photoId)).size, 14);
  const services = hairSalonBaseServices();
  assert.equal(services.length, 14);
  for (const [index, service] of services.entries()) {
    assert.equal(service.capacity, 1);
    assert.equal(service.photoUri, `demo-catalog:${rows[index].photoId}`);
    assert.ok(Number.isFinite(service.price) && service.price >= 0);
    assert.ok(statSync(`assets/catalog-demo/${rows[index].photoId}.jpg`).size < 200_000);
  }
  assert.equal(services[0].price, 15);
  assert.equal(services[3].price, 8);
  assert.equal(services[4].price, 20);
  assert.equal(services[5].price, 45);
  assert.equal(services[7].price, 30);
});
