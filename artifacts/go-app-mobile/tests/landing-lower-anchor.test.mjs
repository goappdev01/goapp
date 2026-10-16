import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json')),ts=require('typescript');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
function walk(n){nodes.push(n);ts.forEachChild(n,walk)}walk(ast);
const declaration=name=>nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);
const load=file=>{const scope={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);return scope.exports;};
const layout=load('components/landing/landingResponsiveLayout.ts');
const native={safeBottom:810,moving:[{x:161,y:753.3333282470703,width:50,height:50},{x:18,y:443,width:354,height:46}],fixed:[{x:324,y:491,width:56,height:56}]};
test('captured ADMIN native geometry: safe gap is 6.67pt, Taxi is 30pt, independent close allows a common 2pt descent',()=>{
 assert.ok(Math.abs(native.safeBottom-803.3333282470703-6.6666717529296875)<1e-8);
 assert.equal(layout.landingSafeVerticalShift({...native,fixed:[]}),6);
 assert.equal(layout.landingSafeVerticalShift(native),2);
 const offset=layout.landingSafeVerticalShift(native);
 assert.ok(803.3333282470703+offset<=810);
 assert.equal(native.moving[1].y+native.moving[1].height+offset,native.fixed[0].y,'touch lanes remain disjoint');
 assert.ok(30>native.safeBottom-803.3333282470703,'a Taxi-height shift would enter the real bottom inset');
});
for(const profile of ['ADMIN','USER','BUSINESS'])for(const preset of ['compacto','estandar','grande'])
 test(profile+' / '+preset+': the shared shift follows visible footprints and physical safe bounds, never a fixed model offset',()=>{
  for(const d of [{width:320,height:568,insets:{top:20,bottom:0,left:0,right:0}},{width:390,height:822,insets:{top:47,bottom:34,left:0,right:0}},{width:430,height:910,insets:{top:59,bottom:34,left:0,right:0}},{width:844,height:368,insets:{top:0,bottom:21,left:44,right:44}}]){
   const scale=layout.fitLandingScale(preset,d.width,d.height,d.insets),r=Math.round(99*scale),btn=Math.round(65*scale),sr=r+Math.round(35*scale),sz=Math.round(50*scale),go=Math.round(128*scale),wrap=2*(r+btn/2)+12,bound=Math.max(r+btn/2,sr+sz/2),v1=profile==='USER';
   const keys=Object.keys(layout.LANDING_SATELLITE_DEGREES).filter(k=>!v1||['bell','list','calendar','settings','mas'].includes(k));
   const dock=layout.landingDockBounds({...d,dockRight:5,boundingRadius:bound,wrapSize:wrap,satelliteRadius:sr,satelliteSize:sz,visibleSatelliteKeys:keys,orbitRadius:r,orbitButtonSize:btn,orbitVisible:!v1,goSize:go});
   const cy=d.height-d.insets.bottom-6-wrap/2+dock.maxY,cx=d.width/2,rects=[{x:cx-go/2,y:cy-go/2,width:go,height:go}];
   for(const key of keys){const angle=layout.LANDING_SATELLITE_DEGREES[key]*Math.PI/180;rects.push({x:cx+Math.cos(angle)*sr-sz/2,y:cy+Math.sin(angle)*sr-sz/2,width:sz,height:sz});}
   if(!v1)for(let i=0;i<7;i++){const a=-Math.PI/2+i*2*Math.PI/7;rects.push({x:cx+Math.cos(a)*r-btn/2,y:cy+Math.sin(a)*r-btn/2,width:btn,height:btn});}
   const touch=rects.map(rect=>{const padding=Math.max(0,(44-rect.width)/2);return{x:rect.x-padding,y:rect.y-padding,width:rect.width+2*padding,height:rect.height+2*padding}});
   const safeBottom=d.height-d.insets.bottom,offset=layout.landingSafeVerticalShift({safeBottom,moving:touch,fixed:[]});
   assert.ok(offset>=0&&offset<=7);for(const rect of touch)assert.ok(rect.y+rect.height+offset<=safeBottom+1e-8);
   // Translating all members preserves every orbital distance and size.
   for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)assert.ok(Math.abs((rects[j].y+offset)-(rects[i].y+offset)-(rects[j].y-rects[i].y))<1e-8);
   assert.deepEqual(keys,Object.keys(layout.LANDING_SATELLITE_DEGREES).filter(k=>!v1||['bell','list','calendar','settings','mas'].includes(k)),'no hidden orbit is restored');
  }
 });
