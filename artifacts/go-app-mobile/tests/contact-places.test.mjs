import {test} from 'node:test';
import assert from 'node:assert/strict';
import lifecycle from './helpers/react-lifecycle.cjs';

const {evaluate}=lifecycle;
const model=evaluate('data/contactPlaces.ts',{});
const short='https://maps.app.goo.gl/RealFormat123?g_st=ic';
const long='https://www.google.com/maps/search/?api=1&query=40.4%2C-3.7';

test('only recognized Maps URLs open; a viewport and a short URL do not invent a pin',()=>{
  for(const url of ['javascript:alert(1)','https://maps.app.goo.gl.example.org/a',
    'https://www.google.com/url?q=https://example.org','https://x@www.google.com/maps/place/Foo',
    'https://maps.app.goo.gl/a%2f%2fother','http://www.google.com/maps/place/Foo']){
    assert.equal(model.readMapsLink(url),undefined);
  }
  assert.equal(model.readMapsLink(long).coordinates.latitude,40.4);
  assert.equal(model.readMapsLink(long).coordinates.longitude,-3.7);
  assert.equal(model.readMapsLink('https://www.google.com/maps/@40.4,-3.7,15z').coordinates,undefined);
  assert.equal(model.readMapsLink(short).coordinates,undefined);
  assert.equal(model.routeForPlace({mapUrl:short}),'https://maps.app.goo.gl/RealFormat123');
  assert.match(model.routeForPlace({address:'Plaza Mayor, Madrid'}),/destination=Plaza%20Mayor%2C%20Madrid$/);
  assert.equal(model.readCoordinates('91,0'),undefined);
});

test('location messages keep a snapshot and reject malformed/unsafe destinations',()=>{
  const wire=model.locationMessage({title:'Aquí',source:'current',coordinates:{latitude:40.4,longitude:-3.7},approximate:true});
  assert.equal(model.readLocationMessage(wire).approximate,true);
  assert.equal(model.readLocationMessage(wire).source,'received');
  assert.equal(model.readLocationMessage('GO-LOCATION:1 {"title":"Casa","mapUrl":"https://example.org"}'),undefined);
  assert.throws(()=>model.locationMessage({title:'Aquí',source:'current',coordinates:{latitude:100,longitude:100}}));
});

test('private contacts retain two places, deduplicate links, keep reorder and isolate account access',async()=>{
  const memory=new Map();let active='owner-a';
  const storage={getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>memory.set(k,v)};
  const dependencies={'./contactPlaces':model,'./booking':{getAuthenticatedUserId:async()=>active},
    '@react-native-async-storage/async-storage':storage};
  const store=evaluate('data/contactPlacesStore.ts',dependencies),contact={id:'device:42',name:'Ana'};
  const one={title:'Lugar habitual',source:'link',mapUrl:short};
  await Promise.all([store.saveContactPlace(active,contact,one),store.saveContactPlace(active,contact,one)]);
  const [first]=await store.readPlacesContacts(active);
  assert.equal(first.places.length,1);
  await store.saveContactPlace(active,contact,{title:'Casa',source:'manual',address:'Plaza Mayor, Madrid'});
  await store.saveContactPlace(active,contact,{title:'Casa',source:'manual',address:'Otra dirección, Madrid'});
  const [before]=await store.readPlacesContacts(active);
  assert.equal(before.places[0].id,first.places[0].id);
  assert.equal(before.places.length,3);
  const second=before.places[1];
  await store.arrangeContactPlace(active,contact.id,second.id,0);
  const reload=evaluate('data/contactPlacesStore.ts',dependencies);
  assert.equal((await reload.readPlacesContacts(active))[0].places[0].id,second.id);
  await reload.deleteContactPlace(active,contact.id,second.id);
  assert.equal((await reload.readPlacesContacts(active))[0].places[0].id,first.places[0].id);
  active='owner-b';
  assert.equal((await reload.readPlacesContacts(active)).length,0);
  await assert.rejects(reload.readPlacesContacts('owner-a'),/sesión/);
  await assert.rejects(reload.saveContactPlace('owner-a',contact,one),/sesión/);
});

test('location tools ask for foreground permission only on demand and require explicit send',async()=>{
  const {React,createRoot,document,rn,native}=lifecycle;
  const sent=[],buttons=[],inputs=[];
  let grants=false,requests=0,positions=0;
  const View=native('View');
  const loaded=evaluate('components/MessageLocationTools.tsx',{
    '@/data/contactPlaces':model,
    '@expo/vector-icons':{Feather:()=>null},
    './DraggableFAB':{DraggableFAB:({children})=>children},
    './contactos/ContactPlacesPanel':{ContactPlacesPanel:()=>null,openPlace:async()=>{}},
    'expo-location':{
      getForegroundPermissionsAsync:async()=>({status:'undetermined',canAskAgain:true}),
      requestForegroundPermissionsAsync:async()=>{requests++;return {status:grants?'granted':'denied'};},
      getCurrentPositionAsync:async()=>{positions++;return {coords:{latitude:40.4,longitude:-3.7,accuracy:125}};},
      Accuracy:{Balanced:3},
    },
    'react-native':{...rn,ScrollView:View,View,Text:native('Text'),
      TouchableOpacity:props=>{buttons.push(props);return React.createElement('button',null,props.children);},
      TextInput:props=>{inputs.push(props);return React.createElement('input');}},
  });
  const element=document.createElement('div'),root=createRoot(element);
  const run=fn=>React.act(async()=>{await fn();for(let i=0;i<12;i++)await Promise.resolve();});
  const tap=label=>run(()=>{
    const hit=buttons.findLast(b=>(b.accessibilityLabel || b.children?.props?.children)===label);
    assert.ok(hit,label);
    if(!hit.disabled)return hit.onPress();
  });
  try{
    await run(()=>root.render(React.createElement(loaded.MessageLocationTools,{bounds:{width:380,height:300},
      handedness:'right',canSend:true,recipient:'Destino de prueba',onIncomingHandled(){},
      async onSend(place){sent.push(place);return true;}})));
    await tap('Herramientas de ubicación');
    assert.equal(requests,0);
    await tap('Estoy aquí');
    assert.equal(requests,1);assert.equal(positions,0);
    assert.ok(inputs.findLast(x=>x.accessibilityLabel==='Dirección manual'));
    grants=true;
    await tap('Estoy aquí');
    assert.equal(positions,1);assert.equal(sent.length,0);
    assert.match(element.textContent,/Ubicación aproximada/);
    await tap('Cancelar');
    assert.equal(sent.length,0);
    await tap('Herramientas de ubicación');
    await tap('Estoy aquí');
    await tap('Compartir esta ubicación');
    assert.equal(sent.length,1);assert.equal(sent[0].approximate,true);
  }finally{await run(()=>root.unmount());}
});
