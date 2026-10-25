import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json')),ts=require('typescript');
function load(file){const scope={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);return scope.exports;}
const layout=load('components/landing/landingResponsiveLayout.ts'),visibility=load('components/landing/landingV1Visibility.ts');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(node,predicate){if(predicate(node))return node;let result;ts.forEachChild(node,n=>{if(!result)result=find(n,predicate)});return result;}
const devices=[
 {width:320,height:568,insets:{top:20,bottom:0,left:0,right:0}},
 {width:375,height:667,insets:{top:20,bottom:0,left:0,right:0}},
 {width:390,height:822,insets:{top:59,bottom:34,left:0,right:0}},
 {width:430,height:910,insets:{top:59,bottom:34,left:0,right:0}},
 {width:844,height:368,insets:{top:0,bottom:21,left:44,right:44}},
];
const profiles=[
 ['particular',true,false],['empresa autorizada',false,false],['trabajador',true,false],
 ['proveedor',true,false],['partner',true,false],['franquicia',true,false],
 ['propietario en ADMIN',true,true],['propietario en EMPRESA DEMO',true,false],
];
for(const preset of ['compacto','estandar','grande'])for(const [profile,userMode,adminView] of profiles)
 test(preset+' / '+profile+': lowest visible control reaches the safe bottom without reserving hidden slots',()=>{
  for(const d of devices){
   const scale=layout.fitLandingScale(preset,d.width,d.height,d.insets),r=Math.round(99*scale),btn=Math.round(65*scale);
   const sr=r+Math.round(35*scale),sz=Math.round(50*scale),go=Math.round(128*scale),wrap=2*(r+btn/2)+12,bounding=Math.max(r+btn/2,sr+sz/2);
   const v1=visibility.isUserV1Landing(userMode,adminView),keys=visibility.visibleLandingSatelliteKeys(Object.keys(layout.LANDING_SATELLITE_DEGREES),v1);
   const dock=layout.landingDockBounds({...d,dockRight:preset==='estandar'?-1:5,boundingRadius:bounding,wrapSize:wrap,satelliteRadius:sr,satelliteSize:sz,visibleSatelliteKeys:keys,orbitRadius:r,orbitButtonSize:btn,orbitVisible:!v1,goSize:go});
   const cy=d.height-d.insets.bottom-6-wrap/2+dock.maxY;
   const bottomEdges=[cy+go/2,...keys.map(k=>cy+Math.sin(layout.LANDING_SATELLITE_DEGREES[k]*Math.PI/180)*sr+sz/2)];
   if(!v1)for(let i=0;i<7;i++)bottomEdges.push(cy+Math.sin(-Math.PI/2+i*2*Math.PI/7)*r+btn/2);
   const lowest=Math.max(...bottomEdges),safeFloor=d.height-d.insets.bottom-6;
   assert.ok(lowest<=safeFloor+1e-8);assert.ok(safeFloor-lowest<1.01,'no artificial lower band');
   if(v1){
    const oldY=Math.min(0,Math.floor(wrap/2-(sr*Math.cos(Math.PI/8)+sz/2)));
    assert.ok(dock.maxY-oldY>40,'regression: hidden lower slots used to raise the whole cluster');
   }
   assert.equal(scale,layout.fitLandingScale(preset,d.width,d.height,d.insets),'size and proportions stay unchanged');
  }
 });
test('geometry angular slots match the existing satellite renderer exactly',()=>{
 const n=find(ast,n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='satellites'&&ts.isConditionalExpression(n.initializer)&&ts.isArrayLiteralExpression(n.initializer.whenFalse));
 assert.ok(n);
 for(const entry of n.initializer.whenFalse.elements){
  if(!ts.isObjectLiteralExpression(entry))continue;
  const key=entry.properties.find(p=>p.name?.getText(ast)==='key'),deg=entry.properties.find(p=>p.name?.getText(ast)==='deg');
  const k=vm.runInNewContext(key.initializer.getText(ast)),angle=vm.runInNewContext(deg.initializer.getText(ast));
  assert.equal(layout.LANDING_SATELLITE_DEGREES[k],angle,k);
 }
});
test('no overflow effect may minimize an unrelated panel',()=>{
 assert.ok(!source.includes('landingExpandedCard'));
 const effects=[];function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect')effects.push(n.arguments[0]?.getText(ast)||'');ts.forEachChild(n,walk);}walk(ast);
 for(const body of effects)assert.ok(!(body.includes('landingPendingHeight')&&body.includes('setNextAptMinimized')), 'changes overflow must never close visit/task');
});
test('visit and task share one renderer but use separate lists; existing swipes and actions remain',()=>{
 const active=find(ast,n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='activeApt'&&n.initializer.getText(ast).includes('nextPanelAppointments[safeIdx]'));
 assert.ok(active);
 const nextPanelAppointments=[{g:{id:'visit',type:'GO_BOOKING'}},{g:{id:'task',type:'TAREA'}}];
 for(const safeIdx of [0,1]){const selected=vm.runInNewContext(active.initializer.getText(ast),{nextPanelAppointments,safeIdx});assert.equal(selected.g.id,nextPanelAppointments[safeIdx].g.id);}
 assert.equal((source.match(/key="proxima-abs-block"/g)||[]).length,1);
 assert.ok(source.includes('nextCardPanRef.panHandlers')&&source.includes('cambiosCardPanRef.panHandlers'));
 for(const k of ["k: \"here\"","k: \"late\"","k: \"change\"","k: \"go\""])assert.ok(source.includes(k));
});
