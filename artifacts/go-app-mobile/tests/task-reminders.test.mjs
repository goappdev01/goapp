import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./task-creation.test.mjs";
import { readFileSync } from "node:fs";
const scope = { userId: "A", context: "live:USER" };
const plain = value => JSON.parse(JSON.stringify(value));
const task = (id = "buy", extra = {}) => ({
 id, kind:"sent", intentKey:"nota_interna", intentLabel:"Tarea interna", color:"#7c3aed", place:"", date:"M 13/10",
 dateISO:"2026-10-13", time:"17:00", duration:"", contactName:"", phone:"", estado:"pendiente", type:"TAREA_INTERNA",
 notes:"Hacer la compra", ownerUserId:"A", ...extra,
});
const cmd=(f,text)=>f.reminders.parseReminderCommand(text,"2026-10-08");
const change=(f,c,entry=f.saved[0],s=scope,confirmed=false)=>f.reminders.changeReminder(c,entry,s,()=>true,confirmed);

test("reported create-then-remind sequence keeps one calendar task and its original schedule",async()=>{
 const f=fixture([],"A");await f.render().dispatch("crea una tarea Hacer la compra mañana a las 5 de la tarde",false);
 assert.equal(f.saved.length,1);assert.equal(f.saved[0].time,"17:00");const original=f.saved[0];
 await f.render().dispatch("Pon un recordatorio a la tarea de hacer la compra una hora antes",false);
 assert.equal(f.saved.length,1);assert.equal(f.saved[0].id,original.id);assert.equal(f.saved[0].dateISO,original.dateISO);
 assert.equal(f.saved[0].time,"17:00");assert.deepEqual(f.saved[0].reminders,[60],f.notice);
 assert.match(f.messages.at(-1).text,/16:00/);assert.match(f.messages.at(-1).text,/programación en el teléfono no está comprobada/);
});
test("contextual references use the stable last task; concurrent and repeated commands do not duplicate",async()=>{
 for(const text of ["Pon un recordatorio una hora antes","Avísame una hora antes","Pon un aviso a esa tarea una hora antes","Pon un recordatorio a la que acabas de crear una hora antes"]){
  const f=fixture([],"A");await f.render().dispatch("crea una tarea Hacer la compra el 13/10/2026 a las 17:00",false);
  const g=f.render();await Promise.all([g.dispatch(text,false),g.dispatch(text,false)]);await f.render().dispatch(text,false);
  assert.equal(f.saved.length,1,text);assert.deepEqual(f.saved[0].reminders,[60],f.notice);
  assert.equal(f.saved[0].dateISO,"2026-10-13");assert.equal(f.saved[0].time,"17:00");
 }
});
test("query, edit and explicitly confirmed removal retain the task",async()=>{
 const f=fixture([task()],"A");await f.render().dispatch("Pon un recordatorio a la compra una hora antes",false);
 await f.render().dispatch("¿Qué avisos tiene la compra?",false);assert.match(f.messages.at(-1).text,/16:00/);
 await f.render().dispatch("Cambia el aviso de la compra a 30 minutos antes",false);assert.deepEqual(f.saved[0].reminders,[30],f.notice);
 assert.match(f.messages.at(-1).text,/16:30/);await f.render().dispatch("Elimina el aviso de la compra",false);
 assert.deepEqual(f.saved[0].reminders,[30]);assert.match(f.messages.at(-1).text,/Confirmas/);
 await f.render().dispatch("sí, pero después",false);assert.deepEqual(f.saved[0].reminders,[30]);
 await f.render().dispatch("confirmo",false);assert.deepEqual(f.saved[0].reminders,[]);assert.equal(f.saved[0].notificationsEnabled,false);
 assert.equal(f.saved.length,1);assert.equal(f.saved[0].deleted,undefined);assert.equal(f.saved[0].time,"17:00");
});
test("store and screen restart retain associations; an unknown pronoun requires a task title",async()=>{
 const f=fixture([task()],"A");await f.render().dispatch("Pon un aviso a la compra una hora antes",false);
 const reopened=fixture(plain(await f.reopenStore().readGoLog()),"A");
 await reopened.render().dispatch("¿Qué avisos tiene la compra?",false);assert.match(reopened.messages.at(-1).text,/16:00/);
 const fresh=reopened.screen(); const writes=reopened.writes;await fresh.render().dispatch("Avísame dos horas antes",false);
 assert.equal(reopened.writes,writes);assert.match(fresh.messages.at(-1).text,/qué tarea/);
 await fresh.render().dispatch("Hacer la compra",false);assert.deepEqual(reopened.saved[0].reminders,[120,60]);assert.equal(reopened.saved.length,1);
});
test("ambiguous tasks require selection; title plus relative date isolates the desired calendar record",async()=>{
 const f=fixture([task("one"),task("two",{dateISO:"2026-10-14",time:"18:00"})],"A");
 await f.render().dispatch("Pon un recordatorio a la compra una hora antes",false);assert.equal(f.writes,0);assert.match(f.messages.at(-1).text,/varias tareas/);
 await f.render().dispatch("sí",false);assert.equal(f.writes,0);await f.render().dispatch("2",false);
 assert.equal(f.saved[0].reminders,undefined);assert.deepEqual(f.saved[1].reminders,[60]);
 const g=fixture([task("one",{dateISO:"2026-10-09"}),task("two")],"A");
 await g.render().dispatch("Pon un aviso a la compra de mañana 15 minutos antes",false);
 assert.equal(g.saved.length,2);assert.deepEqual(g.saved[0].reminders,[15]);assert.equal(g.saved[1].reminders,undefined);
});
test("only missing anticipation is asked, accepting a plain interval reply",async()=>{
 const f=fixture([task()],"A");await f.render().dispatch("Pon un recordatorio a la compra",false);
 assert.equal(f.writes,0);assert.match(f.messages.at(-1).text,/Cuánto tiempo antes/);
 await f.render().dispatch("15 minutos",false);assert.deepEqual(f.saved[0].reminders,[15]);assert.equal(f.saved.length,1);
});
test("required and custom lead times use the existing minute offsets",async()=>{
 for(const [text,minutes] of [["5 minutos",5],["10 minutos",10],["15 minutos",15],["30 minutos",30],["una hora",60],["dos horas",120],["un día",1440],["75 minutos",75],["una hora y media",90]]){
  const f=fixture([task()],"A"),c=cmd(f,"Pon un aviso a la compra "+text+" antes");
  assert.equal(c.minutes,minutes,text);await change(f,c);assert.deepEqual(f.saved[0].reminders,[minutes]);
 }
});
test("multiple reminders require the old offset for editing or removal; cancellation is safe",async()=>{
 const f=fixture([task("buy",{reminders:[60,15]})],"A");
 await f.render().dispatch("Cambia el aviso de la compra a 30 minutos antes",false);assert.equal(f.writes,0);assert.match(f.messages.at(-1).text,/Cuál de los avisos/);
 await f.render().dispatch("una hora",false);assert.deepEqual(f.saved[0].reminders,[30,15]);
 await f.render().dispatch("Elimina el aviso de la compra",false);await f.render().dispatch("15 minutos",false);await f.render().dispatch("no",false);
 assert.deepEqual(f.saved[0].reminders,[30,15]);await f.render().dispatch("Elimina todos los avisos de la compra",false);await f.render().dispatch("confirmo",false);
 assert.deepEqual(f.saved[0].reminders,[]);
});
test("IA and manual hour edits recompute the relative reminder and reset obsolete firing history",async()=>{
 const f=fixture([task("buy",{reminders:[60],firedReminderMins:[60],snoozeUntil:123})],"A");
 await f.render().dispatch("Cambia la compra a las 18:00",false);await f.render().manager.confirm();
 assert.equal(f.saved.length,1);assert.equal(f.saved[0].time,"18:00");assert.deepEqual(f.saved[0].reminders,[60]);
 assert.deepEqual(f.saved[0].firedReminderMins,[]);assert.equal(f.saved[0].snoozeUntil,undefined);assert.match(f.reminders.describeReminders(f.saved[0]),/17:00/);
 const base=await f.store.readGoLog();await f.store.commitGoLogSnapshot(base,base.map(e=>({...e,time:"19:00",firedReminderMins:[60]})));
 assert.deepEqual(f.saved[0].firedReminderMins,[]);assert.match(f.reminders.describeReminders(f.saved[0]),/18:00/);
});
test("user, company and DEMO isolation reject foreign or unverifiable legacy tasks",async()=>{
 const demo={userId:"A",context:"demo:USER"},business={userId:"A",context:"demo:BUSINESS:company1"};
 const f=fixture([task("live"),task("demo",{taskContext:demo.context}),task("biz",{taskContext:business.context}),task("foreign",{ownerUserId:"B"}),task("unowned",{ownerUserId:undefined})],"A"),c=cmd(f,"Pon un aviso a la compra una hora antes");
 for(const [s,ids] of [[scope,["live"]],[demo,["demo"]],[business,["biz"]]])assert.deepEqual(plain((await f.reminders.selectReminderTasks(c,s,null,()=>true)).map(e=>e.id)),ids);
 for(const i of [1,3,4])await assert.rejects(change(f,c,f.saved[i]),/no está disponible/);assert.equal(f.writes,0);
});
test("DEMO creation plus reminder shares a scoped task and cannot deduplicate across companies",async()=>{
 const f=fixture([],"A"),demo={userId:"A",context:"demo:USER"};
 await f.render(demo).dispatch("crea una tarea Hacer la compra el 13/10/2026 a las 17:00",false);await f.render(demo).dispatch("Avísame una hora antes",false);
 assert.equal(f.saved.length,1);assert.equal(f.saved[0].taskContext,"demo:USER");assert.deepEqual(f.saved[0].reminders,[60]);
 const other=f.screen(),biz={userId:"A",context:"demo:BUSINESS:company2"};
 await other.render(biz).dispatch("crea una tarea Hacer la compra el 13/10/2026 a las 17:00",false);assert.equal(f.saved.length,2);
 await other.render(biz).dispatch("Avísame 10 minutos antes",false);assert.deepEqual(f.saved[0].reminders,[10]);assert.deepEqual(f.saved[1].reminders,[60]);
});
test("account or context switch cannot reuse a pronoun or pending removal",async()=>{
 const f=fixture([task("a",{reminders:[60]}),task("b",{ownerUserId:"B"})],"A");
 await f.render().dispatch("Elimina el aviso de la compra",false);f.user("B");await f.render().dispatch("confirmo",false);assert.equal(f.writes,0);
 await f.render().dispatch("Avísame una hora antes",false);assert.equal(f.writes,0);
 const g=fixture([],"A"),demo={userId:"A",context:"demo:USER"};
 await g.render(demo).dispatch("crea una tarea Hacer la compra el 13/10/2026 a las 17:00",false);await g.render(scope).dispatch("Avísame una hora antes",false);assert.equal(g.saved[0].reminders,undefined);
});
test("stale task, duplicate ids and failed persistence never overwrite or report success",async()=>{
 const f=fixture([task()],"A"),expected=f.saved[0],c=cmd(f,"Pon un aviso a la compra una hora antes");
 await f.store.updateGoLog(rows=>({entries:rows.map(e=>({...e,detail:"Conservar"})),result:null}));await assert.rejects(change(f,c,expected),/ha cambiado/);
 assert.equal(f.saved[0].reminders,undefined);f.fail(true);await f.render().dispatch("Pon un aviso a la compra una hora antes",false);
 assert.equal(f.saved[0].reminders,undefined);assert.ok(!f.messages.some(m=>m.text.startsWith("He guardado el aviso")));
 f.fail(false);await f.render().dispatch("Pon un aviso a la compra una hora antes",false);assert.deepEqual(f.saved[0].reminders,[60]);
 const g=fixture([task("same"),task("same")],"A");await assert.rejects(change(g,cmd(g,"Pon un aviso a la compra una hora antes")),/no está disponible/);assert.equal(g.writes,0);
});
test("invalid or expired offsets, missing or invalid schedules and a fourth reminder are rejected",async()=>{
 for(const text of ["0 minutos","-5 minutos","1.5 minutos","99999999 minutos"]){const f=fixture([task()],"A");await f.render().dispatch("Pon un aviso a la compra "+text+" antes",false);assert.equal(f.writes,0,text);assert.equal(f.saved.length,1);}
 for(const extra of [{time:""},{dateISO:""},{dateISO:"2026-02-31"},{dateISO:"2020-01-01"}]){const f=fixture([task("buy",extra)],"A");await assert.rejects(change(f,cmd(f,"Pon un aviso a la compra una hora antes")));assert.equal(f.writes,0);}
 const f=fixture([task("buy",{reminders:[60,30,15]})],"A");await assert.rejects(change(f,cmd(f,"Pon un aviso a la compra 5 minutos antes")),/hasta tres/);
 const g=fixture([task()],"A");await g.render().dispatch("Pon un aviso a la compra del 31/02/2027 una hora antes",false);assert.equal(g.writes,0);
});
test("local zones, midnight and DST compute elapsed anticipation without guessing skipped or repeated hours",()=>{
 const old=process.env.TZ;process.env.TZ="Europe/Madrid";
 try{const f=fixture();let at=new Date(f.reminders.reminderTaskInstant(task("buy",{time:"00:30"}))-60*60000);
  assert.equal(at.getDate(),12);assert.equal(at.getHours(),23);assert.equal(at.getMinutes(),30);
  at=new Date(f.reminders.reminderTaskInstant(task("buy",{dateISO:"2027-03-28",time:"03:30"}))-60*60000);assert.equal(at.getHours(),1);assert.equal(at.getMinutes(),30);
  assert.throws(()=>f.reminders.reminderTaskInstant(task("buy",{dateISO:"2027-03-28",time:"02:30"})),/no existe/);
  assert.throws(()=>f.reminders.reminderTaskInstant(task("buy",{dateISO:"2026-10-25",time:"02:30"})),/se repite/);
 }finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
test("same fields feed the current notification engine and ordinary reminder-style creation remains intact",async()=>{
 const source=readFileSync("app/index.tsx","utf8");assert.match(source,/g\.reminders/);assert.match(source,/dt\.getTime\(\) - r \* 60_000/);
 const f=fixture([],"A");assert.equal(cmd(f,"recuérdame llamar mañana a las 17:30"),null);await f.render().dispatch("recuérdame llamar mañana a las 17:30",false);
 assert.equal(f.saved.length,1);assert.equal(f.saved[0].reminders,undefined);
});

test("the mandatory contextual order attaches 16:00 on 13 October to the original 17:00 task",async()=>{
 const f=fixture([],"A");await f.render().dispatch("crea una tarea Hacer la compra el 13/10/2026 a las 17:00",false);
 const original=f.saved[0];await f.render().dispatch("Pon un recordatorio una hora antes",true);
 assert.equal(f.saved.length,1);assert.equal(f.saved[0].id,original.id);assert.equal(f.saved[0].dateISO,"2026-10-13");assert.equal(f.saved[0].time,"17:00");
 assert.deepEqual(f.saved[0].reminders,[60]);assert.match(f.messages.at(-1).text,/13\/10\/2026.*16:00/);assert.equal(f.bookingRequests.length,0);
});
test("a conversational identifier survives a manual title change without selecting another task",async()=>{
 const f=fixture([],"A");await f.render().dispatch("crea una tarea Hacer la compra el 13/10/2026 a las 17:00",false);const id=f.saved[0].id;
 await f.store.updateGoLog(rows=>({entries:rows.map(e=>({...e,notes:"Compra semanal"})),result:null}));
 await f.render().dispatch("Pon un aviso a esa tarea 10 minutos antes",false);assert.equal(f.saved[0].id,id);assert.equal(f.saved[0].notes,"Compra semanal");assert.deepEqual(f.saved[0].reminders,[10]);
});
test("missing reminders are never falsely acknowledged as removed and repeated confirmations do not write",async()=>{
 const f=fixture([task("buy",{reminders:[60]})],"A");await f.render().dispatch("Elimina el aviso de la compra de 15 minutos antes",false);
 assert.equal(f.writes,0);assert.match(f.messages.at(-1).text,/No encuentro ese aviso/);
 await f.render().dispatch("Elimina el aviso de la compra",false);await f.render().dispatch("confirmo",false);const writes=f.writes;
 await f.render().dispatch("confirmo",false);assert.equal(f.writes,writes);assert.equal(f.saved.length,1);
 await f.render().dispatch("Elimina el aviso de la compra",false);assert.match(f.messages.at(-1).text,/No encuentro ese aviso/);
});
test("muted task preferences are respected rather than silently activating an alert",async()=>{
 const f=fixture([task("buy",{notificationsEnabled:false})],"A");await f.render().dispatch("Pon un aviso a la compra 5 minutos antes",false);
 assert.deepEqual(f.saved[0].reminders,[5]);assert.equal(f.saved[0].notificationsEnabled,false);assert.match(f.messages.at(-1).text,/silenciadas/);
 assert.doesNotMatch(f.messages.at(-1).text,/alerta activada|notificación activada/i);
});

test("manual snapshots cannot strip or replace a verified task context",async()=>{
 const f=fixture([task("buy",{taskContext:"demo:USER",reminders:[60]})],"A");
 const base=await f.store.readGoLog();
 await f.store.commitGoLogSnapshot(base,base.map(e=>({...e,taskContext:undefined,time:"18:00"})));
 assert.equal(f.saved[0].taskContext,"demo:USER");assert.equal(f.saved[0].time,"18:00");
 await f.store.updateGoLog(rows=>({entries:rows.map(e=>({...e,taskContext:"live:USER"})),result:null}));
 assert.equal(f.saved[0].taskContext,"demo:USER");
});

test("adding again after deleting the last reminder restores only automatic silence, never a manual mute",async()=>{
 const f=fixture([task()],"A");await f.render().dispatch("Pon un aviso a la compra una hora antes",false);
 await f.render().dispatch("Elimina el aviso de la compra",false);await f.render().dispatch("confirmo",false);
 assert.equal(f.saved[0].reminderSilencedByRemoval,true);assert.equal(f.saved[0].notificationsEnabled,false);
 await f.render().dispatch("Pon un aviso a la compra 15 minutos antes",false);assert.equal(f.saved[0].notificationsEnabled,true);
 assert.deepEqual(f.saved[0].reminders,[15]);assert.equal(f.saved[0].reminderSilencedByRemoval,undefined);
 await f.render().dispatch("Elimina el aviso de la compra",false);await f.render().dispatch("confirmo",false);
 await f.store.updateGoLog(rows=>({entries:rows.map(e=>({...e,notificationsEnabled:true})),result:null}));
 await f.store.updateGoLog(rows=>({entries:rows.map(e=>({...e,notificationsEnabled:false})),result:null}));
 await f.render().dispatch("Pon un aviso a la compra 15 minutos antes",false);assert.equal(f.saved[0].notificationsEnabled,false);
});
test("description confirms only OS-verified schedules, displays actual date, and exposes cancellation failure truthfully",()=>{
 const f=fixture([task("buy",{reminders:[60]})],"A"),actual=new Date("2026-10-13T18:00:00").getTime();
 assert.doesNotMatch(f.reminders.describeReminders(f.saved[0]),/Notificación local programada/);
 assert.match(f.reminders.describeReminders(f.saved[0],[{taskId:"buy",minutes:60,status:"scheduled",at:actual}]),/18:00[\s\S]*Notificación local programada/);
 assert.match(f.reminders.describeReminders({...f.saved[0],notificationsEnabled:false},[{taskId:"buy",minutes:60,status:"failed"}]),/no he podido confirmar/);
 assert.match(f.reminders.describeReminders({...f.saved[0],reminders:[]},[{taskId:"buy",minutes:60,status:"failed"}]),/cancelación/);
});
