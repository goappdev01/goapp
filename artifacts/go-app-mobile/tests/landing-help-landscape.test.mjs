import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {fixture}=createRequire(import.meta.url)('./helpers/landing-qr-fixture.cjs');
test('844x368: compact horizontal fitting needs no separate help floor or recovery shift',()=>{
 const device={width:844,height:368,insets:{top:0,bottom:21,left:44,right:44}};
 for(const profile of ['USER','ADMIN','BUSINESS'])for(const preset of ['compacto','estandar','grande'])for(const alignment of ['right','left','center']){
  const f=fixture(device,preset,profile,alignment==='left'?'left':'right',{landingAlignment:alignment}),g=f.compactLandingGeometry;
  assert.ok(g.fitted);assert.ok(Math.abs(g.frame.y+g.frame.height-341)<.001);assert.equal(g.help.width,60);
 }
});
