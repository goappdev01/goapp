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
 assert.match(source,/height: changesCardSpace.availableHeight/);assert.match(source,/height: nextCardAvailableHeight/);assert.doesNotMatch(source,/confirmationHeight: landingHasCompletion/);
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
