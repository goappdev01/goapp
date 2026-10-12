import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import path from "node:path";
const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");
const plain = (x) => JSON.parse(JSON.stringify(x));
function load(file, modules, globals = {}) {
  const context = {
    exports: {},
    console,
    Date,
    Error,
    Headers,
    AbortSignal,
    process: { env: {} },
    setTimeout,
    clearTimeout,
    ...globals,
    require(name) {
      if (name in modules) return modules[name];
      throw new Error("Unexpected import " + name);
    },
  };
  vm.runInNewContext(
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    context,
  );
  return context.exports;
}
const model = load("../../lib/api-zod/src/booking-assistant.ts", {
  zod: require("zod"),
});
test("spoken booking extracts service, city, radius, tomorrow and afternoon together", () => {
  const result = model.parseBookingRequest(
    "Quiero una peluquería en Cieza mañana por la tarde a menos de 3 kilómetros.",
    model.emptyBookingRequest(),
    "2026-10-07",
  );
  assert.deepEqual(plain(result), {
    ...plain(model.emptyBookingRequest()),
    serviceQuery: "peluquería",
    placeQuery: "Cieza",
    radiusKm: 3,
    date: "2026-10-08",
    timeFrom: "16:00",
    timeTo: "21:00",
  });
});
test("follow-ups preserve known fields and support metres, exact times and named staff", () => {
  const previous = {
    ...model.emptyBookingRequest(),
    serviceQuery: "corte",
    placeQuery: "Cieza",
    date: "2026-10-08",
    radiusKm: 5,
  };
  const result = model.parseBookingRequest(
    "a las 17:30 con Isa a menos de 500 m",
    previous,
    "2026-10-07",
  );
  assert.equal(result.date, previous.date);
  assert.equal(result.radiusKm, 0.5);
  assert.equal(result.timeFrom, "17:30");
  assert.equal(result.staffQuery, "Isa");
  assert.equal(
    model.parseBookingRequest(
      "Cieza mañana por la mañana",
      model.emptyBookingRequest(),
      "2026-10-07",
      "placeQuery",
    ).date,
    "2026-10-08",
  );
  assert.equal(
    model.parseBookingRequest(
      "en Molina de Segura el jueves",
      previous,
      "2026-10-07",
    ).placeQuery,
    "Molina de Segura",
  );
  assert.equal(
    model.parseBookingRequest("a menos de 3,5 km", previous, "2026-10-07")
      .radiusKm,
    3.5,
  );
});
test("invalid dates do not destroy other extracted fields; no confirmation invents a request", () => {
  const result = model.parseBookingRequest(
    "Quiero una peluquería en Cieza el 31/02/2027",
    model.emptyBookingRequest(),
    "2026-10-07",
  );
  assert.equal(result.date, null);
  assert.equal(result.serviceQuery, "peluquería");
  assert.deepEqual(
    plain(
      model.parseBookingRequest(
        "sí",
        model.emptyBookingRequest(),
        "2026-10-07",
      ),
    ),
    plain(model.emptyBookingRequest()),
  );
});
test("ergonomic dock has exactly five unique actions and the requested microphone position", () => {
  for (const [position, index] of [
    ["left", 0],
    ["center", 2],
    ["right", 4],
  ]) {
    const order = model.bookingDockOrder(position);
    assert.equal(order.length, 5);
    assert.equal(new Set(order).size, 5);
    assert.equal(order[index], "go");
    assert.ok(!order.includes("more"));
  }
  assert.equal(
    model.distanceKm(
      { latitude: 38, longitude: -1 },
      { latitude: 38, longitude: -1 },
    ),
    0,
  );
});
const uuid = (i) =>
  String(i).repeat(8) +
  "-" +
  String(i).repeat(4) +
  "-4" +
  String(i).repeat(3) +
  "-8" +
  String(i).repeat(3) +
  "-" +
  String(i).repeat(12);
