import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { React, createRoot, document, ts } = require('./tests/helpers/react-lifecycle.cjs');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
  alwaysStrict: false, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;
function load(file, imports = {}) {
  const scope = { exports: {}, Date, console, require: name => {
    if (name in imports) return imports[name];
    throw Error('Unexpected dependency ' + name);
  } };
  vm.runInNewContext(compile(file), scope, { filename: file });
  return scope.exports;
}
const stores = load('data/businessDemoStore.ts');
const services = load('data/bookingServices.ts');
const repositories = load('data/demoBookingRepository.ts', { './businessDemoStore': stores, './bookingServices': services });
const cloud = { isCloudId: () => false, getOwnedBookableItems: async () => { throw Error('Cloud read'); },
  createBookableItem: async () => { throw Error('Cloud write'); }, saveBookableItem: async () => { throw Error('Cloud write'); } };
const associations = load('data/catalogAssociations.ts', { './booking': cloud });
const content = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(content).join('') : content(node?.props?.children ?? '');

test('service configuration shows inline associated products without the separate catalogue panel', () => {
  const screen = fs.readFileSync('components/empresa/EmpresaConfigScreen.tsx', 'utf8');
  assert.match(screen, /<ServiceAssociatedProducts\b/);
  assert.doesNotMatch(screen, /<CatalogAssociationManager\b/);
  assert.doesNotMatch(screen, /import\s+\{\s*CatalogAssociationManager\s*\}/);
  assert.match(fs.readFileSync('components/empresa/CatalogAssociationManager.tsx', 'utf8'), /export function CatalogAssociationManager\b/);
});

async function fixture() {
  const memory = new Map(), owner = '11111111-1111-4111-8111-111111111111';
  const options = { ownerUserId: owner, storage: { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => memory.set(key, value) },
    canUse: () => true, initialConfig: { services: [], plantillaItems: [], activeDays: [], completedSteps: [], staffSchedules: {} } };
  const store = stores.createBusinessDemoStore(options);
  await store.updateConfig({ services: [{ name: 'Corte', duration: 30, price: 20 }], subId: 'peluqueria' });
  const props = new Map(), photoButtons = new Map(), calls = { flush: 0 };
  const native = name => value => { const id = React.useId(); props.set(id, { ...value, native: name });
    return React.createElement('div', { 'data-prop-id': id }, value.children); };
  const components = Object.fromEntries(['View', 'Text', 'TextInput', 'TouchableOpacity'].map(name => [name, native(name)]));
  const { ServiceAssociatedProducts, useServiceComplementCatalog } = load('components/empresa/ServiceComplementManager.tsx', {
    react: React, 'react-native': components, '@/data/booking': cloud, '@/data/catalogAssociations': associations,
    '@/data/demoBookingRepository': repositories, '@/contexts/GoBusinessConfigContext': { useBusinessConfig: () => ({ demo: store }) },
    '@/contexts/LanguageContext': { useLanguage: () => ({ lang: 'es' }) }, '@/lib/sessionEvents': { onSessionChanged: () => () => {} },
    './CatalogPhotoButton': { CatalogPhotoButton: value => { photoButtons.set(value.id, value); return React.createElement('div'); } },
  });
  const container = document.createElement('div'), root = createRoot(container);
  const descendants = node => [node, ...node.childNodes.flatMap(descendants)];
  const visible = () => descendants(container).filter(node => node.attributes?.['data-prop-id']).map(node => props.get(node.attributes['data-prop-id']));
  const settle = async (fn = () => {}) => React.act(async () => { await fn(); for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); });
  function InlineProducts() {
    const catalog = useServiceComplementCatalog(store.businessId, true, true);
    return React.createElement(ServiceAssociatedProducts, { serviceName: 'Corte', catalog, beforeSave: async () => { calls.flush++; } });
  }
  await settle(() => root.render(React.createElement(InlineProducts)));
  const press = async title => { const button = visible().find(value => value.native === 'TouchableOpacity' && value.accessibilityLabel === title);
    assert.ok(button, title); await settle(() => button.onPress()); };
  const field = title => { const input = visible().filter(value => value.native === 'TextInput' && value.accessibilityLabel === title).at(-1);
    assert.ok(input, title); return input; };
  return { store, memory, owner, options, calls, container, visible, settle, press, photoButtons,
    edit: async (title, value) => settle(() => field(title).onChangeText(value)),
    rename: async (oldName, newName) => { const input = visible().find(value => value.native === 'TextInput' && value.value === oldName);
      assert.ok(input, oldName); await settle(() => input.onChangeText(newName)); await settle(() => input.onBlur()); },
    blur: async title => settle(() => field(title).onBlur()),
    close: async () => settle(() => root.unmount()) };
}

test('a supplement needs an explicit price with at most two decimals; free is explicit', () => {
  for (const value of ['', ' ', '-1', '1,234', 'abc', '100000000']) assert.throws(() => associations.parseEuroSupplement(value));
  for (const [input, expected] of [['0', 0], ['0,00', 0], ['5,25', 5.25], ['7.1', 7.1]])
    assert.equal(associations.parseEuroSupplement(input), expected);
});

