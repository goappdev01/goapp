import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture} from "./helpers/calendar-fixture.mjs";

const plain = value => JSON.parse(JSON.stringify(value));
const monday = "2026-11-09", tuesday = "2026-11-10", wednesday = "2026-11-11";
const shift = (from, to) => ({from, to, active: true});
const day = (from, to, later, end) => ({
  shift1: shift(from, to), shift2: later ? shift(later, end) : {active: false},
});
const config = {
  openFrom: "09:00", openTo: "20:00", completedSteps: [2], activeDays: [0, 1],
  daySchedules: {"0": day("09:00", "14:00", "16:00", "20:00"), "1": day("10:00", "14:00", "17:00", "21:00")},
  staffSchedules: {b: {useCompanySchedule: false, daySchedules: {"0": day("10:00", "14:00", "17:00", "19:00")}}},
};
const ranges = (...pairs) => pairs.map(([start,end])=>({start,end}));
const load = () => fixture().load("data/businessCalendarWorkHours.ts");
const nodes = (node, match) => node && typeof node === "object"
  ? [...(match(node) ? [node] : []), ...(node.children ?? []).flatMap(child => nodes(child, match))]
  : [];
const byId = (tree, id) => nodes(tree, node => node.props.testID === id);
const texts = tree => nodes(tree, node => node.type === "Text").flatMap(node => node.children).join("");

test("weekly company and staff schedules are projected separately for each date", () => {
  const {businessWorkHoursForDate: work} = load();
  const before = JSON.stringify(config);
  assert.deepEqual(plain(work(config, monday)), ranges([540,840],[960,1200]));
  assert.deepEqual(plain(work(config, tuesday)), ranges([600,840],[1020,1260]));
  assert.deepEqual(plain(work(config, wednesday)), []);
  assert.deepEqual(plain(work(config, monday, {id:"b",name:"B"})), ranges([600,840],[1020,1140]));
  assert.deepEqual(plain(work(config, tuesday, {id:"b",name:"B"})), []);
  assert.deepEqual(plain(work(config, monday, {id:"c",name:"C"})), ranges([540,840],[960,1200]));
  assert.equal(JSON.stringify(config), before);
});

test("missing and closed schedules differ, legacy hours are used only when configured", () => {
  const {businessWorkHoursForDate: work} = load();
  const incomplete = {...config, completedSteps:[], daySchedules:{}};
  assert.equal(work(incomplete, monday), undefined);
  assert.equal(work({...incomplete, openFrom:"invalid"}, monday), undefined);
  assert.deepEqual(plain(work({...incomplete, completedSteps:[2]}, monday)), ranges([540,1200]));
  assert.deepEqual(plain(work({...incomplete, completedSteps:[2], activeDays:[]}, monday)), []);
  const window = {active:true, weekday:1, visibleStartHour:8, visibleStartMinute:45, visibleEndHour:13, visibleEndMinute:10};
  assert.deepEqual(plain(work(incomplete,monday,undefined,[],[window])), ranges([525,790]));
});

test("date exceptions close only the specified intervals and keep professional scopes independent", () => {
  const {businessWorkHoursForDate: work} = load();
  const exception = (staffId, kind, startMinute, endMinute) => ({
    staffId, dateISO:tuesday, intervals:[{kind,startMinute,endMinute}],
  });
  const exceptionRows = [exception(null,"closed",540,780), exception("b","open",900,960), exception("c","open",870,910)];
  assert.deepEqual(plain(work(config,tuesday,undefined,exceptionRows,[],new Set(["b"]))), ranges([780,840],[900,960],[1020,1260]));
  assert.deepEqual(plain(work(config,tuesday,{id:"b",name:"B"},exceptionRows)), ranges([900,960]));
  assert.deepEqual(plain(work(config,tuesday,{id:"d",name:"D"},exceptionRows)), ranges([780,840],[1020,1260]));
  assert.deepEqual(plain(work(config,monday,undefined,exceptionRows)), ranges([540,840],[960,1200]));
  assert.deepEqual(plain(work(config,tuesday,undefined,[exception(null,"closed",0,1440)])), []);
});

