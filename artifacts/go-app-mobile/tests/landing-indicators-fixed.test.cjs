const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const req=createRequire(path.join(process.cwd(),'package.json')),ts=req('typescript');
const component='components/landing/LandingContentViewport.tsx';
const react={createElement:(type,props,...children)=>({type,props:props||{},children})};
const scope={exports:{},require:name=>name==='react'?react:name==='react-native'?{ScrollView:'ScrollView',View:'View',StyleSheet:{absoluteFill:{position:'absolute',top:0,left:0,right:0,bottom:0}}}:undefined};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(component,'utf8'),{compilerOptions:{ alwaysStrict: false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,scope);
const api=scope.exports;
const body={id:'existing-card-and-actions'},style={gap:12};
const render=()=>api.LandingCardContents({overflowing:false,onHeight(){},contentContainerStyle:style,children:body});

test('bounded Landing cards disable native iOS rubber-band bounce',()=>assert.equal(render().props.bounces,false));
test('short Landing cards cannot be dragged vertically merely because they are vertical ScrollViews',()=>assert.equal(render().props.alwaysBounceVertical,false));
test('the internal card cannot paint outside its scroll bounds',()=>assert.equal(render().props.style.overflow,'hidden'));
test('Android overscroll is also disabled without a global gesture handler',()=>assert.equal(render().props.overScrollMode,'never'));
test('long card contents remain accessible and keep their exact actions and measurement',()=>{
 const seen=[],tree=api.LandingCardContents({overflowing:false,onHeight:n=>seen.push(n),contentContainerStyle:style,children:body});
 assert.equal(tree.type,'ScrollView');assert.equal(tree.props.scrollEnabled,undefined,'real content overflow remains scrollable');
 assert.equal(tree.props.style.flexGrow,0);assert.equal(tree.props.style.flexShrink,1);
 assert.equal(tree.props.contentContainerStyle,style);assert.equal(tree.children[0],body);
 assert.equal(tree.props.directionalLockEnabled,true);assert.equal(tree.props.showsVerticalScrollIndicator,false);
 tree.props.onContentSizeChange(354,500);assert.deepEqual(seen,[500]);
});
test('natural-height content keeps its existing non-scrolling rendering and measurement',()=>{
 const seen=[],tree=api.LandingCardContents({overflowing:true,onHeight:n=>seen.push(n),contentContainerStyle:style,children:body});
 assert.equal(tree.type,'View');assert.equal(tree.props.style,style);assert.equal(tree.children[0],body);
 tree.props.onLayout({nativeEvent:{layout:{height:480}}});assert.deepEqual(seen,[480]);
});
test('the top-level Landing viewport stays fixed even if an old frame requests scrolling',()=>{
 for(const virtual of [false,true]){
  const frame={virtual,scroll:true,left:18,top:90,width:354,height:210,contentHeight:900,baseline:350};
  const tree=api.LandingContentViewport({frame,closingGesture:{},children:body});
  assert.equal(tree.type,'View');assert.equal(tree.props.pointerEvents,'box-none');
  assert.equal(tree.props.onScroll,undefined);assert.equal(tree.props.style.transform,undefined);
  if(virtual){assert.equal(tree.props.style.left,18);assert.equal(tree.props.style.top,90);assert.equal(tree.props.style.height,210);assert.equal(tree.children[0].props.style.height,210);}
  else assert.equal(tree.children[0],body);
 }
});
test('the three minimized commands have no scrollable or moving ancestor in Home',()=>{
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const commands=[];function walk(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='LandingPanelCommands')commands.push(n);ts.forEachChild(n,walk);}walk(ast);
 assert.equal(commands.length,1);const ancestorNames=[];
 for(let n=commands[0].parent;n;n=n.parent)if(ts.isJsxElement(n))ancestorNames.push(n.openingElement.tagName.getText(ast));
 assert.ok(ancestorNames.includes('LandingContentViewport'));
 for(const name of ['ScrollView','Animated.ScrollView','KeyboardAwareScrollView','LandingCardContents'])assert.ok(!ancestorNames.includes(name),name);
});
