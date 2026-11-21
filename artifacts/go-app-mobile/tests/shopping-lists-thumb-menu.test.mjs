import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {shoppingFixture,shoppingUI} from './helpers/shopping-fixture.mjs';
const h=createRequire(import.meta.url)('./helpers/unified-note-fixture.cjs'),layout=h.load('lib/shoppingScreenLayout.ts');
for(const width of [296,366,406,720])for(const fontScale of [1,1.5,2])test(`thumb arc within actual width ${width}, text ${fontScale}, mirrored without clipped actions`,()=>{
 const right=layout.shoppingThumbMenu(width,fontScale,'right'),left=layout.shoppingThumbMenu(width,fontScale,'left');
 assert.equal(right.offsets.length,5);assert.deepEqual(Array.from(right.widths),Array.from(left.widths));assert.ok(right.widths.every(w=>w>=44));
 for(let i=0;i<5;i++){assert.ok(right.offsets[i]>=width*.3-.001,"right-hand controls stay in the reachable 70 percent");assert.ok(left.offsets[i]+left.widths[i]<=width*.7+.001,"left-hand mirror stays in its reachable 70 percent");assert.ok(right.offsets[i]+right.widths[i]<=width);assert.ok(Math.abs(right.offsets[i]+left.offsets[i]+right.widths[i]-width)<.001);}
 assert.ok(right.offsets[0]>=right.offsets[1]&&right.offsets[1]>=right.offsets[2]&&right.offsets[2]>=right.offsets[3]);
});
for(const handedness of ['left','right'])test(`Mis listas ${handedness}: no footer column or explanatory paragraph, voluntary floating position supported`,async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{width:390,handedness,startList:false});await ui.tap('shopping-manage-lists');
  assert.equal(ui.hosts.has('shopping-navigation-space'),false);assert.equal(ui.hosts.get('shopping-dock-content').style,undefined);
  const nav=()=>ui.hosts.get('shopping-navigation-frame');assert.equal(nav().screenKey,'shopping-lists');assert.equal(nav().allowUserOverlap,true);assert.equal(nav().handedness,handedness);
  assert.ok(!ui.container.textContent.includes('Guardado en este dispositivo'));
  const ids=['shopping-list-create','shopping-list-rename','shopping-list-share','shopping-list-delete'];
  assert.deepEqual(h.React.Children.toArray(ui.hosts.get('shopping-lists-thumb-menu').children).map(c=>c.props.children.props.testID),ids);
  await ui.run(()=>ui.hosts.get('shopping-lists-editor').onLayout({nativeEvent:{layout:{width:300}}}));
  const geometry=layout.shoppingThumbMenu(300,1,handedness);
  for(let i=0;i<4;i++){const s=ui.hosts.get('shopping-lists-action-'+i).style;assert.equal(s.width,geometry.widths[i]);assert.equal(s.marginLeft,geometry.offsets[i]);}
  const flat=style=>Object.assign({},...style.filter(Boolean));
  for(const id of ids){const style=flat(ui.hosts.get(id).style);assert.equal(style.borderRadius,27);assert.equal(style.minHeight,56);assert.equal(style.shadowOpacity,.1);}
  assert.equal(flat(ui.hosts.get('shopping-primary-actions').style).paddingLeft,geometry.offsets[4]);assert.equal(flat(ui.hosts.get('shopping-list').style).width,geometry.widths[4]);
  await ui.run(()=>ui.hosts.get('shopping-thumb-controls').onLayout({nativeEvent:{layout:{height:56}}}));assert.equal(nav().initialBottom,64,'automatic initial position measures the small real footer');
  await ui.run(()=>{ui.hosts.get('shopping-list-name').onChangeText('Semana');ui.keyboard.show();});assert.equal(ui.hosts.get('shopping-back').keyboardVisible,true);
  await ui.tap('shopping-back');assert.equal(ui.keyboard.visible,false);assert.equal(ui.hosts.get('shopping-list-name').value,'Semana');await ui.tap('shopping-list-create');assert.equal(f.disk.rows.filter(r=>r.note?.title==='Semana').length,1);
 }finally{await ui?.close();f.disk.close();}
});

test('native text measurements produce individually fitted pills and a fifth Lista step, not equal-width rectangles',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{width:390,startList:false});await ui.tap('shopping-manage-lists');
  const measured=[76,84,70,98,36];
  await ui.run(()=>{for(let i=0;i<5;i++)ui.hosts.get('shopping-list-action-measure-'+i).onTextLayout({nativeEvent:{lines:[{width:measured[i]}]}});});
  const geometry=layout.shoppingThumbMenu(366,1,'right',measured),flat=s=>Object.assign({},...s.filter(Boolean));
  assert.deepEqual(Array.from(geometry.widths),[100,108,94,122,86]);
  for(let i=0;i<4;i++){assert.equal(ui.hosts.get('shopping-lists-action-'+i).style.width,geometry.widths[i]);assert.equal(ui.hosts.get('shopping-lists-action-'+i).style.marginLeft,geometry.offsets[i]);}
  assert.equal(flat(ui.hosts.get('shopping-list').style).width,86);
  assert.equal(flat(ui.hosts.get('shopping-primary-actions').style).paddingLeft,geometry.offsets[4]);
  assert.ok(geometry.offsets.every((x,i)=>i===0||x<=geometry.offsets[i-1]),'the arc descends toward the 70 percent reach limit');
  const choice=[...ui.hosts.entries()].find(([id])=>id.startsWith('shopping-list-select-'))[1];
  for(const style of [flat(choice.style),flat(ui.hosts.get('shopping-list-name').style)]){assert.equal(style.width,366*.7);assert.ok(Math.abs(style.marginLeft-366*.3)<.001);assert.equal(style.borderRadius,27);}
 }finally{await ui?.close();f.disk.close();}
});