function serviceFixture() {
  let writes = 0;
  let synced = 0;
  let currentPrice = 25;
  let conflict = false;
  const calls = [];
  const business = {
    id: uuid(1),
    name: "Salón Cieza",
    category: "peluquería",
    location: "Cieza",
    bookingActive: true,
  };
  const service = {
    id: uuid(2),
    businessId: business.id,
    title: "Corte",
    type: "peluquería",
    active: true,
    visible: true,
    price: 25,
    priceKnown: true,
    currency: "EUR",
    durationMinutes: 30,
  };
  const slot = {
    startDatetime: "2035-10-08T17:00:00",
    endDatetime: "2035-10-08T17:30:00",
  };
  const booking = {
    id: uuid(3),
    customerId: uuid(4),
    businessId: business.id,
    bookableItemId: service.id,
    ...slot,
    status: "CONFIRMED",
  };
  const bookingApi = {
    getActivebusinesses: async () => [business],
    getBookableItems: async () => [{ ...service, price: currentPrice }],
    getStaff: async () => [],
    getAvailableSlots: async () => [slot],
    getAuthenticatedUserId: async () => uuid(4),
    getLiveCustomerBookings: async () => [booking],
    isCloudId: (id) => /^[0-9a-f-]{36}$/.test(id),
    claimSlot: async (candidate) => {
      writes++;
      calls.push(candidate);
      return conflict ? { ok: false } : { ok: true, booking };
    },
    cancelBooking: async () => {},
  };
  const api = load(
    "lib/bookingAssistant.ts",
    {
      "react-native": { Platform: { OS: "web" } },
      "@workspace/api-zod": model,
      "@/data/booking": bookingApi,
      "./goLogBridge": {
        syncBookingToGoLog: async () => {
          synced++;
        },
      },
      "@/data/goSearchAliases": {
        normalize: model.normalizeBookingText,
        expandSearchTerms: (text) => [model.normalizeBookingText(text)],
      },
      "@react-native-async-storage/async-storage": {
        default: { getItem: async () => null, setItem: async () => {} },
      },
    },
    {
      fetch: async (url) => {
        calls.push(url);
        return Response.json([
          { label: "Cieza", latitude: 38.24, longitude: -1.41 },
        ]);
      },
    },
  );
  return {
    api,
    business,
    service,
    slot,
    option: { business, service, slot },
    calls,
    get writes() {
      return writes;
    },
    get synced() {
      return synced;
    },
    price: (value) => {
      currentPrice = value;
    },
    conflict: () => {
      conflict = true;
    },
  };
}
test("open discovery applies radius; a named GO business overrides it without geocoding", async () => {
  const f = serviceFixture();
  const request = {
    ...model.emptyBookingRequest(),
    serviceQuery: "peluquería",
  };
  const zone = {
    label: "Alicante",
    latitude: 38.35,
    longitude: -0.48,
    radiusKm: 5,
    source: "manual",
  };
  assert.equal(
    (await f.api.findAssistantBusinesses(request, zone)).results.length,
    0,
  );
  const before = f.calls.length;
  const explicit = await f.api.findAssistantBusinesses(
    { ...request, businessQuery: "Salón Cieza" },
    zone,
  );
  assert.equal(explicit.results.length, 1);
  assert.equal(explicit.results[0].explicit, true);
  assert.equal(f.calls.length, before);
  assert.equal(f.writes, 0);
});
test("confirmation requires explicit consent, real IDs and unchanged live service data", async () => {
  const f = serviceFixture();
  await assert.rejects(f.api.confirmAssistantOption(f.option, false));
  assert.equal(f.writes, 0);
  await assert.rejects(
    f.api.confirmAssistantOption(
      { ...f.option, business: { ...f.business, id: "demo_business" } },
      true,
    ),
  );
  assert.equal(f.writes, 0);
  f.price(30);
  await assert.rejects(f.api.confirmAssistantOption(f.option, true));
  assert.equal(f.writes, 0);
  f.price(25);
  const result = await f.api.confirmAssistantOption(f.option, true);
  assert.equal(result.id, uuid(3));
  assert.equal(f.writes, 1);
  assert.equal(f.synced, 1);
  assert.equal(
    f.calls.find((call) => typeof call !== "string").customerId,
    "me",
  );
});
test("backend slot conflict cannot become a successful booking or calendar entry", async () => {
  const f = serviceFixture();
  f.conflict();
  await assert.rejects(f.api.confirmAssistantOption(f.option, true), /horario/);
  assert.equal(f.synced, 0);
});
function hookFixture(file, modules, globals = {}) {
  const values = [];
  let cursor = 0;
  const hooks = {
    useRef(value) {
      const index = cursor++;
      if (!(index in values)) values[index] = { current: value };
      return values[index];
    },
    useState(value) {
      const index = cursor++;
      if (!(index in values))
        values[index] = typeof value === "function" ? value() : value;
      return [
        values[index],
        (value) => {
          values[index] =
            typeof value === "function" ? value(values[index]) : value;
        },
      ];
    },
    useEffect() {},
    useCallback: (fn) => fn,
  };
  const module = load(file, { react: hooks, ...modules }, globals);
  return (...args) => {
    cursor = 0;
    return Object.values(module).find((value) => typeof value === "function")(
      ...args,
    );
  };
}
test("conversation asks only for missing date, keeps Zone and writes only after reviewing", async () => {
  const f = serviceFixture();
  const serviceApi = {
    ...f.api,
    findAssistantBusinesses: async () => ({
      results: [{ business: f.business }],
      unresolved: 0,
      needsZone: false,
    }),
    servicesForBusiness: async () => [f.service],
    staffForService: async () => [],
    slotsForRequest: async () => [f.slot],
  };
  const render = hookFixture("hooks/useBookingAssistant.ts", {
    "@workspace/api-zod": model,
    "@/data/booking": {},
    "@/lib/bookingAssistant": serviceApi,
    "expo-location": {},
    "@react-native-async-storage/async-storage": {
      default: { setItem: async () => {} },
    },
  });
  let a = render();
  a.updateZone({
    label: "Cieza",
    latitude: 38.24,
    longitude: -1.41,
    radiusKm: 3,
    source: "manual",
  });
  await a.send("Quiero una peluquería", false);
  a = render();
  assert.equal(a.messages.at(-1).text, "¿Para qué día quieres reservar?");
  assert.equal(f.writes, 0);
  await a.send("mañana por la tarde", false);
  a = render();
  assert.equal(a.phase, "slots");
  assert.equal(a.slots.length, 1);
  a.setOption(a.slots[0]);
  a.setPhase("review");
  a = render();
  await a.send("sí", false);
  assert.equal(f.writes, 0);
  await a.confirm();
  a = render();
  assert.equal(a.phase, "confirmed");
  assert.equal(f.writes, 1);
  a.reset();
  a = render();
  assert.equal(a.created, null);
  assert.equal(a.zone.radiusKm, 3);
  assert.equal(f.writes, 1);
});
test("web microphone starts, shows progressive text and sends once on second touch", async () => {
  let recognition;
  const received = [];
  class Recognizer {
    constructor() {
      recognition = this;
    }
    start() {
      this.onstart();
    }
    stop() {
      this.onend();
    }
    abort() {}
  }
  const render = hookFixture(
    "hooks/useBookingVoice.ts",
    {
      "react-native": {
        Platform: { OS: "web" },
        AppState: {
          addEventListener() {
            return { remove() {} };
          },
        },
      },
      "expo-audio": {
        useAudioRecorder: () => ({}),
        RecordingPresets: { HIGH_QUALITY: {} },
      },
      "expo-file-system/legacy": {},
      "@/lib/bookingAssistant": {},
      "@/data/booking": {},
    },
    { SpeechRecognition: Recognizer },
  );
  let voice = render((text, zone) => received.push({ text, zone }));
  await voice.start();
  voice = render((text, zone) => received.push({ text, zone }));
  assert.equal(voice.status, "listening");
  recognition.onresult({
    results: [{ isFinal: false, 0: { transcript: "Quiero una peluquería" } }],
  });
  voice = render((text, zone) => received.push({ text, zone }));
  assert.equal(voice.transcript, "Quiero una peluquería");
  await voice.toggle();
  voice = render(() => {});
  assert.equal(voice.status, "idle");
  assert.deepEqual(received, [{ text: "Quiero una peluquería", zone: false }]);
});

