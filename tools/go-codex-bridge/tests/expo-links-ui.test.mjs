import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function setup() {
  const elements=new Map();
  class Element {
    attrs={}; textContent='';
    set href(value){this.attrs.href=value;}
    get href(){return this.attrs.href;}
    setAttribute(key,value){this.attrs[key]=value;}
    removeAttribute(key){delete this.attrs[key];}
    addEventListener(){}
  }
  const document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},addEventListener(){}};
  const context=vm.createContext({document,URL,Date,location:{hash:'',pathname:'/remote/',search:''},history:{replaceState(){}},sessionStorage:{getItem(){return null;},setItem(){}},fetch:()=>new Promise(()=>{}),setInterval(){},navigator:{clipboard:{writeText(text){context.copied=text;return Promise.resolve();}}}});
  vm.runInContext(readFileSync(new URL('../remote.js',import.meta.url),'utf8'),context);
  const payload={expires_at:Date.now()/1000+20,links:{
    main:{available:true,port:8088,url:'exp://100.64.0.1:8088'},
    owner:{available:true,port:8089,url:'exp://100.64.0.1:8089'},
  }};
  function render(data){context.payload=data;vm.runInContext('updateExpoLinks(payload)',context);}
  return {elements,payload,render,context};
}

test('two visible labels and exact, distinct native launch destinations',()=>{
  const html=readFileSync(new URL('../remote.html',import.meta.url),'utf8');
  assert.match(html,/ABRIR COLA TERMINADA · 8088/);assert.match(html,/ABRIR COMPROBACIONES · 8089/);
  const {elements,payload,render}=setup();render(payload);
  assert.equal(elements.get('expoMainLink').href,payload.links.main.url);
  assert.equal(elements.get('expoLink').href,payload.links.owner.url);
  assert.notEqual(new URL(elements.get('expoMainLink').href).host,new URL(elements.get('expoLink').href).host);
});

test('a response swapping the two ports cannot create an owner link',()=>{
  const {elements,payload,render}=setup();payload.links.owner.url=payload.links.main.url;render(payload);
  assert.equal(elements.get('expoLink').href,undefined);
  assert.equal(elements.get('expoLink').attrs['aria-disabled'],'true');
  assert.equal(elements.get('expoMainLink').href,payload.links.main.url);
});

test('missing verification, stale status and unavailable server remove previous links',()=>{
  for(const mode of ['missing','expired','unavailable']){
    const {elements,payload,render}=setup();render(payload);
    if(mode==='expired')payload.expires_at=0;
    if(mode==='unavailable')payload.links.owner.available=false;
    render(mode==='missing'?null:payload);
    assert.equal(elements.get('expoLink').href,undefined);
  }
});

test('expired clicks are blocked synchronously; valid clicks preserve Safari user gesture',()=>{
  const {elements,payload,render}=setup();render(payload);
  let prevented=false;
  assert.equal(elements.get('expoLink').onclick({preventDefault(){prevented=true;}}),true);
  assert.equal(prevented,false);
  payload.expires_at=0;render(payload);
  assert.equal(elements.get('expoLink').onclick({preventDefault(){prevented=true;}}),false);
  assert.equal(prevented,true);
});

test('script destinations, DNS dependencies and navigation-injected links are rejected',()=>{
  for(const url of ['javascript:alert(1)','exp://desktop.test.ts.net:8089','exp://100.64.0.1:8089/--/other?release-channel=go-comprobaciones-8089']){
    const {elements,payload,render}=setup();payload.links.owner.url=url;render(payload);
    assert.equal(elements.get('expoLink').href,undefined);
  }
});

test('status says where verification occurred and preserves a copyable per-environment diagnosis',async()=>{
  const {elements,payload,render,context}=setup();
  payload.links.owner.message='Recursos comprobados desde el PC. iPhone pendiente.';
  payload.links.owner.diagnostic='Comprobaciones 8089: Windows; falta prueba iPhone.';
  render(payload);
  assert.match(elements.get('expoOwnerStatus').textContent,/iPhone pendiente/);
  await elements.get('expoOwnerCopy').onclick();
  assert.equal(context.copied,payload.links.owner.diagnostic);
});
