import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import vm from 'node:vm';
const require=createRequire(import.meta.url),{patchProvider}=require('./repair-provider.cjs'),{createAnonymousAuthorization}=require('./anonymous-authorization.cjs');
test('reviewed patch changes only anonymous issuer and fallback; all caller tokens pass untouched',()=>{
 const issuer="const anon=sign({role:'anon',exp:Math.floor(Date.now()/1000)+86400});",header="Authorization:req.headers.authorization??'Bearer '+anon";
 const source=`const sign=claims=>JSON.stringify(claims);${issuer}\nexports.authorization=req=>({${header}});`;
 const patched=patchProvider(source);assert.equal(patched.replace("const {createAnonymousAuthorization}=require('./anonymous-authorization.cjs');\nconst authorizationFor=createAnonymousAuthorization({issueToken:sign});",issuer).replace('Authorization:authorizationFor(req.headers.authorization)',header),source);
 let now=100000;const scope={exports:{},require:name=>{assert.equal(name,'./anonymous-authorization.cjs');return{createAnonymousAuthorization:options=>createAnonymousAuthorization({...options,now:()=>now})};}};vm.runInNewContext(patched,scope);
 const anonymous=scope.exports.authorization({headers:{}}).Authorization;now+=86500000;assert.notEqual(scope.exports.authorization({headers:{}}).Authorization,anonymous);
 for(const token of ['Bearer invalid','Bearer expired',''])assert.equal(scope.exports.authorization({headers:{authorization:token}}).Authorization,token);
});
test('unexpected source or double application stops instead of overwriting',()=>{assert.throws(()=>patchProvider('unknown'));});
