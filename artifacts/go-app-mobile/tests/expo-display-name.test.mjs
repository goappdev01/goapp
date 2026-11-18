import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { hostname } from "node:os";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const configure = require("../app.config.js");
const originalPort = process.env.RCT_METRO_PORT;
const originalName = process.env.GO_EXPO_DISPLAY_NAME;
const base = { name: "GO App", slug: "go-app", scheme: "go-app", extra: { keep: true } };

function withEnvironment(port, name, run) {
  process.env.RCT_METRO_PORT = port;
  if (name === undefined) delete process.env.GO_EXPO_DISPLAY_NAME;
  else process.env.GO_EXPO_DISPLAY_NAME = name;
  try { run(configure({ config: base })); }
  finally {
    if (originalPort === undefined) delete process.env.RCT_METRO_PORT;
    else process.env.RCT_METRO_PORT = originalPort;
    if (originalName === undefined) delete process.env.GO_EXPO_DISPLAY_NAME;
    else process.env.GO_EXPO_DISPLAY_NAME = originalName;
  }
}

test("the local Expo name changes only the visible name on the two GO ports", () => {
  for (const [port, name] of [
    ["8088", "GO APP 8088 RAÚL — PC1"],
    ["8089", "GO APP 8089 RAÚL — PC1"],
    ["8088", "GO APP 8088 TESO — PC2"],
    ["8089", "GO APP 8089 TESO — PC2"],
  ]) {
    withEnvironment(port, `  ${name}  `, (result) => {
      assert.deepEqual(result, { ...base, name });
      assert.equal(base.name, "GO App");
    });
  }
});

test("missing or blank local names preserve the existing machine and port naming", () => {
  const machine = {
    "DESKTOP-CES4UCF": "RAÚL — PC1",
    "DESKTOP-D05P009": "TESO — PC2",
  }[hostname().toUpperCase()];
  for (const port of ["8088", "8089"]) {
    const expected = machine
      ? `GO APP ${port} ${machine}`
      : port === "8088" ? "GO App · COLA TERMINADA · 8088" : "GO App · COMPROBACIONES · 8089";
    for (const name of [undefined, "  "]) {
      withEnvironment(port, name, (result) => assert.deepEqual(result, { ...base, name: expected }));
    }
  }
});

test("the local name does not override other Expo ports", () => {
  withEnvironment("8090", "GO APP 8090 RAÚL — PC1", (result) => {
    assert.deepEqual(result, base);
  });
});
