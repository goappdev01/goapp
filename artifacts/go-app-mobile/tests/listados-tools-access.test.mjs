import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];
(function walk(n){all.push(n);ts.forEachChild(n,walk)})(ast);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const declaration=name=>all.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);
const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.children)];
function expand(n){if(!n||typeof n!=='object')return n;if(Array.isArray(n))return n.map(expand);if(typeof n.type==='function')return expand(n.type({...n.props,children:n.children}));return {...n,children:n.children?.map(expand)};}
function fixture(handedness='right'){
 const React={Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),useState:initial=>[initial,()=>{}],useRef:initial=>({current:initial}),useCallback:fn=>fn};
 const native=new Proxy({StyleSheet:{create:s=>s},Dimensions:{get:()=>({width:320,height:568})},PanResponder:{create:h=>({panHandlers:h})}},{get:(o,k)=>o[k]??k});
 const mocks={react:{...React,default:React},'react-native':native,
  '@/components/ui/GoNavigationAppearanceControl':{GoNavigationAppearanceControl:'Appearance'},'@/components/ui/GoCloseButton':{GoCloseButton:'GoCloseButton'},
  '@/hooks/useGoDockPreference':{useGoDockPreference:()=>({position:handedness,setPosition:async()=>{}})},'@/components/dev/GoDevPanel':{GoDevPanel:'GoDevPanel'},
  '../DraggableFAB':{DraggableFAB:'DraggableFAB'},'expo-linear-gradient':{LinearGradient:'LinearGradient'},'@expo/vector-icons':{Feather:'Feather'},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})},
  '@/contexts/LanguageContext':{useLanguage:()=>({lang:'es',t:k=>k,setLang(){}})},'@/i18n/translations':{LANG_META:[{code:'es',nativeLabel:'Español',implemented:true}]},
  'expo-haptics':{selectionAsync:async()=>{}},'@react-native-async-storage/async-storage':{setItem:async()=>{}},
  '../../utils/guidance':{GUIDANCE_NAMES:['Inicio'],GUIDANCE_NAMES_EN:['Start']},
  '../../utils/countryConfig':{COUNTRY_CONFIGS:{es:{market:'es',countryName:'España',flag:'ES',currency:'EUR',currencySymbol:'€',distanceUnit:'km'}},MARKET_STORAGE_KEY:'market',REGION_STORAGE_KEY:'region'}};
 const load=file=>{const scope={exports:{},require:key=>{assert.ok(key in mocks,key);return mocks[key];}};vm.runInNewContext(compile(readFileSync(file,'utf8')),scope);return scope.exports;};
 const controls=load('components/listados/ListadosControls.tsx'),panel=load('components/herramientas/HerramientasPanel.tsx');
 const memory=new Map(),context={React,GoCloseButton:'GoCloseButton',lang:'es',userAccountType:'personal',optionsOpen:false,listOpen:true,goSortOrder:'asc',listGoSize:'medio',goAuthOpen:false,
  Haptics:{selectionAsync:async()=>{},impactAsync:async()=>{},ImpactFeedbackStyle:{Medium:'medium'}},setOptionsOpen:v=>{context.optionsOpen=v;},setGoAuthOpen:v=>{context.goAuthOpen=v;},setGoSortOrder:v=>{context.goSortOrder=v;},setSortFeedbackVisible(){},setTimeout(){},
  AsyncStorage:{setItem:async(k,v)=>memory.set(k,v)},exports:{}};
 vm.runInNewContext(compile(['handleOpenOptions','toggleGoSortOrder'].map(name=>'const '+declaration(name).getText(ast)+';').join('\n')+'exports.sort=toggleGoSortOrder;'),context);
 const button=all.find(n=>ts.isJsxSelfClosingElement(n)&&n.attributes.properties.some(p=>p.name?.getText(ast)==='testID'&&p.initializer?.text==='listados-tools-toggle'));
 const gear=()=>vm.runInNewContext(compile('('+button.getText(ast)+')'),context);
 const props=()=>({visible:context.optionsOpen,onClose:()=>context.setOptionsOpen(false),handedness,uiScale:'medium',userMarket:'es',userRegion:'',guidanceLevel:0,effectiveGuidanceLevel:0,
  listTools:React.createElement(controls.ListadosTools,{sortOrder:context.goSortOrder,size:context.listGoSize,onToggleSort:context.exports.sort,onCycleSize(){}})});
 return {context,memory,gear,render:embedded=>expand(panel.HerramientasPanel({...props(),embedded}))};
}
for(const hand of ['left','right'])test(`Listados tools/${hand}: one authenticated header gear opens the existing embedded panel, sorts and closes without leaving the list`,()=>{
 const f=fixture(hand),gear=f.gear();assert.equal(gear.props.touchSize,44);assert.equal(gear.props.level,'settings');
 gear.props.onPress();assert.equal(f.context.optionsOpen,true);assert.equal(f.context.listOpen,true);
 let tree=f.render(true);assert.equal(tree.props.testID,'listados-tools-layer');assert.equal(nodes(tree).some(n=>n.type==='Modal'),false,'no second native presenter over Listados');
 assert.ok(nodes(tree).some(n=>n.type==='Appearance'),'global settings are still available');
 const sort=nodes(tree).find(n=>n.props.testID==='listados-sort-tool');assert.ok(sort);sort.props.onPress();
 assert.equal(f.context.goSortOrder,'desc');assert.equal(f.memory.get('go_sort_order_v1'),'desc');
 const close=nodes(tree).find(n=>n.type==='GoCloseButton'&&n.props.level==='container');assert.ok(close);close.props.onPress();assert.equal(f.context.optionsOpen,false);assert.equal(f.context.listOpen,true);
 f.gear().props.onPress();assert.equal(f.context.optionsOpen,true);f.gear().props.onPress();assert.equal(f.context.optionsOpen,false);
 tree=f.render(false);assert.equal(tree.type,'Modal');assert.equal(tree.props.presentationStyle,'fullScreen');tree.props.onRequestClose();
 f.context.userAccountType=null;f.gear().props.onPress();assert.equal(f.context.optionsOpen,false);assert.equal(f.context.goAuthOpen,true,'existing authentication gate is preserved');
});

