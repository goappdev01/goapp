import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const req=createRequire(import.meta.url),{fixture,devices,source,ast,nodes,decl,transpile}=req('./helpers/landing-qr-fixture.cjs'),ts=req('typescript');
const devicesToCheck=[...devices,{width:844,height:368,insets:{top:0,bottom:21,left:44,right:44}}];
const plain=v=>JSON.parse(JSON.stringify(v));
const overlap=(a,b,gap=0)=>a.x<b.x+b.width+gap-.001&&a.x+a.width+gap>b.x+.001&&a.y<b.y+b.height+gap-.001&&a.y+a.height+gap>b.y+.001;
const distance=(a,b)=>Math.hypot(a.x+a.width/2-b.x-b.width/2,a.y+a.height/2-b.y-b.height/2)-(a.width+b.width)/2;
function frame(d,preset,profile,alignment,base=alignment==='left'?'left':'right') {return fixture(d,preset,profile,base,{landingAlignment:alignment});}
const wrap=transpile('result='+decl('wrapOrbital').initializer.getText(ast));
for(const profile of ['USER','ADMIN','BUSINESS'])for(const preset of ['compacto','estandar','grande'])for(const alignment of ['right','left','center'])test(profile+'/'+preset+'/'+alignment+': compact shared envelope, AYUDA between neighbours and independent touch targets',()=>{
 for(const d of devicesToCheck)for(const savedHand of alignment==='center'?['left','right']:[alignment]){
  const f=frame(d,preset,profile,alignment,savedHand),g=f.compactLandingGeometry,h=g.help;
  assert.ok(g.fitted,JSON.stringify({d,profile,preset,alignment}));assert.deepEqual(plain(h),plain(f.supportRect));
  assert.equal(g.helpVisualSize,f.ctx.microSz);assert.equal(h.width,Math.max(44,f.ctx.microSz));assert.equal(h.height,h.width);
  const travel=g.obstacles.find(n=>n.key==='orbit-3'),reservations=g.obstacles.find(n=>n.key==='calendar');assert.ok(travel&&reservations);
  assert.ok(Math.abs(h.y-reservations.y-reservations.height-2)<.001);
  assert.ok(Math.abs(alignment==='left'?travel.x-h.x-h.width-2:h.x-travel.x-travel.width-2)<.001);
  for(const r of g.obstacles)assert.ok(!overlap(h,r,1.99),'AYUDA touch area is independent of '+r.key);
  assert.ok(distance(h,travel)<=h.width*.3,'AYUDA stays visually close to VIAJE');assert.ok(distance(h,reservations)<=h.width*.15);
  assert.ok(g.frame.x>=g.bounds.left-.001&&g.frame.x+g.frame.width<=g.bounds.right+.001);
  assert.ok(g.frame.y>=d.insets.top+4-.001);
  const bottomGap=g.bounds.bottom-g.frame.y-g.frame.height;
  assert.ok(bottomGap>=-.001);
  if(bottomGap>.001){
   assert.ok([...g.obstacles,h].some(r=>g.fixedObstacles.some(o=>overlap({...r,y:r.y+.1},o,1.999))),'even 0.1pt lower would overlap an existing fixed target');
  }
  const count=(f.landingArrangement.obstacles??f.landingOrbitObstacles.slice(1)).length,fixed=f.supportObstacles.slice(count);
  for(const r of [...g.obstacles,h])for(const o of fixed)assert.ok(!overlap(r,o,1.99),'upper blocks and controls stay clear');
  for(const r of [...g.obstacles,h,...fixed])assert.ok(!overlap(f.landingNavigationCloseRect,r),'existing back target stays independently tappable');
  const qr={x:f.landingQrPosition.x-f.closeQrHit,y:f.landingQrPosition.y-f.closeQrHit,width:f.closeQrSize+2*f.closeQrHit,height:f.closeQrSize+2*f.closeQrHit};
  for(const r of [...g.obstacles,h])assert.ok(!overlap(qr,r),'QR remains clear');
  const scope={...f.ctx,...f,result:null,anyOverlayOpen:false,aiOpen:false,compactLandingActive:true,systemBoundingRadius:f.ctx.systemBoundingRadius,orbitWrapSize:f.ctx.orbitWrapSize,posReady:true,pan:{x:999,y:999},overlayDX:0,overlayDY:0,kbOrbitTranslate:0,aiShrink:1,View:'View',Animated:{View:'Animated.View'},React:{createElement:(type,props,...children)=>({type,props,children})}};
  vm.runInNewContext(wrap,scope);const tree=scope.result('GO'),inner=tree.children[0];
  assert.ok(Math.abs(tree.props.style.left+inner.props.style.left+f.ctx.orbitWrapSize/2-g.center.x)<.001);
  assert.ok(Math.abs(tree.props.style.top+inner.props.style.top+f.ctx.orbitWrapSize/2-g.center.y)<.001);
  assert.equal(inner.props.style.transform[0].translateX,0);assert.equal(inner.props.style.transform[1].translateY,0,'legacy pan cannot add another displacement');
 }
});
test('left reflects every orbital center without mirroring text; center does not select a handed edge',()=>{
 for(const d of devices)for(const preset of ['compacto','estandar','grande']){
  const r=frame(d,preset,'ADMIN','right').compactLandingGeometry,l=frame(d,preset,'ADMIN','left').compactLandingGeometry,c=frame(d,preset,'ADMIN','center').compactLandingGeometry;
  assert.equal(r.mirrored,false);assert.equal(l.mirrored,true);assert.equal(c.mirrored,false);
  for(const right of [...r.obstacles,{...r.help,key:'help'}]){const left=[...l.obstacles,{...l.help,key:'help'}].find(n=>n.key===right.key);assert.ok(Math.abs((right.x+right.width/2-r.center.x)+(left.x+left.width/2-l.center.x))<.001);assert.ok(Math.abs((right.y-r.center.y)-(left.y-l.center.y))<.001);assert.equal(right.width,left.width);}
  if(d.width<d.height){const dx=d.width/2-c.frame.width/2-c.frame.x;if(Math.abs(dx)>.001)assert.ok([...c.obstacles,c.help].some(r=>c.fixedObstacles.some(o=>overlap({...r,x:r.x+dx},o,1.99))),'only a real fixed target can prevent exact centering');}
 }
 const mirroredExpressions=nodes.filter(n=>ts.isPropertyAssignment(n)&&n.name.getText(ast)==='left'&&n.initializer.getText(ast).startsWith('compactLandingActive && compactLandingGeometry.mirrored'));
 assert.ok(mirroredExpressions.length>=4);
 for(const n of mirroredExpressions){const expr=n.initializer.getText(ast);const scope={compactLandingActive:true,compactLandingGeometry:{mirrored:true},orbitWrapSize:300,orbitBtnVisualSize:65,microSz:50,x:220,ox:220,mx:220};const result=vm.runInNewContext(transpile('result='+expr),{...scope,result:null});assert.ok([15,30].includes(result));assert.equal(vm.runInNewContext(transpile('result='+expr),{...scope,compactLandingActive:false,result:null}),220);}
});
test('upper content frames, cards and Humanity are unchanged from published 31ec52a',()=>{
 const frozen=JSON.parse(fs.readFileSync('tests/helpers/landing-content-before-compact.json','utf8'));
 for(const row of frozen)for(const alignment of [row.hand,'center']){
  const f=frame(row.device,row.preset,row.profile,alignment,row.hand);
  assert.deepEqual(plain({panels:f.landingPanels,frame:f.landingBaseFrame,offsetY:f.landingOffsetY,humanity:f.humanityPlacement}),{panels:row.panels,frame:row.frame,offsetY:row.offsetY,humanity:row.humanity});
 }
});
test('real AYUDA, VIAJE and RESERVAS callbacks retain their independent actions',()=>{
 const help=nodes.find(n=>ts.isJsxAttribute(n)&&n.name.getText(ast)==='label'&&n.initializer?.text==='AYUDA').parent;
 const helpAction=decl('toggleLandingHelp').initializer.getText(ast);
 assert.equal(help.properties.find(n=>n.name?.getText(ast)==='onPress').initializer.expression.getText(ast),'toggleLandingHelp');
 const helpButton=nodes.find(n=>ts.isJsxAttribute(n)&&n.name.getText(ast)==='testID'&&n.initializer?.text==='landing-help-button').parent;assert.equal(helpButton.properties.find(n=>n.name?.getText(ast)==='onPress').initializer.expression.getText(ast),'toggleLandingHelp');
 let support=false;const helpFn=vm.runInNewContext(transpile('result='+helpAction),{result:null,setSupportMode:fn=>{support=fn(support);}});helpFn();assert.equal(support,true);helpFn();assert.equal(support,false);
 const primary=nodes.find(n=>ts.isJsxAttribute(n)&&n.name.getText(ast)==='label'&&n.initializer?.getText(ast).includes("'intent_' + it.key")).parent;
 const primaryAction=primary.properties.find(n=>n.name?.getText(ast)==='onPress').initializer.expression.getText(ast);
 let intent=null,usage={},calendar=0;const primaryFn=vm.runInNewContext(transpile('result='+primaryAction),{result:null,it:{key:'viaje'},setIntentByKey:key=>{intent=key;},setSatUseCounts:fn=>{usage=fn(usage);},AsyncStorage:{setItem:()=>Promise.resolve()}});primaryFn();assert.equal(intent,'viaje');assert.equal(usage.orbit,1);assert.equal(support,false);
 const calendarDef=nodes.find(n=>ts.isObjectLiteralExpression(n)&&n.properties.some(p=>p.name?.getText(ast)==='key'&&p.initializer?.text==='calendar')&&n.properties.some(p=>p.name?.getText(ast)==='onPress'));
 const action=calendarDef.properties.find(n=>n.name?.getText(ast)==='onPress').initializer.getText(ast);
 const calendarFn=vm.runInNewContext(transpile('result='+action),{result:null,Haptics:{selectionAsync(){}},setOtrosOpen(){},openCal(){calendar++;}});calendarFn();assert.equal(calendar,1);assert.equal(intent,'viaje');
 assert.ok(source.includes('useGoDockPreference(handedness, true)'),'Landing reuses the stored left/center/right preference');
});


