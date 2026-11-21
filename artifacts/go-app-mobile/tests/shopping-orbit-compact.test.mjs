import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs'),m=h.load('lib/shoppingNote.ts'),taxonomy=h.load('lib/shoppingTaxonomy.ts',{'./shoppingNote':m}),x=h.load('lib/shoppingExperience.ts',{'./shoppingNote':m,'./shoppingTaxonomy':taxonomy});
test('shopping satellites move five percent closer without resizing GO or satellite widths; label height adapts',()=>{
 for(const width of [320,375,390,430,844])for(const fontScale of [1,1.4,1.8,2]){
  const r=x.shoppingOrbitLayout(width,fontScale),size=Math.min(Math.max(240,width-24),480),button=Math.min(108,Math.max(72,size*.245));
  const buttonHeight=Math.max(button,44+36*fontScale),oldRadius=(size-button)/2;
  assert.equal(r.size,size);assert.equal(r.button,button);assert.equal(r.buttonHeight,buttonHeight);assert.equal(r.center,Math.min(142,Math.max(108,size*.34)));
  assert.equal(r.radius,oldRadius*.95);assert.equal(r.verticalRadius,oldRadius*.95*buttonHeight/button);
  for(const p of r.points){assert.ok(p.x>=-1e-8&&p.y>=-1e-8);assert.ok(p.x+button<=size+.001&&p.y+buttonHeight<=r.height+.001);}
  for(let i=0;i<8;i++)for(let j=i+1;j<8;j++){const a=r.points[i],b=r.points[j];assert.ok(a.x+button<=b.x||b.x+button<=a.x||a.y+buttonHeight<=b.y||b.y+buttonHeight<=a.y,'neighboring touch rectangles remain separate');}
 }
});
