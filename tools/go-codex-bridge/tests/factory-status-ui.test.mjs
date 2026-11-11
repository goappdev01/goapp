import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('an older panel response cannot replace a later blocked state',async()=>{
  const elements=new Map(),pending=[];
  class Element {
    textContent='';className='';disabled=false;attrs={};
    setAttribute(key,value){this.attrs[key]=value;}
    removeAttribute(key){delete this.attrs[key];}
    addEventListener(){}
    replaceChildren(){this.textContent='';}
    append(){}
  }
  const document={hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},
    createElement(){return new Element();},addEventListener(){}};
  const context=vm.createContext({document,URL,Date,location:{hash:'',pathname:'/remote/',search:''},
    history:{replaceState(){}},sessionStorage:{getItem(){return null;}},navigator:{clipboard:{}},setInterval(){},
    fetch(){return new Promise(resolve=>pending.push(resolve));}});
  vm.runInContext(readFileSync(new URL('../remote.js',import.meta.url),'utf8'),context);
  vm.runInContext('refresh()',context);
  assert.equal(pending.length,2);
  const status=(state,enabled)=>({csrf:'test',updated:'now',version:'test',wheel:{state,enabled,
    button:{state:enabled?'active':'blocked',label:enabled?'FÁBRICA ACTIVADA':'FÁBRICA BLOQUEADA · REVISAR',
      progress:state,reason_message:state,disabled:enabled},current:null,next:'Siguiente tarjeta'},
    quota:{},cards:[],questions:[],expo:{state:'idle'},expo_launches:{links:{}},chat:{state:'pendiente',note:''}});
  pending[1]({ok:true,json:async()=>status('bloqueada',false)});
  await new Promise(resolve=>setImmediate(resolve));
  pending[0]({ok:true,json:async()=>status('activada',true)});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(elements.get('wheel').textContent,'Rueda: bloqueada');
  assert.equal(elements.get('activate').textContent,'FÁBRICA BLOQUEADA · REVISAR');
});