test('a supplement from another company cannot appear in or be selected for a service', () => {
  const root = { id: 'cut-a', businessId: 'business-a', title: 'Corte', catalogKind: 'service', durationMinutes: 30,
    price: 20, currency: 'EUR', active: true, visible: true };
  const foreign = { ...root, id: 'product-b', businessId: 'business-b', title: 'Ampolla', catalogKind: 'product', durationMinutes: 0, price: 5 };
  const edge = { id: 'edge', business_id: 'business-a', source_id: root.id, target_id: foreign.id, mode: 'optional', active: true, revision: 1 };
  assert.equal(services.localCatalogQuote('business-a', [root, foreign], [edge], [root.id]).options.length, 0);
  assert.throws(() => services.localCatalogQuote('business-a', [root, foreign], [edge], [root.id], [edge.id]));
});

test('inline service rows add, edit and remove multiple optional products without touching cloud', async () => {
  const f = await fixture();
  try {
    assert.match(f.container.textContent, /Productos asociados/);
    assert.doesNotMatch(f.container.textContent, /Complementos por servicio|Incluido|Recomendado/);
    const repo = repositories.createDemoBookingRepository(f.store), root = (await repo.getBookableItems(f.store.businessId))[0];
    assert.equal((await repo.quoteCatalog(f.store.businessId, [root.id])).totalPrice, 20);
    await f.press('Añadir producto asociado a Corte');
    await f.edit('Nombre del producto asociado de Corte', 'Mascarilla'); await f.blur('Nombre del producto asociado de Corte');
    assert.match(f.container.textContent, /Completa nombre y precio/);
    assert.equal(f.store.getSnapshot().config.catalogProducts?.length ?? 0, 0);
    await f.edit('Precio de Mascarilla', '5,25'); await f.blur('Precio de Mascarilla');
    await f.press('Añadir producto asociado a Corte');
    await f.edit('Nombre del producto asociado de Corte', 'Ampolla'); await f.edit('Precio de Ampolla', '0,00'); await f.blur('Precio de Ampolla');
    await f.press('Añadir producto asociado a Corte');
    await f.edit('Nombre del producto asociado de Corte', 'Tratamiento'); await f.edit('Precio de Tratamiento', '8,00'); await f.blur('Precio de Tratamiento');
    const saved = f.store.getSnapshot().config;
    assert.equal(saved.catalogAssociations.length, 3);
    assert.ok(saved.catalogAssociations.every(edge => edge.source_id === root.id && edge.mode === 'optional'));
    assert.deepEqual(JSON.parse(JSON.stringify(saved.catalogProducts.map(item => [item.title, item.price, item.durationMinutes, item.customerCapacity]))),
      [['Mascarilla', 5.25, 0, 1], ['Ampolla', 0, 0, 1], ['Tratamiento', 8, 0, 1]]);
    const plain = await repo.quoteCatalog(f.store.businessId, [root.id]);
    assert.equal(plain.totalPrice, 20); assert.equal(plain.options.length, 3);
    const both = await repo.quoteCatalog(f.store.businessId, [root.id], plain.options.map(option => option.associationId));
    assert.equal(both.totalPrice, 33.25); assert.equal(both.lines.length, 4);
    await f.edit('Precio de Mascarilla', '7,10'); await f.blur('Precio de Mascarilla');
    assert.equal((await repo.quoteCatalog(f.store.businessId, [root.id], both.selectedAssociationIds)).totalPrice, 35.1);
    assert.equal(both.totalPrice, 33.25, 'the accepted quote remains an immutable value after a catalogue edit');
    await f.rename('Mascarilla', 'Mascarilla hidratante');
    assert.ok((await repo.quoteCatalog(f.store.businessId, [root.id])).options.some(option => option.name === 'Mascarilla hidratante'));
    await f.press('Eliminar Ampolla');
    assert.equal((await repo.quoteCatalog(f.store.businessId, [root.id])).options.length, 2);
    const reopened = stores.createBusinessDemoStore(f.options); await reopened.load();
    assert.equal(reopened.getSnapshot().config.catalogAssociations.length, 2);
    assert.equal(reopened.getSnapshot().config.catalogProducts.length, 3, 'removal preserves historical product data');
  } finally { await f.close(); }
});

test('an associated DEMO product keeps an example photo through save, replacement and reopen', async () => {
  const f = await fixture();
  try {
    await f.press('Añadir producto asociado a Corte');
    const draftId = [...f.photoButtons.keys()].find(id => id.startsWith('draft_'));
    assert.ok(draftId);
    await f.settle(() => f.photoButtons.get(draftId).onChange('demo-catalog:croquetas'));
    await f.edit('Nombre del producto asociado de Corte', 'Ampolla');
    await f.edit('Precio de Ampolla', '5,00');
    await f.blur('Precio de Ampolla');
    const edge = f.store.getSnapshot().config.catalogAssociations[0];
    assert.equal(f.store.getSnapshot().config.catalogProducts[0].photoUri, 'demo-catalog:croquetas');
    await f.settle(() => f.photoButtons.get(edge.id).onChange('demo-catalog:gazpacho'));
    assert.equal(f.store.getSnapshot().config.catalogProducts[0].photoUri, 'demo-catalog:gazpacho');
    const reopened = stores.createBusinessDemoStore(f.options); await reopened.load();
    const repo = repositories.createDemoBookingRepository(reopened);
    assert.equal((await repo.getCatalogItems(reopened.businessId)).find(item => item.id === edge.target_id).photoUri, 'demo-catalog:gazpacho');
    assert.equal((await repo.quoteCatalog(reopened.businessId, [edge.source_id], [edge.id])).totalPrice, 25);
    await f.settle(() => f.photoButtons.get(edge.id).onChange('none'));
    assert.equal(f.store.getSnapshot().config.catalogProducts[0].photoUri, 'none');
  } finally { await f.close(); }
});