test("overnight shifts cross the civil date, with exact boundaries at all densities and business-zone clock", () => {
  const {businessWorkHoursForDate: work, workHourSlots, businessCalendarClock} = load();
  const overnight = {...config, activeDays:[0], daySchedules:{"0":day("22:07","02:13")}};
  assert.deepEqual(plain(work(overnight,monday)), ranges([1327,1440]));
  assert.deepEqual(plain(work(overnight,tuesday)), ranges([0,133]));
  assert.deepEqual(plain(work(overnight,wednesday)), []);
  assert.deepEqual(plain(work(overnight,"2026-11-16")), ranges([1327,1440]));
  for (const density of [60,30,15]) {
    const slots = workHourSlots(ranges([547,851],[967,1197]), density);
    assert.equal(slots[0].start, 547);
    assert.equal(slots.find(slot => slot.previousEnd === 851).start, 967);
    assert.equal(slots.at(-1).end, 1197);
    assert.ok(slots.every(slot => slot.end <= 851 || slot.start >= 967));
    assert.ok(slots.every(slot => slot.end > slot.start && slot.end - slot.start <= density));
  }
  const now = new Date("2026-11-09T23:10:00Z");
  assert.deepEqual(plain(businessCalendarClock("Europe/Madrid", now)), {dateISO:tuesday,minute:10});
  assert.deepEqual(plain(businessCalendarClock("Atlantic/Canary", now)), {dateISO:monday,minute:1390});
});

test("week view compact slots preserve the same accessible booking and proposal and toggles restore 24 hours", () => {
  const app = fixture({now:"2026-11-09T08:00:00Z", platform:"ios"});
  const {AgendaBoard} = app.load("components/AgendaOperativa.tsx");
  const {businessWorkHoursForDate: work} = app.load("data/businessCalendarWorkHours.ts");
  const outside = {id:"outside",type:"GO_BOOKING",kind:"sent",businessBooking:true,
    reservationId:"11111111-1111-4111-8111-111111111111",businessId:"22222222-2222-4222-8222-222222222222",
    dateISO:monday,date:monday,time:"08:30",startTime:"08:30",endTime:"09:30",duration:"60min",
    contactName:"Client fixture",intentKey:"generico",intentLabel:"Corte",estado:"propuesto",bookingStatus:"confirmada",
    changeProposal:{date:tuesday,time:"12:15",originalDate:monday,originalTime:"08:30",proposedBy:"customer"}};
  const inside = {...outside,id:"inside",reservationId:"33333333-3333-4333-8333-333333333333",time:"09:30",startTime:"09:30",endTime:"10:30",changeProposal:undefined};
  const props = {goLog:[outside,inside],selectedDateISO:monday,viewMode:"semana",density:"1h",calDayNightMode:"claro"};
  const withHours = {timezone:"Europe/Madrid", intervalsForDate: date => work(config,date)};
  const original = JSON.stringify(props.goLog);
  const render = (workHours, extra={}) => app.render(AgendaBoard,{...props,...extra,businessWorkHours:workHours});
  let tree = render(withHours);
  assert.equal(byId(tree,"calendar-drop-slot-"+monday+"-00:00").length,0);
  assert.equal(byId(tree,"calendar-drop-slot-"+monday+"-14:00").length,0);
  assert.equal(byId(tree,"calendar-drop-slot-"+monday+"-16:00").length,1);
  assert.equal(byId(tree,"calendar-drop-slot-"+tuesday+"-09:00").length,0);
  assert.equal(byId(tree,"calendar-drop-slot-"+tuesday+"-10:00").length,1);
  assert.equal(byId(tree,"business-calendar-closed-"+wednesday).length,1);
  assert.match(texts(byId(tree,"business-calendar-shift-"+monday+"-16:00")[0]),/Descanso.*14:00–16:00.*16:00–20:00/);
  const list = byId(tree,"business-calendar-outside-hours-"+monday)[0];
  assert.match(texts(list),/08:30/);
  assert.match(texts(list),/12:15/);
  assert.equal(byId(tree,"calendar-entry-outside").length,1);
  assert.equal(byId(tree,"calendar-entry-inside").length,1);
  byId(list,"calendar-entry-open-outside")[0].props.onAccessibilityTap();
  tree = render(withHours);
  assert.equal(byId(tree,"entry-details-scroll").length,1);
  for (const density of ["auto","1h","30min","15min"]) {
    tree = render({timezone:"Europe/Madrid"},{density});
    assert.equal(byId(tree,"calendar-drop-slot-"+monday+"-00:00").length,1);
    assert.equal(byId(tree,"business-calendar-outside-hours-"+monday).length,0);
    assert.equal(byId(tree,"calendar-entry-outside").length,1);
    assert.equal(byId(tree,"calendar-entry-inside").length,1);
  }
  tree = render(withHours);
  assert.equal(byId(tree,"business-calendar-outside-hours-"+monday).length,1);
  assert.equal(JSON.stringify(props.goLog),original);
});

