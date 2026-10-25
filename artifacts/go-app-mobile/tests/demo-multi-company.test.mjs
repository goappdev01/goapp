import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
const ts=createRequire(import.meta.url)("typescript"), owner="11111111-1111-4111-8111-111111111111", other="22222222-2222-4222-8222-222222222222";
function load(file,imports={}) { const exports={}; vm.runInNewContext(ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:key=>{if(key in imports)return imports[key];throw Error("Unexpected dependency "+key);},Date,Intl,Map,Set});return exports; }
const storeAPI=load("data/businessDemoStore.ts"),catalogAPI=load("data/businessDemoCatalog.ts",{"./businessDemoStore":storeAPI}),repoAPI=load("data/demoBookingRepository.ts",{"./businessDemoStore":storeAPI,"./bookingServices":load("data/bookingServices.ts")});
const plain=value=>JSON.parse(JSON.stringify(value));
const initial={businessName:"",address:"",cartaUrl:"",sectorId:null,subId:null,plantillaItems:[],activeDays:[0,1,2,3,4],openFrom:"09:00",openTo:"20:00",daySchedules:{},services:[],paymentPolicy:0,approvalPolicy:0,cancelPolicy:0,bookingEnabled:false,completedSteps:[],paymentMethod:null,isBusinessActive:false,staffSchedules:{}};
function fixture(memory=new Map(),user=owner,seed=initial) { let allowed=true,fail=false; const writes=[], storage={getItem:async key=>memory.get(key)??null,setItem:async(key,value)=>{if(fail)throw Error("disk failure");writes.push(key);memory.set(key,value);}};
 const make=()=>catalogAPI.createBusinessDemoCatalog({ownerUserId:user,storage,canUse:()=>allowed,initialConfig:seed});return {memory,writes,storage,make,catalog:make(),authorize:value=>allowed=value,fail:value=>fail=value}; }
