import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

test("assistant endpoints validate input, isolate credentials and cannot execute bookings", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "go-assistant-"));
  const output = path.join(dir, "router.mjs");
  await build({
    entryPoints: ["src/routes/booking-assistant.ts"],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    banner: {
      js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
    },
  });
  const { default: router } = await import(pathToFileURL(output).href);
  const { default: express } = await import("express");
  const app = express();
  app.use(express.json({ limit: "8mb" }));
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const realFetch = globalThis.fetch;
  const before = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  };
  const empty = {
    serviceQuery: null,
    businessQuery: null,
    staffQuery: null,
    placeQuery: null,
    radiusKm: null,
    date: null,
    timeFrom: null,
    timeTo: null,
  };
  const calls = [];
  let mode = "ok";
  process.env.SUPABASE_URL = "https://test.supabase.invalid";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-public";
  const interpreted = {
    ...empty,
    serviceQuery: "peluquería",
    placeQuery: "Cieza",
    radiusKm: 3,
    date: "2026-10-08",
  };
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith(base)) return realFetch(url, init);
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user"))
      return Response.json({ id: "user-test" });
    if (String(url).includes("photon.komoot.io"))
      return Response.json({
        features: [
          {
            geometry: { coordinates: [-1.41, 38.24] },
            properties: { name: "Cieza", country: "España" },
          },
          {
            geometry: { coordinates: [999, 999] },
            properties: { name: "Invalid" },
          },
        ],
      });
    if (String(url).endsWith("/responses")) {
      assert.equal(init.headers.Authorization, "Bearer server-only-test-key");
      const body = JSON.parse(init.body);
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.tools, undefined);
      if (mode === "failure")
        return Response.json(
          { error: "server-only-test-key" },
          { status: 500 },
        );
      return Response.json({
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify(
                  mode === "malicious"
                    ? { ...interpreted, action: "create_booking" }
                    : interpreted,
                ),
              },
            ],
          },
        ],
      });
    }
    if (String(url).endsWith("/transcriptions")) {
      assert.equal(init.headers.Authorization, "Bearer server-only-test-key");
      assert.ok(init.body instanceof FormData);
      return Response.json({ text: "Quiero una peluquería" });
    }
    throw new Error("Unexpected external call " + url);
  };
  const post = (route, body, authenticated = false) =>
    realFetch(base + route, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authenticated
          ? { Authorization: "Bearer customer-test-token" }
          : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    delete process.env.OPENAI_API_KEY;
    assert.deepEqual(await (await realFetch(base + "/capabilities")).json(), {
      interpretation: false,
      transcription: false,
    });
    const request = {
      text: "Quiero una peluquería en Cieza mañana por la tarde a menos de 3 km",
      today: "2026-10-07",
      context: empty,
    };
    const fallback = await (await post("/interpret", request)).json();
    assert.equal(fallback.request.radiusKm, 3);
    assert.equal(fallback.request.date, "2026-10-08");
    assert.equal(calls.length, 0);
    assert.equal(
      (await post("/interpret", { ...request, today: "2026-02-31" })).status,
      400,
    );
    assert.equal(
      (
        await post("/interpret", {
          ...request,
          context: { ...empty, secret: "bad" },
        })
      ).status,
      400,
    );
    assert.equal((await post("/transcribe", {})).status, 503);
    process.env.OPENAI_API_KEY = "server-only-test-key";
    assert.equal((await post("/interpret", request)).status, 401);
    assert.equal(calls.length, 0);
    const answer = await (await post("/interpret", request, true)).json();
    assert.equal(answer.mode, "ai");
    assert.deepEqual(answer.request, interpreted);
    mode = "malicious";
    const injection = await (await post("/interpret", request, true)).json();
    assert.equal(injection.mode, "rules");
    assert.equal(injection.request.action, undefined);
    mode = "failure";
    const failure = await (await post("/interpret", request, true)).json();
    assert.equal(failure.mode, "rules");
    assert.ok(!JSON.stringify(failure).includes("server-only-test-key"));
    assert.equal(
      (await post("/transcribe", { audio: "@@@", mime: "audio/m4a" }, true))
        .status,
      400,
    );
    assert.equal(
      (
        await post(
          "/transcribe",
          { audio: "A".repeat(7000004), mime: "audio/m4a" },
          true,
        )
      ).status,
      400,
    );
    const speech = await post(
      "/transcribe",
      { audio: Buffer.alloc(200, 1).toString("base64"), mime: "audio/m4a" },
      true,
    );
    assert.equal(speech.status, 200);
    assert.equal((await speech.json()).text, "Quiero una peluquería");
    const places = await (await realFetch(base + "/places?q=Cieza")).json();
    assert.equal(places.length, 1);
    assert.equal(places[0].latitude, 38.24);
    const count = calls.length;
    await realFetch(base + "/places?q=Cieza");
    assert.equal(calls.length, count);
    assert.equal((await post("/bookings", request, true)).status, 404);
    assert.ok(!calls.some((call) => call.url.includes("/bookings")));
    for (let i = 0; i < 15; i++)
      await post("/transcribe", { audio: "@@@", mime: "audio/m4a" }, true);
    const limited = await post("/transcribe", {}, true);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Retry-After"), "60");
  } finally {
    globalThis.fetch = realFetch;
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
