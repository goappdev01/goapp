import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
const sourceFile = fileURLToPath(new URL("../lib/voiceTranscription.ts", import.meta.url));
const context = {
  exports: {},
  AbortController,
  require(name) {
    throw new Error("Unexpected dependency: " + name);
  },
};
vm.runInNewContext(
  ts.transpileModule(readFileSync(sourceFile, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText,
  context,
);
const { createVoiceTranscription } = context.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(setImmediate);
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

// These evidence values describe a MOCK only; no real device was certified.
const evidence = {
  locale: "es-ES",
  onDeviceEnforced: true,
  modelReady: true,
  offlineTestPassed: true,
  networkAuditPassed: true,
  reference: "mock:locality-test",
};
function provider(options = {}) {
  const engine = options.engine || "verified-local";
  const state = { probes: 0, starts: [], stops: 0 };
  const capability = {
    locale: "es-ES",
    available: true,
    fileInput: true,
    network: engine === "verified-local" ? "none" : "possible",
    cost: engine === "external" ? "possible" : "none",
    ...(engine === "verified-local" ? { localEvidence: { ...evidence } } : {}),
    ...options.capability,
  };
  return {
    id: options.id || engine,
    engine,
    state,
    async getCapability(locale, signal) {
      state.probes++;
      assert.equal(locale, "es-ES");
      return options.probe ? options.probe(signal) : capability;
    },
    start(input) {
      state.starts.push(input);
      return options.start ? options.start(input) : {
        completion: Promise.resolve({ text: "  Quiero una cita mañana.  " }),
        async cancel() { state.stops++; },
      };
    },
  };
}
function grant(value, overrides = {}) {
  return {
    providerId: value.id,
    engine: value.engine,
    network: value.engine === "verified-local" ? "deny" : "allow",
    cost: value.engine === "external" ? "allow" : "deny",
    ...overrides,
  };
}
function request(values, overrides = {}) {
  return {
    locale: "es-ES",
    audioFileUri: "file:///mock/audio.wav",
    authorizations: values.map((value) => grant(value)),
    ...overrides,
  };
}

test("the standalone contract typechecks and imports no native or network dependencies", () => {
  const program = ts.createProgram([sourceFile], {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    skipLibCheck: true,
    types: [],
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  );
  assert.deepEqual(diagnostics, []);
});

test("verified local execution requires evidence and forces device-only policy", async () => {
  const local = provider();
  const external = provider({ engine: "external" });
  const task = createVoiceTranscription([local, external]).start(request([local, external], {
    authorizations: [grant(local, { network: "allow", cost: "allow" }), grant(external)],
  }));
  assert.deepEqual(plain(await task.result), {
    status: "completed",
    providerId: local.id,
    engine: "verified-local",
    text: "Quiero una cita mañana.",
  });
  assert.equal(local.state.starts[0].requiresOnDeviceRecognition, true);
  assert.equal(local.state.starts[0].networkAllowed, false);
  assert.equal(local.state.starts[0].costAllowed, false);
  assert.equal(external.state.probes, 0);
  await task.cancel();
  assert.equal(local.state.stops, 0);
});

test("provider priority is local, system, external and stable within each class", async () => {
  const external = provider({ engine: "external" });
  const system = provider({ engine: "system" });
  const firstLocal = provider({ id: "first-local" });
  const secondLocal = provider({ id: "second-local" });
  const registered = [external, system, firstLocal, secondLocal];
  const outcome = await createVoiceTranscription(registered).start(request(registered)).result;

  assert.equal(outcome.status, "completed");
  assert.equal(outcome.providerId, firstLocal.id);
  assert.equal(outcome.engine, "verified-local");
  assert.equal(firstLocal.state.starts.length, 1);
  assert.equal(secondLocal.state.probes, 0);
  assert.equal(system.state.probes, 0);
  assert.equal(external.state.probes, 0);
  assert.equal(external.state.starts.length, 0);
  assert.deepEqual(registered.map((value) => value.id), [
    external.id, system.id, firstLocal.id, secondLocal.id,
  ]);
});


test("each missing local proof fact blocks audio, including locale and an evidence reference", async () => {
  for (const localEvidence of [
    undefined,
    { ...evidence, locale: "es-MX" },
    { ...evidence, onDeviceEnforced: false },
    { ...evidence, modelReady: false },
    { ...evidence, offlineTestPassed: false },
    { ...evidence, networkAuditPassed: false },
    { ...evidence, reference: " " },
  ]) {
    const local = provider({ capability: { localEvidence } });
    const outcome = await createVoiceTranscription([local]).start(request([local])).result;
    assert.equal(outcome.status, "unavailable");
    assert.equal(outcome.attempts[0].reason, "local-evidence-required");
    assert.equal(local.state.starts.length, 0);
  }
  for (const capability of [{ network: "possible" }, { cost: "possible" }]) {
    const local = provider({ capability });
    const outcome = await createVoiceTranscription([local]).start(request([local])).result;
    assert.equal(outcome.attempts[0].reason, "local-evidence-required");
  }
});

test("capabilities are checked for the exact locale, file input and present availability", async () => {
  for (const capability of [{ locale: "es-MX" }, { available: false }, { fileInput: false }]) {
    const local = provider({ capability });
    const outcome = await createVoiceTranscription([local]).start(request([local])).result;
    assert.equal(outcome.status, "unavailable");
    assert.equal(outcome.attempts[0].reason, "unsupported");
    assert.equal(local.state.starts.length, 0);
  }
});

test("unsupported request locales and remote audio URIs never reach a provider", async () => {
  const local = provider();
  const coordinator = createVoiceTranscription([local]);
  assert.deepEqual(plain(await coordinator.start(request([local], { locale: "es-MX" })).result), {
    status: "invalid-request", reason: "unsupported-locale",
  });
  for (const audioFileUri of ["https://mock/audio.wav", "content://mock/audio", "", "file:///"]) {
    const outcome = await coordinator.start(request([local], { audioFileUri })).result;
    assert.equal(outcome.status, "invalid-request");
    assert.equal(outcome.reason, "local-file-required");
  }
  assert.equal(local.state.probes, 0);
});

test("authorization is specific to both provider and engine, and defaults to no execution", async () => {
  const external = provider({ engine: "external" });
  for (const authorizations of [
    [],
    [grant(external, { providerId: "another-provider" })],
    [grant(external, { engine: "system" })],
  ]) {
    const outcome = await createVoiceTranscription([external]).start(request([external], { authorizations })).result;
    assert.equal(outcome.attempts[0].reason, "authorization-required");
  }
  assert.equal(external.state.probes, 0);
  assert.equal(external.state.starts.length, 0);
});

test("system offline preference never bypasses explicit network authorization", async () => {
  const system = provider({ engine: "system", capability: { network: "none" } });
  const coordinator = createVoiceTranscription([system]);
  const denied = await coordinator.start(request([system], {
    authorizations: [grant(system, { network: "deny" })],
  })).result;
  assert.equal(denied.attempts[0].reason, "network-authorization-required");
  assert.equal(system.state.starts.length, 0);
  const allowed = await coordinator.start(request([system])).result;
  assert.equal(allowed.status, "completed");
  assert.equal(allowed.engine, "system");
  assert.equal(system.state.starts[0].requiresOnDeviceRecognition, false);
  assert.equal(system.state.starts[0].networkAllowed, true);
});

test("external transcription always requires explicit network and cost grants", async () => {
  const external = provider({ engine: "external", capability: { network: "none", cost: "none" } });
  const coordinator = createVoiceTranscription([external]);
  for (const [overrides, reason] of [
    [{ network: "deny", cost: "allow" }, "network-authorization-required"],
    [{ network: "allow", cost: "deny" }, "cost-authorization-required"],
  ]) {
    const outcome = await coordinator.start(request([external], {
      authorizations: [grant(external, overrides)],
    })).result;
    assert.equal(outcome.attempts[0].reason, reason);
  }
  assert.equal(external.state.starts.length, 0);
  assert.equal((await coordinator.start(request([external])).result).status, "completed");
  assert.equal(external.state.starts[0].costAllowed, true);
});

test("a system provider with possible cost needs a separate cost grant", async () => {
  const system = provider({ engine: "system", capability: { cost: "possible" } });
  const coordinator = createVoiceTranscription([system]);
  const denied = await coordinator.start(request([system])).result;
  assert.equal(denied.attempts[0].reason, "cost-authorization-required");
  const allowed = await coordinator.start(request([system], {
    authorizations: [grant(system, { cost: "allow" })],
  })).result;
  assert.equal(allowed.status, "completed");
});

test("fallback waits for failed audio release and never processes the audio in parallel", async () => {
  const firstEnd = deferred();
  let activeAudio = 0, maximumAudio = 0;
  const local = provider({ start: () => {
    activeAudio++;
    maximumAudio = Math.max(maximumAudio, activeAudio);
    return { completion: firstEnd.promise.finally(() => activeAudio--), cancel: async () => {} };
  } });
  const system = provider({ engine: "system", start: () => {
    activeAudio++;
    maximumAudio = Math.max(maximumAudio, activeAudio);
    return {
      completion: Promise.resolve({ text: "Resultado del sistema." }).finally(() => activeAudio--),
      cancel: async () => {},
    };
  } });
  const task = createVoiceTranscription([local, system]).start(request([local, system]));
  await tick();
  assert.equal(local.state.starts.length, 1);
  assert.equal(system.state.probes, 0);
  firstEnd.reject(new Error("simulated failure after release"));
  const outcome = await task.result;
  assert.equal(outcome.status, "completed");
  assert.equal(outcome.engine, "system");
  assert.equal(maximumAudio, 1);
  assert.equal(activeAudio, 0);
  assert.equal(system.state.starts[0].audioFileUri, local.state.starts[0].audioFileUri);
});

test("local failure cannot silently escalate to an unauthorized remote fallback", async () => {
  const local = provider({ start: () => ({
    completion: Promise.reject(new Error("local unavailable")),
    cancel: async () => {},
  }) });
  const external = provider({ engine: "external" });
  const outcome = await createVoiceTranscription([local, external]).start(request([local])).result;
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.attempts[1].reason, "authorization-required");
  assert.equal(external.state.probes, 0);
});

test("request and grants are snapshotted before an asynchronous capability query", async () => {
  const capabilityGate = deferred();
  const system = provider({ engine: "system", probe: () => capabilityGate.promise });
  const input = request([system], { authorizations: [grant(system, { network: "deny" })] });
  const task = createVoiceTranscription([system]).start(input);
  input.authorizations[0].network = "allow";
  input.audioFileUri = "file:///different.wav";
  capabilityGate.resolve({ locale: "es-ES", available: true, fileInput: true, network: "possible", cost: "none" });
  const outcome = await task.result;
  assert.equal(outcome.attempts[0].reason, "network-authorization-required");
  assert.equal(system.state.starts.length, 0);
});

test("cancelling a pending capability returns once and ignores a late answer", async () => {
  const capabilityGate = deferred();
  let observedSignal;
  const local = provider({ probe: (signal) => {
    observedSignal = signal;
    return capabilityGate.promise;
  } });
  const task = createVoiceTranscription([local]).start(request([local]));
  await task.cancel();
  assert.equal((await task.result).status, "cancelled");
  assert.equal(observedSignal.aborted, true);
  capabilityGate.resolve({ locale: "es-ES", available: true, fileInput: true, network: "none", cost: "none", localEvidence: evidence });
  await tick();
  assert.equal(local.state.starts.length, 0);
});

test("active cancellation is idempotent, discards late text, and prevents fallback until audio release", async () => {
  const completion = deferred(), release = deferred();
  let stops = 0, delivered = 0;
  const local = provider({ start: () => ({
    completion: completion.promise,
    cancel: async () => { stops++; await release.promise; },
  }) });
  const external = provider({ engine: "external" });
  const coordinator = createVoiceTranscription([local, external]);
  const task = coordinator.start(request([local, external]));
  task.result.then(() => delivered++);
  await tick();
  assert.equal((await coordinator.start(request([local, external])).result).status, "busy");
  const firstCancel = task.cancel(), secondCancel = task.cancel();
  await tick();
  completion.resolve({ text: "Late text must be discarded." });
  await tick();
  assert.equal(delivered, 0);
  assert.equal((await coordinator.start(request([local, external])).result).status, "busy");
  release.resolve();
  await Promise.all([firstCancel, secondCancel]);
  assert.equal((await task.result).status, "cancelled");
  await tick();
  assert.equal(stops, 1);
  assert.equal(delivered, 1);
  assert.equal(external.state.probes, 0);
  assert.equal(local.state.starts[0].signal.aborted, true);
});

test("failed cancellation keeps the coordinator busy until completion proves resource release", async () => {
  const completion = deferred();
  const local = provider({ start: () => ({
    completion: completion.promise,
    cancel: async () => { throw new Error("simulated cleanup failure"); },
  }) });
  const coordinator = createVoiceTranscription([local]);
  const task = coordinator.start(request([local]));
  await tick();
  const cancellation = task.cancel();
  await tick();
  assert.equal((await coordinator.start(request([local])).result).status, "busy");
  completion.reject(new Error("released terminal failure"));
  await cancellation;
  assert.equal((await task.result).status, "cancelled");
});

test("one promise delivers one final transcript despite duplicate terminal resolutions", async () => {
  const completion = deferred();
  const local = provider({ start: () => ({ completion: completion.promise, cancel: async () => {} }) });
  const coordinator = createVoiceTranscription([local]);
  const task = coordinator.start(request([local]));
  let delivered = 0;
  task.result.then(() => delivered++);
  await tick();
  completion.resolve({ text: "Primera entrega." });
  completion.resolve({ text: "Duplicado." });
  completion.reject(new Error("late error"));
  assert.equal((await task.result).text, "Primera entrega.");
  await tick();
  assert.equal(delivered, 1);
  await task.cancel();
});

test("capability errors, start errors and empty results are isolated and contain no raw error details", async () => {
  const capabilityFailure = provider({ id: "probe-error", probe: async () => { throw new Error("private probe payload"); } });
  const startFailure = provider({ id: "start-error", start: () => { throw new Error("private provider payload"); } });
  const empty = provider({ id: "empty", start: () => ({ completion: Promise.resolve({ text: " " }), cancel: async () => {} }) });
  const outcome = await createVoiceTranscription([capabilityFailure, startFailure, empty])
    .start(request([capabilityFailure, startFailure, empty])).result;
  assert.equal(outcome.status, "failed");
  assert.deepEqual(plain(outcome.attempts.map((attempt) => attempt.reason)), ["capability-error", "provider-error", "no-transcript"]);
  assert.ok(!JSON.stringify(outcome).includes("private"));
});

test("duplicate or empty provider IDs cannot make engine authorization ambiguous", () => {
  assert.throws(() => createVoiceTranscription([provider({ id: "same" }), provider({ id: "same", engine: "system" })]), /unique/);
  assert.throws(() => createVoiceTranscription([provider({ id: " " })]), /non-empty/);
});