async function configure(store,name="Test") { await store.updateConfig({businessName:name,address:"Dirección ficticia",sectorId:"belleza",subId:"peluqueria",services:[{name:"Servicio DEMO",duration:30,price:12}],plantillaItems:[{id:"post",label:"Profesional",count:1,staffNames:["Profesional ficticio"]}],completedSteps:[0,1,2,3,4,5,6,7]});await store.saveFloorPlan({id:store.planId,businessId:store.businessId,updatedAt:1,elements:[{id:"space",type:"silla",label:"Profesional ficticio",x:10,y:20,width:90,height:52,capacity:1,status:"disponible",reservable:true}]}); }
const repository=catalog=>repoAPI.createDemoCatalogBookingRepository(catalog,{now:()=>Date.parse("2030-01-07T08:00:00")});
async function bookingInput(repo,id){const item=(await repo.getBookableItems(id))[0];return {businessId:id,bookableItemId:item.id,customerId:owner,startDatetime:"2030-01-07T10:00:00",endDatetime:"2030-01-07T10:30:00",peopleCount:1,unitsReserved:1};}
test("opening the directory preserves the complete legacy company without writes or reseeding",async()=>{const f=fixture(),legacy=storeAPI.createBusinessDemoStore({ownerUserId:owner,storage:f.storage,canUse:()=>true,initialConfig:initial});await configure(legacy,"Existing");const before=plain(legacy.getSnapshot()),writes=f.writes.length;await f.catalog.load();assert.deepEqual(plain(f.catalog.getSelectedStore().getSnapshot()),before);assert.equal(f.writes.length,writes);});
test("creating hairdresser and restaurant keeps independent full documents after Reload",async()=>{const f=fixture();await f.catalog.load();const a=await f.catalog.create("GO PELUQUERÍA"),salon=f.catalog.getSelectedStore();await configure(salon,"GO PELUQUERÍA");const b=await f.catalog.create("GO RESTAURANTE"),restaurant=f.catalog.getSelectedStore();assert.notEqual(a,b);assert.notEqual(salon.businessId,restaurant.businessId);assert.equal(restaurant.getSnapshot().plan,null);assert.equal(restaurant.getSnapshot().config.services.length,0);await restaurant.updateConfig({phone:"912345678",address:"Otro lugar ficticio"});const restored=f.make();await restored.load();assert.equal(restored.getSelectedId(),b);assert.equal(restored.getSelectedStore().getSnapshot().config.phone,"912345678");await restored.select(a);assert.equal(restored.getSelectedStore().getSnapshot().config.businessName,"GO PELUQUERÍA");assert.equal(restored.getSelectedStore().getSnapshot().plan.elements[0].x,10);assert.equal(restored.getSelectedStore().getSnapshot().config.phone,undefined);});
test("simultaneous creation from mounted catalogs never loses another company",async()=>{const f=fixture(),second=f.make();await Promise.all([f.catalog.create("First"),second.create("Second")]);const restored=f.make();await restored.load();assert.equal(restored.getCompanies().length,3);assert.deepEqual(plain(restored.getCompanies().map(c=>c.name).slice(1).sort()),["First","Second"]);});
test("USER searches every ready DEMO company but excludes unconfigured and archived companies",async()=>{const f=fixture();await f.catalog.create("GO PELUQUERÍA");const a=f.catalog.getSelectedId();await configure(f.catalog.getSelectedStore(),"GO PELUQUERÍA");await f.catalog.create("GO RESTAURANTE");await configure(f.catalog.getSelectedStore(),"GO RESTAURANTE");const repo=repository(f.catalog);assert.equal((await repo.getActiveBusinesses()).length,2);assert.equal((await repo.searchBusinesses("peluqueria"))[0].name,"GO PELUQUERÍA");assert.equal((await repo.searchBusinesses("restaurante"))[0].name,"GO RESTAURANTE");await f.catalog.archive(a);assert.equal((await repo.getActiveBusinesses()).length,1);await f.catalog.recover(a);assert.equal((await repo.getActiveBusinesses()).length,2);});
test("same slot in two companies is independent; repeat claim in one company is rejected",async()=>{const f=fixture();await f.catalog.create("A");const a=f.catalog.getSelectedStore();await configure(a,"A");await f.catalog.create("B");const b=f.catalog.getSelectedStore();await configure(b,"B");const repo=repository(f.catalog),inputA=await bookingInput(repo,a.businessId),inputB=await bookingInput(repo,b.businessId);const first=await repo.createHold(inputA),second=await repo.createHold(inputB);assert.equal(first.ok,true);assert.equal(second.ok,true);await repo.claimSlot({...first.booking,status:"CONFIRMED"});await repo.claimSlot({...second.booking,status:"CONFIRMED"});assert.equal((await repo.createHold(inputA)).ok,false);assert.equal(a.getSnapshot().reservations.length,1);assert.equal(b.getSnapshot().reservations.length,1);assert.equal((await repo.getMyBookings()).length,2);assert.equal(repo.getCustomerEntries().length,2);await repo.cancelBooking(first.booking.id);assert.equal(a.getSnapshot().reservations[0].status,"cancelada");assert.equal(b.getSnapshot().reservations[0].status,"confirmada");const restored=f.make();await restored.load();assert.equal((await repository(restored).getMyBookings()).length,2);});
test("archive is recoverable after Reload and never erases company data",async()=>{const f=fixture();await f.catalog.create("Recover me");const id=f.catalog.getSelectedId(),store=f.catalog.getSelectedStore();await configure(store,"Recover me");const before=plain(store.getSnapshot());await f.catalog.archive(id);await assert.rejects(store.updateConfig({businessName:"Must fail"}),/no está autorizado/);const restored=f.make();await restored.load();assert.equal(restored.getCompanies().find(c=>c.id===id).archived,true);await restored.recover(id);assert.deepEqual(plain(restored.getSelectedStore().getSnapshot()),before);});
test("previous save restores only the selected company and corrupted backups fail without writes",async()=>{const f=fixture();await f.catalog.create("A");const store=f.catalog.getSelectedStore();await store.updateConfig({address:"Before"});await store.updateConfig({address:"After"});await store.restoreBackup();assert.equal(store.getSnapshot().config.address,"Before");const restored=f.make();await restored.load();assert.equal(restored.getSelectedStore().getSnapshot().config.address,"Before");const key=storeAPI.businessDemoStorageKey(owner,f.catalog.getSelectedId())+":backup";f.memory.set(key,"bad JSON");const n=f.writes.length;await assert.rejects(store.restoreBackup());assert.equal(f.writes.length,n);});
test("failed directory save never publishes a selection or removes an existing company",async()=>{const f=fixture();await f.catalog.create("Keep");const before=f.catalog.getSelectedId();f.fail(true);await assert.rejects(f.catalog.create("Fail"),/disk failure/);assert.equal(f.catalog.getSelectedId(),before);assert.equal(f.catalog.getCompanies().length,2);});
test("foreign IDs, owner revocation and other accounts cannot access or alter this catalog",async()=>{const memory=new Map([["go_business_config_v1","REAL"],["go_bookings_v1","REAL"]]),f=fixture(memory),g=fixture(memory,other);await f.catalog.create("Owner A");await g.catalog.create("Owner B");await assert.rejects(g.catalog.select(f.catalog.getSelectedId()));assert.throws(()=>repository(g.catalog).getBookableItems(f.catalog.getSelectedStore().businessId));f.authorize(false);await assert.rejects(f.catalog.create("Blocked"));await assert.rejects(repository(f.catalog).getActiveBusinesses());assert.equal(memory.get("go_business_config_v1"),"REAL");assert.equal(memory.get("go_bookings_v1"),"REAL");assert.ok(f.writes.every(key=>key.startsWith(storeAPI.businessDemoStorageKey(owner))));});
test("export includes configuration, floor and reservations but no authentication session",async()=>{const f=fixture();await f.catalog.create("Backup");await configure(f.catalog.getSelectedStore());const exported=JSON.parse(await f.catalog.exportBackup());assert.equal(exported.format,"go-demo-backup");assert.equal(exported.ownerUserId,owner);assert.equal(exported.companies.length,2);assert.equal(exported.companies[1].data.plan.elements.length,1);assert.doesNotMatch(JSON.stringify(exported),/access_token|refresh_token|password|service_role/);});

 test("export/import restores all companies including archived data on another device for the same owner",async()=>{
  const f=fixture();await f.catalog.create("GO PELUQUERÍA");const a=f.catalog.getSelectedId();await configure(f.catalog.getSelectedStore(),"GO PELUQUERÍA");await f.catalog.create("GO RESTAURANTE");await configure(f.catalog.getSelectedStore(),"GO RESTAURANTE");await f.catalog.archive(a);
  const backup=await f.catalog.exportBackup(),remote=fixture();await remote.catalog.importBackup(backup);const again=remote.make();await again.load();assert.equal(again.getCompanies().length,3);assert.equal(again.getCompanies().find(c=>c.id===a).archived,true);await again.recover(a);assert.equal(again.getSelectedStore().getSnapshot().config.businessName,"GO PELUQUERÍA");assert.equal(again.getSelectedStore().getSnapshot().plan.elements[0].x,10);
 });
 test("foreign-owner or mixed-production backup validates completely before any write",async()=>{
  const f=fixture();await f.catalog.create("Keep");const exported=JSON.parse(await f.catalog.exportBackup()),before=f.writes.length;
  for(const mutate of [copy=>copy.ownerUserId=other,copy=>copy.companies[0].data.ownerUserId=other,copy=>copy.companies[1].data.config.businessId="real-business",copy=>copy.companies[1].data.entries.push({id:"foreign",businessId:"real"})]){const copy=plain(exported);mutate(copy);await assert.rejects(f.catalog.importBackup(JSON.stringify(copy)));assert.equal(f.writes.length,before);}
 });
 test("manual reservations sharing an ID across companies have unique customer entries and cancel only their company",async()=>{
  const f=fixture();await f.catalog.create("A");const a=f.catalog.getSelectedStore();await configure(a,"A");await f.catalog.create("B");const b=f.catalog.getSelectedStore();await configure(b,"B");
  for(const store of [a,b])await store.saveReservations(store.planId,[{id:"manual-same-id",planId:store.planId,elementId:"space",customerName:"Cliente ficticio",dateISO:"2030-01-07",date:"Prueba",time:"12:00",status:"pendiente",createdAt:1}]);
  const repo=repository(f.catalog),entries=repo.getCustomerEntries();assert.equal(new Set(entries.map(entry=>entry.id)).size,2);assert.equal(new Set((await repo.getMyBookings()).map(booking=>booking.id)).size,2);await assert.rejects(repo.cancelCustomerEntry("manual-same-id"),/ambigua/);await repo.cancelCustomerEntry("manual-same-id",b.businessId);assert.equal(a.getSnapshot().reservations[0].status,"pendiente");assert.equal(b.getSnapshot().reservations[0].status,"cancelada");
 });

 test("a backup containing a case alias cannot overwrite a company before the merged directory is validated",async()=>{
  const f=fixture();await f.catalog.create("Keep");const id=f.catalog.getSelectedId(),copy=JSON.parse(await f.catalog.exportBackup());copy.companies.find(record=>record.company.id===id).company.id=id.toUpperCase();copy.selected=id.toUpperCase();const before=f.writes.length;await assert.rejects(f.catalog.importBackup(JSON.stringify(copy)));assert.equal(f.writes.length,before);assert.equal(f.catalog.getSelectedStore().getSnapshot().config.businessName,"Keep");
 });


