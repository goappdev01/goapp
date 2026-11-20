import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { HumanityRect } from "./humanityPlacement";
import { landingCommandSlots, LANDING_COMMAND_ORDER } from "./landingPanels";

export type LandingPanelCommand = {
  key: "visit" | "task" | "changes" | "actions"; heading: string; title: string; color: string;
  available?: boolean; count: number; expanded: boolean; onPress: () => void; onLongPress?: () => void;
};

/** The existing minimized appearance, one independent action per command. */
export function LandingPanelCommands({ frame, commands, actionsSlot }: { frame: HumanityRect; commands: LandingPanelCommand[]; actionsSlot?: HumanityRect }) {
  const slots = landingCommandSlots(frame);
  // Native hit-testing requires the relocated button to remain inside its parent bounds.
  const container = actionsSlot ? {x:Math.min(frame.x,actionsSlot.x),y:Math.min(frame.y,actionsSlot.y),
    width:Math.max(frame.x+frame.width,actionsSlot.x+actionsSlot.width)-Math.min(frame.x,actionsSlot.x),
    height:Math.max(frame.y+frame.height,actionsSlot.y+actionsSlot.height)-Math.min(frame.y,actionsSlot.y)} : frame;
  const actions = commands.find(command => command.key === "actions" && (command.available ?? command.count > 0));
  const ordered = LANDING_COMMAND_ORDER.map(key => commands.find(command => command.key === key))
    .filter((command): command is LandingPanelCommand => !!command && command.count > 0);
  // Counts come from the existing card collections; no placeholder or loading totals.
  // Keep each approved button size and pack only the available commands.
  if (actions) ordered.push(actions);
  if (ordered.length === 0) return null;
  return <View testID="landing-panel-commands" pointerEvents="box-none"
    style={{ position: "absolute", left: container.x, top: container.y, width: container.width, height: container.height,
      zIndex: 7 }}>
    {ordered.map((command, index) => {
      const slot = command.key === "actions" ? actionsSlot ? {...actionsSlot,x:actionsSlot.x-frame.x,y:actionsSlot.y-frame.y} : {...slots[0], y:ordered.length>1?54:0} : slots[index];
      return <View key={command.key} style={{ position: "absolute",
      left: frame.x-container.x+slot.x, top: frame.y-container.y+slot.y, width: slot.width, height: slot.height }}>
      <TouchableOpacity testID={"landing-command-" + command.key} accessibilityRole="button"
        accessibilityLabel={[command.heading, command.title].filter(Boolean).join(" ")}
        accessibilityState={{ disabled: command.key !== "actions" && command.count === 0, expanded: command.expanded }}
        disabled={command.key !== "actions" && command.count === 0} activeOpacity={0.75} onPress={command.onPress}
        onLongPress={command.onLongPress} delayLongPress={500}
        style={{ height: slot.height, backgroundColor: "rgba(10,10,14,0.88)", borderWidth: 1.5,
          borderColor: command.color + "55", borderRadius: 12, alignItems: "center", justifyContent: "center",
          paddingHorizontal: 6, gap: 2, shadowColor: command.color, shadowOpacity: 0.3, shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 }, elevation: 5 }}>
        {!!command.heading && <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
          style={{ color: command.color, fontSize: 9, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 1.2 }}>{command.heading}</Text>}
        <Text numberOfLines={frame.width < 260 ? 2 : 1} adjustsFontSizeToFit minimumFontScale={0.8}
          style={{ color: "#ffffff", fontSize: command.key === "actions" && actionsSlot ? 11 : 13, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 0.3, textAlign: "center" }}>{command.title}</Text>
      </TouchableOpacity>
      {(command.count > 1 || command.key === "actions" && command.count > 0) && <View pointerEvents="none" style={{ position: "absolute", top: -7, right: -4, width: 17, height: 17,
        borderRadius: 9, backgroundColor: command.color, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(0,0,0,0.55)" }}>
        <Text style={{ color: "#000000", fontSize: 9, fontFamily: "Inter_900Black", fontWeight: "900", lineHeight: 11 }}>{command.count}</Text>
      </View>}
    </View>;})}
  </View>;
}
