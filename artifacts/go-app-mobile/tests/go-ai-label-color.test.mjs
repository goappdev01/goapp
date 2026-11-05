import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const h=createRequire(import.meta.url)('./helpers/unified-note-fixture.cjs'),ts=h.ts;
const flat=value=>Object.assign({},...[value].flat(Infinity).filter(Boolean));
function parsed(file){const text=fs.readFileSync(file,'utf8');return ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);}
function all(tree,predicate){const found=[];function walk(n){if(predicate(n))found.push(n);ts.forEachChild(n,walk);}walk(tree);return found;}
function evaluate(node,tree,context={}){const scope={...context};vm.runInNewContext(h.compile('globalThis.result=('+node.getText(tree)+');'),scope);return scope.result;}
function attr(node,name){return node.attributes.properties.find(p=>p.name?.text===name)?.initializer;}
function value(node,tree,context){return ts.isJsxExpression(node)?evaluate(node.expression,tree,context):node.text;}
function style(file,key){const tree=parsed(file);const property=all(tree,n=>ts.isPropertyAssignment(n)&&n.name.getText(tree)===key)[0];assert.ok(property,key);return evaluate(property.initializer,tree);}

for(const [file,handler] of [['app/index.tsx','openAi'],['components/booking/GoReservasConfigScreen.tsx','onOpenGo']])test(file+' AI GO label is white without changing the action',()=>{
 const tree=parsed(file);const text=all(tree,n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(tree)==='Text'&&n.children.some(c=>ts.isJsxText(c)&&c.text.trim()==='GO')&&n.parent.getText(tree).includes(handler))[0];
 assert.ok(text);assert.equal(value(attr(text.openingElement,'style'),tree).color.toUpperCase(),'#FFFFFF');
 assert.ok(attr(text.parent.openingElement,'onPress').getText(tree).includes(handler));
});

test('Messages GO action is white while ordinary GO badges and other action labels keep their own styles',()=>{
 assert.equal(style('components/MessagesScreen.tsx','actionBtnLabelGo').color,'#FFFFFF');
 assert.equal(style('components/MessagesScreen.tsx','actionBtnLabelClose').color,'#9CA3AF');
 const tree=parsed('components/MessagesScreen.tsx');const action=all(tree,n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(tree)==='TouchableOpacity'&&attr(n.openingElement,'onPress')?.getText(tree)==='{handleCreateGo}')[0];
 assert.ok(action);assert.match(action.getText(tree),/s.actionBtnLabelGo/);
});

test('assistant GO reuses the white style in idle/listening states without changing other dock labels',()=>{
 const file='components/booking-assistant/BookingAssistantUI.tsx';const s={dockLabel:style(file,'dockLabel'),goLabel:style(file,'goLabel')};
 assert.equal(s.dockLabel.color,'#163F60');
 const tree=parsed('components/booking-assistant/BookingAssistantScreen.tsx');
 const text=all(tree,n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(tree)==='Text'&&n.getText(tree).includes('listening ? "Parar" : "GO"'))[0];assert.ok(text);
 for(const listening of [false,true])assert.equal(flat(value(attr(text.openingElement,'style'),tree,{s,listening})).color,'#FFFFFF');
});

for(const handedness of ['left','right'])for(const width of [320,390,768])test(`real Note GO foreground is white at ${width}px, ${handedness}`,async()=>{
 const ui=await h.editorFixture({handedness,viewport:{width,height:844,scale:3,fontScale:1.5}});
 try{const button=ui.hosts.get('note-microphone');const children=[button.children].flat(Infinity).filter(Boolean);
 const label=children.find(n=>n.props?.children==='GO');assert.ok(label);assert.equal(flat(label.props.style).color,'#FFFFFF');
 const mic=children.find(n=>n.props?.name==='mic');assert.equal(mic.props.color,'#FFFFFF');
 assert.equal(flat(button.style).backgroundColor,'rgba(211,241,224,0.94)');assert.equal(typeof button.onPress,'function');
 }finally{await ui.close();}
});

test('Landing approved white GO foreground remains present',()=>{
 const tree=parsed('app/index.tsx');const label=all(tree,n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(tree)==='Text'&&n.getText(tree).includes('marketplaceCheckout.brand.label.slice(0, 7)'))[0];
 assert.ok(label);assert.match(attr(label.openingElement,'style').getText(tree),/color: "#ffffff"/);
});
