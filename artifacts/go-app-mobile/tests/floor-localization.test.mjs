import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
const ts=createRequire(path.join(process.cwd(),'package.json'))('typescript');
const source=name=>readFileSync(name,'utf8');
const compile=name=>ts.transpileModule(source(name),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const tx={};vm.runInNewContext(compile('i18n/translations.ts'),{exports:tx});const {translations}=tx;
const owner='11111111-1111-4111-8111-111111111111';
const storeModule={};
vm.runInNewContext(compile("data/businessDemoStore.ts"),{exports:storeModule,console,Date,Set,Map});
const turn=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
const names=Array.from({length:4},(_,i)=>'Raul '+(i+1)+' GO PRUEBA');
function dataFixture(){
 const plan={id:'demo_plan',businessId:'demo_business',updatedAt:1,elements:names.map((label,i)=>({id:'space'+i,type:'silla',label,capacity:1,x:20+i*7,y:20+i*70,width:240,height:52,status:i===0?'reservado':'disponible',reservable:true}))};
 const snapshot={config:{businessName:'GO Peluquería Prueba',sectorId:'belleza',subId:'peluqueria',plantillaItems:[{id:'staff',count:4,emoji:'',staffNames:names}],services:[],completedSteps:[0,1,2,3,4,5,6,7]},plan,reservations:[],bookings:[],entries:[],preferences:{}};
 const writes=[];const store={businessId:plan.businessId,planId:plan.id,getSnapshot:()=>snapshot,load:async()=>snapshot,
 reconcileProfessionalPlan:async()=>{storeModule.reconcileBusinessDemoProfessionalPlan(snapshot,true);return JSON.parse(JSON.stringify(snapshot.plan));},
 loadFloorPlan:async()=>JSON.parse(JSON.stringify(snapshot.plan)),loadReservations:async()=>JSON.parse(JSON.stringify(snapshot.reservations)),
 saveFloorPlan:async value=>{writes.push('floor');snapshot.plan=value;},saveReservations:async(_id,value)=>{writes.push('res');snapshot.reservations=value;},
 updateConfig:async patch=>Object.assign(snapshot.config,patch),updateEntries:async fn=>{snapshot.entries=typeof fn==='function'?fn(snapshot.entries):fn;},
 preferences:{getItem:async key=>snapshot.preferences[key]??null,setItem:async(key,value)=>snapshot.preferences[key]=value},reset:async()=>{},transformConfig:async()=>{}};
 return{store,storage:{},writes};
}
function uiFixture(data, { authorized = true } = {}) {
  const cache = new Map(), hooks = new Map(), alerts = [], calls = { liveAgenda: 0, liveFloor: 0, external: 0 };
  let current, cursor = 0, effects = [], lang = "es";
  const hook = () => { const i = cursor++; return [current, i]; };
  const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
  const React = {
    Fragment: "Fragment",
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    createContext(value) { const context = { value }; context.Provider = { context }; return context; },
    useContext: context => context.value,
    useSyncExternalStore(_subscribe,getSnapshot) { return getSnapshot(); },
    useState(initial) { const [slots,i] = hook(); slots[i] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, next => { slots[i].value = typeof next === "function" ? next(slots[i].value) : next; }]; },
    useRef(initial) { return React.useState(() => ({ current: initial }))[0]; },
    useMemo(fn,deps) { const [slots,i] = hook(); if (!slots[i] || !same(slots[i].deps,deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useCallback(fn,deps) { return React.useMemo(() => fn,deps); },
    useEffect(fn,deps) { const [slots,i] = hook(), old = slots[i]; if (!old || !same(old.deps,deps)) {
      slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
    } },
  };
  class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } interpolate() { return 0; } }
  const animation = { start(fn) { fn?.({ finished: true }); }, stop() {} };
  const native = new Proxy({
    Alert: { alert: (...args) => alerts.push(args) },
    AppState: { currentState: "active" }, Keyboard: { addListener: () => ({ remove() {} }), dismiss() {} },
    StyleSheet: { create: v => v, absoluteFill: {}, absoluteFillObject: {} }, Dimensions: { get: () => ({ width: 390, height: 844 }) },
    Platform: { OS: "ios", select: options => options.ios ?? options.default },
    Animated: { Value, View: "Animated.View", timing: () => animation, sequence: () => animation, loop: () => animation },
    Easing: { in: () => 0, inOut: () => 0, quad: 0 },
    PanResponder: { create: config => ({ panHandlers: config }) },
  }, { get: (target,key) => target[key] ?? key });
  const chain = new Proxy({}, { get: () => () => chain });
  const external = () => { calls.external++; throw new Error("External service must not run"); };
  const storage = { getItem: async () => { calls.liveFloor++; throw new Error("Live key read"); },
    setItem: async () => { calls.liveFloor++; throw new Error("Live key write"); } };
  const componentMocks = new Proxy({ __esModule: true }, { get(target,key) {
    if (key in target) return target[key];
    const component = { [key]: function() {} }[key]; target[key] = component; return component;
  } });
  const configApi = () => ({ config: data.store.getSnapshot().config, loaded: true, demo: data.store,
    updateConfig: patch => data.store.updateConfig(patch), resetConfig: () => data.store.reset(),
    resetToSubActivity: (sectorId,subId) => data.store.transformConfig(config => ({ ...config, sectorId, subId })),
  });
  const imports = {
    react: { ...React, default: React }, "react-native": native,
    "@react-native-async-storage/async-storage": { default: storage },
    "@/contexts/GoViewContext": { useGoView: () => ({ isBusinessPreview: authorized, isOwner: authorized, isAdminView: false }) },
    "./GoViewContext": { useGoView: () => ({ isBusinessPreview: authorized }) },
    "./GoAdminAccessContext": { useAdminAccess: () => ({ userId: owner, isOwner: authorized, checking: false }) },
    "@/contexts/GoAdminAccessContext": { useAdminAccess: () => ({ userId: owner, isOwner: authorized, allowed: authorized }) },
    "./GoBusinessAccessContext": { useBusinessAccess: () => ({ allowed: false }) },
    "@/contexts/GoBusinessConfigContext": { useBusinessConfig: configApi },
    "@/contexts/LanguageContext": { useLanguage: () => ({ lang, locale: lang === "en" ? "en-US" : "es-ES", t: key => translations[lang][key] ?? translations.es[key] ?? key }) },
    "@/lib/sessionEvents": { onSessionChanged: () => () => {} },
    "@/data/booking": new Proxy({}, { get: () => external }),
    "@/data/businessDemoStore": { ...storeModule, createBusinessDemoStore: options => storeModule.createBusinessDemoStore({ ...options, storage: data.storage }) },
    "@/hooks/useGoLog": { useGoLog: () => { calls.liveAgenda++; return React.useState([]); } },
    "@/hooks/useVerification": { useVerification: () => ({ status: "unverified" }) },
    "@/utils/guidance": { getGuidanceConfig: () => ({ labelOpacity: () => 0 }), swipeGuideMaxOpacity: () => 0 },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }) },
    "@expo/vector-icons": { Feather: "Feather", MaterialCommunityIcons: "MaterialCommunityIcons" },
    "expo-linear-gradient": { LinearGradient: "LinearGradient" },
    "expo-haptics": { selectionAsync: async () => {}, impactAsync: async () => {}, notificationAsync: async () => {},
      NotificationFeedbackType: { Success: "success" }, ImpactFeedbackStyle: { Light: "light" } },
    "react-native-reanimated": { default: { View: "Reanimated.View" }, useSharedValue: value => React.useRef({ value }).current,
      useAnimatedStyle: fn => fn(), withTiming: value => value, withDecay: () => 0, runOnJS: fn => fn },
    "react-native-gesture-handler": { Gesture: new Proxy({}, { get: () => () => chain }), GestureDetector: "GestureDetector" },
    "expo-image": { Image: "Image" }, "expo-status-bar": { StatusBar: "StatusBar" },
    "expo-location": new Proxy({}, { get: () => external }),
    "expo-image-picker": new Proxy({}, { get: () => external }),
    "expo-document-picker": new Proxy({}, { get: () => external }),
    "expo-clipboard": new Proxy({}, { get: () => external }),
    "react-native-qrcode-svg": { default: "QRCode" },
  };
  native.Share = { share: external };
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const exports = {}; cache.set(name,exports);
    vm.runInNewContext(compile(name), { exports, console, Date, Set, Map, setTimeout: () => 1, clearTimeout() {},
      setInterval: () => 1, clearInterval() {}, require(key) {
        if (key in imports) return imports[key];
        if (key === "@/data/floorPlan") {
          const module = load("data/floorPlan.ts");
          return { ...module, loadFloorPlan: external, saveFloorPlan: external, loadReservations: external, saveReservations: external };
        }
        if (key.startsWith("@/data/")) return load(key.replace("@/","") + ".ts");
        if (key === "@/lib/time") return load("lib/time.ts");
        if (key === "@/lib/businessIcons") return { getBusinessIcon: () => ({}) };
        if (key.includes("components/") || key.startsWith("./Plano") || key.startsWith("../Draggable") || (key.startsWith("./") && key.endsWith("Screen"))) return componentMocks;
        throw new Error("Unexpected UI import " + key);
      },
    }, { filename: name });
    return exports;
  }
  const render = (component, props = {}) => {
    current = hooks.get(component) ?? []; hooks.set(component,current); cursor = 0; effects = [];
    const tree = component(props); if (tree?.type?.context) tree.type.context.value = tree.props.value;
    const run = effects; effects = []; for (const fn of run) fn(); return tree;
  };
  return { load, render, alerts, calls, configApi, setLanguage(value) { lang = value; } };
}

