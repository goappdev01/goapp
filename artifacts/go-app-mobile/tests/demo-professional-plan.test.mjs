import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
const ts=createRequire(path.join(process.cwd(),"package.json"))("typescript");
function load(name,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(name,"utf8"),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:key=>{if(key in imports)return imports[key];throw Error("External dependency forbidden: "+key)},Date,Intl,Math,Set,Map,console});return exports;}
const api=load("data/businessDemoStore.ts"),booking=load("data/demoBookingRepository.ts",{"./businessDemoStore":api,"./bookingServices":load("data/bookingServices.ts")});
const owner="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222",company="33333333-3333-4333-8333-333333333333";
const plain=value=>JSON.parse(JSON.stringify(value));
const initial={businessName:"",address:"",cartaUrl:"",sectorId:null,subId:null,plantillaItems:[],activeDays:[],openFrom:"09:00",openTo:"18:00",daySchedules:{},services:[],paymentPolicy:0,approvalPolicy:0,cancelPolicy:0,bookingEnabled:false,completedSteps:[],paymentMethod:null,isBusinessActive:false,staffSchedules:{}};
function fixture(companyId,shared=new Map(),userId=owner){const writes=[];const storage={async getItem(key){return shared.get(key)??null},async setItem(key,value){writes.push(key);shared.set(key,value)}};const make=()=>api.createBusinessDemoStore({ownerUserId:userId,companyId,storage,initialConfig:initial,canUse:()=>true,keepBackup:true});const store=make();return {store,make,shared,writes,repo:booking.createDemoBookingRepository(store,{now:()=>Date.parse("2030-01-07T08:00:00")})};}
async function setup(f){await f.store.updateConfig({businessName:"Salon de prueba",address:"Direccion de prueba",phone:"912345678",sectorId:"belleza",subId:"peluqueria",activeDays:[0,1,2,3,4],services:[{name:"Corte",duration:30,price:12},{name:"Tinte",duration:60,price:20}],plantillaItems:[{id:"posts",emoji:"chair",label:"Puestos",count:2,staffNames:["Profesional Uno","Profesional Dos"],staffServices:[["Corte"],["Corte"]]}],completedSteps:[0,1,2,3,4,5,6,7]});const staff=await f.repo.getStaff(f.store.businessId);await f.store.saveFloorPlan({id:f.store.planId,businessId:f.store.businessId,updatedAt:1,elements:staff.map((person,index)=>({id:"original_"+index,type:"silla",label:person.name,capacity:1,x:15+index*100,y:20+index*60,width:160,height:52,status:"disponible",reservable:true}))});return staff;}
async function hold(f,person){const service=(await f.repo.getBookableItems(f.store.businessId))[0];const result=await f.repo.createHold({businessId:f.store.businessId,bookableItemId:service.id,staffId:person.id,customerId:f.store.ownerUserId,startDatetime:"2030-01-07T10:00:00",endDatetime:"2030-01-07T10:30:00",unitsReserved:1,peopleCount:1});assert.equal(result.ok,true);return result.booking;}
function withoutFirst(config){const item=config.plantillaItems[0];return [{...item,count:1,staffNames:item.staffNames.slice(1),staffIds:item.staffIds.slice(1),staffServices:item.staffServices.slice(1)}]}

test("rename and specialties keep the professional and floor identity, geometry, booking and reload",async()=>{
 const f=fixture();const people=await setup(f),held=await hold(f,people[0]);await f.repo.claimSlot({...held,status:"CONFIRMED",holdExpiresAt:undefined});const before=plain(f.store.getSnapshot());
 const item=before.config.plantillaItems[0];await f.store.updateConfig({plantillaItems:[{...item,staffNames:["Nombre corregido",item.staffNames[1]],staffServices:[["Corte","Tinte"],["Corte"]]}]});
 const after=await f.make().load(),person=api.getBusinessDemoProfessionals(after.config,f.store.businessId)[0],element=api.businessDemoProfessionalElement(after,person);
 assert.equal(person.id,people[0].id);assert.equal(person.serviceIds.length,2);assert.equal(element.id,"original_0");assert.equal(element.label,"Nombre corregido");
 for(const field of ["x","y","width","height","capacity"])assert.equal(element[field],before.plan.elements[0][field]);
 assert.deepEqual(plain(after.bookings),before.bookings);assert.deepEqual(plain(after.reservations),before.reservations);assert.deepEqual(plain(after.entries),before.entries);
 assert.equal((await f.repo.getMyBookings())[0].id,held.id);assert.equal((await f.repo.getStaff(f.store.businessId))[0].id,people[0].id);
});

