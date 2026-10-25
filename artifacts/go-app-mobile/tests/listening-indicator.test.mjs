import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url), ts=require('typescript');
function load(file,modules){const scope={exports:{},require(name){if(name in modules)return modules[name];throw Error('Unexpected '+name);}};
 vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,scope);return scope.exports;}
function nodes(tree){return tree?[tree,...(tree.props?.children??[]).flat(Infinity).flatMap(n=>typeof n==='object'?nodes(n):[])]:[];}
function fixture(reduced=false){
 const values=[],effects=[],animations=[],loops=[],listeners=new Set();let cursor=0;
 const react={createElement(type,props,...children){return{type,props:{...props,children:children.flat(Infinity)}};},
 useState(value){const i=cursor++;if(!(i in values))values[i]=typeof value==='function'?value():value;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},
 useRef(value){const i=cursor++;return values[i]??={current:value};},
 useEffect(fn,deps){const i=cursor++,old=values[i];if(!old||deps.some((d,k)=>!Object.is(d,old.deps[k]))){old?.cleanup?.();const record={deps};values[i]=record;effects.push(()=>{record.cleanup=fn();});}}};
 class Value{constructor(value){this.value=value;}stopAnimation(){}setValue(v){this.value=v;}interpolate(options){return options;}}
 const animated={Value,View:'Animated.View',timing(value,options){const a={options,stopped:false,start(cb){value.value=options.toValue;cb?.({finished:true});},stop(){a.stopped=true;}};animations.push(a);return a;},sequence(items){return items;},loop(items,options){const a={items,options,started:false,stopped:false,start(){a.started=true;},stop(){a.stopped=true;}};loops.push(a);return a;}};
 const native={View:'View',Text:'Text',Animated:animated,Easing:{inOut:fn=>fn,sin:'sin'},StyleSheet:{create:x=>x},AccessibilityInfo:{isReduceMotionEnabled:async()=>reduced,addEventListener(_n,fn){listeners.add(fn);return{remove(){listeners.delete(fn);}};}}};
 const api=load('components/booking-assistant/ListeningIndicator.tsx',{react:{...react,default:react},'react-native':native});
 return{api,loops,animations,listeners,react,native,render(props){cursor=0;const tree=api.ListeningIndicator(props);effects.splice(0).forEach(fn=>fn());return tree;},reset(){cursor=0;},unmount(){values.forEach(x=>x?.cleanup?.());}};
}
const geometry=fixture().api.listeningPlacement;
test('central indicator uses only measured blank space below messages',()=>{const p=geometry(390,500,180,false);assert.ok(p);assert.ok(p.top>=180);assert.ok(p.top+p.diameter+32<=500);for(const args of [[390,500,410,false],[390,500,0,true],[0,500,0,false],[390,0,0,false],[390,NaN,0,false]])assert.equal(geometry(...args),null);});
test('gold rings and Habla animate only while listening and never intercept touches',async()=>{const f=fixture();f.render({active:true});await new Promise(setImmediate);let tree=f.render({active:true});assert.equal(tree.props.pointerEvents,'none');assert.ok(nodes(tree).some(n=>n.props?.children?.includes('Habla')));assert.equal(f.loops.length,2);assert.ok(f.loops[0].started);assert.equal(nodes(tree).filter(n=>n.props?.style?.some?.(x=>x?.position==='absolute')).length,3);assert.ok(f.animations.every(a=>a.options.useNativeDriver));f.render({active:true});assert.equal(f.loops.length,2);tree=f.render({active:false});assert.ok(!nodes(tree).some(n=>n.props?.children?.includes('Habla')));assert.ok(f.loops.every(loop=>loop.stopped));assert.equal(f.render({active:false}),null);f.unmount();assert.equal(f.listeners.size,0);});
test('reduced motion disables heartbeat and responds to preference changes',async()=>{const f=fixture(true);f.render({active:true});await new Promise(setImmediate);f.render({active:true});assert.equal(f.loops.length,0);assert.equal(f.animations.at(-1).options.duration,0);[...f.listeners][0](false);f.render({active:true});assert.equal(f.loops.length,2);[...f.listeners][0](true);f.render({active:true});assert.ok(f.loops.every(loop=>loop.stopped));f.unmount();});
test('close during accessibility query releases listeners without starting pulses',async()=>{const f=fixture();f.render({active:true});f.unmount();await new Promise(setImmediate);assert.equal(f.listeners.size,0);assert.equal(f.loops.length,0);});
test('reopening restarts the feedback without retaining old loops or adding microphone controls',async()=>{const f=fixture();f.render({active:true,compact:true});await new Promise(setImmediate);const tree=f.render({active:true,compact:true});assert.equal(tree.props.style[1].width,28);assert.ok(!nodes(tree).some(n=>n.props?.onPress));f.render({active:false,compact:true});f.render({active:true,compact:true});assert.equal(f.loops.length,4);f.unmount();assert.ok(f.loops.every(x=>x.stopped));});
function screenFixture(){const f=fixture(),starts=[],stops=[],a={messages:[{id:'hello',role:'go',text:'Hola'}],phase:'collect',request:{},panel:null,notice:'',busy:null,setPanel(){}};let voice={status:'listening',error:'',transcript:'',start(){starts.push(true);},abort(){},stop(){stops.push(true);}};
 const realUI=load('components/booking-assistant/BookingAssistantUI.tsx',{react:{...f.react,default:f.react},'react-native':f.native,'@expo/vector-icons':{Feather:'Feather'}});
 const ui=new Proxy({s:realUI.s},{get:(o,k)=>o[k]??k}),native=new Proxy({...f.native,Modal:'Modal',ScrollView:'ScrollView',useWindowDimensions:()=>({width:390,height:844}),Platform:{OS:'ios'},Keyboard:{isVisible:()=>false,addListener:()=>({remove(){}})}},{get:(o,k)=>o[k]??k});
 const hooks={...f.react,useEffect(){}};const api=load('components/booking-assistant/BookingAssistantScreen.tsx',{react:{...hooks,default:hooks},'react-native':native,'@expo/vector-icons':{Feather:'Feather'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34})},'@react-native-async-storage/async-storage':{},'expo-image-picker':{},'expo-document-picker':{},'expo-status-bar':{StatusBar:'StatusBar'},'@workspace/api-zod':{bookingDockOrder:()=>['menu','attach','go','actions','more']},'@/lib/bookingAssistant':{},'@/hooks/useBookingAssistant':{useBookingAssistant:()=>a},'@/hooks/useAssistantZoneScope':{useAssistantZoneScope:()=>({scope:null,ready:true})},'@/hooks/useGoActions':{useGoActions:()=>({manager:{state:null},choices:[],active:null})},'@/hooks/useBookingVoice':{useBookingVoice:()=>voice},'react-native-gesture-handler':{GestureHandlerRootView:'Root'},'./AssistantCloseControls':{AssistantCloseControls:'CloseControls'},'@/hooks/useGoDockPreference':{useGoDockPreference:()=>({position:'right'})},'./BookingAssistantPanels':{BookingAssistantPanels:'Panels'},'./BookingAssistantUI':ui,'./ListeningIndicator':{ListeningIndicator:'Indicator',listeningPlacement:geometry}});
 return{a,starts,stops,voice,values:undefined,render(visible=true,props={}){f.reset();return api.BookingAssistantScreen({visible,onClose(){},...props});}};
}
test('screen keeps messages and controls outside the central overlay and stops feedback in all non-listening states',()=>{
 const f=screenFixture();let tree=f.render(),all=nodes(tree),scroll=all.find(n=>n.type==='ScrollView');
 all.find(n=>n.props?.testID==='assistant-conversation-viewport').props.onLayout({nativeEvent:{layout:{width:390,height:500}}});all.find(n=>n.props?.testID==='assistant-conversation-content').props.onLayout({nativeEvent:{layout:{width:390,height:144}}});scroll.props.onContentSizeChange(390,500);
 tree=f.render();all=nodes(tree);const central=all.find(n=>n.type==='Indicator'&&!n.props.compact);assert.ok(central.props.active);
 assert.ok(!nodes(all.find(n=>n.type==='ScrollView')).includes(central));assert.ok(all.some(n=>n.props?.children?.includes('Hola')));
 for(const status of ['idle','preparing','transcribing']){f.voice.status=status;assert.ok(!nodes(f.render()).some(n=>n.type==='Indicator'&&n.props.active));}
 f.voice.status='listening';f.voice.error='Sin audio';assert.ok(!nodes(f.render()).some(n=>n.type==='Indicator'&&n.props.active));f.voice.error='';
 assert.ok(!nodes(f.render(false)).some(n=>n.type==='Indicator'&&n.props.active));assert.equal(f.starts.length,0);
});
test('long conversations and stale measurements use compact feedback without covering new messages',()=>{const f=screenFixture();let all=nodes(f.render());all.find(n=>n.props?.testID==='assistant-conversation-viewport').props.onLayout({nativeEvent:{layout:{width:320,height:240}}});all.find(n=>n.props?.testID==='assistant-conversation-content').props.onLayout({nativeEvent:{layout:{width:320,height:264}}});all.find(n=>n.type==='ScrollView').props.onContentSizeChange(320,300);all=nodes(f.render());assert.ok(all.some(n=>n.type==='Indicator'&&n.props.compact));f.a.messages.push({id:'new',role:'user',text:'Nuevo'});all=nodes(f.render());assert.ok(!all.some(n=>n.type==='Indicator'&&!n.props.compact));assert.ok(all.some(n=>n.props?.children?.includes('Nuevo')));f.voice.status='transcribing';all=nodes(f.render());const fading=all.find(n=>n.type==='Indicator'&&n.props.compact);assert.ok(fading);assert.equal(fading.props.active,false);assert.ok(!all.some(n=>n.props?.children?.includes('Habla')));});

