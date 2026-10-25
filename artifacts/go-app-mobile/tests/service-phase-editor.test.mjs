import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
const ts=createRequire(path.join(process.cwd(),'package.json'))('typescript');
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,alwaysStrict:false,esModuleInterop:false}}).outputText;
const timing={exports:{},Intl};vm.runInNewContext(compile(readFileSync('data/serviceTiming.ts','utf8')),timing);
const plain=x=>JSON.parse(JSON.stringify(x));
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const phase=(id,durationMinutes,kind='work',extra={})=>({id,name:'',kind,durationMinutes,resources:[],...extra});
const tint=()=>({version:1,mode:'phases',resourcesConfigured:true,phases:[phase('apply',15),phase('wait',30,'wait'),phase('end',15)]});
const nodes=n=>n&&typeof n==='object'?[n,...(n.children??[]).flat(Infinity).flatMap(nodes)]:[];
const text=n=>typeof n==='string'||typeof n==='number'?String(n):(n?.children??[]).flat(Infinity).map(text).join('');
const declaration=ts.createSourceFile('config.tsx',readFileSync('components/empresa/EmpresaConfigScreen.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ServiceTimingEditor');
function fixture(initial,lang='es',resources=[]){
 const states=[],saves=[];let cursor=0,id=0,service=plain(initial),persisted=JSON.stringify(initial);
 const React={createElement:(type,props,...children)=>({type,props:props??{},children}),Fragment:'Fragment',useState:init=>{const index=cursor++;if(!(index in states))states[index]=typeof init==='function'?init():init;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];}};
 const scope={exports:{},React,useState:React.useState,useLanguage:()=>({lang}),...timing.exports,newTimingId:()=>`phase-${++id}`,c:{},TEXT:'#111827',GRAY:'#374151',BLUE:'#1D4ED8',RED:'#B91C1C',View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',TextInput:'TextInput',Switch:'Switch'};
 vm.runInNewContext(compile(declaration.getText()+';exports.Editor=ServiceTimingEditor;'),scope);
 const render=()=>{cursor=0;return scope.exports.Editor({service,staff:[{id:a,name:'Ana'},{id:b,name:'Luis'}],resources,demo:false,onApply:value=>{saves.push(value);service={...service,timing:value};persisted=JSON.stringify(service);}});};
 const find=(predicate)=>nodes(render()).filter(predicate),button=(label,index=0)=>{const matches=find(n=>n.type==='TouchableOpacity'&&text(n)===label);assert.ok(matches[index],'Missing button '+label);return matches[index];};
 const click=(label,index=0)=>button(label,index).props.onPress();
 return {render,find,button,click,saves,get saved(){return JSON.parse(persisted);},reload(){service=JSON.parse(persisted);states.length=0;},open(){click(lang==='en'?'SERVICE TIMES':'TIEMPOS DEL SERVICIO');}};
}
test('continuous is the default, optional editor uses plain language and never silently changes the service duration',()=>{
 const f=fixture({name:'Corte',duration:27,price:15});f.open();assert.equal(f.button('SERVICIO CONTINUO').props.accessibilityState.selected,true);assert.match(text(f.render()),/permanece ocupado/);assert.doesNotMatch(text(f.render()),/Distribución del tiempo|Guardar distribución/);f.click('Guardar tiempos');assert.equal(f.saved.duration,27);assert.equal(f.saved.timing,undefined);
});
for(const lang of ['es','en'])test(`${lang}: 15+30+15 wait needs an explicit YES, totals and chosen release survive a JSON reload`,()=>{
 const f=fixture({name:'Tinte',duration:60,price:30,timing:tint()},lang);f.open();assert.equal(f.button('NO').props.accessibilityState.selected,true);
 const released=()=>f.find(n=>n.props.testID==='service-time-released')[0];assert.match(text(released()),/0 min/);f.click(lang==='en'?'YES':'SÍ');assert.match(text(released()),/30 min/);
 assert.equal(timing.exports.serviceTimingTotals(f.saves.at(-1)?.phases??[]).released,0);f.click(lang==='en'?'Save times':'Guardar tiempos');assert.equal(f.saved.timing.phases[1].releaseProfessional,true);assert.equal(f.saved.duration,60);assert.equal(f.saved.price,30);f.reload();f.open();assert.equal(f.button(lang==='en'?'YES':'SÍ').props.accessibilityState.selected,true);assert.match(text(released()),/30 min/);
});
test('a mismatched sum, fractional duration or empty sequence cannot be saved; correction is explicit',()=>{
 const config=tint();config.phases[1].durationMinutes=25;const f=fixture({name:'Tinte',duration:60,price:30,timing:config});f.open();assert.match(text(f.render()),/Faltan 5 minutos/);f.click('Guardar tiempos');assert.equal(f.saves.length,0);assert.match(text(f.render()),/coincidir/);
 const minutes=()=>f.find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Minutos exactos de fase');minutes()[1].props.onChangeText('30.5');f.click('Guardar tiempos');assert.equal(f.saves.length,0);minutes()[1].props.onChangeText('30');f.click('Guardar tiempos');assert.equal(f.saves.length,1);assert.equal(f.saved.duration,60);
 assert.throws(()=>timing.exports.serializeServiceConfiguration([{name:'Mismatch',duration:30,price:1,timing:tint()}]),/coincidir/);
});
test('add, reorder and delete preserve exact phase identity, resources and sequence',()=>{
 const f=fixture({name:'Tinte',duration:60,price:30,timing:tint()});f.open();f.click('Añadir fase');assert.equal(f.find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Nombre de fase (opcional)').length,4);f.click('Eliminar fase',3);f.click('Bajar',0);f.click('Subir',0);f.click('Guardar tiempos');assert.deepEqual(f.saved.timing.phases.map(p=>p.id),['apply','wait','end']);assert.ok(f.saved.timing.phases.every(p=>p.name===''));
});
test('professional overrides remain independent and persist without changing the general catalogue duration',()=>{
 const base=tint();base.professionalTimings={[a]:{...tint(),durationMinutes:60}};const f=fixture({name:'Tinte',duration:60,price:30,timing:base});f.open();f.click('Luis');f.find(n=>n.props.testID==='professional-service-duration')[0].props.onChangeText('80');
 const values=[20,40,20];f.find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Minutos exactos de fase').forEach((n,i)=>n.props.onChangeText(String(values[i])));f.click('NO');f.click('Guardar tiempos');assert.equal(f.saved.duration,60);assert.equal(f.saved.timing.professionalTimings[b].durationMinutes,80);assert.equal(f.saved.timing.professionalTimings[a].durationMinutes,60);assert.equal(f.saved.timing.phases[1].durationMinutes,30);f.reload();f.open();f.click('Luis');assert.equal(f.find(n=>n.props.testID==='professional-service-duration')[0].props.value,'80');f.click('Ana');assert.equal(f.find(n=>n.props.testID==='professional-service-duration')[0].props.value,'60');
});
test('release validation defaults conservatively and rejects unsafe or forged configurations',()=>{
 assert.equal(timing.exports.validateServiceTiming(tint()).phases[1].releaseProfessional,false);
 const bad=tint();bad.phases[0].releaseProfessional=true;assert.throws(()=>timing.exports.validateServiceTiming(bad));
 const allFree={version:1,mode:'phases',resourcesConfigured:true,phases:[phase('wait',30,'wait',{releaseProfessional:true})]};assert.throws(()=>timing.exports.validateServiceTiming(allFree),/ocupe/);
 const other=tint();other.professionalTimings={[a]:{...tint(),durationMinutes:61}};assert.throws(()=>timing.exports.validateServiceTiming(other));assert.throws(()=>timing.exports.validateServiceTiming({...tint(),professionalTimings:{[a]:{...tint(),durationMinutes:60}}},{staffIds:[b]}));
});

test('editing a continuous service preserves its explicit professional and physical resource requirements',()=>{
 const chair='33333333-3333-4333-8333-333333333333',resources=[{id:chair,name:'Silla',capacity:1}],demand={resourceId:chair,quantity:1,occupancy:'booking'};
 const service={name:'Corte',duration:27,price:15,timing:{version:1,mode:'simple',resourcesConfigured:true,phases:[phase('work',27,'work',{staffId:a,resources:[demand]})]}};
 const f=fixture(service,'es',resources);f.open();f.click('Guardar tiempos');assert.equal(f.saved.timing.phases[0].staffId,a);assert.deepEqual(f.saved.timing.phases[0].resources,[demand]);
 const phased=tint();phased.phases[0].resources=[demand];const g=fixture({name:'Tinte',duration:60,price:30,timing:phased},'es',resources);g.open();g.click('SERVICIO CONTINUO');g.click('Guardar tiempos');assert.equal(g.saves.length,0);assert.match(text(g.render()),/Revisa los profesionales e instalaciones/);
});
