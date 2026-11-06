import {createContext} from "react";
/** Existing GO handedness, without another setting or storage key. */
export const GoNavigationHand=createContext<"left"|"right">("right");