test('three configured businesses retain separate staff, specialties, services, floor, bookings and calendars on switch and reopening',async()=>{
 const f=fixture(),companies=[];
 for(const name of ['GO PELUQUERÍA','GO RESTAURANTE','Tercer negocio']){
  const id=await f.catalog.create(name),store=f.catalog.getSelectedStore();await configure(store,name);
  await store.updateConfig({address:'Dirección local '+name,phone:'912345678',coordinates:{latitude:40,longitude:-3}});
  companies.push({id,store});
 }
 const repo=repository(f.catalog);
 for(const {store} of companies){const hold=await repo.createHold(await bookingInput(repo,store.businessId));assert.equal(hold.ok,true);await repo.claimSlot({...hold.booking,status:'CONFIRMED'});}
 const snapshots=companies.map(({store})=>plain(store.getSnapshot()));
 assert.equal(new Set(companies.map(({store})=>store.businessId)).size,3);
 assert.equal(repo.getCustomerEntries().length,3);
 for(let i=0;i<companies.length;i++){
  await f.catalog.select(companies[i].id);const current=f.catalog.getSelectedStore();assert.deepEqual(plain(current.getSnapshot()),snapshots[i]);
  assert.equal(current.getSnapshot().entries.length,1);assert.equal(current.getSnapshot().reservations.length,1);assert.equal(current.getSnapshot().entries[0].businessId,current.businessId);
 }
 const reopened=f.make();await reopened.load();assert.equal(reopened.getSelectedId(),companies[2].id);
 for(let i=0;i<companies.length;i++){await reopened.select(companies[i].id);assert.deepEqual(plain(reopened.getSelectedStore().getSnapshot()),snapshots[i]);}
 assert.equal((await repository(reopened).getMyBookings()).length,3);assert.equal(repository(reopened).getCustomerEntries().length,3);
 assert.ok(f.writes.every(key=>key.startsWith(storeAPI.businessDemoStorageKey(owner))));
});


