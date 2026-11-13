import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fixture } from './helpers/calendar-fixture.mjs';

const require = createRequire(import.meta.url), ts = require('typescript');
const nodes = (tree, predicate) => !tree || typeof tree !== 'object' ? [] :
  [...(predicate(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => nodes(child, predicate))];
const texts = tree => nodes(tree, node => node.type === 'Text').flatMap(node => node.children).filter(value => typeof value === 'string');

test('DÍA, SEM and MES select three controlled views without opening the month picker', () => {
  const f = fixture(), { GoCalConfigPanel } = f.load('components/GoCalConfigPanel.tsx');
  let selected = 'semana', pickerOpens = 0;
  const props = { density: 'auto', onDensityChange() {}, showHours: true, onShowHoursChange() {},
    dayNightMode: 'mixto', onDayNightModeChange() {}, calSize: 'GO_CAL_MEDIUM', onCalSizeChange() {},
    onViewModeChange: value => { selected = value; }, onToggleMonthGrid: () => pickerOpens++ };
  const button = (tree, label) => nodes(tree, node => node.type === 'TouchableOpacity' && texts(node).includes(label))[0];
  for (const [label, mode] of [['MES','mes_lineal'],['DÍA','dia'],['SEM','semana'],['MES','mes_lineal']]) {
    const tree = f.render(GoCalConfigPanel, { ...props, viewMode: selected });
    const target = button(tree, label); assert.ok(target, label); target.props.onPress();
    assert.equal(selected, mode); assert.equal(pickerOpens, 0);
    const reopened = f.render(GoCalConfigPanel, { ...props, viewMode: selected });
    assert.equal(button(reopened, label).props.style[0].backgroundColor, 'rgba(255,255,255,0.20)');
  }
});

test('both Calendar parents pass their actual view to the same panel; only floating controls open the month picker', () => {
  for (const [file, expected] of [['app/index.tsx','calBgViewMode'],['components/booking/GoReservasConfigScreen.tsx','calInnerView']]) {
    const source = readFileSync(file, 'utf8'), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const matches = [];
    function visit(node) { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'GoCalConfigPanel') matches.push(node); ts.forEachChild(node, visit); }
    visit(ast); assert.equal(matches.length, 1, file);
    const attrs = matches[0].attributes.properties;
    const expression = name => attrs.find(attr => attr.name?.getText(ast) === name)?.initializer?.expression?.getText(ast);
    assert.equal(expression('viewMode'), expected, file);
    assert.equal(expression('onToggleMonthGrid'), undefined, file);
    assert.ok(source.includes('name="calendar"'), 'the existing floating calendar button remains');
  }
});

test('MES keeps every date in one horizontally scrollable month with its original booking columns', () => {
  const f = fixture({ now: '2026-10-14T12:00:00' }), { AgendaBoard } = f.load('components/AgendaOperativa.tsx');
  const entry = { id:'booking-31', type:'GO_BOOKING', dateISO:'2026-10-31', date:'31/10/2026', time:'10:00', estado:'aceptado', contactName:'Cliente', kind:'received' };
  const tree = f.render(AgendaBoard, { goLog:[entry], viewMode:'mes_lineal', calViewMonth:'2026-10' });
  const days = nodes(tree, node => typeof node.props.key === 'string' && node.props.key.startsWith('day_'));
  assert.equal(days.length, 31); assert.equal(days[0].props.key, 'day_2026-10-01');
  assert.equal(days.at(-1).props.key, 'day_2026-10-31');
  assert.ok(nodes(tree, node => node.type === 'GHScrollView' && node.props.horizontal).length);
  assert.ok(nodes(days.at(-1), node => node.props.testID === 'calendar-entry-open-booking-31').length);
});
