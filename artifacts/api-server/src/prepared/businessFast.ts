/** Isolated server application service. NOT registered as a route or deployed.
 * Its transaction/engine adapter needs the reviewed guest schema before use.
 * Never substitute the owner as customer_id or calculate a second availability.
 */
export type GuestCommand={businessId:string;staffId:string;serviceIds:string[];startsAt:string;expectedPlan:unknown;
 customer:{name:string;phone:string|null;contactId:string|null;remember:boolean}};
export type GuestContact={id:string;businessId:string;name:string;phone:string|null};
export type GuestReceipt={id:string;businessId:string;staffId:string;customerId:null;status:"CONFIRMED";plan:unknown;contactId:string|null;requestId:string};
type Operation={actorId:string;businessId:string;requestId:string;signature:string;receipt:GuestReceipt};
export type GuestTransaction={
 /** Acquire the SAME business transaction lock used by the existing planner. */
 lockBusiness(businessId:string):Promise<void>;
 /** Effective owner/employee permission from server tables, never metadata. */
 mayManage(actorId:string,businessId:string,staffId?:string):Promise<boolean>;
 operation(actorId:string,businessId:string,requestId:string):Promise<Operation|null>;
 saveOperation(operation:Operation):Promise<void>;
 contact(businessId:string,id:string):Promise<GuestContact|null>;
 searchContacts(businessId:string,query:string,limit:number):Promise<GuestContact[]>;
 /** Create by explicit choice, update only explicit contactId; no name/phone merge. */
 saveContact(businessId:string,selectedId:string|null,name:string,phone:string|null):Promise<GuestContact>;
 /** Adapter to the CURRENT authoritative catalogue/phase/resource planner. */
 plan(businessId:string,staffId:string,serviceIds:string[],startsAt:string):Promise<unknown>;
 /** Same bookings table, nullable customer_id + guest snapshot; guarded transaction. */
 insertGuest(command:GuestCommand,plan:unknown,contactId:string|null,requestId:string):Promise<GuestReceipt>;
};
export type GuestStore={transaction<T>(body:(tx:GuestTransaction)=>Promise<T>):Promise<T>};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fail=(code:string):never=>{throw Error(code);};
const canonical=(v:unknown):string=>JSON.stringify(v,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
function actor(value:string){if(!uuid.test(value))fail('AUTHENTICATION_REQUIRED');}
function validate(input:GuestCommand,requestId:string){
 if(!input||Object.keys(input).some(key=>!['businessId','staffId','serviceIds','startsAt','expectedPlan','customer'].includes(key))||!uuid.test(input.businessId)||!uuid.test(input.staffId)||!Array.isArray(input.serviceIds)||!input.serviceIds.length||input.serviceIds.length>32||input.serviceIds.some(id=>!uuid.test(id))||new Set(input.serviceIds).size!==input.serviceIds.length
  ||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.startsAt)||!Number.isFinite(Date.parse(input.startsAt))||!input.expectedPlan
  ||!input.customer||Object.keys(input.customer).some(key=>!['name','phone','contactId','remember'].includes(key))||typeof input.customer.name!=='string'||!input.customer.name.trim()||input.customer.name.length>120||input.customer.phone!==null&&(typeof input.customer.phone!=='string'||input.customer.phone.length>40)
  ||input.customer.contactId!==null&&!uuid.test(input.customer.contactId)||typeof input.customer.remember!=='boolean'||!/^[a-zA-Z0-9_-]{1,128}$/.test(requestId))fail('BOOKING_INVALID_COMMAND');
}
export function createGuestBookingService(store:GuestStore){return{
 async confirm(actorId:string,input:GuestCommand,requestId:string){
  actor(actorId);validate(input,requestId);
  const command:GuestCommand=JSON.parse(JSON.stringify(input));command.customer.name=command.customer.name.trim();command.customer.phone=command.customer.phone?.trim()||null;
  const signature=canonical(command);
  return store.transaction(async tx=>{
   await tx.lockBusiness(command.businessId);
   if(!await tx.mayManage(actorId,command.businessId,command.staffId))fail('BOOKING_FORBIDDEN');
   const existing=await tx.operation(actorId,command.businessId,requestId);
   if(existing){if(existing.signature!==signature)fail('BOOKING_REQUEST_REUSED');return existing.receipt;}
   if(command.customer.contactId&&!await tx.contact(command.businessId,command.customer.contactId))fail('BOOKING_CONTACT_UNAVAILABLE');
   const plan=await tx.plan(command.businessId,command.staffId,command.serviceIds,command.startsAt);
   // Price, duration, phases, resources and availability come from the planner.
   if(!plan||canonical(plan)!==canonical(command.expectedPlan))fail('BOOKING_SELECTION_STALE');
   let contactId=command.customer.contactId;
   if(command.customer.remember){const contact=await tx.saveContact(command.businessId,contactId,command.customer.name,command.customer.phone);
    if(!uuid.test(contact.id)||contact.businessId!==command.businessId)fail('BOOKING_CONTACT_UNAVAILABLE');contactId=contact.id;}
   const receipt=await tx.insertGuest(command,plan,contactId,requestId);
   if(!receipt||!uuid.test(receipt.id)||receipt.businessId!==command.businessId||receipt.staffId!==command.staffId||receipt.customerId!==null||receipt.status!=='CONFIRMED'||receipt.requestId!==requestId||receipt.contactId!==contactId||canonical(receipt.plan)!==canonical(plan))fail('BOOKING_INVALID_RECEIPT');
   await tx.saveOperation({actorId,businessId:command.businessId,requestId,signature,receipt});return receipt;
  });
 },
 async recover(actorId:string,businessId:string,requestId:string){
  actor(actorId);if(!uuid.test(businessId)||!/^[a-zA-Z0-9_-]{1,128}$/.test(requestId))fail('BOOKING_INVALID_COMMAND');
  return store.transaction(async tx=>{if(!await tx.mayManage(actorId,businessId))fail('BOOKING_FORBIDDEN');const operation=await tx.operation(actorId,businessId,requestId);return operation?.receipt??null;});
 },
 async findCustomers(actorId:string,businessId:string,query:string){
  actor(actorId);if(!uuid.test(businessId)||typeof query!=='string'||query.length>120)fail('BOOKING_INVALID_COMMAND');
  return store.transaction(async tx=>{if(!await tx.mayManage(actorId,businessId))fail('BOOKING_FORBIDDEN');
   if(query.trim().length<2)return[];const rows=await tx.searchContacts(businessId,query.trim(),30);
   if(!Array.isArray(rows)||rows.length>30||rows.some(row=>!uuid.test(row.id)||row.businessId!==businessId))fail('BOOKING_CONTACT_UNAVAILABLE');return rows;});
 }
};}
