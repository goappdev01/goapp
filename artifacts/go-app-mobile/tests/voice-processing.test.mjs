import { loadAuthSession } from "./helpers/auth-session-fixture.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const nativeRequire = createRequire(require.resolve("react-native/package.json"));
const nativeAbort = nativeRequire("abort-controller/dist/abort-controller");
function load(file, modules, globals = {}) {
  const context = {
    exports: {}, Error, Date, setTimeout, clearTimeout,
    ...nativeAbort, console: { info() {} }, process: { env: {} }, ...globals,
    require(name) {
      if (name in modules) return modules[name];
      throw new Error("Unexpected import " + name);
    },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(path.resolve(appRoot, file), "utf8"), {
    compilerOptions: { esModuleInterop: false, alwaysStrict: false, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context, { filename: file });
  return context.exports;
}
function apiFixture({ fetch, session = { access_token: "mock-session-token", user: { id: "mock-user" } }, env = { EXPO_PUBLIC_API_URL: "http://go-backend.test/api" }, model = {}, ...globals } = {}) {
  const memory = new Map(session ? [["go_supabase_session_v1", JSON.stringify(session)]] : []);
  const storage = {getItem:async key=>memory.get(key)??null,removeItem:async key=>memory.delete(key),
    setItem:async(key,value)=>memory.set(key,value),multiRemove:async keys=>keys.forEach(key=>memory.delete(key))};
  const auth = loadAuthSession({fetch,process:{env},...nativeAbort,...globals},storage);
  return load("lib/bookingAssistant.ts", {
    "./authSession": auth,
    "react-native": { Platform: { OS: "ios" } },
    "@react-native-async-storage/async-storage": { default: { getItem: async () => JSON.stringify(session) } },
    "@workspace/api-zod": model, "@/data/booking": { getAuthenticatedUserId: async () => session?.user?.id || null },
    "./goLogBridge": {}, "@/data/goSearchAliases": {},
  }, { fetch, process: { env }, ...globals });
}
test("the capabilities request works with React Native's actual AbortSignal without timeout()", async () => {
  assert.equal(typeof nativeAbort.AbortSignal.timeout, "undefined");
  let calls = 0;
  const api = apiFixture({ fetch: async (url, init) => {
    calls++;
    assert.equal(url, "http://go-backend.test/api/booking-assistant/capabilities");
    assert.ok(init.signal instanceof nativeAbort.AbortSignal);
    return { ok: true, json: async () => ({ interpretation: true, transcription: true }) };
  } });
  const result = await api.assistantApi("/capabilities");
  assert.equal(result.transcription, true);
  assert.equal(calls, 1);
});

const tick = () => new Promise(setImmediate);
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
function clockFixture() {
  let id = 0;
  const timers = new Map(), scheduled = [];
  return {
    timers, scheduled,
    setTimeout(callback, delay) {
      const token = ++id;
      const timer = { callback, delay };
      timers.set(token, timer); scheduled.push(timer);
      return token;
    },
    clearTimeout(token) { timers.delete(token); },
    fire(delay) {
      for (const [token, timer] of [...timers]) if (timer.delay === delay) {
        timers.delete(token); timer.callback();
      }
    },
  };
}
function nativeVoiceFixture(options = {}) {
  const received = [], deleted = [], requests = [], reads = [], diagnostics = [], slots = [], effects = [];
  const clock = clockFixture();
  let cursor = 0, appStateListener, recorderListener;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useCallback(callback, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((value, k) => !Object.is(value, old.deps[k]))) slots[i] = { deps, callback };
      return slots[i].callback;
    },
    useEffect(callback, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((value, k) => !Object.is(value, old.deps[k]))) {
        old?.cleanup?.();
        const record = { deps }; slots[i] = record;
        effects.push(() => { record.cleanup = callback(); });
      }
    },
  };
  // Synthetic bytes test transport only; they are never sent to a real provider.
  const audio = options.audio || Buffer.from('synthetic-recording-fixture'.repeat(50));
  const session = options.session === undefined
    ? { access_token: 'mock-session-token', user: { id: 'mock-user' } } : options.session;
  const recorder = {
    uri: null, isRecording: false, starts: 0, stops: 0,
    async prepareToRecordAsync() { this.uri = 'file:///mock-recording-' + (this.starts + 1) + '.m4a'; },
    record() { this.starts++; this.isRecording = true; },
    getStatus() { return { isRecording: this.isRecording, durationMillis: options.duration ?? 1800 }; },
    async stop() { this.stops++; this.isRecording = false; },
  };
  const fetch = async (url, init) => {
    const operation = new URL(url).pathname.split('/').at(-1);
    requests.push({ operation, init });
    if (options.offline) throw new Error('private internal URL and credentials must never appear');
    if (options.reply) return options.reply(operation, init);
    if (operation === 'capabilities') return { ok: true, json: async () => ({ transcription: options.available !== false, interpretation: true }) };
    assert.equal(operation, 'transcribe');
    if (options.gate) return { ok: true, json: () => options.gate.promise };
    return { ok: true, json: async () => ({ text: options.text ?? 'Quiero una peluquería en Cieza mañana.' }) };
  };
  const globals = { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, console: { info: (...args) => diagnostics.push(args) } };
  const api = apiFixture({ fetch, session, ...globals });
  const preset = load('node_modules/expo-audio/src/RecordingConstants.ts', {}).RecordingPresets.HIGH_QUALITY;
  const hook = load('hooks/useBookingVoice.ts', {
    react,
    'react-native': { Platform: { OS: 'ios' }, AppState: {
      addEventListener(_name, listener) { appStateListener = listener; return { remove() { appStateListener = undefined; } }; },
    } },
    'expo-audio': {
      useAudioRecorder(recordingPreset, listener) { assert.equal(recordingPreset, preset); recorderListener = listener; return recorder; },
      RecordingPresets: { HIGH_QUALITY: preset },
      AudioModule: { requestRecordingPermissionsAsync: async () => ({ granted: options.denied !== true }) },
      setAudioModeAsync: async () => {},
    },
    'expo-file-system/legacy': {
      EncodingType: { Base64: 'base64' },
      getInfoAsync: async () => ({ exists: options.missing !== true, size: options.size ?? audio.byteLength }),
      readAsStringAsync: async (uri, encoding) => {
        assert.equal(encoding.encoding, 'base64'); reads.push(uri);
        if (options.unreadable) throw new Error('private audio-file detail');
        return audio.toString('base64');
      },
      deleteAsync: async uri => { deleted.push(uri); },
    },
    '@/lib/bookingAssistant': api,
    '@/data/booking': { getAuthenticatedUserId: async () => session?.access_token ? session.user?.id || null : null },
  }, globals);
  return {
    received, deleted, requests, diagnostics, reads, audio, recorder, clock, api, preset, options,
    render() {
      cursor = 0;
      const value = hook.useBookingVoice((text, zone) => { received.push({ text, zone }); options.onText?.(text, zone); });
      effects.splice(0).forEach(effect => effect());
      return value;
    },
    background() { appStateListener('background'); },
    interrupt() { recorderListener({ url: recorder.uri, hasError: true, isFinished: true }); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
test('short and longer iOS recordings traverse the actual client and deliver only one final message', async () => {
  for (const duration of [1500, 45000]) {
    const f = nativeVoiceFixture({ duration, audio: Buffer.alloc(duration === 45000 ? 720000 : 24000, 17) });
    await f.render().start();
    assert.equal(f.render().status, 'listening');
    await f.render().stop();
    assert.equal(f.render().status, 'idle');
    assert.equal(f.recorder.starts, 1); assert.equal(f.recorder.stops, 1);
    assert.deepEqual(f.requests.map(request => request.operation), ['capabilities', 'transcribe']);
    const upload = f.requests.at(-1).init;
    assert.equal(upload.method, 'POST');
    assert.equal(upload.headers.get('Authorization'), 'Bearer mock-session-token');
    const body = JSON.parse(upload.body);
    assert.equal(body.mime, 'audio/m4a');
    assert.deepEqual(Buffer.from(body.audio, 'base64'), f.audio);
    assert.equal(f.preset.extension, '.m4a');
    assert.equal(f.preset.ios.outputFormat, 'aac ');
    assert.equal(f.preset.android.audioEncoder, 'aac');
    assert.deepEqual(f.received, [{ text: 'Quiero una peluquería en Cieza mañana.', zone: false }]);
    assert.equal(f.deleted.length, 1);
    assert.equal(f.clock.timers.size, 0);
    f.unmount();
  }
});
test('repeated stop taps do not duplicate the upload or the conversational callback', async () => {
  const gate = deferred(), f = nativeVoiceFixture({ gate });
  await f.render().start();
  const first = f.render().stop();
  await tick();
  await f.render().stop(); await f.render().stop();
  assert.equal(f.render().status, 'transcribing');
  assert.equal(f.requests.filter(request => request.operation === 'transcribe').length, 1);
  assert.equal(f.recorder.stops, 1);
  gate.resolve({ text: 'Una sola solicitud.' });
  await first;
  assert.deepEqual(f.received, [{ text: 'Una sola solicitud.', zone: false }]);
  assert.equal(f.render().status, 'idle');
  assert.equal(f.clock.timers.size, 0);
  f.unmount();
});
test('closing and reopening discards old text without stopping the new recording', async () => {
  const gate = deferred(), f = nativeVoiceFixture({ gate });
  await f.render().start();
  const old = f.render().stop(); await tick();
  f.render().abort(); await tick();
  f.options.gate = undefined;
  await f.render().start();
  gate.resolve({ text: 'This obsolete transcript must be ignored.' }); await old;
  assert.equal(f.render().status, 'listening');
  assert.equal(f.recorder.isRecording, true);
  assert.equal(f.received.length, 0);
  assert.ok(!f.deleted.includes('file:///mock-recording-2.m4a'));
  await f.render().stop();
  assert.equal(f.received.length, 1);
  assert.equal(f.recorder.starts, 2);
  assert.equal(f.render().status, 'idle');
  f.unmount();
});
test('denied permission, missing or empty audio and very short clips never reach the backend', async () => {
  for (const options of [{ denied: true }, { missing: true }, { size: 0 }, { duration: 0 }, { duration: 150 }, { duration: 299 }, { size: 5000001 }]) {
    const f = nativeVoiceFixture(options);
    await f.render().start(); await f.render().stop();
    assert.equal(f.render().status, 'idle');
    assert.equal(f.requests.length, 0); assert.equal(f.received.length, 0);
    assert.ok(f.render().error);
    if (options.duration !== undefined) assert.match(f.render().error, /muy breve/);
    if (options.denied) assert.equal(f.recorder.starts, 0);
    f.unmount();
  }
});
test('a connection failure is honest and a later retry returns to the existing voice flow', async () => {
  const f = nativeVoiceFixture({ offline: true });
  await f.render().start(); await f.render().stop();
  assert.equal(f.render().status, 'idle'); assert.match(f.render().error, /conectar/);
  assert.equal(f.received.length, 0);
  assert.equal(f.requests.filter(request => request.operation === 'transcribe').length, 0);
  f.options.offline = false;
  await f.render().start(); assert.equal(f.render().error, '');
  await f.render().stop();
  assert.equal(f.received.length, 1); assert.equal(f.recorder.starts, 2);
  assert.equal(f.render().status, 'idle');
  f.unmount();
});
test('missing session or disabled service cannot dispatch text or silently upload audio', async () => {
  for (const options of [{ session: null }, { available: false }]) {
    const f = nativeVoiceFixture(options);
    await f.render().start(); await f.render().stop();
    assert.equal(f.requests.filter(request => request.operation === 'transcribe').length, 0);
    assert.equal(f.reads.length, 0); assert.equal(f.received.length, 0);
    assert.ok(f.render().error);
    assert.equal(f.render().status, 'idle');
    f.unmount();
  }
});
test('a rejected session returns a public sign-in message instead of a generic transcription claim', async () => {
  const f = nativeVoiceFixture({ reply: async operation => operation === 'capabilities'
    ? { ok: true, json: async () => ({ transcription: true }) }
    : { ok: false, status: 401, json: async () => ({ error: 'private authorization information' }) } });
  await f.render().start(); await f.render().stop();
  assert.match(f.render().error, /Inicia sesión/);
  assert.equal(f.received.length, 0);
  assert.equal(f.render().status, 'idle');
  assert.equal(f.clock.timers.size, 0);
  f.unmount();
});
test('file-read errors and invalid or empty transcripts never create invented chat messages', async () => {
  for (const options of [{ unreadable: true }, { text: '' }, { text: '   ' }, { text: 42 }]) {
    const f = nativeVoiceFixture(options);
    await f.render().start(); await f.render().stop();
    assert.equal(f.received.length, 0);
    assert.ok(f.render().error);
    assert.equal(f.render().status, 'idle');
    assert.equal(f.deleted.length, 1);
    f.unmount();
  }
});
test('processing diagnostics contain codes only, never audio, transcript, URLs or session tokens', async () => {
  const privateText = 'PRIVATE_TRANSCRIPT_AND_AUDIO';
  const f = nativeVoiceFixture({ text: privateText, audio: Buffer.from(privateText.repeat(200)) });
  await f.render().start(); await f.render().stop();
  f.options.reply = async operation => operation === 'capabilities'
    ? { ok: true, json: async () => ({ transcription: true }) }
    : { ok: false, status: 502, json: async () => ({ error: 'PRIVATE_PROVIDER_KEY' }) };
  await f.render().start(); await f.render().stop();
  const logs = JSON.stringify(f.diagnostics);
  assert.match(logs, /HTTP_FAILURE/);
  for (const value of [privateText, f.audio.toString('base64'), 'mock-session-token', 'PRIVATE_PROVIDER_KEY', 'http://', 'file:///']) {
    assert.ok(!logs.includes(value)); assert.ok(!f.render().error.includes(value));
  }
  assert.equal(f.received.length, 1);
  f.unmount();
});
test('voice timeout covers server authentication plus transcription and releases its timer on abort', async () => {
  const clock = clockFixture(), diagnostics = [];
  let request;
  const api = apiFixture({ ...clock, console: { info: (...args) => diagnostics.push(args) },
    fetch: (_url, init) => new Promise((_resolve, reject) => {
      request = init;
      init.signal.addEventListener('abort', () => reject(new Error('private timeout detail')));
    }) });
  const work = api.assistantApi('/transcribe', { audio: 'mock', mime: 'audio/m4a' });
  const failure = assert.rejects(work, error => {
    assert.equal(error.code, 'REQUEST_TIMEOUT');
    assert.match(error.message, /tardado demasiado/); return true;
  });
  await tick();
  assert.equal(clock.scheduled.at(-1).delay, 55000);
  clock.fire(55000);
  await failure;
  assert.equal(request.signal.aborted, true);
  assert.equal(clock.timers.size, 0);
  assert.doesNotMatch(JSON.stringify(diagnostics), /private|mock-session-token|http/);
});
test('request timers stay alive through response parsing and are released on invalid JSON', async () => {
  const clock = clockFixture(), body = deferred();
  const api = apiFixture({ ...clock, fetch: async () => ({ ok: true, json: () => body.promise }) });
  const work = api.assistantApi('/capabilities');
  const failure = assert.rejects(work, error => error.code === 'INVALID_RESPONSE');
  await tick();
  assert.equal(clock.timers.size, 1);
  assert.equal(clock.scheduled.at(-1).delay, 35000);
  body.reject(new Error('private response body'));
  await failure;
  assert.equal(clock.timers.size, 0);
});
test('the transcribed request reaches the existing intelligent interpretation route', async () => {
  const model = load('../../lib/api-zod/src/booking-assistant.ts', { zod: require('zod') });
  let interpreted, interpretation;
  const request = { ...model.emptyBookingRequest(), serviceQuery: 'peluquería', placeQuery: 'Cieza' };
  const f = nativeVoiceFixture({ onText: text => {
    // This uses the same public interpreter as GO, with only the server mocked.
    const actual = apiFixture({model, fetch: async (url, init) => {
      assert.ok(url.endsWith('/interpret'));
      interpreted = JSON.parse(init.body);
      assert.equal(init.headers.get('Authorization'), 'Bearer mock-session-token');
      return { ok: true, json: async () => ({ request }) };
    } });
    interpretation = actual.interpretRequest(text, model.emptyBookingRequest(), null, true);
  } });
  await f.render().start(); await f.render().stop();
  const result = await interpretation;
  assert.equal(interpreted.text, f.received[0].text);
  assert.equal(result.serviceQuery, 'peluquería'); assert.equal(result.placeQuery, 'Cieza');
  assert.equal(f.received.length, 1);
  f.unmount();
});

test('a timeout while reading the response is classified as a timeout, without leaking its body', async () => {
  const clock = clockFixture();
  const api = apiFixture({ ...clock, fetch: async (_url, init) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('private response detail')));
    }),
  }) });
  const work = api.assistantApi('/transcribe', { audio: 'mock', mime: 'audio/m4a' });
  const failure = assert.rejects(work, error => {
    assert.equal(error.code, 'REQUEST_TIMEOUT');
    assert.doesNotMatch(error.message, /private/); return true;
  });
  await tick();
  clock.fire(55000);
  await failure;
  assert.equal(clock.timers.size, 0);
});
