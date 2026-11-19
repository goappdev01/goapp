import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {fixture,devices,load}=createRequire(import.meta.url)('./helpers/landing-qr-fixture.cjs');
const anchor=load('components/landing/landingQrPlacement.ts').anchorLandingHelp;
const previousSource=anchor.toString().replace('Math.max(0, y - target, ...orbit.map(o => o.y + o.height - bottom))','Math.max(0, y - target)');
assert.notEqual(previousSource,anchor.toString(),'the baseline must use the previously validated vertical-only policy');
const previousAnchor=eval('('+previousSource+')');
const overlap=(a,b)=>a.x<b.x+b.width+3.99&&a.x+a.width+3.99>b.x&&a.y<b.y+b.height+3.99&&a.y+a.height+3.99>b.y;
const device={width:844,height:368,insets:{top:0,bottom:21,left:44,right:44}};
for(const profile of ['USER','ADMIN','BUSINESS'])for(const hand of ['right','left'])test(profile+'/'+hand+': short landscape fits the intact group with the minimum authorized inward shift',()=>{
 for(const preset of ['compacto','estandar','grande']){
  const calls=[];const f=fixture(device,preset,profile,hand,{anchorLandingHelp:input=>{const result=anchor(input);calls.push({x:input.center.x,result});return result;}});
  const g=f.landingHelpGeometry,h=f.supportRect;assert.ok(g);
  assert.equal(g.translationX,preset==='grande'?(hand==='right'?-18:18):0);
  if(preset==='grande'){assert.equal(calls.length,19);assert.ok(calls.slice(0,-1).every(c=>c.result===null));assert.ok(calls.at(-1).result);}
  else assert.equal(calls.length,1,'no horizontal search when vertical geometry fits');
  assert.ok(h.x>=52&&h.x+h.width<=792&&h.y>=8&&h.y+h.height<=339);
  const c=f.landingCenter;assert.ok(h.y+h.height/2>=c.y);assert.ok(hand==='right'?h.x+h.width/2>=c.x:h.x+h.width/2<=c.x);
  for(const r of [...f.supportObstacles,f.landingNavigationCloseRect])assert.ok(!overlap(h,r),JSON.stringify({preset,h,r}));
  const orbit=f.landingArrangement.obstacles??f.landingOrbitObstacles.slice(1);
  for(const r of orbit){assert.ok(r.x>=device.insets.left+3-.001&&r.x+r.width<=device.width-device.insets.right-3+.001);assert.ok(r.y>=3-.001&&r.y+r.height<=347+.001);}
 }
});
test('validated vertical and already-fitting landscape geometries never enter the inward adaptation',()=>{
 for(const d of devices)for(const preset of ['compacto','estandar','grande'])for(const hand of ['right','left']){
  let calls=0;const f=fixture(d,preset,'ADMIN',hand,{anchorLandingHelp:input=>{calls++;return anchor(input);}});
  assert.ok(f.landingHelpGeometry);assert.equal(f.landingHelpGeometry.translationX,0);assert.equal(calls,1);
  const previous=fixture(d,preset,'ADMIN',hand,{anchorLandingHelp:previousAnchor});
  assert.deepEqual(JSON.parse(JSON.stringify(f.supportRect)),JSON.parse(JSON.stringify(previous.supportRect)));
  assert.deepEqual(JSON.parse(JSON.stringify(f.landingCenter)),JSON.parse(JSON.stringify(previous.landingCenter)));
 }
});
