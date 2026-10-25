import type { ViewInstance } from "react-native";
import React, { createContext, useContext, useRef, useState } from "react";
import { PanResponder, Text, View, type ViewStyle } from "react-native";

export type DropTarget = { id: string; kind: "board" | "column" | "card" | "day"; columnId?: string; date?: string };
type Rect = { x: number; y: number; width: number; height: number };
export function boardDropTarget(targets: Array<DropTarget & Rect>, x: number, y: number, kind: DropTarget["kind"]) {
  return targets.filter(t => x >= t.x && x <= t.x + t.width && y >= t.y && y <= t.y + t.height
    && (kind === "card" ? ["card", "column", "day", "board"].includes(t.kind) : kind === t.kind))
    .sort((a, b) => a.width * a.height - b.width * b.height)[0];
}
type DragValue = {
  drag: boolean; register: (id: string, target: DropTarget, node: ViewInstance | null) => void;
  begin: (source: DropTarget, label: string, x: number, y: number, rect: Rect) => void;
  move: (x: number, y: number) => void; end: (x: number, y: number, cancel?: boolean) => void;
};
const Context = createContext<DragValue | null>(null);
export function BoardDragSurface({ children, onDrop }: { children: React.ReactNode; onDrop: (from: DropTarget, to: DropTarget) => void }) {
  const root = useRef<ViewInstance>(null), registry = useRef(new Map<string, { target: DropTarget; node: ViewInstance }>());
  const current = useRef<{ source: DropTarget; targets: Array<DropTarget & Rect>; startX: number; startY: number; rect: Rect } | null>(null);
  const [ghost, setGhost] = useState<(Rect & { label: string }) | null>(null);
  const offset = useRef({ x: 0, y: 0 });
  const value: DragValue = {
    drag: !!ghost,
    register(id, target, node) { if (node) registry.current.set(id, { target, node }); else registry.current.delete(id); },
    begin(source, label, x, y, rect) {
      const drag = { source, targets: [] as Array<DropTarget & Rect>, startX: x, startY: y, rect }; current.current = drag;
      root.current?.measureInWindow((rx, ry) => { offset.current = { x: rx, y: ry }; setGhost({ ...rect, x: rect.x - rx, y: rect.y - ry, label }); });
      for (const { node, target } of registry.current.values()) node.measureInWindow((tx, ty, width, height) => {
        if (current.current === drag) drag.targets.push({ ...target, x: tx, y: ty, width, height });
      });
    },
    move(x, y) { const d = current.current; if (d) setGhost(g => g && ({ ...g,
      x: d.rect.x - offset.current.x + x - d.startX, y: d.rect.y - offset.current.y + y - d.startY })); },
    end(x, y, cancel) { const d = current.current; current.current = null; setGhost(null);
      if (d && !cancel) { const hit = boardDropTarget(d.targets, x, y, d.source.kind); if (hit && hit.id !== d.source.id) onDrop(d.source, hit); }
    },
  };
  return <Context.Provider value={value}><View ref={root} style={{ flex: 1 }}>
    {children}
    {ghost && <View pointerEvents="none" style={{ position: "absolute", left: ghost.x, top: ghost.y,
      width: ghost.width, minHeight: ghost.height, borderRadius: 12, padding: 14, backgroundColor: "#26344f", borderWidth: 2,
      borderColor: "#b5a1ef", zIndex: 9999, elevation: 30 }}><Text style={{ color: "white" }}>{ghost.label}</Text></View>}
  </View></Context.Provider>;
}
export function useBoardDragging() { return useContext(Context)?.drag ?? false; }
/** Long hold activates drag. Its origin is the actual initial finger position. */
export function BoardDragItem({ target, label, children, style, draggable = true }: {
  target: DropTarget; label: string; children: React.ReactNode; style?: ViewStyle; draggable?: boolean;
}) {
  const context = useContext(Context), live = useRef(context); live.current = context;
  const node = useRef<ViewInstance | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = useRef({ x: 0, y: 0, active: false });
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const gesture = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: () => touch.current.active,
    onPanResponderMove: (_, state) => live.current?.move(state.moveX, state.moveY),
    onPanResponderRelease: (_, state) => { stop(); live.current?.end(state.moveX, state.moveY); touch.current.active = false; },
    onPanResponderTerminate: () => { stop(); live.current?.end(0, 0, true); touch.current.active = false; },
  })).current;
  React.useEffect(() => () => { stop(); live.current?.register(target.id, target, null); }, [target.id]);
  return <View ref={ref => { node.current = ref; context?.register(target.id, target, ref); }} collapsable={false}
    style={style} {...gesture.panHandlers}
    onTouchStart={e => { if (!draggable) return; e.stopPropagation(); stop(); const { pageX: x, pageY: y } = e.nativeEvent;
      touch.current = { x, y, active: false }; timer.current = setTimeout(() => { touch.current.active = true;
        node.current?.measureInWindow((rx, ry, width, height) => live.current?.begin(target, label, x, y, { x: rx, y: ry, width, height }));
      }, 380);
    }}
    onTouchMove={e => { if (!touch.current.active && Math.hypot(e.nativeEvent.pageX - touch.current.x, e.nativeEvent.pageY - touch.current.y) > 8) stop(); }}
    onTouchEnd={e => { stop(); if (touch.current.active) { live.current?.end(e.nativeEvent.pageX, e.nativeEvent.pageY); touch.current.active = false; } }}>
    {children}
  </View>;
}
