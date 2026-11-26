import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {React,createRoot,document,ts}=require('./helpers/react-lifecycle.cjs');
const access=require('./helpers/device-location.cjs')();

test('hidden calendars never read location; weather does not prompt and only forwards a coarse point when needed',async()=>{
 let granted=false,model;const calls=[],urls=[];
 const location={Accuracy:{Lowest:1,Low:2},hasServicesEnabledAsync:async()=>true,
  getForegroundPermissionsAsync:async()=>{calls.push('check');return {status:granted?'granted':'undetermined',canAskAgain:true};},
  requestForegroundPermissionsAsync:async()=>{throw Error('Weather must never prompt on mount');},
  getCurrentPositionAsync:async()=>{calls.push('position');return {coords:{latitude:38.1234567,longitude:-1.2345678}};}};
 const context={exports:{},console,Date,Promise,setInterval,clearInterval,
  fetch:async url=>{urls.push(url);return {ok:true,json:async()=>({hourly:{time:[]},daily:{time:[]}})};},
  require:key=>({'react':React,'expo-location':location,'@/lib/deviceLocation':access})[key]};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('hooks/useWeatherContext.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 const root=createRoot(document.createElement('div'));
 const Host=({enabled})=>{model=context.exports.useWeatherContext(enabled);return null;};
 const render=async enabled=>{await React.act(async()=>{root.render(React.createElement(Host,{enabled}));for(let i=0;i<12;i++)await Promise.resolve();});};
 try{
  await render(false);assert.equal(calls.length,0);assert.equal(urls.length,0);
  await render(true);assert.equal(calls.includes('position'),false);assert.equal(model.hasLocation,false);assert.equal(urls.length,0);
  await render(false);granted=true;await render(true);
  assert.equal(calls.filter(c=>c==='position').length,1);assert.equal(urls.length,1);
  const url=new URL(urls[0]);assert.equal(url.searchParams.get('latitude'),'38.12');assert.equal(url.searchParams.get('longitude'),'-1.23');
  await render(false);assert.equal(calls.filter(c=>c==='position').length,1);
 }finally{await React.act(async()=>root.unmount());}
});

test('all existing device-position consumers use the shared foreground mechanism',()=>{
 const files=['app/index.tsx','components/LocalTransportPanel.tsx','data/localTransport.ts','hooks/useBookingAssistant.ts',
  'hooks/useWeatherContext.ts','components/MessageLocationTools.tsx','components/booking/GoBookingScreen.tsx',
  'components/empresa/EmpresaConfigScreen.tsx','components/notes/GoNoteEditor.tsx'];
 for(const file of files){
  const source=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(source,/\b(?:Location|adapter)\.(?:requestForegroundPermissionsAsync|getForegroundPermissionsAsync|getCurrentPositionAsync|getLastKnownPositionAsync)\(/,file);
  assert.match(source,/(readDeviceLocation|locateTransportLocality)/,file);
 }
 assert.match(fs.readFileSync('app/index.tsx','utf8'),/useWeatherContext\(calOpen\)/);
 assert.match(fs.readFileSync('components/AgendaOperativa.tsx','utf8'),/useWeatherContext\(visible\)/);
});
