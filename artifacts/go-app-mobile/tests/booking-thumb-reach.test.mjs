import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';const require=createRequire(import.meta.url),{ts}=require('./helpers/react-lifecycle.cjs');
const text=fs.readFileSync('components/booking/BookingSearchOverlay.tsx','utf8'),ast=ts.createSourceFile('booking.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(n,p){if(p(n))return n;let r;ts.forEachChild(n,c=>{if(!r)r=find(c,p)});return r}
function styleFor(predicate,context){const node=find(ast,predicate),style=node.attributes.properties.find(p=>p.name?.getText(ast)==='style').initializer.expression.getText(ast);return vm.runInNewContext(style,context)}
for(const hand of ['left','right'])test('slot order unchanged and thumb alignment '+hand,()=>{
 const style=styleFor(n=>ts.isJsxOpeningElement(n)&&n.tagName.getText(ast)==='View'&&n.attributes.getText(ast).includes('s.slotsGrid'),{s:{slotsGrid:{}},handedness:hand});assert.equal(style[1].justifyContent,hand==='left'?'flex-start':'flex-end');
 assert.match(text,/available.map\(\(sl, idx\)/);assert.match(text,/onPress=\{\(\) => handleSelectSlot\(sl\)\}/);
});
for(const hand of ['left','right'])test('Save stays in its separate lane '+hand,()=>{
 const style=styleFor(n=>ts.isJsxOpeningElement(n)&&n.attributes.getText(ast).includes('testID="booking-services-save-lane"'),{s:{servicesSaveLane:{}},handedness:hand,fontScale:1});assert.equal(style[1].alignItems,hand==='left'?'flex-start':'flex-end');assert.equal(style[1].paddingHorizontal,8);assert.match(text,/servicesNavigationLane: \{ width: 160, height: 80/);
});
test('only USER opts into the lower category dock; ADMIN and all other callers retain the default',()=>{
 const home=fs.readFileSync('app/index.tsx','utf8');assert.match(home,/thumbSearch=\{goView.view === "USER"\}/);assert.match(text,/thumbSearch = false/);assert.match(text,/thumbSearch && searchCategories/);assert.match(text,/!thumbSearch && searchCategories/);assert.match(text,/thumbSearch && \{flexDirection:"column-reverse"\}/);assert.match(text,/thumbSearch \? 104 : 16/);
});
test('one shared maps action sits beside accepted total and retains the old location for other states',()=>{
 const code=fs.readFileSync('components/GoEntryDetails.tsx','utf8');assert.match(code,/<GoEntrySummary entry=\{current\} showMaps=\{false\}/);assert.ok(code.indexOf('<GoEntryMapsAction entry={entry} compact')<code.indexOf('{typeof children === "function" ? children(dismissThen) : children}'));assert.match(code,/minWidth:compact\?64:112,minHeight:compact\?44:52/);assert.match(code,/openEntryMaps\(entry,url=>Linking.openURL\(url\)\)/);assert.match(code,/if\(!entryIsReservation\(entry\)\|\|!entryMapsUrl\(entry\)\)return null/);
});
