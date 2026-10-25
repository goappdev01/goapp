import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCredentialStorage, loadAuthSession } from './helpers/auth-session-fixture.mjs';
const legacyKey='go_supabase_session_v1',secureKey='go_auth_session_v2',logoutKey='go_auth_signed_out_v2';
const user='11111111-1111-4111-8111-111111111111';
const pair={access_token:'test-only-access',refresh_token:'test-only-refresh',expires_at:Date.now()/1000+3600,
 user:{id:user,email:'test@example.invalid',user_metadata:{role:'usuario'}}};
const bytes=JSON.stringify(pair),copy=value=>JSON.parse(JSON.stringify(value));
function fixture({legacy=bytes,protectedValue,sharedPlain,secure=new Map(),options={},plainFault}={}){
 const plain=sharedPlain??new Map([['go_account_type_v1','usuario'],['go_owner_view_context_v1:'+user,'BUSINESS'],
  ['go_business_demo_catalog_v1:'+user,'preserve independent businesses'],['go_business_demo_v1:'+user,'preserve floor and bookings']]);
 if(!sharedPlain&&legacy!==null)plain.set(legacyKey,legacy);
 if(protectedValue!==undefined)secure.set(secureKey,protectedValue);
 const calls=[];
 const api={getItem:async key=>{await plainFault?.('get',key);return plain.get(key)??null;},
  setItem:async(key,value)=>{calls.push(['set',key,value]);await plainFault?.('set',key);plain.set(key,value);},
  removeItem:async key=>{calls.push(['remove',key]);await plainFault?.('remove',key);plain.delete(key);},
  multiRemove:async keys=>{calls.push(['multiRemove',[...keys]]);await plainFault?.('multiRemove',keys);for(const key of keys)plain.delete(key);}};
 const credentials=loadCredentialStorage(api,{secure,...options});
 return { ...credentials,plain,calls,storageApi:api,secureCalls:credentials.calls };
}
const other=f=>[...f.plain].filter(([key])=>![legacyKey,logoutKey,'go_account_type_v1'].includes(key));
const unavailable=error=>error.name==='AuthCredentialStorageError'&&!/test-only-access|test-only-refresh/.test(error.message);

for(const platform of ['ios','android'])test(platform+': migration verifies the protected pair before deleting plaintext and preserves DEMO/preferences',async()=>{
 let f,checked=false;
 f=fixture({legacy:JSON.stringify({...pair,password:'must-never-persist',user:{...pair.user,password:'not-a-user-field',user_metadata:{role:'usuario',password:'secret'}}}),
  options:{platform},plainFault:(method,key)=>{if(method==='remove'&&key===legacyKey){assert.deepEqual(JSON.parse(f.secure.get(secureKey)),pair);checked=true;}}});
 const original=other(f);assert.deepEqual(JSON.parse(await f.api.readAuthCredentials()),pair);
 assert.equal(checked,true);assert.equal(f.plain.has(legacyKey),false);assert.deepEqual(other(f),original);
 assert.equal(f.plain.get('go_account_type_v1'),'usuario');
 assert.equal(f.secureCalls.filter(c=>c.method==='set').length,1);
 for(const call of f.secureCalls){assert.equal(call.settings.keychainAccessible,5);assert.equal(call.settings.requireAuthentication,false);assert.equal(call.settings.keychainService,'go.auth.session.v2');}
 assert.doesNotMatch(f.secure.get(secureKey),/password|must-never-persist|secret/);
});

test('the current protected identity wins over another legacy identity, with no downgrade or duplicate session',async()=>{
 const newer={...pair,access_token:'newer-test-only',user:{id:'another-uuid'}};
 const f=fixture({protectedValue:JSON.stringify(newer)});const result=JSON.parse(await f.api.readAuthCredentials());
 assert.equal(result.user.id,'another-uuid');assert.equal(result.access_token,'newer-test-only');assert.equal(f.plain.has(legacyKey),false);
 assert.equal(f.secureCalls.some(c=>c.method==='set'),false);
});

