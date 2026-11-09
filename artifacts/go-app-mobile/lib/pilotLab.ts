/** Pilot records contain coded participants only; no automatic support-body copying. */
export const PILOT_GROUPS = ['Tercera edad', 'Mediana edad', 'Jóvenes'] as const;
export const PILOT_STATES = ['Pendiente', 'Preparado', 'En curso', 'Bloqueado', 'Pendiente de corrección', 'Repetido', 'Validado'] as const;
export const PILOT_TOPICS = ['Accesibilidad', 'Legibilidad', 'Alcance del pulgar', 'Gestos', 'Botones flotantes', 'Calendario', 'Reservas', 'Notas', 'Mensajes', 'Botón central GO como IA'] as const;
export const PILOT_RULES = ['Conservar el orden del roadmap de GO.', 'Conservar los nombres exactos de los módulos.', 'Sin temporizadores por defecto.', 'Conservar el gesto de cierre vigente.', 'No modificar elementos congelados.', 'Una ficha validada no modifica código ni resuelve una solicitud de soporte.'] as const;
export type PilotRecord = {id:string;parentId:string;name:string;type:string;group:string;module:string;device:string;version:string;responsible:string;status:string;knowledge:string;tasks:string;result:string;observations:string;incidents:string;regressions:string;evidence:string;testedAt:string;next:string;source:string;checks:{text:string;done:boolean}[];assessments:Record<string,string>};
export type PilotTemplate = {id:string;name:string;items:string[]};
export type PilotHistory = {at:string;recordId:string;before:PilotRecord|null;after:PilotRecord};
export type PilotStore = {records:PilotRecord[];templates:PilotTemplate[];history:PilotHistory[]};
export function emptyPilotStore():PilotStore {return {records:[],history:[],templates:[{id:'experience',name:'Experiencia y accesibilidad',items:[...PILOT_TOPICS,'Conservar el gesto de cierre','Sin temporizadores por defecto']}]};}
export function newPilot(id:string):PilotRecord {return {id,parentId:'',name:'',type:'Piloto',group:PILOT_GROUPS[0],module:'',device:'',version:'',responsible:'',status:'Pendiente',knowledge:'Dato faltante',tasks:'',result:'',observations:'',incidents:'',regressions:'',evidence:'',testedAt:'',next:'',source:'',checks:[],assessments:{}};}
export function pilotValidation(r:PilotRecord):string|null {
 if(!r.name.trim())return 'Indica un nombre o código de ficha.';
 if(!PILOT_GROUPS.includes(r.group as typeof PILOT_GROUPS[number])||!PILOT_STATES.includes(r.status as typeof PILOT_STATES[number]))return 'Grupo o estado inválido.';
 if(!['Dato faltante','Hipótesis','Hecho confirmado'].includes(r.knowledge))return 'Clasifica el resultado.';
 if(r.status==='Validado'&&(!r.module.trim()||!r.device.trim()||!r.version.trim()||!r.tasks.trim()||!r.result.trim()||!r.evidence.trim()||!r.responsible.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(r.testedAt)||(Number.isNaN(Date.parse(r.testedAt))||new Date(r.testedAt).toISOString().slice(0,10)!==r.testedAt)||r.knowledge!=='Hecho confirmado'))return 'Para validar: módulo, dispositivo, versión, tareas, resultado, evidencia verificable, responsable y fecha AAAA-MM-DD. El resultado debe ser un hecho confirmado.';
 return null;
}
export function savePilot(store:PilotStore,record:PilotRecord,at:string):PilotStore {const error=pilotValidation(record);if(error)throw Error(error);const previous=store.records.find(r=>r.id===record.id)??null;return {...store,records:previous?store.records.map(r=>r.id===record.id?record:r):[...store.records,record],history:[{at,recordId:record.id,before:previous,after:record},...store.history]};}
export function repeatPilot(r:PilotRecord,id:string):PilotRecord {return {...r,id,parentId:r.id,name:r.name+' · repetición',status:'Pendiente',version:'',knowledge:'Dato faltante',result:'',evidence:'',testedAt:'',incidents:'',regressions:'',observations:'',assessments:{},checks:r.checks.map(c=>({...c,done:false}))};}
