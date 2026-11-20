import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];
(function visit(n){all.push(n);ts.forEachChild(n,visit);})(ast);
const declaration=name=>all.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);
const fn=name=>all.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.children??n.props?.children)]:[];
function swipe(){
 const refs=[],animations=[],timers=[],commands=[],calls=[];let index=0;
 const React={createElement:(type,props,...children)=>({type,props:{...props,children:children.flat(Infinity)},children:children.flat(Infinity)}),Children:{map:(n,f)=>n==null?null:(Array.isArray(n)?n:[n]).map(f)},isValidElement:n=>!!n&&typeof n==='object'&&'type' in n,cloneElement:(n,p)=>({...n,props:{...n.props,...p},children:p.children??n.children})};
 class Value{setValue(n){commands.push(n);}stopAnimation(fn){fn();}interpolate(){return 0;}}
 const Gesture={Pan(){const data={};const chain=new Proxy(data,{get:(o,k)=>k in o?o[k]:(...a)=>{o[k]=k.startsWith('on')?a[0]:a;return chain;}});return chain;},Native:()=>({}),Simultaneous:(pan,native)=>({pan,native})};
 const context={exports:{},React,useRef:v=>{const i=index++;return refs[i]??(refs[i]={current:v});},useMemo:f=>f(),Animated:{Value,View:'AnimatedView',timing:()=>({start:f=>animations.push(f)}),spring:()=>({start(){}})},Gesture,GestureDetector:'GestureDetector',View:'View',Text:'Text',Feather:'Feather',StyleSheet:{absoluteFill:{}},setTimeout:f=>timers.push(f)};
 vm.runInNewContext(compile(fn('SwipeableRow').getText(ast)+';exports.Row=SwipeableRow;'),context);
 const props={onSwipeLeft:()=>calls.push('left-original'),onSwipeRight:()=>calls.push('right'),children:React.createElement('Pressable',{testID:'card',onPress:()=>calls.push('open'),onLongPress:()=>calls.push('long')},React.createElement('TouchableOpacity',{testID:'trash',onPress:()=>calls.push('trash')}))};
 const render=extra=>{index=0;const tree=context.exports.Row({...props,...extra});return{tree,pan:nodes(tree).find(n=>n.type==='GestureDetector').props.gesture.pan,press:id=>nodes(tree).find(n=>n.props.testID===id).props.onPress()};};
 return{render,animations,timers,calls,commands};
}
test('one left swipe owns its release, dispatches once and permits a genuinely new tap',()=>{
 const f=swipe(),row=f.render(),p=row.pan;
 assert.deepEqual(Array.from(p.activeOffsetX[0]),[-8,8]);assert.deepEqual(Array.from(p.failOffsetY[0]),[-15,15]);assert.equal(p.cancelsTouchesInView[0],true);
 p.onBegin();p.onStart();p.onUpdate({translationX:-60});p.onEnd({translationX:-60,velocityX:0},true);p.onEnd({translationX:-60,velocityX:0},true);p.onFinalize({},true);
 row.press('card');row.press('trash');assert.deepEqual(f.calls,[]);assert.equal(f.animations.length,1);
 f.animations[0]({finished:true});f.animations[0]({finished:true});assert.deepEqual(f.calls,['left-original']);row.press('card');assert.equal(f.calls.length,1);
 p.onBegin();row.press('card');assert.deepEqual(f.calls,['left-original','open']);
 p.onBegin();row.press('trash');assert.deepEqual(f.calls,['left-original','open','trash']);
});
test('cancelled/vertical gestures retain thresholds and stale animations cannot delete a neighbouring row',()=>{
 const f=swipe(),r=f.render(),p=r.pan;p.onBegin();p.onFinalize({},false);assert.equal(f.animations.length,0);
 p.onBegin();p.onStart();p.onEnd({translationX:-70,velocityX:0},false);p.onFinalize({},false);assert.equal(f.animations.length,0);
 p.onBegin();p.onStart();p.onEnd({translationX:-70,velocityX:0},true);p.onFinalize({},true);
 const next=f.render({onSwipeLeft:()=>f.calls.push('different-row')});next.pan.onBegin();f.animations[0]({finished:true});assert.deepEqual(f.calls,[]);next.press('card');assert.deepEqual(f.calls,['open']);
});
test('a completed swipe retains the original row callback through a render and ignores interrupted animations',()=>{
 const f=swipe(),r=f.render();r.pan.onBegin();r.pan.onStart();r.pan.onEnd({translationX:-70,velocityX:0},true);r.pan.onFinalize({},true);
 f.render({onSwipeLeft:()=>f.calls.push('different-row')});f.animations[0]({finished:true});assert.deepEqual(f.calls,['left-original']);
 const g=swipe(),row=g.render();row.pan.onBegin();row.pan.onStart();row.pan.onEnd({translationX:-70,velocityX:0},true);g.animations[0]({finished:false});assert.deepEqual(g.calls,[]);
});
test('first removal and all second-removal routes share the existing personal operation',()=>{
 const e={id:'cancelled',ownerUserId:'A',estado:'aceptado',bookingStatus:'cancelada'},calls=[],scope={exports:{},actionCompletion:{isDiscarded:()=>false},retirePersonalEntry:r=>calls.push(['retire',r.id]),resolveEntry:(r,status)=>calls.push([status,r.id])};
 vm.runInNewContext(compile('const '+declaration('removeListEntry').getText(ast)+';exports.remove=removeListEntry;'),scope);
 scope.exports.remove(e);assert.deepEqual(calls,[['discard',e.id]]);
 for(const row of [{...e,deleted:true},{...e,estado:'rechazado'}])scope.exports.remove(row);
 scope.actionCompletion.isDiscarded=()=>true;scope.exports.remove(e);assert.deepEqual(calls.slice(1),Array(3).fill(['retire',e.id]));
 const sw=all.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='onSwipeLeft');assert.equal(sw.initializer.getText(ast),'() => removeListEntry(g)');
 const detail=fn('renderListBookingDetail').getText(ast);assert.match(detail,/onDiscard=.*removeListEntry\(entry\)/);assert.match(detail,/detail",1,inTrash&&canRemove\?\(\)=>removeListEntry\(entry\)/);
 const lookup=declaration('listBookingDetail').getText(ast);assert.match(lookup,/mergeCompletionEntries\(goLog,filteredListEntries\)/);
});
