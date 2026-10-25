import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import path from 'node:path';
const ts=createRequire(path.join(process.cwd(),'package.json'))('typescript'),source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(n,p){if(p(n))return n;let result;ts.forEachChild(n,c=>{if(!result)result=find(c,p);});return result;}
const search=find(ast,n=>ts.isArrowFunction(n)&&n.body.getText(ast).startsWith('{\n        const panelBottom = kbHeight'));
assert.ok(search,'exercise the actual existing orbital search');
const code=ts.transpileModule('exports.render='+search.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const nodes=(n,p)=>n&&typeof n==='object'?[...(p(n)?[n]:[]),...(n.children??[]).flatMap(c=>nodes(c,p))]:[];
const text=n=>typeof n==='string'?n:(n?.children??[]).map(text).join('');
function fixture({keyboard=0,height=844,query=''}={}){
 const calls=[],scope={exports:{},React:{createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)})},View:'View',Text:'Text',TextInput:'TextInput',TouchableOpacity:'TouchableOpacity',ScrollView:'ScrollView',Feather:'Feather',GoCloseButton:'GoCloseButton',Math,
  kbHeight:keyboard,screen:{height},insets:{top:47,bottom:34},goSearchCtrlH:124,lang:'es',goSearchSub:{id:'peluqueria',label:'Peluquería',icon:'scissors',color:'#eab308'},goSearchBusinesses:[{id:'salon',name:'Salón registrado',location:'Dirección configurada'}],demoBookingRepository:undefined,goSearchQuery:query,goSearchFilter:'sugeridos',
  Keyboard:{dismiss:()=>{scope.kbHeight=0;calls.push(['keyboard']);}},Haptics:{impactAsync:async()=>{},ImpactFeedbackStyle:{Medium:'medium'}},
  setGoSearchQuery:q=>{scope.goSearchQuery=q;},setGoSearchCtrlH:h=>scope.goSearchCtrlH=h,
 };
 for(const name of ['setGoSearchOpen','setGoSearchSub','setGoSearchFilter','setReservasOrbitalOpen','setReservasOrbitalCat','setReservasOrbitalPage','setGoProveedorOpen','setGoProveedorData','setDemoInitialBusinessId','setCalOpen','setShowBookingFromCal'])scope[name]=value=>calls.push([name,value]);
 vm.runInNewContext(code,scope);return{calls,scope,render:()=>scope.exports.render()};
}
for(const [height,keyboard]of [[844,0],[844,300],[667,291],[568,260]])test(`${height}/${keyboard}: orbital business search keeps its title/input, scrollable results and a close control above the keyboard`,()=>{
 const f=fixture({height,keyboard}),tree=f.render(),heading=nodes(tree,n=>n.props.testID==='landing-search-heading')[0],input=nodes(tree,n=>n.type==='TextInput')[0],results=nodes(tree,n=>n.props.testID==='landing-search-results')[0],close=nodes(tree,n=>n.props.testID==='landing-search-floating-close')[0];
 assert.equal(text(heading),'Busca tu empresa');assert.equal(heading.props.style.color,'#ffffff');assert.equal(input.props.style.color,'#fff');
 const field=nodes(tree,n=>n.children?.includes(input))[0];assert.equal(field.props.style.borderColor,'#ffffff');assert.ok(field.props.style.paddingRight>=64);
 assert.equal(results.props.keyboardShouldPersistTaps,'handled');assert.equal(results.props.keyboardDismissMode,'on-drag');assert.ok(results.props.style.maxHeight>=44);
 assert.ok(close.props.style.bottom>=keyboard);assert.equal(nodes(tree,n=>n.type==='GoCloseButton').length,1);
 input.props.onChangeText('Salón');f.scope.Keyboard.dismiss();const next=f.render();assert.equal(nodes(next,n=>n.type==='TextInput')[0].props.value,'Salón');
});
test('the actual search result selects the configured business without inventing data, and no results has the requested message',async()=>{
 const f=fixture({keyboard:300,query:'Salón'}),tree=f.render(),result=nodes(tree,n=>n.type==='TouchableOpacity'&&text(n).includes('Salón registrado'))[0];assert.ok(result);await result.props.onPress();
 const provider=f.calls.find(c=>c[0]==='setGoProveedorData')[1];assert.equal(provider.businessId,'salon');assert.equal(provider.name,'Salón registrado');assert.equal(provider.phone,'');assert.ok(f.calls.some(c=>c[0]==='setGoProveedorOpen'&&c[1]));
 f.scope.goSearchQuery='No existe';assert.ok(text(f.render()).includes('No encontramos esa empresa.'));
});
test('both booking exits preserve the exact booking ID and real route selects the date/month without writing preferences',()=>{
 const callback=find(ast,n=>ts.isJsxAttribute(n)&&n.name.getText(ast)==='onGoToBooking'&&n.initializer?.getText(ast).includes('setCalScrollToDateTarget'))?.initializer.expression;assert.ok(callback);
 const calls=[],scope={exports:{},Date,setShowBookingFromCal:v=>calls.push(['closed',v]),setDateISODraft:v=>calls.push(['day',v]),setCalBgViewMonth:v=>calls.push(['month',v]),setCalOpen:v=>calls.push(['open',v]),setCalScrollToDateTarget:v=>calls.push(['target',v]),setCalHighlightEntryId:v=>calls.push(['highlight',v])};
 vm.runInNewContext(ts.transpileModule('exports.go='+callback.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,scope);
 scope.exports.go('2031-12-28','11:37','exact-booking-id');const target=calls.find(c=>c[0]==='target')[1];assert.equal(target.entryId,'exact-booking-id');assert.equal(target.dateISO,'2031-12-28');assert.ok(calls.some(c=>c[0]==='month'&&c[1]==='2031-12'));
 const wrapper=fs.readFileSync('components/booking/GoProveedorReservaSheet.tsx','utf8');assert.equal(wrapper.split('props.onBookingConfirmed?.(dateISO, time,entryId)').length-1,2);
});
