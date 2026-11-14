import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { loadAuthSession } from './helpers/auth-session-fixture.mjs';
import { modulePublicationPolicy } from './helpers/module-publication-fixture.mjs';
const ts = createRequire(import.meta.url)('typescript');
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
  esModuleInterop: false, alwaysStrict: false, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const user = '11111111-1111-4111-8111-111111111111', own = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333', service = '44444444-4444-4444-8444-444444444444';
const staff = '55555555-5555-4555-8555-555555555555', booking = '66666666-6666-4666-8666-666666666666';
const session = (role, expired = true) => ({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh',
  expires_at: Math.floor(Date.now()/1000) + (expired ? -3600 : 3600), user: { id: user, user_metadata: { role } } });
function pure(file) { const scope = { exports: {} }; vm.runInNewContext(compile(file), scope); return scope.exports; }
function fixture({ role = 'empresa', expired = true, reply, secureRead } = {}) {
  const secure = new Map([['go_auth_session_v2', JSON.stringify(session(role, expired))]]), memory = new Map(), calls = [];
  const storage = { getItem: async key => memory.get(key) ?? null, setItem: async (k,v) => { memory.set(k,v); },
    removeItem: async key => memory.delete(key), multiRemove: async keys => keys.forEach(k => memory.delete(k)) };
  const transport = async (url, init) => { calls.push({url, init});
    if (reply) return reply(url, init);
    if (url.endsWith('/auth/refresh')) return Response.json({code:'SESSION_REFRESH_FAILED'}, {status:503});
    if (/booking-(gap|phase)-policy$/.test(url)) return Response.json(1);
    if (url.endsWith('/bookings/timeline')) {
      const input = JSON.parse(init.body);
      return Response.json([{...input, id:booking, service_id:input.service_ids[0], customer_id:user,
        ends_at:'2035-10-07T11:00:00.000Z', timing_snapshot:{serviceIds:input.service_ids,serviceDetails:[]}}]);
    }
    if (url.includes('/services')) return Response.json([{id:service,business_id:own,name:'Corte',duration_minutes:30,price:15,active:true}]);
    if (url.includes('/staff')) return Response.json([{id:staff,business_id:own,display_name:'Profesional',active:true}]);
    return Response.json([{id:own,name:'Negocio propio',booking_enabled:true,ui_metadata:{category:'peluqueria'}},
      {id:other,name:'Otro negocio',booking_enabled:true,ui_metadata:{category:'peluqueria'}},
      {id:service,name:'Inactivo',booking_enabled:false}]);
  };
  const globals = { process:{env:{EXPO_PUBLIC_API_URL:'https://test.invalid/api'}}, fetch:transport };
  const auth = loadAuthSession(globals, storage, {}, {secure, read:secureRead});
  const scope = { exports:{}, ...globals, Headers, Response, Date, URLSearchParams, Map, Set,
    console:{log(){},warn(){}}, require(name) {
      if (name==='react-native') return {Platform:{OS:'ios'}};
      if (name==='@/lib/loginResponse') return pure('lib/loginResponse.ts');
      if (name==='@/lib/authSession') return auth;
      if (name==='@workspace/api-zod') return modulePublicationPolicy;
      if (name==='@react-native-async-storage/async-storage') return {default:storage};
      if (name==='./goSearchAliases') return pure('data/goSearchAliases.ts');
      throw Error('Unexpected booking dependency '+name);
    } };
  vm.runInNewContext(compile('data/booking.ts'), scope);
  return {api:scope.exports, auth, secure, memory, calls};
}

test('registered catalogue does not hide or copy a local DEMO company', async () => {
  const demo={id:'demo_business_1',name:'DEMO peluquería',bookingActive:true};
  const f=fixture({expired:false,reply:async()=>Response.json([{id:own,name:'Registrada',booking_enabled:true}])});
  f.memory.set('go_businesses_v1',JSON.stringify([demo]));
  assert.deepEqual(Array.from(await f.api.getBusinesses(),row=>row.id),[own,demo.id]);
  assert.deepEqual(Array.from(await f.api.getActivebusinesses(),row=>row.id),[own]);
  await f.api.saveBusiness({...demo,name:'DEMO actualizada'});
  assert.deepEqual(JSON.parse(f.memory.get('go_businesses_v1')).map(row=>row.id),[demo.id]);
});

test('a real company never loads cached services or bookings when the server is empty or unavailable', async () => {
  let unavailable=false;
  const f=fixture({expired:false,reply:async(url)=>unavailable?Response.json({error:'Offline'},{status:503}):Response.json([])});
  const demo='demo_business_1',demoService='demo_service_1';
  f.memory.set('go_bookable_items_v1',JSON.stringify([
    {id:service,businessId:own,title:'Antiguo'},
    {id:demoService,businessId:demo,title:'Prueba local'},
  ]));
  f.memory.set('go_bookings_v1',JSON.stringify([
    {id:booking,businessId:own,customerId:user,status:'CONFIRMED',startDatetime:'2035-01-01T10:00:00',endDatetime:'2035-01-01T10:30:00'},
    {id:'demo_booking_1',businessId:demo,customerId:user,status:'CONFIRMED',startDatetime:'2035-01-01T10:00:00',endDatetime:'2035-01-01T10:30:00'},
  ]));
  assert.deepEqual(Array.from(await f.api.getBookableItems(own),row=>row.id),[]);
  assert.deepEqual(Array.from(await f.api.getBookableItems(),row=>row.id),[demoService]);
  assert.deepEqual(Array.from(await f.api.getBookings({businessId:own}),row=>row.id),[]);
  assert.ok(f.calls.some(call=>call.url.includes('/bookings?negotiation=1&business_id='+own)));
  assert.deepEqual(Array.from(await f.api.getBookings({businessId:demo}),row=>row.id),['demo_booking_1']);
  unavailable=true;
  await assert.rejects(f.api.getBookableItems(own),error=>error.status===503);
  await assert.rejects(f.api.getBookings({businessId:own}),error=>error.status===503);
  assert.deepEqual(Array.from(await f.api.getBookings({businessId:demo}),row=>row.id),['demo_booking_1']);
});

