import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
// These persistence/notification contract tests explicitly await the separate OS receipt.
const save=async(api,...args)=>{const result=await api.saveUnifiedNote(...args);await result.reminderSync;return result;};
const move=async(api,...args)=>{const result=await api.moveUnifiedNote(...args);await result.reminderSync;return result;};

async function shoppingFixture(){
 const disk=await h.diskFixture(),model=h.load('lib/shoppingNote.ts');
 const api=()=>h.load('lib/shoppingNoteStore.ts',{'@react-native-async-storage/async-storage':disk.storage,'./goTaskAccess':disk.access,'./goLogStore':disk.store,'./unifiedNotes':disk.model,'./shoppingNote':model});
 const open=(scope=disk.scope,active=disk.active)=>api().openShoppingNote(scope,active);
 const run=(op,scope=disk.scope,active=disk.active)=>api().runShoppingOperation(scope,active,{operationId:model.shoppingId(),...op});
 const doc=()=>disk.rows.find(row=>row.ownerUserId===disk.scope.userId&&row.note?.shopping)?.note.shopping;
 const add=async(name,extra={})=>{const draft={...model.shoppingEditor(),name,category:model.suggestShoppingCategory(name,doc()),...extra};await run({type:'saveItem',draft});return doc().items.find(i=>i.id===draft.id);};
 return {disk,model,api,open,run,doc,add};
}

async function shoppingUI(f,{handedness='right',width=390,height=844,fontScale=1}={}){
 const {React}=h,hosts=new Map(),instances=new Map(),geometry=new Map(),gestures=new Map(),calls=[],alerts=[],frames=new Map();let frameId=0;
 const keyboard={visible:false,focused:null,listeners:new Map(),isVisible(){return this.visible;},addListener(name,fn){const set=this.listeners.get(name)||new Set();set.add(fn);this.listeners.set(name,set);return{remove:()=>set.delete(fn)};},
  show(){this.visible=true;for(const name of ['keyboardWillShow','keyboardDidShow'])for(const fn of this.listeners.get(name)||[])fn({});},
  dismiss(){keyboard.visible=false;keyboard.focused=null;for(const fn of keyboard.listeners.get('keyboardDidHide')||[])fn({});}};
 const host=name=>React.forwardRef((p,ref)=>{
  const token=React.useRef({}).current,live=React.useRef(p);live.current=p;
  if(p.testID){hosts.set(p.testID,p);instances.set(p.testID,token);}
  React.useImperativeHandle(ref,()=>({measureInWindow:fn=>fn(...(geometry.get(live.current.testID)||(live.current.testID==='shopping-reorder-viewport'?[0,80,width,400]:[12,100,width-24,70]))),
   scrollTo:options=>calls.push(['scrollTo',live.current.testID,options]),scrollResponderScrollNativeHandleToKeyboard:(...args)=>calls.push(['reveal',...args])}));
  React.useEffect(()=>()=>{if(live.current.testID&&instances.get(live.current.testID)===token){hosts.delete(live.current.testID);instances.delete(live.current.testID);}},[]);
  return React.createElement('div',{'data-native':name,'data-testid':p.testID},p.children);
 });
 const native={...h.rn,View:host('View'),Text:host('Text'),TouchableOpacity:host('Button'),TextInput:host('Input'),ScrollView:host('ScrollView'),KeyboardAvoidingView:host('KeyboardFrame'),Modal:host('Modal'),Keyboard:keyboard,
  useWindowDimensions:()=>({width,height,fontScale,scale:3}),Alert:{alert:(title,message,buttons)=>alerts.push({title,message,buttons})}};
 native.TextInput.State={currentlyFocusedInput:()=>keyboard.focused};
 const gh={GestureHandlerRootView:native.View,GestureDetector:({gesture,children})=>{gestures.set(children.props.testID,gesture);return children;},Gesture:{Pan:()=>{
  const pan={};for(const key of ['enabled','activateAfterLongPress','maxPointers','runOnJS'])pan[key]=value=>{pan[key+'Value']=value;return pan;};
  for(const key of ['onStart','onUpdate','onFinalize'])pan[key]=fn=>{pan[key+'Handler']=fn;return pan;};return pan;
 }}};
 const globals={requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id)};
 const board=h.load('components/boards/BoardDragSurface.tsx',{'react-native':native});
 const reorder=h.load('components/notes/ShoppingReorderSurface.tsx',{'react-native':native,'react-native-gesture-handler':gh,'@/components/boards/BoardDragSurface':board},globals);
 const keyboardHook=h.load('hooks/useGoNoteKeyboard.ts',{'react-native':native});
 const store={subscribeGoLog:f.disk.store.subscribeGoLog,getGoLogSnapshot:f.disk.store.getGoLogSnapshot};
 const {GoShoppingNote}=h.load('components/notes/GoShoppingNote.tsx',{'react-native':native,'react-native-gesture-handler':gh,'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:44,bottom:20,left:0,right:0})},
  '@/components/ui/GoScreenModal':{GoScreenModal:native.Modal},'@/components/ui/GoCloseButton':{GoCloseButton:native.TouchableOpacity},'@/hooks/useGoNoteKeyboard':keyboardHook,
  '@/lib/goLogStore':store,'@/lib/unifiedNotes':f.disk.model,'@/lib/shoppingNoteStore':f.api(),'@/lib/shoppingNote':f.model,'./ShoppingReorderSurface':reorder},globals);
 const container=h.document.createElement('div'),root=h.createRoot(container);let props={visible:true,ready:true,scope:f.disk.scope,handedness,onClose:()=>calls.push(['close'])};
 const idle=async()=>{for(let i=0;i<10;i++)await h.settle(()=>new Promise(setImmediate));};
 const render=async patch=>{props={...props,...patch};await h.settle(()=>root.render(React.createElement(GoShoppingNote,props)));await idle();};
 await render({});
 const tap=async id=>{assert.ok(hosts.has(id),'control exists: '+id);await h.settle(()=>hosts.get(id).onPress());await idle();};
 const input=async(key,value)=>{await h.settle(()=>hosts.get('shopping-field-'+key).onChangeText(value));await idle();};
 return {hosts,instances,calls,alerts,frames,geometry,gestures,keyboard,container,render,idle,tap,input,run:h.settle,
  async frame(time){const pending=[...frames.values()];frames.clear();await h.settle(()=>pending.forEach(fn=>fn(time)));},close:()=>h.settle(()=>root.unmount())};
}

