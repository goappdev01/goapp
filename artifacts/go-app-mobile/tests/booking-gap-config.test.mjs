import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
const ts=createRequire(path.join(process.cwd(),'package.json'))('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{esModuleInterop:false,alwaysStrict:false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const timing={exports:{},Intl};vm.runInNewContext(compile(readFileSync('data/serviceTiming.ts','utf8')),timing);
const plain=value=>JSON.parse(JSON.stringify(value));
function reactFixture(){
 const states=[];let cursor=0;
 const react={Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:props??{},children}),useState:init=>{const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];}};
 return {react,reset:()=>{cursor=0;},unmount:()=>{cursor=0;states.length=0;}};
}
const native={Text:'Text',View:'View',Switch:'Switch',TextInput:'TextInput',TouchableOpacity:'TouchableOpacity',ScrollView:'ScrollView'};
function fixture(lang='es',initial){
 const hooks=reactFixture(),alerts=[],saves=[];let value=initial,persisted=JSON.stringify(initial??null);
 const scope={exports:{},require:name=>name==='react'?{...hooks.react,default:hooks.react}:name==='react-native'?{...native,Alert:{alert:(...args)=>alerts.push(args)}}:name==='@/contexts/LanguageContext'?{useLanguage:()=>({lang})}:name==='@/data/serviceTiming'?timing.exports:(()=>{throw new Error(name);})()};
 vm.runInNewContext(compile(readFileSync('components/empresa/ProfessionalGapPolicy.tsx','utf8')),scope);
 const render=()=>{hooks.reset();return scope.exports.ProfessionalGapPolicy({value,color:'#FFD700',onChange:p=>{value=p;saves.push(plain(p));persisted=JSON.stringify(p);}});};
 return {render,alerts,saves,reload:()=>{hooks.unmount();value=JSON.parse(persisted)??undefined;}};
}
function all(tree){return [tree,...(Array.isArray(tree)?tree:tree?.children??[]).flatMap(child=>typeof child==='object'&&child!==null?all(child):[])];}
const byId=(tree,id)=>all(tree).find(node=>node?.props?.testID===id);
const text=tree=>typeof tree==='string'||typeof tree==='number'?String(tree):(Array.isArray(tree)?tree:tree?.children??[]).map(text).join('');
const staffA='33333333-3333-4333-8333-333333333333',staffB='44444444-4444-4444-8444-444444444444';
const business='11111111-1111-4111-8111-111111111111';
const day={shift1:{active:true,from:'09:00',to:'14:00'},shift2:{active:true,from:'16:00',to:'19:00'}};
function declaration(file,name){
 const ast=ts.createSourceFile('source.tsx',readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(node,name);return node.getText(ast);
}
function professionalFixture(initial){
 let config=plain(initial),persisted=JSON.stringify(config),currentId=staffA;
 const hooks=new Map(),react={Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:props??{},children})};
 let active;
 const scope={exports:{},React:react,...native,Feather:'Feather',ProfessionalGapPolicy:'ProfessionalGapPolicy',GoTimeField:'GoTimeField',Alert:{alert(){}},
  Platform:{OS:'ios'},TEXT:'#111827',DIM:'#9CA3AF',RED:'#EF4444',SCHED_DAYS_SHORT:['L','M','X','J','V','S','D'],c:new Proxy({},{get:()=>({})}),
  Haptics:{selectionAsync:async()=>{},notificationAsync:async()=>{},NotificationFeedbackType:{Success:'success'}},
  buildDaysShortT:()=>['L','M','X','J','V','S','D'],buildDefaultStaffSchedules:()=>Object.fromEntries(Array.from({length:7},(_,i)=>[String(i),plain(day)])),
  useState:init=>active.react.useState(init),useLanguage:()=>({lang:'es',t:key=>key}),
  useBusinessConfig:()=>({config,updateConfig:patch=>{config={...config,...patch};persisted=JSON.stringify(config);}})};
 vm.runInNewContext(compile(declaration('components/empresa/EmpresaConfigScreen.tsx','ProfessionalScheduleSection')+';exports.Section=ProfessionalScheduleSection;'),scope);
 const render=(id=currentId)=>{currentId=id;if(!hooks.has(id))hooks.set(id,reactFixture());active=hooks.get(id);active.reset();return scope.exports.Section({staffName:id===staffA?'Ana':'Luis',staffId:id,businessId:business,color:'#FFD700'});};
 return {render,get config(){return config;},reload(){hooks.clear();config=JSON.parse(persisted);}};
}