for (const role of ['usuario','empresa']) test(`public discovery with an expired ${role} session finds the same published businesses without refreshing`, async () => {
  const f=fixture({role}), before=f.secure.get('go_auth_session_v2');
  assert.deepEqual(Array.from(await f.api.getActivebusinesses(), row=>row.id), [own,other]);
  assert.equal((await f.api.searchBusinesses('propio'))[0].id,own);
  assert.equal((await f.api.getBookableItems(own,true))[0].id,service);
  assert.equal((await f.api.getStaff(own))[0].id,staff);
  assert.ok(f.calls.every(c=>!c.url.includes('/auth/refresh')));
  assert.ok(f.calls.every(c=>!new Headers(c.init.headers).has('Authorization')));
  assert.equal(f.secure.get('go_auth_session_v2'),before);
});

test('public upstream JWT errors are returned intact without a session retry, fake catalogue or credential removal', async () => {
  const f=fixture({reply:async()=>Response.json({code:'PGRST303',message:'JWT expired'},{status:401})});
  const before=f.secure.get('go_auth_session_v2');
  await assert.rejects(f.api.getActivebusinesses(), e=>e.code==='PGRST303'&&e.status===401&&e.message==='JWT expired');
  assert.equal(f.calls.length,1);assert.equal(f.secure.get('go_auth_session_v2'),before);
});

test('public discovery does not depend on opening the private credential store', async () => {
  const f=fixture({secureRead:()=>{throw Error('keychain unavailable');}});
  assert.equal((await f.api.getActivebusinesses()).length,2);assert.equal(f.calls.length,1);
});

test('ADMIN internal publication preview still requires its matching renewable session and never silently downgrades a failure', async () => {
  const f=fixture();f.api.setInternalBookingContext(user);
  await assert.rejects(f.api.getActivebusinesses(),e=>e.code==='SESSION_REFRESH_UNAVAILABLE');
  assert.equal(f.calls.length,1);assert.ok(f.calls[0].url.endsWith('/auth/refresh'));
  assert.equal((await f.auth.readAuthSession()).user.id,user);
  const active=fixture({expired:false});active.api.setInternalBookingContext(user);await active.api.getActivebusinesses();
  assert.equal(new Headers(active.calls[0].init.headers).get('Authorization'),'Bearer synthetic-access');
  assert.equal(new Headers(active.calls[0].init.headers).get('x-go-internal-modules'),'1');
});

test('a stale internal hint cannot forward privileges for a different user; caller headers cannot promote a public request', async () => {
  const f=fixture();f.api.setInternalBookingContext('another-user');
  await f.api.supabaseApiRequest('/supabase/businesses', {headers:{Authorization:'Bearer injected','x-go-internal-modules':'1'}});
  assert.equal(new Headers(f.calls[0].init.headers).has('Authorization'),false);
  assert.equal(new Headers(f.calls[0].init.headers).has('x-go-internal-modules'),false);
});

test('protected endpoints, writes and explicit identities still require session renewal', async () => {
  for (const [path,init,required,expected] of [
    ['/supabase/manage/businesses',{},true], ['/supabase/auth/me',{},false],
    ['/supabase/businesses',{method:'POST'},false], ['/supabase/businesses',{},false,user],
  ]) { const f=fixture();await assert.rejects(f.api.supabaseApiRequest(path,init,required,expected),e=>e.code==='SESSION_REFRESH_UNAVAILABLE');
    assert.equal(f.calls.length,1);assert.ok(f.calls[0].url.endsWith('/auth/refresh')); }
});

test('a business profile confirms as the same customer in its own or another business through the existing authenticated transport', async () => {
  for(const businessId of [own,other]) {
    const f=fixture({expired:false});
    const result=await f.api.checkAndClaimBookingSlot({id:'synthetic-review', businessId, bookableItemId:service, customerId:user,
      startDatetime:'2035-10-07T10:00:00.000Z',endDatetime:'2035-10-07T11:00:00.000Z',status:'CONFIRMED',unitsReserved:1,peopleCount:1});
    assert.equal(result.ok,true);assert.equal(result.booking.customerId,user);
    const write=f.calls.find(c=>c.url.endsWith('/bookings/timeline'));assert.ok(write);
    assert.equal(JSON.parse(write.init.body).business_id,businessId);assert.equal(JSON.parse(write.init.body).customer_id,undefined);
    assert.equal(new Headers(write.init.headers).get('Authorization'),'Bearer synthetic-access');
    assert.equal(new Headers(write.init.headers).has('x-go-internal-modules'),false);
  }
});
