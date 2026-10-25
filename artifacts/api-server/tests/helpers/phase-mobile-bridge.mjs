// Test-only in-process HTTP boundary: production mobile adapter and API handlers
// execute the real isolated PostgreSQL RPCs. No listener or account is created.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
const ts=createRequire(path.resolve('../go-app-mobile/package.json'))('typescript');
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,alwaysStrict:false,esModuleInterop:false}}).outputText;
function load(file,imports={},globals={}){const scope={exports:{},Headers,URLSearchParams,Intl,Date,console,process:{env:{EXPO_PUBLIC_API_URL:'https://phase-test.invalid/api'}},require:name=>{if(name in imports)return imports[name];throw Error('Unexpected import '+name);},...globals};vm.runInNewContext(compile(file),scope,{filename:file});return scope.exports;}
export function createPhaseMobileBridge(actor,user){
 const definitions={
  go_booking_gap_policy_version:[],go_booking_phase_policy_version:[],
  go_booking_availability:[['p_business_id','uuid'],['p_service_ids','uuid[]'],['p_from','timestamptz'],['p_to','timestamptz'],['p_staff_id','uuid'],['p_step_minutes','integer'],['p_date_iso','date'],['p_days','integer'],['p_dates_only','boolean']],
  go_booking_professional_capacity:[['p_business_id','uuid'],['p_staff_id','uuid'],['p_date_iso','date']],
  go_create_timeline_booking:[['p_business_id','uuid'],['p_service_ids','uuid[]'],['p_starts_at','timestamptz'],['p_staff_id','uuid'],['p_request_key','text'],['p_notes','text'],['p_status','public.booking_status'],['p_customer_id','uuid'],['p_expected_plan','jsonb'],['p_expected_end_at','timestamptz']],
 };
 const calls=[],memory=new Map(),routes=new Map();
 const boundary={bearerHeader:value=>/^Bearer \S+$/.test(value??'')?{Authorization:value}:{},supabaseRequest:async(url,init)=>{
  const name=url.split('/').at(-1),params=definitions[name];if(!params)throw Error('Unexpected RPC '+name);
  if(init.headers.Authorization!=='Bearer phase-test-'+user)throw Error('Caller identity was not forwarded');
  const args=JSON.parse(init.body);calls.push({name,args});
  try{const row=await actor(user,'select public.'+name+'('+params.map(([key,type],i)=>key+'=> $'+(i+1)+'::'+type).join(',')+') r',params.map(([key])=>args[key]??null));return Response.json(row.r);}
  catch(error){return Response.json({code:error.code,message:error.message},{status:error.code==='42501'?403:error.code==='23P01'?409:422});}
 }};
 const policy=load('src/lib/bookingGapPolicy.ts',{'./supabase':boundary});
 const router={};for(const method of ['get','post'])router[method]=(route,handler)=>routes.set(method.toUpperCase()+':'+route,handler);
 load('src/routes/bookingTimeline.ts',{'express':{Router:()=>router},'../lib/supabase':boundary,'../lib/bookingGapPolicy':policy});
 const transport=async(url,init={})=>{
  const parsed=new URL(url),key=(init.method??'GET')+':'+parsed.pathname.replace('/api/supabase',''),handler=routes.get(key);if(!handler)throw Error('Unexpected route '+key);
  const req={query:Object.fromEntries(parsed.searchParams),body:init.body?JSON.parse(init.body):undefined,header:key=>new Headers(init.headers).get(key)};
  const res={statusCode:200,value:undefined,status(code){this.statusCode=code;return this;},json(value){this.value=value;return this;},setHeader(){}};
  await handler(req,res);return Response.json(res.value,{status:res.statusCode});
 };
 const mobile=path.resolve('../go-app-mobile');
 const timeline=load(path.join(mobile,'data/bookingTimeline.ts'));
 const publication=load(path.resolve('../../lib/api-zod/src/module-publication.ts'));
 const session={access_token:'phase-test-'+user,user:{id:user}};
 const api=load(path.join(mobile,'data/booking.ts'),{
  '@workspace/api-zod':publication,'@/lib/authSession':{readAuthSession:async()=>session,fetchWithAuth:transport,AuthSessionRequiredError:class extends Error{}},
  '@react-native-async-storage/async-storage':{default:{getItem:async key=>memory.get(key)??null,setItem:async(key,value)=>memory.set(key,value)}},
  './bookingTimeline':timeline,'./goSearchAliases':{normalize:value=>value.toLowerCase(),expandSearchTerms:value=>[value.toLowerCase()]},
 });
 return {api,calls,memory};
}