test('a third business starts with eight unconfirmed steps even with suggested hours and activity defaults',async()=>{
 const f=fixture(),prior=[];for(const name of ['GO PELUQUERÍA','GO RESTAURANTE']){const id=await f.catalog.create(name),store=f.catalog.getSelectedStore();await configure(store,name);prior.push([id,JSON.stringify(store.getSnapshot())]);}
 const thirdId=await f.catalog.create('Tercer negocio independiente'),third=f.catalog.getSelectedStore();
 assert.equal(storeAPI.getBusinessDemoSetupState(third.getSnapshot().config,third.getSnapshot().plan).completed,0);
 await third.updateConfig({sectorId:'belleza',subId:'peluqueria',services:[{name:'Servicio sugerido',duration:30,price:12}],plantillaItems:[{id:'puesto',label:'Puesto',count:1}]});
 assert.deepEqual(plain(storeAPI.getBusinessDemoSetupState(third.getSnapshot().config,null).steps),Array(8).fill(false));
 await third.updateConfig({completedSteps:[0,2,3,4],services:[{name:'Servicio propio',duration:45,price:17}],plantillaItems:[{id:'puesto',label:'Profesional',count:1,staffNames:['Profesional propio'],staffServices:[['Servicio propio']]}]});
 const expected=[...prior,[thirdId,JSON.stringify(third.getSnapshot())]];
 for(const catalog of [f.catalog,f.make(),f.make()]){await catalog.load();for(const [id,doc]of expected){await catalog.select(id);assert.equal(JSON.stringify(catalog.getSelectedStore().getSnapshot()),doc);}}
 const reopened=f.make();await reopened.load();assert.equal(reopened.getSelectedId(),thirdId);assert.equal(storeAPI.getBusinessDemoSetupState(reopened.getSelectedStore().getSnapshot().config,null).completed,4);
});

