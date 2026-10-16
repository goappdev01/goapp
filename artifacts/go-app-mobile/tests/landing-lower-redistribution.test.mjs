import {test} from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json')),ts=require('typescript');
// Compile the same pure geometry code in this realm; assertions still exercise Home's actual callback.
const load=file=>{const scope={exports:{}};new Function('exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(scope.exports);return scope.exports;};
const layout=load('components/landing/landingResponsiveLayout.ts'),arc=load('components/landing/landingLowerArc.ts');
const panels=load('components/landing/landingPanels.ts'),policy=load('components/landing/landingV1Visibility.ts'),humanity=load('components/landing/humanityPlacement.ts');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
function walk(n){nodes.push(n);ts.forEachChild(n,walk)}walk(ast);
const decl=name=>nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);
const statement=name=>decl(name).parent.parent;
const code=ts.transpileModule([
 source.slice(statement('landingOrbitTop').getStart(ast),statement('landingBaseline').end),
 ...['landingSafeTop','landingBaseFrame','landingPanels','toLandingRootRect','humanityBlocks','humanityPanelsMeasured','humanityPlacement',
 'landingInlineHumanity','inlineHumanityWidth','inlineHumanityRect','landingArrangement'].map(name=>'const '+decl(name).getText(ast)+';'),
 'result={landingArrangement,landingCenter,landingPanels,landingBaseFrame,humanityPlacement,landingCloseRect,closeHeaderObstacles,closeReservedColumn,inlineHumanityRect};',
].join('\n'),{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText;
const devices=[
 {width:320,height:568,insets:{top:20,bottom:0,left:0,right:0}},
 {width:390,height:822,insets:{top:47,bottom:34,left:0,right:0}},
 {width:430,height:910,insets:{top:59,bottom:34,left:0,right:0}},
 {width:768,height:1024,insets:{top:24,bottom:20,left:0,right:0}},
 {width:844,height:368,insets:{top:0,bottom:21,left:44,right:44}},
];
function fixture(d,preset,profile,handedness,overrides={}){
 const scale=layout.fitLandingScale(preset,d.width,d.height,d.insets),orbitRadius=Math.round(99*scale),orbitBtnSize=Math.round(65*scale),microR=orbitRadius+Math.round(35*scale),microSz=Math.round(50*scale),goSize=Math.round(128*scale),orbitWrapSize=2*(orbitRadius+orbitBtnSize/2)+12,systemBoundingRadius=Math.max(orbitRadius+orbitBtnSize/2,microR+microSz/2),dockRight=preset==='estandar'?-1:5;
 const isUserV1Surface=profile==='USER',keys=policy.visibleLandingSatelliteKeys(Object.keys(layout.LANDING_SATELLITE_DEGREES),isUserV1Surface);
 const dock=layout.landingDockBounds({...d,dockRight,boundingRadius:systemBoundingRadius,wrapSize:orbitWrapSize,satelliteRadius:microR,satelliteSize:microSz,visibleSatelliteKeys:Object.keys(layout.LANDING_SATELLITE_DEGREES),orbitRadius,orbitButtonSize:orbitBtnSize,orbitCount:8,orbitVisible:true,goSize});
 const context={...layout,...panels,...policy,...humanity,...arc,screen:d,insets:d.insets,goSize,orbitRadius,orbitBtnSize,microR,microSz,orbitWrapSize,systemBoundingRadius,dockRight,
   handedness,maxX:dock.maxX,minX:dock.minX,landingDock:dock,SYSTEM_MARGIN_Y:6,uiScaleFactor:scale,INTENTS:Array(7).fill({}),isUserV1Surface,
   fullLandingArchitecture:profile==='ADMIN',bottomReserved:d.insets.bottom+4+(preset==='compacto'?2:preset==='estandar'?6:12),
   titleBottomLocalY:null,ACTION_TOP_Y:d.insets.top+151,posReady:true,kbHeight:0,orbitSecondLevel:null,reservasOrbitalOpen:false,
   anyOverlayOpen:false,rutasMode:false,landingNextHeight:260,landingPendingHeight:220,landingPendingOffset:8,
   anyOperationalPanelOpen:true,landingHelpBottom:400,landingHelpH:20,landingHasNext:true,nextAptMinimized:false,transportPanelH:160,
   useMemo:fn=>fn(),Math,...overrides};
 vm.runInNewContext(code,context);return {context,...context.result,scale};
}
const overlaps=(a,b)=>a.x<b.x+b.width-1e-5&&a.x+a.width>b.x+1e-5&&a.y<b.y+b.height-1e-5&&a.y+a.height>b.y+1e-5;
for(const profile of ['ADMIN','USER','BUSINESS'])for(const preset of ['compacto','estandar','grande'])for(const handedness of ['right','left'])
 test(`${profile} / ${preset} / ${handedness}: real Home geometry keeps complete buttons, cards and 56pt close target accessible`,()=>{
  for(const d of devices){
   const g=fixture(d,preset,profile,handedness),a=g.landingArrangement;
   const input={center:g.landingCenter,bounds:{left:d.insets.left+3,right:d.width-d.insets.right-3,top:d.insets.top+3,bottom:d.height-2},goSize:g.context.goSize,orbitRadius:g.context.orbitRadius,orbitSize:g.context.orbitBtnSize,orbitCount:8,orbitVisible:true,anchorSatelliteDegrees:Object.values(layout.LANDING_SATELLITE_DEGREES),satelliteRadius:g.context.microR,satelliteSize:g.context.microSz,satellites:policy.visibleLandingSatelliteKeys(Object.keys(layout.LANDING_SATELLITE_DEGREES),profile==='USER').filter(k=>k!=='payment').map(key=>({key,degrees:layout.LANDING_SATELLITE_DEGREES[key]}))};
   const saved=JSON.stringify(input),lower=arc.redistributeLandingLowerArc(input);assert.ok(lower.fitted,JSON.stringify({d,preset,profile,handedness}));assert.equal(JSON.stringify(input),saved);
   assert.equal(a.offsetY,g.landingBaseFrame.virtual?0:lower.offsetY);
   assert.equal(lower.obstacles.length,profile==='USER'?14:17,'no hidden orbit or duplicate control is restored');
   for(const [key,offset] of Object.entries(lower.offsets))assert.deepEqual(offset,{x:0,y:0},'never move individual control '+key);
   const cx=g.landingCenter.x,cy=g.landingCenter.y+lower.offsetY;
   const keys=Object.keys(lower.offsets);
   for(let i=0;i<keys.length;i++){
    const key=keys[i],r=lower.obstacles[i],x=r.x+r.width/2-cx,y=r.y+r.height/2-cy;
    if(key==='GO'){assert.ok(Math.abs(x)<1e-6&&Math.abs(y)<1e-6);continue;}
    const orbital=key.startsWith('orbit-'),degrees=orbital?-90+Number(key.slice(6))*45:layout.LANDING_SATELLITE_DEGREES[key];
    const radius=orbital?g.context.orbitRadius:g.context.microR;
    assert.ok(Math.abs(x-Math.cos(degrees*Math.PI/180)*radius)<1e-6,key+' original angle/x');
    assert.ok(Math.abs(y-Math.sin(degrees*Math.PI/180)*radius)<1e-6,key+' original angle/y');
    assert.ok(Math.abs(Math.hypot(x,y)-radius)<1e-6,key+' original radius');
   }
   for(const r of lower.obstacles){assert.ok(r.width>=44);assert.ok(r.x>=d.insets.left+3-1e-5&&r.x+r.width<=d.width-d.insets.right-3+1e-5);assert.ok(r.y>=d.insets.top+3-1e-5&&r.y+r.height<=d.height-2+1e-5,'complete target stays inside the viewport with the requested 2pt gap');}
   if(profile!=='USER')assert.ok(Math.abs(Math.max(...lower.obstacles.map(r=>r.y+r.height))-(d.height-2))<1e-6,'2pt ADMIN gap is preserved');
   const admin=fixture(d,preset,'ADMIN',handedness);assert.ok(Math.abs(g.landingCenter.y+a.offsetY-(admin.landingCenter.y+admin.landingArrangement.offsetY))<1e-6,'all profiles share the exact approved ADMIN center');
   // Compare every pair with the frozen original rings, including the approved small gaps.
   const original=key=>{
    if(key==='GO')return {x:0,y:0};
    const orbital=key.startsWith('orbit-'),angle=orbital?-90+Number(key.slice(6))*45:({bell:-112.5,list:-67.5,map:-22.5,calendar:22.5,contacts:67.5,messages:112.5,settings:157.5,mas:202.5})[key];
    const radius=orbital?g.context.orbitRadius:g.context.microR;
    return {x:Math.cos(angle*Math.PI/180)*radius,y:Math.sin(angle*Math.PI/180)*radius};
   };
   for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
    const p=lower.obstacles[i],q=lower.obstacles[j],oldP=original(keys[i]),oldQ=original(keys[j]);
    assert.ok(Math.abs(Math.hypot(oldP.x-oldQ.x,oldP.y-oldQ.y)-Math.hypot(p.x+p.width/2-q.x-q.width/2,p.y+p.height/2-q.y-q.height/2))<1e-6,'no pair can change its original separation');
   }
   const c=a.closeRect,touch={x:c.x-8,y:c.y-8,width:56,height:56};assert.equal(c.width,40);assert.equal(c.height,40);
   assert.ok(touch.x>=d.insets.left&&touch.x+touch.width<=d.width-d.insets.right&&touch.y>=d.insets.top&&touch.y+touch.height<=d.height-d.insets.bottom);
   const move=r=>({...r,y:r.y+a.offsetY}),root=r=>g.landingBaseFrame.virtual?{...r,x:r.x+g.landingBaseFrame.left,y:r.y+g.landingBaseFrame.top}:r;
   for(const obstacle of [move(root(g.landingPanels.commands)),move(root(g.landingPanels.region)),...(a.obstacles??[]),...g.closeHeaderObstacles,...g.closeReservedColumn,...(g.humanityPlacement?[move(g.humanityPlacement)]:[])])assert.ok(!overlaps(touch,obstacle),JSON.stringify({d,preset,profile,handedness,touch,obstacle}));
   assert.equal(g.landingPanels.commands.height,46);assert.equal(g.landingBaseFrame.scroll,false);
  }
 });
test('recorded iPhone moves the intact concentric Landing down 32pt and leaves exactly 2pt; close stays in its separate safe area',()=>{
 const g=fixture(devices[1],'estandar','ADMIN','right'),a=g.landingArrangement;
 assert.equal(g.context.landingDock.maxY,-12);
 const bottomExtent=Math.sin(67.5*Math.PI/180)*134+25;
 assert.ok(Math.abs(a.offsetY-(820-632.5-bottomExtent))<1e-6);
 assert.ok(Math.abs(g.landingCenter.y+a.offsetY+22+bottomExtent-842)<1e-6);
 const previousOffset=788-632.5-bottomExtent;
 assert.ok(Math.abs(a.offsetY-previousOffset-32)<1e-6,'34pt inset replaced by 2pt for the Landing only');
 assert.ok(a.closeRect.y+a.closeRect.height+8<=788,'close target retains full OS bottom protection');
 for(const offset of Object.values(a.offsets))assert.deepEqual(JSON.parse(JSON.stringify(offset)),{x:0,y:0});
});
test('User V1 keeps the existing satellites and adds only eight passive orbit shells at the ADMIN anchor',()=>{
 const g=fixture(devices[1],'estandar','USER','right');assert.ok(g.landingArrangement.offsetY>0);
 assert.deepEqual(Object.keys(g.landingArrangement.offsets),['GO',...Array.from({length:8},(_,i)=>'orbit-'+i),'bell','list','calendar','settings','mas']);
});
test('opening or minimizing any approved card never recomputes a different anchor or changes close placement',()=>{
 const d=devices[1],reference=fixture(d,'estandar','ADMIN','right');
 for(const props of [{landingNextHeight:46,nextAptMinimized:true,landingPendingHeight:46,anyOperationalPanelOpen:false},{landingNextHeight:900,landingPendingHeight:800},{landingNextHeight:0,landingPendingHeight:0,landingHasNext:false}]){
  const g=fixture(d,'estandar','ADMIN','right',props);assert.equal(g.landingArrangement.offsetY,reference.landingArrangement.offsetY);assert.deepEqual(JSON.parse(JSON.stringify(g.landingArrangement.closeRect)),JSON.parse(JSON.stringify(reference.landingArrangement.closeRect)));
 }
});
test('routes, overlays and existing Marketplace layers keep their own positions and behavior',()=>{
 for(const props of [{anyOverlayOpen:true},{rutasMode:true},{orbitSecondLevel:'comida'},{reservasOrbitalOpen:true}]){
  const g=fixture(devices[1],'estandar','ADMIN','right',props);assert.equal(g.landingArrangement.offsetY,0);assert.equal(Object.keys(g.landingArrangement.offsets).length,0);assert.equal(g.landingArrangement.closeRect,g.landingCloseRect);
 }
});
test('Home preserves zero individual offsets for painted intents and contextual satellites; actions, sizes and card trees stay protected by the existing immutable regressions',()=>{
 assert.ok(source.includes('const landingOffsetY = landingArrangement.offsetY;'));
 assert.ok(source.includes('const landingLowerOffsets = landingArrangement.offsets;'));
 assert.ok(source.includes('left: landingDisplayCloseRect.x, top: landingDisplayCloseRect.y'));
 for(const axis of ['x','y']){
  assert.ok(source.includes('landingLowerOffsets[`orbit-${i}`]?.'+axis));
  assert.ok(source.includes('landingLowerOffsets[`orbit-${INTENTS.length}`]?.'+axis));
  assert.ok(source.includes('landingLowerOffsets[s.key]?.'+axis));
 }
 const hook=decl('landingArrangement').initializer;
 assert.equal(hook.expression.getText(ast),'useMemo');
 const deps=hook.arguments[1].getText(ast);for(const volatile of ['cambiosOpen','nextAptMinimized','nextAptPanelH','pendingPanelH','goLog'])assert.ok(!deps.includes(volatile));
 assert.ok(source.includes('!anyOperationalPanelOpen && ('));
});

test('the restored slot remains associated with DEPORTE, never with a different intention or a duplicated control',()=>{
 const entries=decl('INTENTS').initializer.elements;
 const key=entries[5].properties.find(p=>p.name?.getText(ast)==='key');assert.equal(key.initializer.text,'deporte');
 assert.equal(entries.length+1,8);
 const g=fixture(devices[1],'estandar','ADMIN','right');assert.ok(g.landingArrangement.offsetY>0);
 assert.equal(Object.keys(g.landingArrangement.offsets).filter(key=>key==='orbit-5'||key==='contacts').length,2);
});

// Frozen immediately before this profile-only correction, after the user's iPhone acceptance.
test('frozen ADMIN geometry matrix remains exact across screens, all three sizes and both hands',()=>{
 const records=[];
 for(const d of devices)for(const preset of ['compacto','estandar','grande'])for(const hand of ['right','left']){
  const g=fixture(d,preset,'ADMIN',hand);records.push({center:g.landingCenter,arrangement:g.landingArrangement,panels:g.landingPanels,frame:g.landingBaseFrame,humanity:g.humanityPlacement});
 }
 assert.equal(createHash('sha256').update(JSON.stringify(records)).digest('hex'),'26d3b12b89b1a64255af344ff72c6dfd13bf5bd6330ad93e79afb5148db7407a');
});
test('the complete original ADMIN orbit renderer is preserved byte for byte',()=>{
 const shell=nodes.find(n=>ts.isConditionalExpression(n)&&n.whenTrue.getText(ast).includes('testID="landing-quiet-orbits"'));
 assert.ok(shell);assert.equal(createHash('sha256').update(shell.whenFalse.getText(ast)).digest('hex'),'6efc8e73210cfb019f29b3500998eab9538f10065c6108ec7908d69a5d723d79');
 const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 for(const fullLandingArchitecture of [true,false]){
  const matched=vm.runInNewContext(compile('result='+shell.condition.getText(ast)),{fullLandingArchitecture,anyOverlayOpen:false,rutasMode:false,reservasOrbitalOpen:false,orbitSecondLevel:null});
  assert.equal(matched,!fullLandingArchitecture,'ADMIN always takes its preserved renderer');
 }
});
test('USUARIO and EMPRESA mount exactly eight original-color passive shells without visible ink or new actions',()=>{
 const shell=nodes.find(n=>ts.isConditionalExpression(n)&&n.whenTrue.getText(ast).includes('testID="landing-quiet-orbits"'));
 const react={createElement:(type,props,...children)=>({type,props:props||{},children})};
 const setup=['GO_COLORS','INTENTS'].map(name=>'const '+decl(name).getText(ast)+';').join('\n');
 const output=ts.transpileModule(setup+'\nresult='+shell.whenTrue.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText;
 const colors=vm.runInNewContext(ts.transpileModule(setup+'\nresult=INTENTS.map(it=>it.color)',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{});
 for(const preset of ['compacto','estandar','grande']){
  const g=fixture(devices[1],preset,'ADMIN','right'),ctx={React:react,View:'View',PremiumOrbitBtn:'PremiumOrbitBtn',StyleSheet:{absoluteFill:{position:'absolute',top:0,left:0,right:0,bottom:0}},orbitWrapSize:g.context.orbitWrapSize,orbitRadiusVisual:g.context.orbitRadius,orbitBtnVisualSize:g.context.orbitBtnSize};
  vm.runInNewContext(output,ctx);const tree=ctx.result,orbits=tree.children[0];
  assert.equal(tree.props.pointerEvents,'none');assert.equal(tree.props.accessible,false);assert.equal(tree.props.accessibilityElementsHidden,true);assert.equal(tree.props.importantForAccessibility,'no-hide-descendants');assert.equal(orbits.length,8);
  for(let i=0;i<8;i++){
   const p=orbits[i].children[0].props;assert.equal(p.color,i===7?'#9ca3af':colors[i]);assert.equal(p.size,g.context.orbitBtnSize);assert.equal(p.selected,false);assert.equal(p.iconSize,0);assert.equal(p.labelOpacity,0);assert.equal(p.label,'');assert.equal(p.onLongPress,undefined);assert.equal(p.onPress(),undefined);
   const style=orbits[i].props.style,angle=-Math.PI/2+i*Math.PI/4;
   assert.ok(Math.abs(style.left+g.context.orbitBtnSize/2-g.context.orbitWrapSize/2-Math.cos(angle)*g.context.orbitRadius)<1e-6);
   assert.ok(Math.abs(style.top+g.context.orbitBtnSize/2-g.context.orbitWrapSize/2-Math.sin(angle)*g.context.orbitRadius)<1e-6);
  }
 }
});
test('the real iPhone owner-label gutter cannot change the physical GO center in USER or BUSINESS DEMO',()=>{
 for(const preset of ['compacto','estandar','grande'])for(const hand of ['right','left']){
  const admin=fixture(devices[1],preset,'ADMIN',hand),user=fixture(devices[1],preset,'USER',hand);
  const business=fixture({...devices[1],height:844},preset,'BUSINESS',hand,{isUserV1Surface:true});
  const center=(g,top)=>({x:g.landingCenter.x,y:g.landingCenter.y+g.landingArrangement.offsetY+top});
  const a=center(admin,22),u=center(user,22),b=center(business,0);
  for(const other of [u,b]){assert.ok(Math.abs(a.x-other.x)<1e-6);assert.ok(Math.abs(a.y-other.y)<1e-6);}
  assert.equal(admin.context.goSize,user.context.goSize);assert.equal(admin.context.goSize,business.context.goSize);
  assert.equal(Object.keys(user.landingArrangement.offsets).length,14);assert.equal(Object.keys(business.landingArrangement.offsets).length,14);
 }
});
