const { evaluate } = require('./react-lifecycle.cjs');
const base = require('./business-direct-fixture.cjs');
const {businessId,staffId,serviceId,receiptId}=base;
const service={id:serviceId,businessId,title:'Lavado + Corte',durationMinutes:45,price:23,currency:'EUR',priceKnown:true,type:'service',catalogKind:'service',active:true,visible:true,customerCapacity:1,unitQuantity:1,paymentRequired:false};
const business={id:businessId,name:'Empresa sintética',location:'Dirección de prueba',timezone:'Europe/Madrid',category:'peluqueria',bookingActive:true};
const professional={id:staffId,businessId,name:'Profesional sintética',active:true,serviceIds:[serviceId]};
const entry={businessId,staffId,dateISO:'2030-01-07',timeHHMM:'11:15'};
const plan={version:1,staffId,startsAt:'2030-01-07T10:15:00Z',endsAt:'2030-01-07T11:00:00Z',timezone:'Europe/Madrid',serviceIds:[serviceId],serviceDetails:[{id:serviceId,title:service.title,durationMinutes:45,price:23,currency:'EUR'}],totalPrice:23,currency:'EUR',totalClientMinutes:45,totalDurationMinutes:45,workMinutes:45,waitMinutes:0,resourcesConfigured:true,phases:[],workIntervals:[],resourceIntervals:[]};
const slot={startDatetime:'2030-01-07T11:15:00',endDatetime:'2030-01-07T12:00:00',startInstant:plan.startsAt,endInstant:plan.endsAt,staffId,isAvailable:true,availableUnits:1,totalUnits:1,timingSnapshot:plan};
const quote={version:1,businessId,rootIds:[serviceId],selectedAssociationIds:[],serviceIds:[serviceId],ready:true,lines:[{itemId:serviceId,name:service.title,kind:'service',durationMinutes:45,quantity:1,unitPrice:23,charge:23,included:false,currency:'EUR'}],options:[],missingRequired:[],totalPrice:23,currency:'EUR'};
function fixture(){
 let identity='session-owner'; const calls=[];let unavailable=false,fail=false,customers=[];
 const bookingApi={getTimelineAvailability:async(...args)=>{calls.push(['availability',...args]);return {slots:unavailable?[]:[slot],availableDates:[entry.dateISO],timezone:business.timezone};}};
 const api=evaluate('data/businessFastBooking.ts',{'./booking':bookingApi,'./serviceTiming':evaluate('data/serviceTiming.ts'),'./calendarExceptions':base.calendar,'./businessDirectEntry':base.direct});
 const gateway={currentIdentity:async()=>identity,
   resolveContext:async value=>{calls.push(['context',value]);return {business,professional};},
   findCustomers:async(id,query)=>{calls.push(['customers',id,query]);return customers;},
   commit:async(command,requestId)=>{calls.push(['commit',command,requestId]);if(fail)throw Error('BOOKING_CONFLICT');return {id:receiptId,businessId,kind:'booking',requestId,
     booking:{id:receiptId,businessId,customerId:null,source:'business',guestName:command.customer.name,bookableItemId:serviceId,staffId,startDatetime:slot.startDatetime,endDatetime:slot.endDatetime,startInstant:slot.startInstant,endInstant:slot.endInstant,status:'CONFIRMED',unitsReserved:1,peopleCount:1,paymentStatus:'none',catalogSnapshot:quote,services:[service],timingSnapshot:plan}};}};
 return {...base,api,bookingApi,gateway,calls,entry,business,professional,service,slot,plan,quote,
   setIdentity:value=>{identity=value;},setUnavailable:value=>{unavailable=value;},setFailure:value=>{fail=value;},setCustomers:value=>{customers=value;}};
}
module.exports={fixture};
