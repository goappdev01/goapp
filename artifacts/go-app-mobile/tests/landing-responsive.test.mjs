import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");
function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require: name => {
    if (!(name in dependencies)) throw Error("Unexpected import " + name);
    return dependencies[name];
  } });
  return exports;
}
const policy = load("components/landing/landingResponsiveLayout.ts");
const presets = ["compacto", "estandar", "grande"];
const devices = [
  { width: 568, height: 298, insets: { top: 0, bottom: 21, left: 44, right: 44 } },
  { width: 320, height: 568, insets: { top: 20, bottom: 0, left: 0, right: 0 } },
  { width: 375, height: 667, insets: { top: 20, bottom: 0, left: 0, right: 0 } },
  // Owner context surface is 22pt shorter than the physical window.
  { width: 390, height: 822, insets: { top: 59, bottom: 34, left: 0, right: 0 } },
  { width: 430, height: 910, insets: { top: 59, bottom: 34, left: 0, right: 0 } },
  { width: 768, height: 1024, insets: { top: 24, bottom: 20, left: 0, right: 0 } },
  { width: 844, height: 368, insets: { top: 0, bottom: 21, left: 44, right: 44 } },
];
function geometry(device, preset) {
  const scale = policy.fitLandingScale(preset, device.width, device.height, device.insets);
  const radius = Math.round(99 * scale), button = Math.round(65 * scale);
  const satelliteRadius = radius + Math.round(35 * scale), satelliteSize = Math.round(50 * scale);
  const wrapSize = 2 * (radius + button / 2) + 12;
  const boundingRadius = Math.max(radius + button / 2, satelliteRadius + satelliteSize / 2);
  const dockRight = preset === "estandar" ? -1 : 5;
  const dock = policy.landingDockBounds({ ...device, dockRight, boundingRadius, wrapSize,
    satelliteRadius, satelliteSize });
  const baseline = device.insets.bottom + 4 + (preset === "compacto" ? 2 : preset === "estandar" ? 6 : 12) + wrapSize - 2;
  return { scale, radius, button, satelliteRadius, satelliteSize, wrapSize, boundingRadius, dockRight, dock, baseline };
}
for (const preset of presets) {
  test(preset + ": preserve reference sizes and the working action grid", () => {
    const d = devices[3], g = geometry(d, preset);
    assert.equal(g.scale, policy.landingPresetScale(preset));
    const grid = policy.landingActionGrid({ width: d.width, leftInset: 0, rightInset: 0, scale: g.scale,
      large: preset === "grande", columns: 3, transport: true });
    const h = Math.round(Math.min(80, Math.max(56, 64 * g.scale)));
    assert.equal(grid.height, h);
    assert.equal(grid.buttonWidth, Math.round(h * (preset === "grande" ? 1.18 : 1.28)));
    assert.equal(grid.compressed, false);
  });
  for (const [index, d] of devices.entries()) {
    test(preset + ": safe orbit and complete content on device " + index, () => {
      const g = geometry(d, preset);
      assert.ok(g.scale >= 0.83 && g.scale <= policy.landingPresetScale(preset));
      const anchorX = d.width - g.dockRight - g.boundingRadius;
      const cy = d.height - d.insets.bottom - 6 - g.wrapSize / 2 + g.dock.maxY;
      for (const handedness of ["right", "left"]) {
        const cx = anchorX + g.dock[handedness === "right" ? "maxX" : "minX"];
        const rectangles = [];
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI / 2 + i * 2 * Math.PI / 7;
          rectangles.push({ x: cx + Math.cos(a) * g.radius - g.button / 2,
            y: cy + Math.sin(a) * g.radius - g.button / 2, size: g.button });
        }
        for (let i = 0; i < 8; i++) {
          const a = (-112.5 + 45 * i) * Math.PI / 180;
          rectangles.push({ x: cx + Math.cos(a) * g.satelliteRadius - g.satelliteSize / 2,
            y: cy + Math.sin(a) * g.satelliteRadius - g.satelliteSize / 2, size: g.satelliteSize });
        }
        for (const r of rectangles) {
          assert.ok(r.x >= d.insets.left + 3, "left edge " + JSON.stringify(r));
          assert.ok(r.x + r.size <= d.width - d.insets.right - 3, "right edge");
          assert.ok(r.y >= d.insets.top + 3, "status bar");
          assert.ok(r.y + r.size <= d.height - d.insets.bottom - 5, "home indicator");
          assert.ok(r.size + 8 >= 44, "usable touch area");
        }
        for (const [nextHeight, changesHeight] of [[0,0], [46,46], [280,0], [0,220], [280,220], [440,360]]) {
          const gap = nextHeight ? Math.round(8 * g.scale) : 0;
          const naturalHeight = nextHeight + (changesHeight ? changesHeight + gap : 0);
          const f = policy.landingContentFrame({ ...d, safeTop: d.insets.top + 12, baseline: g.baseline,
            boundingRadius: g.boundingRadius, handedness, naturalHeight, controlSize: 44 });
          assert.ok(f.left >= 0 && f.left + f.width <= d.width);
          assert.ok(f.height > 0 && f.top >= d.insets.top + 12);
          assert.ok(f.top + f.height <= d.height - d.insets.bottom);
          if (!f.virtual) {
            assert.equal(policy.landingContentBottom(g.baseline, f), g.baseline);
            assert.ok(d.height - g.baseline - naturalHeight >= d.insets.top + 12 + 52);
          } else {
            assert.equal(policy.landingContentBottom(g.baseline, f), 0);
            assert.ok(f.contentHeight >= naturalHeight, "nothing cropped out of scroll content");
            const scrollRange = f.contentHeight - f.height;
            for (const r of [{ bottom: 0, height: nextHeight },
              { bottom: nextHeight + gap, height: changesHeight }].filter(r => r.height)) {
              const top = f.contentHeight - r.bottom - r.height;
              assert.ok(top >= 0);
              assert.ok(top + r.height <= f.contentHeight);
              // Every part can be brought into the viewport using its native scroll range.
              assert.ok(top <= scrollRange + f.height);
              assert.ok(top + r.height >= 0);
            }
          }
        }
      }
    });
  }
}
test("narrow screens constrain action width without reducing touch height or transport labels", () => {
  for (const d of devices.slice(1, 5)) for (const preset of presets) {
    const g = geometry(d, preset);
    for (const columns of [2,3]) {
      const grid = policy.landingActionGrid({ width: d.width, leftInset: d.insets.left,
        rightInset: d.insets.right, scale: g.scale, large: preset === "grande", columns, transport: true,
        transportWidth: preset === "grande" ? 86 : 70 });
      assert.ok(grid.buttonWidth >= 44 && grid.height >= 56);
      assert.ok(d.width - 18 - grid.width >= 4 + (preset === "grande" ? 86 : 70) + 8, "transport and grid stay separate");
    }
  }
});
test("measured header, long cards and dimension changes recompute the viewport instead of retaining a stale cap", () => {
  const d=devices[3], g=geometry(d,"grande");
  const input={ ...d, safeTop: 150, baseline: g.baseline, boundingRadius: g.boundingRadius, handedness:"right", controlSize:44 };
  const long=policy.landingContentFrame({ ...input, naturalHeight:700 });
  const short=policy.landingContentFrame({ ...input, naturalHeight:100 });
  assert.equal(long.scroll,true);
  assert.equal(short.virtual,false);
  assert.equal(long.top,202);
  assert.equal(long.contentHeight,700);
  assert.ok(long.top+long.height<=d.height-d.insets.bottom);
});
test("QR stays fully below the status area and retains its valid bottom position when possible", () => {
  for (const d of devices) for (const desired of [20,320,600,1200]) {
    const bottom=policy.clampLandingControlBottom(desired,d.height,44,d.insets.top+12,d.insets.bottom);
    const top=d.height-bottom-44;
    assert.ok(top>=d.insets.top+12);
    assert.ok(top+44<=d.height-d.insets.bottom-8);
    if(desired>=d.insets.bottom+8 && desired<=d.height-d.insets.top-12-44) assert.equal(bottom,desired);
  }
});
test("bounded scroll owns only its gesture area; static content stays transparent to other controls", () => {
  const relations=[];
  const gesture={ enabled(v){relations.push(["enabled",v]);return this;},
    blocksExternalGesture(v){relations.push(["blocks",v]);return this;} };
  const closingGesture={};
  const react={ createElement:(type,props,...children)=>({type,props,children}),
    useMemo:fn=>fn(), useRef:()=>({current:null}), useEffect:fn=>fn() };
  const api=load("components/landing/LandingContentViewport.tsx",{
    react, "react-native":{ ScrollView:"ScrollView", View:"View", StyleSheet:{absoluteFill:{position:"absolute"}} },
    "react-native-gesture-handler":{ Gesture:{Native:()=>gesture}, GestureDetector:"GestureDetector" },
  });
  const base={ virtual:false, scroll:false, width:390,height:240,top:120,left:0,contentHeight:600,baseline:350 };
  const normal=api.LandingContentViewport({frame:base,closingGesture,children:"same cards"});
  assert.equal(normal.props.pointerEvents,"box-none");
  assert.equal(normal.props.testID,"landing-content-static");
  const scroll=api.LandingContentViewport({frame:{...base,virtual:true,scroll:true},closingGesture,children:"same cards"});
  assert.equal(scroll.type,"GestureDetector");
  assert.equal(scroll.children[0].type,"ScrollView");
  assert.equal(scroll.children[0].props.directionalLockEnabled,true);
  assert.equal(scroll.children[0].props.bounces,false);
  assert.equal(scroll.children[0].props.contentContainerStyle.height,600);
  assert.equal(relations.at(-1)[1],closingGesture);
});
test("one shared viewport contains both cards, transport and existing help; carousel callbacks are retained", () => {
  const s=readFileSync("app/index.tsx","utf8");
  const start=s.indexOf("<LandingContentViewport "),end=s.indexOf("</LandingContentViewport>",start);
  assert.ok(start>0 && end>start);
  const content=s.slice(start,end);
  for(const element of ["pendientes-open-panel","proxima-abs-block",'op.label','workGuideHideAnim']) assert.ok(content.includes(element));
  assert.ok(content.includes("nextCardPanRef.panHandlers") && content.includes("cambiosCardPanRef.panHandlers"));
  assert.ok(content.includes("overflowing={landingFrame.virtual}"));
  assert.ok(content.includes("onHeight={setPendingContentH}"));
  assert.ok(!content.includes("minHeight: proximaExpanded ? panelMaxHeight"));
  assert.equal(s.match(/<LandingContentViewport /g).length,1);
  assert.ok(s.includes("setLandingSurfaceSize(prev => prev?.width === width"));
  assert.ok(s.includes("hitSlop={Math.max(6, (44 - BTN_SZ) / 2)}"));
});