test('auto-listen is consumed only once per explicit GO request and survives indicator rerenders',()=>{const f=screenFixture();let tree=f.render();tree.props.onShow();assert.equal(f.starts.length,0);tree=f.render(true,{listenRequest:1});tree.props.onShow();tree.props.onShow();assert.equal(f.starts.length,1);f.render(true,{listenRequest:1}).props.onShow();assert.equal(f.starts.length,1);f.render(false,{listenRequest:2}).props.onShow();assert.equal(f.starts.length,1);f.render(true,{listenRequest:2}).props.onShow();assert.equal(f.starts.length,2);});

test('flex-growing scroll content still measures real messages and keeps room for passive feedback',()=>{const f=screenFixture();let all=nodes(f.render());all.find(n=>n.props?.testID==='assistant-conversation-viewport').props.onLayout({nativeEvent:{layout:{width:390,height:500}}});const scroll=all.find(n=>n.type==='ScrollView');assert.equal(scroll.props.contentContainerStyle[1].flexGrow,1);scroll.props.onContentSizeChange(390,500);assert.ok(!nodes(f.render()).some(n=>n.type==='Indicator'&&!n.props.compact));all.find(n=>n.props?.testID==='assistant-conversation-content').props.onLayout({nativeEvent:{layout:{width:390,height:100}}});assert.ok(nodes(f.render()).some(n=>n.type==='Indicator'&&!n.props.compact&&n.props.active));});

