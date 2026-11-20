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
    "../DraggableFAB": {DraggableFAB: props => {hosts.draggable=props;return React.createElement(Host,props);}},
  });
  const root = createRoot(document.createElement("div"));
  const calls = [];
  let controls;
  const render = (hand,draggable=false) => React.act(async () => {
    controls = React.createElement(React.Fragment, null,
      React.createElement("button", {onClick: () => calls.push("back")}, "VOLVER"),
      React.createElement("button", {onClick: () => calls.push("close")}, "CERRAR"));
    root.render(React.createElement(handContext.GoNavigationHand.Provider, {value: hand},
      React.createElement(GoNavigationRail, {controls,...(draggable?{draggableScreenKey:"financial_calculator",reservedBottom:64}:{})}, React.createElement("div", null, "Tabla"))));
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

function assertPlacement(f, hand, width, height, leftInset, rightInset) {
  const rail = flat(f.hosts.rail.style);
  const body = flat(f.hosts.body.style);
  const onLeft = hand === "left";
  assert.equal(f.hosts.avoider.behavior, "height");
  assert.equal(body.direction, "ltr");
  assert.equal(body.position, "relative");
  assert.equal(body.flexDirection, undefined, "content must not share a row with the controls");
  assert.equal(rail.position, "absolute");
  assert.equal(rail.bottom, 0);
  assert.equal(rail.left, onLeft ? 0 : undefined);
  assert.equal(rail.right, onLeft ? undefined : 0);
  assert.equal(f.hosts.rail.pointerEvents, "box-none");
  assert.equal(rail.justifyContent, "flex-end");
  assert.equal(rail.flexDirection, onLeft ? "row-reverse" : "row");
  assert.equal(rail.gap, 10);
  const targetWidth = f.size * 2 + rail.gap;
  const targetHeight = f.size;
  const railWidth = targetWidth + rail.paddingLeft + rail.paddingRight;
  const x = (onLeft ? leftInset : width - rightInset - railWidth) + rail.paddingLeft;
  assert.equal(x, onLeft ? leftInset + 12 : width - rightInset - 12 - targetWidth);
  const content = f.hosts.body.children[0];
  assert.equal(content.props.style.flex, 1);
  assert.equal(content.props.style.minWidth, 0);
  assert.equal(content.props.style.overflow, "hidden");
  assert.equal(content.props.style.width, undefined, "content fills the available safe-area width");
  assert.equal(content.props.style.marginRight, undefined, "no permanent right gutter");
  assert.ok(height - rail.paddingBottom - targetHeight >= 0);
  assert.equal(rail.paddingBottom, Math.min(24, height - targetHeight));
}

test("financial controls overlay the full-width calculator at the safe edge for both hands", async () => {
  for (const frames of [compact, large]) {
    const f = await mountedRail();
    try {
      for (const hand of ["right", "left"]) {
        await f.render(hand);
        for (const index of [0, 1, 0, 3, 2, 3]) {
          const [width, height, left, right, top, bottom] = frames[index];
          const bodyHeight = height - top - bottom - 46;
          await f.layout(width - left - right, bodyHeight);
          assertPlacement(f, hand, width, bodyHeight, left, right);
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
    assertPlacement(f, "right", 911, 112, 59, 20);
    await f.render("left");
    assertPlacement(f, "left", 911, 112, 59, 20);
    await f.layout(832, 151);
    assertPlacement(f, "left", 911, 151, 59, 20);
    await f.layout(832, 325);
    assertPlacement(f, "left", 911, 325, 59, 20);
  } finally {
    await f.unmount();
  }
  const reopened = await mountedRail();
  try {
    await reopened.render("right");
    assertPlacement(reopened, "right", 911, 325, 20, 59);
  } finally {
    await reopened.unmount();
  }
});

test('calculator opts into the existing draggable memory and reserves its action bar through keyboard and rotation',async()=>{const f=await mountedRail();try{for(const hand of ['left','right'])for(const [width,height] of [[320,650],[844,280],[390,180],[390,650]]){await f.render(hand,true);await f.layout(width,height);const p=f.hosts.draggable;assert.equal(p.screenKey,'financial_calculator');assert.equal(p.navigation,true);assert.equal(p.keyboardResponsive,true);assert.equal(p.bounds.width,width);assert.equal(p.bounds.height,height);assert.equal(p.initialBottom,72);assert.equal(p.avoidRects[0].y,height-64);assert.equal(p.avoidRects[0].height,64);assert.ok(height-p.initialBottom-p.maxH>=0);assert.equal(p.children.props.style.flexDirection,hand==='left'?'row-reverse':'row');}}finally{await f.unmount();}});
