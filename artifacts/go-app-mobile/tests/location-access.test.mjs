import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url),deviceLocation=require('./helpers/device-location.cjs');
const api=deviceLocation();
const granted={status:'granted',canAskAgain:true};
function fixture(initial=granted){
 let permission={...initial};const calls=[];
 const adapter={Accuracy:{Lowest:1,Low:2,Balanced:3},
  hasServicesEnabledAsync:async()=>{calls.push('services');return true;},
  getForegroundPermissionsAsync:async()=>{calls.push('check');return {...permission};},
  requestForegroundPermissionsAsync:async()=>{calls.push('request');permission={...granted};return {...permission};},
  getCurrentPositionAsync:async options=>{calls.push(['position',options]);return {coords:{latitude:38.05,longitude:-1.23,accuracy:100}};},
  getLastKnownPositionAsync:async()=>{calls.push('cached');return {coords:{latitude:38,longitude:-1}};},
 };
 return {adapter,calls,setPermission:next=>permission={...next}};
}
const code=expected=>error=>error.code===expected;
test('already granted authorization reads on demand without another native request or cached permission',async()=>{
 const f=fixture();assert.equal(f.calls.length,0);
 await api.readDeviceLocation(f.adapter);await api.readDeviceLocation(f.adapter);
 assert.equal(f.calls.filter(c=>c==='request').length,0);
 assert.equal(f.calls.filter(c=>Array.isArray(c)&&c[0]==='position').length,2);
 assert.equal(f.calls.filter(c=>c==='check').length,4);
});
test('undetermined permission opens only the native foreground request',async()=>{
 const f=fixture({status:'undetermined',canAskAgain:true});await api.readDeviceLocation(f.adapter);
 assert.equal(f.calls.filter(c=>c==='request').length,1);
 await api.readDeviceLocation(f.adapter);assert.equal(f.calls.filter(c=>c==='request').length,1);
});
test('concurrent modules share the same in-flight native prompt even with distinct namespace objects',async()=>{
 const f=fixture({status:'undetermined',canAskAgain:true});let finish;
 f.adapter.requestForegroundPermissionsAsync=()=>{f.calls.push('request');return new Promise(done=>finish=()=>{f.setPermission(granted);done(granted);});};
 const a=api.readDeviceLocation(f.adapter),b=api.readDeviceLocation({...f.adapter});
 await new Promise(setImmediate);assert.equal(f.calls.filter(c=>c==='request').length,1);finish();await Promise.all([a,b]);
});
test('a temporary permission expires naturally and is requested again only on the next necessary use',async()=>{
 const f=fixture({status:'undetermined',canAskAgain:true});await api.readDeviceLocation(f.adapter);
 f.setPermission({status:'undetermined',canAskAgain:true});
 assert.equal(f.calls.filter(c=>c==='request').length,1);
 await api.readDeviceLocation(f.adapter);assert.equal(f.calls.filter(c=>c==='request').length,2);
});
test('denial and permanent denial never read position; permanent denial never repeats the prompt',async()=>{
 for(const canAskAgain of [true,false]){
  const f=fixture({status:'denied',canAskAgain});
  f.adapter.requestForegroundPermissionsAsync=async()=>{f.calls.push('request');return {status:'denied',canAskAgain};};
  await assert.rejects(api.readDeviceLocation(f.adapter),code(canAskAgain?'permission-denied':'permission-blocked'));
  assert.equal(f.calls.some(c=>Array.isArray(c)&&c[0]==='position'),false);
  assert.equal(f.calls.includes('request'),canAskAgain);
 }
});
test('revocation during a position read discards the result and does not request another permission',async()=>{
 const f=fixture();f.adapter.getCurrentPositionAsync=async()=>{f.setPermission({status:'denied',canAskAgain:false});return {coords:{latitude:38,longitude:-1}};};
 await assert.rejects(api.readDeviceLocation(f.adapter),code('permission-blocked'));
 assert.equal(f.calls.includes('request'),false);
});
test('iOS reduced and Android coarse authorization remain approximate and bypass precise cached fixes',async()=>{
 for(const details of [{ios:{accuracy:'reduced'}},{android:{accuracy:'coarse'}}]){
  const f=fixture({...granted,...details});await api.readDeviceLocation(f.adapter,{accuracy:3,lastKnownMaxAgeMs:300000});
  assert.equal(f.calls.includes('cached'),false);
  const position=f.calls.find(c=>Array.isArray(c));assert.equal(position[1].accuracy,2);
  assert.equal(position[1].mayShowUserSettingsDialog,false);
  assert.equal(f.calls.includes('request'),false);
 }
});
test('precision downgrade during a read cannot leak its previous precise fix',async()=>{
 const f=fixture();f.adapter.getCurrentPositionAsync=async()=>{f.setPermission({...granted,ios:{accuracy:'reduced'}});return {coords:{latitude:38.1234567,longitude:-1.1234567}};};
 await assert.rejects(api.readDeviceLocation(f.adapter),code('permission-changed'));
});
test('disabled services and background state cause no position request and require no background permission',async()=>{
 const f=fixture();f.adapter.hasServicesEnabledAsync=async()=>false;
 await assert.rejects(api.readDeviceLocation(f.adapter),code('services-disabled'));assert.equal(f.calls.length,0);
 const background=deviceLocation({AppState:{currentState:'background'}}),g=fixture();
 await assert.rejects(background.readDeviceLocation(g.adapter),code('inactive'));assert.equal(g.calls.length,0);
});
test('silent consumers never request authorization; manual Android geocoding can authorize without a GPS fix',async()=>{
 const f=fixture({status:'undetermined',canAskAgain:true});
 await assert.rejects(api.readDeviceLocation(f.adapter,{requestPermission:false}),code('permission-denied'));
 assert.equal(f.calls.includes('request'),false);
 await api.ensureDeviceLocationPermission(f.adapter);assert.equal(f.calls.includes('request'),true);
 assert.equal(f.calls.some(c=>Array.isArray(c)),false);
});
test('settings are offered only for a real obstruction and opened only by the user; native choices remain independent',async()=>{
 for(const OS of ['ios','android']){
  const dialogs=[],opened=[],native={Platform:{OS},Alert:{alert:(...a)=>dialogs.push(a)},Linking:{openSettings:async()=>opened.push('app'),sendIntent:async intent=>opened.push(intent)}};
  const helper=deviceLocation(native);
  assert.equal(helper.offerLocationSettings(new helper.LocationAccessError('permission-denied')),false);
  for(const status of ['permission-blocked','services-disabled']){
   let manual=0;helper.offerLocationSettings(new helper.LocationAccessError(status),'es',()=>manual++);
   assert.equal(opened.length,status==='permission-blocked'?0:1);
   dialogs.at(-1)[2][0].onPress();assert.equal(manual,1);
   await dialogs.at(-1)[2][1].onPress();
   assert.equal(opened.at(-1),OS==='android'&&status==='services-disabled'?'android.settings.LOCATION_SOURCE_SETTINGS':'app');
  }
 }
});
test('failed or invalid fixes are reported, with no subscriptions, storage or network work in the shared mechanism',async()=>{
 const f=fixture();f.adapter.getCurrentPositionAsync=async()=>({coords:{latitude:NaN,longitude:0}});
 await assert.rejects(api.readDeviceLocation(f.adapter),code('unavailable'));
 f.adapter.getCurrentPositionAsync=async()=>{throw Error('GPS offline');};
 await assert.rejects(api.readDeviceLocation(f.adapter),code('unavailable'));
 for(const file of ['lib/deviceLocation.ts','lib/locationAccess.ts'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/watchPositionAsync|requestBackgroundPermissionsAsync|startLocationUpdatesAsync|AsyncStorage|fetch\(/);
});