test('COMPRAS UI: actual add/edit/bought/filter/next controls persist offline and closing an editor retains list scroll instance',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f);const scroll=ui.instances.get('shopping-list-scroll');await ui.tap('shopping-add');await ui.input('name','Azúcar');await ui.input('quantity','2');await ui.tap('shopping-unit-paquetes');await ui.tap('shopping-save');
  const sugar=f.doc().items[0];assert.equal(sugar.quantity,2);assert.equal(sugar.category,'pantry');assert.equal(ui.instances.get('shopping-list-scroll'),scroll);assert.equal(ui.hosts.get('shopping-bought-'+sugar.id).accessibilityState.checked,false);
  await ui.tap('shopping-add');await ui.input('name','Sal');await ui.tap('shopping-unit-paquetes');await ui.tap('shopping-save');const salt=f.doc().items.find(i=>i.name==='Sal');
  await ui.tap('shopping-bought-'+sugar.id);assert.equal(f.doc().items.find(i=>i.id===sugar.id).bought,true);await ui.tap('shopping-bought-'+sugar.id);assert.equal(f.doc().items.find(i=>i.id===sugar.id).bought,false);
  await ui.tap('shopping-bought-'+sugar.id);await ui.tap('shopping-filter-bought');assert.ok(ui.hosts.has('shopping-item-'+sugar.id));assert.equal(ui.hosts.has('shopping-item-'+salt.id),false);await ui.tap('shopping-filter-all');
  await ui.tap('shopping-next');assert.equal(ui.hosts.get('shopping-next-select-'+sugar.id).accessibilityState.checked,false);await ui.tap('shopping-next-select-'+sugar.id);await ui.tap('shopping-next-confirm');
  await ui.run(()=>ui.alerts.at(-1).buttons.find(b=>b.text==='PREPARAR').onPress());await ui.idle();assert.equal(f.doc().items.find(i=>i.id===sugar.id).bought,false);assert.equal(f.doc().items.length,2);
  await ui.tap('shopping-filter-all');await ui.tap('shopping-edit-'+sugar.id);await ui.input('store','Mercado A');await ui.input('price','2,50');await ui.input('priceQuantity','1');await ui.input('brand','Marca A');await ui.input('format','seco');await ui.tap('shopping-save');
  await ui.tap('shopping-edit-'+sugar.id);await ui.input('store','Mercado B');await ui.input('price','1,50');await ui.input('priceQuantity','500');await ui.tap('shopping-save');
  assert.equal(f.doc().items.length,2);assert.equal(f.doc().items.find(i=>i.id===sugar.id).prices.length,2);assert.match(ui.container.textContent,/GO IA no está conectada/);
  await ui.close();ui=null;await f.disk.reopen();assert.equal((await f.open()).note.shopping.items.length,2);
 }finally{if(ui)await ui.close();f.disk.close();}
});

test('COMPRAS UI: measured long-press handles reorder only their own block, persist category order and cap/cancel edge autoscroll',async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();const a=await f.add('Azúcar'),b=await f.add('Sal'),bread=await f.add('Pan');ui=await shoppingUI(f);
  ui.geometry.set('shopping-position-'+a.id,[12,150,366,70]);ui.geometry.set('shopping-position-'+b.id,[12,230,366,70]);ui.geometry.set('shopping-position-'+bread.id,[12,310,366,70]);
  await ui.run(()=>ui.hosts.get('shopping-list-scroll').onContentSizeChange(390,1800));
  const pan=ui.gestures.get('shopping-drag-'+a.id);assert.equal(pan.activateAfterLongPressValue,500);assert.equal(pan.maxPointersValue,1);
  await ui.run(()=>pan.onStartHandler({absoluteY:180}));assert.ok(ui.hosts.has('shopping-drag-ghost'));assert.equal(ui.hosts.get('shopping-list-scroll').scrollEnabled,false);
  await ui.run(()=>pan.onUpdateHandler({absoluteY:260}));assert.equal(ui.hosts.get('shopping-drop-target-'+b.id).style.position,'absolute','drop feedback does not change row height');assert.equal(ui.gestures.get('shopping-drag-'+a.id),pan,'visual feedback retains the native gesture instance');await ui.run(()=>pan.onFinalizeHandler({},true));await ui.idle();
  assert.deepEqual(f.doc().items.filter(i=>i.category==='pantry').sort((a,b)=>a.order-b.order).map(i=>i.id),[b.id,a.id]);assert.equal(f.doc().items.find(i=>i.id===bread.id).category,'bakery');
  const before=JSON.stringify(f.doc().items);const another=ui.gestures.get('shopping-drag-'+a.id);await ui.run(()=>another.onStartHandler({absoluteY:180}));await ui.run(()=>another.onUpdateHandler({absoluteY:340}));await ui.run(()=>another.onFinalizeHandler({},true));await ui.idle();assert.equal(JSON.stringify(f.doc().items),before,'foreign bakery is not a drop target');
  const edge=ui.gestures.get('shopping-drag-'+a.id);await ui.run(()=>edge.onStartHandler({absoluteY:180}));await ui.run(()=>edge.onUpdateHandler({absoluteY:479}));await ui.frame(16);await ui.frame(32);
  const scrolling=ui.calls.filter(c=>c[0]==='scrollTo');assert.ok(scrolling.length>0);assert.ok(scrolling.every(c=>c[2].y>=0&&c[2].y<=1400));assert.ok(scrolling[0][2].y<=7.68);
  await ui.run(()=>edge.onFinalizeHandler({},false));const count=ui.calls.length;await ui.frame(48);assert.equal(ui.calls.length,count);assert.equal(ui.frames.size,0);
  await ui.tap('shopping-arrange-categories');ui.geometry.set('shopping-position-produce',[12,100,366,70]);ui.geometry.set('shopping-position-bakery',[12,190,366,70]);
  const category=ui.gestures.get('shopping-drag-produce');assert.equal(category.activateAfterLongPressValue,500);await ui.run(()=>category.onStartHandler({absoluteY:130}));await ui.run(()=>category.onUpdateHandler({absoluteY:220}));await ui.run(()=>category.onFinalizeHandler({},true));await ui.idle();assert.equal(f.doc().categoryOrder[0],'bakery');
  await f.disk.reopen();assert.equal(f.doc().categoryOrder[0],'bakery');
 }finally{if(ui)await ui.close();f.disk.close();}
});

