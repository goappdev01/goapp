import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url), ts = require("typescript");
function fixture(saved = new Map(), getItem = async key => saved.get(key) ?? null) {
  let cursor = 0, callbacks = {}, size;
  const values = [], effects = [];
  const react = {
    default: { createElement(type, props, ...children) { return { type, props: { ...props, children } }; } },
    useMemo: fn => fn(), useCallback: fn => fn,
    useEffect(fn, deps) { const i = cursor++, old = values[i];
      if (!old || deps.some((d,k) => d !== old[k])) { values[i] = deps; effects.push(fn); }
    },
  };
  const animation = {
    default: { View: "AnimatedView" }, runOnJS: fn => fn, withSpring: v => v,
    useSharedValue(value) { const i = cursor++; return values[i] ??= { value }; },
    useAnimatedStyle: fn => fn(),
  };
  function pan() {
    const chain = { activateAfterLongPress(value) { callbacks.delay = value; return chain; } };
    for (const name of ["onStart", "onUpdate", "onEnd", "onFinalize"]) chain[name] = fn => { callbacks[name] = fn; return chain; };
    return chain;
  }
  const storage = { getItem, setItem: async (key, raw) => saved.set(key, raw) };
  const modules = { react, "react-native": { Dimensions: { get: () => ({ width: 390, height: 844 }) }, StyleSheet: { create: x => x } },
    "react-native-reanimated": animation, "react-native-gesture-handler": { Gesture: { Pan: pan }, GestureDetector: "GestureDetector" },
    "@react-native-async-storage/async-storage": { default: storage }, "expo-haptics": { selectionAsync() {}, impactAsync() {}, ImpactFeedbackStyle: { Light: "light" } },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }
  };
  const context = { exports: {}, console, require: name => { if (!(name in modules)) throw Error(name); return modules[name]; } };
  vm.runInNewContext(ts.transpileModule(readFileSync("components/DraggableFAB.tsx", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React }
  }).outputText, context);
  return { saved, get gesture() { return callbacks; },
    render(height = 500) {
      cursor = 0; size = { width: 390, height };
      const tree = context.exports.DraggableFAB({ screenKey: "booking-assistant", buttonKey: "close", initialBottom: 12, maxH: 44, buttonWidth: 44, bounds: size, children: "close" });
      effects.splice(0).forEach(fn => fn());
      return tree.props.children[0].props.style[1];
    },
    async settled() { await new Promise(setImmediate); }
  };
}
test("original long-press drag follows the finger without jumping and restores its persisted position", async () => {
  const f = fixture(); let start = f.render(); await f.settled();
  assert.equal(f.gesture.delay, 500);
  f.gesture.onStart({ translationX: 3, translationY: 4 });
  f.gesture.onUpdate({ translationX: 3, translationY: 4 });
  let view = f.render(); assert.equal(view.left, start.left); assert.equal(view.top, start.top);
  f.gesture.onUpdate({ translationX: -77, translationY: -96 }); f.gesture.onEnd();
  view = f.render(); assert.equal(view.left, start.left - 80); assert.equal(view.top, start.top - 100);
  const stored = JSON.parse(f.saved.get("fab_pos:booking-assistant:close"));
  assert.equal(stored.l, view.left); assert.equal(stored.t, view.top);
  const reopened = fixture(f.saved); reopened.render(); await reopened.settled();
  assert.equal(reopened.render().top, view.top); assert.equal(reopened.render().left, view.left);
});
test("keyboard clamps the display without overwriting the saved position and drag respects bounds", async () => {
  const saved = new Map([["fab_pos:booking-assistant:close", JSON.stringify({ l: 200, t: 344 })]]);
  const f = fixture(saved); f.render(250); await f.settled();
  assert.equal(f.render(250).top, 198); assert.equal(f.render(500).top, 344);
  assert.equal(JSON.parse(saved.get("fab_pos:booking-assistant:close")).t, 344);
  f.render(250); f.gesture.onStart({ translationX: 0, translationY: 0 });
  f.gesture.onUpdate({ translationX: -999, translationY: -999 });
  assert.equal(f.render(250).left, 8); assert.equal(f.render(250).top, 8);
  f.gesture.onUpdate({ translationX: 999, translationY: 999 });
  assert.equal(f.render(250).left, 338); assert.equal(f.render(250).top, 198);
});
test("a delayed preference read cannot move the button after dragging has started", async () => {
  let finish; const f = fixture(new Map(), () => new Promise(resolve => { finish = resolve; }));
  const start = f.render(); f.gesture.onStart({ translationX: 0, translationY: 0 });
  f.gesture.onUpdate({ translationX: -20, translationY: -30 }); f.gesture.onEnd();
  finish(JSON.stringify({ l: 10, t: 10 })); await f.settled();
  assert.equal(f.render().left, start.left - 20); assert.equal(f.render().top, start.top - 30);
});