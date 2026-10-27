// In-process test boundary only. Actual mobile adapters and API handlers call
// real isolated SQL under distinct authenticated roles, without another server.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
const ts=createRequire(path.resolve('../go-app-mobile/package.json'))('typescript');
function load(file,imports={},globals={}){
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:false,alwaysStrict:false}}).outputText;
 const scope={exports:{},Headers,URLSearchParams,Date,Error,Intl,console,process:{env:{EXPO_PUBLIC_API_URL:'https://calendar-test.invalid/api'}},require:name=>{if(name in imports)return imports[name];throw Error('Unexpected import '+name);},...globals};vm.runInNewContext(code,scope,{filename:file});return scope.exports;
}
export function createCalendarMobileBridge(actor,user){
 const definitions={
  go_booking_calendar_exceptions:[['p_business_id','uuid'],['p_date_iso','date'],['p_staff_id','uuid'],['p_from_date','date']],
  go_save_booking_calendar_exception:[['p_business_id','uuid'],['p_date_iso','date'],['p_staff_id','uuid'],['p_intervals','jsonb'],['p_expected_revision','integer'],['p_request_key','text'],['p_delete','boolean']],
 },calls=[],routes=new Map();
 const boundary={bearerHeader:value=>/^Bearer \S+$/.test(value??'')?{Authorization:value}:{},supabaseRequest:async(url,init)=>{
  const name=url.split('/').at(-1),params=definitions[name];if(!params)throw Error('Unexpected RPC '+name);
  if(init.headers.Authorization!=='Bearer calendar-test-'+user)throw Error('Caller JWT was not forwarded');
  const args=JSON.parse(init.body);calls.push({name,args});
  try{const row=await actor(user,'select public.'+name+'('+params.map(([key,type],i)=>key+'=> $'+(i+1)+'::'+type).join(',')+') r',params.map(([key,type])=>type==='jsonb'?JSON.stringify(args[key]??null):args[key]??null));return Response.json(row.r);}
  catch(error){return Response.json({code:error.code,message:error.message},{status:error.code==='42501'?403:422});}
 }};
 const router={};for(const method of ['get','put','delete'])router[method]=(route,handler)=>routes.set(method.toUpperCase()+':'+route,handler);
 load('src/routes/bookingCalendar.ts',{'express':{Router:()=>router},'../lib/supabase':boundary});
 const transport=async(url,init={})=>{
  const parsed=new URL(url),handler=routes.get((init.method??'GET')+':'+parsed.pathname.replace('/api/supabase',''));if(!handler)throw Error('Unexpected route');
  const req={query:Object.fromEntries(parsed.searchParams),body:init.body?JSON.parse(init.body):undefined,header:key=>new Headers(init.headers).get(key)};
  const res={statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.value=value;return this;},setHeader(){}};
  await handler(req,res);return Response.json(res.value,{status:res.statusCode});
 };
 const mobile=path.resolve('../go-app-mobile'),timeline=load(path.join(mobile,'data/bookingTimeline.ts')),publication=load(path.resolve('../../lib/api-zod/src/module-publication.ts'));
 const booking=load(path.join(mobile,'data/booking.ts'),{'@workspace/api-zod':publication,'@/lib/authSession':{readAuthSession:async()=>({access_token:'calendar-test-'+user,user:{id:user}}),fetchWithAuth:transport,AuthSessionRequiredError:class extends Error{}},'@react-native-async-storage/async-storage':{default:{getItem:async()=>null,setItem:async()=>{throw Error('No local persistence is allowed for calendar exceptions');}}},'./bookingTimeline':timeline,'./goSearchAliases':{normalize:v=>v.toLowerCase(),expandSearchTerms:v=>[v]}});
 return {calls,api:load(path.join(mobile,'data/calendarExceptions.ts'),{'./booking':booking,'./bookingTimeline':timeline})};
}
