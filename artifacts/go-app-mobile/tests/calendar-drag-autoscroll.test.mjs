import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers/calendar-fixture.mjs";

const date = "2027-01-01";
const task = {
  id: "drag-task", type: "TAREA_INTERNA", kind: "sent", intentKey: "accion_generica",
  intentLabel: "Revisar", dateISO: date, date, time: "13:00", duration: "30", estado: "pendiente",
};
const find = (node, predicate) => {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const match = find(child, predicate);
    if (match) return match;
  }
};
const layout = (x, y, width, height) => ({ nativeEvent: { layout: { x, y, width, height } } });
const finger = (x, y) => ({ absoluteX: x, absoluteY: y, x: 20, y: 15, velocityX: 0 });
const scrollEvent = contentOffset => ({ nativeEvent: { contentOffset } });

function setup({ viewMode = "semana", density = "30min", width = 390, fontScale = 1, handedness = "right",
  overlay, entry = task, initialY = 640, onDropBooking, height = 844, nativeTop, nativeGeometry, onLog } = {}) {
  const app = fixture({ now: date + "T12:00:00", platform: "ios", viewport: { width, height, fontScale },
    insets: { top: 44, bottom: 34, left: 0, right: 0 }, onLog });
  const { AgendaBoard } = app.load("components/AgendaOperativa.tsx");
  const moves = [], horizontal = [], reserves=[];
  const props = {
    goLog: [entry], viewMode, density, handedness, selectedDateISO: date, calViewMonth: "2027-01",
    onMoveItem: (...args) => moves.push(args), onDropBooking, onReserveAtTime:(...args)=>reserves.push(args),
    dragOverlayRef: overlay ? { current: { measureInWindow: callback => callback(...overlay) } } : undefined,
  };
  const render = () => app.render(AgendaBoard, props);
  let tree = render();
  tree.props.ref.current = { measureInWindow: callback => callback(0, 80) };
  tree.props.onLayout(layout(0, 0, width, 560));
  const rowScroll = find(tree, n => n.type === "GHScrollView" && n.props.horizontal);
  rowScroll.props.ref.current = { scrollTo: command => horizontal.push(command), ...(nativeTop===undefined?{}:{measureInWindow:cb=>cb(0,nativeGeometry?.outerTop??nativeTop-58,width,nativeGeometry?.outerHeight??510)}) };
  rowScroll.props.onLayout(layout(0, nativeGeometry?11:44, width, nativeGeometry?.outerHeight??510));
  rowScroll.props.onContentSizeChange(viewMode === "dia" ? width : 1400);
  const geometry = new Map();
  const pan = () => find(render(), n => n.type === "GestureDetector" && n.props.key === entry.id).props.gesture;
  const attachDay = (id, iso, x, dayWidth, nativeOffset = 0) => {
    tree = render();
    const column = find(tree, n => n.props.key === id && n.props.onLayout);
    column.props.onLayout(layout(x, 0, dayWidth, nativeGeometry?.outerHeight??510));
    const scroll = find(column, n => n.props.testID === "calendar-day-scroll-" + id);
    const commands = [], nativeOffsets=[];let nativeY=nativeOffset??0;let acknowledge=true;
    scroll.props.ref({ scrollTo: command => {commands.push(command);if(acknowledge){nativeY=Math.max(0,Math.min(contentHeight-viewportHeight,command.y));nativeOffsets.push(nativeY);scroll.props.onScroll(scrollEvent({y:nativeY}));}}, ...(nativeTop===undefined?{}:{measureInWindow:cb=>cb(x,nativeTop,dayWidth,nativeGeometry?.viewportHeight??420)}) });
    const interval = density === "15min" ? 15 : density === "30min" ? 30 : 60;
    const rowH = nativeGeometry ? (nativeGeometry.contentHeight-12)/(1440/interval) : 40;
    for (let minute = 0; minute < 1440; minute += interval) {
      const label = String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
      const row = find(scroll, n => n.props.testID === "calendar-drop-slot-" + iso + "-" + label);
      const measured=row.props.onLayout?row:find(scroll,n=>n.type?.name==='GoCalendarSlot'&&n.props.timeHHMM===label);measured.props.onLayout(layout(0, minute / interval * rowH, dayWidth, rowH));
    }
    const contentHeight = 1440 / interval * rowH + 12;
    const viewportHeight = nativeGeometry?.viewportHeight??420;
    if (nativeOffset !== null) scroll.props.onScroll(scrollEvent({ y: nativeOffset }));
    scroll.props.onLayout(layout(0, nativeGeometry?57:58, dayWidth, viewportHeight));
    scroll.props.onContentSizeChange(dayWidth, contentHeight);
    geometry.set(id, { scroll, commands, nativeOffsets, nativeY:()=>nativeY, acknowledge:value=>{acknowledge=value;}, max: contentHeight - viewportHeight });
    return geometry.get(id);
  };
  const day = attachDay("day_" + date, date, 10, viewMode === "dia" ? width - 24 : 176, initialY);
  const clock = () => find(render(), n => n.props.testID === "calendar-drop-time")?.children[0];
  const preview = () => find(render(), n => n.props.testID === "calendar-drag-day-preview");
  return { app, props, day, pan, clock, preview, render, moves, reserves, horizontal, rowScroll, attachDay };
}

