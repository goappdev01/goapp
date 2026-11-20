import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript'),text=fs.readFileSync('components/calendarDragDiagnostics.ts','utf8'),code=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
test('development trace bounds event volume, contains numeric snapshots and never writes in production',()=>{
 let now=0;const scope={exports:{},__DEV__:true,Date:{now:()=>now},Map};vm.runInNewContext(code,scope);
 for(let i=0;i<1000;i++){scope.exports.traceCalendarDrag({phase:'native',nativeOffset:i});now+=101;}
 const read=scope.__GO_CALENDAR_DRAG_TRACE__;assert.equal(typeof read,'function');const rows=read();assert.equal(rows.length,480);assert.equal(rows.at(-1).nativeOffset,999);rows[0].nativeOffset=-1;assert.notEqual(read()[0].nativeOffset,-1);
 scope.exports.traceCalendarDrag({phase:'native',nativeOffset:1000});scope.exports.traceCalendarDrag({phase:'native',nativeOffset:1001});assert.equal(read().at(-1).nativeOffset,1000);
 const prod={exports:{},__DEV__:false,Date,Map};vm.runInNewContext(code,prod);prod.exports.traceCalendarDrag({phase:'start'});assert.equal(prod.__GO_CALENDAR_DRAG_TRACE__,undefined);
 assert.doesNotMatch(text,/setInterval|setTimeout|console\.|AsyncStorage|fetch\(/);
});
