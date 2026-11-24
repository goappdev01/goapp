import React from "react";
import Svg, { Circle, Path } from "react-native-svg";

/** Landing-only outline; the Note cart keeps its own artwork. */
export function LandingShoppingCart({ size }: { size: number }) {
  return <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
    <Path d="M7 13h8l7 32h32" fill="none" stroke="#FFFFFF" strokeWidth="4"
      strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M18 20h39l-5 18H22" fill="none" stroke="#FFFFFF" strokeWidth="3.5"
      strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M27 26v7m10-7v7m10-7v7" fill="none" stroke="#FFFFFF"
      strokeWidth="2.4" strokeLinecap="round" />
    <Circle cx="28" cy="52" r="3.8" fill="none" stroke="#FFFFFF" strokeWidth="3" />
    <Circle cx="49" cy="52" r="3.8" fill="none" stroke="#FFFFFF" strokeWidth="3" />
  </Svg>;
}