test('exception is disabled by default; presets/custom input persist explicit authorization and can be disabled again',()=>{
 for(const lang of ['es','en']){
  const f=fixture(lang);let tree=f.render();assert.equal(byId(tree,'professional-gap-enabled').props.value,false);
  assert.equal(byId(tree,'professional-gap-custom').props.editable,false);
  for(const hours of [24,12,6,3]){const option=byId(tree,'professional-gap-preset-'+hours);assert.equal(option.props.disabled,true);option.props.onPress();}
  assert.equal(f.saves.length,0,'inactive options cannot authorize or save a new value');
  byId(tree,'professional-gap-enabled').props.onValueChange(true);tree=f.render();assert.deepEqual(f.saves.at(-1),{allowLastMinuteGaps:true,lastMinuteMinutes:1440});
  for(const hours of [24,12,6,3]){byId(f.render(),'professional-gap-preset-'+hours).props.onPress();assert.deepEqual(f.saves.at(-1),{allowLastMinuteGaps:true,lastMinuteMinutes:hours*60});
   assert.equal(byId(f.render(),'professional-gap-preset-'+hours).props.accessibilityState.selected,true);}
  for(const [input,minutes]of [['17',1020],['1,5',90],['0.016666666666666666',1]]){
   byId(f.render(),'professional-gap-custom').props.onChangeText(input);byId(f.render(),'professional-gap-custom').props.onEndEditing();assert.equal(f.saves.at(-1).lastMinuteMinutes,minutes);
  }
  const before=f.saves.length;byId(f.render(),'professional-gap-custom').props.onChangeText('0');byId(f.render(),'professional-gap-custom').props.onEndEditing();assert.equal(f.saves.length,before);assert.equal(f.alerts.length,1);
  byId(f.render(),'professional-gap-enabled').props.onValueChange(false);assert.equal(f.saves.at(-1).allowLastMinuteGaps,false);assert.equal(byId(f.render(),'professional-gap-custom').props.editable,false);
  f.reload();assert.equal(byId(f.render(),'professional-gap-enabled').props.value,false);assert.match(text(byId(f.render(),'professional-gap-selected')),/0\.016666/);
 }
});

test('only positive whole-minute custom windows are accepted; configuration never computes a frontend booking grid',()=>{
 for(const value of [0,-1,1.5,NaN,Infinity,'60',525601])assert.throws(()=>timing.exports.validateBookingGapPolicy({allowLastMinuteGaps:true,lastMinuteMinutes:value}));
 assert.deepEqual(plain(timing.exports.validateBookingGapPolicy({allowLastMinuteGaps:false,lastMinuteMinutes:1,authorizedBy:'untrusted'})),{allowLastMinuteGaps:false,lastMinuteMinutes:1});
});

test('custom intervals restore their visible value after reopening and independent professionals never share drafts',()=>{
 const ana=fixture('es',{allowLastMinuteGaps:true,lastMinuteMinutes:1020}),luis=fixture('es',{allowLastMinuteGaps:false,lastMinuteMinutes:360});
 assert.equal(byId(ana.render(),'professional-gap-custom').props.value,'17');
 byId(ana.render(),'professional-gap-custom').props.onChangeText('2.5');byId(ana.render(),'professional-gap-custom').props.onEndEditing();ana.reload();
 assert.equal(byId(ana.render(),'professional-gap-custom').props.value,'2.5');assert.match(text(byId(ana.render(),'professional-gap-selected')),/2\.5/);
 luis.reload();assert.equal(byId(luis.render(),'professional-gap-enabled').props.value,false);assert.equal(byId(luis.render(),'professional-gap-preset-6').props.accessibilityState.selected,true);assert.equal(luis.saves.length,0);
});

