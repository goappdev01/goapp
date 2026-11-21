import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {shoppingFixture,shoppingUI} from './helpers/shopping-fixture.mjs';
const h=createRequire(import.meta.url)('./helpers/unified-note-fixture.cjs'),m=h.load('lib/shoppingNote.ts'),taxonomy=h.load('lib/shoppingTaxonomy.ts',{'./shoppingNote':m}),x=h.load('lib/shoppingExperience.ts',{'./shoppingNote':m,'./shoppingTaxonomy':taxonomy});
const flat=s=>Object.assign({},...(Array.isArray(s)?s.flat(Infinity).filter(Boolean):[s]));
test('seven-circle ring and two integrated satellites fit iPhones without extra height or shape changes for large text',()=>{
 for(const width of [240,280,320,375,390,430,480,844])for(const scale of [1,1.4,1.8,2])for(const hand of ['left','right']){
  const l=x.shoppingOrbitLayout(width,scale,hand),base=x.shoppingOrbitLayout(width,1,hand);
  assert.equal(l.buttonHeight,l.button);assert.ok(l.height<=l.size);assert.equal(l.height,base.height);assert.equal(l.button,base.button);assert.equal(l.center,base.center);if(width<=480)assert.ok(l.height-l.centerY<l.size/2,"bottom anchoring lowers the shared centre on portrait iPhones without moving the footer");
  assert.equal(l.points.length,7);assert.ok(l.favorite.diameter>=44&&l.favorite.diameter<l.button);assert.equal(l.favorite.diameter,l.home.diameter);assert.ok(l.center>l.button*1.5);
  const circles=[...l.points.map(p=>({x:p.x+l.button/2,y:p.y+l.button/2,r:l.button/2})),{x:l.centerX,y:l.centerY,r:l.center/2},{x:l.favorite.x+l.favorite.diameter/2,y:l.favorite.y+l.favorite.diameter/2,r:l.favorite.diameter/2},{x:l.home.x+l.home.diameter/2,y:l.home.y+l.home.diameter/2,r:l.home.diameter/2}];
  for(const c of circles){assert.ok(c.x-c.r>=-.001&&c.y-c.r>=-.001);assert.ok(c.x+c.r<=l.size+.001&&c.y+c.r<=l.height+.001);}
  for(let i=0;i<circles.length;i++)for(let j=i+1;j<circles.length;j++){const a=circles[i],b=circles[j];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.r+b.r+1.99,`paths ${i}/${j} separated at ${width}/${scale}/${hand}`);}
  for(const [satellite,first,second] of [[8,1,2],[9,5,6]]){const a=circles[first],b=circles[second],f=circles[satellite];assert.ok(Math.hypot(f.x-l.centerX,f.y-l.centerY)>l.radius,'satellites outside the ring');assert.ok(Math.abs(Math.hypot(f.x-a.x,f.y-a.y)-Math.hypot(f.x-b.x,f.y-b.y))<.001,'satellite equidistant from category neighbours');}assert.ok(circles[8].x>l.centerX&&circles[8].y<l.centerY);assert.ok(circles[9].x<l.centerX&&circles[9].y>l.centerY);

 }
});
test('controlled category lines preserve every word, fit typography to diameter, and keep short names larger',()=>{
 for(const width of [320,375,390,430]){const l=x.shoppingOrbitLayout(width);for(const o of x.SHOPPING_ORBITS){const t=x.shoppingOrbitTypography(o.id,l.button);assert.equal(t.text.replace(/\s+/g,' '),o.label);assert.ok(t.fontSize>0);assert.ok(t.lineHeight*t.lines.length<=t.labelHeight+.01);assert.ok(t.icon>=16&&t.icon<Math.min(34,l.button*.30));}
  assert.ok(x.shoppingOrbitTypography('care',l.button).fontSize<=x.shoppingOrbitTypography('drinks',l.button).fontSize);
 }
});
for(const handedness of ['left','right'])test(`SVG circular control wiring ${handedness}: transparent corners, separate favourite, existing navigation and unchanged data`,async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false,width:390,fontScale:1.8,handedness});const before=JSON.stringify(f.doc()),frame=ui.hosts.get('shopping-seven-orbits');
  const geometry=x.shoppingOrbitLayout(390,1.8,handedness);assert.equal(frame.style.height,geometry.height);
  for(const id of [...x.SHOPPING_ORBITS.map(o=>o.id),'favorites','home']){const button=ui.hosts.get('shopping-orbit-'+id),s=flat(button.style),hit=ui.hosts.get('shopping-orbit-'+id+'-hit');assert.equal(s.width,s.height);assert.equal(s.borderRadius,s.width/2);assert.equal(s.minHeight,s.height);assert.equal(s.maxHeight,s.height);assert.equal(button.pointerEvents,'box-none');assert.equal(button.onPress,undefined);assert.equal(hit.r+hit.strokeWidth/2,s.width/2);assert.equal(hit.cx,s.width/2);assert.equal(typeof hit.onPress,'function');assert.ok(s.width>=44);}
  const favorite=flat(ui.hosts.get('shopping-orbit-favorites').style);assert.equal(favorite.width,geometry.favorite.diameter);assert.ok(favorite.width<geometry.button);assert.equal(favorite.top,geometry.favorite.y);assert.equal(favorite.position,'absolute');
  const favoriteContent=h.React.Children.toArray(ui.hosts.get('shopping-orbit-favorites').children);assert.equal(favoriteContent[0].props.pointerEvents,'box-none');const strings=node=>typeof node==='string'?[node]:h.React.isValidElement(node)?h.React.Children.toArray(node.props.children).flatMap(strings):[];assert.deepEqual(favoriteContent.flatMap(strings),['★','FAVORITOS']);assert.equal(ui.hosts.get('shopping-orbit-favorites').accessibilityLabel,'FAVORITOS');
  await ui.tap('shopping-orbit-favorites-hit');assert.ok(ui.hosts.has('shopping-products-scroll'));await ui.tap('shopping-back');await ui.tap('shopping-orbit-produce-hit');assert.ok(ui.hosts.has('shopping-new-product'));await ui.tap('shopping-back');
  assert.equal(JSON.stringify(f.doc()),before);assert.equal(ui.hosts.get('shopping-floating-buttons').style.flexDirection,'column');assert.equal(ui.hosts.has('shopping-navigation-space'),false);assert.equal(ui.hosts.has('shopping-add'),false);assert.ok(ui.hosts.has('shopping-search-open'));
  assert.deepEqual(h.React.Children.toArray(ui.hosts.get('shopping-primary-actions').children).map(n=>n.props.testID).filter(Boolean),['shopping-manage-lists','shopping-go','shopping-list']);
  await ui.tap('shopping-go-orbit-hit');assert.ok(ui.hosts.has('shopping-command'));await ui.tap('shopping-back');await ui.tap('shopping-close');assert.ok(ui.calls.some(c=>c[0]==='close'));
 }finally{await ui?.close();f.disk.close();}
});
