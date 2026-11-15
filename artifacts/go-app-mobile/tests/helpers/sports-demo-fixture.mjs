import { readFileSync } from "node:fs";
import vm from "node:vm";
import life from "./react-lifecycle.cjs";
export const { ts } = life;
export function demoModel() {
  const scope = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync("components/sports/sportsEventsDemoModel.ts", "utf8"),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
        },
      },
    ).outputText,
    scope,
  );
  return scope.exports;
}

/** Actual React lifecycle and actual TSX handlers; native hosts/transport are synthetic. */
export function demoFixture({
  width = 390,
  fontScale = 1,
  hand = "right",
} = {}) {
  const { React, createRoot, document, evaluate } = life;
  const model = demoModel(),
    hosts = new Map(),
    handContext = React.createContext(hand);
  let alert,
    closed = 0,
    network = 0,
    visible = true;
  const auth = { allowed: true, checking: false, userId: "synthetic-admin" },
    view = { view: "ADMIN" };
  const host = (name) => (props) => {
    if (props.accessibilityLabel) hosts.set(props.accessibilityLabel, props);
    if (props.screenKey) hosts.set(props.screenKey, props);
    return React.createElement("div", { "data-native": name }, props.children);
  };
  const native = {
    Alert: {
      alert: (...args) => {
        alert = args;
      },
    },
    Platform: { OS: "ios" },
    StyleSheet: { create: (s) => s },
    useWindowDimensions: () => ({ width, height: 844, fontScale }),
    ...Object.fromEntries(
      [
        "KeyboardAvoidingView",
        "Modal",
        "ScrollView",
        "Text",
        "TextInput",
        "TouchableOpacity",
        "View",
      ].map((n) => [n, host(n)]),
    ),
  };
  const imports = {
    "react-native": native,
    "react-native-safe-area-context": { SafeAreaView: host("SafeAreaView") },
    "@expo/vector-icons": { Feather: host("Feather") },
    "./sportsEventsDemoModel": model,
    "@/components/ui/GoNavigationHand": { GoNavigationHand: handContext },
    "@/components/ui/GoNavigationFloating": {
      GoNavigationFloating: host("Floating"),
    },
    "@/components/ui/GoCloseButton": { GoCloseButton: host("CloseButton") },
    "@/contexts/GoAdminAccessContext": { useAdminAccess: () => auth },
    "@/contexts/GoViewContext": { useGoView: () => view },
    "@workspace/api-zod": {
      canUseSportsEvents: (v, a, id) => v === "ADMIN" && a && !!id,
    },
    "@/data/booking": {
      supabaseApiRequest: () => {
        network++;
        throw new Error("Remote service unavailable");
      },
    },
  };
  const demo = evaluate("components/sports/SportsEventsDemo.tsx", imports);
  const panel = evaluate("components/sports/SportsEventsAdminPanel.tsx", {
    ...imports,
    "./SportsEventsDemo": demo,
  });
  const container = document.createElement("div"),
    root = createRoot(container);
  const render = () => {
    hosts.clear();
    React.act(() =>
      root.render(
        React.createElement(panel.SportsEventsAdminPanel, {
          visible,
          onClose: () => {
            closed++;
          },
        }),
      ),
    );
  };
  const find = (label) => {
    const props = hosts.get(label);
    return props ? { props } : undefined;
  };
  const click = (label) => {
    const props = hosts.get(label);
    if (!props)
      throw new Error(
        "Control absent: " + label + "\n" + container.textContent,
      );
    if (props.disabled) throw new Error("Disabled: " + label);
    React.act(() => props.onPress());
    render();
  };
  const input = (label, value) => {
    const props = hosts.get(label);
    if (!props?.onChangeText) throw new Error("Input absent: " + label);
    React.act(() => props.onChangeText(value));
    render();
  };
  render();
  return {
    model,
    auth,
    view,
    render,
    click,
    input,
    find,
    text: () => container.textContent.replace(/\s+/g, " "),
    get tree() {
      return container.firstChild;
    },
    get network() {
      return network;
    },
    get closed() {
      return closed;
    },
    confirmReset() {
      React.act(() =>
        alert[2].find((b) => b.text === "Reiniciar demo").onPress(),
      );
      render();
    },
    setVisible(value) {
      visible = value;
      render();
    },
    close() {
      React.act(() => root.unmount());
    },
  };
}
