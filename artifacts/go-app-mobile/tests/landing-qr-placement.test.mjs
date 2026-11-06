import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fixture,devices,source,qrNode,load}=require('./helpers/landing-qr-fixture.cjs');
const overlaps=(a,b,gap=0)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
for(const profile of ['ADMIN','BUSINESS','USER'])for(const preset of ['compacto','estandar','grande'])for(const hand of ['right','left'])
 test(`${profile}/${preset}/${hand}: QR stays safe without colliding with controls`,()=>{
  for(const d of devices){
   const f=fixture(d,preset,profile,hand),button=f.render(),p=button.props.style,hit=button.props.hitSlop;
   const slop=typeof hit==='number'?{top:hit,bottom:hit,left:hit,right:hit}:hit;
   assert.equal(p.width,Math.round(32*f.scale));assert.equal(p.height,p.width);assert.equal(p.borderRadius,p.width/2);
   assert.ok(p.width+slop.left+slop.right>=44&&p.height+slop.top+slop.bottom>=44);assert.ok(p.left!==f.closeQrX||p.top!==f.closeQrY,'the former header location is not used');
   const touch={x:p.left-slop.left,y:p.top-slop.top,width:p.width+slop.left+slop.right,height:p.height+slop.top+slop.bottom};
   assert.ok(touch.x>=d.insets.left+8&&touch.x+touch.width<=d.width-d.insets.right-8);
   assert.ok(touch.y>=d.insets.top+8&&touch.y+touch.height<=(f.landingCornerPair?d.height-8:d.height-d.insets.bottom));
   const root=r=>f.toLandingRootRect(r),move=r=>({...r,y:r.y+f.landingOffsetY});
   const commands=move(root(f.landingPanels.commands));
   const active=(f.landingArrangement.obstacles??[]).filter((_,i)=>i===0||i>8);
   const obstacles=[commands,move(root(f.landingPanels.region)),{x:f.landingDisplayCloseRect.x-8,y:f.landingDisplayCloseRect.y-8,width:56,height:56},f.supportRect,...(f.humanityPlacement?[move(f.humanityPlacement)]:f.landingInlineHumanity?[move(f.inlineHumanityRect)]:[])];
   for(const o of active)assert.ok(Math.hypot(touch.x+touch.width/2-o.x-o.width/2,touch.y+touch.height/2-o.y-o.height/2)>=(touch.width+o.width)/2,JSON.stringify({d,profile,preset,hand,touch,o}));
   for(const o of obstacles)assert.ok(!overlaps(touch,o),JSON.stringify({d,profile,preset,hand,touch,o}));
   for(const minimized of [true,false]){const other=fixture(d,preset,profile,hand,{nextAptMinimized:minimized,landingNextHeight:minimized?46:480,landingPendingHeight:400});assert.deepEqual({...other.landingQrPosition},{...f.landingQrPosition},'content/open panel cannot move QR or rings');}
  }
 });
test('AYUDA and QR share the nearest safe lower gap when the fixed satellites allow both targets',()=>{
 for(const d of devices.filter(device=>device.width>=375&&device.width<500))for(const hand of ['right','left']){
  const f=fixture(d,'estandar','ADMIN',hand),h=f.supportRect,q=f.landingQrPosition;
  const distance=Math.hypot(q.x+f.closeQrSize/2-h.x-h.width/2,q.y+f.closeQrSize/2-h.y-h.height/2);
  assert.ok(distance<=100,JSON.stringify({d,hand,h,q,distance}));
  assert.ok(hand==='right'?h.x>=d.width/2:q.x<d.width/2);
  assert.ok(h.y>=d.height/2&&q.y>=d.height/2);
  assert.ok(!overlaps({x:q.x-f.closeQrHit,y:q.y-f.closeQrHit,width:f.closeQrSize+2*f.closeQrHit,height:f.closeQrSize+2*f.closeQrHit},h));
 }
});
test('the photographed 393 × 852 Landing places AYUDA and QR together below active RESERVAS on the correct side',()=>{
 const d={width:393,height:852,insets:{top:59,bottom:34,left:0,right:0}};
 for(const hand of ['right','left']){
  const f=fixture(d,'estandar','USER',hand),help=f.supportRect,button=f.render(),hit=button.props.hitSlop;
  const slop=typeof hit==='number'?{top:hit,bottom:hit,left:hit,right:hit}:hit;
  const qr={x:f.landingQrPosition.x-slop.left,y:f.landingQrPosition.y-slop.top,
    width:button.props.style.width+slop.left+slop.right,height:button.props.style.height+slop.top+slop.bottom};
  assert.ok(f.landingCornerPair,'both targets fit without moving an active orbit');
  assert.ok(hand==='right'?help.x>qr.x+qr.width&&help.x>=300:qr.x>help.x+help.width&&help.x<=60);
  assert.ok(help.y>=d.height*.85&&qr.y>=d.height*.85);
  assert.ok(help.y+help.height<=d.height-d.insets.bottom&&qr.y+qr.height<=d.height-8);
  assert.ok(f.landingQrPosition.y>=help.y+26,'QR sits independently below AYUDA on the photographed iPhone');
  assert.ok(!overlaps(help,qr));
  assert.deepEqual(JSON.parse(JSON.stringify(f.landingArrangement.offsets)),
    JSON.parse(JSON.stringify(fixture(d,'estandar','USER',hand).landingArrangement.offsets)));
 }
});
test('the unique original QR keeps its appearance and exact action; overlays still hide it',()=>{
 assert.equal(source.split('key="qr-permanent-btn"').length-1,1);
 const f=fixture(devices[2]),b=f.render(),style=b.props.style;
 assert.equal(style.backgroundColor,'rgba(8,12,28,0.92)');assert.equal(style.borderColor,'rgba(147,197,253,0.55)');assert.equal(style.borderWidth,1.2);assert.equal(style.shadowColor,'#93c5fd');assert.equal(b.props.activeOpacity,.8);
 assert.equal(b.children[0].props.name,'grid');assert.equal(b.children[0].props.color,'#ffffff');
 b.props.onPress();assert.deepEqual(f.effects,['haptic',['qr',true]]);assert.equal(f.render(true),null);
 assert.ok(!qrNode.getText().includes('clampLandingControlBottom'));
});
test('QR placement never mutates any existing control and retains a safe no-slot fallback',()=>{
 const {placeLandingQr}=load('components/landing/landingQrPlacement.ts');
 const input={company:{x:50,y:100,width:50,height:50},size:32,hitSlop:6,bounds:{x:0,y:0,width:150,height:150},obstacles:[{x:0,y:0,width:150,height:150}]},before=JSON.stringify(input);
 assert.equal(placeLandingQr(input),null);assert.equal(JSON.stringify(input),before);
});
test('QR prefers the configured dominant lower corner when it is free',()=>{
 const {placeLandingQr}=load('components/landing/landingQrPlacement.ts');
 const base={company:{x:80,y:120,width:50,height:50},size:32,hitSlop:6,bounds:{x:0,y:0,width:320,height:640},obstacles:[]};
 const right=placeLandingQr({...base,handedness:'right'}),left=placeLandingQr({...base,handedness:'left'});
 assert.equal(right.x+32+6,320);assert.equal(right.y+32+6,640);
 assert.equal(left.x,6);assert.equal(left.y+32+6,640);
});