for (const [density, width, fontScale, handedness] of [
  ["auto", 390, 1, "right"], ["1h", 375, 1.4, "left"], ["30min", 390, 1, "right"], ["15min", 430, 1.3, "left"],
]) {
  test(density + ": both edges use one speed and scroll under a stationary finger until the exact slot can be released", () => {
    const initialY = density === "auto" || density === "1h" ? 300 : 640;
    const { app, day, pan, clock, moves } = setup({ density, width, fontScale, handedness, initialY });
    const gesture = pan(), pickup = finger(105, 380);
    gesture._onStart(pickup);
    gesture._onUpdate(pickup);
    assert.equal(app.frameCount(), 0);
    const lower = finger(105, 565);
    gesture._onUpdate(lower);
    app.runFrame(0); app.runFrame(16);
    const first = day.commands.at(-1).y;
    assert.ok(Math.abs(first - initialY - 3.696) < .001);
    day.scroll.props.onScroll(scrollEvent({ y: initialY })); // delayed native echo
    gesture._onUpdate(finger(105, 599));
    app.runFrame(32);
    const second = day.commands.at(-1).y;
    assert.ok(Math.abs(second - first - 3.696) < .001, "closer to the edge never accelerates");
    for (let ms = 48; ms <= 480; ms += 16) app.runFrame(ms);
    const later = day.commands.at(-1).y;
    const laterSlot = clock();
    assert.ok(later > second + 40);
    assert.ok(laterSlot);
    assert.equal(moves.length, 0);
    const central = finger(105, 405);
    gesture._onUpdate(central);
    assert.equal(app.frameCount(), 0);
    app.runFrame(496);
    assert.equal(day.commands.at(-1).y, later);
    gesture._onUpdate(finger(105, 189));
    app.runFrame(512); app.runFrame(528);
    assert.ok(Math.abs(day.commands.at(-1).y - later + 3.696) < .001);
    gesture._onUpdate(central);
    const interval = density === "15min" ? 15 : density === "30min" ? 30 : 60;
    const minute = Math.floor((central.absoluteY - 182 + day.commands.at(-1).y) / 40) * interval;
    const target = String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
    assert.equal(clock(), target);
    gesture._onFinalize(central, true);
    assert.equal(app.frameCount(), 0);
    assert.deepEqual(moves, [[task.id, date, target]]);
    assert.equal(task.duration, "30");
    assert.equal(day.scroll.props.scrollEnabled, true);
  });
}

