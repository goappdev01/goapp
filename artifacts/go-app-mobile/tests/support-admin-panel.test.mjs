import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const ts=createRequire(import.meta.url)('typescript');
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const nodes=value=>!value||typeof value!=='object'?[]:[value,...(value.children??[]).flatMap(nodes)];
const labels=value=>typeof value==='string'?value:(value?.children??[]).map(labels).join(' ');
const tick=()=>new Promise(setImmediate);

function fixture(gateway){let cursor=0,slots=[],effects=[];const confirmations=[];const calls=[],keyboardListeners={};
  const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const React={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),
    useState(initial){const i=cursor++;slots[i]??={value:initial};return [slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},
    useRef(value){return React.useState({current:value})[0];},useCallback:fn=>fn,
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||!equal(old.deps,deps)){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
  const scope={exports:{},setTimeout,require(name){if(name==='react')return {...React,default:React};
    if(name==='react-native')return {Platform:{OS:'ios'},StyleSheet:{create:value=>value},Alert:{alert:(...args)=>confirmations.push(args),prompt:(...args)=>confirmations.push(args)},Linking:{openURL:async()=>{}},
      Keyboard:{addListener:(event,listener)=>{keyboardListeners[event]=listener;return {remove(){delete keyboardListeners[event];}};},isVisible:()=>false,dismiss:()=>calls.push('keyboard-dismiss')},
      Modal:'Modal',KeyboardAvoidingView:'KeyboardAvoidingView',ScrollView:'ScrollView',Text:'Text',TextInput:'TextInput',TouchableOpacity:'TouchableOpacity',View:'View'};
    if(name==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:47,bottom:34})};
    if(name==='@/components/ui/GoCloseButton')return {GoCloseButton:'GoCloseButton'};
    if(name==='@/components/ui/GoNavigationFloating')return {GoNavigationFloating:'GoNavigationFloating'};
    if(name==='@/lib/supportRequests')return {newSupportRequestKey:()=>`key-${calls.length+1}`};
    throw Error(name);}};
  vm.runInNewContext(compile('components/landing/SupportAdminPanel.tsx'),scope);
  const props={visible:true,onClose:()=>calls.push('close'),view:'received',gateway,handedness:'right'};
  return {props,calls,confirmations,keyboardShow:()=>keyboardListeners.keyboardDidShow?.(),keyboardHide:()=>keyboardListeners.keyboardDidHide?.(),render(p=props){cursor=0;effects=[];const tree=scope.exports.SupportAdminPanel(p);for(const run of effects)run();return tree;}};
}

test('ADMIN actual panel loads the real queue, opens a thread and sends a revisioned response',async()=>{
  const row={id:'one',reference:'AY-00000001',kind:'incident',body:'Ejemplo',status:'received',revision:1,hasResponse:false,
    detail:'Ejemplo',createdAt:'2026-11-07T10:00:00Z',messages:[],attachments:[]};
  const seen=[];const gateway={listAdmin:async filter=>{seen.push(filter);return {items:[row],total:1};},
    detail:async id=>{assert.equal(id,'one');return row;},
    act:async(id,command)=>{assert.equal(id,'one');seen.push(command);return {...row,revision:2,messages:[{id:'m',body:command.body,createdAt:row.createdAt}]};}};
  const f=fixture(gateway);f.render();await tick();let tree=f.render();
  assert.equal(seen[0].status,'received');assert.ok(labels(tree).includes('AY-00000001'));
  nodes(tree).find(node=>node.props.accessibilityLabel==='Abrir AY-00000001').props.onPress();await tick();tree=f.render();
  nodes(tree).find(node=>node.props.accessibilityLabel==='Respuesta o nota interna').props.onChangeText('Respuesta real');tree=f.render();
  nodes(tree).find(node=>node.type==='TouchableOpacity'&&labels(node)==='ENVIAR').props.onPress();await tick();tree=f.render();
  assert.ok(seen.some(command=>command.action==='reply'&&command.body==='Respuesta real'&&command.revision===1));
  assert.ok(labels(tree).includes('Respuesta real'));
});

test('ADMIN swipe requires confirmation and does not also open the card',async()=>{
  const row={id:'one',reference:'AY-00000001',kind:'help',detail:'Consulta',status:'received',revision:1,createdAt:'2026-11-07T10:00:00Z'};
  let opens=0;const f=fixture({listAdmin:async()=>({items:[row],total:1}),detail:async()=>{opens++;return row;}});
  f.render();await tick();const tree=f.render();
  const card=nodes(tree).find(node=>node.type==='View'&&node.props.onTouchStart);
  card.props.onTouchStart({nativeEvent:{pageX:20,pageY:100}});
  card.props.onTouchEnd({nativeEvent:{pageX:115,pageY:105}});
  nodes(card).find(node=>node.props.accessibilityLabel==='Abrir AY-00000001').props.onPress();
  assert.equal(opens,0);assert.equal(f.confirmations.length,1);
  assert.ok(f.confirmations[0][0].includes('solucionada'));
});
test('ADMIN visual support does not claim reception or call the backend before activation',async()=>{
  let requests=0;const f=fixture({listAdmin:async()=>{requests++;return {items:[],total:0};}});
  const tree=f.render({...f.props,backendReady:false});await tick();
  assert.equal(requests,0);
  assert.ok(labels(tree).includes('pendiente de conexión al servidor'));
  assert.ok(nodes(tree).some(node=>node.props.accessibilityLabel==='Volver a AYUDA'));
  assert.equal(labels(tree).includes('No hay solicitudes'),false);
});
test('ADMIN uses one persistent bottom floating control: X closes, detail arrow returns, keyboard arrow only dismisses',async()=>{
  const row={id:'one',reference:'AY-1',kind:'help',detail:'Consulta',status:'received',revision:1};
  const f=fixture({listAdmin:async()=>({items:[row],total:1}),detail:async()=>row});
  f.render();await tick();let tree=f.render();
  const nav=()=>nodes(tree).find(node=>node.type==='GoNavigationFloating');
  const control=()=>nodes(nav()).find(node=>node.type==='GoCloseButton');
  assert.equal(nav().props.screenKey,'support-admin');assert.equal(nav().props.initialBottom,0);
  assert.equal(nav().props.keyboardResponsive,true);assert.equal(control().props.level,'container');
  assert.equal(nodes(tree).filter(node=>node.type==='GoCloseButton').length,1);
  assert.equal(nodes(tree).find(node=>node.type==='View'&&node.props.style?.minHeight===66)?.children.some(child=>child.type==='GoCloseButton'),false);
  f.keyboardShow();tree=f.render();assert.equal(control().props.keyboardVisible,true);control().props.onPress();assert.deepEqual(f.calls,['keyboard-dismiss']);
  f.keyboardHide();tree=f.render();nodes(tree).find(node=>node.props.accessibilityLabel==='Abrir AY-1').props.onPress();await tick();tree=f.render();
  assert.equal(control().props.level,'panel');control().props.onPress();tree=f.render();assert.equal(control().props.level,'container');
  control().props.onPress();assert.deepEqual(f.calls,['keyboard-dismiss','close']);
});