test("deleting a professional archives only their representation and keeps reservation history cancellable",async()=>{
 const f=fixture();const people=await setup(f),held=await hold(f,people[0]);assert.equal((await f.repo.claimSlot({...held,status:"CONFIRMED",holdExpiresAt:undefined})).ok,true);
 const before=plain(f.store.getSnapshot());await f.store.updateConfig({plantillaItems:withoutFirst(before.config)});const data=await f.make().load();
 assert.deepEqual(plain(api.visibleBusinessDemoElements(data.plan).map(element=>element.id)),["original_1"]);assert.equal(data.plan.elements.find(element=>element.id==="original_0").demoArchived,true);
 assert.deepEqual(plain(data.bookings),before.bookings);assert.deepEqual(plain(data.entries),before.entries);assert.deepEqual(plain(data.reservations),before.reservations);
 assert.deepEqual(plain(await f.repo.getAllSlots(f.store.businessId,held.bookableItemId,"2030-01-07",people[0].id)),[]);
 await assert.rejects(f.store.saveReservations(f.store.planId,[{...data.reservations[0],time:"11:00",endDatetime:"2030-01-07T11:30:00"}]),/puesto DEMO|Profesional DEMO/);
 await f.repo.cancelCustomerEntry(data.entries[0].reservationId);assert.equal(f.store.getSnapshot().bookings[0].status,"CANCELLED");assert.equal(f.store.getSnapshot().plan.elements.length,2);
});

test("removing a professional never removes an explicitly physical chair or its characteristics",async()=>{
 const f=fixture();const people=await setup(f);const data=plain(f.store.getSnapshot());data.plan.elements[0].demoKind="physical";data.plan.elements[0].label="Silla fisica";await f.store.saveFloorPlan(data.plan);
 const original=plain(f.store.getSnapshot().plan.elements[0]);await f.store.updateConfig({plantillaItems:withoutFirst(f.store.getSnapshot().config)});const chair=f.store.getSnapshot().plan.elements.find(element=>element.id===original.id);
 assert.ok(api.visibleBusinessDemoElements(f.store.getSnapshot().plan).includes(chair));assert.equal(chair.demoStaffId,undefined);assert.equal(chair.demoArchived,original.demoArchived);
 for(const field of ["id","label","type","x","y","width","height","capacity","reservable"])assert.equal(chair[field],original[field]);assert.equal((await f.repo.getStaff(f.store.businessId)).some(person=>person.id===people[0].id),false);
});

test("a new professional with an old name gets a new identity and one representation, including after re-entry",async()=>{
 const f=fixture();const people=await setup(f);await f.store.updateConfig({plantillaItems:withoutFirst(f.store.getSnapshot().config)});
 const item=plain(f.store.getSnapshot().config.plantillaItems[0]);await f.store.updateConfig({plantillaItems:[{...item,count:2,staffNames:[...item.staffNames,people[0].name],staffServices:[...item.staffServices,["Corte"]]}]});
 const active=await f.repo.getStaff(f.store.businessId),newPerson=active.find(person=>person.name===people[0].name);assert.notEqual(newPerson.id,people[0].id);
 for(let index=0;index<3;index++)await f.store.reconcileProfessionalPlan();const restored=await f.make().load(),visible=api.visibleBusinessDemoElements(restored.plan);
 assert.equal(visible.length,2);assert.equal(visible.filter(element=>element.demoStaffId===newPerson.id).length,1);assert.equal(new Set(visible.map(element=>element.id)).size,2);assert.equal(restored.plan.elements.length,3);
});

