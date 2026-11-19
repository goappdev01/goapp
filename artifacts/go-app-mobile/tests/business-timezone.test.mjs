import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
const ts = createRequire(path.join(process.cwd(), "package.json"))("typescript");
const load = (file, imports = {}) => {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, Intl, Map, Set, require: key => { if (key in imports) return imports[key]; throw Error(key); } });
  return exports;
};
const timing = load("data/serviceTiming.ts");
const { detectBusinessTimezone, businessTimezone, deviceTimezone } = load("data/businessTimezone.ts", { "./serviceTiming": timing });
const plain = value => JSON.parse(JSON.stringify(value));

test("commercial coordinates resolve distinct IANA zones in the same country without using device location or country", async () => {
  const points = [[40.42, -3.7, "Europe/Madrid"], [28.46, -16.25, "Atlantic/Canary"], [40.71, -74, "America/New_York"], [34.05, -118.24, "America/Los_Angeles"]];
  const seen = [];
  const adapter = { geocodeAsync() { throw Error("Coordinates already exist"); },
    async reverseGeocodeAsync(point) { seen.push(point); return [{ timezone: points.find(row => row[0] === point.latitude)[2] }]; },
    requestForegroundPermissionsAsync() { throw Error("No permission request"); }, getCurrentPositionAsync() { throw Error("Not the owner's device location"); } };
  for (const [latitude, longitude, zone] of points) assert.deepEqual(plain(await detectBusinessTimezone(adapter, { coordinates: { latitude, longitude }, address: "Business address" })), { status: "resolved", timezone: zone });
  assert.deepEqual(plain(seen), points.map(([latitude, longitude]) => ({ latitude, longitude })));
});

test("one geocoded commercial address resolves via the native placemark, without accepting ambiguous locations", async () => {
  let geocoded, reversed = 0;
  const point = { latitude: 28.46, longitude: -16.25 };
  const adapter = { async geocodeAsync(address) { geocoded = address; return [point, { ...point }]; }, async reverseGeocodeAsync() { reversed++; return [{ timezone: "Atlantic/Canary" }]; } };
  assert.equal((await detectBusinessTimezone(adapter, { address: "  Validated salon address  " })).timezone, "Atlantic/Canary");
  assert.equal(geocoded, "Validated salon address");
  adapter.geocodeAsync = async () => [point, { latitude: 40.42, longitude: -3.7 }];
  assert.equal((await detectBusinessTimezone(adapter, { address: "Ambiguous address" })).status, "ambiguous");
  assert.equal(reversed, 1);
});

test("missing location, invalid coordinates, invalid IANA values, absent native support and failures never invent a zone", async () => {
  let reads = 0;
  const adapter = { async geocodeAsync() { return []; }, async reverseGeocodeAsync() { reads++; return [{ timezone: "+01:00" }, { timezone: "Not/AZone" }]; } };
  assert.equal((await detectBusinessTimezone(adapter, {})).status, "missing");
  assert.equal((await detectBusinessTimezone(adapter, { coordinates: { latitude: 91, longitude: 0 } })).status, "invalid");
  assert.equal(reads, 0);
  assert.equal((await detectBusinessTimezone(adapter, { coordinates: { latitude: 0, longitude: 0 } })).status, "unavailable");
  adapter.reverseGeocodeAsync = async () => [{ timezone: null }];
  assert.equal((await detectBusinessTimezone(adapter, { coordinates: { latitude: 0, longitude: 0 } })).status, "unavailable");
  adapter.reverseGeocodeAsync = async () => { throw Error("Native geocoder offline"); };
  assert.equal((await detectBusinessTimezone(adapter, { coordinates: { latitude: 0, longitude: 0 } })).status, "unavailable");
  adapter.reverseGeocodeAsync = async () => [{ timezone: "Europe/Madrid" }, { timezone: "Atlantic/Canary" }];
  assert.equal((await detectBusinessTimezone(adapter, { coordinates: { latitude: 0, longitude: 0 } })).status, "ambiguous");
  assert.equal(businessTimezone("+01:00"), undefined);
  assert.equal(businessTimezone("US/Eastern"), "America/New_York");
  assert.equal(businessTimezone(deviceTimezone()), deviceTimezone());
});

test("native IANA result retains seasonal DST rules rather than storing an offset", async () => {
  const { timezone } = await detectBusinessTimezone({ geocodeAsync: async () => [], reverseGeocodeAsync: async () => [{ timezone: "Europe/Madrid" }] }, { coordinates: { latitude: 40.42, longitude: -3.7 } });
  const hour = instant => new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(new Date(instant));
  assert.equal(hour("2030-01-01T12:00:00Z"), "13");
  assert.equal(hour("2030-07-01T12:00:00Z"), "14");
  assert.equal(hour("2030-03-31T01:30:00Z"), "03");
  assert.equal(hour("2030-10-27T00:30:00Z"), "02");
  assert.equal(hour("2030-10-27T01:30:00Z"), "02");
});
