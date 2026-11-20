import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';const require=createRequire(import.meta.url),ts=require('typescript');
const source=fs.readFileSync('components/empresa/EmpresaConfigScreen.tsx','utf8'),ast=ts.createSourceFile('config.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let declaration;function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='revealNameField')declaration=n;ts.forEachChild(n,walk)}walk(ast);
function fixture(){const calls=[],bounds={top:200,height:300},input={y:240,height:40,focused:true,isFocused(){return this.focused},measureInWindow(fn){fn(0,this.y,200,this.height)}};const scope={exports:{},useCallback:fn=>fn,activeNewInput:{current:null},activeReveal:{current:null},revealSequence:{current:0},scrollOffset:{current:80},scrollRef:{current:{measureInWindow:fn=>fn(0,bounds.top,350,bounds.height),scrollTo:p=>calls.push(p)}}};vm.runInNewContext(ts.transpileModule('const '+declaration.getText(ast)+';exports.reveal=revealNameField;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);return{...scope,input,bounds,calls}}
test('repeated layouts while the name is visible never scroll or animate the form',()=>{const f=fixture();for(let i=0;i<20;i++)f.exports.reveal(f.input);assert.equal(f.calls.length,0)});
test('an obscured name is revealed minimally once and stays put on subsequent layouts',()=>{const f=fixture();f.input.y=490;f.input.height=50;f.exports.reveal(f.input);assert.equal(f.calls.length,1);assert.equal(f.calls[0].y,132);assert.equal(f.calls[0].animated,false);f.input.y-=52;for(let i=0;i<20;i++)f.exports.reveal(f.input);assert.equal(f.calls.length,1)});
test('late measurements cannot move the form after focus has left the name',()=>{const f=fixture();let callback;f.input.measureInWindow=fn=>callback=fn;f.exports.reveal(f.input);f.input.focused=false;callback(0,700,200,40);assert.equal(f.calls.length,0)});

const {React,createRoot,document}=require('./helpers/react-lifecycle.cjs');
let nameStep;function findName(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='StepNombre')nameStep=n;ts.forEachChild(n,findName)}findName(ast);
async function mountName(initial=''){
 const model={config:{businessName:initial},updateConfig:patch=>writes.push(patch.businessName)},writes=[];let input;
 const host=p=>React.createElement('div',{},p.children);
 const context={exports:{},React,useState:React.useState,useEffect:React.useEffect,useRef:React.useRef,useBusinessConfig:()=>model,useLanguage:()=>({t:k=>k}),View:host,Text:host,TextInput:p=>{input=p;return React.createElement('input',{})},c:{},DIM:'#888'};
 vm.runInNewContext(ts.transpileModule(nameStep.getText(ast)+';exports.Step=StepNombre;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,context);
 const root=createRoot(document.createElement('div'));const render=()=>React.act(()=>root.render(React.createElement(context.exports.Step)));
 await render();return{get input(){return input},writes,type:async value=>React.act(()=>input.onChangeText(value)),ack:async value=>{model.config={businessName:value};await render()},close:async()=>React.act(()=>root.unmount())};
}
test('rapid name edits stay immediate while earlier queued saves are acknowledged',async()=>{
 const f=await mountName();try{
  for(const value of ['P','PE','PELUQUERÍA']){await f.type(value);assert.equal(f.input.value,value)}
  for(const previous of ['P','PE']){await f.ack(previous);assert.equal(f.input.value,'PELUQUERÍA')}
  await f.ack('PELUQUERÍA');assert.equal(f.input.value,'PELUQUERÍA');assert.deepEqual(f.writes,['P','PE','PELUQUERÍA']);
  await f.type('PELUQUERÍA NORTE');await f.type('PELUQUERÍA SUR');await f.ack('PELUQUERÍA NORTE');assert.equal(f.input.value,'PELUQUERÍA SUR');
  await f.ack('PELUQUERÍA SUR');await f.ack('Otro nombre externo');assert.equal(f.input.value,'Otro nombre externo');
 }finally{await f.close()}
});
test('deleting and editing the middle preserve exact text without forcing selection',async()=>{
 const f=await mountName('Salón Norte');try{
  await f.type('Salón Sur');await f.type('');await f.ack('Salón Sur');assert.equal(f.input.value,'');await f.ack('');assert.equal(f.input.value,'');assert.equal(f.input.selection,undefined);assert.equal(f.input.autoCorrect,false);
 }finally{await f.close()}
 const other=await mountName('Otra empresa');try{assert.equal(other.input.value,'Otra empresa')}finally{await other.close()}
});