test("professionals with identical names remain distinct by identity and cannot duplicate a floor representation",async()=>{
 const f=fixture();await setup(f);const item=plain(f.store.getSnapshot().config.plantillaItems[0]);await f.store.updateConfig({plantillaItems:[{...item,staffNames:["Nombre compartido","Nombre compartido"]}]});
 const people=await f.repo.getStaff(f.store.businessId);assert.equal(people.length,2);assert.notEqual(people[0].id,people[1].id);
 const plan=plain(f.store.getSnapshot().plan);plan.elements.push({...plan.elements[0],id:"duplicated_representation",x:300});await f.store.saveFloorPlan(plan);
 const data=await f.make().load(),visible=api.visibleBusinessDemoElements(data.plan);assert.equal(visible.length,2);assert.equal(new Set(visible.map(element=>element.demoStaffId)).size,2);assert.equal(data.plan.elements.find(element=>element.id==="duplicated_representation").demoArchived,true);
});

test("legacy orphan detection requires historical evidence; ambiguous elements remain reviewable without deletion",async()=>{
 const f=fixture();const people=await setup(f);const held=await hold(f,people[0]);await f.repo.claimSlot({...held,status:"CONFIRMED",holdExpiresAt:undefined});
 const key=api.businessDemoStorageKey(owner),raw=JSON.parse(f.shared.get(key));raw.config.plantillaItems=withoutFirst(raw.config);
 for(const element of raw.plan.elements){delete element.demoStaffId;delete element.demoKind;delete element.demoArchived;}
 raw.plan.elements.push({...raw.plan.elements[1],id:"ambiguous",label:"Nombre antiguo desconocido",x:333});f.shared.set(key,JSON.stringify(raw));const source=f.shared.get(key),restored=f.make();const data=await restored.load();
 assert.equal(f.shared.get(key),source,"Reading never deletes or rewrites legacy data");assert.equal(data.plan.elements.find(element=>element.id==="original_0").demoArchived,true);assert.equal(data.bookings[0].staffId,people[0].id);
 const unknown=data.plan.elements.find(element=>element.id==="ambiguous");assert.equal(api.businessDemoElementRequiresReview(unknown),true);assert.equal(unknown.demoArchived,undefined);
 await assert.rejects(restored.saveReservations(restored.planId,[{id:"unsafe",planId:restored.planId,elementId:"ambiguous",dateISO:"2030-01-07",date:"Lunes",time:"12:00",status:"pendiente",customerName:"Prueba",createdAt:1}]),/Revisa/);
 await restored.classifyLegacyElement("ambiguous","professional");assert.equal(api.visibleBusinessDemoElements(restored.getSnapshot().plan).some(element=>element.id==="ambiguous"),false);assert.equal(restored.getSnapshot().plan.elements.find(element=>element.id==="ambiguous").x,333);assert.equal(restored.getSnapshot().bookings[0].id,held.id);
});

test("explicit legacy physical classification survives reload and never changes its position",async()=>{
 const f=fixture();await setup(f);const plan=plain(f.store.getSnapshot().plan);plan.elements.push({...plan.elements[0],id:"physical_unknown",label:"Puesto fisico extra",demoStaffId:undefined,demoKind:undefined,demoArchived:undefined,x:350});await f.store.saveFloorPlan(plan);
 await f.store.classifyLegacyElement("physical_unknown","physical");const data=await f.make().load(),element=data.plan.elements.find(element=>element.id==="physical_unknown");assert.equal(element.demoKind,"physical");assert.equal(element.x,350);assert.ok(api.visibleBusinessDemoElements(data.plan).some(value=>value.id===element.id));
});