function nativeVoiceFixture({
  denied = false,
  serverError = false, delayedPermission = false,
  recordingError = false, inactiveRecorder = false, transcriptionError = false,
  transcriptionDisabled = false, noSession = false, emptyAudio = false,
} = {}) {
  const received = [];
  const deleted = [];
  const uploaded = [];
  const apiCalls = [];
  let recorderStatus;
  let grant;
  const permission = delayedPermission
    ? new Promise((resolve) => {
        grant = resolve;
      })
    : Promise.resolve({ granted: !denied });
  const recorder = {
    isRecording: false,
    uri: null,
    starts: 0,
    stops: 0,
    async prepareToRecordAsync() {
      this.uri = "file://voice-" + (this.starts + 1) + ".m4a";
    },
    getStatus() { return { isRecording: this.isRecording }; },
    record() {
      if (recordingError) throw new Error("EXPO_PUBLIC_API_URL https://private.test token=secret");
      this.isRecording = !inactiveRecorder;
      this.starts++;
    },
    async stop() {
      this.isRecording = false;
      this.stops++;
      this.isRecording = false;
    },
  };
  const renderHook = hookFixture("hooks/useBookingVoice.ts", {
    "react-native": {
      Platform: { OS: "ios" },
      AppState: {
        addEventListener() {
          return { remove() {} };
        },
      },
    },
    "expo-audio": {
      useAudioRecorder: (_options, listener) => { recorderStatus = listener; return recorder; },
      RecordingPresets: { HIGH_QUALITY: {} },
      setAudioModeAsync: async () => {},
      AudioModule: { requestRecordingPermissionsAsync: () => permission },
    },
    "expo-file-system/legacy": {
      getInfoAsync: async () => ({ exists: true, size: emptyAudio ? 0 : 200 }),
      readAsStringAsync: async (uri) => "audio:" + uri,
      EncodingType: { Base64: "base64" },
      deleteAsync: async (uri) => {
        deleted.push(uri);
      },
    },
    "@/lib/bookingAssistant": {
      assistantApi: async (path, body) => {
        apiCalls.push(path);
        if (path === "/capabilities") {
          if (serverError) throw new Error("No se pudo conectar con GO.");
          return { transcription: !transcriptionDisabled };
        }
        if (transcriptionError) throw new Error("https://private.test/transcribe token=secret");
        uploaded.push(body);
        return { text: "Cieza mañana" };
      },
    },
    "@/data/booking": { getAuthenticatedUserId: async () => noSession ? null : uuid(4) },
  });
  return {
    recorder,
    received,
    uploaded,
    apiCalls,
    interrupt: (url = recorder.uri) => recorderStatus({ hasError: true, isFinished: true, url, error: "private technical error" }),
    deleted,
    grant: () => grant({ granted: true }),
    render: () => renderHook((text, zone) => received.push({ text, zone })),
  };
}
test("native microphone denial is honest and cancellation during permission cannot start recording", async () => {
  const denied = nativeVoiceFixture({ denied: true });
  await denied.render().start();
  assert.equal(denied.recorder.starts, 0);
  assert.equal(denied.render().status, "idle");
  assert.match(denied.render().error, /micrófono/);
  const delayed = nativeVoiceFixture({ delayedPermission: true });
  const starting = delayed.render().start();
  await new Promise((resolve) => setImmediate(resolve));
  delayed.render().abort();
  delayed.grant();
  await starting;
  assert.equal(delayed.recorder.starts, 0);
  assert.equal(delayed.received.length, 0);
});
test("native tap-stop transcribes once and removes the stopped recording", async () => {
  const f = nativeVoiceFixture();
  await f.render().start(true);
  assert.equal(f.render().status, "listening");
  await Promise.all([f.render().stop(), f.render().stop()]);
  assert.equal(f.recorder.stops, 1);
  assert.equal(f.uploaded.length, 1);
  assert.deepEqual(f.received, [{ text: "Cieza mañana", zone: true }]);
  assert.ok(f.deleted.includes("file://voice-1.m4a"));
  assert.equal(f.render().status, "idle");
});
test("web late events after abort cannot send or change a new listening session", async () => {
  const recognitions = [];
  const received = [];
  class Recognizer {
    constructor() {
      recognitions.push(this);
    }
    start() {
      this.onstart();
    }
    stop() {
      this.onend();
    }
    abort() {}
  }
  const render = hookFixture(
    "hooks/useBookingVoice.ts",
    {
      "react-native": { Platform: { OS: "web" }, AppState: {} },
      "expo-audio": {
        useAudioRecorder: () => ({}),
        RecordingPresets: { HIGH_QUALITY: {} },
      },
      "expo-file-system/legacy": {},
      "@/lib/bookingAssistant": {},
      "@/data/booking": {},
    },
    { SpeechRecognition: Recognizer },
  );
  const current = () => render((text) => received.push(text));
  await current().start();
  const lateResult = recognitions[0].onresult;
  const lateEnd = recognitions[0].onend;
  current().abort();
  await current().start();
  lateResult({ results: [{ 0: { transcript: "viejo" } }] });
  lateEnd();
  assert.equal(current().status, "listening");
  assert.deepEqual(received, []);
  recognitions[1].onresult({ results: [{ 0: { transcript: "nuevo" } }] });
  const end = recognitions[1].onend;
  await current().stop();
  end();
  assert.deepEqual(received, ["nuevo"]);
});