const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...(tree.children??[]).flatMap(nodes)];
const text=node=>typeof node==='string'?node:node?.children?.map(text).join('')??'';
const button=(tree,label)=>nodes(tree).find(n=>n.type==='TouchableOpacity'&&text(n).includes(label));
const component=(tree,name)=>nodes(tree).find(n=>n.type?.name===name);
const noEnglish=/\b(?:Free|Reserved|Occupied|Blocked|Business|Client|Split|Element|Template|Save|Next|Config)\b/;
async function setupFloor(lang='es',props={}){const data=dataFixture(),ui=uiFixture(data);ui.setLanguage(lang);const Plano=ui.load('components/booking/PlanoEmpresaScreen.tsx').PlanoEmpresaScreen;const opts={businessId:'my_business',businessName:'GO Peluquería Prueba',onClose(){},hideFAB:true,...props};ui.render(Plano,opts);await turn();return{data,ui,Plano,opts,tree:ui.render(Plano,opts)};}
test('Spanish floor controls and legend use the existing i18n system without English technical labels',async()=>{const {tree}=await setupFloor();const value=text(tree);for(const label of ['Empresa','Cliente','Dividido','+ Elemento','Plantilla','Guardar','Libre','Reservado','Ocupado','Bloqueado'])assert.ok(value.includes(label),label);assert.equal(noEnglish.test(value),false);});
test('English remains available and switching language immediately updates the existing floor',async()=>{const f=await setupFloor();f.ui.setLanguage('en');const value=text(f.ui.render(f.Plano,f.opts));for(const label of ['Business','Client','Split','Element','Template','Save','Free','Reserved','Occupied','Blocked'])assert.ok(value.includes(label),label);assert.equal(value.includes('Dividido'),false);});
test('reading an existing floor preserves all four names and their x/y positions without reseeding',async()=>{const f=await setupFloor();const items=nodes(f.tree).filter(n=>n.type?.name==='FloorElementView').map(n=>n.props.el);assert.equal(items.length,4);for(let i=0;i<4;i++){assert.equal(items[i].id,'space'+i);assert.equal(items[i].label,names[i]);assert.equal(items[i].x,20+i*7);assert.equal(items[i].y,20+i*70);}assert.deepEqual(f.data.writes,[]);assert.equal(f.ui.calls.liveFloor,0);});
test('embedded floor has no duplicate floating close; wizard owns one safe-area panel back control',async()=>{const embedded=await setupFloor();assert.equal(component(embedded.tree,'DraggableFAB'),undefined);assert.equal(component(embedded.tree,'GoCloseButton'),undefined);let back=0;const wizard=await setupFloor('es',{showBackButton:true,onClose:()=>back++});const close=component(wizard.tree,'GoCloseButton');assert.ok(close);assert.equal(close.props.level,'panel');close.props.onPress();assert.equal(back,1);assert.equal(nodes(wizard.tree).filter(n=>n.type?.name==='GoCloseButton').length,1);assert.equal(component(wizard.tree,'DraggableFAB'),undefined);});
test('element editor statuses are translated without modifying their persisted identifiers',async()=>{const f=await setupFloor();const editor=component(f.tree,'ElementEditor');const opts={...editor.props,visible:true,el:f.data.store.getSnapshot().plan.elements[0]};f.ui.render(editor.type,opts);let page=f.ui.render(editor.type,opts);assert.ok(text(page).includes('Reservado'));assert.ok(button(page,'Guardar cambios'));const status=button(page,'Reservado');status.props.onPress();page=f.ui.render(editor.type,opts);for(const label of ['Libre','Reservado','Ocupado','Bloqueado','Mantenimiento','Pendiente'])assert.ok(text(page).includes(label),label);assert.equal(noEnglish.test(text(page)),false);assert.equal(f.data.store.getSnapshot().plan.elements[0].status,'reservado');});
test('DEMO reserved space can request another date/time while a real reserved space stays blocked',async()=>{const f=await setupFloor();const sheet=component(f.tree,'ClientBookingSheet'),el=f.data.store.getSnapshot().plan.elements[0];const opts={...sheet.props,visible:true,el};let page=f.ui.render(sheet.type,opts);assert.ok(button(page,'CONFIRMAR RESERVA'));const real=uiFixture(f.data),mod=real.load('components/booking/PlanoEmpresaScreen.tsx');real.render(mod.PlanoEmpresaScreen,f.opts);await turn();const other=component(real.render(mod.PlanoEmpresaScreen,f.opts),'ClientBookingSheet');page=real.render(other.type,{...opts,demo:false});assert.equal(button(page,'CONFIRMAR RESERVA'),undefined);assert.ok(text(page).includes('Este espacio está reservado.'));});
test('GO Reservas Spanish/English tabs and configuration remain translated and one parent owns closure',async()=>{const data=dataFixture(),ui=uiFixture(data),Screen=ui.load('components/booking/GoReservasConfigScreen.tsx').GoReservasDemoScreen,opts={onClose(){},hideFAB:true};ui.render(Screen,opts);await turn();let tree=ui.render(Screen,opts);for(const label of ['Plano','Dividido','Calendario','Configuración'])assert.ok(text(tree).includes(label),label);assert.equal(noEnglish.test(text(tree)),false);assert.equal(component(tree,'DraggableFAB'),undefined);for(const n of nodes(tree).filter(n=>n.type?.name==='PlanoEmpresaScreen'))assert.equal(n.props.hideFAB,true);ui.setLanguage('en');tree=ui.render(Screen,opts);for(const label of ['Layout','Split','Calendar','Configuration'])assert.ok(text(tree).includes(label),label);});
test('DEMO reservations list uses canonical dateISO even when date is a localized display label',async()=>{const data=dataFixture();data.store.getSnapshot().reservations=[{id:'r',planId:'demo_plan',elementId:'space1',customerName:'Cliente de prueba',date:'Mañana',dateISO:'2099-11-12',time:'12:00',status:'pendiente'}];const ui=uiFixture(data),Screen=ui.load('components/booking/GoReservasConfigScreen.tsx').GoReservasDemoScreen,opts={onClose(){},hideFAB:true};ui.render(Screen,opts);await turn();const tree=ui.render(Screen,opts),list=component(tree,'ReservasList');let page=ui.render(list.type,{...list.props,compact:false});assert.ok(text(page).includes('Próximas reservas'.toUpperCase()));const row=component(page,'ReservaRow');assert.ok(row);page=ui.render(row.type,row.props);assert.ok(text(page).includes('Pendiente'));assert.ok(text(page).includes('11/12'));});
test('new floor ES/EN keys are paired and neither language changes persisted business names',()=>{const keys=Object.keys(translations.es).filter(k=>k.startsWith('floor_'));assert.ok(keys.length>=80);for(const key of keys){assert.equal(typeof translations.en[key],'string',key);assert.ok(translations.es[key]);}assert.equal(noEnglish.test(['floor_status_disponible','floor_status_reservado','floor_status_ocupado','floor_status_bloqueado','floor_business','floor_client','floor_save','floor_template','floor_configuration'].map(k=>translations.es[k]).join(' ')),false);});

