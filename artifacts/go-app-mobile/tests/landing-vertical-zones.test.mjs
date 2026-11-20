import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';const require=createRequire(import.meta.url),{evaluate,ts}=require('./helpers/react-lifecycle.cjs');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(n,p){if(p(n))return n;let r;ts.forEachChild(n,c=>{if(!r)r=find(c,p)});return r}
const geometry=find(ast,n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='compactLandingGeometry');
const obstacleExpression=geometry.initializer.arguments[0].properties.find(p=>p.name?.getText(ast)==='obstacles').initializer.getText(ast);
const orbital=evaluate('components/landing/landingLowerArc.ts');
test('actual orbit input excludes obsolete content reservations but preserves painted header and corner targets',()=>{
 const header={x:0,y:60,width:44,height:44},humanity={x:340,y:60,width:44,height:44};
 const bindings={closeHeaderObstacles:[header],landingInlineHumanity:true,inlineHumanityRect:humanity,landingControlHand:'right',compactLandingBounds:{left:0,right:390,bottom:788},closeQrSize:30,closeQrHit:8};
 const actual=vm.runInNewContext(obstacleExpression,bindings);assert.equal(actual.length,3);assert.equal(actual[0],header);assert.equal(actual[1],humanity);assert.ok(actual[2].y+actual[2].height<=788);assert.doesNotMatch(obstacleExpression,/supportObstacles|landingPanels|landingDisplayPanels/);
});
test('removing the old panel reservation lowers only the whole orbit and retains every relative position',()=>{
 const input={goSize:128,orbitRadius:99,orbitSize:65,orbitCount:8,orbitVisible:true,satelliteRadius:134,satelliteSize:50,helpSize:50,alignment:'right',satellites:[{key:'calendar',degrees:22.5},{key:'bell',degrees:-112.5},{key:'list',degrees:-67.5}],bounds:{left:0,right:390,top:59,bottom:788}};
 const old=orbital.compactLandingOrbit({...input,obstacles:[{x:0,y:730,width:390,height:58}]}),next=orbital.compactLandingOrbit({...input,obstacles:[]});
 assert.ok(next.frame.y>old.frame.y);assert.ok(Math.abs(next.frame.y+next.frame.height-788)<.001);
 for(let i=0;i<next.obstacles.length;i++){assert.equal(next.obstacles[i].width,old.obstacles[i].width);assert.ok(Math.abs((next.obstacles[i].y-next.center.y)-(old.obstacles[i].y-old.center.y))<.001)}
 fs.writeFileSync(process.env.TEMP+'/go-landing-vertical-geometry.json',JSON.stringify({old,next}));
});
test('both real information frames use the safe measured height, not just a maximum scroll height',()=>{
 assert.doesNotMatch(source,/height: changesCardSpace.availableHeight/);assert.doesNotMatch(source,/height: nextCardAvailableHeight/);assert.doesNotMatch(source,/confirmationHeight: landingHasCompletion/);
});

const panels=evaluate('components/landing/landingPanels.ts');
test('information starts at the real local iOS inset with no obsolete QR or title lane',()=>{
 const panel={x:18,y:120,width:354,height:320};
 const result=panels.landingScrollPanelSpace({panel,frame:{virtual:false},insets:{top:59},titleBottom:0,controls:[]});
 assert.equal(panel.y+panel.height-result.availableHeight,63);
 assert.match(source,/landingInformationInsets = \{ top: Math.max\(0, insets.top - landingSurfaceOrigin.y\)/);
 assert.match(source,/landingInformationControls = landingInlineHumanity \? \[inlineHumanityRect\] : \[\]/);
 const viewport=fs.readFileSync('components/landing/LandingContentViewport.tsx','utf8');
 assert.match(viewport,/contentInsetAdjustmentBehavior="never"/);assert.match(viewport,/scrollRef.current\?\.scrollTo\(\{y:0,animated:false\}\)/);
});

test('ACCIONES fits beside NOTA and releases a full selector row at iPhone widths and all three sizes',()=>{
 const layout=evaluate('components/landing/landingResponsiveLayout.ts');
 for(const width of [320,390,430])for(const preset of ['compacto','estandar','grande'])for(const alignment of ['right','left','center']){
  const insets={left:0,right:0,top:59,bottom:34},scale=layout.fitLandingScale(preset,width,822,insets),r=Math.round(99*scale),size=Math.round(50*scale);
  const geom=orbital.compactLandingOrbit({goSize:Math.round(128*scale),orbitRadius:r,orbitSize:Math.round(65*scale),orbitCount:8,orbitVisible:true,satelliteRadius:r+Math.round(35*scale),satelliteSize:size,helpSize:size,alignment,
   satellites:Object.entries(layout.LANDING_SATELLITE_DEGREES).filter(([key])=>key!=='payment').map(([key,degrees])=>({key,degrees})),bounds:{left:0,right:width,top:59,bottom:788}});
  const slot=panels.landingActionsBesideNote(geom.obstacles,geom.bounds,geom.mirrored);if(!slot){assert.equal(width,320,'only constrained narrow phones use the existing row fallback');continue;}
  assert.ok(slot.width>=64&&slot.height>=44);assert.ok(slot.x>=0&&slot.x+slot.width<=width);
  const note=geom.obstacles.find(n=>n.key==='bell');assert.ok(geom.mirrored?slot.x>=note.x+note.width:slot.x===18);
  assert.ok(Math.abs(geom.frame.y+geom.frame.height-788)<.001,'complete orbit reaches the safe floor');
  const base={commands:{x:18,y:300,width:width-36,height:46},region:{x:18,y:63,width:width-36,height:229}};
  const old=panels.landingActionPanelFrames(base,geom.frame.y-8,true),next=panels.landingActionPanelFrames(base,geom.frame.y-8,false);
  assert.equal(next.region.height-old.region.height,54);assert.equal(next.commands.y-old.commands.y,54);
 }
});

test('authorized 20 point calibration moves the common floor and never exceeds the native surface',()=>{
 const args={surface:{x:0,y:0,width:390,height:844},viewport:{width:390,height:844},insets:{top:59,bottom:34,left:0,right:0}};
 const base=orbital.landingOrbitSafeBounds(args),trial=orbital.landingOrbitSafeBounds({...args,calibration:20});
 assert.equal(trial.bottom-base.bottom,20);assert.ok(trial.bottom<=836);assert.equal(trial.top,base.top);
 assert.ok(orbital.landingOrbitSafeBounds({...args,surface:{...args.surface,height:815},calibration:20}).bottom<=807);
});