test('safe floor comes from the real surface/window intersection, without subtracting insets twice',()=>{
 const {landingOrbitSafeBounds}=req('./helpers/landing-qr-fixture.cjs').load('components/landing/landingLowerArc.ts');
 const viewport={width:393,height:852},insets={left:0,right:0,top:59,bottom:34};
 const full=landingOrbitSafeBounds({surface:{x:0,y:0,...viewport},viewport,insets});assert.equal(full.bottom,818);
 const clipped=landingOrbitSafeBounds({surface:{x:0,y:0,width:393,height:818},viewport,insets});assert.equal(clipped.bottom,818);
 const inner=landingOrbitSafeBounds({surface:{x:0,y:59,width:393,height:759},viewport,insets});assert.equal(inner.bottom,759);assert.equal(inner.top,4);
 const landscape=landingOrbitSafeBounds({surface:{x:44,y:0,width:756,height:347},viewport:{width:844,height:368},insets:{left:44,right:44,top:0,bottom:21}});assert.equal(landscape.left,0);assert.equal(landscape.right,756);assert.equal(landscape.bottom,347);
});

test('size and hand changes recompute AYUDA synchronously from the same effective scale and keep the lowest valid anchor',()=>{
 const device={width:393,height:852,insets:{top:59,bottom:34,left:0,right:0}};
 const attrs=nodes.find(n=>ts.isJsxAttribute(n)&&n.name.getText(ast)==='label'&&n.initializer?.text==='AYUDA').parent;
 const prop=(name,scope)=>vm.runInNewContext(transpile('result='+attrs.properties.find(p=>p.name?.getText(ast)===name).initializer.expression.getText(ast)),{...scope,result:null});
 for(const profile of ['USER','ADMIN','BUSINESS'])for(const alignment of ['right','left','center','left','right']){
  let prior=0;
  for(const preset of ['compacto','estandar','grande']){
   const f=frame(device,preset,profile,alignment),g=f.compactLandingGeometry;
   const scope={...f,...f.ctx,compactLandingActive:true};
   const size=prop('size',scope);assert.equal(size,Math.round(50*f.scale));assert.ok(size>prior);prior=size;
   assert.ok(Math.abs(size/f.ctx.goSize-50/128)<.008,'AYUDA/GO proportion only differs by whole-point rounding');
   assert.equal(f.supportRect.width,Math.max(44,size));assert.equal(prop('iconSize',scope),Math.round(22*f.scale));
   assert.equal(prop('labelSize',scope),Math.max(8,Math.round(8*f.scale)));
   assert.ok(Math.abs(g.frame.y+g.frame.height-g.bounds.bottom)<.001,'no unused space below the real envelope');
   assert.equal(g.bounds.bottom,818,'system safe bottom is preserved without an extra lift');
  }
 }
});

