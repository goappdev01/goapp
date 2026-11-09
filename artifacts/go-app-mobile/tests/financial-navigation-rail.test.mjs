import {test} from "node:test";
import assert from "node:assert/strict";
import life from "./helpers/react-lifecycle.cjs";

const {React, createRoot, document, evaluate, rn} = life;
const flat = style => Object.assign({}, ...[style].flat(Infinity));

async function mountedRail() {
  const hosts = {};
  const Host = props => {
    if (props.onLayout) hosts.body = props;
    if (props.testID === "go-navigation-rail") hosts.rail = props;
    return React.createElement("div", null, props.children);
  };
  const handContext = evaluate("components/ui/GoNavigationHand.tsx");
  const avoider = props => {
    hosts.avoider = props;
    return React.createElement(Host, props);
  };
  const {GO_NAVIGATION_SIZE} = evaluate("components/ui/GoCloseButton.tsx", {
    "@expo/vector-icons": {Feather: "Icon"},
  });
  const {GoNavigationRail} = evaluate("components/ui/GoNavigationRail.tsx", {
    "react-native": {...rn, View: Host},
    "react-native-keyboard-controller": {KeyboardAvoidingView: avoider},
    "./GoCloseButton": {GO_NAVIGATION_SIZE},
    "./GoNavigationHand": handContext,
  });
  const root = createRoot(document.createElement("div"));
  const calls = [];
  let controls;
  const render = hand => React.act(async () => {
    controls = React.createElement(React.Fragment, null,
      React.createElement("button", {onClick: () => calls.push("back")}, "VOLVER"),
      React.createElement("button", {onClick: () => calls.push("close")}, "CERRAR"));
    root.render(React.createElement(handContext.GoNavigationHand.Provider, {value: hand},
      React.createElement(GoNavigationRail, {controls}, React.createElement("div", null, "Tabla"))));
  });
  const layout = (width, height) => React.act(async () => {
    hosts.body.onLayout({nativeEvent: {layout: {width, height}}});
  });
  return {hosts, render, layout, calls, size: GO_NAVIGATION_SIZE,
    pressBoth() { React.Children.forEach(controls.props.children, child => child.props.onClick()); },
    unmount: () => React.act(async () => root.unmount())};
}

const compact = [
  [375, 667, 0, 0, 20, 0],
  [667, 375, 0, 0, 0, 0],
  [375, 667, 0, 0, 0, 20],
  [667, 375, 0, 0, 0, 0],
];
const large = [
  [430, 932, 0, 0, 59, 34],
  [932, 430, 59, 59, 0, 21],
  [430, 932, 0, 0, 34, 59],
  [932, 430, 59, 59, 0, 21],
];

function assertPlacement(f, hand, width, height, leftInset, rightInset, stacked) {
  const rail = flat(f.hosts.rail.style);
  const body = flat(f.hosts.body.style);
  const onLeft = hand === "left";
  assert.equal(f.hosts.avoider.behavior, "height");
  assert.equal(body.direction, "ltr");
  assert.equal(body.flexDirection, onLeft ? "row-reverse" : "row");
  assert.equal(rail.justifyContent, "flex-end");
  assert.equal(rail.flexShrink, 0);
  assert.equal(rail.flexDirection, stacked ? "column" : onLeft ? "row-reverse" : "row");
  assert.equal(rail.gap, 10);
  const targetWidth = stacked ? f.size : f.size * 2 + rail.gap;
  const targetHeight = stacked ? f.size * 2 + rail.gap : f.size;
  const railWidth = targetWidth + rail.paddingLeft + rail.paddingRight;
  const x = (onLeft ? leftInset : width - rightInset - railWidth) + rail.paddingLeft;
  assert.equal(x, onLeft ? leftInset + 12 : width - rightInset - 12 - targetWidth);
  const content = f.hosts.body.children[0];
  assert.equal(content.props.style.flex, 1);
  assert.equal(content.props.style.minWidth, 0);
  assert.equal(content.props.style.overflow, "hidden");
  const contentBoundary = onLeft ? leftInset + railWidth : width - rightInset - railWidth;
  assert.equal(onLeft ? contentBoundary - x - targetWidth : x - contentBoundary, 8);
  assert.ok(height - rail.paddingBottom - targetHeight >= 0);
  assert.equal(rail.paddingBottom, Math.min(24, height - targetHeight));
}

test("financial rail mirrors the current safe edge for both hands through all four viewport shapes", async () => {
  for (const frames of [compact, large]) {
    const f = await mountedRail();
    try {
      for (const hand of ["right", "left"]) {
        await f.render(hand);
        for (const index of [0, 1, 0, 3, 2, 3]) {
          const [width, height, left, right, top, bottom] = frames[index];
          const bodyHeight = height - top - bottom - 46;
          await f.layout(width - left - right, bodyHeight);
          assertPlacement(f, hand, width, bodyHeight, left, right, true);
          f.pressBoth();
        }
      }
      assert.deepEqual(f.calls, Array.from({length: 12}, () => ["back", "close"]).flat());
    } finally {
      await f.unmount();
    }
  }
});

test("changing hands, closing the keyboard and reopening ignore old coordinates", async () => {
  const f = await mountedRail();
  try {
    await f.render("right");
    // An asymmetric safe area exercises each physical side independently.
    await f.layout(832, 112);
    assertPlacement(f, "right", 911, 112, 59, 20, false);
    await f.render("left");
    assertPlacement(f, "left", 911, 112, 59, 20, false);
    await f.layout(832, 151);
    assertPlacement(f, "left", 911, 151, 59, 20, true);
    await f.layout(832, 325);
    assertPlacement(f, "left", 911, 325, 59, 20, true);
  } finally {
    await f.unmount();
  }
  const reopened = await mountedRail();
  try {
    await reopened.render("right");
    assertPlacement(reopened, "right", 911, 325, 20, 59, true);
  } finally {
    await reopened.unmount();
  }
});
