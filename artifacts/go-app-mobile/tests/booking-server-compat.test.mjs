import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const owner='11111111-1111-4111-8111-111111111111',business='22222222-2222-4222-8222-222222222222',service='33333333-3333-4333-8333-333333333333',professional='44444444-4444-4444-8444-444444444444';
const sourceId='demo_business_'+owner;
const source={businessId:business,sourceId,timezone:'Europe/Madrid',serviceLinks:[{id:service,sourceId:'local-service'}],staffLinks:[{id:professional,sourceId:'local-staff'}],bookingLinks:[]};
class BookingApiError extends Error{constructor(message,status,code){super(message);this.status=status;this.code=code;}}
function fixture(error){
 const calls=[];let writes=0;
 const api={BookingApiError,getAuthenticatedUserId:async()=>owner,
  supabaseApiRequest:async(...args)=>{calls.push(['source',...args]);if(error)throw error;return source;},
  getOwnedBookableItems:async id=>{calls.push(['services',id]);return [{id:service,businessId:business,title:'Corte',active:true,visible:true}];},
  getOwnedStaff:async id=>{calls.push(['staff',id]);return [{id:professional,businessId:business,name:'Profesional',active:true,serviceIds:[service]}];},
  getTimelineAvailability:async(...args)=>{calls.push(['availability',...args]);return {slots:[{staffId:professional}],availableDates:['2030-01-07']};},
  createHold:async()=>{writes++;throw Error('unexpected commitment');},claimSlot:async()=>{writes++;throw Error('unexpected commitment');}};
 const scope={exports:{},Error,URLSearchParams,require(name){if(name==='./booking')return api;if(name==='./catalogAssociations')return {};if(name==='./businessDemoStore')return {};if(name==='./bookingTimeline')return {};throw Error(name);}};
 vm.runInNewContext(ts.transpileModule(readFileSync('data/registeredBookingRepository.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);
 const base={getBookableItems:async()=>{throw Error('local fallback forbidden');},getStaff:async()=>{throw Error('local fallback forbidden');}};
 const store={ownerUserId:owner,businessId:sourceId};
 return {repo:scope.exports.withRegisteredBookingAuthority(base,store,()=>{writes++;}),calls,get writes(){return writes;}};
}
test('registered services and professionals use authenticated source links and canonical IDs through availability',async()=>{
 const f=fixture();const items=await f.repo.getBookableItems(sourceId),staff=await f.repo.getStaff(sourceId);
 assert.equal(items[0].id,'local-service');assert.equal(staff[0].id,'local-staff');assert.equal(staff[0].serviceIds[0],'local-service');
 const dates=await f.repo.getAvailableDates(sourceId,['local-service'],'2030-01-07','local-staff',7);
 assert.equal(dates[0],'2030-01-07');const a=f.calls.find(c=>c[0]==='availability');assert.equal(a[1],business);assert.equal(a[2][0],service);assert.equal(a[4],professional);
 for(const call of f.calls.filter(c=>c[0]==='source')){assert.match(call[1],/^\/supabase\/booking-calendar-business\?source_id=/);assert.equal(call[3],true);assert.equal(call[4],owner);}
 assert.equal(f.writes,0);
});
for(const status of [404,501])test(`missing backend source HTTP ${status} blocks services, availability and confirmation without local replacement`,async()=>{
 const f=fixture(new BookingApiError('upstream',status));
 for(const operation of [()=>f.repo.getBookableItems(sourceId),()=>f.repo.getStaff(sourceId),()=>f.repo.getAvailableDates(sourceId,['local-service'],'2030-01-07',undefined,1),()=>f.repo.claimSlot({status:'CONFIRMED',businessId:sourceId})]){
  await assert.rejects(operation(),e=>e.code==='BOOKING_BACKEND_INCOMPATIBLE'&&e.status===status);
 }
 assert.equal(f.writes,0);assert.ok(f.calls.every(c=>c[0]==='source'));
});
test('a genuine unlinked-business 404 and authorization failures retain their distinct meaning',async()=>{
 for(const error of [new BookingApiError('not linked',404,'BOOKING_CALENDAR_BUSINESS_NOT_LINKED'),new BookingApiError('denied',403),new Error('offline')]){
  const f=fixture(error);await assert.rejects(f.repo.getBookableItems(sourceId),e=>e===error);assert.equal(f.writes,0);
 }
});

test('long account labels scale within the existing circle without a font-size floor that truncates them',()=>{
 const scope={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync('lib/orbitAccountLabel.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,scope);
 const size=scope.exports.orbitAccountLabelSize;
 for(const diameter of [36,44,60])for(const scale of [1,1.6,2]){
  assert.ok(size('USUARIOS',diameter,1,scale)>0);assert.ok(size('USUARIOS',diameter,1,scale)<=size('EMPRESA',diameter,1,scale));
  assert.ok(size('USUARIOS',diameter,1,scale)<=12*scale);
 }
});

test('native booking requests require an explicit API and cannot fall through to Metro HTML',()=>{
 const helper={exports:{},Error};vm.runInNewContext(ts.transpileModule(readFileSync('lib/loginResponse.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,helper);
 const ast=ts.createSourceFile('booking.ts',readFileSync('data/booking.ts','utf8'),ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='getApiBase');assert.ok(fn);
 for(const os of ['ios','android','web']){
  const scope={exports:{},process:{env:{EXPO_PUBLIC_API_URL:'https://goapp-api-production.up.railway.app/api/'}},Platform:{OS:os},loginApiBase:helper.exports.loginApiBase};
  vm.runInNewContext(ts.transpileModule(fn.getText(ast)+'; exports.base=getApiBase;',{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,scope);
  assert.equal(scope.exports.base(),'https://goapp-api-production.up.railway.app/api');
  delete scope.process.env.EXPO_PUBLIC_API_URL;
  if(os==='web')assert.equal(scope.exports.base(),'/api');else assert.throws(()=>scope.exports.base(),/LOGIN_API_UNCONFIGURED/);
 }
});
