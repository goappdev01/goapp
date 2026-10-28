import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript'),file='components/empresa/GoAdminDashboard.tsx';
const source=readFileSync(file,'utf8');
const sections=['Herramientas','Roadmap GO','Módulos empresariales','Siguientes módulos','Partners','Zonas y tarifas','Consumos','Publicidad','Facturación','Métricas','Empresas','Sistema'];
function screen({allowed=true,adminView=true,owner=true}={}){
 const states=[];let cursor=0,tree,tools=0,context=0,closed=0;
 const react={createElement(type,props,...children){return{type,props:props||{},children:children.flat(Infinity)};},Fragment:'Fragment',useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next;}];}};
 const native=Object.fromEntries(['SafeAreaView','ScrollView','Text','TouchableOpacity','View'].map(n=>[n,n]));native.Dimensions={get:()=>({width:390,height:844})};native.StyleSheet={create:s=>s};
 const modules={react:{...react,default:react},'react-native':native,'@/components/debug/OwnerContextIndicator':{OwnerContextModal:'Modal'},'@expo/vector-icons':{Feather:'Icon'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34})},'expo-status-bar':{StatusBar:'StatusBar'},'@/contexts/LanguageContext':{useLanguage:()=>({lang:'es'})},'@/contexts/GoAdminAccessContext':{useAdminAccess:()=>({allowed,userId:'SYNTHETIC',isOwner:owner})},'@/contexts/GoViewContext':{useGoView:()=>({isAdminView:adminView,isOwner:owner})}};
 const c={exports:{},console,require:k=>{if(k in modules)return modules[k];if(k.startsWith('./')||k==='../DraggableFAB')return new Proxy({},{get:(_,name)=>String(name)});throw Error('Unexpected import '+k);}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,c);
 const props={visible:true,onClose:()=>closed++,onOpenTools:()=>tools++,onOpenContext:()=>context++};
 function render(){cursor=0;tree=c.exports.GoAdminDashboard(props);return tree;}
 function* walk(n){if(!n||typeof n!=='object')return;yield n;for(const child of n.children||[])yield*walk(child);}
 function all(){render();return[...walk(tree)];}
 function button(label){const b=all().find(n=>n.props.accessibilityLabel===label);assert.ok(b,'Button '+label);return b;}
 return{render,all,button,tools:()=>tools,context:()=>context,closed:()=>closed};
}
test('administrator opens with MODULES and exactly the existing cards in the approved order',()=>{
 const h=screen(),nodes=h.all(),scroll=nodes.find(n=>n.type==='ScrollView');assert.equal(scroll.children[0].type,'Text');assert.ok(scroll.children[0].children.includes('MÓDULOS'));
 const cards=nodes.filter(n=>n.props.accessibilityRole==='button'&&sections.includes(n.props.accessibilityLabel));assert.deepEqual(cards.map(n=>n.props.accessibilityLabel),sections);assert.ok(cards.every(n=>n.props.style.minHeight>=72&&n.props.style.borderRadius>=14));assert.equal(nodes.some(n=>n.type==='GoModulePublicationPanel'),false);assert.equal(nodes.filter(n=>n.type?.name==='MetricCard').length,0);
});
test('tools, Roadmap navigation and owner context preserve their original actions',()=>{
 const h=screen();h.button('Herramientas').props.onPress();assert.equal(h.tools(),1);assert.equal(h.all().some(n=>n.children?.includes('MÓDULOS')),true);
 h.button('Roadmap GO').props.onPress();const roadmap=h.all().find(n=>n.type==='GoRoadmapScreen');assert.ok(roadmap);assert.equal(roadmap.props.allowFinancialPlan,true);roadmap.props.setNavStack([{key:'plan_financiero_y_proyecciones',label:'Plan Financiero y Proyecciones'}]);h.button('Volver al paso anterior').props.onPress();assert.equal(h.all().find(n=>n.type==='GoRoadmapScreen').props.navStack.length,0);h.button('Volver al paso anterior').props.onPress();assert.ok(h.all().some(n=>n.children?.includes('MÓDULOS')));assert.equal(h.closed(),0);
 const context=h.all().find(n=>n.type==='TouchableOpacity'&&n.children.some(c=>c?.children?.includes('Cambiar contexto')));assert.ok(context);context.props.onPress();assert.equal(h.context(),1);
});
test('publication settings and existing revenue indicators remain inside System and Metrics',()=>{
 const h=screen();h.button('Sistema').props.onPress();assert.equal(h.all().filter(n=>n.type==='GoModulePublicationPanel').length,1);assert.ok(h.all().some(n=>n.type==='AdminScreen'));h.button('Volver al paso anterior').props.onPress();h.button('Métricas').props.onPress();assert.equal(h.all().filter(n=>n.type?.name==='MetricCard').length,4);assert.ok(h.all().some(n=>n.children?.includes('Ingreso total estimado')));assert.ok(h.all().some(n=>n.children?.includes('Partner más rentable')));
});
test('administrative guard still denies unauthorized identities or a non-admin context',()=>{assert.equal(screen({allowed:false}).render(),null);assert.equal(screen({adminView:false}).render(),null);const h=screen({owner:false});assert.equal(h.all().some(n=>n.children?.includes('Cambiar contexto')),false);});
test('module catalogue and existing floating GO controls are unchanged; Expo Go controls are not included',()=>{
 const original=execFileSync('git',['show',(process.env.GO_FINANCE_NAV_BASE_REF||'HEAD')+':artifacts/go-app-mobile/components/empresa/GoAdminDashboard.tsx'],{encoding:'utf8'});
 function ast(text){return ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);}
 function constant(text,name){const f=ast(text);for(const s of f.statements)if(ts.isVariableStatement(s))for(const d of s.declarationList.declarations)if(d.name.getText(f)===name)return d.initializer.getText(f).replace(/\r\n/g,'\n');throw Error(name);}
 for(const name of ['SECTIONS','MODULOS_EMPRESA_ROADMAP','SIGUIENTES_MODULOS','MOCK_METRICS']){if(source.includes('const '+name))assert.equal(constant(source,name),constant(original,name));}
 function controls(text){const f=ast(text),found=[];function visit(n){if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(f)==='DraggableFAB')found.push(n.getText(f).replace(/\r\n/g,'\n'));ts.forEachChild(n,visit);}visit(f);return found;}
 assert.deepEqual(controls(source),controls(original));assert.doesNotMatch(source,/expo-dev-client|DevMenu|RCTEventEmitter/);
});


test('compact light header is exclusive to Finance and returns to the original Admin header',()=>{
 const h=screen();h.button('Roadmap GO').props.onPress();
 h.all().find(n=>n.type==='GoRoadmapScreen').props.setNavStack([{key:'plan_financiero_y_proyecciones',label:'Plan Financiero y Proyecciones'}]);
 const finance=h.all();assert.equal(finance.filter(n=>n.type==='Text'&&n.children.includes('Proyección de ingresos GO')).length,1);
 assert.equal(finance.some(n=>n.type==='Text'&&n.children.includes('Plan Financiero y Proyecciones')),false);
 assert.equal(finance.find(n=>n.type==='StatusBar').props.style,'dark');
 assert.equal(finance.find(n=>n.type==='SafeAreaView').props.style[1].backgroundColor,'#FFFFFF');
 h.button('Volver al paso anterior').props.onPress();const roadmap=h.all();
 assert.equal(roadmap.find(n=>n.type==='StatusBar').props.style,'light');
 assert.equal(roadmap.some(n=>n.type==='Text'&&n.children.includes('Roadmap GO')),true);
 assert.equal(roadmap.find(n=>n.type==='SafeAreaView').props.style[1],false);
});