test('schedule collapsed or open: exceptions stay visible independently, with isolated per-professional saves and unchanged split shifts',()=>{
 const initial={businessId:business,staffSchedules:{[staffA]:{useCompanySchedule:false,daySchedules:{'0':day},gapPolicy:{allowLastMinuteGaps:true,lastMinuteMinutes:1020}},[staffB]:{useCompanySchedule:true,daySchedules:{},gapPolicy:{allowLastMinuteGaps:false,lastMinuteMinutes:360}}}};
 const f=professionalFixture(initial);let tree=f.render(staffA);
 assert.match(text(tree),/HORARIO DEL PROFESIONAL/);assert.equal(byId(tree,'professional-schedule-toggle').props.accessibilityState.expanded,false);
 assert.equal(all(byId(tree,'professional-schedule-section')).some(n=>n?.type==='ProfessionalGapPolicy'),false,'exceptions cannot be inside the schedule wrapper');
 let panel=all(tree).find(n=>n?.type==='ProfessionalGapPolicy');assert.ok(panel,'visible without expanding schedule');assert.equal(panel.props.key,staffA);
 panel.props.onChange({allowLastMinuteGaps:false,lastMinuteMinutes:1020});assert.deepEqual(f.config.staffSchedules[staffA].daySchedules,initial.staffSchedules[staffA].daySchedules);assert.deepEqual(f.config.staffSchedules[staffB],initial.staffSchedules[staffB]);
 byId(tree,'professional-schedule-toggle').props.onPress();tree=f.render(staffA);assert.equal(byId(tree,'professional-schedule-toggle').props.accessibilityState.expanded,true);assert.equal(all(tree).filter(n=>n?.type==='ProfessionalGapPolicy').length,1);
 assert.equal(all(tree).filter(n=>n?.type==='GoTimeField').length,4,'both existing shifts retain start and end controls');
 const company=all(tree).find(n=>n?.type==='TouchableOpacity'&&text(n)==='biz_company_schedule');assert.ok(company);company.props.onPress();
 assert.deepEqual(f.config.staffSchedules[staffA].gapPolicy,{allowLastMinuteGaps:false,lastMinuteMinutes:1020},'changing schedule mode preserves separate authorization');
 f.reload();tree=f.render(staffB);panel=all(tree).find(n=>n?.type==='ProfessionalGapPolicy');assert.equal(panel.props.key,staffB);assert.deepEqual(plain(panel.props.value),initial.staffSchedules[staffB].gapPolicy);
 panel.props.onChange({allowLastMinuteGaps:true,lastMinuteMinutes:720});f.reload();
 assert.deepEqual(f.config.staffSchedules[staffA].gapPolicy,{allowLastMinuteGaps:false,lastMinuteMinutes:1020});assert.deepEqual(f.config.staffSchedules[staffB].gapPolicy,{allowLastMinuteGaps:true,lastMinuteMinutes:720});
});