test("unconfigured day shows the complete calendar and personal calendars retain their original grid", () => {
  const app = fixture({now:"2026-11-09T08:00:00Z"});
  const {AgendaBoard} = app.load("components/AgendaOperativa.tsx");
  const props = {goLog:[],selectedDateISO:monday,viewMode:"dia",density:"15min"};
  const business = app.render(AgendaBoard,{...props,businessWorkHours:{intervalsForDate:()=>undefined}});
  const personal = app.render(AgendaBoard,props);
  for (const tree of [business,personal]) {
    assert.equal(byId(tree,"calendar-drop-slot-"+monday+"-00:00").length,1);
    assert.equal(byId(tree,"calendar-drop-slot-"+monday+"-23:45").length,1);
  }
  assert.equal(byId(business,"business-calendar-missing-hours-"+monday).length,1);
  assert.equal(byId(personal,"business-calendar-missing-hours-"+monday).length,0);
  const {businessWorkHoursKey} = load();
  assert.notEqual(businessWorkHoursKey("owner","a"),businessWorkHoursKey("owner","b"));
  assert.notEqual(businessWorkHoursKey("owner","a"),businessWorkHoursKey("other","a"));
});

test("compacted rows keep the exact drag target and a break has no booking target", () => {
  const app = fixture({now:"2026-11-09T08:00:00Z",platform:"ios"});
  const {AgendaBoard} = app.load("components/AgendaOperativa.tsx");
  const booking = {id:"drag",type:"GO_BOOKING",kind:"received",customerBooking:true,
    reservationId:"11111111-1111-4111-8111-111111111111",businessId:"22222222-2222-4222-8222-222222222222",
    dateISO:monday,date:monday,time:"09:15",endTime:"09:35",estado:"aceptado",bookingStatus:"confirmada"};
  const calls = [];
  const props = {goLog:[booking],selectedDateISO:monday,viewMode:"semana",density:"30min",
    businessWorkHours:{intervalsForDate:()=>ranges([547,600],[967,1025])},
    onDropBooking:(entry,destination)=>calls.push([entry.id,destination.dateISO,destination.time])};
  const render = () => app.render(AgendaBoard,props);
  let tree = render();
  const layout = (x,y,width=176,height=36) => ({nativeEvent:{layout:{x,y,width,height}}});
  tree.props.ref.current = {measureInWindow: fn=>fn(0,100)};
  tree.props.onLayout();
  nodes(tree,n=>n.type==="GHScrollView"&&n.props.horizontal)[0].props.onLayout(layout(0,52,390,550));
  nodes(tree,n=>n.props.key==="day_"+monday&&n.props.onLayout)[0].props.onLayout(layout(30,0,176,550));
  byId(tree,"calendar-day-scroll-day_"+monday)[0].props.onLayout(layout(0,70,176,440));
  byId(tree,"calendar-drop-slot-"+monday+"-09:07")[0].props.onLayout(layout(0,40,176,36));
  byId(tree,"calendar-drop-slot-"+monday+"-16:07")[0].props.onLayout(layout(0,130,176,36));
  const at = y => ({absoluteX:85,absoluteY:222+y,x:22,y:10,velocityX:0});
  const pan = () => nodes(tree,n=>n.type==="GestureDetector"&&n.props.key==="drag")[0].props.gesture;
  let gesture = pan();
  gesture._onStart(at(50));
  gesture._onUpdate(at(100));
  gesture._onFinalize(at(100),true);
  tree = render();
  assert.deepEqual(calls,[]);
  gesture = pan();
  gesture._onStart(at(50));
  gesture._onUpdate(at(140));
  tree = render();
  assert.equal(byId(tree,"calendar-drop-time")[0].children[0],"16:07");
  assert.deepEqual(calls,[]);
  gesture._onFinalize(at(140),true);
  assert.deepEqual(calls,[["drag",monday,"16:07"]]);
  assert.equal(booking.time,"09:15");
});
