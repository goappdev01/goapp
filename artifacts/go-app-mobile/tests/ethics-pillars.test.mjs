import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(file,imports={},extra='',source=readFileSync(file,'utf8')){
 const context={exports:{},console,setTimeout,clearTimeout,require:name=>{if(name in imports)return imports[name];throw Error('Unexpected import '+name);}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText+extra,context);return context.exports;
}
const catalogue=load('lib/ethicsPillars.ts'),plain=value=>JSON.parse(JSON.stringify(value));
const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...(tree.children??[]).flat(Infinity).flatMap(nodes)];
const text=tree=>nodes(tree).flatMap(n=>n.children??[]).filter(v=>typeof v==='string').join(' ');
const flatten=value=>Object.assign({},...[value].flat(Infinity).filter(Boolean));
function fixture(lang='es',bottom=34){
 let cursor=0;const state=[];
 const react={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),Fragment:'Fragment',
  useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],next=>{state[i]=typeof next==='function'?next(state[i]):next;}];}};
 const imports={react,'react-native':{...Object.fromEntries(['View','Text','ScrollView','TouchableOpacity','Modal'].map(name=>[name,name])),StyleSheet:{create:styles=>styles}},
  '@expo/vector-icons':{Feather:'Icon'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom})},
  '@/contexts/LanguageContext':{useLanguage:()=>({lang})},'@/lib/ethicsPillars':catalogue,
  '@/components/ui/GoCloseButton':{GoCloseButton:'GoCloseButton'},'@/components/DraggableFAB':{DraggableFAB:'DraggableFAB'},
  './GoEticaScreen':{GoEticaScreen:'ExistingEthicsScreen'},'./GoEthicsPillarsScreen':{GoEthicsPillarsScreen:'PillarsWindow'},'../financial/FinancialPlanScreen':{FinancialPlanScreen:'ExistingFinancialScreen'}};
 return{imports,render(fn,props){cursor=0;return fn(props);}};
}

test('the initial version contains the exact six approved Spanish pillars with stable IDs and no invented relationships',()=>{
 const {ETHICS_FOUNDATION:base}=catalogue;
 assert.equal(base.version,1);assert.equal(base.status,'initial-base-pending-multidisciplinary-validation');
 assert.equal(base.pillars.length,6);assert.equal(new Set(base.pillars.map(p=>p.id)).size,6);
 assert.deepEqual(plain(base.pillars.map(p=>p.number)),['01','02','03','04','05','06']);
 assert.deepEqual(plain(base.pillars.map(p=>p.title.es)),[
  'Autonomía y libertad humana','Privacidad y dignidad humana','Transparencia y reconocimiento de limitaciones',
  'Supervisión y control humano','Protección humana por encima del beneficio económico','Escucha, ayuda y acompañamiento humano']);
 assert.deepEqual(plain(base.pillars.map(p=>p.paragraphs.es)),[
  ['La inteligencia artificial debe ayudar a las personas sin sustituir su voluntad, manipular sus decisiones ni limitar injustificadamente su libertad.'],
  ['Proteger la intimidad, la identidad y los datos personales. Utilizar únicamente la información necesaria para cada finalidad, respetando los derechos de las personas.'],
  ['La inteligencia artificial debe reconocer sus limitaciones, incertidumbres y posibles errores. No presentar como certezas informaciones que no estén suficientemente acreditadas.'],
  ['Las actuaciones sensibles deben permanecer bajo control humano, garantizando mecanismos de autorización, intervención, interrupción y rectificación cuando corresponda.'],
  ['La seguridad, la dignidad, los derechos y el bienestar de las personas deben prevalecer sobre los intereses comerciales y económicos del sistema.'],
  ['La inteligencia artificial ayudará, escuchará y acompañará al ser humano en su proceso, pero nunca estará orientada a sustituirlo, anularlo o bloquearlo.',
   'Su finalidad será potenciar las capacidades humanas, respetando los ritmos, las decisiones y la autonomía de cada persona, sin generar dependencia ni imponer su criterio.',
   'Este principio no impedirá aplicar las salvaguardas necesarias frente a actuaciones peligrosas o contrarias a los derechos de otras personas.']]);
 for(const pillar of base.pillars){assert.equal(pillar.relations.length,0);assert.equal(pillar.paragraphs.en.length,pillar.paragraphs.es.length);assert.ok(pillar.title.en);}
});