test('COMPRAS UI: acknowledged partial draft recovers after unmount/reopen, failed save stays editable, and changing account hides private fields',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f);await ui.tap('shopping-add');await ui.input('name','Producto privado');await ui.input('quantity','1,');await ui.input('price','2,');await ui.close();ui=null;await f.disk.reopen();
  ui=await shoppingUI(f);assert.equal(ui.hosts.get('shopping-field-name').value,'Producto privado');assert.equal(ui.hosts.get('shopping-field-quantity').value,'1,');await ui.tap('shopping-save');assert.ok(ui.hosts.has('shopping-error'));assert.equal(f.doc().items.length,0);
  await ui.input('quantity','1,5');await ui.input('price','');f.disk.failWrite(true);await ui.tap('shopping-save');assert.equal(ui.hosts.get('shopping-field-name').value,'Producto privado');assert.equal(f.doc().items.length,0);f.disk.failWrite(false);await ui.tap('shopping-save');assert.equal(f.doc().items.length,1);
  await ui.tap('shopping-edit-'+f.doc().items[0].id);await ui.render({ready:false,scope:null});assert.equal(ui.hosts.has('shopping-field-name'),false);assert.doesNotMatch(ui.container.textContent,/Producto privado/);
  await f.disk.setUser('other-ui-user');await ui.render({ready:true,scope:{...f.disk.scope,userId:'other-ui-user'}});assert.doesNotMatch(ui.container.textContent,/Producto privado/);assert.equal(f.disk.rows.find(r=>r.ownerUserId==='other-ui-user').note.shopping.items.length,0);
 }finally{if(ui)await ui.close();f.disk.close();}
});

for(const viewport of [{width:320,height:568,fontScale:1},{width:390,height:844,fontScale:1.8},{width:768,height:1024,fontScale:2}])for(const handedness of ['left','right'])test(`COMPRAS UI: ${viewport.width}px font ${viewport.fontScale} ${handedness} retains keyboard-aware thumb controls and native input focus`,async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{...viewport,handedness});assert.equal(ui.hosts.get('shopping-thumb-controls').style[1].flexDirection,handedness==='left'?'row-reverse':'row');await ui.tap('shopping-add');
  assert.equal(ui.hosts.get('shopping-field-name').autoFocus,undefined);await ui.run(()=>ui.hosts.get('shopping-field-name').onFocus({target:123}));assert.ok(ui.calls.some(c=>c[0]==='reveal'&&c[1]===123));
  await ui.run(()=>ui.keyboard.show());assert.equal(ui.hosts.get('shopping-back').accessibilityLabel,'Ocultar teclado');assert.ok(ui.hosts.has('shopping-save'));await ui.tap('shopping-back');assert.equal(ui.keyboard.visible,false);assert.ok(ui.hosts.has('shopping-field-name'));await ui.tap('shopping-back');assert.ok(ui.hosts.has('shopping-add'));assert.ok(ui.hosts.has('shopping-resume-draft'));
 }finally{if(ui)await ui.close();f.disk.close();}
});

test('COMPRAS UI: a failed readback retries the identical saved item without duplicate prices or a false stale-edit conflict',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f);await ui.tap('shopping-add');await ui.input('name','Azúcar');await ui.input('store','Tienda A');await ui.input('price','2,50');
  f.disk.failRead(true);await ui.tap('shopping-save');assert.ok(ui.hosts.has('shopping-field-name'));assert.ok(ui.hosts.has('shopping-error'));assert.equal(f.doc().items.length,1);
  f.disk.failRead(false);await ui.tap('shopping-save');assert.equal(ui.hosts.has('shopping-field-name'),false);assert.equal(f.doc().items.length,1);assert.equal(f.doc().items[0].prices.length,1);
 }finally{if(ui)await ui.close();f.disk.close();}
});

test('COMPRAS: unrelated operations and explicit legacy incorporation retain pending edits; another draft cannot overwrite them',async()=>{
 const f=await shoppingFixture();try{
  await f.open();const sugar=await f.add('Azúcar'),draft={...f.model.shoppingEditor(sugar),quantity:'2,5'};await f.run({type:'draft',draft});
  await assert.rejects(f.run({type:'draft',draft:{...f.model.shoppingEditor(),name:'Otro'}}),/otro borrador/);
  const legacy=f.disk.model.buildNoteEntry(f.disk.draft({title:'Compras',content:'Pan'}),f.disk.scope);await f.disk.store.updateGoLog(rows=>({entries:[legacy,...rows],result:null}));
  await f.run({type:'importLegacy',sourceId:legacy.id,names:['Pan'],confirmed:true});assert.equal(f.doc().pendingEditor.quantity,'2,5');
  await f.run({type:'bought',id:sugar.id,value:true});await f.run({type:'saveItem',draft});assert.equal(f.doc().items.find(i=>i.id===sugar.id).bought,true);assert.equal(f.doc().items.find(i=>i.id===sugar.id).quantity,2.5);assert.equal(f.doc().pendingEditor,undefined);
 }finally{f.disk.close();}
});

test('COMPRAS: weight/volume estimates require measured content and changing package size uses normalized cost',async()=>{
 const f=await shoppingFixture();try{
  await f.open();let milk=await f.add('Leche',{quantity:'2',unit:'litros',store:'Tienda',price:'1,50'});assert.equal(f.model.shoppingEstimate(f.doc()).unknown,1);
  await f.run({type:'saveItem',draft:{...f.model.shoppingEditor(milk),store:'Tienda',price:'1,50',priceQuantity:'500',priceUnit:'ml'}});assert.equal(f.model.shoppingEstimate(f.doc()).totals.EUR,6);
  await f.add('Azúcar',{unit:'paquetes',quantity:'2',packageQuantity:'2',packageUnit:'kg',store:'Tienda',price:'1,50',priceQuantity:'500',priceUnit:'g'});assert.equal(f.model.shoppingEstimate(f.doc()).totals.EUR,18);
 }finally{f.disk.close();}
});