test('locked Keychain/read failure preserves legacy tokens and does not fall back to plaintext authentication',async()=>{
 let locked=true;const f=fixture({options:{read:()=>{if(locked)throw Error('device locked');}}}),before=[...f.plain];
 await assert.rejects(f.api.readAuthCredentials(),unavailable);assert.deepEqual([...f.plain],before);assert.equal(f.secure.has(secureKey),false);
 locked=false;assert.deepEqual(JSON.parse(await f.api.readAuthCredentials()),pair);assert.equal(f.plain.has(legacyKey),false);
});

test('a failed protected migration write retains the old pair until a successful retry',async()=>{
 let broken=true;const f=fixture({options:{write:()=>{if(broken)throw Error('storage temporarily unavailable');}}});
 await assert.rejects(f.api.readAuthCredentials(),unavailable);assert.equal(f.plain.get(legacyKey),bytes);assert.equal(f.secure.has(secureKey),false);
 broken=false;assert.deepEqual(JSON.parse(await f.api.readAuthCredentials()),pair);assert.equal(f.plain.has(legacyKey),false);
});

test('migration readback failure keeps the legacy copy and recovers from the verified native record on retry',async()=>{
 let reads=0;const f=fixture({options:{read:()=>{if(++reads===2)throw Error('readback interrupted');}}});
 await assert.rejects(f.api.readAuthCredentials(),unavailable);assert.equal(f.plain.get(legacyKey),bytes);assert.equal(f.secure.get(secureKey),bytes);
 assert.deepEqual(JSON.parse(await f.api.readAuthCredentials()),pair);assert.equal(f.plain.has(legacyKey),false);
 assert.equal(f.secureCalls.filter(c=>c.method==='set').length,1);
});

test('readback mismatch never removes the original plaintext copy or reports migration success',async()=>{
 let reads=0;const f=fixture({options:{read:(_key,secure)=>{if(++reads===2)secure.set(secureKey,'invalid protected record');}}});
 await assert.rejects(f.api.readAuthCredentials(),unavailable);assert.equal(f.plain.get(legacyKey),bytes);
 await assert.rejects(f.api.readAuthCredentials(),unavailable);assert.equal(f.plain.get(legacyKey),bytes);
});

test('cleanup failure retries deleting only the old auth copy; the protected pair is retained',async()=>{
 let fault=true;const f=fixture({plainFault:(method,key)=>{if(fault&&method==='remove'&&key===legacyKey)throw Error('disk temporarily unavailable');}});
 await assert.rejects(f.api.readAuthCredentials(),unavailable);assert.equal(f.secure.get(secureKey),bytes);assert.equal(f.plain.get(legacyKey),bytes);
 fault=false;assert.equal(await f.api.readAuthCredentials(),bytes);assert.equal(f.plain.has(legacyKey),false);
});

test('native SecureStore unavailable preserves old data and denies insecure fallback',async()=>{
 const f=fixture({options:{available:false}}),before=[...f.plain];await assert.rejects(f.api.readAuthCredentials(),unavailable);
 await assert.rejects(f.api.writeAuthCredentials(bytes,true),unavailable);assert.deepEqual([...f.plain],before);
});

test('invalid protected data cannot resurrect the valid legacy session behind it',async()=>{
 const f=fixture({protectedValue:'corrupt'});await assert.rejects(f.api.readAuthCredentials(),unavailable);
 assert.equal(f.plain.get(legacyKey),bytes);assert.equal(f.secure.get(secureKey),'corrupt');
});

test('a cached identity without a token is not a session and never migrates into secure credentials',async()=>{
 const old=JSON.stringify({user:{id:user}}),f=fixture({legacy:old});assert.equal(await f.api.readAuthCredentials(),null);
 assert.equal(f.secure.size,0);assert.equal(f.plain.get(legacyKey),old);
});

