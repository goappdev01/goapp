import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const configure = require("../app.config.js");
const { expo: base } = require("../app.json");

function withPort(port, run) {
  const previous = process.env.RCT_METRO_PORT;
  try {
    if (port === undefined) delete process.env.RCT_METRO_PORT;
    else process.env.RCT_METRO_PORT = port;
    return run();
  } finally {
    if (previous === undefined) delete process.env.RCT_METRO_PORT;
    else process.env.RCT_METRO_PORT = previous;
  }
}

for (const [port, name] of [
  ["8088", "GO App · COLA TERMINADA · 8088"],
  ["8089", "GO App · COMPROBACIONES · 8089"],
]) {
  test(`Metro ${port}: exact display name and no other configuration changes`, () => {
    const input = structuredClone(base);
    Object.freeze(input);
    const output = withPort(port, () => configure({ config: input }));
    assert.equal(output.name, name);
    assert.deepEqual(output, { ...base, name });
    assert.deepEqual(input, base);
  });
}

for (const port of [undefined, "", "8081", "80880", "invalid", "toString"]) {
  test(`Other commands/ports (${String(port)}) retain the original app name`, () => {
    const output = withPort(port, () => configure({ config: base }));
    assert.strictEqual(output, base);
    assert.equal(output.name, "GO App");
  });
}

test("Switching environment never reuses the other server's label", () => {
  const names = ["8088", "8089", "8088"].map((port) =>
    withPort(port, () => configure({ config: base }).name),
  );
  assert.deepEqual(names, [
    "GO App · COLA TERMINADA · 8088",
    "GO App · COMPROBACIONES · 8089",
    "GO App · COLA TERMINADA · 8088",
  ]);
});
