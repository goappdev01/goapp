import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers/calendar-fixture.mjs";

const nodes = (node, match) => node && typeof node === "object"
  ? [...(match(node) ? [node] : []), ...(node.children ?? []).flatMap(child => nodes(child, match))]
  : [];
const style = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const date = "2027-01-01";
const task = {
  id: "personal-task", type: "TAREA_INTERNA", kind: "sent", intentKey: "accion_generica",
  intentLabel: "Revisar", dateISO: date, date, time: "13:00", duration: "30",
  estado: "pendiente", notes: "Tarea de prueba", detail: "Detalle de la tarea",
};

for (const [device, width, height, boardX] of [["iPhone", 390, 844, 0], ["iPad", 820, 1180, 40]]) {
  test(device + ": a quick tap opens the card, the long press owns the drag, and only release moves it", () => {
    const app = fixture({ platform: "ios", viewport: { width, height, fontScale: 1 }, now: date + "T08:00:00" });
    const { AgendaBoard } = app.load("components/AgendaOperativa.tsx");
    const moves = [], fallback = [];
    const props = {
      goLog: [task], viewMode: "semana", density: "30min", selectedDateISO: date,
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
    for (const [time, y] of [["13:00", 630], ["13:30", 700], ["14:00", 736]]) {
      row(tree, time).props.onLayout({ nativeEvent: { layout: { x: 0, y, width: 176, height: 36 } } });
    }
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
    tree = render();
    const float = tree => nodes(tree, n => n.type === "ReAnimated.View" && n.props.pointerEvents === "none")[0];
    assert.equal(style(float(tree).props.style).left, pickup.absoluteX - boardX - pickup.x);
    assert.equal(horizontal(tree).props.scrollEnabled, true, "do not reset the native scroll while it owns a touch sequence");
    assert.equal(dayScroll(tree).props.scrollEnabled, true);
    getTap(tree)._onEnd(pickup, false);
    pan._onUpdate(slotOne);
    tree = render();
    assert.equal(detail(tree), false);
    assert.equal(style(float(tree).props.style).top, slotOne.absoluteY - boardY - pickup.y);
    assert.equal(style(row(tree, "13:30").props.style).borderColor, "rgba(34,211,238,0.92)");
    pan._onUpdate(slotTwo);
    tree = render();
    assert.equal(style(row(tree, "13:30").props.style).borderColor, undefined);
    assert.equal(style(row(tree, "14:00").props.style).borderColor, "rgba(34,211,238,0.92)");
    assert.equal(moves.length, 0, "hover does not move the record");
    pan._onFinalize(slotTwo, false);
    tree = render();
    assert.equal(float(tree), undefined);
    assert.equal(style(row(tree, "14:00").props.style).borderColor, undefined);
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
    assert.deepEqual(moves, [[task.id, date, "14:00"]]);
    assert.deepEqual(fallback, []);
    assert.equal(detail(tree), false);
    assert.equal(float(tree), undefined);
  });
}