test("microphone permission denial is distinguished from an unavailable native voice backend", async () => {
  const denied = nativeVoiceFixture({ denied: true, serverError: true });
  await denied.render().start(); assert.match(denied.render().error, /micrófono/);
  const offline = nativeVoiceFixture({ serverError: true });
  await offline.render().start(); assert.equal(offline.render().status, "listening");
  assert.equal(offline.recorder.starts, 1); assert.equal(offline.apiCalls.length, 0);
  await offline.render().stop(); assert.match(offline.render().error, /grabado.*procesarla/);
  assert.equal(offline.received.length, 0); assert.equal(offline.uploaded.length, 0);
});
test("native capture starts without a backend or session, then fails honestly when transcription is unavailable", async () => {
  for (const options of [{ transcriptionDisabled: true }, { noSession: true }]) {
    const f = nativeVoiceFixture(options); await f.render().start();
    assert.equal(f.recorder.isRecording, true); assert.equal(f.render().status, "listening");
    assert.deepEqual(f.apiCalls, []);
    await f.render().stop(); assert.equal(f.render().status, "idle");
    assert.equal(f.recorder.isRecording, false); assert.equal(f.received.length, 0);
    assert.equal(f.uploaded.length, 0); assert.ok(f.render().error.length > 0);
    assert.ok(f.deleted.includes("file://voice-1.m4a"));
  }
});
test("failed or inactive native recorder cannot claim to be listening or expose technical errors", async () => {
  for (const options of [{ recordingError: true }, { inactiveRecorder: true }]) {
    const f = nativeVoiceFixture(options); await f.render().start();
    assert.equal(f.render().status, "idle"); assert.match(f.render().error, /iniciar la grabación/);
    assert.doesNotMatch(f.render().error, /EXPO_|https?:|secret/); assert.equal(f.apiCalls.length, 0);
  }
});
test("empty audio and failed transcription never dispatch invented conversation text", async () => {
  for (const options of [{ emptyAudio: true }, { transcriptionError: true }]) {
    const f = nativeVoiceFixture(options); await f.render().start(); await f.render().stop();
    assert.equal(f.render().status, "idle"); assert.equal(f.received.length, 0);
    assert.doesNotMatch(f.render().error, /EXPO_|https?:|secret/); assert.ok(f.render().error);
    assert.equal(f.deleted.length, 1);
  }
});
test("native recorder interruption stops the listening indicator and reports a clean error", async () => {
  const f = nativeVoiceFixture(); await f.render().start(); f.interrupt();
  await new Promise(setImmediate);
  assert.equal(f.render().status, "idle"); assert.match(f.render().error, /interrumpido/);
  assert.equal(f.received.length, 0); assert.equal(f.apiCalls.length, 0);
});
test("a late recorder event from an older file cannot cancel a new capture", async () => {
  const f = nativeVoiceFixture(); await f.render().start(); await f.render().stop();
  await f.render().start(); f.interrupt("file://voice-1.m4a");
  assert.equal(f.render().status, "listening"); assert.equal(f.recorder.isRecording, true);
  f.render().abort(); await new Promise(setImmediate);
});