test("vertical limits stop at midnight without changing days, and overlays, background and close stop the drag", () => {
  const { app, day, pan, preview, moves, props, render } = setup({ viewMode: "dia", initialY: 3,
    overlay: [135, 568, 105, 35] });
  const start = finger(180, 355);
  let gesture = pan();
  gesture._onStart(start); gesture._onUpdate(finger(180, 193));
  for (const ms of [0, 16, 32, 48]) app.runFrame(ms);
  assert.equal(day.commands.at(-1).y, 0);
  assert.equal(app.frameCount(), 0);
  assert.equal(preview(), undefined);
  gesture._onUpdate(finger(180, 594));
  assert.equal(app.frameCount(), 0, "floating controls are outside the drag targets");
  gesture._onFinalize(finger(180, 594), true);
  assert.deepEqual(moves, []);
  assert.equal(day.commands.at(-1).y, 3, "invalid release restores the original scroll");

  day.scroll.props.onScroll(scrollEvent({ y: day.max - 3 }));
  gesture = pan();
  gesture._onStart(start); gesture._onUpdate(finger(260, 594));
  for (const ms of [64, 80, 96, 112]) app.runFrame(ms);
  assert.equal(day.commands.at(-1).y, day.max);
  assert.equal(app.frameCount(), 0);
  assert.equal(preview(), undefined);
  gesture._onUpdate(finger(260, 190));
  assert.equal(app.frameCount(), 1);
  app.setAppState("background");
  assert.equal(app.frameCount(), 0);
  gesture._onFinalize(finger(260, 190), true);
  assert.deepEqual(moves, []);

  gesture = pan();
  gesture._onStart(start); gesture._onUpdate(finger(260, 190));
  assert.equal(app.frameCount(), 1);
  props.dragEnabled = false;
  render();
  assert.equal(app.frameCount(), 0);
  assert.deepEqual(moves, []);
});

test("Day deliberately previews a neighboring date with the source mounted and sends only the exact booking proposal on release", () => {
  const proposals = [];
  const booking = { ...task, kind: "received", type: "GO_BOOKING", customerBooking: true,
    reservationId: "11111111-1111-4111-8111-111111111111",
    businessId: "22222222-2222-4222-8222-222222222222", estado: "aceptado", bookingStatus: "confirmada" };
  const { app, attachDay, pan, preview, clock, render, moves } = setup({ viewMode: "dia", entry: booking,
    onDropBooking: (entry, destination) => proposals.push([entry.id, destination.dateISO, destination.time]) });
  const gesture = pan(), start = finger(180, 340), left = finger(22, 378);
  gesture._onStart(start); gesture._onUpdate(left);
  for (let time = 0; time <= 528; time += 16) app.runFrame(time);
  assert.equal(preview(), undefined);
  app.runFrame(560);
  assert.ok(preview());
  assert.ok(find(render(), n => n.props.key === booking.id), "origin is still mounted");
  assert.equal(app.frameCount(), 0, "holding one arrow advances only one date");
  const previous = "2026-12-31";
  const target = attachDay("drag-day_" + previous, previous, 10, 366, null);
  assert.equal(target.commands.at(-1).y, 640, "keeps the nearby hours when switching dates");
  assert.deepEqual(proposals, []);
  const slot = finger(190, 380);
  gesture._onUpdate(slot);
  const expected = clock();
  assert.equal(expected, "10:00");
  gesture._onFinalize(slot, true);
  gesture._onFinalize(slot, true);
  assert.deepEqual(proposals, [[booking.id, previous, expected]]);
  assert.deepEqual(moves, []);
  assert.equal(preview(), undefined);
  assert.equal(app.frameCount(), 0);
  assert.equal(booking.dateISO, date);

  const second = pan();
  second._onStart(start);
  const right = finger(368, 378);
  second._onUpdate(right);
  app.runFrame(600); app.runFrame(1160);
  assert.ok(preview());
  second._onFinalize(right, false);
  assert.equal(preview(), undefined);
  assert.equal(proposals.length, 1);
});

