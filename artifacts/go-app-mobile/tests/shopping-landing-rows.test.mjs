import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {shoppingFixture,shoppingUI} from './helpers/shopping-fixture.mjs';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs'),layout=h.load('lib/shoppingScreenLayout.ts');
const flat=value=>Object.assign({},...(Array.isArray(value)?value.filter(Boolean):[value]));

for(const handedness of ['left','right'])for(const width of [320,390,430])test(`Landing ${width} ${handedness}: two full-width rows without an in-flow floating column`,async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false,width,fontScale:width===320?1.8:1.4,handedness});
  assert.equal(ui.hosts.has('shopping-navigation-space'),false);assert.equal(ui.hosts.get('shopping-dock-content').style,undefined);
  const actions=ui.hosts.get('shopping-primary-actions');assert.equal(flat(actions.style).flexWrap,'nowrap');
  assert.equal(flat(actions.style).flexDirection,handedness==='left'?'row-reverse':'row');
  const ids=h.React.Children.toArray(actions.children).map(node=>node.props.testID).filter(Boolean);assert.deepEqual(ids,['shopping-list','shopping-go','shopping-add']);
  for(const id of ['shopping-list','shopping-add']){const s=flat(ui.hosts.get(id).style);assert.equal(s.flex,1);assert.ok(s.minHeight>=44);assert.equal(s.minWidth,44);}
  assert.equal(flat(ui.hosts.get('shopping-shortcut-row').style).flexWrap,'nowrap');assert.equal(ui.hosts.get('shopping-search-open').style[0].fontSize,undefined);
  assert.equal(ui.hosts.get('shopping-navigation-frame').width,64);assert.equal(ui.hosts.get('shopping-navigation-frame').height,136);assert.equal(ui.hosts.get('shopping-floating-buttons').style.flexDirection,'column');
  await ui.run(()=>ui.hosts.get('shopping-thumb-controls').onLayout({nativeEvent:{layout:{height:124}}}));assert.equal(ui.hosts.get('shopping-navigation-frame').initialBottom,132);
  await ui.tap('shopping-go');assert.ok(ui.hosts.has('shopping-command'));await ui.tap('shopping-back');
  await ui.tap('shopping-orbit-other');assert.ok(ui.hosts.has('shopping-products-scroll'));await ui.tap('shopping-back');
  await ui.tap('shopping-search-open');assert.ok(ui.hosts.has('shopping-product-search'));await ui.tap('shopping-back');
  await ui.tap('shopping-manage-lists');assert.ok(ui.hosts.has('shopping-list-create'));await ui.tap('shopping-back');
  await ui.tap('shopping-close');assert.equal(ui.calls.filter(c=>c[0]==='close').length,1);
 }finally{await ui?.close();f.disk.close();}
});

test('native label measurements choose icon placement while keeping all Landing buttons in their two rows',()=>{
 for(const width of [296,351,366,406])for(const scale of [1,1.4,1.8,2]){
  const rows=layout.shoppingLandingRows(width,layout.initialShoppingLandingText(scale));
  assert.ok([1,2].includes(rows.searchLines));assert.ok([1,2].includes(rows.listLines));
  assert.ok((width-68-14)/2>=44,'both flexible actions retain a full minimum touch width beside GO');
 }
 assert.equal(layout.shoppingLandingRows(296,{search:210,lists:120,searchWord:120,listWord:60,actionList:80,actionAdd:100}).shortcutIconAbove,true);
 assert.equal(layout.shoppingLandingRows(296,{search:210,lists:120,searchWord:120,listWord:60,actionList:80,actionAdd:100}).actionsIconAbove,true);
});

test('floating avoidance protects real orbital controls and the complete lower rows, not the decorative ring frame',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false});
  ui.geometry.set('shopping-layout-frame',[0,0,390,844]);ui.geometry.set('shopping-add-screen',[0,160,390,540]);
  ui.geometry.set('shopping-eight-orbits',[12,200,366,366]);ui.geometry.set('shopping-orbit-other',[248,436,90,90]);
  ui.geometry.set('shopping-shortcut-row',[12,700,366,44]);ui.geometry.set('shopping-primary-actions',[12,752,366,68]);ui.geometry.set('shopping-list-viewport',[0,0,0,0]);
  await ui.run(()=>ui.hosts.get('shopping-thumb-controls').onLayout({nativeEvent:{layout:{height:124}}}));
  const rects=ui.hosts.get('shopping-navigation-frame').avoidRects;
  assert.ok(rects.some(r=>r.x===248&&r.y===344&&r.width===90&&r.height===90),'OTROS is protected');
  assert.ok(rects.some(r=>r.x===12&&r.y===608&&r.width===366&&r.height===44),'both shortcuts share the entire width');
  assert.ok(rects.some(r=>r.x===12&&r.y===660&&r.width===366&&r.height===68),'the whole action row is protected');
  assert.equal(rects.some(r=>r.x===12&&r.y===108&&r.width===366&&r.height===366),false,'decorative full frame is not an interactive obstacle');
 }finally{await ui?.close();f.disk.close();}
});
