import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import life from './helpers/react-lifecycle.cjs';
const {evaluate,React,createRoot,document}=life;
test('opacity is immediate, clamped to one percent, persisted and restored without restart',async()=>{
 const stored=new Map(),storage={getItem:async k=>stored.get(k)??null,setItem:async(k,v)=>{stored.set(k,v);}};
 const module=()=>evaluate('components/ui/goNavigationAppearance.ts',{'@react-native-async-storage/async-storage':storage});let pref=module();let seen;const root=createRoot(document.createElement('div'));function Preview(){seen=pref.useNavigationOpacity();return null;}
 await React.act(async()=>{root.render(React.createElement(Preview));await pref.loadNavigationOpacity();});assert.equal(seen,75);
 for(const value of [11,30,50,75,99,120,-4,55.6]){await React.act(async()=>{await pref.setNavigationOpacity(value);});assert.equal(seen,pref.clampNavigationOpacity(value));assert.equal(stored.get(pref.NAVIGATION_OPACITY_KEY),String(seen));}
 await React.act(async()=>root.unmount());pref=module();await pref.loadNavigationOpacity();
 const remount=createRoot(document.createElement('div'));await React.act(async()=>remount.render(React.createElement(Preview)));assert.equal(seen,56);await React.act(async()=>remount.unmount());
});
test('calendar uses actual visible controls width so the last button reaches the safe right edge',()=>{
 const source=readFileSync('app/index.tsx','utf8');const expression=source.match(/screenKey="personal-calendar" handedness=\{handedness\} width=\{([^}]+)\}/)[1];
 for(const screen of [320,375,390,430,844])for(const demo of [false,true])for(const panel of [false,true]){const width=Function('demoCustomerCalendarSelected','calQuickCreateOpen','calConfigVisible','return '+expression)(demo,panel,false);const actual=(demo?0:52)+(panel?72:0)+64;assert.equal(width,actual);const maxLeft=screen-8-width;assert.equal(maxLeft+actual,screen-8);assert.ok(maxLeft>=0);}
});

test('icons stay opaque, monochrome and recognizable on light/dark surfaces at minimum and maximum background opacity',async()=>{for(const scheme of ['light','dark'])for(const opacity of [11,75,99]){const buttons=[],icons=[];const native={...life.rn,useColorScheme:()=>scheme,TouchableOpacity:p=>{buttons.push(p);return React.createElement('div',{},p.children);}};const button=evaluate('components/ui/GoCloseButton.tsx',{'react-native':native,'./goNavigationAppearance':{useNavigationOpacity:()=>opacity},'@expo/vector-icons':{Feather:p=>{icons.push(p);return null;}}});const root=createRoot(document.createElement('div'));await React.act(async()=>root.render(React.createElement(React.Fragment,{},...['panel','container','settings'].map(level=>React.createElement(button.GoCloseButton,{key:level,level,onPress(){},accessibilityLabel:level})))));assert.deepEqual(icons.map(i=>i.name),['arrow-left','x','settings']);for(const icon of icons){assert.equal(icon.color,scheme==='light'?'#17212B':'#FFFFFF');assert.equal(icon.style.opacity,undefined);}for(const b of buttons){const flat=Object.assign({},...b.style);assert.ok(flat.backgroundColor.endsWith(','+opacity/100+')'));assert.equal(flat.width,64);assert.equal(flat.height,64);}await React.act(async()=>root.unmount());}});
