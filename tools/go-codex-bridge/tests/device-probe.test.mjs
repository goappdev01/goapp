import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function probe(fetchImpl){
  const saved=new Map(),context=vm.createContext({URL,Date,TextDecoder,AbortController,Uint8Array,Promise,Set,Math,JSON,Error,
    setTimeout,clearTimeout,fetch:fetchImpl,localStorage:{setItem(k,v){saved.set(k,v);},getItem(k){return saved.get(k);}},navigator:{userAgent:'Mozilla iPhone'}});
  vm.runInContext(readFileSync(new URL('../device-probe.js',import.meta.url),'utf8'),context);
  return{context,saved,run:()=>vm.runInContext(`GODeviceProbe.run({origin:'http://100.64.0.1:8089',expected_name:'GO App · COMPROBACIONES · 8089'},()=>{},localStorage)`,context)};
}

test('a blocked Metro request produces a finite partial Safari diagnosis',async()=>{
  const p=probe(async()=>{throw Error('synthetic network denied');});
  const report=await p.run();
  assert.equal(report.browser_iphone,true);
  assert.equal(report.stages[0].ok,true);
  assert.equal(report.stages[1].ok,false);
  assert.match(report.stages[1].error,/denied/);
  assert.equal(report.stages.some(x=>x.key==='manifest'),false);
  assert.equal(JSON.stringify(vm.runInContext('GODeviceProbe.current().stages.map(x=>x.key)',p.context)),JSON.stringify(report.stages.map(x=>x.key)));
});

test('an incomplete manifest is preserved and later download phases are not misreported',async()=>{
  const p=probe(async(url)=>{
    if(url.endsWith('/status'))return new Response('packager-status:running',{status:200});
    return new Response('{"extra":{}}',{status:200});
  });
  const report=await p.run();
  assert.equal(report.stages.find(x=>x.key==='metro').ok,true);
  assert.equal(report.stages.find(x=>x.key==='manifest').ok,false);
  assert.equal(report.stages.some(x=>x.key==='bundle'),false);
  assert.equal(vm.runInContext('GODeviceProbe.current().origin',p.context),'http://100.64.0.1:8089');
});

test('copy action and bounded states are present in the served page source',()=>{
  const html=readFileSync(new URL('../device-probe.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('../device-probe.js',import.meta.url),'utf8');
  assert.match(html,/COPIAR DIAGNÓSTICO/);
  assert.match(js,/TOTAL_MS=75000/);
  assert.match(js,/REQUEST_MS=12000/);
  assert.match(js,/no verificable/);
});