test('actual root measurement records its window origin without writing a preference',()=>{
 const attr=nodes.find(n=>ts.isJsxAttribute(n)&&n.name.getText(ast)==='ref'&&n.initializer?.expression?.getText(ast)==='landingSurfaceRef').parent;
 const onLayout=attr.properties.find(n=>n.name?.getText(ast)==='onLayout').initializer.expression.getText(ast);
 let size=null,origin={x:0,y:0};const fn=vm.runInNewContext(transpile('result='+onLayout),{result:null,setLandingSurfaceSize:change=>{size=change(size);},setLandingSurfaceOrigin:change=>{origin=change(origin);},landingSurfaceRef:{current:{measureInWindow:cb=>cb(0,59)}}});
 fn({nativeEvent:{layout:{width:393,height:759}}});assert.deepEqual(plain(size),{width:393,height:759});assert.deepEqual(plain(origin),{x:0,y:59});
});


test('all 27 combinations fit a navigator surface that already excludes system insets',()=>{
 const insets={top:59,bottom:34,left:0,right:0};
 for(const surface of [{width:393,height:818,x:0,y:0},{width:393,height:759,x:0,y:59}]){
  for(const profile of ['USER','ADMIN','BUSINESS'])for(const preset of ['compacto','estandar','grande'])for(const alignment of ['right','left','center']){
   const f=fixture({...surface,insets},preset,profile,alignment==='left'?'left':'right',{landingAlignment:alignment,landingWindow:{width:393,height:852},landingSurfaceOrigin:{x:surface.x,y:surface.y}}),g=f.compactLandingGeometry;
   assert.ok(g.fitted);assert.ok(Math.abs(g.frame.y+g.frame.height-surface.height)<.001,'the navigator has already protected the lower inset');
   assert.equal(g.helpVisualSize,Math.round(50*f.scale));
   for(const r of [...g.obstacles,g.help])assert.ok(r.y+r.height<=surface.height+.001&&r.x>=-.001&&r.x+r.width<=surface.width+.001);
  }
 }
});