test("reordering slots and renaming preserve individual schedules and assignment to their existing post",async()=>{
 const f=fixture();const people=await setup(f),item=plain(f.store.getSnapshot().config.plantillaItems[0]);
 await f.store.updateConfig({staffSchedules:{[people[0].id]:{useCompanySchedule:false,daySchedules:{"0":{shift1:{from:"12:00",to:"14:00",active:true},shift2:{from:"15:00",to:"17:00",active:false}}}}}});
 await f.store.updateConfig({plantillaItems:[{...item,staffIds:[item.staffIds[1],item.staffIds[0]],staffNames:[item.staffNames[1],"Nombre cambiado"],staffServices:[item.staffServices[1],item.staffServices[0]]}]});
 const data=await f.make().load(),person=(await f.repo.getStaff(f.store.businessId)).find(person=>person.id===people[0].id);assert.equal(api.businessDemoProfessionalElement(data,person).id,"original_0");assert.deepEqual(plain(api.getBusinessDemoShifts(data.config,"2030-01-07",person)),[{from:720,to:840}]);
});

test("professional/floor cleanup stays inside its company and owner, retaining backup and real keys",async()=>{
 const shared=new Map([["go_business_config_v1","REAL"],["go_floor_plan_v1_real","REAL"]]),a=fixture(undefined,shared),b=fixture(company,shared),c=fixture(undefined,shared,other);
 await setup(a);await setup(b);await setup(c);const bBefore=plain(b.store.getSnapshot()),cBefore=plain(c.store.getSnapshot());
 await a.store.updateConfig({plantillaItems:withoutFirst(a.store.getSnapshot().config)});assert.deepEqual(plain(await b.make().load()),bBefore);assert.deepEqual(plain(await c.make().load()),cBefore);assert.equal(shared.get("go_business_config_v1"),"REAL");assert.equal(shared.get("go_floor_plan_v1_real"),"REAL");
 const before=shared.get(api.businessDemoStorageKey(owner));await assert.rejects(a.store.updateConfig({plantillaItems:bBefore.config.plantillaItems}),/otra empresa/);assert.equal(shared.get(api.businessDemoStorageKey(owner)),before);assert.ok(shared.has(api.businessDemoStorageKey(owner)+":backup"));assert.ok(a.writes.every(key=>key===api.businessDemoStorageKey(owner)||key===api.businessDemoStorageKey(owner)+":backup"));
});

test("an explicitly retired legacy representation never reappears for a new professional with the same name",async()=>{
 const f=fixture();await setup(f);const plan=plain(f.store.getSnapshot().plan);plan.elements.push({...plan.elements[0],id:"legacy_retired",label:"Futuro profesional",demoStaffId:undefined,demoKind:undefined,demoArchived:undefined,x:400,y:130});await f.store.saveFloorPlan(plan);
 await f.store.classifyLegacyElement("legacy_retired","professional");const item=plain(f.store.getSnapshot().config.plantillaItems[0]);
 await f.store.updateConfig({plantillaItems:[{...item,count:3,staffNames:[...item.staffNames,"Futuro profesional"],staffServices:[...item.staffServices,["Corte"]]}]});await f.store.reconcileProfessionalPlan();
 const data=await f.make().load(),person=api.getBusinessDemoProfessionals(data.config,f.store.businessId).at(-1),retired=data.plan.elements.find(element=>element.id==="legacy_retired");
 assert.equal(retired.demoArchived,true);assert.equal(retired.reservable,false);assert.equal(retired.demoStaffId,undefined);assert.equal(retired.x,400);assert.equal(retired.y,130);
 const current=data.plan.elements.filter(element=>element.demoStaffId===person.id&&!element.demoArchived);assert.equal(current.length,1);assert.notEqual(current[0].id,retired.id);assert.equal(data.plan.elements.length,4);
});


