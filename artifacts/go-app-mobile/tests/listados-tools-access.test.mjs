import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript'),source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];
(function walk(n){all.push(n);ts.forEachChild(n,walk)})(ast);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const sheet=all.find(n=>ts.isJsxOpeningElement(n)&&n.tagName.getText(ast)==='BottomSheet'&&n.attributes.properties.some(p=>p.name?.getText(ast)==='visible'&&p.initializer?.expression?.getText(ast)==='listOpen'));
test('gear toggles only local state and leaving Listados closes it',()=>{
 const gear=all.find(n=>ts.isJsxSelfClosingElement(n)&&n.attributes.properties.some(p=>p.name?.getText(ast)==='testID'&&p.initializer?.text==='listados-tools-toggle'));
 const handler=gear.attributes.properties.find(p=>p.name?.getText(ast)==='onPress').initializer.expression.getText(ast);
 let open=false;const context={Haptics:{selectionAsync:async()=>{}},setListToolsOpen:fn=>{open=fn(open);}};
 vm.runInNewContext(compile('('+handler+')()'),context);assert.equal(open,true);vm.runInNewContext(compile('('+handler+')()'),context);assert.equal(open,false);
 assert.doesNotMatch(handler,/handleOpenOptions|setOptionsOpen/);assert.match(source,/if \(!listOpen\) setListToolsOpen\(false\)/);
 assert.equal(sheet.attributes.properties.some(p=>p.name?.getText(ast)==='screenOverlay'),false);
 const pop=sheet.attributes.properties.find(p=>p.name?.getText(ast)==='headerPopover').getText(ast);assert.match(pop,/listToolsOpen/);assert.match(pop,/toggleGoSortOrder/);assert.match(pop,/cycleListSize/);
});
test('popup is an absolute measured overlay, with no reserved row or global tools injection',()=>{
 assert.match(source,/top:headerPopoverTop/);assert.match(source,/setHeaderPopoverTop\(y\+height-sy\+4\)/);
 assert.match(source,/testID="sheet-header-popover" pointerEvents="box-none"/);
 assert.doesNotMatch(sheet.attributes.properties.find(p=>p.name?.getText(ast)==='footer').getText(ast),/ListadosSizeControl|ListadosTools/);
 assert.equal((source.match(/testID="listados-tools-toggle"/g)||[]).length,1);
 assert.doesNotMatch(source,/listTools=\{/);assert.match(source,/!listOpen && renderToolsPanel\(\)/);
});