test('COMPRAS: generic note mutation cannot replace the specialized document; malformed and duplicate canonical records are preserved and refused',async()=>{
 const f=await shoppingFixture();try{
  const row=await f.open();await assert.rejects(save(f.disk.api(),{...f.disk.model.noteDraft(row),content:'Texto genérico'},f.disk.scope,f.disk.active),/Abre COMPRAS/);assert.equal(f.doc().items.length,0);
  await f.disk.store.updateGoLog(rows=>({entries:rows.map(row=>({...row,note:{...row.note,shopping:{...row.note.shopping,version:2}}})),result:null}));
  const invalid=JSON.stringify(f.disk.rows);await assert.rejects(f.open(),/no es válida/);assert.equal(JSON.stringify(f.disk.rows),invalid);
  await f.disk.store.updateGoLog(rows=>({entries:[{...rows[0],id:'second-canonical'},...rows],result:null}));const duplicated=JSON.stringify(f.disk.rows);await assert.rejects(f.open(),/más de una/);assert.equal(JSON.stringify(f.disk.rows),duplicated);
 }finally{f.disk.close();}
});

test('COMPRAS: concurrent opening creates one canonical personal note, real disk reopening and two-account isolation',async()=>{
 const f=await shoppingFixture();try{
  const rows=await Promise.all(Array.from({length:6},()=>f.open()));assert.equal(new Set(rows.map(r=>r.id)).size,1);assert.equal(f.disk.writes,1);await f.add('Azúcar',{quantity:'2',unit:'paquetes'});
  const first=f.disk.rows[0];await f.disk.reopen();assert.equal((await f.open()).id,first.id);assert.equal(f.doc().items[0].quantity,2);
  await f.disk.setUser('second-shopper');const second={...f.disk.scope,userId:'second-shopper'};const other=await f.open(second,()=>true);assert.notEqual(other.id,first.id);assert.equal(other.note.shopping.items.length,0);
  await assert.rejects(f.open(),/cuenta/);await assert.rejects(f.open({...second,context:'live:BUSINESS'},()=>true),/personal/);
  await f.disk.setUser(f.disk.scope.userId);assert.equal((await f.open()).note.shopping.items[0].name,'Azúcar');assert.equal(f.disk.rows.length,2);
  await f.disk.setUser(null);await assert.rejects(f.open(),/cuenta/);
 }finally{f.disk.close();}
});

test('COMPRAS: quantities, default one, exact local categories, stable IDs, duplicate prevention and stale editor refusal',async()=>{
 const f=await shoppingFixture();try{
  await f.open();const sugar=await f.add('Azúcar',{quantity:'2',unit:'paquetes'}),salt=await f.add('Sal',{unit:'paquetes'}),bread=await f.add('Pan'),cleaner=await f.add('Detergente');
  assert.equal(sugar.category,'pantry');assert.equal(salt.quantity,1);assert.equal(bread.category,'bakery');assert.equal(cleaner.category,'cleaning');assert.equal(sugar.packageQuantity,undefined);
  assert.equal(f.model.suggestShoppingCategory('Pan con detergente',f.doc()),'other');assert.equal(f.model.suggestShoppingCategory('producto desconocido',f.doc()),'other');
  const edit={...f.model.shoppingEditor(sugar),quantity:'2,5',store:'Tienda A'};await f.run({type:'saveItem',draft:edit});
  assert.equal(f.doc().items.length,4);assert.equal(f.doc().items.find(i=>i.id===sugar.id).quantity,2.5);assert.equal(f.doc().items.find(i=>i.id===sugar.id).preferredStore,'Tienda A');
  await assert.rejects(f.run({type:'saveItem',draft:{...edit,quantity:'3'}}),/cambió/);
  await assert.rejects(f.add('  AZUCAR  '),/Ya existe/);
  for(const quantity of ['0','-1','NaN','1,2,3','1e4','Infinity'])await assert.rejects(f.add('Inválido',{quantity}));
  const before=JSON.stringify(f.doc().items);await f.disk.reopen();assert.equal(JSON.stringify(f.doc().items),before);
 }finally{f.disk.close();}
});

test('COMPRAS: reorder products and category blocks, explicit category change, filters and visible numbers survive disk reopen',async()=>{
 const f=await shoppingFixture();try{
  await f.open();const a=await f.add('Azúcar'),b=await f.add('Sal'),pan=await f.add('Pan'),det=await f.add('Detergente');
  await f.run({type:'reorderItems',category:'pantry',ids:[b.id,a.id]});
  const categoryOrder=[...f.doc().categoryOrder].reverse();await f.run({type:'reorderCategories',ids:categoryOrder});
  const visible=f.model.visibleShopping(f.doc(),'all').flatMap(s=>s.items);assert.deepEqual(visible.map(v=>v.number),[1,2,3,4]);assert.ok(visible.findIndex(v=>v.item.id===b.id)<visible.findIndex(v=>v.item.id===a.id));
  await assert.rejects(f.run({type:'reorderItems',category:'pantry',ids:[pan.id,det.id]}),/bloque/);
  await f.run({type:'category',id:a.id,category:'other'});assert.equal(f.doc().items.find(i=>i.id===a.id).category,'other');assert.equal(f.model.suggestShoppingCategory('Azúcar',f.doc()),'other');
  const order=JSON.stringify(f.doc().categoryOrder);await f.run({type:'bought',id:b.id,value:true});
  assert.equal(f.model.visibleShopping(f.doc(),'bought').flatMap(s=>s.items)[0].number,1);assert.equal(JSON.stringify(f.doc().categoryOrder),order);
  await f.run({type:'collapse',category:'bakery',value:true});const numbers=f.model.visibleShopping(f.doc(),'all').flatMap(s=>s.items).map(v=>v.number);assert.deepEqual(numbers,[1,2,3]);
  const expected=JSON.stringify(f.doc());await f.disk.reopen();assert.equal(JSON.stringify((await f.open()).note.shopping),expected);
 }finally{f.disk.close();}
});