test('small margins, non-overlapping controls and already tight safe areas clamp without changing any source rect',()=>{
 const saved=JSON.stringify(native);
 for(const room of [0,.3,1,1.9,2,6,30]){
  const moving=[{x:10,y:100,width:44,height:44}];
  assert.equal(layout.landingSafeVerticalShift({safeBottom:144+room,moving,fixed:[]}),Math.floor(room));
  assert.equal(layout.landingSafeVerticalShift({safeBottom:200,moving,fixed:[{x:60,y:145,width:44,height:44}]}),56,'unrelated horizontal control does not restrict movement');
  assert.equal(layout.landingSafeVerticalShift({safeBottom:200,moving,fixed:[{x:10,y:144+room,width:44,height:44}]}),Math.floor(room));
 }
 assert.equal(layout.landingSafeVerticalShift({safeBottom:100,moving:native.moving,fixed:[]}),0);
 assert.equal(layout.landingSafeVerticalShift({safeBottom:810,moving:[],fixed:[]}),0);assert.equal(JSON.stringify(native),saved);
});
test('Home moves the existing dock, whole panel/operations layer and Humanity by exactly one shared value; overlays and independent navigation remain unchanged',()=>{
 const offset=declaration('landingOffsetY');assert.ok(offset);
 assert.equal(offset.initializer.getText(ast),'landingArrangement.offsetY');
 for(const offsetY of [0,9,37,40,42])assert.equal(vm.runInNewContext(offset.initializer.getText(ast),{landingArrangement:{offsetY}}),offsetY);
 assert.equal(declaration('landingLowerOffsets').initializer.getText(ast),'landingArrangement.offsets');
 assert.equal(declaration('landingDisplayCloseRect').initializer.getText(ast),'landingArrangement.closeRect');
 // Full native-footprint, overlay and close-target assertions now exercise Home's
 // complete arrangement in landing-lower-redistribution.test.mjs, rather than the rejected 2pt cap.
 assert.equal((source.match(/offsetY=\{landingOffsetY\}/g)||[]).length,1);
 assert.equal((source.match(/bottom: insets.bottom \+ SYSTEM_MARGIN_Y - landingOffsetY,/g)||[]).length,1);
 assert.equal((source.match(/top: placement.y \+ landingOffsetY,/g)||[]).length,1);
 const normal=declaration('wrapOrbital').getText(ast),ghost=normal.slice(0,normal.indexOf('if (aiOpen)'));
 assert.ok(!ghost.includes('- landingOffsetY'),'overlay ghost retains the original screen-specific geometry');
 const close=nodes.find(n=>ts.isJsxAttribute(n)&&n.name.getText(ast)==='onPress'&&n.getText(ast).includes('Haptics.selectionAsync(); closeTopLayer();'));assert.ok(close);
});
test('the complete existing panel layer moves as one unit in portrait and landscape without introducing scrolling',()=>{
 const react={createElement:(type,props,...children)=>({type,props:props||{},children})},scope={exports:{},require:n=>n==='react'?react:n==='react-native'?{View:'View',ScrollView:'ScrollView',StyleSheet:{absoluteFill:{position:'absolute',top:0,left:0,right:0,bottom:0}}}:undefined};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/landing/LandingContentViewport.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,scope);
 for(const virtual of [false,true])for(const offsetY of [0,1,2,5]){
  const frame={virtual,left:20,top:60,width:350,height:400},children={panel:'unaltered',operations:'unaltered'},out=scope.exports.LandingContentViewport({frame,offsetY,children});
  assert.equal(out.type,'View');assert.equal(out.props.pointerEvents,'box-none');
  if(virtual){assert.equal(out.props.style.top,60+offsetY);assert.equal(out.props.style.height,400);assert.equal(out.children[0].children[0],children);}
  else{const style=Object.assign({},...out.props.style);assert.equal(style.transform?.[0].translateY??0,offsetY);assert.equal(out.children[0],children);}
 }
});
test('all three validated cards, their actions and independent positioning declarations remain byte-exact',()=>{
 const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
 const cards=nodes.filter(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='LandingCardContents').map(n=>hash(n.getText(ast)));
 assert.deepEqual(cards,['74adb89a412689946d3a98f02aff59e42562f22787bdd94002015d5e06ba11dc','96d1574b93dc42a550621cc1210696eb4d44c029c57e8f2618c9603cb522ab3c']);
 const expected={renderLandingOperations:'745e8a228de7738d1d383b60d5036610a787bacc997e96054ec8d9dc579b0db1',buildNextAptActions:'bdc9fa3554f655addfbe636f3bc5a8c27fb0e4e4e8047b861f82d75eb4cbf718',landingPanels:'b07348806bbbd88ee6e129de65fbb047f16813ae588fb76f1afaea28628bd188',landingBaseline:'a2b9e157e8db19388c9e09618e1e385117fdc463af60744b6cb071e3c06cca54',landingCloseRect:'30da5a01a248f828644897bc2b4bc99ac616ad6af09eb9c23c9c3af1c2ee42c5',humanityPlacement:'77c0cfa08e068ce751ee8a301adcf60204666d5df78adcf161968c0f45bfe471'};
 for(const[name,value]of Object.entries(expected))assert.equal(hash(declaration(name).getText(ast)),value,name);
});
