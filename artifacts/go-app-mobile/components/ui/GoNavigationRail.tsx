import React, { useContext, useState } from "react";
import { StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { GO_NAVIGATION_SIZE } from "./GoCloseButton";
import { GoNavigationHand } from "./GoNavigationHand";

const GAP = 10;
const EDGE = 12;
const GUTTER = 8;
const BOTTOM = 24;
const STACK_HEIGHT = GO_NAVIGATION_SIZE * 2 + GAP;
export const GO_NAVIGATION_OVERLAY_CLEARANCE = STACK_HEIGHT + BOTTOM + 16;

type Props = { controls: React.ReactNode; children: React.ReactNode };

/** Opt-in for rotating screens. The parent provides the native safe area. */
export function GoNavigationRail({ controls, children }: Props) {
  const hand = useContext(GoNavigationHand);
  const [height, setHeight] = useState<number>();
  const left = hand === "left";
  // With the keyboard open in landscape, keep both targets at full size.
  const stacked = height === undefined || height >= STACK_HEIGHT;
  const controlHeight = stacked ? STACK_HEIGHT : GO_NAVIGATION_SIZE;
  const bottom = height === undefined ? BOTTOM : Math.max(0, Math.min(BOTTOM, height - controlHeight));
  return (
    <KeyboardAvoidingView behavior="height" style={styles.fill}>
      <View
        style={styles.body}
        onLayout={event => setHeight(event.nativeEvent.layout.height)}
      >
        <View style={styles.content}>{children}</View>
        <View
          testID="go-navigation-rail"
          pointerEvents="box-none"
          style={[styles.rail, {
            left: left ? 0 : undefined,
            right: left ? undefined : 0,
            flexDirection: stacked ? "column" : left ? "row-reverse" : "row",
            paddingLeft: left ? EDGE : GUTTER,
            paddingRight: left ? GUTTER : EDGE,
            paddingBottom: bottom,
          }]}
        >
          {controls}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { flex: 1, minHeight: 0, direction: "ltr", position: "relative" },
  content: { flex: 1, minWidth: 0, overflow: "hidden" },
  rail: { position: "absolute", bottom: 0, justifyContent: "flex-end", alignItems: "flex-end", gap: GAP },
});
