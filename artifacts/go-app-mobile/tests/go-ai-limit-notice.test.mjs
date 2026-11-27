import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";

const require=createRequire(import.meta.url),ts=require("typescript");
const read=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
function load(file,modules={}){
  const context={exports:{},require:name=>{assert.ok(name in modules,"Unexpected dependency: "+name);return modules[name];}};
  vm.runInNewContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);
  return context.exports;
}
const {translations}=load("i18n/translations.ts"),colors=load("constants/colors.ts").default;
const {generateTesoTheme}=load("theme/tesoThemeEngine.ts");
const approved={es:"GO IA puede cometer errores. Comprueba la información importante antes de tomar decisiones.",en:"GO AI can make mistakes. Check important information before making decisions."};
function render({lang="es",scheme="light",theme=null,uiScale="estandar",dismissible=false,visible=true,appearance,state}={}){
  const react={useState:value=>[state?.dismissed??value,next=>{if(state)state.dismissed=next;}],useEffect:()=>{},createElement:(type,props,...children)=>({type,props:{...props,children}})};
  return load("components/booking-assistant/GoAiLimitNotice.tsx",{
    react,"react-native":{Text:"Text",View:"View",TouchableOpacity:"TouchableOpacity",useColorScheme:()=>scheme},
    "@/constants/colors":{default:colors,__esModule:true},
    "@/contexts/LanguageContext":{useLanguage:()=>({lang,t:key=>translations[lang][key]})},
    "@/theme/TesoThemeContext":{useTesoThemeOptional:()=>theme},
  }).GoAiLimitNotice({uiScale,dismissible,visible,appearance});
}

test("central entry warning has a real close action, leaves no spacer, and matches the light conversation even on dark iOS",()=>{
 const state={dismissed:false},props={state,dismissible:true,scheme:"dark",appearance:"light"};
 const tree=render(props),button=tree.props.children.find(node=>node?.type==="TouchableOpacity");
 assert.equal(tree.props.style.backgroundColor,colors.light.background);assert.ok(button.props.style.minHeight>=44);
 button.props.onPress();assert.equal(render(props),null);assert.equal(render({visible:false}),null);
});

test("the permanent notice uses the approved copy in both implemented languages without interactive or network dependencies",()=>{
  for(const lang of Object.keys(approved)){
    const tree=render({lang}),text=tree.props.children[0];
    assert.equal(text.type,"Text");assert.equal(text.props.children.join(""),approved[lang]);
    assert.equal(tree.props.pointerEvents,"none");assert.equal(tree.props.onPress,undefined);
    assert.equal(text.props.accessible,true);assert.equal(text.props.accessibilityRole,"text");
  }
});

test("font enlargement can wrap freely without clipping or shrinking the warning",()=>{
  for(const uiScale of ["compacto","estandar","grande"]){
    const tree=render({uiScale}),text=tree.props.children[0];
    assert.ok(text.props.style.fontSize>=13);
    assert.equal(text.props.allowFontScaling,true);assert.equal(text.props.maxFontSizeMultiplier,0);
    for(const key of ["numberOfLines","adjustsFontSizeToFit","ellipsizeMode"])assert.equal(text.props[key],undefined);
    for(const style of [tree.props.style,text.props.style])for(const key of ["height","maxHeight","overflow"])assert.equal(style[key],undefined);
  }
  assert.ok(render({uiScale:"grande"}).props.children[0].props.style.fontSize>render().props.children[0].props.style.fontSize);
});

function luminance(hex){
  const channels=hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
  return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
}
test("existing light, dark and optional theme palettes keep readable text contrast",()=>{
  const configs=[{scheme:"light"},{scheme:"dark"}];
  for(const category of ["BEAUTY","WELLNESS","HEALTH","TECHNOLOGY"])
    configs.push({theme:generateTesoTheme({category,targetAge:"OLDER",targetGender:"NEUTRAL"})});
  for(const config of configs){
    const tree=render(config),style=tree.props.children[0].props.style;
    const values=[luminance(style.color),luminance(tree.props.style.backgroundColor)].sort((a,b)=>a-b);
    assert.ok((values[1]+0.05)/(values[0]+0.05)>=4.5,JSON.stringify(config));
    if(config.theme)assert.equal(style.fontSize,Math.round(13*config.theme.typography.scale));
  }
});

function elements(node,result=[]){
  if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node))result.push(node);
  ts.forEachChild(node,child=>{elements(child,result);});return result;
}
const opening=node=>ts.isJsxElement(node)?node.openingElement:node;
test("one unconditional notice stays below the input, outside scrolling content and inside the measured protected footer",()=>{
  const file=ts.createSourceFile("screen.tsx",read("components/booking-assistant/BookingAssistantScreen.tsx"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const notices=elements(file).filter(node=>opening(node).tagName.getText(file)==="GoAiLimitNotice");
  assert.equal(notices.length,1);
  const notice=notices[0],footer=notice.parent;assert.ok(ts.isJsxElement(footer));
  assert.match(opening(footer).getText(file),/onLayout=.*setFooterHeight/);
  const siblings=footer.children.filter(node=>!ts.isJsxText(node));
  const index=siblings.indexOf(notice);assert.ok(index>0);
  assert.equal(elements(siblings[index-1]).filter(node=>opening(node).tagName.getText(file)==="TextInput").length,1);
  assert.match(siblings[index+1].getText(file),/!consultation && dock/);
  for(let parent=notice.parent;parent;parent=parent.parent)
    if(ts.isJsxElement(parent))assert.notEqual(opening(parent).tagName.getText(file),"ScrollView");
  assert.match(file.text,/protectedBottom=\{footerHeight\}/);
  assert.match(file.text,/protectedBottom=\{footerHeight\+\(keyboardVisible\?10:0\)\}/);
});

test("equivalent bilingual terms remain a legal-review draft, and authorization stays an explicit separate action",()=>{
  const terms=readFileSync(new URL("../../../docs/legal/go-ai-terms-draft.md",import.meta.url),"utf8");
  for(const text of Object.values(approved))assert.ok(terms.includes(text));
  assert.match(terms,/Borrador pendiente de validación jurídica/);
  assert.match(terms,/revisión y confirmación expresa antes de ejecutarse/);
  const screen=read("components/booking-assistant/BookingAssistantScreen.tsx");
  assert.match(screen,/onPress=\{\(\) => \{\s*voice.abort\(\);\s*void a.confirm\(\);/);
  assert.match(terms,/no se formula como una exención general de responsabilidad/);
});