test('COMPRAS: reversible purchase, saved habitual items and explicitly selected next purchase retain prices and other states',async()=>{
 const f=await shoppingFixture();try{
  await f.open();const a=await f.add('Azúcar'),b=await f.add('Sal'),oneOff=await f.add('Bolsa regalo',{usual:false});
  for(const i of [a,b,oneOff])await f.run({type:'bought',id:i.id,value:true});assert.equal(f.doc().items.length,3);
  await f.run({type:'bought',id:a.id,value:false});await f.run({type:'bought',id:a.id,value:true});await f.run({type:'select',id:a.id,value:false});
  assert.equal(f.model.visibleShopping(f.doc(),'all').flatMap(s=>s.items).length,3);assert.equal(f.model.visibleShopping(f.doc(),'pending').flatMap(s=>s.items).length,0);
  await assert.rejects(f.run({type:'next',ids:[oneOff.id],confirmed:true}),/habituales/);await assert.rejects(f.run({type:'next',ids:[a.id]}),/confirma/);
  await f.run({type:'next',ids:[a.id],confirmed:true});assert.equal(f.doc().items.find(i=>i.id===a.id).bought,false);assert.equal(f.doc().items.find(i=>i.id===a.id).selected,true);assert.equal(f.doc().items.find(i=>i.id===b.id).bought,true);
  await assert.rejects(f.run({type:'delete',id:oneOff.id}),/Confirma/);await f.run({type:'delete',id:oneOff.id,confirmed:true});assert.equal(f.doc().items.length,2);await f.disk.reopen();assert.equal(f.doc().items.length,2);
 }finally{f.disk.close();}
});

test('COMPRAS: honest package and normalized price comparisons, brand/format/currency groups, unknown totals and price history',async()=>{
 const f=await shoppingFixture();try{
  await f.open();let sugar=await f.add('Azúcar',{unit:'paquetes',quantity:'2',store:'Tienda A',price:'2,50',priceQuantity:'1',priceUnit:'kg',brand:'Marca A',format:'seco'});
  await f.run({type:'saveItem',draft:{...f.model.shoppingEditor(sugar),store:'Tienda B',price:'1,50',priceQuantity:'500',priceUnit:'g',brand:'Marca A',format:'seco'}});
  sugar=f.doc().items[0];assert.equal(f.doc().items.length,1);assert.equal(sugar.prices.length,2);assert.equal(f.model.normalizedShoppingPrice(sugar.prices[1]).value,3);
  const group=f.model.comparableShoppingPrices(sugar.prices)[0];assert.equal(group[0].store,'Tienda A','smaller and lower package price is dearer per kg');
  assert.equal(f.model.comparableShoppingPrices([{...sugar.prices[0],brand:'Otra marca'},sugar.prices[1]]).length,0);
  assert.equal(f.model.comparableShoppingPrices([{...sugar.prices[0],format:'líquido'},sugar.prices[1]]).length,0);
  assert.equal(f.model.comparableShoppingPrices([{...sugar.prices[0],currency:'USD'},sugar.prices[1]]).length,0);
  await f.add('Sal');assert.equal(f.model.shoppingEstimate(f.doc()).unknown,1);assert.equal(f.model.shoppingEstimate(f.doc()).totals.EUR,3);
  const priceIds=sugar.prices.map(p=>p.id);await f.run({type:'quantity',id:sugar.id,value:3.5});
  sugar=f.doc().items.find(i=>i.id===sugar.id);await f.run({type:'saveItem',draft:{...f.model.shoppingEditor(sugar),store:'Tienda C',price:'1,20'}});
  sugar=f.doc().items.find(i=>i.id===sugar.id);assert.equal(sugar.prices.length,3);assert.equal(f.model.normalizedShoppingPrice(sugar.prices[2]),null);assert.deepEqual(sugar.prices.slice(0,2).map(p=>p.id),priceIds);
  await f.run({type:'selectPrice',id:sugar.id,priceId:priceIds[0]});assert.equal(f.model.shoppingEstimate(f.doc()).totals.EUR,8.75);
  await f.disk.reopen();assert.equal(f.doc().items.find(i=>i.id===sugar.id).prices.length,3);
 }finally{f.disk.close();}
});

test('COMPRAS: partial editor recovery, real disk failure, identical readback retry and context changes never corrupt items',async()=>{
 const f=await shoppingFixture();try{
  await f.open();const sugar=await f.add('Azúcar'),draft={...f.model.shoppingEditor(sugar),quantity:'1,',store:'Tienda sin terminar',price:'2,'};
  await f.run({type:'draft',draft});await f.disk.reopen();const restored=(await f.open()).note.shopping.pendingEditor;assert.equal(restored.quantity,'1,');assert.equal(restored.price,'2,');
  await assert.rejects(f.run({type:'saveItem',draft:restored}),/número/);assert.equal(f.doc().items[0].quantity,1);
  f.disk.failWrite(true);const operation={type:'saveItem',operationId:'retry-one-item',draft:{...f.model.shoppingEditor(),name:'Sal'}};await assert.rejects(f.run(operation),/disco/);assert.equal(f.doc().items.length,1);
  f.disk.failWrite(false);await f.run(operation);await f.run(operation);assert.equal(f.doc().items.length,2);
  f.disk.failRead(true);const toggle={type:'bought',id:sugar.id,value:true,operationId:'readback-retry'};await assert.rejects(f.run(toggle),/almacenamiento/);f.disk.failRead(false);await f.run(toggle);assert.equal(f.doc().items[0].bought,true);
  const before=JSON.stringify(f.disk.rows);await assert.rejects(f.run({type:'quantity',id:sugar.id,value:5},f.disk.scope,()=>false),/contexto/);assert.equal(JSON.stringify(f.disk.rows),before);
 }finally{f.disk.close();}
});

