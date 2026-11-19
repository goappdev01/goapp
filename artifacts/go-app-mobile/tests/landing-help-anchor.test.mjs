import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {fixture,devices,source}=createRequire(import.meta.url)('./helpers/landing-qr-fixture.cjs');
const overlap=(a,b)=>a.x<b.x+b.width+3.99&&a.x+a.width+3.99>b.x&&a.y<b.y+b.height+3.99&&a.y+a.height+3.99>b.y;
for(const profile of ['USER','ADMIN','BUSINESS'])for(const preset of ['compacto','estandar','grande'])test(profile+'/'+preset+': AYUDA is a safe lower satellite and the orbit translates as one unit',()=>{
 for(const d of devices)for(const hand of ['right','left']){
  const f=fixture(d,preset,profile,hand),h=f.supportRect,g=f.landingHelpGeometry;
  assert.ok(g,'reference orbit and AYUDA fit');assert.equal(h.width,Math.max(44,d.width<440?48:60));
  assert.ok(h.x>=d.insets.left+8&&h.x+h.width<=d.width-d.insets.right-8);
  assert.ok(h.y>=d.insets.top+8&&h.y+h.height<=d.height-d.insets.bottom-8);
  const center={x:f.landingCenter.x,y:f.landingCenter.y+f.landingOffsetY};
  assert.ok(h.y+h.height/2>=center.y);assert.ok(hand==='right'?h.x+h.width/2>=center.x:h.x+h.width/2<=center.x);
  for(const o of [...f.supportObstacles,f.landingNavigationCloseRect])assert.ok(!overlap(h,o),JSON.stringify({d,profile,preset,hand,h,o}));
  const qr={x:f.landingQrPosition.x-f.closeQrHit,y:f.landingQrPosition.y-f.closeQrHit,width:f.closeQrSize+2*f.closeQrHit,height:f.closeQrSize+2*f.closeQrHit};assert.ok(!overlap(h,qr));
  const orbit=f.landingArrangement.obstacles??f.landingOrbitObstacles.slice(1);
  for(const actual of orbit){
   const original=f.landingOrbitObstacles.slice(1).find(o=>Math.abs(actual.x+actual.width/2-o.x-o.width/2)<.001
     &&Math.abs(actual.y+actual.height/2-o.y-o.height/2-f.landingOffsetY)<.001);
   assert.ok(original,'every control retains its angle and center relative to GO');
   assert.equal(actual.width,f.landingArrangement.obstacles?Math.max(44,original.width):original.width);assert.equal(actual.height,f.landingArrangement.obstacles?Math.max(44,original.height):original.height);
  }
 }
});
test('switching profiles and sizes repeatedly retains the geometric anchor without accumulated displacements',()=>{
 for(const d of devices)for(const hand of ['right','left'])for(let round=0;round<3;round++)for(const preset of ['compacto','estandar','grande']){
  const user=fixture(d,preset,'USER',hand);for(const profile of ['ADMIN','BUSINESS']){const f=fixture(d,preset,profile,hand);assert.deepEqual(JSON.parse(JSON.stringify(f.supportRect)),JSON.parse(JSON.stringify(user.supportRect)));assert.deepEqual(JSON.parse(JSON.stringify(f.landingCenter)),JSON.parse(JSON.stringify(user.landingCenter)));}
 }
});
test('AYUDA keeps its original icon, label and action; no independent medium displacement remains',()=>{
 assert.ok(!source.includes('placeMediumLandingHelp'));
 const start=source.indexOf('<View testID="landing-support-orbit"'),block=source.slice(start,start+1200);
 assert.ok(block.includes('onPress={()=>setSupportMode(active=>!active)}'));
 assert.ok(block.includes('label="AYUDA"'));assert.ok(block.includes('icon="message-circle"'));assert.ok(block.includes('color="#4A80BD"'));
});
