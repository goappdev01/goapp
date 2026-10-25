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
function fixture(lang='es'){
 const states=[],alerts=[],saves=[];let cursor=0,value;
 const react={Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:props??{},children}),useState:init=>{const i=cursor++;if(!(i in states))states[i]=init;return [states[i],v=>{states[i]=v;}];}};
 const scope={exports:{},require:name=>name==='react'?{...react,default:react}:name==='react-native'?{Text:'Text',View:'View',Switch:'Switch',TextInput:'TextInput',TouchableOpacity:'TouchableOpacity',Alert:{alert:(...args)=>alerts.push(args)}}:name==='@/contexts/LanguageContext'?{useLanguage:()=>({lang})}:name==='@/data/serviceTiming'?timing.exports:(()=>{throw new Error(name);})()};
 vm.runInNewContext(compile(readFileSync('components/empresa/ProfessionalGapPolicy.tsx','utf8')),scope);
 const render=()=>{cursor=0;return scope.exports.ProfessionalGapPolicy({value,color:'#ffd700',onChange:p=>{value=p;saves.push(plain(p));}});};
 return {render,alerts,saves};
}
function all(tree){return [tree,...(Array.isArray(tree)?tree:tree?.children??[]).flatMap(child=>typeof child==='object'&&child!==null?all(child):[])];}
const byId=(tree,id)=>all(tree).find(node=>node?.props?.testID===id);
test('exception is disabled by default; presets/custom input persist explicit authorization and can be disabled again',()=>{
 for(const lang of ['es','en']){
  const f=fixture(lang);let tree=f.render();assert.equal(byId(tree,'professional-gap-enabled').props.value,false);assert.equal(byId(tree,'professional-gap-custom'),undefined);
  byId(tree,'professional-gap-enabled').props.onValueChange(true);tree=f.render();assert.deepEqual(f.saves.at(-1),{allowLastMinuteGaps:true,lastMinuteMinutes:1440});
  const buttons=all(tree).filter(node=>node?.type==='TouchableOpacity');assert.equal(buttons.length,4);
  for(const [i,hours]of [24,12,6,3].entries()){buttons[i].props.onPress();assert.deepEqual(f.saves.at(-1),{allowLastMinuteGaps:true,lastMinuteMinutes:hours*60});}
  for(const [input,minutes]of [['17',1020],['1,5',90],['0.016666666666666666',1]]){
   byId(f.render(),'professional-gap-custom').props.onChangeText(input);byId(f.render(),'professional-gap-custom').props.onEndEditing();assert.equal(f.saves.at(-1).lastMinuteMinutes,minutes);
  }
  const before=f.saves.length;byId(f.render(),'professional-gap-custom').props.onChangeText('0');byId(f.render(),'professional-gap-custom').props.onEndEditing();assert.equal(f.saves.length,before);assert.equal(f.alerts.length,1);
  byId(f.render(),'professional-gap-enabled').props.onValueChange(false);assert.equal(f.saves.at(-1).allowLastMinuteGaps,false);assert.equal(byId(f.render(),'professional-gap-custom'),undefined);
 }
});
test('only positive whole-minute custom windows are accepted; configuration never computes a frontend booking grid',()=>{
 for(const value of [0,-1,1.5,NaN,Infinity,'60',525601])assert.throws(()=>timing.exports.validateBookingGapPolicy({allowLastMinuteGaps:true,lastMinuteMinutes:value}));
 assert.deepEqual(plain(timing.exports.validateBookingGapPolicy({allowLastMinuteGaps:false,lastMinuteMinutes:1,authorizedBy:'untrusted'})),{allowLastMinuteGaps:false,lastMinuteMinutes:1});
});
