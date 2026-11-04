import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers/calendar-fixture.mjs";

const nodes = (node, match) => node && typeof node === "object"
  ? [...(match(node) ? [node] : []), ...(node.children ?? []).flatMap(child => nodes(child, match))]
  : [];
const style = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const date = "2027-01-01";
const personalTask = {
  id: "personal-task", type: "TAREA_INTERNA", kind: "sent", intentKey: "accion_generica",
  intentLabel: "Revisar", dateISO: date, date, time: "13:00", duration: "30",
  estado: "pendiente", notes: "Tarea de prueba", detail: "Detalle de la tarea",
};

const booking = {
  ...personalTask, id: "booking", type: "GO_BOOKING", kind: "received", customerBooking: true,
  reservationId: "11111111-1111-4111-8111-111111111111",
  businessId: "22222222-2222-4222-8222-222222222222", estado: "aceptado", bookingStatus: "confirmada",
};

for (const [device, width, height, boardX, task, density = "30min"] of [
  ["iPhone", 390, 844, 0, personalTask],
  ["iPad", 820, 1180, 40, personalTask],
  ["iPhone 15min", 390, 844, 0, personalTask, "15min"],
  ["iPhone 1h", 390, 844, 0, personalTask, "1h"],
  ["iPhone reservation", 390, 844, 0, booking],
]) {
  test(device + ": a quick tap opens the card, the long press owns the drag, and only release moves it", () => {
    const app = fixture({ platform: "ios", viewport: { width, height, fontScale: 1 }, now: date + "T08:00:00" });
    const { AgendaBoard } = app.load("components/AgendaOperativa.tsx");
    const moves = [], fallback = [];
    const props = {
      goLog: [task], viewMode: "semana", density, selectedDateISO: date,
      onCreateTaskAtTime() {},
      onMoveItem: (...args) => moves.push(args), onOpenMoveFlow: (...args) => fallback.push(args),
    };
    const render = () => app.render(AgendaBoard, props);
    let tree = render();
    const getPan = tree => nodes(tree, n => n.type === "GestureDetector" && n.props.key === task.id)[0].props.gesture;
    const getTap = tree => nodes(tree, n => n.type === "GestureDetector" && n.props.gesture?._maxDuration === 350)[0].props.gesture;
    const detail = tree => nodes(tree, n => n.props.testID === "entry-details-scroll").length > 0;

    const tap = getTap(tree), firstPan = getPan(tree);
    assert.equal(tap._requireExternalGestureToFail, firstPan);
    assert.equal(tap._maxDistance, 10);
    assert.equal(firstPan._activateAfterLongPress, 400);
    assert.equal(firstPan._shouldCancelWhenOutside, false);
    assert.equal(firstPan._cancelsTouchesInView, true);
    assert.equal(nodes(tree, n => n.props.testID === "calendar-entry-open-" + task.id)[0].props.onPress, undefined);
    firstPan._onFinalize({}, false);
    tap._onEnd({}, true);
    tree = render();
    assert.equal(detail(tree), true);
    nodes(tree, n => n.type === "Modal" && n.props.visible && n.props.onRequestClose)[0].props.onRequestClose();
    tree = render();
    nodes(tree, n => n.props.testID === "entry-details-modal")[0].props.onDismiss();
    tree = render();

    const boardY = 100, columnsY = 52, viewportY = 70;
    tree.props.ref.current = { measureInWindow: callback => callback(boardX, boardY) };
    tree.props.onLayout();
    const horizontal = tree => nodes(tree, n => n.type === "GHScrollView" && n.props.horizontal)[0];
    const dayScroll = tree => nodes(tree, n => n.props.testID === "calendar-day-scroll-day_" + date)[0];
    horizontal(tree).props.onLayout({ nativeEvent: { layout: { x: 0, y: columnsY, width, height: 550 } } });
    const column = nodes(tree, n => n.props.key === "day_" + date && n.props.onLayout)[0];
    column.props.onLayout({ nativeEvent: { layout: { x: 30, y: 0, width: style(column.props.style).width, height: 550 } } });
    dayScroll(tree).props.onLayout({ nativeEvent: { layout: { x: 0, y: viewportY, width: 176, height: 440 } } });
    dayScroll(tree).props.onScroll({ nativeEvent: { contentOffset: { y: 500 } } });
    const row = (tree, time) => nodes(tree, n => n.props.testID === "calendar-drop-slot-" + date + "-" + time)[0];
    const sourceTime = "13:00";
    const [firstTarget, secondTarget] = density === "15min" ? ["13:15", "13:30"]
      : density === "1h" ? ["14:00", "15:00"] : ["13:30", "14:00"];
    for (const [time, y] of [[sourceTime, 630], [firstTarget, 700], [secondTarget, 736]]) {
      const measured = time === sourceTime ? row(tree, time) : nodes(dayScroll(tree),
        n => n.type?.name === "GoCalendarSlot" && n.props.timeHHMM === time)[0];
      if (time !== sourceTime) assert.equal(row(tree, time).props.onLayout, undefined);
      measured.props.onLayout({ nativeEvent: { layout: { x: 0, y, width: 176, height: 36 } } });
    }
    const sourceRow = row(tree, sourceTime);
    const sourceStyle = style(sourceRow.props.style);
    assert.equal(nodes(sourceRow, n => n.props.testID === "calendar-entry-" + task.id).length, 1);
    const cue = (tree, time) => nodes(row(tree, time), n => n.props.testID === "calendar-drop-slot-highlight")[0];
    const at = (y, x = 0) => ({
      absoluteX: boardX + 85 + x, absoluteY: boardY + columnsY + viewportY + y - 500 + 15,
      x: 22, y: 15, velocityX: 0,
    });
    const pickup = at(630), slotOne = at(700, 12), slotTwo = at(736, 20);
    const pan = getPan(tree);
    // Native scroll wins an early vertical swipe. Failed tap and pan callbacks
    // cannot change selection, open a card, or persist a move.
    getTap(tree)._onEnd(slotOne, false);
    pan._onFinalize(slotOne, false);
    tree = render();
    assert.equal(detail(tree), false);
    assert.equal(horizontal(tree).props.scrollEnabled, true);
    assert.equal(dayScroll(tree).props.scrollEnabled, true);

    pan._onStart(pickup);
    // RNGH emits its first update at activation, still inside the occupied source row.
    pan._onUpdate(pickup);
    tree = render();
    assert.deepEqual(style(row(tree, sourceTime).props.style), sourceStyle,
      "the highlighted ancestor of the active recognizer must keep its native stacking context and layout");
    assert.equal(nodes(row(tree, sourceTime), n => n.props.testID === "calendar-entry-" + task.id).length, 1);
    assert.equal(cue(tree, sourceTime).props.pointerEvents, "none");
    assert.equal(style(cue(tree, sourceTime).props.style).position, "absolute");
    const float = tree => nodes(tree, n => n.type === "ReAnimated.View" && n.props.pointerEvents === "none")[0];
    assert.equal(style(float(tree).props.style).left, pickup.absoluteX - boardX - pickup.x);
    assert.equal(horizontal(tree).props.scrollEnabled, true, "do not reset the native scroll while it owns a touch sequence");
    assert.equal(dayScroll(tree).props.scrollEnabled, true);
    getTap(tree)._onEnd(pickup, false);
    pan._onUpdate(slotOne);
    tree = render();
    assert.equal(detail(tree), false);
    assert.equal(style(float(tree).props.style).top, slotOne.absoluteY - boardY - pickup.y);
    assert.equal(cue(tree, sourceTime), undefined);
    assert.equal(style(cue(tree, firstTarget).props.style).borderColor, "rgba(34,211,238,0.92)");
    pan._onUpdate(slotTwo);
    tree = render();
    assert.equal(cue(tree, firstTarget), undefined);
    assert.equal(style(cue(tree, secondTarget).props.style).borderColor, "rgba(34,211,238,0.92)");
    assert.deepEqual(style(row(tree, sourceTime).props.style), sourceStyle);
    assert.equal(moves.length, 0, "hover does not move the record");
    pan._onFinalize(slotTwo, false);
    tree = render();
    assert.equal(float(tree), undefined);
    assert.equal(cue(tree, secondTarget), undefined);
    assert.deepEqual(moves, []);
    assert.equal(task.time, "13:00");

    const outside = getPan(tree);
    outside._onStart(pickup);
    outside._onUpdate(slotOne);
    outside._onFinalize({ ...slotOne, absoluteY: boardY + 10 }, true);
    tree = render();
    assert.deepEqual(moves, [], "releasing above the board leaves the task untouched");
    assert.deepEqual(fallback, []);

    const retry = getPan(tree);
    retry._onStart(pickup);
    retry._onUpdate(slotTwo);
    retry._onFinalize(slotTwo, true);
    retry._onFinalize(slotTwo, true);
    tree = render();
    assert.deepEqual(moves, task.customerBooking ? [] : [[task.id, date, secondTarget]]);
    assert.deepEqual(fallback, task.customerBooking ? [[task.id, date, date, "13:00", false]] : []);
    assert.equal(detail(tree), false);
    assert.equal(float(tree), undefined);
  });
}