test('concurrent restoration performs a single ordered migration with intact token pair',async()=>{
 const f=fixture(),all=await Promise.all(Array.from({length:12},()=>f.api.readAuthCredentials()));
 assert.ok(all.every(value=>value===bytes));assert.equal(f.secureCalls.filter(c=>c.method==='set').length,1);
 assert.equal(f.calls.filter(c=>c[0]==='remove'&&c[1]===legacyKey).length,1);
});

test('migrated sessions survive fresh module hydration without writing credentials to AsyncStorage',async()=>{
 const f=fixture(),before=other(f);await f.api.readAuthCredentials();
 const reopened=fixture({sharedPlain:f.plain,secure:f.secure});assert.equal(await reopened.api.readAuthCredentials(),bytes);
 assert.deepEqual(other(reopened),before);assert.equal(reopened.calls.some(c=>c[0]==='set'),false);
});

test('logout during migration leaves no session to resurrect after a restart and preserves business data',async()=>{
 let start,release;const started=new Promise(resolve=>start=resolve),blocked=new Promise(resolve=>release=resolve);
 const f=fixture({options:{write:async()=>{start();await blocked;}}}),before=other(f);
 const reading=f.api.readAuthCredentials();await started;const logout=f.api.removeAuthCredentials();release();
 assert.equal(await reading,null);await logout;
 const fresh=fixture({sharedPlain:f.plain,secure:f.secure});assert.equal(await fresh.api.readAuthCredentials(),null);
 assert.equal(f.secure.has(secureKey),false);assert.equal(f.plain.has(legacyKey),false);assert.deepEqual(other(f),before);
});

for(const failure of ['native-delete','plaintext-delete'])test('partial logout '+failure+' is not restored after reload, even with a leftover token copy',async()=>{
 const f=fixture({protectedValue:bytes,options:{remove:()=>{if(failure==='native-delete')throw Error('locked');}},
  plainFault:method=>{if(failure==='plaintext-delete'&&method==='multiRemove')throw Error('temporary disk error');}}),before=other(f);
 await assert.rejects(f.api.removeAuthCredentials(),unavailable);assert.equal(f.plain.get(logoutKey),'1');
 assert.equal(await f.api.readAuthCredentials(),null);
 const fresh=fixture({sharedPlain:f.plain,secure:f.secure});assert.equal(await fresh.api.readAuthCredentials(),null);
 assert.deepEqual(other(f),before);
});

test('a failed logout marker write immediately blocks in-process credentials and a retry completes cleanup',async()=>{
 let fault=true;const f=fixture({protectedValue:bytes,plainFault:method=>{if(fault&&method==='set')throw Error('disk unavailable');}});
 await assert.rejects(f.api.removeAuthCredentials(),unavailable);assert.equal(await f.api.readAuthCredentials(),null);
 fault=false;await f.api.removeAuthCredentials();assert.equal(f.secure.has(secureKey),false);assert.equal(f.plain.has(legacyKey),false);
});

test('only a verified explicit login can clear the logout marker; renewal cannot resurrect signed-out credentials',async()=>{
 const f=fixture({protectedValue:bytes});await f.api.removeAuthCredentials();
 await assert.rejects(f.api.writeAuthCredentials(bytes),unavailable);assert.equal(f.plain.get(logoutKey),'1');
 await f.api.writeAuthCredentials(bytes,true);assert.equal(f.plain.has(logoutKey),false);assert.equal(await f.api.readAuthCredentials(),bytes);
 assert.equal(f.plain.has(legacyKey),false);
});

test('a failed new login cannot clear the previous logout marker',async()=>{
 let failure=false;const f=fixture({protectedValue:bytes,options:{write:()=>{if(failure)throw Error('native write failed');}}});
 await f.api.removeAuthCredentials();failure=true;
 await assert.rejects(f.api.writeAuthCredentials(bytes,true),unavailable);assert.equal(f.plain.get(logoutKey),'1');assert.equal(await f.api.readAuthCredentials(),null);
});

