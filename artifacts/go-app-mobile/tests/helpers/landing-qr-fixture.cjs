const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ts=require(require.resolve('typescript',{paths:[process.cwd()]}));
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
function walk(n){nodes.push(n);ts.forEachChild(n,walk)}walk(ast);
const decl=name=>nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);
const transpile=s=>ts.transpileModule(s,{compilerOptions:{alwaysStrict:false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const load=file=>{const exports={};new Function('exports',transpile(fs.readFileSync(file,'utf8')))(exports);return exports;};
const layout=load('components/landing/landingResponsiveLayout.ts'),panels=load('components/landing/landingPanels.ts'),arc=load('components/landing/landingLowerArc.ts'),humanity=load('components/landing/humanityPlacement.ts'),policy=load('components/landing/landingV1Visibility.ts'),qr=load('components/landing/landingQrPlacement.ts');
const names=['landingSafeTop','landingBaseFrame','landingPanels','toLandingRootRect','humanityBlocks','humanityPanelsMeasured','humanityPlacement','landingInlineHumanity','inlineHumanityWidth','inlineHumanityRect','landingFrame','landingArrangement','landingOffsetY','landingDisplayCloseRect','landingQrPosition'];
const code=transpile([source.slice(decl('landingOrbitTop').parent.parent.getStart(ast),decl('landingBaseline').parent.parent.end),...names.map(n=>'const '+decl(n).getText(ast)+';'),
 'result={'+[...names,'landingCenter','landingOrbitObstacles','closeQrSize','closeQrHit','closeQrX','closeQrY'].join(',')+'};'].join('\n'));
const qrNode=nodes.find(n=>ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(p=>p.name?.getText(ast)==='key'&&p.initializer?.text==='qr-permanent-btn'));
let expression=qrNode;while(!ts.isJsxExpression(expression))expression=expression.parent;
const renderCode=transpile('resultButton='+expression.expression.getText(ast)+';');
const devices=[{width:320,height:568,insets:{top:20,bottom:0,left:0,right:0}},{width:375,height:667,insets:{top:20,bottom:0,left:0,right:0}},{width:390,height:844,insets:{top:47,bottom:34,left:0,right:0}},{width:430,height:932,insets:{top:59,bottom:34,left:0,right:0}},{width:844,height:390,insets:{top:0,bottom:21,left:44,right:44}}];
function fixture(d,preset='estandar',profile='ADMIN',handedness='right',overrides={}){
 const scale=layout.fitLandingScale(preset,d.width,d.height,d.insets),orbitRadius=Math.round(99*scale),orbitBtnSize=Math.round(65*scale),microR=orbitRadius+Math.round(35*scale),microSz=Math.round(50*scale),goSize=Math.round(128*scale),orbitWrapSize=2*(orbitRadius+orbitBtnSize/2)+12,systemBoundingRadius=Math.max(orbitRadius+orbitBtnSize/2,microR+microSz/2),dockRight=preset==='estandar'?-1:5;
 const dock=layout.landingDockBounds({...d,dockRight,boundingRadius:systemBoundingRadius,wrapSize:orbitWrapSize,satelliteRadius:microR,satelliteSize:microSz,visibleSatelliteKeys:Object.keys(layout.LANDING_SATELLITE_DEGREES),orbitRadius,orbitButtonSize:orbitBtnSize,orbitCount:8,orbitVisible:true,goSize});
 const ctx={...layout,...panels,...arc,...humanity,...policy,...qr,screen:d,insets:d.insets,goSize,orbitRadius,orbitBtnSize,microR,microSz,orbitWrapSize,systemBoundingRadius,dockRight,
  handedness,maxX:dock.maxX,minX:dock.minX,landingDock:dock,SYSTEM_MARGIN_Y:6,uiScaleFactor:scale,INTENTS:Array(7).fill({}),isUserV1Surface:profile!=='ADMIN',fullLandingArchitecture:profile==='ADMIN',bottomReserved:d.insets.bottom+4+(preset==='compacto'?2:preset==='estandar'?6:12),titleBottomLocalY:null,ACTION_TOP_Y:d.insets.top+151,posReady:true,kbHeight:0,orbitSecondLevel:null,reservasOrbitalOpen:false,anyOverlayOpen:false,rutasMode:false,landingNextHeight:260,landingPendingHeight:220,landingPendingOffset:8,anyOperationalPanelOpen:true,landingHelpBottom:400,landingHelpH:20,landingHasNext:true,nextAptMinimized:false,transportPanelH:160,useMemo:fn=>fn(),Math,result:null,...overrides};
 vm.runInNewContext(code,ctx);
 let captured;const effects=[];
 const render=(overlay=false)=>{vm.runInNewContext(renderCode,{...ctx,...ctx.result,anyOverlayOpen:overlay,resultButton:null,React:{createElement:(type,props,...children)=>{const n={type,props,children};if(type==='TouchableOpacity')captured=n;return n;}},TouchableOpacity:'TouchableOpacity',Feather:'Feather',Haptics:{selectionAsync:()=>{effects.push('haptic');return Promise.resolve()}},setQrOpen:open=>effects.push(['qr',open])});return overlay?null:captured;};
 return {...ctx.result,ctx,scale,render,effects,company:{x:ctx.result.landingCenter.x+Math.cos(202.5*Math.PI/180)*microR-Math.max(44,microSz)/2,y:ctx.result.landingCenter.y+ctx.result.landingOffsetY+Math.sin(202.5*Math.PI/180)*microR-Math.max(44,microSz)/2,width:Math.max(44,microSz),height:Math.max(44,microSz)}};
}
module.exports={fixture,devices,source,ast,nodes,decl,qrNode,transpile,load};
