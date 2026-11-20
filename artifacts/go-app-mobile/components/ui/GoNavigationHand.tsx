import {createContext} from "react";
/** Existing GO handedness, without another setting or storage key. */
export const GoNavigationHand=createContext<"left"|"right">("right");

/** Existing verified identity/presentation scopes local drag preferences only. */
export const GoFloatingPreferenceScope=createContext<string|null|undefined>(undefined);
