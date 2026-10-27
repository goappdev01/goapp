import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
const ts=createRequire(path.join(process.cwd(),'package.json'))('typescript');
const plain=value=>JSON.parse(JSON.stringify(value));
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,alwaysStrict:false,esModuleInterop:false}}).outputText;
function load(file,imports={},globals={}){const scope={exports:{},Intl,Date,Error,URLSearchParams,console,require:name=>{if(name in imports)return imports[name];if(name==='./serviceTiming')return load('data/serviceTiming.ts');throw Error('Unexpected import '+name);},...globals};vm.runInNewContext(compile(readFileSync(file,'utf8')),scope);return scope.exports;}
const timeline=load('data/bookingTimeline.ts');
const business='11111111-1111-4111-8111-111111111111',staffA='22222222-2222-4222-8222-222222222222',staffB='33333333-3333-4333-8333-333333333333',owner='44444444-4444-4444-8444-444444444444';
const isCloudId=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/i.test(value);
function apiFixture(failure=null){const calls=[];const api=load('data/calendarExceptions.ts',{'./booking':{isCloudId,supabaseApiRequest:async(...args)=>{calls.push(args);if(failure)throw failure;return {exceptions:[]};}},'./bookingTimeline':timeline});return {api,calls};}
test('calendar data adapter preserves exact minutes, scoped author session, date and canonical endpoints without local persistence',async()=>{
 const {api,calls}=apiFixture();await api.getCalendarExceptions(business,'2030-10-27',staffA,'2030-10-01',owner);
 assert.match(calls[0][0],/dateISO=2030-10-27/);assert.match(calls[0][0],new RegExp('staff_id='+staffA));assert.equal(calls[0][2],true);assert.equal(calls[0][3],owner);
 const input={businessId:business,staffId:staffA,dateISO:'2030-10-27',expectedRevision:4,requestId:'stable',intervals:[{kind:'closed',startMinute:577,endMinute:613}]};
 await api.saveCalendarException(input,owner);const body=JSON.parse(calls[1][1].body);assert.deepEqual(body.intervals,input.intervals);assert.equal(body.expectedRevision,4);assert.equal(calls[1][1].method,'PUT');assert.equal(calls[1][3],owner);
 await api.deleteCalendarException(input,owner);assert.equal(calls[2][1].method,'DELETE');assert.equal(JSON.parse(calls[2][1].body).intervals,undefined);
 await assert.rejects(api.saveCalendarException({...input,businessId:'demo'},owner));assert.equal(calls.length,3);
});
test('real dates, exact ranges, full day and duplicate/contradictory overlap validation',()=>{
 const {api}=apiFixture();assert.equal(api.validateCalendarDate('2028-02-29'),'2028-02-29');assert.throws(()=>api.validateCalendarDate('2027-02-29'));
 assert.deepEqual(plain(api.validateCalendarIntervals([{kind:'closed',startMinute:0,endMinute:1440}])),[{kind:'closed',startMinute:0,endMinute:1440}]);
 for(const intervals of [[],[{kind:'closed',startMinute:3.5,endMinute:10}],[{kind:'open',startMinute:10,endMinute:5}],[{kind:'closed',startMinute:5,endMinute:20},{kind:'open',startMinute:10,endMinute:30}]])assert.throws(()=>api.validateCalendarIntervals(intervals));
 assert.equal(api.calendarRangeLabel({startsAt:'2030-10-26T22:00:00Z',endsAt:'2030-10-27T23:00:00Z'},'Europe/Madrid','2030-10-27'),'00:00–24:00');
});
function hooks(){let cursor=0;const slots=[],effects=[];const react={Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:props??{},children}),useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef:initial=>{const i=cursor++;return slots[i]??(slots[i]={current:initial});},useEffect:(effect,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>!Object.is(v,old.deps[n]))){effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:effect()};});}}};return {react,reset:()=>{cursor=0;},run:()=>{for(const effect of effects.splice(0))effect();},unmount:()=>{for(const value of slots)value?.cleanup?.();}};}
const nodes=tree=>[tree,...(Array.isArray(tree)?tree:tree?.children??[]).flatMap(child=>typeof child==='object'&&child!==null?nodes(child):[])];
const byId=(tree,id)=>nodes(tree).find(node=>node?.props?.testID===id),text=tree=>typeof tree==='string'||typeof tree==='number'?String(tree):(Array.isArray(tree)?tree:tree?.children??[]).map(text).join('');
function fixture(){
 const h=hooks(),stored=new Map(),calls=[],alerts=[],managed=[],listeners=new Set();let account=owner,businessId=business,offline=false,hold=null,picker=false,pickDate=null,year=2030,month=9;
 const today=new Date().toISOString().slice(0,10),identity=()=>({userId:account,revision:1}),key=(b,d,s)=>b+'|'+d+'|'+s;
 const result=(b,d,s)=>({timezone:'UTC',exceptions:[...stored.values()].filter(row=>row.businessId===b),day:{dateISO:d,staffId:s,openIntervals:[{startsAt:d+'T09:00:00Z',endsAt:d+'T13:00:00Z'},{startsAt:d+'T16:00:00Z',endsAt:d+'T20:00:00Z'}],closedIntervals:[]}});
 const api=apiFixture().api;
 const get=async(b,d,s,from,user)=>{calls.push({type:'get',b,d,s,user});if(offline)throw typeof offline==='object'?offline:Error('Servidor de excepciones no disponible; no se ha guardado.');const value=result(b,d,s);if(hold){const wait=hold;hold=null;await wait;}return value;};
 const save=async(command,user)=>{calls.push({type:'save',command:plain(command),user});if(offline)throw Error('Servidor no disponible');const id=key(command.businessId,command.dateISO,command.staffId),old=stored.get(id);stored.set(id,{id,businessId:command.businessId,staffId:command.staffId,dateISO:command.dateISO,timezone:'UTC',intervals:plain(command.intervals),revision:(old?.revision??0)+1,conflicts:command.intervals.some(i=>i.startMinute===600)?[{bookingId:'reservation',customerName:'Cliente autorizado',serviceName:'Corte',startsAt:command.dateISO+'T10:00:00Z',endsAt:command.dateISO+'T10:20:00Z',status:'CONFIRMED'}]:[]});return result(command.businessId,command.dateISO,command.staffId);};
 const calendar={get monthGridOpen(){return picker;},get monthGridYear(){return year;},get monthGridMonth(){return month;},cancel(){picker=false;},openForNav(options){picker=true;pickDate=options.onDaySelect;const d=new Date(options.initialDateISO+'T12:00:00');year=d.getFullYear();month=d.getMonth();},handleDayTap(iso){picker=false;pickDate(iso);},navigateMonth(delta){const d=new Date(year,month+delta,1);year=d.getFullYear();month=d.getMonth();},closeMonthGridManual(){picker=false;}};
 const imports={react:{...h.react,default:h.react},'react-native':{Text:'Text',View:'View',TouchableOpacity:'TouchableOpacity',StyleSheet:{create:v=>v},Alert:{alert:(...args)=>alerts.push(args)}},'@expo/vector-icons':{Feather:'Feather'},'@/contexts/LanguageContext':{useLanguage:()=>({lang:'es'})},'@/lib/authSession':{captureAuthIdentity:async()=>identity(),isAuthIdentityCurrent:async who=>who.userId===account},'@/lib/sessionEvents':{onSessionChanged:listener=>{listeners.add(listener);return()=>listeners.delete(listener);}},'@/hooks/useGoCalendarFlow':{useGoCalendarFlow:()=>calendar},'@/lib/time':{formatISODate:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`},'@/data/booking':{isCloudId,getOwnedStaff:async()=>[{id:staffA,name:'Raul 1',active:true},{id:staffB,name:'Raul 2',active:true}]},'@/data/bookingTimeline':timeline,'@/data/calendarExceptions':{...api,
 resolveCalendarExceptionBusiness:async(source,user)=>{if(source!=='local-linked' || user!==owner)throw Error('Este negocio local necesita sincronizarse con el servidor.');return {businessId:business,sourceId:source,name:'María José',timezone:'UTC'};},
 getCalendarExceptionsBatch:async(b,d,ids,from,user)=>{const single=await get(b,d,ids[0],from,user);return {...single,staffIds:ids,days:ids.map(id=>result(b,d,id).day)};},
 saveCalendarExceptionsBatch:async(c,user)=>{calls.push({type:'batch-save',command:plain(c),user});for(const id of c.staffIds)await save({...c,staffId:id,expectedRevision:c.expectedRevisions[id]},user);return {...result(c.businessId,c.dateISO,c.staffIds[0]),staffIds:c.staffIds,days:c.staffIds.map(id=>result(c.businessId,c.dateISO,id).day)};},
 deleteCalendarExceptionsBatch:async c=>{calls.push({type:'batch-delete',command:plain(c)});for(const id of c.staffIds)stored.delete(key(c.businessId,c.dateISO,id));return {...result(c.businessId,c.dateISO,c.staffIds[0]),staffIds:c.staffIds,days:c.staffIds.map(id=>result(c.businessId,c.dateISO,id).day)};},
 getCalendarExceptions:get,saveCalendarException:save,deleteCalendarException:async command=>{calls.push({type:'delete',command});stored.delete(key(command.businessId,command.dateISO,command.staffId));return result(command.businessId,command.dateISO,command.staffId);}},'@/components/ui/GoTimePicker':{GoTimeField:'GoTimeField'}};
 const component=load('components/empresa/CalendarExceptionsSection.tsx',imports).CalendarExceptionsSection;
 const render=()=>{h.reset();return component({businessId,timezone:'UTC',color:'#7C69BE',onManageConflicts:date=>managed.push(date)});};
 const frame=async()=>{let tree;for(let i=0;i<4;i++){tree=render();h.run();await new Promise(r=>setImmediate(r));}return render();};
 return {frame,render,stored,calls,alerts,managed,today,calendar,setOffline:v=>{offline=v;},setBusiness:b=>{businessId=b;},setAccount:user=>{account=user;for(const listener of listeners)listener();},hold:promise=>{hold=promise;},unmount:()=>h.unmount()};
}
test('one section in the existing eight-step Horarios reuses the calendar flow and adds no weekly writer',()=>{
 const source=readFileSync('components/empresa/EmpresaConfigScreen.tsx','utf8'),ast=ts.createSourceFile('config.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const steps=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='buildStepsCfg');assert.equal((steps.getText(ast).match(/key:/g)||[]).length,8);
 const schedule=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='StepHorario').getText(ast);assert.equal((schedule.match(/<CalendarExceptionsSection/g)||[]).length,1);assert.match(source,/currentStep === 2 && <StepHorario/);
 const section=readFileSync('components/empresa/CalendarExceptionsSection.tsx','utf8');assert.match(section,/useGoCalendarFlow/);assert.doesNotMatch(section,/updateConfig|saveAvailabilityWindow|AsyncStorage|setGoLog/);
});
test('exact date picker, scope selection, closures, editing, persistence and deletion keep their canonical day',async()=>{
 const f=fixture();let tree=await f.frame();assert.ok(byId(tree,'calendar-exceptions-section'));assert.ok(byId(tree,'calendar-exception-staff-'+staffA));
 byId(tree,'calendar-exception-date').props.onPress();tree=await f.frame();assert.ok(byId(tree,'calendar-exception-picker'));byId(tree,'calendar-exception-next-month').props.onPress();tree=await f.frame();assert.ok(byId(tree,'calendar-exception-picker'));
 const future='2030-10-27';f.calendar.handleDayTap(future);tree=await f.frame();byId(tree,'calendar-exception-staff-'+staffA).props.onPress();tree=await f.frame();
 byId(tree,'calendar-exception-add-morning').props.onPress();tree=await f.frame();let fields=nodes(tree).filter(node=>node?.type==='GoTimeField');assert.equal(fields[0].props.minuteStep,1);fields[0].props.onConfirm('09:37');fields[1].props.onConfirm('10:13');tree=await f.frame();
 byId(tree,'calendar-exception-save').props.onPress();tree=await f.frame();assert.equal(f.calls.filter(c=>c.type==='save').length,1);const saved=f.calls.find(c=>c.type==='save');assert.equal(saved.command.dateISO,future);assert.equal(saved.command.staffId,staffA);assert.deepEqual(saved.command.intervals,[{kind:'closed',startMinute:577,endMinute:613}]);assert.ok(text(tree).includes('09:37–10:13'));
 byId(tree,'calendar-exception-reload').props.onPress();tree=await f.frame();assert.ok(byId(tree,'calendar-exception-interval-0'));assert.ok(text(tree).includes('09:37–10:13'));
 fields=nodes(tree).filter(n=>n?.type==='GoTimeField');fields[1].props.onConfirm('10:33');tree=await f.frame();byId(tree,'calendar-exception-save').props.onPress();tree=await f.frame();assert.equal(f.calls.filter(c=>c.type==='save').at(-1).command.expectedRevision,1);
 byId(tree,'calendar-exception-delete').props.onPress();f.alerts.at(-1)[2].find(b=>b.style==='destructive').onPress();tree=await f.frame();assert.equal(f.stored.size,0);assert.equal(byId(tree,'calendar-exception-interval-0'),undefined);
 f.unmount();
});
test('full day, afternoon, custom hours and opening are visible editable intervals; duplicate intervals never reach persistence',async()=>{
 const f=fixture();let tree=await f.frame();byId(tree,'calendar-exception-add-day').props.onPress();tree=await f.frame();assert.ok(text(tree).includes('24:00'));byId(tree,'calendar-exception-save').props.onPress();tree=await f.frame();assert.deepEqual(f.calls.find(c=>c.type==='save').command.intervals,[{kind:'closed',startMinute:0,endMinute:1440}]);
 byId(tree,'calendar-exception-remove-0').props.onPress();tree=await f.frame();byId(tree,'calendar-exception-add-afternoon').props.onPress();tree=await f.frame();assert.ok(text(tree).includes('Hasta'));byId(tree,'calendar-exception-open-0').props.onPress();tree=await f.frame();byId(tree,'calendar-exception-save').props.onPress();tree=await f.frame();assert.equal(f.calls.filter(c=>c.type==='save').at(-1).command.intervals[0].kind,'open');
 byId(tree,'calendar-exception-add-hours').props.onPress();tree=await f.frame();byId(tree,'calendar-exception-save').props.onPress();tree=await f.frame();assert.equal(f.calls.filter(c=>c.type==='save').length,3,'A non-overlapping second interval is saved');
 byId(tree,'calendar-exception-add-hours').props.onPress();tree=await f.frame();byId(tree,'calendar-exception-save').props.onPress();tree=await f.frame();assert.ok(text(tree).includes('superponerse'));assert.equal(f.calls.filter(c=>c.type==='save').length,3);f.unmount();
});
test('affected bookings remain registered and link to the existing business Calendar',async()=>{
 const f=fixture();let tree=await f.frame();byId(tree,'calendar-exception-add-hours').props.onPress();tree=await f.frame();const fields=nodes(tree).filter(n=>n?.type==='GoTimeField');fields[0].props.onConfirm('10:00');fields[1].props.onConfirm('11:00');tree=await f.frame();byId(tree,'calendar-exception-save').props.onPress();tree=await f.frame();assert.ok(byId(tree,'calendar-exception-conflicts'));assert.ok(text(tree).includes('Cliente autorizado'));assert.ok(f.alerts.length);byId(tree,'calendar-exception-manage-conflicts').props.onPress();assert.deepEqual(f.managed,[f.today]);f.unmount();
});
test('backend failure keeps the editor truthful and an account change discards late results',async()=>{
 const f=fixture();f.setOffline(true);let tree=await f.frame();assert.ok(text(tree).includes('no se ha guardado'));assert.equal(byId(tree,'calendar-exception-save'),undefined);assert.equal(f.stored.size,0);
 f.setOffline(false);byId(tree,'calendar-exception-reload').props.onPress();tree=await f.frame();assert.ok(byId(tree,'calendar-exception-save'));let release;f.hold(new Promise(r=>{release=r;}));byId(tree,'calendar-exception-reload').props.onPress();tree=await f.frame();f.setAccount('55555555-5555-4555-8555-555555555555');release();tree=await f.frame();assert.ok(f.calls.filter(c=>c.type==='get').at(-1).user!==owner);assert.equal(f.calls.filter(c=>c.type==='save').length,0);f.unmount();
});

test('an unlinked local business cannot contact exception writers or simulate remote persistence',async()=>{
 const f=fixture();f.setBusiness('local-demo');const tree=await f.frame();assert.ok(text(tree).includes('necesita sincronizarse'));assert.equal(f.calls.length,0);assert.equal(f.stored.size,0);assert.equal(byId(tree,'calendar-exception-save'),undefined);f.unmount();
});
test('the existing environment missing the API or SQL explicitly reports unavailable configuration without local success',async()=>{
 for(const status of [404,501]){const {api,calls}=apiFixture(Object.assign(new Error('Unavailable'),{status}));await assert.rejects(api.getCalendarExceptions(business,'2030-10-27',null,'2030-10-27',owner),error=>/actualización del servidor/.test(error.message)&&/No se ha guardado/.test(error.message));assert.equal(calls.length,1);}
});
test('switching the selected professional never presents or saves the previous professional draft',async()=>{
 const f=fixture();let tree=await f.frame();byId(tree,'calendar-exception-staff-'+staffA).props.onPress();tree=await f.frame();byId(tree,'calendar-exception-add-morning').props.onPress();tree=await f.frame();byId(tree,'calendar-exception-save').props.onPress();tree=await f.frame();
 byId(tree,'calendar-exception-staff-'+staffB).props.onPress();assert.equal(byId(f.render(),'calendar-exception-save'),undefined,'A stale day/scope cannot expose an enabled writer before the new read finishes');tree=await f.frame();assert.equal(byId(tree,'calendar-exception-interval-0'),undefined);byId(tree,'calendar-exception-add-afternoon').props.onPress();tree=await f.frame();byId(tree,'calendar-exception-save').props.onPress();tree=await f.frame();
 byId(tree,'calendar-exception-staff-'+staffA).props.onPress();tree=await f.frame();assert.equal(nodes(tree).filter(n=>n?.type==='GoTimeField')[0].props.value,'09:00');assert.equal(f.stored.size,2);f.unmount();
});

test('an unavailable calendar API never hides the existing date and professional controls or simulates a save',async()=>{
 const f=fixture();f.setOffline(Object.assign(new Error('Las excepciones por fecha necesitan la actualización del servidor. No se ha guardado ningún cambio.'),{status:404}));
 let tree=await f.frame();assert.ok(byId(tree,'calendar-exceptions-section'));assert.ok(text(tree).includes('actualización del servidor'));assert.ok(text(tree).includes('No se ha guardado ningún cambio'));
 assert.ok(byId(tree,'calendar-exception-staff-'+staffA));assert.ok(byId(tree,'calendar-exception-staff-'+staffB));
 byId(tree,'calendar-exception-date').props.onPress();tree=await f.frame();assert.ok(byId(tree,'calendar-exception-picker'));
 f.calendar.handleDayTap('2030-10-27');tree=await f.frame();assert.equal(byId(tree,'calendar-exception-date').props.accessibilityState.disabled,false);
 byId(tree,'calendar-exception-staff-'+staffB).props.onPress();tree=await f.frame();assert.equal(byId(tree,'calendar-exception-staff-'+staffB).props.accessibilityState.selected,true);
 assert.equal(byId(tree,'calendar-exception-save'),undefined);assert.equal(f.calls.filter(c=>c.type==='save'||c.type==='delete').length,0);assert.equal(f.stored.size,0);f.unmount();
});

test('several professionals are explicit, recover/edit one atomic scope and leave unselected people alone',async()=>{
 const f=fixture();let tree=await f.frame();byId(tree,'calendar-exception-several').props.onPress();tree=await f.frame();
 byId(tree,'calendar-exception-staff-'+staffB).props.onPress();tree=await f.frame();assert.ok(text(byId(tree,'calendar-exception-selection')).includes('Raul 1, Raul 2'));
 byId(tree,'calendar-exception-add-afternoon').props.onPress();tree=await f.frame();byId(tree,'calendar-exception-save').props.onPress();tree=await f.frame();
 assert.equal(f.calls.filter(c=>c.type==='batch-save').length,1);let command=f.calls.find(c=>c.type==='batch-save').command;assert.deepEqual(new Set(command.staffIds),new Set([staffA,staffB]));assert.deepEqual(command.expectedRevisions,{[staffA]:0,[staffB]:0});assert.equal(f.stored.size,2);
 byId(tree,'calendar-exception-reload').props.onPress();tree=await f.frame();assert.ok(byId(tree,'calendar-exception-interval-0'));
 byId(tree,'calendar-exception-delete').props.onPress();f.alerts.at(-1)[2].find(b=>b.style==='destructive').onPress();tree=await f.frame();assert.equal(f.stored.size,0);assert.equal(f.calls.filter(c=>c.type==='batch-delete').length,1);
 byId(tree,'calendar-exception-staff-'+staffB).props.onPress();tree=await f.frame();byId(tree,'calendar-exception-staff-'+staffA).props.onPress();tree=await f.frame();assert.equal(byId(tree,'calendar-exception-save'),undefined,'An empty selection can never mean all professionals');
 byId(tree,'calendar-exception-business').props.onPress();tree=await f.frame();assert.ok(text(byId(tree,'calendar-exception-selection')).includes('Todos'));f.unmount();
});
test('batch adapter rejects duplicate/local IDs and retains individual revisions and caller identity',async()=>{
 const {api,calls}=apiFixture();const c={businessId:business,staffIds:[staffB,staffA],dateISO:'2030-10-27',intervals:[{kind:'closed',startMinute:540,endMinute:780}],expectedRevisions:{[staffA]:1,[staffB]:0},requestId:'stable-batch'};
 await api.getCalendarExceptionsBatch(business,c.dateISO,c.staffIds,c.dateISO,owner);assert.ok(calls[0][0].includes('staff_ids='));await api.saveCalendarExceptionsBatch(c,owner);assert.deepEqual(JSON.parse(calls[1][1].body).expectedRevisions,c.expectedRevisions);assert.equal(calls[1][3],owner);
 await api.deleteCalendarExceptionsBatch(c,owner);assert.equal(calls[2][1].method,'DELETE');
 for(const staffIds of [[],[staffA,staffA],['local']])await assert.rejects(api.saveCalendarExceptionsBatch({...c,staffIds},owner));assert.equal(calls.length,3);
});

test('a locally registered company resolves its canonical ID and real professionals without borrowing another business by name',async()=>{
 const f=fixture();f.setBusiness('local-linked');let tree=await f.frame();assert.ok(byId(tree,'calendar-exception-staff-'+staffA));assert.ok(f.calls.some(c=>c.type==='get'&&c.b===business));
 byId(tree,'calendar-exception-add-day').props.onPress();tree=await f.frame();byId(tree,'calendar-exception-save').props.onPress();tree=await f.frame();assert.equal(f.calls.find(c=>c.type==='save').command.businessId,business);
 f.setBusiness('different-local-business');tree=await f.frame();assert.equal(byId(tree,'calendar-exception-save'),undefined);assert.equal(byId(tree,'calendar-exception-staff-'+staffA),undefined);assert.ok(text(tree).includes('sincronizarse'));f.unmount();
});
test('company link adapter rejects stale/different source identity and always forwards the captured account',async()=>{
 const calls=[],source='local-linked';let result={businessId:business,sourceId:source,name:'María José',timezone:'Europe/Madrid'};
 const api=load('data/calendarExceptions.ts',{'./booking':{isCloudId,supabaseApiRequest:async(...args)=>{calls.push(args);return result;}},'./bookingTimeline':timeline});
 assert.equal((await api.resolveCalendarExceptionBusiness(source,owner)).businessId,business);assert.equal(calls[0][3],owner);
 result={...result,sourceId:'other-company'};await assert.rejects(api.resolveCalendarExceptionBusiness(source,owner));
});

test('timezone adapter persists the exact selected business and never treats an API failure as a draft save',async()=>{
 const calls=[];let fail=null;
 const api=load('data/calendarExceptions.ts',{'./booking':{isCloudId,supabaseApiRequest:async(path,init,auth,user)=>{calls.push({path,init,user});if(fail)throw fail;return path.includes('booking-calendar-business')?{businessId:business,sourceId:'local-linked',name:'Registered',timezone:'Europe/Madrid'}:{businessId:business,timezone:'Atlantic/Canary'};}},'./bookingTimeline':timeline});
 assert.equal(await api.setCalendarBusinessTimezone('local-linked','Atlantic/Canary',owner),'Atlantic/Canary');assert.equal(calls[1].user,owner);assert.deepEqual(JSON.parse(calls[1].init.body),{business_id:business,timezone:'Atlantic/Canary',expectedTimezone:'Europe/Madrid'});
 fail=Object.assign(Error('Unlinked'),{code:'BOOKING_CALENDAR_BUSINESS_NOT_LINKED',status:404});assert.equal(await api.setCalendarBusinessTimezone('local-draft','Europe/Madrid',owner),'Europe/Madrid');
 fail=Object.assign(Error('API unavailable'),{status:404});await assert.rejects(api.setCalendarBusinessTimezone('local-draft','Europe/Madrid',owner));
 fail=Object.assign(Error('Commitments preserved'),{status:409});await assert.rejects(api.setCalendarBusinessTimezone('local-linked','Atlantic/Canary',owner));
});