test('active and inactive exception text/input remains high contrast on white, with explicit selected/disabled states',()=>{
 const rgb=hex=>hex.slice(1,7).match(/../g).map(v=>parseInt(v,16)/255);
 const luminance=color=>color.map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
 const flatten=style=>Object.assign({},...(Array.isArray(style)?style.flat(Infinity):[style]).filter(Boolean));
 for(const enabled of [false,true])for(const lang of ['es','en']){
  const tree=fixture(lang,{allowLastMinuteGaps:enabled,lastMinuteMinutes:360}).render();let count=0;
  function inspect(node,bg=[1,1,1]){
   if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(n=>inspect(n,bg));return;}
   const style=flatten(node.props.style);
   if(style.backgroundColor){const hex=style.backgroundColor,alpha=hex.length===9?parseInt(hex.slice(7,9),16)/255:1;bg=rgb(hex).map((v,i)=>v*alpha+bg[i]*(1-alpha));}
   assert.ok(style.opacity===undefined||style.opacity===1,'disabled contents must not be faded out');
   for(const color of [style.color,node.props.placeholderTextColor].filter(Boolean)){
    const a=luminance(rgb(color)),b=luminance(bg),ratio=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);assert.ok(ratio>=4.5,`${color}: contrast ${ratio}`);count++;
   }
   (node.children??[]).forEach(child=>inspect(child,bg));
  }
  inspect(tree);assert.ok(count>=10);assert.match(text(tree),lang==='es'?/HUECOS EXCEPCIONALES/:/EXCEPTIONAL GAPS/);
  assert.equal(byId(tree,'professional-gap-preset-6').props.accessibilityState.selected,true);assert.equal(byId(tree,'professional-gap-preset-6').props.accessibilityState.disabled,!enabled);
 }
});

test('existing storage/synchronization roundtrip preserves different authorizations and hours for two professionals',async()=>{
 const writes=new Map([[staffA,{id:staffA,businessId:business,name:'Ana',active:true,serviceIds:['cut']}],[staffB,{id:staffB,businessId:business,name:'Luis',active:true,serviceIds:['cut']}]]),windows=[];
 const scope={exports:{},...timing.exports,SECTORS:[],isCloudId:timing.exports.isStableBookingId,deriveCancellationPolicy:()=>({}),console:{log(){}},
  getBusinesses:async()=>[{id:business,timezone:'Europe/Madrid'}],saveBusiness:async()=>{},getBookableItems:async()=>[{id:'cut',title:'Corte',durationMinutes:20,price:12,customerCapacity:1,active:true}],
  getStaff:async()=>[...writes.values()].map(plain),saveStaff:async member=>{writes.set(member.id,plain(member));},getAvailabilityWindows:async()=>[],createAvailabilityWindow:async window=>windows.push(plain(window)),
  migrateDayScheduleEntry:v=>v.shift1?v:{shift1:{...v,active:true},shift2:{active:false}}};
 vm.runInNewContext(compile(declaration('contexts/GoBusinessConfigContext.tsx','ensureBookingRecord')+';exports.sync=ensureBookingRecord;'),scope);
 const stored=JSON.stringify({businessId:business,businessName:'Local',activeDays:[0],openFrom:'09:00',openTo:'19:00',daySchedules:{'0':day},
  services:[{name:'Corte',duration:20,price:12,capacity:1}],plantillaItems:[{staffNames:['Ana','Luis'],staffServices:[['Corte'],['Corte']]}],
  staffSchedules:{[staffA]:{useCompanySchedule:false,daySchedules:{'0':day},gapPolicy:{allowLastMinuteGaps:true,lastMinuteMinutes:1020}},[staffB]:{useCompanySchedule:true,daySchedules:{},gapPolicy:{allowLastMinuteGaps:false,lastMinuteMinutes:360}}}});
 await scope.exports.sync(JSON.parse(stored),async()=>{},'owner');
 assert.deepEqual(writes.get(staffA).gapPolicy,{allowLastMinuteGaps:true,lastMinuteMinutes:1020});assert.deepEqual(writes.get(staffB).gapPolicy,{allowLastMinuteGaps:false,lastMinuteMinutes:360});
 const before=plain([...writes.values()]);await scope.exports.sync(JSON.parse(stored),async()=>{},'owner');assert.deepEqual([...writes.values()],before);
 assert.deepEqual(windows.filter(w=>w.staffId===staffA).map(w=>[w.visibleStartHour,w.visibleEndHour]),[[9,14],[16,19],[9,14],[16,19]]);assert.equal(windows.some(w=>w.staffId===staffB),false);
});
