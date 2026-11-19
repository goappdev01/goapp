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
  assert.equal(h.width,d.width<440?48:60);assert.equal(h.height,h.width);
  const travel=g.obstacles.find(n=>n.key==='orbit-3'),reservations=g.obstacles.find(n=>n.key==='calendar');assert.ok(travel&&reservations);
  assert.ok(Math.abs(h.y-reservations.y-reservations.height-2)<.001);
  assert.ok(Math.abs(alignment==='left'?travel.x-h.x-h.width-2:h.x-travel.x-travel.width-2)<.001);
  for(const r of g.obstacles)assert.ok(!overlap(h,r,1.99),'AYUDA touch area is independent of '+r.key);
  assert.ok(distance(h,travel)<=h.width*.3,'AYUDA stays visually close to VIAJE');assert.ok(distance(h,reservations)<=h.width*.15);
  assert.ok(g.frame.x>=d.insets.left+4-.001&&g.frame.x+g.frame.width<=d.width-d.insets.right-4+.001);
  assert.ok(g.frame.y>=d.insets.top+4-.001);
  const bottomGap=d.height-d.insets.bottom-g.frame.y-g.frame.height;
  assert.ok(bottomGap>=6-.001);
  if(bottomGap>6.001){
   assert.equal(d.width,320);assert.equal(preset,'grande','only the narrow QR constraint can require more bottom space');
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
  if(d.width<d.height)assert.ok(c.frame.x>d.insets.left+4||Math.abs(c.frame.width-(d.width-d.insets.left-d.insets.right-8))<1);
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
 const helpAction=help.properties.find(n=>n.name?.getText(ast)==='onPress').initializer.expression.getText(ast);
 let support=false;const helpFn=vm.runInNewContext(transpile('result='+helpAction),{result:null,setSupportMode:fn=>{support=fn(support);}});helpFn();assert.equal(support,true);helpFn();assert.equal(support,false);
 const primary=nodes.find(n=>ts.isJsxAttribute(n)&&n.name.getText(ast)==='label'&&n.initializer?.getText(ast).includes("'intent_' + it.key")).parent;
 const primaryAction=primary.properties.find(n=>n.name?.getText(ast)==='onPress').initializer.expression.getText(ast);
 let intent=null,usage={},calendar=0;const primaryFn=vm.runInNewContext(transpile('result='+primaryAction),{result:null,it:{key:'viaje'},setIntentByKey:key=>{intent=key;},setSatUseCounts:fn=>{usage=fn(usage);},AsyncStorage:{setItem:()=>Promise.resolve()}});primaryFn();assert.equal(intent,'viaje');assert.equal(usage.orbit,1);assert.equal(support,false);
 const calendarDef=nodes.find(n=>ts.isObjectLiteralExpression(n)&&n.properties.some(p=>p.name?.getText(ast)==='key'&&p.initializer?.text==='calendar')&&n.properties.some(p=>p.name?.getText(ast)==='onPress'));
 const action=calendarDef.properties.find(n=>n.name?.getText(ast)==='onPress').initializer.getText(ast);
 const calendarFn=vm.runInNewContext(transpile('result='+action),{result:null,Haptics:{selectionAsync(){}},setOtrosOpen(){},openCal(){calendar++;}});calendarFn();assert.equal(calendar,1);assert.equal(intent,'viaje');
 assert.ok(source.includes('useGoDockPreference(handedness, true)'),'Landing reuses the stored left/center/right preference');
});
