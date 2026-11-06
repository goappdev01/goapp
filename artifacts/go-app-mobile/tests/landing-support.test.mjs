import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {supportFiles} from './helpers/support-files.mjs';
const ts=createRequire(import.meta.url)('typescript');
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{esModuleInterop:false,alwaysStrict:false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const port={exports:{}};vm.runInNewContext(compile('lib/supportRequests.ts'),port);const api=port.exports;
const nodes=t=>!t||typeof t!=='object'?[]:[t,...(t.children??[]).flatMap(nodes)];
const text=t=>typeof t==='string'?t:(t?.children??[]).map(text).join(' ');
const button=(tree,label)=>nodes(tree).find(n=>n.type==='TouchableOpacity'&&text(n).includes(label));
function fixture(gateway){let cursor=0,slots=[],effects=[];const files=supportFiles(),picker={photo:async()=>({canceled:true}),document:async()=>({canceled:true})};const events=new Map(),navigation=[];
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const React={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),Fragment:'Fragment',
 useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},
 useRef(value){return React.useState({current:value})[0];},
 useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||!equal(old.deps,deps)){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 const scope={exports:{},Error,require(name){if(name==='react')return {...React,default:React};if(name==='react-native')return new Proxy({Platform:{OS:'ios'},StyleSheet:{create:v=>v},Keyboard:{addListener:(name,fn)=>{events.set(name,fn);return{remove(){events.delete(name);}};},dismiss:()=>{navigation.push('keyboard');events.get('keyboardWillHide')?.();}}},{get:(o,k)=>o[k]??k});
 if(name==='react-native-safe-area-context')return{useSafeAreaInsets:()=>({top:47,bottom:34})};if(name==='@expo/vector-icons')return{Feather:'Feather'};if(name==='@/components/ui/GoCloseButton')return {GoCloseButton:'GoCloseButton'};if(name==='@/lib/supportRequests')return api;if(name==='@/lib/supportAttachments')return{createSupportAttachmentStore:files.create};if(name==='expo-image-picker')return{launchImageLibraryAsync:options=>picker.photo(options)};if(name==='expo-document-picker')return{getDocumentAsync:options=>picker.document(options)};throw Error(name);}};
 vm.runInNewContext(compile('components/landing/LandingSupport.tsx'),scope);
 const props={visible:true,scopeKey:'user-a',onClose(){navigation.push('back');},onExit(){navigation.push('exit');},gateway};
 return{props,events,navigation,files,picker,render(p=props){cursor=0;effects=[];const tree=scope.exports.LandingSupport(p);for(const run of effects)run();return tree;}};
}
const tick=()=>new Promise(setImmediate);
test('the real Landing entry toggles orbital help instead of opening the former options panel',()=>{
 const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('index.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler,mount;
 const visit=n=>{if((ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n))&&n.tagName.getText(ast)==='PremiumOrbitBtn'&&n.attributes.getText(ast).includes('AYÚDANOS A MEJORAR'))handler=n.attributes.properties.find(p=>p.name?.getText(ast)==='onPress').initializer.expression;
 if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='LandingSupport')mount=n;ts.forEachChild(n,visit);};visit(ast);assert.ok(handler&&mount);
 const calls=[];vm.runInNewContext(ts.transpileModule('const tap=('+handler.getText(ast)+');tap();tap();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{setSupportMode:fn=>calls.push(fn(calls.at(-1)??false))});assert.deepEqual(calls,[true,false]);
 assert.equal(mount.attributes.properties.some(p=>p.name?.text==='gateway'),false,'no test or undeployed gateway is mounted');
});
test('help relabels the eight real Landing orbits without changing any original colour or coordinate',()=>{
 const source=readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('index.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];
 (function walk(n){all.push(n);ts.forEachChild(n,walk)})(ast);
 const decl=name=>all.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);
 const mode=all.find(n=>ts.isConditionalExpression(n)&&n.whenTrue.getText(ast).includes('testID="landing-quiet-orbits"')).whenTrue;
 const calls=[],scope={result:null,React:{createElement:(type,props,...children)=>({type,props,children:children.flat(Infinity)})},View:'View',PremiumOrbitBtn:'PremiumOrbitBtn',StyleSheet:{absoluteFill:{}},SUPPORT_ORBIT_ACTIONS:api.SUPPORT_ORBIT_ACTIONS,
 supportMode:true,orbitWrapSize:275,orbitRadiusVisual:99,orbitBtnVisualSize:65,uiScaleFactor:1,openSupportAction:k=>calls.push(k),setSupportMode:v=>calls.push(v)};
 const code=['GO_COLORS','INTENTS'].map(n=>'const '+decl(n).getText(ast)+';').join('\n')+'result='+mode.getText(ast);
 vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{alwaysStrict:false,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,scope);
 const help=scope.result.children;assert.equal(help.length,8);
 scope.supportMode=false;vm.runInNewContext(ts.transpileModule('result='+mode.getText(ast),{compilerOptions:{alwaysStrict:false,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,scope);
 for(let i=0;i<8;i++){const h=help[i].children[0].props,n=scope.result.children[i].children[0].props;
  assert.equal(h.color,n.color);assert.equal(JSON.stringify(help[i].props.style),JSON.stringify(scope.result.children[i].props.style));h.onPress();}
 assert.deepEqual(calls,['incident','improvement','help','mine',false]);
 for(const action of api.SUPPORT_ORBIT_ACTIONS){const f=fixture();f.render({...f.props,kind:action.kind});const tree=f.render({...f.props,kind:action.kind});assert.ok(text(tree).includes(action.title));
  const nav=nodes(tree).filter(n=>n.type==='GoCloseButton');assert.equal(nav.length,1);assert.equal(nav[0].props.level,'panel');assert.equal(nav[0].props.appearance,'light');nav[0].props.onPress();assert.deepEqual(f.navigation,['back']);}
});
test('floating back hides the keyboard first and preserves the current form',()=>{
 const f=fixture();f.render();f.events.get('keyboardWillShow')();let tree=f.render();nodes(tree).find(n=>n.type==='GoCloseButton').props.onPress();assert.deepEqual(f.navigation,['keyboard']);tree=f.render();nodes(tree).find(n=>n.type==='GoCloseButton').props.onPress();assert.deepEqual(f.navigation,['keyboard','back']);
});
test('orbit is in the opposite bottom corner, safe and at least 44pt for both hands and iPhone widths',()=>{
 for(const width of [320,375,430])for(const hand of ['left','right']){const r=api.supportOrbitRect(width,844,{left:0,right:0,bottom:34},hand);
 assert.ok(r.width>=44&&r.height>=44);assert.equal(r.y+r.height,844-34-8);assert.equal(hand==='right'?r.x:width-r.x-r.width,12);}
});
test('unconfigured real UI never sends or displays a fake empty history; close preserves draft and account change clears it',()=>{
 const f=fixture();f.render();let tree=f.render();assert.ok(text(tree).includes('Comunicar incidencia'));assert.equal(button(tree,'Proponer mejora'),undefined);
 const input=()=>nodes(tree).find(n=>n.type==='TextInput');input().props.onChangeText('Texto privado');tree=f.render({...f.props,visible:false});tree=f.render();assert.equal(input().props.value,'Texto privado');assert.equal(button(tree,'ENVIAR').props.disabled,true);
 tree=f.render({...f.props,kind:'mine'});assert.ok(text(tree).includes('Tus solicitudes aparecerán aquí'));assert.equal(text(tree).includes('No tienes solicitudes registradas'),false);
 f.render({...f.props,scopeKey:'user-b'});tree=f.render({...f.props,scopeKey:'user-b'});tree=f.render({...f.props,scopeKey:'user-b'});assert.equal(input().props.value,'');
});
test('real submit prevents concurrent sends, confirms only a valid receipt and keeps one request key for an uncertain retry',async()=>{
 let resolve,calls=0,keys=[];const gateway={listOwn:async()=>[],create:command=>{calls++;keys.push(command.requestKey);return new Promise(r=>{resolve=r;});}};
 const f=fixture(gateway);f.render();let tree=f.render();nodes(tree).find(n=>n.type==='TextInput').props.onChangeText('Ayuda');tree=f.render();const send=button(tree,'ENVIAR').props.onPress;
 const first=send();await send();assert.equal(calls,1);resolve({id:'r',reference:'GO-1',requestKey:'wrong',status:'received'});await first;tree=f.render();assert.ok(text(tree).includes('No se ha confirmado'));assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'Ayuda');
 const retry=button(tree,'ENVIAR').props.onPress();resolve({id:'r',reference:'GO-1',requestKey:keys[1],status:'received'});await retry;tree=f.render();assert.equal(keys[0],keys[1]);assert.ok(text(tree).includes('Recibida ·'));assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'');
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
test('four white surfaces have no context checkbox or placeholder and one safe floating arrow above scroll clearance',()=>{
 for(const kind of ['incident','improvement','help','mine']){
  const f=fixture();f.render({...f.props,kind});const tree=f.render({...f.props,kind}),all=nodes(tree);
  const screen=all.find(n=>n.type==='KeyboardAvoidingView');assert.equal(screen.props.style[0].backgroundColor,'#ffffff');assert.equal(screen.props.style[1].paddingBottom,34);assert.equal(screen.props.style[1].paddingTop,47);
  assert.equal(all.filter(n=>n.type==='GoCloseButton').length,1);const nav=all.find(n=>n.props.testID==='support-floating-navigation');assert.equal(nav.props.style.right,18);assert.equal(nav.props.style.bottom,12);
  assert.ok(all.find(n=>n.type==='ScrollView').props.contentContainerStyle.paddingBottom>=68);
  assert.equal(text(tree).includes('Incluir contexto'),false);assert.equal(text(tree).includes('contraseñas'),false);assert.equal(all.some(n=>n.props.accessibilityRole==='checkbox'),false);
  const input=all.find(n=>n.type==='TextInput');if(input){assert.equal(input.props.placeholder,undefined);assert.equal(input.props.style.color,'#17212b');assert.ok(input.props.style.maxHeight>=input.props.style.minHeight);}
 }
});
test('real photo/document handlers import privately, preview and remove individually without network or note changes',async()=>{
 const f=fixture();f.render();let tree=f.render(),photo=f.files.asset('Photo.jpg'),pdf=f.files.asset('Report.pdf',256,'application/pdf');
 f.picker.photo=async options=>{assert.deepEqual(Array.from(options.mediaTypes),['images']);return{canceled:false,assets:[{...photo,fileName:photo.name,fileSize:photo.size}]};};
 await button(tree,'Adjuntar fotografía').props.onPress();await tick();tree=f.render();assert.equal(nodes(tree).filter(n=>n.type==='Image').length,1);assert.ok(text(tree).includes('Photo.jpg'));assert.equal(button(tree,'ENVIAR').props.disabled,true);
 f.picker.document=async()=>({canceled:false,assets:[pdf]});await button(tree,'Adjuntar archivo').props.onPress();await tick();tree=f.render();assert.ok(text(tree).includes('Report.pdf'));
 const remove=nodes(tree).find(n=>n.props.accessibilityLabel==='Quitar Photo.jpg');remove.props.onPress();await tick();tree=f.render();assert.equal(nodes(tree).filter(n=>n.type==='Image').length,0);assert.ok(text(tree).includes('Report.pdf'));assert.ok(f.files.data.has(photo.uri));
 tree=f.render({...f.props,visible:false});tree=f.render();assert.ok(text(tree).includes('Report.pdf'),'ordinary close preserves local attachments');
});
test('cancellation, invalid file and stale native picker results never add a misleading preview',async()=>{
 const f=fixture();f.render();let tree=f.render();await button(tree,'Adjuntar fotografía').props.onPress();await tick();tree=f.render();assert.equal(nodes(tree).filter(n=>n.type==='Image').length,0);
 f.picker.photo=async()=>({canceled:false,assets:[f.files.asset('Huge.jpg',11*1024*1024)]});button(tree,'Adjuntar fotografía').props.onPress();await tick();tree=f.render();assert.ok(text(tree).includes('supera 10 MB'));assert.equal(nodes(tree).filter(n=>n.type==='Image').length,0);
 let resolve;f.picker.photo=()=>new Promise(r=>resolve=r);button(tree,'Adjuntar fotografía').props.onPress();f.render({...f.props,scopeKey:'user-b'});resolve({canceled:false,assets:[f.files.asset()]});await tick();tree=f.render({...f.props,scopeKey:'user-b'});assert.equal(nodes(tree).filter(n=>n.type==='Image').length,0);assert.equal(f.files.copied.length,0);
});
test('request template renders real summaries, type/date/status and expands real detail and response',async()=>{
 const rows=[{id:'one',reference:'GO-123',requestKey:'k',kind:'incident',summary:'Problema de prueba',createdAt:'2026-11-06T10:00:00Z',status:'in_progress',detail:'Detalle sintético',response:'Respuesta sintética'}];
 const f=fixture({listOwn:async()=>rows,create:async()=>{throw Error('unexpected')}});f.render({...f.props,kind:'mine'});await tick();let tree=f.render({...f.props,kind:'mine'});
 for(const value of ['Problema de prueba','Comunicar incidencia','6/11/2026','En revisión'])assert.ok(text(tree).includes(value));assert.equal(text(tree).includes('Respuesta sintética'),false);
 button(tree,'Problema de prueba').props.onPress();tree=f.render({...f.props,kind:'mine'});assert.ok(text(tree).includes('Detalle sintético'));assert.ok(text(tree).includes('Respuesta sintética'));
});
test('attachment transport requires explicit capability and matching stored receipt for every file',async()=>{
 const files=[{id:'local1',uri:'file:///private/a.pdf',name:'a.pdf',mime:'application/pdf',size:128}],command={kind:'incident',message:'Incidencia',requestKey:'one'};let calls=0;
 const gateway={listOwn:async()=>[],create:async()=>{calls++;return{id:'r',reference:'GO-1',requestKey:'one',status:'received'}}};
 await assert.rejects(api.sendSupportRequest(gateway,command,files));assert.equal(calls,0);gateway.supportsAttachments=true;await assert.rejects(api.sendSupportRequest(gateway,command,files));assert.equal(calls,1);
 gateway.create=async(cmd,received)=>{assert.equal(received,files);assert.equal(cmd.context,undefined);return{id:'r',reference:'GO-1',requestKey:'one',status:'received',attachments:[{id:'remote1',clientId:'local1',name:'a.pdf'}]};};
 assert.equal((await api.sendSupportRequest(gateway,command,files)).id,'r');
});
test('closing during an authorized request cannot leave the reopened form stuck or cause a duplicate',async()=>{
 let release,calls=0;const f=fixture({listOwn:async()=>[],create:command=>{calls++;return new Promise(r=>release=()=>r({id:'r',reference:'GO-2',status:'received',requestKey:command.requestKey}));}});
 f.render();let tree=f.render();nodes(tree).find(n=>n.type==='TextInput').props.onChangeText('Ayuda');tree=f.render();const sent=button(tree,'ENVIAR').props.onPress();f.render({...f.props,visible:false});
 release();await sent;tree=f.render();assert.equal(calls,1);assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'');assert.ok(text(tree).includes('Recibida ·'));assert.equal(text(tree).includes('Enviando'),false);
});
