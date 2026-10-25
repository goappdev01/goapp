import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
const require=createRequire(path.join(process.cwd(),'package.json'));
const ts=require('typescript');
const read=file=>readFileSync(file,'utf8');
function execute(source,modules={}) {
  const scope={exports:{},require:name=>{assert.ok(name in modules,'unexpected module '+name);return modules[name];}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{ alwaysStrict: false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,scope);
  return scope.exports;
}
const translations=execute(read('i18n/translations.ts')).translations;
function languageFixture() {
  const slots=[],effects=[],writes=[];let cursor=0,resolve,reject,cleanup;
  const pending=new Promise((a,b)=>{resolve=a;reject=b;});
  const React={
    createContext:()=>({Provider:'LanguageProvider'}),
    createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useContext:()=>{},
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>slots[i]=value];},
    useRef(initial){const i=cursor++;return slots[i]??={current:initial};},
    useCallback:f=>f,
    useEffect:f=>{if(!effects.length)effects.push(f);},
  };
  const modules={react:{__esModule:true,default:React,...React},
    '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:()=>pending,setItem:async(...args)=>{writes.push(args);}}},
    '@/i18n/translations':{translations}};
  const {LanguageProvider}=execute(read('contexts/LanguageContext.tsx'),modules);
  function render(){cursor=0;return LanguageProvider({children:'existing-app'}).props.value;}
  render();cleanup=effects[0]();
  return {render,writes,resolve,reject,unmount:()=>cleanup()};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
for(const preference of [null,'unsupported','es'])test('Spanish Spain is default with preference '+preference,async()=>{
  const f=languageFixture();f.resolve(preference);await flush();
  assert.equal(f.render().lang,'es');assert.equal(f.render().locale,'es-ES');assert.deepEqual(f.writes,[]);
});
test('Stored explicit English preference remains supported',async()=>{
  const f=languageFixture();f.resolve('en');await flush();
  assert.equal(f.render().lang,'en');assert.equal(f.render().t('biz_panel_daily'),'Daily operations');
});
test('Unavailable preference storage retains Spanish default',async()=>{
  const f=languageFixture();f.reject(new Error('offline storage'));await flush();assert.equal(f.render().locale,'es-ES');
});
test('A new explicit choice cannot be replaced by the delayed initial read',async()=>{
  const f=languageFixture();f.render().setLang('en');f.resolve(null);await flush();
  assert.equal(f.render().lang,'en');assert.deepEqual(f.writes,[['go_app_language_v1','en']]);
});
test('Unmount prevents a late preference from changing language',async()=>{
  const f=languageFixture();f.unmount();f.resolve('en');await flush();assert.equal(f.render().lang,'es');
});
test('Context/business translations have matching keys and Spanish example messages',()=>{
  assert.deepEqual(Object.keys(translations.es).sort(),Object.keys(translations.en).sort());
  assert.equal(translations.es.biz_panel_new,'Nueva empresa');
  assert.equal(translations.es.biz_suite_bookings_desc,'Configuración de reservas y operaciones en tiempo real');
  assert.equal(translations.es.biz_suite_routes_desc,'Visitas, rutas y agenda de campo');
  assert.equal(translations.es.biz_panel_daily,'Operaciones diarias');
  assert.equal(translations.es.biz_panel_floor_plan,'Plano');
  assert.equal(translations.es.biz_panel_continue_step.replace('__STEP__','1'),'Continuar en el paso 1 →');
});
function selectorFixture(width,fontScale,disabled=false) {
  const calls=[];
  const React={createElement:(type,props,...children)=>({type,props:{...props,children:children.flat(Infinity)}})};
  const native={View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',StyleSheet:{create:v=>v},useWindowDimensions:()=>({width,fontScale})};
  const {AccountContextSelector}=execute(read('components/auth/AccountContextSelector.tsx'),{react:{__esModule:true,default:React},'react-native':native,'@expo/vector-icons':{Feather:'Feather'}});
  const options=['ADMIN','BUSINESS','USER'].map(id=>({id,label:id==='BUSINESS'?'EMPRESA':id==='USER'?'USUARIO':'ADMIN',icon:'user',color:'#4A80BD',sublabel:'',description:''}));
  const tree=AccountContextSelector({options,disabled,testIDPrefix:'test',onSelect:id=>calls.push(id)});
  function nodes(node=tree){if(!node||typeof node!=='object')return [];return [node,...(node.props?.children??[]).flat(Infinity).filter(x=>x!==undefined).flatMap(x=>nodes(x))];}
  return {tree,nodes,calls};
}
for(const [width,fontScale,expected]of [[390,1,'row'],[320,1,'column'],[430,1.6,'column']])test('Context cards remain readable at '+width+'px, scale '+fontScale,()=>{
  const f=selectorFixture(width,fontScale);
  assert.equal(Object.assign({},...f.tree.props.style.filter(Boolean)).flexDirection,expected);
  const labels=f.nodes().filter(n=>n.type==='Text'&&n.props.adjustsFontSizeToFit);
  assert.equal(labels.length,3);
  assert.deepEqual(labels.map(n=>n.props.children[0]),['ADMIN','EMPRESA','USUARIO']);
  assert.ok(labels.every(n=>n.props.numberOfLines===1&&n.props.minimumFontScale>=0.8));
  for(const card of f.nodes().filter(n=>n.type==='TouchableOpacity'))card.props.onPress();
  assert.deepEqual(f.calls,['ADMIN','BUSINESS','USER']);
});
test('Disabled presentation cannot invoke context navigation',()=>{
  const f=selectorFixture(390,1,true);
  for(const card of f.nodes().filter(n=>n.type==='TouchableOpacity'))card.props.onPress();
  assert.deepEqual(f.calls,[]);
});
test('Business panel uses localization for the reported English labels',()=>{
  const source=read('components/empresa/EmpresaPanel.tsx');
  const ast=ts.createSourceFile('panel.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const visibleLiterals=[];
  const visit=node=>{if(ts.isJsxText(node)||ts.isStringLiteral(node))visibleLiterals.push(node.text);ts.forEachChild(node,visit);};
  visit(ast);
  for(const text of ['New business','Set up business','Visits, routes and field agenda','Daily operations','Floor plan','Continue at step','steps completed','Booking configuration and real-time operations'])
    assert.ok(!visibleLiterals.some(value=>value.includes(text)),'English UI literal left in panel: '+text);
});
