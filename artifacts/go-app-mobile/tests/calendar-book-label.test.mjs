import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ast, find, transpile } from './helpers/calendar-container-fixture.mjs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const booking=find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='TouchableOpacity'&&n.openingElement.attributes.properties.some(a=>a.name?.getText(ast)==='accessibilityLabel'&&a.initializer?.getText(ast)==='{t("biz_book_btn")}'));
function render(){let booked=0,diagnostic=0;const scope={exports:{},React:{createElement:(type,props,...children)=>({type,props,children})},TouchableOpacity:'Button',Text:'Text',t:()=> 'Reservar',Haptics:{impactAsync:async()=>{},ImpactFeedbackStyle:{Medium:'medium',Heavy:'heavy'}},setShowBookingFromCal:()=>booked++,setDiagBookingOpen:()=>diagnostic++};
 vm.runInNewContext(transpile('exports.button=('+booking.getText(ast)+');'),scope);return{button:scope.exports.button,counts:()=>[booked,diagnostic]};}
test('the complete booking label stays on one fitted line, centered, with both existing actions',()=>{
 const {button,counts}=render();button.props.onPress();button.props.onLongPress();assert.deepEqual(counts(),[1,1]);
 const text=button.children.find(c=>c?.type==='Text');assert.equal(text.children.join(''),'RESERVAR');assert.equal(text.props.numberOfLines,1);assert.equal(text.props.adjustsFontSizeToFit,true);
 assert.equal(text.props.style.textAlign,'center');assert.equal(text.props.style.textAlignVertical,'center');assert.equal(button.props.style.alignItems,'center');assert.equal(button.props.style.justifyContent,'center');
});
test('the real Inter Black glyph widths fit the unchanged 104-point iPhone button',()=>{
 const font=fs.readFileSync('node_modules/@expo-google-fonts/inter/900Black/Inter_900Black.ttf'),tables={};
 for(let i=0;i<font.readUInt16BE(4);i++){const p=12+16*i;tables[font.toString('ascii',p,p+4)]=font.readUInt32BE(p+8);}
 const units=font.readUInt16BE(tables.head+18),metrics=font.readUInt16BE(tables.hhea+34),cmap=tables.cmap;let sub;
 for(let i=0;i<font.readUInt16BE(cmap+2);i++){const at=cmap+font.readUInt32BE(cmap+4+8*i+4);if(font.readUInt16BE(at)===4){sub=at;break;}}assert.ok(sub);
 const segments=font.readUInt16BE(sub+6)/2;
 const width=(value,size,spacing)=>[...value].reduce((sum,char)=>{const code=char.codePointAt(0);let glyph=0;for(let i=0;i<segments;i++){
  const end=font.readUInt16BE(sub+14+2*i),start=font.readUInt16BE(sub+16+2*segments+2*i);if(code<start||code>end)continue;
  const delta=font.readInt16BE(sub+16+4*segments+2*i),pos=sub+16+6*segments+2*i,range=font.readUInt16BE(pos);
  glyph=range?font.readUInt16BE(pos+range+2*(code-start)):(code+delta)&65535;if(range&&glyph)glyph=(glyph+delta)&65535;break;
 }assert.ok(glyph);return sum+font.readUInt16BE(tables.hmtx+4*Math.min(glyph,metrics-1))/units*size+spacing;},0);
 const {button}=render(),label=button.children.find(c=>c?.type==='Text'),s=button.props.style,p=label.props;
 const available=s.minWidth-2*s.paddingHorizontal-2*s.borderWidth;
 assert.ok(width('RESERVAR',p.style.fontSize,p.style.letterSpacing)<=available,'Fits without shrinking at the minimum actual width');
 assert.ok(width('RESERVAR',p.style.fontSize*p.maxFontSizeMultiplier*p.minimumFontScale,p.style.letterSpacing)<=available,'Fits at the permitted system font multiplier using local text fitting');
 assert.equal(s.height,52);assert.equal(s.backgroundColor,'#C8A037');
});