test("week keeps horizontal edge navigation, rejects stale entries and releases to the visible right-edge column", () => {
  const { app, attachDay, pan, moves, props, render, horizontal, rowScroll } = setup();
  const nextDate = "2027-01-02";
  attachDay("day_" + nextDate, nextDate, 270, 176, 640);
  const gesture = pan();
  const nearRight = finger(370, 378);
  gesture._onStart(finger(100, 378)); gesture._onUpdate(nearRight);
  app.runFrame(0); app.runFrame(16);
  assert.equal(horizontal.at(-1).x, 9.6);
  gesture._onFinalize(nearRight, true);
  assert.equal(app.frameCount(), 0);
  assert.equal(moves[0][1], nextDate);

  rowScroll.props.onScroll(scrollEvent({ x: 50 }));
  const stale = pan();
  stale._onStart(finger(100, 378)); stale._onUpdate(finger(25, 378));
  app.runFrame(32); app.runFrame(48);
  assert.equal(horizontal.at(-1).x, 40.4);
  props.goLog = [];
  render();
  stale._onFinalize(nearRight, true);
  assert.equal(moves.length, 1);
  assert.equal(app.frameCount(), 0);
});

for(const viewMode of ['semana','dia'])test(viewMode+': native viewport edges, not the sum of ancestor layout offsets, drive both directions',()=>{
 const {app,day,pan,moves}=setup({viewMode,nativeTop:300});const gesture=pan();gesture._onStart(finger(105,480));
 gesture._onUpdate(finger(105,715));app.runFrame(0);app.runFrame(16);assert.ok(day.commands.at(-1).y>640);
 const down=day.commands.at(-1).y;gesture._onUpdate(finger(105,725));app.runFrame(32);assert.ok(day.commands.at(-1).y>down,'slightly beyond the grid keeps the same drag scrolling');
 gesture._onUpdate(finger(105,295));app.runFrame(48);const up=day.commands.at(-1).y;app.runFrame(64);assert.ok(day.commands.at(-1).y<up);
 gesture._onUpdate(finger(105,480));assert.equal(app.frameCount(),0);gesture._onFinalize(finger(105,480),false);assert.equal(app.frameCount(),0);assert.equal(moves.length,0);
});

for(const viewMode of ['semana','dia'])for(const direction of [-1,1])test(viewMode+': sustained '+direction+' scroll ignores delayed subpixel native echoes',()=>{
 const {app,day,pan,moves,clock}=setup({viewMode,nativeTop:300});const gesture=pan();gesture._onStart(finger(105,480));gesture._onUpdate(finger(105,direction>0?715:305));
 app.runFrame(0);app.runFrame(8);const step=Math.abs(day.commands.at(-1).y-640);
 for(let frame=2;frame<=375;frame++){
  const commanded=day.commands.at(-1).y;
  if(frame%40===0)day.scroll.props.onScrollBeginDrag();
  day.scroll.props.onScroll(scrollEvent({y:commanded-direction*.75}));
  app.runFrame(frame*8);
  assert.ok(Math.abs(day.commands.at(-1).y-Math.max(0,Math.min(day.max,640+direction*step*frame)))<.001,'native echo must not rewind the next frame');
 }
 const offset=day.commands.at(-1).y;assert.ok(Math.abs(offset-640)>=350,'several hours stay reachable during the same hold');
 gesture._onUpdate(finger(105,480));assert.equal(app.frameCount(),0);app.runFrame(3016);assert.equal(day.commands.at(-1).y,offset);
 const minutes=Math.floor((180+offset)/40)*30,target=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
 assert.equal(clock(),target);gesture._onFinalize(finger(105,480),true);assert.deepEqual(moves,[[task.id,date,target]]);
});

