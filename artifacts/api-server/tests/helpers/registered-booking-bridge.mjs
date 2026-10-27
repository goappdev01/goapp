// Real mobile adapter -> existing API handlers -> isolated PostgreSQL RPCs.
// Only the HTTP/PostgREST transport boundary is replaced, never booking logic.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const ts=createRequire(path.resolve('../go-app-mobile/package.json'))('typescript');
function load(file,require,globals={}){const scope={exports:{},require,Headers,URLSearchParams,Date,Error,Intl,console,process:{env:{EXPO_PUBLIC_API_URL:'http://isolated.invalid/api'}},...globals};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:false,alwaysStrict:false}}).outputText,scope,{filename:file});return scope.exports;}
export function registeredBridge(actor,user,initialConfig,sourceId,companyId){
 const definitions={
  go_booking_calendar_business:[['p_source_id','text']],
  go_booking_gap_policy_version:[],go_booking_phase_policy_version:[],
  go_booking_availability:[['p_business_id','uuid'],['p_service_ids','uuid[]'],['p_staff_id','uuid'],['p_from','timestamptz'],['p_to','timestamptz'],['p_date_iso','date'],['p_days','integer'],['p_dates_only','boolean'],['p_step_minutes','integer']],
  go_create_timeline_booking:[['p_business_id','uuid'],['p_service_ids','uuid[]'],['p_starts_at','timestamptz'],['p_staff_id','uuid'],['p_request_key','text'],['p_notes','text'],['p_status','public.booking_status'],['p_customer_id','uuid'],['p_expected_plan','jsonb'],['p_expected_end_at','timestamptz']],
  go_catalog_quote:[['p_business_id','uuid'],['p_root_ids','uuid[]'],['p_selected_ids','uuid[]']],
  go_create_catalog_booking:[['p_business_id','uuid'],['p_root_ids','uuid[]'],['p_selected_ids','uuid[]'],['p_starts_at','timestamptz'],['p_staff_id','uuid'],['p_customer_id','uuid'],['p_request_key','text'],['p_expected_quote','jsonb'],['p_expected_plan','jsonb'],['p_expected_end','timestamptz'],['p_notes','text']],
  go_booking_receipts:[['p_business_id','uuid']],
  go_negotiate_booking:[['p_booking_id','uuid'],['p_operation','text'],['p_request_id','uuid'],['p_expected_revision','bigint'],['p_proposal_id','uuid'],['p_date_iso','text'],['p_time','text'],['p_starts_at','timestamptz'],['p_financial_consent','boolean']],
 },routes=new Map(),calls=[],state={offline:false,user};
 const boundary={bearerHeader:value=>value?{Authorization:value}:{},supabaseRequest:async(url,init)=>{
  if(url.startsWith('/rest/v1/businesses?')){const id=new URL(url,'http://isolated.invalid').searchParams.get('id').slice(3);return Response.json((await actor(state.user,"select coalesce(jsonb_agg(to_jsonb(b)),'[]') r from public.businesses b where id=$1",[id])).r);}
  const name=url.split('/').at(-1),params=definitions[name];if(!params)throw Error('Unknown RPC '+name);
  if(init.headers.Authorization!=='Bearer isolated-'+state.user)throw Error('Original caller JWT missing');const args=JSON.parse(init.body);calls.push({name,args});
  try{const result=await actor(state.user,'select public.'+name+'('+params.map(([key,type],i)=>key+'=> $'+(i+1)+'::'+type).join(',')+') r',params.map(([key,type])=>type==='jsonb'?JSON.stringify(args[key]??null):args[key]??null));return Response.json(result.r);}
  catch(e){return Response.json({code:e.code,message:e.message},{status:e.code==='42501'?403:422});}
 }};
 const router={};for(const method of ['get','post','put','delete'])router[method]=(route,handler)=>routes.set(method.toUpperCase()+':'+route,handler);
 const imports={'express':{Router:()=>router},'../lib/supabase':boundary,'../lib/bookingGapPolicy':{requireBookingGapPolicy:async()=>true},'node:crypto':{createHash}};
 for(const file of ['bookingCalendar','bookingTimeline','bookingNegotiation','catalogAssociations'])load('src/routes/'+file+'.ts',name=>{if(name in imports)return imports[name];throw Error(name);});
 let publicationGate;
 const transport=async(url,init={})=>{
  if(state.offline)throw Error('Backend unavailable');const u=new URL(url),route=u.pathname.replace('/api/supabase',''),method=init.method??'GET';
  const management=route.match(/^\/manage\/businesses\/([a-f0-9-]+)\/(services|staff)$/);
  if(management){const rows=await actor(state.user,'select coalesce(jsonb_agg(to_jsonb(t)),\'[]\') r from public.'+management[2]+' t where t.business_id=$1',[management[1]]);return Response.json(rows.r);}
  const change=route.match(/^\/bookings\/([^/]+)\/change$/),handler=routes.get(method+':'+(change?'/bookings/:bookingId/change':route));if(!handler)throw Error('Unexpected API path '+route);
  const req={query:Object.fromEntries(u.searchParams),params:change?{bookingId:change[1]}:{},body:init.body?JSON.parse(init.body):undefined,header:key=>new Headers(init.headers).get(key)};
  const res={statusCode:200,status(c){this.statusCode=c;return this;},setHeader(){},type(){return this;},send(body){this.value=JSON.parse(body);return this;},json(v){this.value=v;return this;}};
  if((method==='GET'&&route==='/booking-availability')||(method==='POST'&&['/bookings/timeline','/bookings/catalog','/catalog/quote'].includes(route))){
   const business=req.query.business_id??req.body?.business_id??req.body?.businessId;if(!await publicationGate.allowNewBookingModule(req,res,business))return Response.json(res.value,{status:res.statusCode});
  }
  await handler(req,res,()=>{throw Error('Unexpected legacy API fallback');});return Response.json(res.value,{status:res.statusCode});
 };
 const cache=new Map(),storage=new Map(),mobile=path.resolve('../go-app-mobile');
 const get=name=>{
  const file=name.replace(/^\.\//,'');if(cache.has(file))return cache.get(file);
  const imports={'@workspace/api-zod':getPublication,'@react-native-async-storage/async-storage':{default:{getItem:async key=>storage.get(key)??null,setItem:async(key,value)=>storage.set(key,value)}},'@/lib/authSession':{readAuthSession:async()=>({access_token:'isolated-'+state.user,user:{id:state.user}}),fetchWithAuth:transport,AuthSessionRequiredError:class extends Error{}},'./goSearchAliases':{normalize:v=>v.toLowerCase(),expandSearchTerms:v=>[v]}};
  const api=load(path.join(mobile,'data',file+'.ts'),name=>name in imports?imports[name]:name.startsWith('./')?get(name):(()=>{throw Error('Unknown mobile import '+name);})());cache.set(file,api);return api;
 };
 const getPublication=load(path.resolve('../../lib/api-zod/src/module-publication.ts'),()=>{throw Error('Unexpected publication import');});
 publicationGate=load('src/lib/modulePublication.ts',name=>name==='@workspace/api-zod'?getPublication:name==='./supabase'?boundary:name==='../middleware/requireAdmin'?{requireAdmin:async(req,res)=>res.status(403).json({code:'ADMIN_PERMISSION_REQUIRED'})}:(()=>{throw Error(name);})());
 const storeModule=get('businessDemoStore');
 const makeStore=()=>storeModule.createBusinessDemoStore({ownerUserId:user,companyId,serverBookings:true,storage:{getItem:async key=>storage.get(key)??null,setItem:async(key,value)=>storage.set(key,value)},initialConfig,canUse:()=>state.user===user});
 const store=makeStore();if(store.businessId!==sourceId)throw Error('Fixture source mismatch');
 return {store,makeStore,repo:()=>get('demoBookingRepository').createDemoBookingRepository(store),calls,state,storage,modules:get};
}
