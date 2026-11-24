import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
export const alarmScope = {userId:'private-owner',context:'live:USER'};
export const alarmTask = (extra={}) => ({id:'private-task',kind:'sent',type:'TAREA_INTERNA',ownerUserId:alarmScope.userId,
  taskContext:alarmScope.context,notes:'PRIVATE NOTE TEXT',dateISO:'2035-10-13',time:'17:00',reminders:[60],estado:'pendiente',...extra});
export function alarmFixture(platform='ios') {
  let now=Date.parse('2035-10-12T10:00:00Z'),user=alarmScope.userId;
  class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const disk=new Map([['go_log_v1',JSON.stringify([alarmTask()])]]),os=new Map(),shown=new Map(),calls=[],warnings=[];
  const state={permission:{granted:true,canAskAgain:true,ios:{status:2,allowsAlert:true,allowsSound:true}},
    permissionResult:null,failSchedule:0,ambiguousSchedule:0,failPending:false,failCancel:false,omitReadback:false,
    scheduleGate:null,readGate:null,failPreferences:false,failJournal:false};
  const storage={async getItem(key){if(key==='go_alarm_incidents_v1'&&state.failJournal)throw Error('PRIVATE STORAGE ERROR');return disk.get(key)??null;},
    async setItem(key,value){if(key==='go_alarm_incidents_v1'&&state.failJournal)throw Error('PRIVATE STORAGE ERROR');disk.set(key,value);},
    async multiGet(keys){if(state.failPreferences)throw Error('PRIVATE PREFERENCES ERROR');return Promise.all(keys.map(async key=>[key,await storage.getItem(key)]));}};
  const native={IosAuthorizationStatus:{AUTHORIZED:2,PROVISIONAL:3,EPHEMERAL:4},AndroidImportance:{HIGH:4},SchedulableTriggerInputTypes:{DATE:'date'},
    async getPermissionsAsync(){return state.permission;},async requestPermissionsAsync(){calls.push(['permission']);if(state.permissionResult)state.permission=state.permissionResult;return state.permission;},
    async setNotificationChannelAsync(){},async getAllScheduledNotificationsAsync(){if(state.readGate)await state.readGate;if(state.failPending)throw Error('PRIVATE NATIVE ERROR');return state.omitReadback?[]:[...os.values()];},
    async getPresentedNotificationsAsync(){return [...shown.values()];},
    async scheduleNotificationAsync(request){calls.push(['schedule',request.identifier]);if(state.scheduleGate)await state.scheduleGate;
      if(state.failSchedule-->0)throw Error('PRIVATE NATIVE ERROR');os.set(request.identifier,{identifier:request.identifier,content:request.content});
      if(state.ambiguousSchedule-->0)throw Error('PRIVATE NATIVE ERROR AFTER SCHEDULING');return request.identifier;},
    async cancelScheduledNotificationAsync(id){calls.push(['cancel',id]);if(state.failCancel)throw Error('PRIVATE CANCEL ERROR');os.delete(id);},
    async dismissNotificationAsync(id){shown.delete(id);}};
  const cache=new Map();
  function load(file,extra={}){
    const exports={},context={exports,Date:Clock,Intl,console:{warn:message=>warnings.push(message)},Promise,setTimeout,clearTimeout,
      require(name){if(name in extra)return extra[name];
        if(name==='@react-native-async-storage/async-storage')return{default:storage};
        if(name==='react-native')return{Platform:{OS:platform}};if(name==='expo-notifications')return native;
        if(name==='@/data/booking')return{getAuthenticatedUserId:async()=>user};
        if(name==='@workspace/api-zod'||name==='./goLogBridge')return{};
        if(name.startsWith('./'))return module('lib/'+name.slice(2)+'.ts');
        throw Error('Unexpected alarm fixture dependency '+name);}};
    vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:false}}).outputText,context,{filename:file});
    return exports;
  }
  function module(file){if(!cache.has(file))cache.set(file,load(file));return cache.get(file);}
  const store=module('lib/goLogStore.ts'),reminders=module('lib/goTaskReminders.ts'),journal=module('lib/goAlarmIncidents.ts');
  let runtime=module('lib/goTaskReminderRuntime.ts');
  return{disk,os,state,calls,warnings,store,reminders,journal,load,module,get runtime(){return runtime;},
    async start(){return runtime.setNativeTaskReminderScope(alarmScope,'sound');},
    async refresh(ask=false){return runtime.refreshNativeTaskReminders(alarmScope,ask);},
    async edit(change){await store.updateGoLog(rows=>({entries:rows.map(row=>({...row,...change})),result:null}));},
    async status(){return reminders.describeReminders((await store.readGoLog())[0],runtime.getNativeReminderReports(alarmScope));},
    async restart(){runtime.pauseNativeTaskReminderRuntime();cache.delete('lib/goTaskReminderRuntime.ts');runtime=module('lib/goTaskReminderRuntime.ts');return this.start();},
    incidents(){return JSON.parse(disk.get('go_alarm_incidents_v1')||'[]');},
    advance(ms){now+=ms;},user(value){user=value;}};
}
