import test from 'node:test';
import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript'),source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
(function walk(n){nodes.push(n);ts.forEachChild(n,walk)})(ast);
const code=ts.transpileModule(['persistBookingProposal','dropBookingProposal'].map(name=>'const '+nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name).getText(ast)+';').join('\n')+';exports.drop=dropBookingProposal;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const entry={id:'entry',reservationId:'original',businessId:'salon',ownerUserId:'owner',businessBooking:true,bookingChangeRevision:7,changeProposal:{id:'prior'},time:'13:00'};
const destination={dateISO:'2030-01-08',time:'17:30'};
function fixture({repository,context='BUSINESS',failure}={}){
 const alerts=[],calls=[],errors=[];
 const scope={exports:{},lang:'es',Alert:{alert:(...args)=>alerts.push(args)},proposalRepository:()=>repository,
 customerBookings:{mutate:async(...args)=>{calls.push(['customer',...args]);if(failure)throw Error('slot unavailable');}},
 bookingContextRef:{current:{view:context,businessId:'salon'}},negotiateRealBooking:async(...args)=>{calls.push(['remote',...args]);},showToast(){},showBookingChangeError:error=>errors.push(error.message),openBookingProposal:()=>assert.fail('Services must not open'),setBookingProposal:()=>assert.fail('Services must not open')};
 vm.runInNewContext(code,scope);return {...scope.exports,alerts,calls,errors};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('a drop confirms only its date/time; cancellation and duplicate confirmation do not navigate or duplicate',async()=>{
 const f=fixture(),before=JSON.stringify(entry);f.drop(entry,destination,'customer');assert.equal(f.calls.length,0);assert.equal(f.alerts[0][2][0].style,'cancel');assert.equal(JSON.stringify(entry),before);
 f.drop(entry,destination,'customer');f.alerts[1][2][1].onPress();f.alerts[1][2][1].onPress();await flush();assert.equal(f.calls.length,1);
 const [kind,original,operation,input]=f.calls[0];assert.equal(kind,'customer');assert.equal(original,entry);assert.equal(operation,'propose');assert.equal(input.dateISO,destination.dateISO);assert.equal(input.time,destination.time);assert.equal(input.selection,undefined);assert.equal(input.acceptFinancialTerms,true);assert.equal(JSON.stringify(entry),before);
});
test('an unavailable/unauthorized proposal reports its error without opening the services flow',async()=>{
 const f=fixture({failure:true});f.drop(entry,destination,'customer');f.alerts[0][2][1].onPress();await flush();assert.deepEqual(f.errors,['slot unavailable']);assert.equal(f.calls.length,1);
});
test('business drop reuses its repository/context guard and preserves remote revision checks',async()=>{
 const changes=[],f=fixture({repository:{changeBooking:async(...args)=>changes.push(args)}});f.drop(entry,destination,'business');f.alerts[0][2][1].onPress();await flush();assert.equal(changes.length,1);assert.deepEqual(changes[0].slice(0,4),['original','salon','business','propose']);
 const remote=fixture();remote.drop(entry,destination,'business');remote.alerts[0][2][1].onPress();await flush();assert.equal(remote.calls[0][0],'remote');assert.equal(remote.calls[0][3].expectedRevision,7);assert.equal(remote.calls[0][3].proposalId,'prior');
 const denied=fixture({context:'USER'});denied.drop(entry,destination,'business');denied.alerts[0][2][1].onPress();await flush();assert.equal(denied.calls.length,0);assert.equal(denied.errors.length,1);
});
