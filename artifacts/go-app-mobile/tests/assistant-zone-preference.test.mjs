import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url), ts = require("typescript");
function load(file, modules, globals = {}) {
  const context = { exports: {}, console, Date, Error, setTimeout, clearTimeout, ...globals,
    require(name) { if (name in modules) return modules[name]; throw Error("Unexpected " + name); } };
  vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { esModuleInterop: false, alwaysStrict: false, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context.exports;
}
const model = load("../../lib/api-zod/src/booking-assistant.ts", { zod: require("zod") });
const cieza = { label: "Cieza, Murcia", latitude: 38.24, longitude: -1.41, source: "manual" };
const madrid = { label: "Madrid", latitude: 40.41, longitude: -3.70, source: "manual" };
const owner = { userId: "one", context: "demo:USER" };
const flush = async () => { await new Promise(setImmediate); };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
function preferenceModule(storage) { return load("lib/assistantZonePreference.ts", {
  "@workspace/api-zod": model, "@react-native-async-storage/async-storage": { default: storage },
}); }
function disk() {
  const values = new Map(), writes = [];
  return { values, writes, storage: { getItem: async key => values.get(key) ?? null,
    setItem: async (key,value) => { writes.push({ key, value }); values.set(key,value); } } };
}
function hooks() {
  const values=[], effects=[]; let cursor=0;
  return { api: {
    useState(value) { const i=cursor++; if (!(i in values)) values[i]=typeof value === "function" ? value() : value;
      return [values[i], next => { values[i]=typeof next === "function" ? next(values[i]) : next; }]; },
    useRef(value) { const i=cursor++; return values[i] ??= { current: value }; },
    useEffect(fn,deps) { const i=cursor++, old=values[i];
      if (!old || deps.some((d,k) => !Object.is(d,old.deps[k]))) {
        old?.cleanup?.(); const record={deps}; values[i]=record; effects.push(() => { record.cleanup=fn(); });
      } },
  }, begin() { cursor=0; }, effects() { effects.splice(0).forEach(fn => fn()); },
  unmount() { values.forEach(value => value?.cleanup?.()); } };
}
function assistant(preferences, scope=owner, options={}) {
  const h=hooks(); let visible=true, current=scope, ready=true, user=scope?.userId;
  const api=load("hooks/useBookingAssistant.ts", {
    react: h.api, "@workspace/api-zod": model, "@/lib/assistantZonePreference": preferences,
    "@/data/booking": { getAuthenticatedUserId: () => options.getUser ? options.getUser() : Promise.resolve(user) },
    "@/lib/bookingAssistant": { resolvePlaces: async () => { throw Error("unexpected lookup"); }, ...options.services },
    "expo-location": options.location || {},
  });
  const fixture={ render() { h.begin(); const value=api.useBookingAssistant({ visible, scope:current, scopeReady:ready }); h.effects(); return value; },
    async ready() { this.render(); await flush(); return this.render(); },
    visibility(next) { visible=next; return this.render(); },
    account(next) { current=next; user=next?.userId; return this.render(); },
    scopeReady(next) { ready=next; return this.render(); },
    setUser(next) { user=next; }, unmount: () => h.unmount(),
  };
  fixture.render(); return fixture;
}
async function remember(f, place=cieza, radius="5") {
  const a=f.render(); a.pickPlace(place, place.source); a.setRadiusText(radius);
  await f.render().rememberZone(); return f.render();
}
function saved(api,d,scope=owner) { return JSON.parse(d.values.get(api.assistantZoneKey(scope))); }

test("remember persists immediately without applying and survives close, route change and a fresh JS runtime", async () => {
  const d=disk(); let api=preferenceModule(d.storage), f=assistant(api); await f.ready();
  let a=await remember(f,cieza,"3,5");
  assert.equal(a.zone,null); assert.equal(a.saveZone,true); assert.equal(a.habitualZone.zone.radiusKm,3.5);
  f.visibility(false); f.visibility(true); a=await f.ready(); a.openZonePanel(); a=f.render();
  assert.equal(a.placeText,cieza.label); assert.equal(a.radiusText,"3.5"); assert.equal(a.saveZone,true);
  a.setPanel("actions"); f.render().openZonePanel(); assert.equal(f.render().saveZone,true);
  f.unmount(); api=preferenceModule(d.storage); f=assistant(api); a=await f.ready(); a.openZonePanel(); a=f.render();
  assert.equal(a.habitualZone.zone.latitude,cieza.latitude); assert.equal(a.zone.radiusKm,3.5);
  assert.equal(a.radiusText,"3.5"); assert.equal(a.saveZone,true); assert.equal(d.writes.length,1);
  f.unmount();
});

test("all preset distances and a custom distance are preserved exactly", async () => {
  for (const radius of [0.5,1,2,5,10,25,7.75]) {
    const d=disk(), api=preferenceModule(d.storage), f=assistant(api); await f.ready();
    await remember(f,cieza,String(radius)); f.unmount();
    const next=assistant(preferenceModule(d.storage)); const a=await next.ready(); a.openZonePanel();
    assert.equal(next.render().radiusText,String(radius)); assert.equal(next.render().saveZone,true); next.unmount();
  }
});

test("a one-off applied zone and radius never overwrite the habitual preference", async () => {
  const d=disk(), api=preferenceModule(d.storage), f=assistant(api); await f.ready(); await remember(f,cieza,"0.5");
  f.render().pickPlace(madrid); f.render().setRadiusText("25"); const a=f.render();
  assert.equal(a.saveZone,false); await a.chooseZone(a.pendingPlace,a.pendingPlace.source);
  assert.equal(f.render().zone.label,madrid.label); assert.equal(f.render().zone.radiusKm,25);
  assert.equal(f.render().habitualZone.zone.label,cieza.label); assert.equal(saved(api,d).preference.zone.radiusKm,0.5);
  f.render().openZonePanel(); const reopened=f.render();
  assert.equal(reopened.pendingPlace.label,cieza.label); assert.equal(reopened.radiusText,"0.5");
  assert.equal(reopened.zone.label,madrid.label); assert.equal(reopened.saveZone,true); assert.equal(d.writes.length,1); f.unmount();
});

test("a different habitual zone replaces only this preference after an explicit remember", async () => {
  const d=disk(), api=preferenceModule(d.storage), f=assistant(api); await f.ready(); await remember(f);
  const a=f.render(); await a.chooseZone(a.pendingPlace,a.pendingPlace.source);
  await remember(f,madrid,"10"); assert.equal(f.render().zone.label,cieza.label);
  assert.equal(saved(api,d).preference.zone.label,madrid.label); assert.equal(d.writes.length,2);
  f.unmount(); const next=assistant(preferenceModule(d.storage)); await next.ready(); next.render().openZonePanel();
  assert.equal(next.render().zone.label,madrid.label); assert.equal(next.render().radiusText,"10"); next.unmount();
});

test("current location remembers a modality and radius, with no coordinates or background GPS on reload", async () => {
  const d=disk(), api=preferenceModule(d.storage), f=assistant(api); await f.ready();
  await remember(f,{...cieza,source:"gps"},"2"); const value=saved(api,d).preference;
  assert.equal(value.mode,"current-location"); assert.equal(value.radiusKm,2);
  assert.equal(value.zone,undefined); assert.doesNotMatch(JSON.stringify(value),/latitude|longitude|Cieza/); f.unmount();
  let calls=0;
  const next=assistant(preferenceModule(d.storage),owner,{ location: {
    getForegroundPermissionsAsync: async () => { calls++; return {granted:true}; },
    getLastKnownPositionAsync: async () => ({coords:madrid}), reverseGeocodeAsync: async () => [{city:"Madrid"}],
  } });
  await next.ready(); next.render().openZonePanel(); let a=next.render();
  assert.equal(calls,0); assert.equal(a.zone,null); assert.equal(a.pendingPlace,null);
  assert.equal(a.radiusText,"2"); assert.equal(a.saveZone,true);
  const gps=await a.gpsZone(true); assert.equal(calls,1); assert.equal(gps.radiusKm,2); a.pickPlace(gps,"gps");
  a=next.render(); await a.chooseZone(a.pendingPlace,a.pendingPlace.source);
  assert.equal(next.render().zone.longitude,madrid.longitude); assert.equal(d.writes.length,1); next.unmount();
});

test("DEMO accounts, live context and distinct business contexts remain isolated", async () => {
  const d=disk(), api=preferenceModule(d.storage), f=assistant(api); await f.ready(); await remember(f);
  const contexts=[{...owner,userId:"two"},{...owner,context:"live:USER"},{...owner,context:"demo:BUSINESS:a"},{...owner,context:"demo:BUSINESS:b"}];
  for (const scope of contexts) {
    const switching=f.account(scope); assert.equal(switching.zone,null); assert.equal(switching.habitualZone,null);
    await f.ready(); assert.equal(f.render().pendingPlace,null); await remember(f,madrid,"25");
  }
  f.account(owner); await f.ready(); f.render().openZonePanel();
  assert.equal(f.render().placeText,cieza.label); assert.equal(f.render().radiusText,"5"); assert.equal(d.values.size,5); f.unmount();
});

test("ownerless legacy storage is retained and never silently adopted by any account", async () => {
  const d=disk(), api=preferenceModule(d.storage), raw=JSON.stringify({...cieza,radiusKm:10});
  d.values.set(api.ASSISTANT_ZONE_KEY,raw);
  for (const scope of [owner,{...owner,userId:"two"}]) { const f=assistant(api,scope); await f.ready(); assert.equal(f.render().habitualZone,null); assert.equal(f.render().zone,null); f.unmount(); }
  assert.equal(d.values.get(api.ASSISTANT_ZONE_KEY),raw); assert.equal(d.writes.length,0);
});

test("failed writes show no saved state and a retry remains possible", async () => {
  const d=disk(), original=d.storage.setItem; let fail=true;
  d.storage.setItem=async (...args) => { if(fail) throw Error("private-storage-error"); return original(...args); };
  const api=preferenceModule(d.storage), f=assistant(api); await f.ready(); let a=await remember(f);
  assert.equal(a.habitualZone,null); assert.equal(a.saveZone,false); assert.match(a.notice,/No he podido guardar/);
  assert.doesNotMatch(a.notice,/private-storage-error/); fail=false; await f.render().rememberZone();
  assert.equal(f.render().saveZone,true); assert.equal(d.writes.length,1); f.unmount();
});

test("saving followed by immediate close and reopen waits for storage acknowledgement without a duplicate write", async () => {
  const d=disk(), gate=deferred(), original=d.storage.setItem;
  d.storage.setItem=async (...args) => { await gate.promise; return original(...args); };
  const api=preferenceModule(d.storage), f=assistant(api); await f.ready();
  f.render().pickPlace(cieza); const pending=f.render().rememberZone(); await f.render().rememberZone();
  assert.equal(f.render().saveZone,false); f.visibility(false); f.visibility(true); await flush();
  gate.resolve(); await pending; await f.ready(); f.render().openZonePanel();
  assert.equal(f.render().saveZone,true); assert.equal(d.writes.length,1); f.unmount();
});

test("an explicit save continues after leaving the route and can be recovered by another mounted screen", async () => {
  const d=disk(), gate=deferred(), original=d.storage.setItem;
  d.storage.setItem=async (...args) => { await gate.promise; return original(...args); };
  const api=preferenceModule(d.storage), f=assistant(api); await f.ready(); f.render().pickPlace(cieza);
  const pending=f.render().rememberZone(); await flush(); f.unmount(); gate.resolve(); await pending;
  const next=assistant(api); await next.ready(); assert.equal(next.render().habitualZone.zone.label,cieza.label); next.unmount();
});

test("a late hydration from a previous account cannot expose its preference", async () => {
  const d=disk(), api=preferenceModule(d.storage);
  await api.writeAssistantZonePreference(owner,{mode:"fixed",zone:{...cieza,radiusKm:5}},async()=>true);
  const raw=d.values.get(api.assistantZoneKey(owner)), gate=deferred(), original=d.storage.getItem;
  d.storage.getItem=key => key===api.assistantZoneKey(owner) ? gate.promise : original(key);
  const f=assistant(api); await flush(); f.account({...owner,userId:"two"}); await f.ready();
  gate.resolve(raw); await flush(); assert.equal(f.render().habitualZone,null); assert.equal(f.render().zone,null); f.unmount();
});

test("an account change while saving cannot write or publish the old selection for the new user", async () => {
  const d=disk(), api=preferenceModule(d.storage), identity=deferred(), f=assistant(api,owner,{getUser:()=>identity.promise});
  await f.ready(); f.render().pickPlace(cieza); const pending=f.render().rememberZone(); await flush();
  f.account({...owner,userId:"two"}); identity.resolve("two"); await pending; await f.ready();
  assert.equal(d.writes.length,0); assert.equal(f.render().habitualZone,null); assert.equal(f.render().saveZone,false); f.unmount();
});

test("invalid or foreign stored records remain untouched and cannot produce a saved checkmark", async () => {
  for(const raw of ["broken-json",JSON.stringify({version:2,...owner,userId:"other",preference:{mode:"fixed",zone:{...cieza,radiusKm:5}}})]) {
    const d=disk(), api=preferenceModule(d.storage); d.values.set(api.assistantZoneKey(owner),raw);
    const f=assistant(api); await f.ready(); assert.equal(f.render().habitualZone,null); assert.equal(f.render().saveZone,false);
    assert.equal(f.render().zoneLoading,false); assert.equal(d.values.get(api.assistantZoneKey(owner)),raw);
    assert.equal(d.writes.length,0); f.unmount();
  }
});

test("invalid distances, no selected address and an anonymous session cannot save a preference", async () => {
  const d=disk(), api=preferenceModule(d.storage), f=assistant(api); await f.ready();
  await f.render().rememberZone(); assert.equal(d.writes.length,0);
  for(const radius of ["0","-1","nada","Infinity"]) { await remember(f,cieza,radius); assert.equal(f.render().saveZone,false); }
  f.account(null); await f.ready(); await remember(f); assert.match(f.render().notice,/Inicia sesión/); assert.equal(d.writes.length,0); f.unmount();
});

test("scope detection uses local identity and existing DEMO presentation, discarding late session reads", async () => {
  const h=hooks(), listeners=new Set(), requests=[];
  const view={loaded:true,isOwner:true,isAdminView:false,view:"USER"}, admin={checking:false}, demo={loaded:true,demo:{businessId:"a"}};
  const api=load("hooks/useAssistantZoneScope.ts", {
    react:h.api,"@/data/booking":{getAuthenticatedUserId:()=>{const p=deferred();requests.push(p);return p.promise;}},
    "@/lib/sessionEvents":{onSessionChanged:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}},
    "@/contexts/GoViewContext":{useGoView:()=>view},"@/contexts/GoAdminAccessContext":{useAdminAccess:()=>admin},
    "@/contexts/OwnerBusinessDemoContext":{useOwnerBusinessDemo:()=>demo},
  });
  const render=()=>{h.begin();const value=api.useAssistantZoneScope();h.effects();return value;};
  assert.equal(render().ready,false); [...listeners][0](); requests[1].resolve("two"); await flush();
  let value=render(); assert.equal(value.scope.userId,"two"); assert.equal(value.scope.context,"demo:USER");
  requests[0].resolve("one"); await flush(); assert.equal(render().scope.userId,"two");
  view.view="BUSINESS"; assert.equal(render().scope.context,"demo:BUSINESS:a");
  demo.demo.businessId="b"; assert.equal(render().scope.context,"demo:BUSINESS:b");
  admin.checking=true; assert.equal(render().ready,false); assert.equal(render().scope.userId,"two");
  assert.equal(render().scope.context,"demo:BUSINESS:b");
  h.unmount(); assert.equal(listeners.size,0);
});

