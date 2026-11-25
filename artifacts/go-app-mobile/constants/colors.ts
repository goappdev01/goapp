export const GO_PENDING_ACTION_YELLOW = "#E8BB2E";
export const GO_DONE_ACTION_GREEN = "#008754";
export const GO_PENDING_YELLOW = GO_PENDING_ACTION_YELLOW;
// A translucent top highlight and bottom inset edge distinguish an unselected
// follow-up button without changing its corporate fill or touch geometry.
export const GO_FOLLOW_UP_UNSELECTED_FINISH = {
  position: "absolute",
  top: 1, right: 1, bottom: 1, left: 1,
  borderRadius: 7,
  borderTopWidth: 1,
  borderTopColor: "rgba(255,255,255,0.20)",
  borderBottomWidth: 1,
  borderBottomColor: "rgba(0,0,0,0.13)",
} as const;
// White lettering sits directly on yellow, without an inset label.
export const GO_PENDING_ACTION_TEXT_SHADOW = {
  textShadowColor: "#282828",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 2,
} as const;

const colors = {
  light: {
    text: "#0a0a0a",
    tint: "#00ff88",
    background: "#ffffff",
    foreground: "#0a0a0a",
    card: "#f9f9f9",
    cardForeground: "#0a0a0a",
    primary: "#00ff88",
    primaryForeground: "#0a0a0a",
    secondary: "#f0f0f0",
    secondaryForeground: "#1a1a1a",
    muted: "#f0f0f0",
    mutedForeground: "#737373",
    accent: "#f0f0f0",
    accentForeground: "#1a1a1a",
    destructive: "#ef4444",
    destructiveForeground: "#ffffff",
    border: "#e5e5e5",
    input: "#e5e5e5",
  },
  dark: {
    text: "#f0f0f0",
    tint: "#00ff88",
    background: "#0d0d0d",
    foreground: "#f0f0f0",
    card: "#1a1a1a",
    cardForeground: "#f0f0f0",
    primary: "#00ff88",
    primaryForeground: "#0d0d0d",
    secondary: "#1f1f1f",
    secondaryForeground: "#e0e0e0",
    muted: "#1f1f1f",
    mutedForeground: "#888888",
    accent: "#1f1f1f",
    accentForeground: "#e0e0e0",
    destructive: "#ef4444",
    destructiveForeground: "#ffffff",
    border: "#2a2a2a",
    input: "#2a2a2a",
  },
  radius: 12,
};

export default colors;