test('COMPRAS: old notes remain intact; explicit import deduplicates and rejects cross-account source; structured IA preview applies to the same note',async()=>{
 const f=await shoppingFixture();try{
  const legacy=f.disk.model.buildNoteEntry(f.disk.draft({title:'Compras',content:'- Pan\n- Azúcar\n- Pan'}),f.disk.scope);await f.disk.store.updateGoLog(rows=>({entries:[legacy,...rows],result:null}));
  const before=JSON.stringify(legacy);await f.open();assert.equal(f.doc().items.length,0);assert.equal((await f.api().oldShoppingNotes(f.disk.scope,f.disk.active)).length,1);
  await f.run({type:'importLegacy',sourceId:legacy.id,names:['Pan'],confirmed:true});await f.run({type:'importLegacy',sourceId:legacy.id,names:['Pan','Azúcar'],confirmed:true});assert.equal(f.doc().items.length,2);
  assert.equal(JSON.stringify(f.disk.rows.find(row=>row.id===legacy.id)),before);await assert.rejects(f.run({type:'importLegacy',sourceId:'foreign',names:['Pan'],confirmed:true}),/cuenta/);
  await assert.rejects(f.run({type:'importLegacy',sourceId:legacy.id,names:['No estaba'],confirmed:true}),/cambió/);
  const noteId=(await f.open()).id,preview=f.model.previewShoppingInput(f.doc(),{name:'Sal',quantity:'2',unit:'paquetes'});assert.equal(preview.requiresConfirmation,true);await f.run(preview.operation);
  assert.equal((await f.open()).id,noteId);assert.equal(f.doc().items.find(i=>i.name==='Sal').quantity,2);
  assert.equal(f.model.previewShoppingInput(f.doc(),{name:'Sal'}).needsCorrection,true);assert.equal(f.model.previewShoppingInput(f.doc(),{name:'Sal',quantity:'4',unit:'paquetes'}).needsCorrection,true);
 }finally{f.disk.close();}
});

for(const destination of ['archive','pending','calendar'])test(destination+': one phrase without title/duration/reminder survives real disk reopen, with no HTTP dependency',async()=>{
 const f=await h.diskFixture();try{const draft=f.draft({destination,...(destination==='calendar'?{dateISO:'2027-12-30',time:'3:15'}:{})});
  const result=await save(f.api(),draft,f.scope,f.active);assert.match(result.message,/guardada/);assert.equal(f.rows.length,1);assert.equal(f.rows[0].id,draft.id);assert.equal(f.rows[0].note.content,'Una frase');assert.equal(f.rows[0].note.title,'');
  assert.equal(f.rows[0].duration,'');assert.deepEqual(f.rows[0].reminders,[]);assert.equal(f.rows[0].note.destination,destination);assert.deepEqual(h.plain(await f.reopen()),f.rows);
  if(destination==='calendar')assert.equal(f.rows[0].time,'03:15');else assert.equal(f.rows[0].dateISO,'');
 }finally{f.close();}
});

test('actual disk failure keeps the draft, returns an error, permits retry and concurrent taps never duplicate an ID',async()=>{
 const f=await h.diskFixture();try{const draft=f.draft();f.failWrite(true);await assert.rejects(save(f.api(),draft,f.scope,f.active),/disco/);assert.equal(f.rows.length,0);assert.equal(draft.content,'Una frase');
  f.failWrite(false);await Promise.all([save(f.api(),draft,f.scope,f.active),save(f.api(),draft,f.scope,f.active)]);assert.equal(f.rows.length,1);assert.equal(f.writes,1);
 }finally{f.close();}
});

test('a readback failure never reports success and the identical retry verifies one existing row without another write',async()=>{
 const f=await h.diskFixture();try{await f.store.readGoLog();const draft=f.draft();f.failRead(true);await assert.rejects(save(f.api(),draft,f.scope,f.active),/almacenamiento/);
 assert.equal(f.rows.length,1);assert.equal(f.writes,1);f.failRead(false);const result=await save(f.api(),draft,f.scope,f.active);assert.match(result.message,/guardada/);assert.equal(f.rows.length,1);assert.equal(f.writes,1);
 }finally{f.close();}
});

test('editing and destination moves retain legacy independent reminder offsets and a manual mute',async()=>{
 const f=await h.diskFixture();try{const previous={...f.model.buildNoteEntry(f.draft({destination:'calendar',dateISO:'2027-12-30',time:'18:30',reminderMinutes:75}),f.scope),note:undefined,reminders:[75,15],notificationsEnabled:false};
 await f.store.updateGoLog(rows=>({entries:[previous,...rows],result:null}));const edit=f.model.noteDraft(previous);edit.content='Texto editado';let result=await save(f.api(),edit,f.scope,f.active);assert.deepEqual(f.rows[0].reminders,[15,75]);assert.equal(f.rows[0].notificationsEnabled,false);assert.equal(f.osRequests.size,0);
 result=await move(f.api(),result.entry,'archive',f.scope,f.active);assert.equal(f.nativeModel.nativeReminderTaskInScope(result.entry,f.scope),false);
 result=await move(f.api(),result.entry,'pending',f.scope,f.active);assert.equal(f.nativeModel.nativeReminderTaskInScope(result.entry,f.scope),false);
 await move(f.api(),result.entry,'calendar',f.scope,f.active);assert.deepEqual(f.rows[0].reminders,[15,75]);assert.equal(f.rows[0].notificationsEnabled,false);assert.equal(f.osRequests.size,0);
 }finally{f.close();}
});

test('legacy personal notes migrate in place across all three destinations without losing ID or original fields',async()=>{
 const f=await h.diskFixture();try{
  const legacy={id:'legacy-note-id',kind:'sent',type:'TAREA_INTERNA',intentKey:'nota_interna',intentLabel:'Tarea interna',ownerUserId:f.scope.userId,taskContext:f.scope.context,actionContext:f.scope.context,estado:'pendiente',createdAt:123,notes:'Nota antigua',detail:'Contenido heredado',place:'Lugar anterior',dateISO:'2027-12-30',date:'30/12/2027',time:'18:30',duration:'45min',reminders:[20,5]};
  await f.store.updateGoLog(rows=>({entries:[legacy,...rows],result:null}));
  assert.equal(f.model.isNoteEntry(legacy),true);assert.equal(f.model.noteEntryDestination(legacy),'calendar');
  let result=await move(f.api(),legacy,'archive',f.scope,f.active);assert.equal(result.entry.id,legacy.id);assert.equal(result.entry.note.destination,'archive');assert.equal(result.entry.notes,legacy.notes);assert.equal(result.entry.detail,legacy.detail);assert.equal(result.entry.createdAt,legacy.createdAt);assert.equal(f.rows.length,1);
  result=await move(f.api(),result.entry,'pending',f.scope,f.active);assert.equal(result.entry.id,legacy.id);assert.equal(result.entry.note.destination,'pending');assert.equal(result.entry.place,legacy.place);assert.equal(f.rows.length,1);
  result=await move(f.api(),result.entry,'calendar',f.scope,f.active,{dateISO:'2027-12-31',time:'19:00'});assert.equal(result.entry.id,legacy.id);assert.equal(result.entry.note.destination,'calendar');assert.equal(result.entry.dateISO,'2027-12-31');assert.equal(result.entry.time,'19:00');assert.equal(result.entry.detail,legacy.detail);assert.equal(f.rows.length,1);
 }finally{f.close();}
});