test("temporary permission revalidation preserves a GPS selection without cancelling the active request", async () => {
  const d=disk(), api=preferenceModule(d.storage), permission=deferred();
  await api.writeAssistantZonePreference(owner,{mode:"fixed",zone:{...cieza,radiusKm:5}},async()=>true);
  const f=assistant(api,owner,{location:{getForegroundPermissionsAsync:()=>permission.promise,
    getLastKnownPositionAsync:async()=>({coords:madrid}),reverseGeocodeAsync:async()=>[{city:"Madrid"}]}});
  await f.ready(); f.render().openZonePanel(); const pending=f.render().work("Obteniendo ubicación…",async token=>{
    const gps=await f.render().gpsZone(true); f.render().check(token); f.render().pickPlace(gps,"gps");
  });
  f.scopeReady(false); permission.resolve({granted:true}); await pending;
  f.scopeReady(true); await f.ready();
  assert.equal(f.render().pendingPlace.source,"gps"); assert.equal(f.render().pendingPlace.latitude,madrid.latitude);
  assert.equal(f.render().habitualZone.zone.label,cieza.label);
  assert.equal(f.render().notice,""); f.unmount();
});


test("late hydration cannot replace a location or radius already selected by the user", async () => {
  const d=disk(), api=preferenceModule(d.storage);
  await api.writeAssistantZonePreference(owner,{mode:"fixed",zone:{...cieza,radiusKm:5}},async()=>true);
  const raw=d.values.get(api.assistantZoneKey(owner)), gate=deferred();
  d.storage.getItem=()=>gate.promise;
  const f=assistant(api); f.render().openZonePanel(); f.render().pickPlace(madrid); f.render().setRadiusText("25");
  gate.resolve(raw); await f.ready();
  assert.equal(f.render().pendingPlace.label,madrid.label); assert.equal(f.render().radiusText,"25");
  assert.equal(f.render().habitualZone.zone.label,cieza.label); assert.equal(f.render().saveZone,false); f.unmount();
});
