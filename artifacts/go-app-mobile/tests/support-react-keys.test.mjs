import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const ts=createRequire(import.meta.url)('typescript');
const source=ts.createSourceFile('index.tsx',readFileSync('app/index.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
test('the two mounted support panels have distinct keys for the same user and for anonymous access',()=>{
  const keys=new Map();
  function visit(node){
    if(ts.isJsxSelfClosingElement(node)&&['LandingSupport','SupportAdminPanel'].includes(node.tagName.getText(source))){
      const key=node.attributes.properties.find(prop=>prop.name?.getText(source)==='key');
      assert.ok(key?.initializer&&ts.isJsxExpression(key.initializer));
      keys.set(node.tagName.getText(source),key.initializer.expression.getText(source));
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
  assert.equal(keys.size,2);
  for(const userId of [null,'11111111-1111-4111-8111-111111111111']){
    const adminAccess={userId};
    const actual=[...keys.values()].map(expression=>vm.runInNewContext(expression,{adminAccess}));
    assert.equal(new Set(actual).size,actual.length);
  }
});
