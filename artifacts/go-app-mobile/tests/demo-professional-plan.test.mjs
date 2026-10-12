import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
const ts=createRequire(path.join(process.cwd(),"package.json"))("typescript");
function load(name,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(name,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:key=>{if(key in imports)return imports[key];throw Error("External dependency forbidden: "+key)},Date,Intl,Math,Set,Map,console});return exports;}
const api=load("data/businessDemoStore.ts"),booking=load("data/demoBookingRepository.ts",{"./businessDemoStore":api});
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
