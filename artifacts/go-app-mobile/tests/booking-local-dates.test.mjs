import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {format} from "node:util";
import path from "node:path";
import vm from "node:vm";
const require=createRequire(path.join(process.cwd(),"package.json")),ts=require("typescript");
const source=readFileSync("components/booking/BookingSearchOverlay.tsx","utf8");
const helpers=source.slice(source.indexOf("const DATE_DAY_KEYS"),source.indexOf("// ── Hold Countdown"));
const nativeFile=path.join(path.dirname(require.resolve("react-native/package.json")),"Libraries/Renderer/implementations/ReactFabric-dev.js");
const nativeSource=ts.createSourceFile(nativeFile,readFileSync(nativeFile,"utf8"),ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
let validator;
function find(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==="warnOnInvalidKey")validator=node.getText(nativeSource);else ts.forEachChild(node,find);}find(nativeSource);
assert.ok(validator,"React Native key validator is available");
function checkKeys(days){const warnings=[],exports={};vm.runInNewContext(validator+"\nexports.validate=warnOnInvalidKey;",{exports,Set,
 REACT_ELEMENT_TYPE:Symbol.for("react.transitional.element"),REACT_PORTAL_TYPE:Symbol.for("react.portal"),REACT_LAZY_TYPE:Symbol.for("react.lazy"),
 warnForMissingKey(){},runWithFiberInDEV:(_,fn)=>fn(),console:{error:(...args)=>warnings.push(format(...args))}});
 let keys=null;for(const day of days)keys=exports.validate({}, {},require("react").createElement("Text",{key:day},day),keys);return warnings;}
function run(date,zone,assertion){const previous=process.env.TZ;process.env.TZ=zone;try{const exports={};vm.runInNewContext(ts.transpileModule(helpers+"\nexports.days=getDaysRange;exports.label=formatDateLabel;",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,getToday:()=>new Date(date),formatISODate:d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")});assertion(exports);}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}}
test("Madrid winter-time transition renders 21 unique date keys with the real React Native validator",()=>run("2026-10-11T00:00:00","Europe/Madrid",api=>{
 const days=api.days(21),warnings=checkKeys(days);assert.deepEqual(warnings,[],warnings.join("\n"));assert.equal(days.length,21);assert.equal(new Set(days).size,21);assert.equal(days.at(-1),"2026-10-31");
}));
test("tomorrow after the Madrid winter-time transition is October 26",()=>run("2026-10-25T00:00:00","Europe/Madrid",api=>{assert.equal(api.label("2026-10-26",key=>key),"status_tomorrow");}));
test("Madrid summer-time transition preserves consecutive calendar dates",()=>run("2026-03-22T00:00:00","Europe/Madrid",api=>{const days=api.days(21);assert.equal(new Set(days).size,21);assert.equal(days.at(-1),"2026-04-11");assert.deepEqual(checkKeys(days),[]);}));
test("a different winter-time transition also has unique dates",()=>run("2026-10-25T00:00:00","America/New_York",api=>{const days=api.days(21);assert.deepEqual(checkKeys(days),[]);assert.equal(days.at(-1),"2026-11-14");}));