test('a real company saves one optional association through the existing owned catalogue APIs', async () => {
  const businessId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const sourceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const targetId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const catalog = [{ id: sourceId, businessId, title: 'Corte', catalogKind: 'service', active: true, visible: true, price: 20, currency: 'EUR' }];
  const edges = [], writes = [];
  const remote = { isCloudId: () => true, getOwnedBookableItems: async id => { assert.equal(id, businessId); return catalog; },
    createBookableItem: async item => { writes.push(['product', item]); const saved = { ...item, id: targetId }; catalog.push(saved); return saved; },
    saveBookableItem: async () => { throw Error('Unexpected edit'); } };
  const api = { parseEuroSupplement: associations.parseEuroSupplement,
    manageAssociations: async (id, operation, input) => {
      assert.equal(id, businessId);
      if (operation === 'list') return edges;
      writes.push(['association', operation, input]);
      if (operation === 'create') edges.push({ id: 'edge', business_id: businessId, source_id: input.sourceId, target_id: input.targetId, mode: input.mode, active: true, revision: 1 });
      return edges;
    } };
  const photoButtons = new Map();
  const props = new Map(), native = name => value => { const id = React.useId(); props.set(id, { ...value, native: name });
    return React.createElement('div', { 'data-prop-id': id }, value.children); };
  const components = Object.fromEntries(['View', 'Text', 'TextInput', 'TouchableOpacity'].map(name => [name, native(name)]));
  const { ServiceAssociatedProducts, useServiceComplementCatalog } = load('components/empresa/ServiceComplementManager.tsx', { react: React, 'react-native': components,
    '@/data/booking': remote, '@/data/catalogAssociations': api, '@/data/demoBookingRepository': {},
    '@/contexts/GoBusinessConfigContext': { useBusinessConfig: () => ({ demo: null }) },
    '@/contexts/LanguageContext': { useLanguage: () => ({ lang: 'es' }) }, '@/lib/sessionEvents': { onSessionChanged: () => () => {} },
    './CatalogPhotoButton': { CatalogPhotoButton: value => { photoButtons.set(value.id,value); return null; } } });
  function InlineProducts() {
    const owned = useServiceComplementCatalog(businessId, false, true);
    return React.createElement(ServiceAssociatedProducts, { serviceName: 'Corte', catalog: owned, beforeSave: async () => {} });
  }
  const container = document.createElement('div'), root = createRoot(container);
  const descendants = node => [node, ...node.childNodes.flatMap(descendants)];
  const visible = () => descendants(container).filter(node => node.attributes?.['data-prop-id']).map(node => props.get(node.attributes['data-prop-id']));
  const settle = async fn => React.act(async () => { await fn(); for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); });
  const press = async title => { const button = visible().find(value => value.native === 'TouchableOpacity' && value.accessibilityLabel === title);
    assert.ok(button, title); await settle(() => button.onPress()); };
  const edit = async (title, value) => { const field = visible().find(input => input.native === 'TextInput' && input.accessibilityLabel === title);
    assert.ok(field, title); await settle(() => field.onChangeText(value)); };
  try {
    await settle(() => root.render(React.createElement(InlineProducts)));
    await press('Añadir producto asociado a Corte');
    const draftId=[...photoButtons.keys()].find(id=>id.startsWith('draft_'));
    assert.ok(draftId);assert.equal(photoButtons.get(draftId).demo,false);
    await settle(()=>photoButtons.get(draftId).onChange('demo-catalog:salon-rulos'));
    await edit('Nombre del producto asociado de Corte', 'Ampolla'); await edit('Precio de Ampolla', '2,50');
    const price = visible().find(input => input.native === 'TextInput' && input.accessibilityLabel === 'Precio de Ampolla');
    await settle(() => price.onBlur());
    assert.equal(writes.length, 2);
    assert.equal(writes[0][0], 'product'); assert.equal(writes[0][1].price, 2.5);
    assert.equal(writes[0][1].durationMinutes, 0); assert.equal(writes[0][1].currency, 'EUR');
    assert.equal(writes[0][1].photoUri,'demo-catalog:salon-rulos');
    assert.deepEqual(JSON.parse(JSON.stringify(writes[1])), ['association', 'create', { sourceId, targetId, mode: 'optional' }]);
    assert.equal(edges[0].sort_order, undefined);
  } finally { await settle(() => root.unmount()); }
});
