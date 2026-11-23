import React from "react";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/** Small, self-contained GO Compras artwork. No store branding or Note-cart asset. */
export function LandingShoppingCart({ size }: { size: number }) {
  return <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
    <Defs>
      <LinearGradient id="cartBody" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#62D7EE" />
        <Stop offset="0.48" stopColor="#168DCB" />
        <Stop offset="1" stopColor="#104F9A" />
      </LinearGradient>
      <LinearGradient id="cartMetal" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#FFFFFF" />
        <Stop offset="1" stopColor="#9AC6D7" />
      </LinearGradient>
    </Defs>
    <Ellipse cx="35" cy="55" rx="24" ry="4" fill="#042B4B" opacity={0.35} />
    <Path d="M23 23c-1-5 2-9 7-10 5-1 8 3 9 7" fill="#38C783" stroke="#12875D" strokeWidth="1.5" />
    <Path d="M30 13c-1-5 1-7 3-8" fill="none" stroke="#158B5B" strokeWidth="2" strokeLinecap="round" />
    <Path d="M33 19l1-11 12 1-1 12z" fill="#FFD45C" stroke="#D68D29" strokeWidth="1.4" />
    <Path d="M36 11l8 .6" stroke="#FFF4BF" strokeWidth="1.4" opacity={0.85} />
    <Circle cx="48" cy="19" r="7" fill="#F45459" stroke="#BB2F42" strokeWidth="1.5" />
    <Path d="M48 12c1-3 3-4 5-4" stroke="#278F58" strokeWidth="2" fill="none" strokeLinecap="round" />
    <Path d="M16 20h42l-6 25H23z" fill="url(#cartBody)" stroke="#0C477B" strokeWidth="2" strokeLinejoin="round" />
    <Path d="M17 21h40" stroke="#E3FAFF" strokeWidth="3" strokeLinecap="round" opacity={0.9} />
    <Path d="M25 26l2 15M35 26v17M46 26l-2 15" stroke="#D4F6FF" strokeWidth="2.2" strokeLinecap="round" opacity={0.85} />
    <Path d="M8 15h6l8 33h31" fill="none" stroke="#153B61" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M8 14h6l8 32h31" fill="none" stroke="url(#cartMetal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <Rect x="5" y="11" width="7" height="5" rx="2.5" fill="#4DD1C1" stroke="#197C84" strokeWidth="1" />
    <Circle cx="27" cy="52" r="5.5" fill="#172C54" stroke="#83B4D3" strokeWidth="1.5" />
    <Circle cx="49" cy="52" r="5.5" fill="#172C54" stroke="#83B4D3" strokeWidth="1.5" />
    <Circle cx="27" cy="52" r="1.8" fill="#DDF5FF" />
    <Circle cx="49" cy="52" r="1.8" fill="#DDF5FF" />
  </Svg>;
}