test('fresh business seeds never carry data from a configured business and load never rewrites existing documents',async()=>{
 const f=fixture();await f.catalog.create('GO PELUQUERÍA');const salon=f.catalog.getSelectedStore();await configure(salon,'GO PELUQUERÍA');await salon.updateConfig({phone:'912345678',mobile:'612345678',whatsapp:'612345678',coordinates:{latitude:40,longitude:-3},staffSchedules:{test:{daySchedules:{}}}});
 const kept=JSON.stringify(salon.getSnapshot()),seed=plain(salon.getSnapshot().config),seedCopy=JSON.stringify(seed);
 const second=fixture(f.memory,owner,seed);await second.catalog.load();assert.equal(second.catalog.getSelectedStore().getSnapshot().config.businessName,'GO PELUQUERÍA');
 const restaurantId=await second.catalog.create('GO RESTAURANTE'),restaurant=second.catalog.getSelectedStore(),blank=restaurant.getSnapshot();
 for(const [field,expected]of Object.entries({address:'',sectorId:null,subId:null,services:[],plantillaItems:[],staffSchedules:{},completedSteps:[],daySchedules:{}}))assert.deepEqual(plain(blank.config[field]),expected,field);
 for(const field of ['phone','mobile','whatsapp','coordinates'])assert.equal(blank.config[field],undefined,field);
 assert.equal(blank.plan,null);assert.equal(blank.reservations.length,0);assert.equal(blank.bookings.length,0);assert.equal(blank.entries.length,0);assert.equal(storeAPI.getBusinessDemoSetupState(blank.config,blank.plan).completed,0);
 assert.equal(JSON.stringify(seed),seedCopy);assert.equal(JSON.stringify(salon.getSnapshot()),kept);
 const bytes=Array.from(f.memory),reopened=second.make();await reopened.load();await reopened.getSelectedStore().load();assert.deepEqual(Array.from(f.memory),bytes);assert.equal(reopened.getSelectedId(),restaurantId);assert.equal(reopened.getSelectedStore().getSnapshot().config.address,'');
});
