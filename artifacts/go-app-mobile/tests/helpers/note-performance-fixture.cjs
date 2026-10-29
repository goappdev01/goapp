const h=require('./unified-note-fixture.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
/** Real note/auth/file stores, runtime, native scheduler and Expo adapter; OS calls are controlled ports. */
async function performanceFixture({storePath='lib/unifiedNoteStore.ts',runtimePath='lib/goTaskReminderRuntime.ts',schedulerPath='lib/goNativeReminderScheduler.ts',onNativeCall}={}){
 const f=await h.diskFixture(),os=new Map(),shown=new Map(),counts={},times=[];let delays={},blocked=null,permission={granted:true,canAskAgain:true,ios:{status:2,allowsSound:true,allowsAlert:true}},failCancel=false;
 const nativeCall=async(name,action)=>{const start=performance.now();counts[name]=(counts[name]||0)+1;onNativeCall?.(name);if(delays[name])await pause(delays[name]);if(blocked?.name===name)await blocked.promise;try{return await action();}finally{times.push({name,ms:performance.now()-start});}};
 const native={IosAuthorizationStatus:{AUTHORIZED:2,PROVISIONAL:3,EPHEMERAL:4},SchedulableTriggerInputTypes:{DATE:'date'},AndroidImportance:{HIGH:4},
  getPermissionsAsync:()=>nativeCall('permission',()=>permission),requestPermissionsAsync:()=>nativeCall('permissionRequest',()=>permission),
  getAllScheduledNotificationsAsync:()=>nativeCall('pending',()=>[...os.values()]),getPresentedNotificationsAsync:()=>nativeCall('delivered',()=>[...shown.values()]),
  scheduleNotificationAsync:request=>nativeCall('schedule',()=>{os.set(request.identifier,{identifier:request.identifier,content:request.content});return request.identifier;}),
  cancelScheduledNotificationAsync:id=>nativeCall('cancel',()=>{if(failCancel)throw Error('No se pudo cancelar el aviso');os.delete(id);}),dismissNotificationAsync:id=>nativeCall('dismiss',()=>shown.delete(id))};
 const reminders=h.load('lib/goTaskReminders.ts',{'@workspace/api-zod':{},'./goLogBridge':{},'./goTaskAccess':f.access});
 const tools=h.load('lib/goNoteTools.ts'),scheduler=h.load(schedulerPath,{'./goTaskAccess':f.access,'./goTaskReminders':reminders,'./goNoteTools':tools});
 const adapter=h.load('lib/goNativeNotificationAdapter.ts',{'react-native':{Platform:{OS:'ios'}},'expo-notifications':native});
 const storage={...f.storage,multiGet:async keys=>Promise.all(keys.map(async key=>[key,await f.storage.getItem(key)]))};
 const runtimeImports={'@react-native-async-storage/async-storage':storage,'./goLogStore':f.store,'./goNoteTools':tools,'./goTaskAccess':f.access,'./goTaskReminders':reminders,'./goNativeReminderScheduler':scheduler,'./goNativeNotificationAdapter':adapter,'./goTaskNotificationFocus':h.load('lib/goTaskNotificationFocus.ts')};
 const runtime=h.load(runtimePath,runtimeImports,{performance});
 const noteProgress=h.load('lib/goNoteSaveProgress.ts',{}, {performance});
 const apiImports={'@react-native-async-storage/async-storage':f.storage,'./goTaskAccess':f.access,'./goLogStore':f.store,'./goNoteFiles':f.fileApi,'./unifiedNotes':f.model,'./goTaskReminders':reminders,'./goTaskReminderRuntime':runtime,'./goNoteSaveProgress':noteProgress};
 return{...f,get rows(){return f.rows;},get writes(){return f.writes;},get reads(){return f.reads;},os,counts,times,native,runtime,scheduler,noteProgress,imports:apiImports,
  api(extra={}){return h.load(storePath,{...apiImports,...extra},{performance});},
  async prime(count=0){if(count){const rows=Array.from({length:count},(_,i)=>f.model.buildNoteEntry(f.draft({id:'fixture-note-'+i,title:'Aviso '+i,destination:'calendar',dateISO:'2027-12-30',time:'18:30',duration:'1h',reminderMinutes:15}),f.scope));await f.store.updateGoLog(()=>({entries:rows,result:null}));}await runtime.setNativeTaskReminderScope(f.scope,'sound');for(const key of Object.keys(counts))delete counts[key];times.length=0;},
  delay(values){delays=values;},block(name,promise){blocked={name,promise};},release(){blocked=null;},permission(value){permission=value;},failCancel(value){failCancel=value;},resetCounts(){for(const key of Object.keys(counts))delete counts[key];times.length=0;}};
}
module.exports={...h,performanceFixture,pause};
