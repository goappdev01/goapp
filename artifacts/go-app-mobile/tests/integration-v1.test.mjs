import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const source = readFileSync('app/index.tsx', 'utf8');
const ast = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) {
  let result;
  function visit(node) {
    if (!result && predicate(node)) result = node;
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(result, 'expected integrated action');
  return result;
}
function evaluate(code, globals = {}) {
  const scope = { exports: {}, ...globals };
  vm.runInNewContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, scope);
  return scope.exports;
}
const translations = evaluate(readFileSync('i18n/translations.ts', 'utf8')).translations;
const declaration = name => find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === name).initializer.getText(ast);
for (const [lang, expected] of [['es', ['TAREA INTERNA', 'TAREA EXTERNA']], ['en', ['INTERNAL TASK', 'EXTERNAL TASK']]]) {
  test('integrated calendar quick-task labels and both existing actions work in ' + lang, () => {
    const options = evaluate('exports.options = ' + declaration('calQuickCreateOptions'), {
      t: key => { assert.ok(key in translations[lang]); return translations[lang][key]; },
    }).options;
    assert.deepEqual(Array.from(options, option => option.label), expected);
    for (const option of options) {
      const calls = [];
      const handle = evaluate('exports.handle = ' + declaration('handleCalQuickCreate'), {
        Haptics: { selectionAsync: async () => {} }, calQuickCreateText: '  Revisar piloto  ',
        dateISODraft: '2026-10-20',
        setCalQuickCreateText: value => calls.push(['text', value]),
        setCalQuickCreateOpen: value => calls.push(['panel', value]),
        setCalOpen: value => calls.push(['calendar', value]),
        openFieldSelector: (...args) => calls.push(['form', ...args]),
      }).handle;
      handle(option.kind);
      assert.deepEqual(calls, [
        ['text', ''], ['panel', false],
        ['form', option.kind, 'Revisar piloto', '', '2026-10-20'],
      ]);
    }
  });
}
test('central GO tap on public User V1 opens the existing AI entry once', () => {
  const attr = find(n => ts.isJsxAttribute(n) && n.name.getText(ast) === 'onPress'
    && n.initializer?.expression?.getText(ast).includes('isUserV1Surface && !aiOpen'));
  let opens = 0;
  const action = evaluate('exports.action = ' + attr.initializer.expression.getText(ast), {
    voiceActive: false, isUserV1Surface: true, aiOpen: false, openAi: () => opens++,
  }).action;
  action();
  assert.equal(opens, 1);
});