test('full note retains content, location, exact schedule, attachments and native reminder after reload and edit',async()=>{
 const f=await h.diskFixture();try{const draft=f.draft({destination:'calendar',title:'Título completo',content:'Párrafo uno\nPárrafo dos',dateISO:'2027-12-30',time:'18:30',duration:'2h',reminderMinutes:75,place:'Dirección',location:{latitude:38,longitude:-1}});
  const asset=await f.sourceFile();draft.attachments=[await f.fileApi.importNoteFile(f.scope,draft.id,asset),{id:'web',kind:'link',name:'Referencia',uri:'https://example.com/manual'}];
  const result=await save(f.api(),draft,f.scope,f.active);assert.equal(f.osRequests.size,1);
  const [loaded]=await f.reopen();assert.equal(loaded.note.content,draft.content);assert.deepEqual(h.plain(loaded.note.attachments),h.plain(draft.attachments));assert.equal(fs.readFileSync(fileURLToPath(loaded.note.attachments[0].uri),'utf8'),'fixture document');
  const edit=f.model.noteDraft(loaded);edit.content='Texto corregido después de dictar';await save(f.api(),edit,f.scope,f.active);
  assert.equal(f.rows.length,1);assert.equal(f.rows[0].note.revision,2);assert.equal(f.rows[0].note.content,edit.content);assert.equal(f.rows[0].createdAt,result.entry.createdAt);assert.equal(f.osRequests.size,1);
 }finally{f.close();}
});

test('archive, pending and scheduling moves preserve one ID, metadata and completion history; archive is never completion',async()=>{
 const f=await h.diskFixture();try{const initial=await save(f.api(),f.draft({destination:'calendar',dateISO:'2027-12-30',time:'13:45',reminderMinutes:15}),f.scope,f.active);
  const completion=h.load('lib/goActionCompletion.ts'),doc=completion.recordCompletion(completion.emptyCompletionDocument(f.scope),initial.entry,'done',Date.now(),true),history=JSON.stringify(doc);
  const archived=await move(f.api(),initial.entry,'archive',f.scope,f.active);assert.equal(f.osRequests.size,0);assert.equal(archived.entry.id,initial.entry.id);assert.equal(archived.entry.estado,'pendiente');assert.equal(archived.entry.deleted,undefined);assert.equal(completion.completionEligible(archived.entry),false);assert.equal(JSON.stringify(doc),history);
  const pending=await move(f.api(),archived.entry,'pending',f.scope,f.active);assert.equal(pending.entry.dateISO,'');assert.equal(completion.plannedActionEnd(pending.entry),null);assert.equal(completion.completionDecision(pending.entry,doc).status,'done');
  const scheduled=await move(f.api(),pending.entry,'calendar',f.scope,f.active,{dateISO:'2027-12-30',time:'13:45'});assert.equal(scheduled.entry.id,initial.entry.id);assert.equal(f.rows.length,1);assert.equal(f.osRequests.size,1);assert.equal(scheduled.entry.note.history.length,3);assert.equal(completion.completionDecision(scheduled.entry,doc).status,'done');
 }finally{f.close();}
});

test('manual confirmation is reused; elapsed time and archiving never fabricate a done decision',async()=>{
 const f=await h.diskFixture();try{const {entry}=await save(f.api(),f.draft({destination:'calendar',dateISO:'2020-01-01',time:'13:45'}),f.scope,f.active),completion=h.load('lib/goActionCompletion.ts'),doc=completion.emptyCompletionDocument(f.scope);
  assert.equal(completion.completionDecision(entry,doc),undefined);assert.equal(completion.awaitingCompletion(entry,doc,Date.now()),true);
  const {entry:archived}=await move(f.api(),entry,'archive',f.scope,f.active);assert.equal(completion.awaitingCompletion(archived,doc,Date.now()),false);assert.equal(completion.completionDecision(archived,doc),undefined);
 }finally{f.close();}
});

test('concurrent edits, missing session and cross-context writes are refused without overwriting notes',async()=>{
 const f=await h.diskFixture();try{const {entry}=await save(f.api(),f.draft(),f.scope,f.active),edit=f.model.noteDraft(entry),other=f.model.noteDraft(entry);edit.content='Nueva versión';await save(f.api(),edit,f.scope,f.active);
  other.content='Versión obsoleta';await assert.rejects(save(f.api(),other,f.scope,f.active),/modificó/);assert.equal(f.rows[0].note.content,'Nueva versión');
  await f.setUser('other-user');await assert.rejects(save(f.api(),f.draft(),f.scope,f.active),/cuenta/);assert.equal(f.rows.length,1);
  await f.setUser(null);await assert.rejects(save(f.api(),f.draft(),f.scope,f.active),/cuenta/);assert.equal(f.rows.length,1);
  await f.setUser(f.scope.userId);f.changeContext('demo:BUSINESS:other');await assert.rejects(save(f.api(),f.draft(),f.scope,f.active),/contexto/);assert.equal(f.rows.length,1);
 }finally{f.close();}
});

test('protected saves and forged file associations are rejected before any ordinary persistence',async()=>{
 const f=await h.diskFixture();try{await assert.rejects(save(f.api(),f.draft({security:true,content:'private test fixture'}),f.scope,f.active),/seguridad no están activadas/);assert.equal(f.writes,0);
  const own=f.draft(),asset=await f.sourceFile(),attachment=await f.fileApi.importNoteFile(f.scope,own.id,asset);
  await assert.rejects(save(f.api(),f.draft({attachments:[attachment]}),f.scope,f.active),/pertenece/);assert.equal(f.writes,0);
  own.attachments=[attachment];fs.unlinkSync(fileURLToPath(attachment.uri));await assert.rejects(save(f.api(),own,f.scope,f.active),/adjunto/);assert.equal(f.writes,0);
  await assert.rejects(save(f.api(),f.draft({attachments:[{id:'bad',kind:'link',name:'bad',uri:'javascript:bad'}]}),f.scope,f.active),/enlace/);
 }finally{f.close();}
});

