import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const ts=createRequire(import.meta.url)('typescript');
function fixture({expoGo=false,present=true,available=true,onDevice=true,granted=true}={}){
 const listeners=new Map(),options=[],calls=[],events=[];let resolvePermission;
 const native={isRecognitionAvailable:()=>available,supportsOnDeviceRecognition:()=>onDevice,
  requestMicrophonePermissionsAsync:async()=>{calls.push('permission');return{granted,canAskAgain:false};},
  start:args=>{calls.push('start');options.push(args);},stop:()=>calls.push('stop'),abort:()=>calls.push('abort'),
  addListener:(name,fn)=>{listeners.set(name,fn);return{remove:()=>listeners.delete(name)};}};
 const context={exports:{},Error,require:name=>{assert.equal(name,'expo');return{isRunningInExpoGo:()=>expoGo,requireOptionalNativeModule:name=>{assert.equal(name,'ExpoSpeechRecognition');return present?native:null;}};}};
 vm.runInNewContext(ts.transpileModule(readFileSync('lib/deviceSpeechRecognition.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 const port=context.exports.createDeviceSpeechRecognition('es-ES'),callbacks={started:()=>events.push('start'),partial:text=>events.push(['partial',text]),ended:text=>events.push(['end',text]),failed:message=>events.push(['error',message])};
 return{port,native,listeners,options,calls,events,callbacks,emit:(name,event)=>listeners.get(name)?.(event)};
}
test('Expo Go, missing module and unavailable offline recognition are honest dependencies, without requesting permissions or capture',async()=>{
 for(const [options,pattern] of [[{expoGo:true},/Expo Go/],[{present:false},/no incluye/],[{onDevice:false},/reconocimiento local/],[{available:false},/reconocimiento local/]]){
  const f=fixture(options);await assert.rejects(()=>f.port.start(f.callbacks),pattern);assert.equal(f.calls.includes('permission'),false);assert.equal(f.calls.includes('start'),false);
 }
});
test('native permission is asked only on GO; denial cannot start recording or a network fallback',async()=>{
 const f=fixture({granted:false});assert.equal(f.calls.length,0);await assert.rejects(()=>f.port.start(f.callbacks),/ajustes/);assert.deepEqual(f.calls,['permission']);
});
test('compiled local recognizer uses offline mode, emits final text once, and releases all listeners',async()=>{
 const f=fixture();await f.port.start(f.callbacks);f.emit('start');f.emit('result',{isFinal:false,results:[{transcript:'Un mensaje'}]});
 assert.equal(f.events.some(e=>Array.isArray(e)&&e[0]==='end'),false);
 f.port.stop();assert.ok(f.calls.includes('stop'));f.emit('result',{isFinal:true,results:[{transcript:'Un mensaje final'}]});const end=f.listeners.get('end');end();end();
 assert.equal(f.events.filter(e=>Array.isArray(e)&&e[0]==='end').length,1);assert.deepEqual(f.events.at(-1),['end','Un mensaje final']);
 assert.equal(f.options[0].requiresOnDeviceRecognition,true);assert.equal(f.options[0].recordingOptions.persist,false);assert.equal(f.options[0].lang,'es-ES');assert.equal(f.listeners.size,0);
});
test('abort, errors and late permissions never send old or partial-only transcripts',async()=>{
 const f=fixture();await f.port.start(f.callbacks);const old=f.listeners.get('end');f.port.abort();old();assert.equal(f.events.length,0);
 await f.port.start(f.callbacks);f.emit('result',{isFinal:false,results:[{transcript:'No confirmado'}]});f.emit('error',{error:'network'});f.emit('end');assert.equal(f.events.some(e=>Array.isArray(e)&&e[0]==='end'),false);assert.equal(f.listeners.size,0);
 let release;f.native.requestMicrophonePermissionsAsync=()=>new Promise(resolve=>release=resolve);const pending=f.port.start(f.callbacks);f.port.abort();release({granted:true});await pending;assert.equal(f.listeners.size,0);
});