test('native token rotation preserves the last protected credential on failure and does not write a plaintext replacement',async()=>{
 let failure=true;const f=fixture({legacy:null,protectedValue:bytes,options:{write:()=>{if(failure)throw Error('native unavailable');}}}),before=[...f.plain];
 const newer=JSON.stringify({...pair,access_token:'rotated-test-only',refresh_token:'rotated-refresh-test-only'});
 await assert.rejects(f.api.writeAuthCredentials(newer),unavailable);assert.equal(f.secure.get(secureKey),bytes);assert.deepEqual([...f.plain],before);
 failure=false;await f.api.writeAuthCredentials(newer);assert.equal(await f.api.readAuthCredentials(),newer);assert.equal(f.plain.has(legacyKey),false);
});

test('a native large-value error never stores tokens in plaintext or truncates the pair',async()=>{
 const large=JSON.stringify({...pair,access_token:'test-only-'+ 'x'.repeat(6000)});
 const f=fixture({legacy:large,options:{write:()=>{throw Error('native value too large');}}});
 await assert.rejects(f.api.readAuthCredentials(),unavailable);assert.equal(f.plain.get(legacyKey),large);assert.equal(f.secure.size,0);
 assert.equal(f.calls.some(c=>c[0]==='set'),false);
});

test('browser login is memory-only, removes the old plaintext copy, and does not pretend to support durable SecureStore',async()=>{
 const f=fixture({options:{platform:'web'}});assert.equal(await f.api.readAuthCredentials(),bytes);assert.equal(f.plain.has(legacyKey),false);
 await f.api.writeAuthCredentials(bytes,true);assert.equal(f.secure.size,0);assert.equal(f.secureCalls.length,0);
 assert.equal(f.calls.some(c=>c[0]==='set'),false);
 const reopened=fixture({sharedPlain:f.plain,options:{platform:'web'}});assert.equal(await reopened.api.readAuthCredentials(),null);
 await f.api.removeAuthCredentials();assert.equal(await f.api.readAuthCredentials(),null);
});

test('a transient storage error reaches the bootstrap as unavailable, never as an empty authenticated session',async()=>{
 let locked=true;const f=fixture({options:{read:()=>{if(locked)throw Error('keychain locked');}}});
 const auth=loadAuthSession({process:{env:{}},fetch:()=>{throw Error('no remote call');}},f.storageApi,{},
  {secure:f.secure,read:()=>{if(locked)throw Error('keychain locked');}});
 await assert.rejects(auth.readAuthSession(),error=>error.code==='SESSION_REFRESH_UNAVAILABLE');assert.equal(f.plain.get(legacyKey),bytes);
 locked=false;assert.equal((await auth.readAuthSession()).user.id,user);assert.equal(f.plain.has(legacyKey),false);
});

test('SDK 58 dependency, native backup plugin and all credential connections use the protected adapter',()=>{
 const packageJson=JSON.parse(readFileSync('package.json','utf8')),app=JSON.parse(readFileSync('app.json','utf8'));
 assert.equal(packageJson.devDependencies['expo-secure-store'],'~58.0.2');
 const plugin=app.expo.plugins.find(entry=>Array.isArray(entry)&&entry[0]==='expo-secure-store');
 assert.deepEqual(plugin,['expo-secure-store',{configureAndroidBackup:true,faceIDPermission:false}]);
 const auth=readFileSync('lib/authSession.ts','utf8'),storage=readFileSync('lib/authCredentialStorage.ts','utf8');
 assert.doesNotMatch(auth,/AsyncStorage\.(setItem|multiRemove)\(AUTH_SESSION_KEY/);
 assert.match(storage,/WHEN_UNLOCKED_THIS_DEVICE_ONLY/);assert.doesNotMatch(storage,/requireAuthentication: true/);
 assert.doesNotMatch(storage,/console\.(log|warn|error)/);
});
