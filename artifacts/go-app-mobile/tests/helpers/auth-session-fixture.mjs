import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
const mobileRoot = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(path.join(mobileRoot, "package.json"));
const ts = require("typescript");
const compile = file => ts.transpileModule(readFileSync(path.join(mobileRoot, file), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

/** Run the real adapter against DISTINCT protected/plaintext stores, never a native device. */
export function loadCredentialStorage(storageApi, options = {}) {
  const secure = options.secure ?? new Map(), calls = [];
  const secureApi = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
    isAvailableAsync: async () => options.available ?? true,
    getItemAsync: async (key, settings) => {
      calls.push({ method: "get", key, settings });
      await options.read?.(key, secure, calls);
      return secure.get(key) ?? null;
    },
    setItemAsync: async (key, value, settings) => {
      calls.push({ method: "set", key, settings });
      await options.write?.(key, value, secure);
      secure.set(key, value);
    },
    deleteItemAsync: async (key, settings) => {
      calls.push({ method: "delete", key, settings });
      await options.remove?.(key, secure);
      secure.delete(key);
    },
    ...options.secureApi,
  };
  const plainApi = { ...storageApi,
    removeItem: storageApi.removeItem ?? (key => storageApi.multiRemove([key])),
  };
  const scope = { exports: {}, require(name) {
    if (name === "@react-native-async-storage/async-storage") return { default: plainApi };
    if (name === "expo-secure-store") return secureApi;
    if (name === "react-native") return { Platform: { OS: options.platform ?? "ios" } };
    throw new Error("Unexpected credential import " + name);
  } };
  vm.runInNewContext(compile("lib/authCredentialStorage.ts"), scope);
  return { api: scope.exports, secure, calls };
}

/** Execute the real session module, including migration/renewal, with fake transport only. */
export function loadAuthSession(globals, storageApi, events = {}, storageOptions = {}) {
  const credentials = loadCredentialStorage(storageApi, storageOptions);
  const scope = {
    exports: {}, Headers, Response, AbortController, Date,
    setTimeout, clearTimeout, setInterval, clearInterval, ...globals,
    fetch: (...args) => globals.fetch(...args),
    require(name) {
      if (name === "@react-native-async-storage/async-storage") return { default: storageApi };
      if (name === "./authCredentialStorage") return credentials.api;
      if (name === "./sessionEvents") return {
        notifySessionChanged: events.notifySessionChanged ?? (() => {}),
        onSessionChanged: events.onSessionChanged ?? (() => () => {}),
      };
      throw new Error("Unexpected session import " + name);
    },
  };
  vm.runInNewContext(compile("lib/authSession.ts"), scope);
  return Object.assign(scope.exports, { __credentials: credentials });
}
