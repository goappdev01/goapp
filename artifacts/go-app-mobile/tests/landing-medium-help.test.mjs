import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {fixture,devices,load}=createRequire(import.meta.url)('./helpers/landing-qr-fixture.cjs');
const overlap=(a,b)=>a.x<b.x+b.width+3.99&&a.x+a.width+3.99>b.x&&a.y<b.y+b.height+3.99&&a.y+a.height+3.99>b.y;
for(const profile of ['USER','ADMIN','BUSINESS'])for(const hand of ['right','left'])test(profile+'/'+hand+': medium AYUDA clears every touch target inside safe bounds',()=>{
 for(const d of devices){
  const f=fixture(d,'estandar',profile,hand),h=f.supportRect;
  assert.equal(h.width,f.legacySupportRect.width);assert.equal(h.height,f.legacySupportRect.height);
  assert.ok(h.x>=d.insets.left+8&&h.x+h.width<=d.width-d.insets.right-8);
  assert.ok(h.y>=d.insets.top+8&&h.y+h.height<=d.height-d.insets.bottom-8);
  for(const o of [...f.supportObstacles,...f.adminOnlyCornerObstacles,f.landingNavigationCloseRect])assert.ok(!overlap(h,o),JSON.stringify({d,profile,hand,h,o}));
  const qr={x:f.landingQrPosition.x-f.closeQrHit,y:f.landingQrPosition.y-f.closeQrHit,width:f.closeQrSize+2*f.closeQrHit,height:f.closeQrSize+2*f.closeQrHit};assert.ok(!overlap(h,qr));
  assert.deepEqual(JSON.parse(JSON.stringify(f.landingCenter)),JSON.parse(JSON.stringify(fixture(d,'estandar',profile,hand).landingCenter)));
 }
});
test('small/large positions remain byte-for-byte equivalent to their original placement',()=>{
 for(const d of devices)for(const preset of ['compacto','grande'])for(const profile of ['USER','ADMIN','BUSINESS'])for(const hand of ['right','left']){const f=fixture(d,preset,profile,hand);assert.deepEqual(f.supportRect,f.legacySupportRect);}
});
test('placement is minimal among safe candidate edges and reports impossible geometry',()=>{
 const {placeMediumLandingHelp:p}=load('components/landing/landingQrPlacement.ts');const rect={x:80,y:70,width:20,height:20},bounds={x:0,y:0,width:100,height:100};
 assert.deepEqual(p(rect,'estandar',bounds,[]),rect);const blocked={x:80,y:60,width:20,height:20};const r=p(rect,'estandar',bounds,[blocked]);assert.ok(!overlap(r,blocked));assert.equal(r.x,56);assert.equal(r.y,70);
 assert.equal(p(rect,'estandar',bounds,[bounds]),null);
});
