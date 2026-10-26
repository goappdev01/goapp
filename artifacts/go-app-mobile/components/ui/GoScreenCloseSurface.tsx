import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { calendarGestureOwnership } from "@/lib/calendarGestureOwnership";
import { createScreenCloseGesture, type CloseGuideBounds } from "@/lib/screenCloseGesture";
import { CalendarCloseGuide } from "./CalendarCloseGuide";
import { GoScreenLayerActive } from "./GoScreenModal";

const CloseGuide = createContext<{ set: (bounds: CloseGuideBounds) => void; handedness: "left" | "right" } | null>(null);
type ScrollTarget = { getNativeScrollRef?: () => ScrollTarget | null; getScrollRef?: () => ScrollTarget | null;
  setNativeProps?: (props: { scrollEnabled: boolean }) => void };

/** Replaces an existing root View: no extra native layout or navigation layer. */
export function GoScreenCloseSurface({ as: Root = View, handedness = "right", enabled = true, onClose, scrollRefs = [], onLayout, ...props }: ViewProps & {
  as?: React.ElementType; handedness?: "left" | "right"; enabled?: boolean; onClose: () => void;
  scrollRefs?: readonly { current: unknown }[];
}) {
  const active = useContext(GoScreenLayerActive), closing = useRef(false);
  const guide = useRef<CloseGuideBounds | null>(null), live = useRef({ active, enabled, handedness, onClose, scrollRefs });
  live.current = { active, enabled, handedness, onClose, scrollRefs };
  const pan = useMemo(() => createScreenCloseGesture({
    guide: () => guide.current, handedness: () => live.current.handedness,
    enabled: () => live.current.active && live.current.enabled && !closing.current,
    onClose: () => { if (closing.current || !live.current.active || !live.current.enabled) return; closing.current = true; live.current.onClose(); },
    scrollEnabled: enabled => { for (const ref of live.current.scrollRefs) {
      const instance = ref.current as ScrollTarget | null;
      const target = instance?.getNativeScrollRef?.() ?? instance?.getScrollRef?.() ?? instance;
      target?.setNativeProps?.({ scrollEnabled: enabled });
    } },
  }), []);
  useLayoutEffect(() => {
    const release = calendarGestureOwnership.openDetail();
    return () => { pan.release(); release(); };
  }, [pan]);
  useLayoutEffect(() => { if (!active || !enabled) pan.release(); }, [active, enabled, pan]);
  const set = useCallback((bounds: CloseGuideBounds) => { guide.current = bounds; }, []);
  const context = useMemo(() => ({ set, handedness }), [set, handedness]);
  return <CloseGuide.Provider value={context}><Root {...props} {...pan.panHandlers} onLayout={onLayout} /></CloseGuide.Provider>;
}

/** Same visual gradient as Calendar; measure its real parent rather than window coordinates. */
export function GoScreenCloseGuide({ testID = "screen-close-guide" }: { testID?: string }) {
  const area = useContext(CloseGuide), view = useRef<React.ElementRef<typeof View>>(null);
  const measure = useCallback(() => {
    view.current?.measureInWindow((x, y, width, height) => {
      area?.set({ x: x + (area.handedness === "right" ? width * .75 : 0), y: y + height * .5, width: width * .25, height: height * .5 });
    });
  }, [area]);
  useLayoutEffect(measure, [measure]);
  return <View ref={view} testID={testID + "-bounds"} collapsable={false} onLayout={measure} pointerEvents="none"
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <CalendarCloseGuide handedness={area?.handedness} testID={testID} />
  </View>;
}
