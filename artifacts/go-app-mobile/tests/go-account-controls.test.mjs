import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import life from './helpers/react-lifecycle.cjs';

const { React, createRoot, document, evaluate, ts } = life;
const messages = evaluate('lib/goMessageIdentity.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const account = { userId: 'account-a', phone: '' };
const confirmedPhone = '+34600111222';
const otherPhone = '+34600333444';
const session = (id = account.userId, extra = {}) => ({ access_token: 'test-only', user: { id, ...extra } });
const settle = operation => React.act(async () => { await operation?.(); for (let i = 0; i < 15; i++) await Promise.resolve(); });

test('the real account id works without a phone; only an auth-confirmed phone is used for self detection', () => {
  assert.deepEqual(plain(messages.goAccountIdentity(null)), { userId: null, phone: '' });
  for (const extra of [{}, { phone: confirmedPhone }, { user_metadata: { phone: confirmedPhone, phone_verified: true } },
    { phone: confirmedPhone, phone_confirmed_at: 'invalid' }, { phone: confirmedPhone, phone_confirmed_at: '' }]) {
    assert.deepEqual(plain(messages.goAccountIdentity(session(account.userId, extra))), account);
  }
  assert.deepEqual(plain(messages.goAccountIdentity(session(account.userId, {
    phone: confirmedPhone, phone_confirmed_at: '2026-11-12T10:00:00Z',
  }))), { ...account, phone: confirmedPhone });
});

test('sent, received and legacy proposals keep the actual counterpart without the old manual phone', () => {
  for (const [entry, expected] of [
    [{ kind: 'sent', phone: otherPhone }, '34600333444'],
    [{ kind: 'received', phone: otherPhone }, '34600333444'],
    [{ kind: 'sent', phone: '', senderPhone: confirmedPhone, receiverPhone: otherPhone }, '34600333444'],
    [{ kind: 'received', phone: '', senderPhone: otherPhone, receiverPhone: confirmedPhone }, '34600333444'],
    [{ kind: 'sent', phone: otherPhone, senderPhone: '+34600999888', receiverPhone: otherPhone }, '34600333444'],
    [{ kind: 'received', phone: '600333444', ownerUserId: account.userId }, '34600333444'],
  ]) {
    const before = JSON.stringify(entry);
    assert.equal(messages.resolveProposalDestination(Object.freeze(entry), account).targetPhone, expected);
    assert.equal(JSON.stringify(entry), before, 'Routing must preserve saved links and data');
  }
});

test('self entries and another account never become external test sends', () => {
  for (const entry of [
    { kind: 'sent', phone: otherPhone, direction: 'self' },
    { kind: 'sent', phone: confirmedPhone },
    { kind: 'received', phone: otherPhone, senderPhone: confirmedPhone, receiverPhone: confirmedPhone },
    { kind: 'sent', phone: otherPhone, ownerUserId: 'another-account' },
    { kind: 'unknown', phone: otherPhone },
    { kind: 'sent', phone: '' },
  ]) assert.equal(messages.resolveProposalDestination(entry, { ...account, phone: confirmedPhone }).targetPhone, null);
  assert.equal(messages.resolveProposalDestination({ kind: 'sent', phone: otherPhone }, { userId: null, phone: '' }).targetPhone, null);
});

async function identityFixture({ current = session(), failPreference = false, persisted, deviceId = 'existing-device' } = {}) {
  let auth = current, readOverride, identity;
  const events = new Set(), activity = new Set(), writes = [], warnings = [];
  const data = persisted ?? new Map([
    ['go_demo_self_send_enabled', 'true'], ['go_user_phone_v1', '+34600999888'],
    ['go_user_phone', '+34600777666'], ['go_device_id_v1', deviceId],
    ['go_push_token_v1', 'existing-registration'], ['go_log_v1', '[{"id":"preserved"}]'],
  ]);
  const storage = {
    getItem: () => { throw Error('Identity must never read the old phone or demo preference'); },
    async setItem(key, value) {
      if (failPreference) throw Error('Storage unavailable');
      writes.push([key, value]); data.set(key, value);
    },
  };
  const { useGoAccountIdentity } = evaluate('hooks/useGoAccountIdentity.ts', {
    '@/lib/goMessageIdentity': messages,
    '@/lib/authSession': { readAuthSession: async () => readOverride ? readOverride() : auth },
    '@/lib/sessionEvents': { onSessionChanged: callback => { events.add(callback); return () => events.delete(callback); } },
    '@react-native-async-storage/async-storage': storage,
    'react-native': { AppState: { addEventListener: (_name, callback) => {
      activity.add(callback); return { remove: () => activity.delete(callback) };
    } } },
  });
  function Probe() { identity = useGoAccountIdentity(); return null; }
  const root = createRoot(document.createElement('div'));
  const warn = console.warn; console.warn = (...args) => warnings.push(args);
  try { await settle(() => root.render(React.createElement(Probe))); } finally { console.warn = warn; }
  return {
    data, writes, warnings, get identity() { return plain(identity); },
    async account(next) { await settle(() => { auth = next; for (const callback of events) callback(); }); },
    readWith(callback) { readOverride = callback; },
    async foreground() { await settle(() => { for (const callback of activity) callback('active'); }); },
    async close() { await settle(() => root.unmount()); assert.equal(events.size, 0); assert.equal(activity.size, 0); },
  };
}

test('upgrade retires an enabled preference and preserves phone drafts, device registration and GO history across reopening', async () => {
  const f = await identityFixture();
  try {
    assert.deepEqual(f.identity, account);
    assert.equal(f.data.get('go_demo_self_send_enabled'), 'false');
    assert.deepEqual(f.writes, [['go_demo_self_send_enabled', 'false']]);
    assert.equal(f.data.get('go_user_phone_v1'), '+34600999888');
    assert.equal(f.data.get('go_user_phone'), '+34600777666');
    assert.equal(f.data.get('go_device_id_v1'), 'existing-device');
    assert.equal(f.data.get('go_push_token_v1'), 'existing-registration');
    assert.equal(f.data.get('go_log_v1'), '[{"id":"preserved"}]');
    await f.foreground(); assert.deepEqual(f.identity, account);
  } finally { await f.close(); }
  const reopened = await identityFixture({ persisted: f.data });
  try { assert.deepEqual(reopened.identity, account); } finally { await reopened.close(); }
});

test('a new login, logout and the same account on a new device require no manual phone', async () => {
  const f = await identityFixture({ current: null });
  try {
    assert.deepEqual(f.identity, { userId: null, phone: '' });
    await f.account(session()); assert.deepEqual(f.identity, account);
    await f.account(session('account-b')); assert.deepEqual(f.identity, { userId: 'account-b', phone: '' });
    await f.account(null); assert.deepEqual(f.identity, { userId: null, phone: '' });
  } finally { await f.close(); }
  const secondDevice = await identityFixture({ current: session(), deviceId: 'second-device' });
  try {
    assert.deepEqual(secondDevice.identity, account);
    assert.equal(secondDevice.data.get('go_device_id_v1'), 'second-device');
  } finally { await secondDevice.close(); }
});

test('late session reads cannot restore the prior account or leak its confirmed phone', async () => {
  const f = await identityFixture({ current: session(account.userId, { phone: confirmedPhone, phone_confirmed_at: '2026-11-12' }) });
  let release;
  try {
    f.readWith(() => new Promise(resolve => { release = resolve; }));
    await f.account(session('account-b'));
    assert.deepEqual(f.identity, { userId: null, phone: '' });
    const stale = release;
    await f.account(null);
    await settle(() => stale(session()));
    assert.deepEqual(f.identity, { userId: null, phone: '' });
    await settle(() => release(null));
    assert.deepEqual(f.identity, { userId: null, phone: '' });
  } finally { await f.close(); }
});

const home = ts.createSourceFile('home.tsx', fs.readFileSync('app/index.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const actions = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['sendProposalViaWhatsApp', 'createReminder', 'injectDemoReceivedGo'].includes(node.name.getText(home))) {
    actions.set(node.name.getText(home), node.initializer.getText(home));
  }
  ts.forEachChild(node, visit);
}
visit(home);
function action(name, context) {
  assert.ok(actions.has(name));
  const scope = { exports: {}, ...context };
  vm.runInNewContext(ts.transpileModule(`exports.run = ${actions.get(name)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, scope);
  return scope.exports.run;
}

test('the actual personal reminder belongs to the session and saves locally with no phone or external send', () => {
  let entries = [];
  const run = action('createReminder', {
    accountIdentity: account, userGoPhone: '', remindTime: '12:00', remindDateLabel: 'Hoy', remindDateISO: '2030-01-07',
    remindText: 'Aviso propio', makeUid: () => 'reminder', t: key => key,
    setGoLog: update => { entries = update(entries); }, persistLog() {},
    setRemindOpen() {}, setRemindText() {}, setRemindTime() {}, setRemindPreset() {},
    Haptics: { notificationAsync() {}, NotificationFeedbackType: { Success: 1 } }, showToast() {},
    Linking: { openURL() { assert.fail('Personal reminders must never open an external chat'); } },
  });
  run();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].ownerUserId, account.userId);
  assert.equal(entries[0].phone, ''); assert.equal(entries[0].direction, 'self');
  assert.equal(entries[0].notes, 'Aviso propio');
});

test('the legacy received-GO simulator is restricted to internal owner development and does not require a manual phone', () => {
  for (const [dev, owner, userId] of [[false, true, account.userId], [true, false, account.userId], [true, true, null]]) {
    action('injectDemoReceivedGo', { __DEV__: dev, adminAccess: { isOwner: owner }, accountIdentity: { userId } })();
  }
  let entries = [];
  action('injectDemoReceivedGo', {
    __DEV__: true, adminAccess: { isOwner: true }, accountIdentity: account, userGoPhone: '',
    Haptics: { notificationAsync: async () => {}, NotificationFeedbackType: { Success: 1 } },
    favoriteContacts: [{ name: 'Contacto elegido', phone: otherPhone }],
    formatISODate: () => '2030-01-07', getToday: () => new Date(), makeUid: () => 'internal-demo',
    setGoLog: update => { entries = update(entries); }, persistLog() {}, showToast() {}, t: key => key,
    console: { log() {} },
  })();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].ownerUserId, account.userId);
  assert.equal(entries[0].senderPhone, otherPhone); assert.equal(entries[0].receiverPhone, '');
});

test('the actual proposal sender opens the counterpart chat even if the old enabled preference cannot be cleared', async () => {
  const f = await identityFixture({ failPreference: true });
  try {
    assert.equal(f.data.get('go_demo_self_send_enabled'), 'true');
    assert.equal(f.warnings.length, 1);
    const urls = [], context = { accountIdentity: f.identity, resolveProposalDestination: messages.resolveProposalDestination,
      Linking: { openURL: async url => urls.push(url) }, encodeURIComponent };
    const send = action('sendProposalViaWhatsApp', context);
    assert.equal(send({ kind: 'sent', phone: otherPhone, receiverPhone: otherPhone, senderPhone: confirmedPhone }, 'Cambio real'), true);
    assert.deepEqual(urls, ['https://wa.me/34600333444?text=Cambio%20real']);
    assert.equal(send({ kind: 'received', phone: otherPhone, direction: 'self' }, 'No enviar'), false);
    assert.equal(urls.length, 1);
  } finally { await f.close(); }
});
