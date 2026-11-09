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
  overlay, entry = task, initialY = 640, onDropBooking, height = 844 } = {}) {
  const app = fixture({ now: date + "T12:00:00", platform: "ios", viewport: { width, height, fontScale },
    insets: { top: 44, bottom: 34, left: 0, right: 0 } });
  const { AgendaBoard } = app.load("components/AgendaOperativa.tsx");
  const moves = [], horizontal = [];
  const props = {
    goLog: [entry], viewMode, density, handedness, selectedDateISO: date, calViewMonth: "2027-01",
    onMoveItem: (...args) => moves.push(args), onDropBooking,
    dragOverlayRef: overlay ? { current: { measureInWindow: callback => callback(...overlay) } } : undefined,
  };
  const render = () => app.render(AgendaBoard, props);
  let tree = render();
  tree.props.ref.current = { measureInWindow: callback => callback(0, 80) };
  tree.props.onLayout(layout(0, 0, width, 560));
  const rowScroll = find(tree, n => n.type === "GHScrollView" && n.props.horizontal);
  rowScroll.props.ref.current = { scrollTo: command => horizontal.push(command) };
  rowScroll.props.onLayout(layout(0, 44, width, 510));
  rowScroll.props.onContentSizeChange(viewMode === "dia" ? width : 1400);
  const geometry = new Map();
  const pan = () => find(render(), n => n.type === "GestureDetector" && n.props.key === entry.id).props.gesture;
  const attachDay = (id, iso, x, dayWidth, nativeOffset = 0) => {
    tree = render();
    const column = find(tree, n => n.props.key === id && n.props.onLayout);
    column.props.onLayout(layout(x, 0, dayWidth, 510));
    const scroll = find(column, n => n.props.testID === "calendar-day-scroll-" + id);
    const commands = [];
    scroll.props.ref({ scrollTo: command => commands.push(command) });
    const interval = density === "15min" ? 15 : density === "30min" ? 30 : 60;
    const rowH = 40;
    for (let minute = 0; minute < 1440; minute += interval) {
      const label = String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
      const row = find(scroll, n => n.props.testID === "calendar-drop-slot-" + iso + "-" + label);
      row.props.onLayout(layout(0, minute / interval * rowH, dayWidth, rowH));
    }
    const contentHeight = 1440 / interval * rowH + 12;
    const viewportHeight = 420;
    if (nativeOffset !== null) scroll.props.onScroll(scrollEvent({ y: nativeOffset }));
    scroll.props.onLayout(layout(0, 58, dayWidth, viewportHeight));
    scroll.props.onContentSizeChange(dayWidth, contentHeight);
    geometry.set(id, { scroll, commands, max: contentHeight - viewportHeight });
    return geometry.get(id);
  };
  const day = attachDay("day_" + date, date, 10, viewMode === "dia" ? width - 24 : 176, initialY);
  const clock = () => find(render(), n => n.props.testID === "calendar-drop-time")?.children[0];
  const preview = () => find(render(), n => n.props.testID === "calendar-drag-day-preview");
  return { app, props, day, pan, clock, preview, render, moves, horizontal, rowScroll, attachDay };
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
    assert.ok(Math.abs(first - initialY - 1.92) < .001);
    day.scroll.props.onScroll(scrollEvent({ y: initialY })); // delayed native echo
    gesture._onUpdate(finger(105, 599));
    app.runFrame(32);
    const second = day.commands.at(-1).y;
    assert.ok(Math.abs(second - first - 1.92) < .001, "closer to the edge never accelerates");
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
    assert.ok(Math.abs(day.commands.at(-1).y - later + 1.92) < .001);
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