test('optional values do not prevent saving; calendar requires a real date/time; alerts stay unprogrammed outside calendar',async()=>{
 const f=await h.diskFixture();try{for(const patch of [{destination:'calendar'},{dateISO:'2027-02-30'},{time:'24:00'},{time:'03:60'},{reminderMinutes:-1}])await assert.rejects(save(f.api(),f.draft(patch),f.scope,f.active));
  const result=await save(f.api(),f.draft({reminderMinutes:15}),f.scope,f.active);assert.match(result.message,/sin programar/);assert.equal(f.osRequests.size,0);assert.equal(f.rows[0].note.reminderMinutes,15);
 }finally{f.close();}
});

test('ordinary editor opens both fields immediately without automatic keyboard and one save persists from that same form',async()=>{
 const f=await h.diskFixture(),ui=await h.editorFixture({scope:f.scope,onSave:d=>save(f.api(),d,f.scope,f.active)});
 try{assert.ok(ui.hosts.get('note-content'));assert.ok(ui.hosts.get('note-title'));assert.equal(ui.hosts.get('note-content').autoFocus,undefined);assert.equal(ui.hosts.get('note-title').autoFocus,undefined);
  await ui.run(()=>ui.hosts.get('note-content').onChangeText('Comprar leche'));assert.equal(ui.hosts.get('note-title').value,'');
  await ui.destination('pending');
  const press=ui.hosts.get('unified-note-save').onPress;await ui.run(()=>{press();press();});await ui.idle();assert.equal(f.rows.length,1);assert.equal(f.rows[0].note.content,'Comprar leche');assert.ok(ui.hosts.get('note-save-confirmation'));
 }finally{await ui.close();f.close();}
});

test('native dictation corrections, cursor-owned editing and optional configuration never unmount the content field',async()=>{
 const ui=await h.editorFixture();try{const instance=ui.instances.get('note-content');for(const text of ['Dictado nativo','Dictado natio','Dictado corregido','Texto insertado en medio']){await ui.run(()=>ui.hosts.get('note-content').onChangeText(text));assert.equal(ui.instances.get('note-content'),instance);assert.equal(ui.hosts.get('note-content').selection,undefined);}
  for(const option of ['date','time','duration','place','reminder','attachments']){await ui.tool(option);assert.equal(ui.instances.get('note-content'),instance);assert.equal(ui.hosts.get('note-content').value,'Texto insertado en medio');}
  await ui.run(()=>ui.hosts.get('note-microphone').onPress());assert.ok(ui.calls.some(c=>c[0]==='microphone'));
 }finally{await ui.close();}
});

test('failed UI save retains draft and error; normal close returns its unsaved content without inventing success',async()=>{
 const ui=await h.editorFixture({onSave:async()=>{throw Error('No se pudo guardar en disco');}});try{await ui.run(()=>ui.hosts.get('note-content').onChangeText('No perder texto'));await ui.destination('pending');await ui.run(()=>ui.hosts.get('unified-note-save').onPress());await ui.idle();
  assert.equal(ui.hosts.get('note-content').value,'No perder texto');assert.ok(ui.hosts.get('note-save-error'));assert.equal(ui.hosts.has('note-save-confirmation'),false);
  await ui.exit();const closed=ui.calls.find(c=>c[0]==='close')[1];assert.equal(closed.draft.content,'No perder texto');assert.equal(closed.saved,false);
 }finally{await ui.close();}
});

test('left/right editor keeps one shared square close, one save and a disabled real-security gate',async()=>{
 for(const handedness of ['left','right']){const ui=await h.editorFixture({handedness});try{assert.equal(ui.hosts.get('Cerrar nota').touchSize,56);assert.ok(ui.hosts.get('unified-note-save'));assert.ok(ui.hosts.get('note-security-info'));assert.equal(ui.hosts.has('note-floating-notice'),false);assert.match(ui.container.textContent,/NOTA/);assert.doesNotMatch(ui.container.textContent,/INTERNAL TASK|FICHA|SAVE|CAMBIAR AVISO/);}finally{await ui.close();}}
});

test('real editor attachment and location callbacks import a durable file, select a real result and persist both without a second form',async()=>{
 const disk=await h.diskFixture();let ui;try{const asset=await disk.sourceFile();let pickers=0;ui=await h.editorFixture({scope:disk.scope,onSave:d=>disk.api().saveUnifiedNote(d,disk.scope,disk.active),ports:{
 documents:{getDocumentAsync:async()=>{pickers++;return{canceled:false,assets:[asset]};}},importFile:disk.fileApi.importNoteFile,
 location:{geocodeAsync:async()=>[{latitude:38,longitude:-1},{latitude:39,longitude:-2}],reverseGeocodeAsync:async point=>[{street:point.latitude===38?'Calle uno':'Calle dos',streetNumber:'10',city:'Murcia'}],requestForegroundPermissionsAsync:()=>assert.fail('iOS address search should not request GPS permission')}}});
 await ui.run(()=>ui.hosts.get('note-content').onChangeText('Documento asociado'));
 await ui.tool('attachments');const pick=ui.hosts.get('PDF o documento').onPress;await ui.run(()=>{pick();pick();});await ui.idle();assert.equal(pickers,1);
 await ui.tool('place');await ui.run(()=>ui.hosts.get('note-place').onChangeText('Calle de búsqueda'));await ui.run(()=>ui.hosts.get('Buscar ubicación').onPress());await ui.idle();
 assert.equal(ui.hosts.get('note-place').value,'Calle de búsqueda','search proposes choices before replacing the selected location');await ui.run(()=>ui.hosts.get('note-location-result-1').onPress());assert.equal(ui.hosts.get('note-place').value,'Calle dos, 10, Murcia');
 await ui.destination('archive');await ui.run(()=>ui.hosts.get('unified-note-save').onPress());await ui.idle();assert.equal(disk.rows.length,1);const [loaded]=await disk.reopen();assert.equal(loaded.note.attachments.length,1);assert.equal(fs.readFileSync(fileURLToPath(loaded.note.attachments[0].uri),'utf8'),'fixture document');assert.equal(loaded.note.location.latitude,39);assert.equal(loaded.place,'Calle dos, 10, Murcia');
 }finally{if(ui)await ui.close();disk.close();}
});
