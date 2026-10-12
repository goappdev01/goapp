import React, { useEffect, useMemo, useRef } from "react";
import { ScrollView, StyleSheet, View, type ScrollViewProps } from "react-native";
import { Gesture, GestureDetector, type PanGesture } from "react-native-gesture-handler";
import type { LandingFrame } from "./landingResponsiveLayout";

/** Preserve absolute geometry until content needs a bounded scroll area. */
export function LandingContentViewport({ frame, closingGesture, children }: {
  frame: LandingFrame; closingGesture: PanGesture; children: React.ReactNode;
}) {
  const scroll = useRef<ScrollView>(null);
  const nativeGesture = useMemo(() => Gesture.Native().enabled(frame.scroll)
    .blocksExternalGesture(closingGesture), [closingGesture, frame.scroll]);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [frame.width, frame.height, frame.virtual]);
  if (!frame.virtual) return <View testID="landing-content-static" pointerEvents="box-none"
    style={StyleSheet.absoluteFill}>{children}</View>;
  const bounds = { position: "absolute" as const, left: frame.left, top: frame.top,
    width: frame.width, height: frame.height, zIndex: 7 };
  const canvas = <View pointerEvents="box-none" style={{ height: frame.contentHeight, width: frame.width }}>{children}</View>;
  if (!frame.scroll) return <View testID="landing-content-column" pointerEvents="box-none" style={bounds}>{canvas}</View>;
  return <GestureDetector gesture={nativeGesture}>
    <ScrollView ref={scroll} testID="landing-content-scroll" style={bounds}
      contentContainerStyle={{ height: frame.contentHeight }}
      directionalLockEnabled nestedScrollEnabled bounces={false}
      keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
      {canvas}
    </ScrollView>
  </GestureDetector>;
}

/** A natural-height View inside the outer scroll avoids an unbounded nested ScrollView. */
export function LandingCardContents({ overflowing, onHeight, contentContainerStyle, children }: {
  overflowing: boolean; onHeight: (height: number) => void;
  contentContainerStyle: ScrollViewProps["contentContainerStyle"]; children: React.ReactNode;
}) {
  if (overflowing) return <View style={contentContainerStyle}
    onLayout={(e) => onHeight(e.nativeEvent.layout.height)}>{children}</View>;
  return <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={contentContainerStyle}
    directionalLockEnabled showsVerticalScrollIndicator={false}
    onContentSizeChange={(_width, height) => onHeight(height)}>{children}</ScrollView>;
}
