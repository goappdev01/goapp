import React, { useContext, useState } from "react";
import { StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { GO_NAVIGATION_SIZE } from "./GoCloseButton";
import { GoNavigationHand } from "./GoNavigationHand";
import { DraggableFAB } from "../DraggableFAB";

const GAP = 10;
const EDGE = 12;
const GUTTER = 8;
const BOTTOM = 24;
export const GO_NAVIGATION_OVERLAY_CLEARANCE = GO_NAVIGATION_SIZE + BOTTOM + 16;

type Props = { controls: React.ReactNode; children: React.ReactNode; draggableScreenKey?:string; reservedBottom?:number };

/** Opt-in for rotating screens. The parent provides the native safe area. */
export function GoNavigationRail({ controls, children, draggableScreenKey, reservedBottom=0 }: Props) {
  const hand = useContext(GoNavigationHand);
  const [height, setHeight] = useState<number>();
  const [width,setWidth]=useState(0);
  const left = hand === "left";
  // The two targets share one compact row, leaving the calculator above them.
  const controlHeight = GO_NAVIGATION_SIZE;
  const bottom = height === undefined ? BOTTOM : Math.max(0, Math.min(BOTTOM, height - controlHeight));
  return (
    <KeyboardAvoidingView behavior="height" style={styles.fill}>
      <View
        style={styles.body}
        onLayout={event => {setHeight(event.nativeEvent.layout.height);setWidth(event.nativeEvent.layout.width);}}
      >
        <View style={styles.content}>{children}</View>
        {draggableScreenKey&&width>0&&height!==undefined?<DraggableFAB navigation keyboardResponsive screenKey={draggableScreenKey} buttonKey="navigation" bounds={{width,height}} boundsVerticalInset={4} initialRight={EDGE} initialBottom={reservedBottom+8} buttonWidth={GO_NAVIGATION_SIZE*2+GAP} maxH={GO_NAVIGATION_SIZE} avoidRects={[{x:0,y:Math.max(0,height-reservedBottom),width,height:reservedBottom}]}>
          <View style={{flexDirection:left?"row-reverse":"row",gap:GAP}}>{controls}</View>
        </DraggableFAB>:!draggableScreenKey&&<View
          testID="go-navigation-rail"
          pointerEvents="box-none"
          style={[styles.rail, {
            left: left ? 0 : undefined,
            right: left ? undefined : 0,
            flexDirection: left ? "row-reverse" : "row",
            paddingLeft: left ? EDGE : GUTTER,
            paddingRight: left ? GUTTER : EDGE,
            paddingBottom: bottom,
          }]}
        >
          {controls}
        </View>}
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
