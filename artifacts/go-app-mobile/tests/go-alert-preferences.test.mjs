import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url), ts = require("typescript");
let requests = [], fail = false;
const module = { exports: {}, require: name => {
  if (name === "./authSession") return {
    getAuthApiBase: () => "https://example.invalid/api",
    fetchWithAuth: async (url, init, token, userId) => {
      requests.push({ url, init, token, userId });
      return fail ? { ok: false } : { ok: true, json: async () => init?.method === "PUT"
        ? JSON.parse(init.body) : { settings: null } };
    },
  };
  throw Error("Unexpected import " + name);
} };
vm.runInNewContext(ts.transpileModule(readFileSync("lib/goAlertPreferences.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, module);
const api = module.exports, copy = value => JSON.parse(JSON.stringify(value));

test("account settings use authenticated gateway and never send a caller-chosen user ID", async () => {
  requests = []; fail = false;
  const base = copy(api.DEFAULT_GO_ALERT_SETTINGS);
  assert.equal(await api.loadGoAlertSettings("owner-a"), null);
  assert.equal((await api.saveGoAlertSettings("owner-a", base)).mode, "sound");
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.userId === "owner-a" && request.token === true));
  assert.equal(requests[1].init.method, "PUT");
  assert.deepEqual(Object.keys(JSON.parse(requests[1].init.body)), ["settings"]);
  fail = true;
  await assert.rejects(api.saveGoAlertSettings("owner-a", base), /guardar/);
});

test("invalid modes, categories, times and repeat counts are rejected", () => {
  const base = copy(api.DEFAULT_GO_ALERT_SETTINGS);
  for (const change of [
    { mode: "critical" }, { repeats: 999 }, { intervalMinutes: -1 },
    { categories: { ...base.categories, task: "yes" } },
    { quietHours: { enabled: true, start: "25:00", end: "08:00" } },
  ]) assert.equal(api.parseGoAlertSettings({ ...base, ...change }), null);
  assert.equal(api.parseGoAlertSettings(base).mode, "sound");
});

test("local quiet hours include midnight without muting outside the interval", () => {
  const settings = copy(api.DEFAULT_GO_ALERT_SETTINGS);
  settings.quietHours = { enabled: true, start: "22:00", end: "08:00" };
  const at = (h, m) => new Date(2026, 10, 25, h, m).getTime();
  assert.equal(api.inQuietHours(settings, at(23, 0)), true);
  assert.equal(api.inQuietHours(settings, at(7, 59)), true);
  assert.equal(api.inQuietHours(settings, at(8, 0)), false);
  assert.equal(api.inQuietHours(settings, at(16, 0)), false);
});