test('Listados presents the same tools instance inside its host and keeps footer/navigation in place',()=>{
 const sheet=all.find(n=>ts.isJsxOpeningElement(n)&&n.tagName.getText(ast)==='BottomSheet'&&n.attributes.properties.some(p=>p.name?.getText(ast)==='visible'&&p.initializer?.expression?.getText(ast)==='listOpen'));
 const attr=name=>sheet.attributes.properties.find(p=>p.name?.getText(ast)===name).initializer.expression;
 assert.match(attr('screenOverlay').getText(ast),/optionsOpen \? renderToolsPanel\(true\)/);
 assert.doesNotMatch(attr('modalOverlay').getText(ast),/optionsOpen/,'opening tools does not unmount the list body');
 assert.match(attr('blockPan').getText(ast),/optionsOpen/);
 let closed=false;const context={optionsOpen:true,setOptionsOpen:()=>{closed=true;},setListOpen(){assert.fail('must not exit Listados');}};
 vm.runInNewContext(compile('('+attr('onClose').getText(ast)+')()'),context);assert.equal(closed,true);
 assert.equal((source.match(/<HerramientasPanel/g)||[]).length,1,'one props definition for both existing presentations');
 assert.match(source,/!listOpen && renderToolsPanel\(\)/);assert.match(declaration('renderToolsPanel').getText(ast),/onToggleSort=\{toggleGoSortOrder\}/);
 assert.equal((source.match(/testID="listados-tools-toggle"/g)||[]).length,1);
});