test("short landscape uses readable two-column actions and keeps transport in a separate lower row", () => {
  for (const d of [devices[0], devices.at(-1)]) for (const preset of presets) {
    const g=geometry(d,preset);
    const width=policy.landingContentWidth(d.width,d.height,d.insets,g.boundingRadius);
    assert.ok(width>=180 && width<d.width);
    const stacked=width<280;
    const grid=policy.landingActionGrid({width,leftInset:0,rightInset:0,scale:g.scale,large:preset==="grande",
      columns:stacked?2:3,transport:!stacked});
    assert.ok(grid.width<=width-36);
    assert.ok(grid.buttonWidth>=60);
  }
});
test("outer scroll uses a natural-height View for card contents and reports complete height", () => {
  const react={createElement:(type,props,...children)=>({type,props,children})};
  const api=load("components/landing/LandingContentViewport.tsx",{
    react,"react-native":{ScrollView:"ScrollView",View:"View",StyleSheet:{}},
    "react-native-gesture-handler":{},
  });
  const measured=[];
  const props={overflowing:true,onHeight:value=>measured.push(value),contentContainerStyle:{gap:2},children:"all rows"};
  const natural=api.LandingCardContents(props);
  assert.equal(natural.type,"View");
  natural.props.onLayout({nativeEvent:{layout:{height:480}}});
  assert.deepEqual(measured,[480]);
  const capped=api.LandingCardContents({...props,overflowing:false});
  assert.equal(capped.type,"ScrollView");
  assert.equal(capped.props.style.flexShrink,1);
  capped.props.onContentSizeChange(354,480);
  assert.deepEqual(measured,[480,480]);
});
test("Humanity keeps one reusable control and an accessible fallback before the scrolling cards", () => {
  const s=readFileSync("app/index.tsx","utf8");
  const canvas=s.slice(s.indexOf("<LandingContentViewport "),s.indexOf("</LandingContentViewport>"));
  assert.ok(canvas.includes("landingInlineHumanity && renderLandingHumanity(inlineHumanityRect)"));
  assert.ok(s.includes("landingBaseFrame.naturalHeight + inlineHumanityRect.height + 8"));
  assert.equal(s.match(/source=\{require\("\.\.\/assets\/images\/humanity_globe.png"\)\}/g).length,1);
  assert.ok(s.includes("setHumanityOpen(true)"));
});
