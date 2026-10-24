import React from "react";
import { ScrollView, StyleSheet, View, type ScrollViewProps } from "react-native";
import type { PanGesture } from "react-native-gesture-handler";
import type { LandingFrame } from "./landingResponsiveLayout";

/** Fixed layers preserve card and transport coordinates and never capture vertical scrolling. */
export function LandingContentViewport({ frame, children, offsetY = 0 }: {
  frame: LandingFrame; offsetY?: number; closingGesture: PanGesture; children: React.ReactNode;
}) {
  if (!frame.virtual) return <View testID="landing-content-static" pointerEvents="box-none"
    style={[StyleSheet.absoluteFill, offsetY ? { transform: [{ translateY: offsetY }] } : undefined]}>{children}</View>;
  return <View testID="landing-content-column" pointerEvents="box-none"
    style={{ position: "absolute", left: frame.left, top: frame.top + offsetY,
      width: frame.width, height: frame.height, zIndex: 7 }}>
    <View pointerEvents="box-none" style={{ height: frame.height, width: frame.width }}>{children}</View>
  </View>;
}

type LandingCardProps = {
  /** Compact Landing cards open their complete information in the existing detail sheet. */
  staticBody?: boolean;
  header?: React.ReactNode;
  headerGap?: number;
  footer?: React.ReactNode;
  footerGap?: number;
  bodyFrame?: (body: React.ReactNode) => React.ReactNode;
  /** Available safe panel space, and the existing frame's padding plus borders. */
  adaptiveBody?: { availableHeight: number; frameVerticalInset: number; width?: number;
    headerObstacles?: readonly { x: number; y: number; width: number; height: number }[] };
  overflowing: boolean;
  onHeight: (height: number) => void;
  contentContainerStyle: ScrollViewProps["contentContainerStyle"];
  children: React.ReactNode;
};

/** Default consumers retain their existing fixed header/body/operations contract. */
export function LandingCardContents(props: LandingCardProps) {
  if (props.adaptiveBody) return <AdaptiveLandingCardContents {...props} />;
  const { overflowing, onHeight, contentContainerStyle, children } = props;
  const renderBody = () => {
    if (overflowing || props.staticBody) return <View testID="landing-card-body" style={contentContainerStyle} onLayout={(e) => onHeight(e.nativeEvent.layout.height)}>{children}</View>;
    return <ScrollView testID="landing-card-body"
        style={{ flexGrow: 0, flexShrink: 1, minHeight: 0, overflow: "hidden" }} contentContainerStyle={contentContainerStyle}
        bounces={false} alwaysBounceVertical={false} overScrollMode="never"
        directionalLockEnabled showsVerticalScrollIndicator={false}
        onContentSizeChange={(_width, height) => onHeight(height)}>{children}</ScrollView>;
  };
  return renderFixedCard(props, renderBody());
}

/** Uses actual native measurements, never a fixed number of text lines or guessed footer height. */
export function landingAdaptiveCardSizing({ availableHeight, headerHeight, footerHeight, headerGap, footerGap, frameVerticalInset, contentHeight,
  width = 0, headerObstacles = [] }: {
  availableHeight: number; headerHeight: number; footerHeight: number; headerGap: number;
  footerGap: number; frameVerticalInset: number; contentHeight: number; width?: number;
  headerObstacles?: readonly { x: number; y: number; width: number; height: number }[];
}) {
  const chromeHeight = headerHeight + footerHeight + headerGap + footerGap + frameVerticalInset;
  // The frame spans the full width. Only its indicator may share the upper side-control lane.
  const obstacles = headerObstacles.filter(rect => rect.x < width && rect.x + rect.width > 0 && rect.y + rect.height > 0);
  const frameTopLimit = Math.max(headerHeight + headerGap, ...obstacles.map(rect => rect.y + rect.height + 4));
  const bodyMaxHeight = Math.max(0, availableHeight - footerHeight - footerGap - frameVerticalInset - frameTopLimit);
  const scroll = contentHeight > bodyMaxHeight;
  const panelTop = availableHeight - chromeHeight - Math.min(contentHeight, bodyMaxHeight);
  const indicatorBottom = panelTop + headerHeight;
  let headerLeftInset = 0, headerRightInset = 0;
  for (const rect of obstacles) {
    if (rect.y >= indicatorBottom || rect.y + rect.height <= panelTop) continue;
    if (rect.x + rect.width / 2 < width / 2) headerLeftInset = Math.max(headerLeftInset, rect.x + rect.width + 8);
    else headerRightInset = Math.max(headerRightInset, width - rect.x + 8);
  }
  return { chromeHeight, bodyMaxHeight, naturalHeight: chromeHeight + contentHeight, scroll,
    headerLeftInset, headerRightInset };
}