async function restaurant(f,count=10){
 await f.store.updateConfig({businessName:"Restaurante de prueba",address:"Dirección ficticia",sectorId:"restauracion",subId:"restaurante",activeDays:[0,1,2,3,4],services:[{name:"Mesa DEMO",duration:30,price:0}],completedSteps:[0,1,2,3,4,5,6,7],plantillaItems:[{id:"tables",emoji:"🪑",label:"Mesas interiores",count}]});
 await f.store.reconcileProfessionalPlan();
}
test("ten configured tables become ten stable bookable resources; increasing to twelve preserves placed geometry and reload",async()=>{
 const f=fixture(company);await restaurant(f);let plan=plain(f.store.getSnapshot().plan);
 assert.equal(api.visibleBusinessDemoElements(plan).length,10);assert.equal(new Set(plan.elements.map(element=>element.demoSpaceId)).size,10);
 assert.ok(plan.elements.every(element=>element.type==="mesa"&&element.demoKind==="physical"&&!element.demoStaffId&&element.reservable));
 plan.elements[0].x=235;plan.elements[0].y=360;plan.elements[0].capacity=6;plan.elements[0].label="Mesa junto a la ventana";await f.store.saveFloorPlan(plan);
 const original=plain(f.store.getSnapshot().plan.elements);
 await f.store.updateConfig({plantillaItems:[{...f.store.getSnapshot().config.plantillaItems[0],count:12}]});
 for(let i=0;i<3;i++)await f.store.reconcileProfessionalPlan();
 const after=await f.make().load();assert.equal(after.plan.elements.length,12);assert.equal(new Set(after.plan.elements.map(element=>element.id)).size,12);
 assert.deepEqual(plain(after.plan.elements.slice(0,10)),original);
 const service=(await f.repo.getBookableItems(f.store.businessId))[0],slots=await f.repo.getAllSlots(f.store.businessId,service.id,"2030-01-07");
 assert.equal(slots[0].availableUnits,12);assert.equal((await f.repo.getStaff(f.store.businessId)).length,0);
 assert.ok(f.writes.every(key=>key.startsWith(api.businessDemoStorageKey(owner,company))));
});
test("reducing a table with an active reservation is refused; after cancellation history and position remain recoverable",async()=>{
 const f=fixture(company);await restaurant(f,12);const before=plain(f.store.getSnapshot()),last=before.plan.elements[11];
 await f.store.saveReservations(f.store.planId,[{id:"last-table-booking",planId:f.store.planId,elementId:last.id,customerName:"Cliente de prueba",date:"2030-01-07",dateISO:"2030-01-07",time:"10:00",status:"confirmada",durationMinutes:30,createdAt:1}]);
 const count11={...f.store.getSnapshot().config.plantillaItems[0],count:11},persisted=plain(f.store.getSnapshot());
 await assert.rejects(f.store.updateConfig({plantillaItems:[count11]}),/reserva activa/);
 assert.deepEqual(plain(await f.make().load()),persisted);assert.equal(f.repo.getCustomerEntries().length,1);assert.equal(f.store.getSnapshot().entries.length,1);
 await f.repo.cancelCustomerEntry("last-table-booking");const history=plain(f.store.getSnapshot().bookings);
 await f.store.updateConfig({plantillaItems:[count11]});const reduced=await f.make().load();
 assert.equal(api.visibleBusinessDemoElements(reduced.plan).length,11);assert.equal(reduced.plan.elements.length,12);
 assert.equal(reduced.plan.elements.find(element=>element.id===last.id).reservable,false);assert.deepEqual(plain(reduced.bookings),history);
 await f.store.updateConfig({plantillaItems:[{...count11,count:12}]});const restored=f.store.getSnapshot().plan.elements.find(element=>element.id===last.id);
 assert.equal(restored.demoArchived,false);assert.equal(restored.reservable,true);assert.equal(restored.x,last.x);assert.equal(restored.y,last.y);assert.equal(f.store.getSnapshot().plan.elements.length,12);
});
test("legacy generated tables are adopted once without replacing IDs, manually placed resources or their reservations",async()=>{
 const f=fixture(company);await f.store.updateConfig({sectorId:"restauracion",subId:"restaurante",plantillaItems:[{id:"tables",emoji:"🪑",label:"Mesas interiores",count:10}]});
 const tables=Array.from({length:3},(_,i)=>({id:"legacy_table_"+i,type:"mesa",label:"🪑 "+(i+1),x:100+i*80,y:120,width:80,height:80,capacity:4,status:"disponible",reservable:true}));
 const manual={...tables[0],id:"manual",type:"zona",label:"Rincón manual",x:5,y:9,width:300,capacity:15};
 await f.store.saveFloorPlan({id:f.store.planId,businessId:f.store.businessId,elements:[...tables,manual],updatedAt:1});
 for(let i=0;i<3;i++)await f.store.reconcileProfessionalPlan();
 const after=await f.make().load();assert.equal(after.plan.elements.filter(element=>element.type==="mesa").length,10);
 for(const old of tables){const element=after.plan.elements.find(value=>value.id===old.id);assert.ok(element.demoSpaceId);for(const field of ["id","x","y","width","height","capacity","label"])assert.equal(element[field],old[field]);}
 assert.deepEqual(plain(after.plan.elements.find(element=>element.id===manual.id)),manual);
});
test("configured terraces, cabins and workstations keep their physical type and never generate professionals",async()=>{
 const f=fixture(company);await f.store.updateConfig({sectorId:"servicios",subId:"coworking",plantillaItems:[
 {id:"terrace",label:"Terraza",emoji:"🌿",count:2},{id:"cabin",label:"Cabinas",emoji:"🚪",count:2},{id:"post",label:"Puestos de trabajo",emoji:"💺",count:3}]});
 await f.store.reconcileProfessionalPlan();const plan=f.store.getSnapshot().plan;
 assert.equal(plan.elements.length,7);assert.deepEqual(plain(plan.elements.map(element=>element.type)),["zona","zona","sala","sala","silla","silla","silla"]);
 assert.equal(api.getBusinessDemoProfessionals(f.store.getSnapshot().config,f.store.businessId).length,0);
 assert.ok(plan.elements.every(element=>!element.demoStaffId));
});
test("restaurant resources remain isolated from a salon and another authenticated owner across new storage adapters",async()=>{
 const shared=new Map(),a=fixture(company,shared),b=fixture(undefined,shared),c=fixture(company,shared,other);
 await restaurant(a,12);await setup(b);await restaurant(c,2);const salon=plain(b.store.getSnapshot());
 await a.store.updateConfig({plantillaItems:[{...a.store.getSnapshot().config.plantillaItems[0],count:10}]});
 assert.deepEqual(plain(await b.make().load()),salon);assert.equal((await c.make().load()).plan.elements.length,2);
 assert.ok((await b.make().load()).plan.elements.every(element=>element.type==="silla"&&!element.demoSpaceId));
 assert.equal((await a.make().load()).plan.elements.filter(element=>!element.demoArchived).length,10);
});

test("old sector-only terrace resources acquire the correct type without creating a second resource or moving it",async()=>{
 const f=fixture(company);await f.store.updateConfig({sectorId:"restauracion",subId:"restaurante",plantillaItems:[{id:"terrace",label:"Terraza",emoji:"🌿",count:1}]});
 const original={id:"old-terrace",label:"🌿",type:"mesa",x:167,y:246,width:245,height:123,capacity:16,status:"disponible",reservable:true};
 await f.store.saveFloorPlan({id:f.store.planId,businessId:f.store.businessId,elements:[original],updatedAt:1});const plan=await f.store.reconcileProfessionalPlan();
 assert.equal(plan.elements.length,1);assert.equal(plan.elements[0].type,"zona");assert.equal(plan.elements[0].demoKind,"physical");
 for(const key of ["id","x","y","width","height","capacity"])assert.equal(plan.elements[0][key],original[key]);
 assert.deepEqual(plain((await f.make().load()).plan.elements),plain(plan.elements));
});
