import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{esModuleInterop:false,alwaysStrict:false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const port={exports:{}};vm.runInNewContext(compile('lib/supportRequests.ts'),port);const api=port.exports;
const nodes=t=>!t||typeof t!=='object'?[]:[t,...(t.children??[]).flatMap(nodes)];
const text=t=>typeof t==='string'?t:(t?.children??[]).map(text).join(' ');
const button=(tree,label)=>nodes(tree).find(n=>n.type==='TouchableOpacity'&&text(n).includes(label));
function fixture(gateway){let cursor=0,slots=[],effects=[];
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const React={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),Fragment:'Fragment',
 useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},
 useRef(value){return React.useState({current:value})[0];},
 useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||!equal(old.deps,deps)){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 const scope={exports:{},require(name){if(name==='react')return {...React,default:React};if(name==='react-native')return new Proxy({Platform:{OS:'ios'},StyleSheet:{create:v=>v}},{get:(o,k)=>o[k]??k});
 if(name==='react-native-safe-area-context')return{useSafeAreaInsets:()=>({top:47,bottom:34})};if(name==='@expo/vector-icons')return{Feather:'Feather'};if(name==='@/lib/supportRequests')return api;throw Error(name);}};
 vm.runInNewContext(compile('components/landing/LandingSupport.tsx'),scope);
 const props={visible:true,scopeKey:'user-a',onClose(){},gateway};
 return{props,render(p=props){cursor=0;effects=[];const tree=scope.exports.LandingSupport(p);for(const run of effects)run();return tree;}};
}
const tick=()=>new Promise(setImmediate);
test('the real Landing entry toggles orbital help instead of opening the former options panel',()=>{
 const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('index.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler,mount;
 const visit=n=>{if((ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n))&&n.tagName.getText(ast)==='PremiumOrbitBtn'&&n.attributes.getText(ast).includes('AYÚDANOS A MEJORAR'))handler=n.attributes.properties.find(p=>p.name?.getText(ast)==='onPress').initializer.expression;
 if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='LandingSupport')mount=n;ts.forEachChild(n,visit);};visit(ast);assert.ok(handler&&mount);
 const calls=[];vm.runInNewContext(ts.transpileModule('const tap=('+handler.getText(ast)+');tap();tap();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{setSupportMode:fn=>calls.push(fn(calls.at(-1)??false))});assert.deepEqual(calls,[true,false]);
 assert.equal(mount.attributes.properties.some(p=>p.name?.text==='gateway'),false,'no test or undeployed gateway is mounted');
});
test('the four real support orbits reuse existing ring positions and open only the selected view',()=>{
 const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('index.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let mode,open;
 const visit=n=>{if(ts.isConditionalExpression(n)&&n.condition.getText(ast)==='supportMode'&&n.whenTrue.getText(ast).includes('landing-help-orbits'))mode=n.whenTrue;
 if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='openSupportAction')open=n.initializer;ts.forEachChild(n,visit);};visit(ast);assert.ok(mode&&open);
 const calls=[],scope={result:null,openSupportAction:null,React:{createElement:(type,props,...children)=>({type,props,children:children.flat(Infinity)})},View:'View',PremiumOrbitBtn:'PremiumOrbitBtn',StyleSheet:{absoluteFill:{}},SUPPORT_ORBIT_ACTIONS:api.SUPPORT_ORBIT_ACTIONS,
 orbitWrapSize:275,orbitRadiusVisual:99,orbitBtnVisualSize:65,uiScaleFactor:1,setSupportKind:k=>calls.push(['kind',k]),setSupportOpen:v=>calls.push(['open',v])};
 vm.runInNewContext(ts.transpileModule('openSupportAction='+open.getText(ast)+';result='+mode.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,scope);
 const orbits=scope.result.children.flatMap(n=>n.children);assert.equal(orbits.length,4);
 for(let i=0;i<4;i++){const p=orbits[i].props;assert.equal(p.accessibilityLabel,api.SUPPORT_ORBIT_ACTIONS[i].title);p.onPress();assert.deepEqual(calls.splice(0),[['kind',api.SUPPORT_ORBIT_ACTIONS[i].kind],['open',true]]);
  const f=fixture();f.render({...f.props,kind:api.SUPPORT_ORBIT_ACTIONS[i].kind});const tree=f.render({...f.props,kind:api.SUPPORT_ORBIT_ACTIONS[i].kind});assert.ok(text(tree).includes(p.accessibilityLabel));assert.equal(button(tree,'Proponer mejora'),undefined);
 }
});
test('orbit is in the opposite bottom corner, safe and at least 44pt for both hands and iPhone widths',()=>{
 for(const width of [320,375,430])for(const hand of ['left','right']){const r=api.supportOrbitRect(width,844,{left:0,right:0,bottom:34},hand);
 assert.ok(r.width>=44&&r.height>=44);assert.equal(r.y+r.height,844-34-8);assert.equal(hand==='right'?r.x:width-r.x-r.width,12);}
});
test('unconfigured real UI never sends or displays a fake empty history; close preserves draft and account change clears it',()=>{
 const f=fixture();f.render();let tree=f.render();assert.ok(text(tree).includes('Comunicar incidencia'));assert.equal(button(tree,'Proponer mejora'),undefined);
 const input=()=>nodes(tree).find(n=>n.type==='TextInput');input().props.onChangeText('Texto privado');tree=f.render({...f.props,visible:false});tree=f.render();assert.equal(input().props.value,'Texto privado');assert.equal(button(tree,'ENVIAR').props.disabled,true);
 tree=f.render({...f.props,kind:'mine'});assert.ok(text(tree).includes('cuando el servicio esté habilitado'));assert.equal(text(tree).includes('No tienes solicitudes registradas'),false);
 f.render({...f.props,scopeKey:'user-b'});tree=f.render({...f.props,scopeKey:'user-b'});tree=f.render({...f.props,scopeKey:'user-b'});assert.equal(input().props.value,'');
});
test('real submit prevents concurrent sends, confirms only a valid receipt and keeps one request key for an uncertain retry',async()=>{
 let resolve,calls=0,keys=[];const gateway={listOwn:async()=>[],create:command=>{calls++;keys.push(command.requestKey);return new Promise(r=>{resolve=r;});}};
 const f=fixture(gateway);f.render();let tree=f.render();nodes(tree).find(n=>n.type==='TextInput').props.onChangeText('Ayuda');tree=f.render();const send=button(tree,'ENVIAR').props.onPress;
 const first=send();await send();assert.equal(calls,1);resolve({id:'r',reference:'GO-1',requestKey:'wrong',status:'received'});await first;tree=f.render();assert.ok(text(tree).includes('No se ha confirmado'));assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'Ayuda');
 const retry=button(tree,'ENVIAR').props.onPress();resolve({id:'r',reference:'GO-1',requestKey:keys[1],status:'received'});await retry;tree=f.render();assert.equal(keys[0],keys[1]);assert.ok(text(tree).includes('Solicitud recibida'));assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'');
});
test('old-account replies never appear after changing identity; history uses the own-only operation',async()=>{
 let release;const f=fixture({create:async()=>{},listOwn:()=>new Promise(r=>{release=r;})});f.render();let tree=f.render();f.render({...f.props,kind:'mine'});
 const oldRelease=release;f.render({...f.props,scopeKey:'user-b'});oldRelease([{id:'old',reference:'PRIVATE',status:'answered'}]);await tick();tree=f.render({...f.props,scopeKey:'user-b'});assert.equal(text(tree).includes('PRIVATE'),false);
});
test('invalid messages cannot reach transport and mismatched receipts cannot confirm delivery',async()=>{
 let calls=0;const gateway={create:async()=>{calls++;return {}},listOwn:async()=>[]};
 await assert.rejects(api.sendSupportRequest(gateway,{kind:'help',message:' ',requestKey:'one'}));assert.equal(calls,0);
 await assert.rejects(api.sendSupportRequest(gateway,{kind:'help',message:'Ayuda',requestKey:'one'}));assert.equal(calls,1);
});
