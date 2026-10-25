import { priorLandingPosition } from './helpers/landing-anchor-baseline.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json')),ts=require('typescript');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const protectedBaselines=JSON.parse(fs.readFileSync(new URL('./helpers/landing-protected-baselines.json',import.meta.url),'utf8'));
// Compare the exact frozen contract for the base or the separately approved session package.
const hasSessionPackage=source.includes('import { recordAuthTrace } from "@/lib/authTrace";');
function find(n,p){if(p(n))return n;let r;ts.forEachChild(n,c=>{if(!r)r=find(c,p)});return r;}
function decl(name){return find(ast,n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);}
function load(file,deps={}){const context={exports:{},require:n=>deps[n]};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{ alwaysStrict: false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);return context.exports;}
const p=load('components/landing/landingPanels.ts'),l=load('components/landing/landingResponsiveLayout.ts'),visibility=load('components/landing/landingV1Visibility.ts');
const count=decl('INTENTS').initializer.elements.length+1;
const first=decl('legacyLandingClose').parent.parent,last=decl('landingBaseline').parent.parent;
const geometry=ts.transpileModule(source.slice(first.getStart(ast),last.end)+'\nJSON.stringify({legacyLandingClose,landingCloseRect,landingOrbitObstacles,closeHeaderObstacles,closeReservedColumn,landingBaseline});',{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const devices=[{width:320,height:568,insets:{top:20,bottom:0,left:0,right:0}},{width:375,height:667,insets:{top:20,bottom:0,left:0,right:0}},{width:390,height:822,insets:{top:59,bottom:34,left:0,right:0}},{width:430,height:910,insets:{top:59,bottom:34,left:0,right:0}},{width:844,height:368,insets:{top:0,bottom:21,left:44,right:44}},{width:568,height:298,insets:{top:0,bottom:21,left:44,right:44}}];
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
for(const preset of ['compacto','estandar','grande'])for(const [profile,user,full] of [['Usuario',true,false],['Empresa',false,false],['ADMIN',false,true],['Propietario Empresa DEMO',true,true]])test(`${preset} / ${profile}: frozen controls and close do not overlap the command row or panel region`,()=>{
 for(const d of devices)for(const handedness of ['left','right']){
  const scale=l.fitLandingScale(preset,d.width,d.height,d.insets),r=Math.round(99*scale),btn=Math.round(65*scale),microR=r+Math.round(35*scale),microSz=Math.round(50*scale),go=Math.round(128*scale),wrap=2*(r+btn/2)+12,bound=Math.max(r+btn/2,microR+microSz/2),dockRight=preset==='estandar'?-1:5;
  const dock=l.landingDockBounds({...d,dockRight,boundingRadius:bound,wrapSize:wrap,satelliteRadius:microR,satelliteSize:microSz,visibleSatelliteKeys:visibility.visibleLandingSatelliteKeys(Object.keys(l.LANDING_SATELLITE_DEGREES),user),orbitRadius:r,orbitButtonSize:btn,orbitCount:count,orbitVisible:!user,goSize:go});
  const orbitTop=d.height-d.insets.bottom-6-wrap/2+dock.maxY-Math.max(go/2,r+btn/2,microR*Math.cos(Math.PI/8)+microSz/2);
  const context={screen:d,insets:d.insets,bottomReserved:d.insets.bottom+4+(preset==='compacto'?2:preset==='estandar'?6:12),orbitWrapSize:wrap,systemBoundingRadius:bound,dockRight,handedness,maxX:dock.maxX,minX:dock.minX,SYSTEM_MARGIN_Y:6,landingDock:dock,goSize:go,orbitRadius:r,orbitBtnSize:btn,microR,microSz,isUserV1Surface:user,INTENTS:Array(count-1).fill({}),fullLandingArchitecture:full,uiScaleFactor:scale,titleBottomLocalY:null,landingOrbitTop:orbitTop,visibleLandingSatelliteKeys:visibility.visibleLandingSatelliteKeys,LANDING_SATELLITE_DEGREES:l.LANDING_SATELLITE_DEGREES,landingContentWidth:l.landingContentWidth,placeLandingClose:p.placeLandingClose};
  const g=JSON.parse(vm.runInNewContext(geometry,context)),close=g.landingCloseRect,touch={x:close.x-8,y:close.y-8,width:56,height:56};
  assert.ok(touch.x>=d.insets.left&&touch.x+touch.width<=d.width-d.insets.right);assert.ok(touch.y>=d.insets.top&&touch.y+touch.height<=d.height-d.insets.bottom);
  for(const o of [...g.landingOrbitObstacles,...g.closeHeaderObstacles,...g.closeReservedColumn])assert.ok(!overlaps(touch,o),JSON.stringify({preset,profile,d,handedness,touch,o}));
  const frame=l.landingContentFrame({...d,safeTop:d.insets.top+Math.round(12*scale),baseline:g.landingBaseline,naturalHeight:999,boundingRadius:bound,handedness,controlSize:Math.max(44,Math.round(32*scale),full?Math.round(56*scale)+16-20:0)});
  for(const nextOpen of [false,true])for(const changesOpen of [false,true]){
   const panels=p.landingPanelFrames({frame,screenHeight:d.height,insets:frame.virtual?{left:0,right:0}:d.insets,nextOpen,changesOpen});
   const root=rect=>frame.virtual?{...rect,x:rect.x+frame.left,y:rect.y+frame.top}:rect;
   assert.ok(!overlaps(touch,root(panels.commands)),'the 8pt hitSlop must not intercept any command');
   if(nextOpen)assert.ok(!overlaps(touch,root(panels.next)),'close never occupies next content');
   if(changesOpen)assert.ok(!overlaps(touch,root(panels.changes)),'close never occupies changes content');
   const slots=p.landingCommandSlots(panels.commands);assert.equal(slots.length,3);assert.equal(slots[0].y,slots[1].y);assert.equal(slots[1].y,slots[2].y);assert.ok(slots[0].x<slots[1].x&&slots[1].x<slots[2].x);
   for(const slot of slots)assert.ok(slot.width>=44&&slot.height===46);
   assert.equal(frame.scroll,false);assert.equal(frame.contentHeight,frame.height);
  }
 }
});
test('the real component always orders changes, visit, task even if the caller supplies another order',()=>{
 const react={createElement:(type,props,...children)=>({type,props,children})};
 const ui=load('components/landing/LandingPanelCommands.tsx',{react,'react-native':{View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity'},'./landingPanels':p});
 for(const width of [162,284,354]){
  const input=['task','changes','visit'].map(key=>({key,heading:key,title:key,count:1,color:'#ffffff',expanded:false,onPress(){},onLongPress(){}}));
  const tree=ui.LandingPanelCommands({frame:{x:18,y:200,width,height:46},commands:input});
  assert.deepEqual(Array.from(tree.children[0],node=>node.props.key),['changes','visit','task']);assert.deepEqual(input.map(c=>c.key),['task','changes','visit'],'never mutate caller data');
 }
});
test('a valid frozen position is kept exactly; an obstruction only changes coordinates, not dimensions',()=>{
 const preferred={x:200,y:300,width:40,height:40},bounds={x:0,y:0,width:390,height:844};assert.equal(p.placeLandingClose(preferred,bounds,[]),preferred);
 const obstacle={x:190,y:290,width:60,height:60},resolved=p.placeLandingClose(preferred,bounds,[obstacle]);assert.ok(resolved);assert.equal(resolved.width,40);assert.equal(resolved.height,40);assert.ok(!overlaps({x:resolved.x-8,y:resolved.y-8,width:56,height:56},obstacle));
});
test('closure action, gestures, orbital renderer, Humanity and authentication are unchanged',()=>{
 const before=protectedBaselines.surgical;
 for(const name of ['HomeScreen','closeTopLayer','universalSwipeGesture','wrapOrbital','renderLandingHumanity','buildNextAptActions','inlineHumanityRect','nextCardPanRef','cambiosCardPanRef']){
  const get=a=>find(a,n=>ts.isFunctionDeclaration(n)&&n.name?.text===name||ts.isVariableDeclaration(n)&&n.name.getText(a)===name)?.getText(a);assert.ok(get(ast));assert.equal(priorLandingPosition(get(ast)),name==='HomeScreen'&&!hasSessionPackage?protectedBaselines.base.HomeScreen:before[name],name);
 }
 const press=a=>find(a,n=>ts.isJsxAttribute(n)&&n.name.getText(a)==='onPress'&&n.initializer?.getText(a).includes('Haptics.selectionAsync(); closeTopLayer();')).getText(a);assert.equal(press(ast),protectedBaselines.surgicalClosePress);
 const contents=fs.readFileSync('components/landing/LandingContentViewport.tsx','utf8');const outer=contents.slice(contents.indexOf('export function LandingContentViewport'),contents.indexOf('export function LandingCardContents'));
 assert.ok(!outer.includes('<ScrollView')&&outer.includes('translateY: offsetY'));assert.ok(contents.includes('return <ScrollView'),'legitimate internal content still scrolls');
});