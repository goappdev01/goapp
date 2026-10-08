import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const source = readFileSync('app/index.tsx', 'utf8');
const policySource = readFileSync('components/landing/landingV1Visibility.ts', 'utf8');
const compiled = ts.transpileModule(policySource, { compilerOptions: {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
} }).outputText;
const policy = { exports: {} };
vm.runInNewContext(compiled, policy);

test('public User V1 uses a fail-closed surface policy and preserves only approved satellite keys', () => {
  const api = policy.exports;
  assert.equal(api.hasFullLandingArchitecture(true), true);
  for (const value of [false, undefined, null, 'true', 1]) {
    assert.equal(api.hasFullLandingArchitecture(value), false);
  }
  assert.equal(api.isUserV1Landing(true, false), true);
  assert.equal(api.isUserV1Landing(true, undefined), true);
  assert.equal(api.isUserV1Landing(true, true), false);
  assert.equal(api.isUserV1Landing(false, false), false);

  const allKeys = ['bell', 'list', 'map', 'calendar', 'contacts', 'messages', 'payment', 'settings', 'mas'];
  const original = [...allKeys];
  assert.deepEqual([...api.visibleLandingSatelliteKeys(allKeys, true)], ['bell', 'list', 'calendar', 'settings', 'mas']);
  assert.deepEqual([...api.visibleLandingSatelliteKeys(allKeys, false)], allKeys);
  assert.deepEqual(allKeys, original, 'visibility policy does not mutate the full architecture');
  assert.equal(api.visibleLandingContextAction(true, true), true);
  assert.equal(api.visibleLandingContextAction(true, false), false);
  assert.equal(api.visibleLandingContextAction(false, false), true);
});

test('Landing applies V1 gating without mounting hidden orbit or satellite hitboxes', () => {
  assert.match(source, /isUserV1Landing\(isUserMode, adminAccess\.allowed\)/);
  assert.match(source, /!isUserV1Surface && \(orbitSecondLevel === null \?/);
  assert.match(source, /visibleLandingSatelliteKeys\(/);
  assert.match(source, /visibleLandingContextAction\(isUserV1Surface, cs\.v1Visible\)/);
  assert.match(source, /fullLandingArchitecture && !anyOverlayOpen[\s\S]*?humanityPlacement && \(/);
  assert.match(source, /visible=\{fullLandingArchitecture && humanityOpen\}/);
  assert.match(source, /cx: screen\.width - dockRight - systemBoundingRadius \+ \(handedness === "right" \? maxX : minX\)/);
  assert.match(source, /cy: screen\.height - insets\.bottom - SYSTEM_MARGIN_Y - orbitWrapSize \/ 2 - Math\.round\(12 \* uiScaleFactor\)/);
  assert.doesNotMatch(source, /\bsetHumanityPan\b|\bhumanityPan\s*\./);
  assert.match(source, /const QR_TYPES:[^\n]+isUserV1Surface \? \[\] : \[/);
  assert.match(source, /isUserV1Surface && !aiOpen[\s\S]*?openAi\(\)/);
  assert.doesNotMatch(source, /go_floating_pos_v14/);
  assert.doesNotMatch(source, /panResponder\.panHandlers/);
});

test('short card taps remain separate from long-press action loading and existing swipe responders', () => {
  assert.match(source, /setNextAptMinimized\(false\)[\s\S]*?onLongPress=\{\(\) => \{[\s\S]*?startRelatedGoAction\(nextAppointment\.g\)/);
  assert.match(source, /setCambiosOpen\(true\)[\s\S]*?onLongPress=\{\(\) => \{[\s\S]*?startRelatedGoAction\(item\.g\)/);
  assert.match(source, /nextCardPanRef\.panHandlers/);
  assert.match(source, /cambiosCardPanRef\.panHandlers/);
  assert.match(source, /const startRelatedGoAction = \(g: typeof goLog\[number\]\) => \{[\s\S]*?loadGoIntoForm\(g\)/);
});
