import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

test("alert settings require real identity and use caller JWT for private RLS writes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "go-alert-preferences-"));
  const outfile = path.join(dir, "route.mjs");
  const saved = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY };
  try {
    await build({ entryPoints: ["src/routes/supabase.ts"], outfile, bundle: true, platform: "node", format: "esm",
      banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" } });
    const { default: router } = await import(pathToFileURL(outfile));
    const { default: express } = await import("express");
    const app = express(); app.use(express.json()); app.use("/api/supabase", router);
    const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/supabase/alert-preferences`;
    process.env.SUPABASE_URL = "https://supabase.invalid";
    process.env.SUPABASE_PUBLISHABLE_KEY = "public-key";
    const userId = "11111111-1111-4111-8111-111111111111";
    const calls = [];
    globalThis.fetch = async (url, init) => {
      const remote = new URL(url);
      calls.push({ path: remote.pathname, search: remote.search, init });
      if (remote.pathname === "/auth/v1/user") return Response.json({ id: userId });
      if (remote.pathname === "/rest/v1/go_alert_preferences") {
        assert.equal(init.headers.Authorization, "Bearer test-jwt");
        if (init.method === "POST") {
          const row = JSON.parse(init.body);
          assert.equal(row.user_id, userId);
          assert.equal(row.settings.categories.task, true);
          return Response.json([row]);
        }
        assert.match(remote.search, new RegExp(`user_id=eq\\.${userId}`));
        return Response.json([]);
      }
      throw Error("Unexpected remote request");
    };
    const empty = await saved.fetch(base); assert.equal(empty.status, 401);
    const settings = { mode: "visual", priority: "standard", intervalMinutes: 15, repeats: 2,
      categories: { booking: true, solicitud: true, go: true, pedido: true, visita: true, task: true },
      quietHours: { enabled: true, start: "22:00", end: "08:00" } };
    const invalid = await saved.fetch(base, { method: "PUT", headers: { Authorization: "Bearer test-jwt", "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { ...settings, mode: "critical" } }) });
    assert.equal(invalid.status, 400);
    const ok = await saved.fetch(base, { method: "PUT", headers: { Authorization: "Bearer test-jwt", "Content-Type": "application/json" },
      body: JSON.stringify({ settings, user_id: "22222222-2222-4222-8222-222222222222" }) });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).settings.mode, "visual");
    const read = await saved.fetch(base, { headers: { Authorization: "Bearer test-jwt" } });
    assert.deepEqual(await read.json(), { settings: null });
    assert.equal(calls.filter(call => call.path === "/rest/v1/go_alert_preferences").length, 2);
    await new Promise(resolve => server.close(resolve));
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = saved.key;
    await rm(dir, { recursive: true, force: true });
  }
});

test("additive alert table grants only authenticated self access", async () => {
  const sql = await readFile("supabase/migrations/20261125120000_go_alert_preferences.sql", "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all .* from anon/);
  assert.match(sql, /user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /drop table|truncate|delete from/i);
});