test('new feedback does not force scrolling when the reader has moved away from the last message',()=>{const f=screenFixture();const scroll=nodes(f.render()).find(n=>n.type==='ScrollView'),calls=[];scroll.props.ref.current={scrollToEnd(options){calls.push(options);}};scroll.props.onScroll({nativeEvent:{contentOffset:{y:0},contentSize:{height:1000},layoutMeasurement:{height:300}}});scroll.props.onContentSizeChange(390,1200);assert.equal(calls.length,0);scroll.props.onScroll({nativeEvent:{contentOffset:{y:900},contentSize:{height:1200},layoutMeasurement:{height:300}}});scroll.props.onContentSizeChange(390,1300);assert.equal(calls.length,1);});

function styleOf(node) {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(style => style && typeof style === 'object'));
}
function ringsOf(tree) {
  return nodes(tree).filter(node => node.props?.style?.some?.(style => style?.position === 'absolute'));
}
function relativeLuminance(hex) {
  const channels = hex.replace('#', '').match(/../g).map(channel => parseInt(channel, 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
test('GO stays green before and after recording, with a red stop state and unchanged touch area', () => {
  for (const [uiScale, size] of [['compacto', 48], ['estandar', 64], ['grande', 72]]) {
    const f = screenFixture();
    f.voice.status = 'idle';
    const button = () => nodes(f.render(true, { uiScale })).find(node =>
      node.props?.accessibilityLabel === (f.voice.status === 'listening' ? 'Detener escucha y enviar' : 'Escuchar con GO'));
    let go = button();
    const initial = styleOf(go);
    assert.equal(initial.backgroundColor, '#D2E7D9');
    assert.equal(initial.borderColor, '#174D3C');
    assert.equal(go.props.disabled, false);
    assert.ok(nodes(go).some(node => node.props?.name === 'mic'));
    assert.ok(nodes(go).some(node => node.props?.children?.includes('GO')));
    go.props.onPress();
    assert.equal(f.starts.length, 1);
    f.voice.status = 'listening';
    go = button();
    const stopStyle = styleOf(go);
    assert.equal(stopStyle.backgroundColor, '#C62828');
    assert.equal(stopStyle.borderColor, '#C62828');
    assert.equal(go.props.disabled, false);
    assert.equal(go.props.accessibilityState.selected, true);
    assert.ok(nodes(go).some(node => node.props?.name === 'square' && node.props.color === '#FFF'));
    const label = nodes(go).find(node => node.props?.children?.includes('Parar'));
    assert.equal(styleOf(label).color, '#FFF');
    assert.ok(1.05 / (relativeLuminance(stopStyle.backgroundColor) + 0.05) >= 4.5);
    for (const key of ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'borderRadius', 'paddingVertical', 'marginHorizontal']) {
      assert.equal(stopStyle[key], initial[key]);
    }
    assert.equal(stopStyle.width, size);
    assert.equal(stopStyle.height, size);
    go.props.onPress();
    assert.equal(f.stops.length, 1);
    assert.equal(f.starts.length, 1);
    for (const status of ['transcribing', 'idle']) {
      f.voice.status = status;
      go = button();
      assert.equal(styleOf(go).backgroundColor, initial.backgroundColor);
      assert.equal(styleOf(go).borderColor, initial.borderColor);
      assert.ok(nodes(go).some(node => node.props?.name === 'mic'));
      assert.ok(nodes(go).some(node => node.props?.children?.includes('GO')));
      assert.equal(go.props.accessibilityState.selected, false);
    }
  }
});
test('visible ring pulses remain concentric and inside the reserved bounds at all scales', async () => {
  for (const props of [{ diameter: 128 }, { diameter: 100 }, { compact: true }]) {
    const f = fixture();
    f.render({ active: true, ...props });
    await new Promise(setImmediate);
    const tree = f.render({ active: true, ...props });
    const rings = ringsOf(tree).map(styleOf);
    const size = tree.props.style[1].width;
    assert.equal(rings.length, 3);
    for (const ring of rings) {
      const [min, max] = ring.transform[0].scale.outputRange;
      assert.ok(max - min >= 0.35);
      assert.ok(ring.width * max <= size);
      assert.ok(ring.opacity.outputRange[1] > ring.opacity.outputRange[0]);
    }
    for (let progress = 0; progress <= 1; progress += 0.05) {
      const widths = rings.map(ring => {
        const [min, max] = ring.transform[0].scale.outputRange;
        return ring.width * (min + (max - min) * progress);
      });
      assert.ok(widths[0] > widths[1] && widths[1] > widths[2]);
      assert.ok(widths[2] > size * 0.43 * 1.03);
    }
    const core = nodes(tree).find(node => node.props?.style?.some?.(style => style?.backgroundColor === '#D8B64E'));
    assert.equal(styleOf(core).width, size * 0.43);
    assert.deepEqual(Array.from(styleOf(core).transform[0].scale.outputRange), [1, 1.03]);
    assert.ok(nodes(core).some(node => node.props?.children?.includes('GO')));
    f.unmount();
  }
});
test('waves use an infinite native cycle with smooth repeat and no interaction lock', async () => {
  const f = fixture();
  f.render({ active: true });
  await new Promise(setImmediate);
  f.render({ active: true });
  const waves = f.loops.find(loop => !Array.isArray(loop.items));
  assert.ok(waves);
  assert.equal(waves.options.iterations, -1);
  const { options } = waves.items;
  assert.equal(options.useNativeDriver, true);
  assert.equal(options.isInteraction, false);
  assert.equal(options.duration, 1040);
  assert.equal(options.delay, undefined);
  assert.equal(options.easing(0), 0);
  assert.equal(options.easing(1), 0);
  assert.equal(options.easing(0.5), 1);
  assert.ok(Math.abs(options.easing(0.25) - options.easing(0.75)) < 1e-10);
  assert.ok(options.easing(0.001) < 0.00002);
  assert.ok(options.easing(0.999) < 0.00002);
  f.unmount();
});
test('a prolonged listening session and rerenders retain just one set of active loops', async () => {
  const f = fixture();
  f.render({ active: true });
  await new Promise(setImmediate);
  f.render({ active: true });
  const animationCount = f.animations.length;
  for (let i = 0; i < 180; i++) f.render({ active: true, compact: i % 2 === 0 });
  assert.equal(f.loops.length, 2);
  assert.ok(f.loops.every(loop => loop.started && !loop.stopped));
  assert.equal(f.animations.length, animationCount);
  f.render({ active: false });
  assert.ok(f.loops.every(loop => loop.stopped));
  f.unmount();
});
test('reduced motion shows static approved rings and stops both animations immediately', async () => {
  const f = fixture(true);
  f.render({ active: true });
  await new Promise(setImmediate);
  let tree = f.render({ active: true });
  assert.equal(f.loops.length, 0);
  assert.ok(ringsOf(tree).every(ring => styleOf(ring).transform[0].scale === 1));
  [...f.listeners][0](false);
  f.render({ active: true });
  assert.equal(f.loops.length, 2);
  [...f.listeners][0](true);
  tree = f.render({ active: true });
  assert.ok(f.loops.every(loop => loop.stopped));
  assert.ok(ringsOf(tree).every(ring => styleOf(ring).transform[0].scale === 1));
  assert.equal(f.animations.at(-1).options.duration, 0);
  f.unmount();
  assert.equal(f.listeners.size, 0);
});
