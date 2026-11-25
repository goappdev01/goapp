import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url), ts = require("typescript");
const createElement = (type, props, ...children) => ({ type, props: props || {}, children });
const React = { createElement, useState: initial => [initial, () => {}], useEffect() {} };
const settings = { mode: "sound", priority: "standard", intervalMinutes: 15, repeats: 2,
  categories: { booking: true, solicitud: true, go: true, pedido: true, visita: true, task: true },
  quietHours: { enabled: false, start: "22:00", end: "08:00" } };
const saved = [];
let ready = true;
const module = { exports: {}, require: name => {
  if (name === "react") return { default: React, ...React };
  if (name === "react-native") return { Platform: { OS: "ios" }, Switch: "Switch", Text: "Text", TextInput: "TextInput",
    TouchableOpacity: "Button", View: "View" };
  if (name === "@/contexts/GoNotificationContext") return { GoAlertModePicker: "ModePicker",
    useGoNotification: () => ({ settings, settingsReady: ready, settingsSaving: false, settingsError: null,
      updateSettings: async next => { saved.push(next); return true; }, deviceHaptics: true,
      setDeviceHaptics: async () => {} }) };
  if (name === "@/lib/goAlertPreferences") return { GO_ALERT_CATEGORIES: Object.keys(settings.categories) };
  if (name === "@/lib/goNativeNotificationAdapter") return { scheduleGoTestNotification: async () => "scheduled" };
  throw Error("Unexpected import " + name);
} };
vm.runInNewContext(ts.transpileModule(readFileSync("components/perfil/GoAlertsSettings.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText, module);
const walk = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(walk)
  : [node, ...(node.children || []).flatMap(walk)];

test("settings screen exposes all six categories, quiet hours and a local test control", async () => {
  const nodes = walk(module.exports.GoAlertsSettings());
  const switches = nodes.filter(node => node.type === "Switch");
  assert.equal(switches.length, 8);
  assert.ok(switches.some(node => node.props.accessibilityLabel === "Tareas y alarmas"));
  assert.ok(nodes.some(node => node.props.accessibilityLabel === "Probar notificación local"));
  switches.find(node => node.props.accessibilityLabel === "Tareas y alarmas").props.onValueChange(false);
  await new Promise(setImmediate);
  assert.equal(saved.at(-1).categories.task, false);
  ready = false;
  assert.equal(module.exports.GoAlertsSettings().props.accessibilityRole, "alert");
});
