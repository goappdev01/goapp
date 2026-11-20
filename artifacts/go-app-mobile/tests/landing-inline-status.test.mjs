import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';import {renderEntryQuickActions} from './helpers/entry-details-fixture.mjs';const require=createRequire(import.meta.url),{React,createRoot,document,ts}=require('./helpers/react-lifecycle.cjs');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(n,p){if(p(n))return n;let r;ts.forEachChild(n,c=>{if(!r)r=find(c,p)});return r}
test('the contractual state is inside the actual date row and no longer repeated over cancel',()=>{
 const row=find(ast,n=>ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(p=>p.name?.getText(ast)==='testID'&&p.initializer?.getText(ast)==='"landing-date-actions-row"'));
 assert.ok(row.getText(ast).includes('renderEntryQuickActions(g,true,true,undefined,undefined,true)'));
 assert.ok(source.includes('actions={renderEntryQuickActions(g, false, true)}'));assert.ok(source.includes('footerGap={Math.round(3 * uiScaleFactor)}'));
});
test('inline state uses the existing truthful label without actions; normal action callbacks remain present',async()=>{
 const entry={id:'own',estado:'aceptado',type:'GO',dateISO:'2026-11-23',time:'09:00'},container=document.createElement('div');const mounted=createRoot(container);
 try{
  const element=renderEntryQuickActions(entry,true,true);
  await React.act(()=>mounted.render(React.cloneElement(element,{stateOnly:true})));assert.equal(container.textContent,'ACEPTADA');
  await React.act(()=>mounted.render(React.cloneElement(element,{showState:false})));assert.doesNotMatch(container.textContent,/ACEPTADA/);assert.match(container.textContent,/CANCELAR/);assert.match(container.textContent,/PROPONER CAMBIO/);
 }finally{await React.act(()=>mounted.unmount())}
});