function AdaptiveLandingCardContents(props: LandingCardProps) {
  const { header, footer, headerGap = 0, footerGap = 0, adaptiveBody, contentContainerStyle, children, onHeight } = props;
  const hasHeader = header != null && header !== false;
  const hasFooter = footer != null && footer !== false;
  const [headerHeight, setHeaderHeight] = React.useState<number | null>(hasHeader ? null : 0);
  const [footerHeight, setFooterHeight] = React.useState<number | null>(hasFooter ? null : 0);
  const [contentHeight, setContentHeight] = React.useState<number | null>(null);
  const sizing = landingAdaptiveCardSizing({ ...adaptiveBody!,
    headerHeight: headerHeight ?? 0, footerHeight: footerHeight ?? 0,
    headerGap: hasHeader ? headerGap : 0, footerGap: hasFooter ? footerGap : 0,
    contentHeight: contentHeight ?? 0 });
  const measured = headerHeight !== null && footerHeight !== null && contentHeight !== null;
  const scroll = !props.staticBody && measured && sizing.scroll;
  // This View is always intrinsic, including when it is inside the exceptional scroller.
  // Measuring a constrained viewport instead would hide the true height of wrapped text.
  const content = <View testID={scroll ? "landing-card-natural-content" : "landing-card-body"}
    style={[contentContainerStyle, { flexShrink: 0 }]}
    onLayout={(e) => {
      const height = e.nativeEvent.layout.height;
      setContentHeight(previous => previous === height ? previous : height);
      onHeight(height);
    }}>{children}</View>;
  const body = scroll ? <ScrollView testID="landing-card-body"
    style={{ flexGrow: 0, flexShrink: 0, maxHeight: sizing.bodyMaxHeight }}
    bounces={false} alwaysBounceVertical={false} overScrollMode="never"
    directionalLockEnabled showsVerticalScrollIndicator={false}>{content}</ScrollView> : content;
  return renderFixedCard(props, body, setHeaderHeight, setFooterHeight,
    { paddingLeft: sizing.headerLeftInset, paddingRight: sizing.headerRightInset });
}

function renderFixedCard({ header, headerGap = 0, footer, footerGap = 0, bodyFrame, adaptiveBody }: LandingCardProps,
  body: React.ReactNode, onHeaderHeight?: (height: number) => void, onFooterHeight?: (height: number) => void,
  headerInsets?: { paddingLeft: number; paddingRight: number }) {
  const hasHeader = header != null && header !== false;
  const hasFooter = footer != null && footer !== false;
  const framedBody = bodyFrame ? bodyFrame(body) : body;
  if (!hasHeader && !hasFooter) return framedBody;
  return <View testID="landing-card-fixed-frame" pointerEvents="box-none" style={{ flexShrink: adaptiveBody ? 0 : 1, minHeight: 0 }}>
    {hasHeader && <View testID="landing-card-header" style={{ flexShrink: 0, marginBottom: headerGap, ...headerInsets }}
      {...(onHeaderHeight ? { onLayout: (e: import("react-native").LayoutChangeEvent) => onHeaderHeight(e.nativeEvent.layout.height) } : {})}>{header}</View>}
    {framedBody}
    {hasFooter && <View testID="landing-card-operations" pointerEvents="box-none" style={{ flexShrink: 0, marginTop: footerGap }}
      {...(onFooterHeight ? { onLayout: (e: import("react-native").LayoutChangeEvent) => onFooterHeight(e.nativeEvent.layout.height) } : {})}>{footer}</View>}
  </View>;
}