for(const viewMode of ['semana','dia'])test(viewMode+': effective speed stays 231pt/s at a slower JS cadence, with bounded stalls and exact limits',()=>{
 const {app,day,pan}=setup({viewMode,nativeTop:300});const gesture=pan();gesture._onStart(finger(105,480));gesture._onUpdate(finger(105,715));app.runFrame(0);
 for(let time=50;time<=1000;time+=50)app.runFrame(time);
 assert.ok(Math.abs(day.commands.at(-1).y-871)<.001,'elapsed time is not discarded at every 32ms');
 app.runFrame(1500);assert.ok(Math.abs(day.commands.at(-1).y-894.1)<.001,'long JS stalls never cause a jump of several hours');
 for(let time=1550;time<=10000;time+=50)app.runFrame(time);
 assert.equal(day.commands.at(-1).y,day.max);assert.equal(app.frameCount(),0);
 gesture._onUpdate(finger(105,305));app.runFrame(10100);for(let time=10150;time<=25000;time+=50)app.runFrame(time);
 assert.equal(day.commands.at(-1).y,0);assert.equal(app.frameCount(),0);gesture._onFinalize(finger(105,480),false);
});

for(const viewMode of ['semana','dia'])for(const direction of [-1,1])test(viewMode+': confirmed grid offset advances across multiple hours, '+direction,()=>{
 const f=setup({viewMode,nativeTop:300});const gesture=f.pan();gesture._onStart(finger(105,480));
 const tree=f.render(),scroll=find(tree,n=>n.props.testID==='calendar-day-scroll-day_'+date);
 assert.equal(scroll.props.scrollEnabled,false,'the active card owns the touch; native manual scrolling yields only after activation');
 f.day.acknowledge(!scroll.props.scrollEnabled);gesture._onUpdate(finger(105,direction>0?715:305));f.app.runFrame(0);
 for(let ms=16;ms<=2400;ms+=16)f.app.runFrame(ms);
 assert.ok(Math.abs(f.day.nativeY()-(640+direction*554.4))<.001);
 assert.equal(f.day.nativeOffsets.length,150);assert.ok(f.day.nativeOffsets.every((y,i,a)=>i===0||(y-a[i-1])*direction>0));
 gesture._onUpdate(finger(105,480));assert.equal(f.app.frameCount(),0);gesture._onFinalize(finger(105,480),true);
 const minutes=Math.floor((180+f.day.nativeY())/40)*30;assert.equal(f.moves[0][2],String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0'));
});
for(const viewMode of ['semana','dia'])test(viewMode+': a blocked native scroller cannot fake clock progress or queue an unlimited jump',()=>{
 const f=setup({viewMode,nativeTop:300});const gesture=f.pan();gesture._onStart(finger(105,480));gesture._onUpdate(finger(105,715));
 const before=f.clock();f.day.acknowledge(false);f.app.runFrame(0);for(let ms=16;ms<=2400;ms+=16)f.app.runFrame(ms);
 assert.equal(f.day.nativeY(),640);assert.equal(f.clock(),before);assert.ok(f.day.commands.at(-1).y<=663.101);
 f.day.acknowledge(true);f.app.runFrame(2416);assert.ok(f.day.nativeY()>640);assert.ok(f.day.nativeY()<=663.101);gesture._onFinalize(finger(105,480),false);
});
for(const viewMode of ['semana','dia'])test(viewMode+': queued empty-slot reservation and tap cannot escape a drag release; a fresh touch remains legitimate',()=>{
 const f=setup({viewMode});const tree=f.render();const slot=find(tree,n=>n.type?.name==='GoCalendarSlot'&&n.props.onLongPress);
 assert.ok(slot);const invoke=()=>slot.props.onLongPress(date,'14:00');invoke();assert.equal(f.reserves.length,1);
 const gesture=f.pan();gesture._onStart(finger(105,380));invoke();assert.equal(f.reserves.length,1);gesture._onFinalize(finger(105,400),false);
 invoke();assert.equal(f.reserves.length,1,'late callback from before disabled render stays blocked');
 f.render().props.onTouchStart();invoke();assert.equal(f.reserves.length,2,'only a new physical touch clears suppression');
});

// Outer bounds, viewport/content heights and the overshoot below 741.7 are
// recorded on the real iPhone. The inner top is reconstructed from these heights.
for(const viewMode of ['semana','dia'])for(const direction of [-1,1])test(viewMode+': recorded iPhone edge overshoot keeps scrolling, clock and valid release, '+direction,()=>{
 const geometry={outerTop:91,outerHeight:638.6666870117188,viewportHeight:581.6666870117188,contentHeight:1637};
 const f=setup({viewMode,nativeTop:148,nativeGeometry:geometry});const gesture=f.pan(),edge=finger(105,direction>0?799.3:50);
 gesture._onStart(finger(105,400));gesture._onUpdate(edge);f.app.runFrame(0);
 for(let ms=16;ms<=1600;ms+=16)f.app.runFrame(ms);
 assert.ok(Math.abs(f.day.nativeY()-(640+direction*369.6))<.001,'confirmed grid motion continues while the finger remains outside its visible edge');
 assert.ok(f.clock(),'target clock stays visible beyond the grid');
 gesture._onUpdate(finger(105,450));const stopped=f.day.nativeY();assert.equal(f.app.frameCount(),0);f.app.runFrame(2000);assert.equal(f.day.nativeY(),stopped);
 gesture._onUpdate(edge);f.app.runFrame(2016);f.app.runFrame(2032);assert.ok((f.day.nativeY()-stopped)*direction>0);
 for(let ms=2048;ms<=14000;ms+=16)f.app.runFrame(ms);
 assert.equal(f.day.nativeY(),direction>0?f.day.max:0);assert.equal(f.app.frameCount(),0);
 const target=f.clock();assert.equal(target,direction>0?'23:30':'00:00');
 gesture._onFinalize(edge,true);assert.deepEqual(f.moves,[[task.id,date,target]]);assert.equal(f.day.nativeY(),direction>0?f.day.max:0,'valid edge release never restores the initial offset');
});

for(const handedness of ['left','right'])test('week column seam/'+handedness+': crossing the measured gap never clears the destination or clock',()=>{
 const f=setup({handedness});const nextDate='2027-01-02';f.attachDay('day_'+nextDate,nextDate,196,176,640);
 const gesture=f.pan();gesture._onStart(finger(105,380));
 for(const x of [185,186.5,188,189.9,190,191,193,195.9,196,205,193,190,189,187,185,191]){
  gesture._onUpdate(finger(x,405));assert.equal(f.clock(),'10:30','a column gap must not temporarily lose the selected time');
  const tree=f.render(),id='day_'+(x<191?date:nextDate),column=find(tree,n=>n.props.key===id&&n.props.onLayout);
  const style=Object.assign({},...column.props.style.flat(Infinity).filter(Boolean));assert.equal(style.borderColor,'#22c55e','nearest day at x='+x+' expected '+id);
 }
 gesture._onFinalize(finger(191,405),true);assert.deepEqual(f.moves,[[task.id,nextDate,'10:30']]);assert.equal(f.app.frameCount(),0);
});

test('column transitions do not build booking/render console payloads during a held drag',()=>{
 const labels=[],f=setup({onLog:label=>labels.push(label)});assert.ok(labels.includes('[CALENDAR_RENDER_ITEMS]'));
 f.attachDay('day_2027-01-02','2027-01-02',196,176,640);labels.length=0;
 const gesture=f.pan();gesture._onStart(finger(105,380));labels.length=0;
 for(const x of [185,188,190,195,205,189,185]){gesture._onUpdate(finger(x,405));f.render();}
 assert.equal(labels.filter(label=>label==='[CALENDAR_RENDER_ITEMS]'||label==='[BOOKING_CARD_SOURCE]').length,0,'booking/render diagnostic objects must stay out of the active render path');
 gesture._onFinalize(finger(185,405),false);f.render();assert.ok(labels.includes('[CALENDAR_RENDER_ITEMS]'),'normal diagnostic behavior is retained outside a drag');
});
