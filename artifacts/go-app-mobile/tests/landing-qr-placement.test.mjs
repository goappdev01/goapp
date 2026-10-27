import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fixture,devices,source,qrNode,load}=require('./helpers/landing-qr-fixture.cjs');
const overlaps=(a,b,gap=0)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
for(const profile of ['ADMIN','BUSINESS','USER'])for(const preset of ['compacto','estandar','grande'])for(const hand of ['right','left'])
 test(`${profile}/${preset}/${hand}: QR fits above EMPRESA, below commands, outside all existing touch targets`,()=>{
  for(const d of devices){
   const f=fixture(d,preset,profile,hand),button=f.render(),p=button.props.style,hit=button.props.hitSlop;
   assert.equal(p.width,Math.round(32*f.scale));assert.equal(p.height,p.width);assert.equal(p.borderRadius,p.width/2);
   assert.ok(p.width+hit*2>=44);assert.ok(p.left!==f.closeQrX||p.top!==f.closeQrY,'the former header location is not used');
   const touch={x:p.left-hit,y:p.top-hit,width:p.width+2*hit,height:p.height+2*hit};
   assert.ok(touch.x>=d.insets.left+8&&touch.x+touch.width<=d.width-d.insets.right-8);
   assert.ok(touch.y>=d.insets.top+8&&touch.y+touch.height<=f.company.y-8);
   const root=r=>f.toLandingRootRect(r),move=r=>({...r,y:r.y+f.landingOffsetY});
   const commands=move(root(f.landingPanels.commands));
   if(d.width<d.height)assert.ok(touch.y>=commands.y+commands.height+1.99,'between selectors and company');
   const obstacles=[...f.landingOrbitObstacles.map(move),commands,move(root(f.landingPanels.region)),{x:f.landingDisplayCloseRect.x-8,y:f.landingDisplayCloseRect.y-8,width:56,height:56},...(f.humanityPlacement?[move(f.humanityPlacement)]:f.landingInlineHumanity?[move(f.inlineHumanityRect)]:[])];
   for(const o of obstacles)assert.ok(!overlaps(touch,o,1.99),JSON.stringify({d,profile,preset,hand,touch,o}));
   for(const minimized of [true,false]){const other=fixture(d,preset,profile,hand,{nextAptMinimized:minimized,landingNextHeight:minimized?46:480,landingPendingHeight:400});assert.deepEqual({...other.landingQrPosition},{...f.landingQrPosition},'content/open panel cannot move QR or rings');}
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
