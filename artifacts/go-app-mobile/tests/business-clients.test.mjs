import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fixture } from './helpers/calendar-fixture.mjs';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('data/businessClients.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: module.exports, Map });
const { businessClientsFromBookings, searchBusinessClients } = module.exports;
const business = '11111111-1111-4111-8111-111111111111';
const otherBusiness = '22222222-2222-4222-8222-222222222222';
const client = '33333333-3333-4333-8333-333333333333';
const otherClient = '44444444-4444-4444-8444-444444444444';
const row = (id, businessId, customerId, name, startDatetime) => ({ id, businessId, customerId, startDatetime, receipt: { customerName: name, customerPhone: 'not-for-client-list' } });

test('clients derive only from authorized business bookings, without duplicating a repeat visitor or exposing phone', () => {
  const clients = businessClientsFromBookings([
    row('one', business, client, 'Ana', '2030-01-01T10:00:00'),
    row('two', business, client, 'Ana María', '2030-02-01T10:00:00'),
    row('three', otherBusiness, otherClient, 'Other business client', '2030-03-01T10:00:00'),
    row('four', business, otherClient, '', '2030-01-15T10:00:00'),
  ], business);
  assert.equal(clients.length, 2);
  assert.equal(clients[0].id, client);
  assert.equal(clients[0].name, 'Ana María');
  assert.equal(clients[0].bookingCount, 2);
  assert.equal(clients[1].name, '');
  assert.equal(JSON.stringify(clients).includes('not-for-client-list'), false);
  assert.equal(JSON.stringify(clients).includes('Other business client'), false);
  assert.equal(searchBusinessClients(clients, 'maría').length, 1);
  assert.equal(searchBusinessClients(clients, otherClient).length, 1);
  assert.deepEqual(Array.from(businessClientsFromBookings([], business)), []);
});

const nodes = (tree, match) => tree && typeof tree === 'object' ? [...(match(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => nodes(child, match))] : [];
const text = tree => nodes(tree, node => node.type === 'Text').flatMap(node => node.children).filter(value => typeof value === 'string').join(' ');
const screen = () => { const f = fixture(), Component = f.load('components/empresa/BusinessClientsScreen.tsx').BusinessClientsScreen; return { f, Component }; };

test('client screen searches authorized receipts, opens a minimal detail and never offers unsaved editing', () => {
  const { f, Component } = screen();
  const props = { mode: 'real', businessId: business, authorized: true, loading: false, error: '', isDark: false,
    bookings: [row('one', business, client, 'Ana', '2030-01-01T10:00:00'), row('two', business, client, 'Ana', '2030-02-01T10:00:00')] };
  let tree = f.render(Component, props);
  assert.equal(nodes(tree, node => node.props?.testID === `business-client-${client}`).length, 1);
  assert.equal(nodes(tree, node => node.type === 'TextInput').length, 1);
  nodes(tree, node => node.props?.testID === 'business-clients-search')[0].props.onChangeText('missing');
  tree = f.render(Component, props); assert.equal(nodes(tree, node => node.props?.testID === `business-client-${client}`).length, 0);
  nodes(tree, node => node.props?.testID === 'business-clients-search')[0].props.onChangeText('Ana');
  tree = f.render(Component, props);
  nodes(tree, node => node.props?.testID === `business-client-${client}`)[0].props.onPress();
  tree = f.render(Component, props);
  assert.equal(nodes(tree, node => node.props?.testID === 'business-client-detail').length, 1);
  assert.ok(text(tree).includes('almacenamiento seguro'));
  assert.equal(nodes(tree, node => node.type === 'TextInput').length, 1);
});

test('empty, failed and unauthorized client reads do not expose an old list', () => {
  const props = { mode: 'real', businessId: business, bookings: [row('one', business, client, 'Ana', '2030-01-01T10:00:00')], loading: false, error: '', authorized: true, isDark: false };
  for (const changes of [{ bookings: [] }, { error: 'network failed' }, { authorized: false }]) {
    const { f, Component } = screen(); const tree = f.render(Component, { ...props, ...changes });
    assert.equal(nodes(tree, node => node.props?.testID === `business-client-${client}`).length, 0);
  }
});

test('DEMO clients search, filter favorites and edit or clear separate fields', async () => {
  const { f, Component } = screen();
  let clients = [
    { id: 'demo-one', name: 'Cliente Sol · DEMO', favorite: true, observations: 'Habitual', servicePreferences: 'Corte corto' },
    { id: 'demo-two', name: 'Cliente Luna · DEMO', favorite: false, observations: '', servicePreferences: '' },
  ];
  const update = async (id, patch) => { clients = clients.map(client => client.id === id ? { ...client, ...patch } : client); };
  const render = () => f.render(Component, { mode: 'demo', demoClients: clients, onUpdateDemoClient: update, isDark: false });
  let tree = render();
  assert.ok(text(tree).includes('Clientes ficticios'));
  assert.equal(nodes(tree, node => node.props?.testID?.startsWith('business-client-demo-') && !node.props.testID.includes('favorite')).length, 2);
  nodes(tree, node => node.props?.testID === 'business-clients-favorites-filter')[0].props.onPress();tree = render();
  assert.equal(nodes(tree, node => node.props?.testID === 'business-client-demo-two').length, 0);
  nodes(tree, node => node.props?.testID === 'business-clients-favorites-filter')[0].props.onPress();tree = render();
  await nodes(tree, node => node.props?.testID === 'business-client-favorite-demo-two')[0].props.onPress();tree = render();
  assert.equal(clients[1].favorite, true);
  nodes(tree, node => node.props?.testID === 'business-client-demo-two')[0].props.onPress();tree = render();
  nodes(tree, node => node.props?.testID === 'business-client-observations')[0].props.onChangeText('Solo demostración');
  nodes(tree, node => node.props?.testID === 'business-client-preferences')[0].props.onChangeText('Peinado natural');tree = render();
  await nodes(tree, node => node.props?.testID === 'business-client-save')[0].props.onPress();tree = render();
  assert.equal(clients[1].observations, 'Solo demostración');assert.equal(clients[1].servicePreferences, 'Peinado natural');
  await nodes(tree, node => node.props?.testID === 'business-client-clear-observations')[0].props.onPress();tree = render();
  assert.equal(clients[1].observations, '');assert.equal(clients[1].servicePreferences, 'Peinado natural');
  await nodes(tree, node => node.props?.testID === 'business-client-clear-preferences')[0].props.onPress();
  assert.equal(clients[1].servicePreferences, '');
});