test('wizard back suppresses the standalone FAB for both real-parent and DEMO contracts, while standalone retains its FAB',async()=>{
 for(const hideFAB of [false,true]){let back=0;const wizard=await setupFloor('es',{hideFAB,showBackButton:true,onClose:()=>back++});
  const closes=nodes(wizard.tree).filter(n=>n.type?.name==='GoCloseButton');assert.equal(closes.length,1);assert.equal(closes[0].props.level,'panel');assert.equal(component(wizard.tree,'DraggableFAB'),undefined);closes[0].props.onPress();assert.equal(back,1);
 }
 const standalone=await setupFloor('es',{hideFAB:false,showBackButton:false});assert.equal(component(standalone.tree,'GoCloseButton'),undefined);assert.equal(nodes(standalone.tree).filter(n=>n.type?.name==='DraggableFAB').length,1);
});


test('manual floor duration is explicit only in DEMO and uses the selected language',async()=>{
  const f=await setupFloor();const sheet=component(f.tree,'ClientBookingSheet'),el=f.data.store.getSnapshot().plan.elements[1];
  let page=f.ui.render(sheet.type,{...sheet.props,visible:true,el});assert.ok(text(page).includes('Reserva manual · 30 minutos'));
  f.ui.setLanguage('en');page=f.ui.render(sheet.type,{...sheet.props,visible:true,el});assert.ok(text(page).includes('Manual reservation · 30 minutes'));
  page=f.ui.render(sheet.type,{...sheet.props,visible:true,el,demo:false});assert.equal(text(page).includes('30 minutes'),false);
});
