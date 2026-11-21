import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
import {shoppingFixture,shoppingUI} from './helpers/shopping-fixture.mjs';
const h=createRequire(import.meta.url)('./helpers/unified-note-fixture.cjs'),m=h.load('lib/shoppingNote.ts'),t=h.load('lib/shoppingTaxonomy.ts',{'./shoppingNote':m}),x=h.load('lib/shoppingExperience.ts',{'./shoppingNote':m,'./shoppingTaxonomy':t}),screen=h.load('lib/shoppingScreenLayout.ts');
const approved=JSON.parse(readFileSync('tests/fixtures/shopping-approved-seven-geometry.json','utf8'));

test('approved exterior geometry stays identical including GO and both satellites at every supported font scale and hand',()=>{
 for(const [width,layout] of Object.entries(approved.layouts))for(const scale of [1,1.4,1.8,2.2])for(const hand of ['left','right'])assert.deepEqual(h.plain(x.shoppingOrbitLayout(+width,scale,hand)),layout);
});
test('category zones reserve 40 percent for art, fit full words and stay within real circle chords',()=>{
 for(const width of [320,375,390,430])for(const scale of [1,1.4,2.2]){const d=x.shoppingOrbitLayout(width).button,r=d/2-3;
  const inside=(left,top,w,height)=>{for(const px of [left,left+w])for(const py of [top,top+height])assert.ok(Math.hypot(px-d/2,py-d/2)<=r+.001,'content corner remains inside circular border');};
  for(const o of x.SHOPPING_ORBITS){const q=x.shoppingOrbitTypography(o.id,d,scale);assert.equal(q.labelRows.map(row=>row.text).join(' '),o.label);assert.ok(Math.abs(q.iconHeight/(d*.66)-.4)<.00001);assert.ok(q.icon<Math.min(34,d*.30));assert.ok(q.labelTop-q.iconTop-q.iconHeight>=1.999);
   inside((d-q.iconWidth)/2,q.iconTop,q.iconWidth,q.iconHeight);
   for(const row of q.labelRows){inside(row.left,row.top,row.width,row.height);assert.ok(row.fontSize>0&&row.fontSize<row.height);assert.ok(!row.text.includes('…'));}
  }
 }
});
test('circle safety bands cover the hit path but leave transparent square corners available',()=>{
 const c={x:210,y:300,width:96,height:96},rects=screen.shoppingCircleObstacles(c),contains=(x,y)=>rects.some(r=>x>=r.x-.001&&x<=r.x+r.width+.001&&y>=r.y-.001&&y<=r.y+r.height+.001);
 for(let degrees=0;degrees<360;degrees++)assert.ok(contains(258+48*Math.cos(degrees*Math.PI/180),348+48*Math.sin(degrees*Math.PI/180)));
 assert.equal(contains(c.x,c.y),false);assert.equal(contains(c.x+96,c.y+96),false);assert.equal(contains(258,348),true);
});
for(const width of [320,390,430])for(const handedness of ['left','right'])test('renderer uses supplied text measurements for each complete category on '+width+' '+handedness+' with large accessibility text',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false,width,fontScale:2.2,handedness});const before=JSON.stringify(f.doc());
  for(const o of x.SHOPPING_ORBITS){const label=[];assert.equal(ui.hosts.get('shopping-orbit-content-'+o.id).pointerEvents,'none');const art=ui.hosts.get('shopping-orbit-art-'+o.id);assert.equal(art.children,o.art);assert.equal(art.allowFontScaling,false);const q=x.shoppingOrbitTypography(o.id,x.shoppingOrbitLayout(width).button,2.2);
   for(const [index,row] of q.labelRows.entries()){let line=ui.hosts.get('shopping-orbit-line-'+o.id+'-'+index);assert.equal(line.allowFontScaling,false);assert.equal(line.adjustsFontSizeToFit,true);assert.equal(line.numberOfLines,1);assert.equal(line.style.height,row.height);assert.equal(line.style.lineHeight,row.height);label.push(line.children);
    const measured=row.width*12/row.fontSize*1.25;await ui.run(()=>ui.hosts.get('shopping-orbit-measure-'+o.id+'-'+index).onTextLayout({nativeEvent:{lines:[{width:measured}]}}));
    line=ui.hosts.get('shopping-orbit-line-'+o.id+'-'+index);assert.equal(line.children,row.text);assert.ok(line.style.fontSize*measured/12<=row.width*.971,'real measured glyph width fits without omitting text');
   }
   assert.equal(label.join(' '),o.label);assert.equal(ui.hosts.get('shopping-orbit-'+o.id).accessibilityLabel,o.label);
  }
  assert.equal(JSON.stringify(f.doc()),before);await ui.tap('shopping-orbit-bakery-hit');assert.ok(ui.hosts.has('shopping-new-product'));await ui.tap('shopping-back');assert.equal(ui.hosts.get('shopping-navigation-frame').allowUserOverlap,false);
 }finally{await ui?.close();f.disk.close();}
});
