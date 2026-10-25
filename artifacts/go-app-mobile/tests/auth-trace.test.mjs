import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
const code=ts.transpileModule(readFileSync('lib/authTrace.ts','utf8'),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function fixture(dev=true,failure=false){const messages=[];const scope={exports:{},__DEV__:dev,Date,console:{info:(...args)=>{if(failure)throw Error('unavailable log');messages.push(args);}}};vm.runInNewContext(code,scope);return{...scope.exports,messages};}
test('diagnostic allowlist rejects credentials, identities, URLs and arbitrary payloads',()=>{
 const f=fixture();f.recordAuthTrace('request.end',{status:429,route:'identity',access_token:'fictional-secret',email:'fictional@test.invalid',userId:'fictional-user',url:'https://fictional.invalid',password:'fictional-password',payload:{refresh_token:'fictional-refresh'}});
 const raw=JSON.stringify(f.messages);assert.doesNotMatch(raw,/fictional|token|email|userId|password|payload|https:/);assert.match(raw,/429/);
 f.recordAuthTrace('fake-event',{status:200});f.recordAuthTrace('home.presentation',{context:'fictional-secret',screen:'fictional-password'});
 assert.equal(f.readAuthTrace().length,2);assert.equal(f.readAuthTrace()[1].context,undefined);assert.equal(f.readAuthTrace()[1].screen,undefined);
});
test('diagnostic logs and memory are bounded to 120 events without storage or network',()=>{
 const f=fixture();for(let i=0;i<1000;i++)f.recordAuthTrace('home.mount');assert.equal(f.messages.length,120);assert.equal(f.readAuthTrace().length,120);
 const list=f.readAuthTrace();list[0].event='fake';assert.equal(f.readAuthTrace()[0].event,'home.mount');
 assert.doesNotMatch(code,/AsyncStorage|SecureStore|fetch\(/);
});
test('production is silent and logging failures cannot break session operations',()=>{
 const f=fixture(false);f.recordAuthTrace('home.mount');assert.equal(f.messages.length,0);assert.equal(f.readAuthTrace().length,0);
 const throwing=fixture(true,true);assert.doesNotThrow(()=>throwing.recordAuthTrace('home.mount'));assert.equal(throwing.readAuthTrace().length,1);
});