for(const lang of ['es','en'])test('numbered accordion is independently readable, expandable and reversible in '+lang,()=>{
 const f=fixture(lang),screen=load('components/empresa/GoEthicsPillarsScreen.tsx',f.imports).GoEthicsPillarsScreen;
 let tree=f.render(screen);assert.equal(nodes(tree).filter(n=>n.props.testID?.startsWith('ethics-pillar-toggle-')).length,6);
 assert.equal(nodes(tree).filter(n=>n.props.testID?.startsWith('ethics-pillar-body-')).length,0);
 assert.match(text(tree),lang==='es'?/Pendiente de desarrollo y validación multidisciplinar/:/Pending further development and multidisciplinary validation/);
 for(const pillar of catalogue.ETHICS_FOUNDATION.pillars){
  const toggle=nodes(tree).find(n=>n.props.testID==='ethics-pillar-toggle-'+pillar.number);
  assert.equal(toggle.props.accessibilityRole,'button');assert.equal(toggle.props.accessibilityState.expanded,false);
  assert.equal(toggle.props.accessibilityLabel,pillar.number+'. '+pillar.title[lang]);toggle.props.onPress();tree=f.render(screen);
  const body=nodes(tree).find(n=>n.props.testID==='ethics-pillar-body-'+pillar.number);assert.ok(body);
  for(const paragraph of pillar.paragraphs[lang])assert.ok(text(body).includes(paragraph));
 }
 assert.equal(nodes(tree).filter(n=>n.props.testID?.startsWith('ethics-pillar-body-')).length,6);
 nodes(tree).find(n=>n.props.testID==='ethics-pillar-toggle-06').props.onPress();tree=f.render(screen);
 assert.equal(nodes(tree).some(n=>n.props.testID==='ethics-pillar-body-06'),false);
 assert.ok(nodes(tree).some(n=>n.props.testID==='ethics-pillar-body-01'));
});

test('text can wrap and enlarge without fixed card heights, shrinking or clipped lines; the final card can scroll above existing navigation',()=>{
 for(const bottom of [0,21,34]){
  const f=fixture('es',bottom),screen=load('components/empresa/GoEthicsPillarsScreen.tsx',f.imports).GoEthicsPillarsScreen;
  let tree=f.render(screen);for(const pillar of catalogue.ETHICS_FOUNDATION.pillars){nodes(tree).find(n=>n.props.testID==='ethics-pillar-toggle-'+pillar.number).props.onPress();tree=f.render(screen);}
  assert.equal(tree.type,'ScrollView');assert.equal(flatten(tree.props.contentContainerStyle).paddingBottom,bottom+168);
  for(const node of nodes(tree)){
   const style=flatten(node.props.style);assert.equal(node.props.numberOfLines,undefined);assert.equal(node.props.adjustsFontSizeToFit,undefined);assert.notEqual(node.props.allowFontScaling,false);
   assert.equal(style.height,undefined);assert.equal(style.maxHeight,undefined);assert.notEqual(style.overflow,'hidden');
   if(node.props.testID?.startsWith('ethics-pillar-toggle-'))assert.ok(style.minHeight>=44);
  }
 }
});

test('the new window uses the existing architecture stack and keeps every previous Ethics window and 11/99 review',()=>{
 const f=fixture(),file='components/empresa/GoRoadmapScreen.tsx',extra='\nexports.tree=ROADMAP_TREE;';
 const roadmap=load(file,f.imports,extra),previous=execFileSync('git',['show','74cc4f43621be9979c180a617fcc4082dc79f5bf:artifacts/go-app-mobile/'+file],{encoding:'utf8'});
 const old=load(file,f.imports,extra,previous);
 const removeNew=tree=>tree.filter(n=>n.key!==catalogue.ETHICS_PILLARS_KEY).map(n=>({...n,...(n.children?{children:removeNew(n.children)}:{})}));
 assert.deepEqual(plain(removeNew(roadmap.tree)),plain(old.tree),'Only the requested window is added to the existing tree');
 const humanity=roadmap.tree.find(n=>n.key==='humanity'),ethics=humanity.children.find(n=>n.key==='etica'),pillar=ethics.children.find(n=>n.key===catalogue.ETHICS_PILLARS_KEY);
 let stack=[humanity,ethics];const render=()=>{
  const element=f.render(roadmap.GoRoadmapScreen,{navStack:stack,setNavStack:next=>{stack=next;}});
  return typeof element.type==='function'?f.render(element.type,element.props):element;
 };
 let tree=render();nodes(tree).find(n=>n.props.testID==='ethics-pillars-open').props.onPress();assert.equal(stack.at(-1).key,pillar.key);assert.equal(render().type,'PillarsWindow');
 stack=stack.slice(0,-1);tree=render();assert.ok(nodes(tree).some(n=>n.props.testID==='ethics-pillars-open'));
 const review=nodes(tree).find(n=>n.type==='TouchableOpacity'&&text(n).trim()==='Ética 11/99');assert.ok(review);review.props.onPress();tree=render();
 const existing=nodes(tree).find(n=>n.type==='ExistingEthicsScreen');assert.equal(existing.props.initialModule,'etica');
 const oldReview=execFileSync('git',['show','74cc4f43621be9979c180a617fcc4082dc79f5bf:artifacts/go-app-mobile/components/empresa/GoEticaScreen.tsx'],{encoding:'utf8'});
 assert.equal(readFileSync('components/empresa/GoEticaScreen.tsx','utf8').replace(/\r\n/g,'\n'),oldReview.replace(/\r\n/g,'\n'));
});
