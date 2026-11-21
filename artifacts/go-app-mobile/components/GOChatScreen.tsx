import React from "react";
import {
  BookingAssistantScreen,
  type BookingAssistantProps,
} from "./booking-assistant/BookingAssistantScreen";
import { GOChatLegacyScreen } from "./GOChatLegacyScreen";
import {useAdminAccess} from "@/contexts/GoAdminAccessContext";
import {CentralAssistant} from "./booking-assistant/CentralAssistant";

// Preserve the previous assistant for future reactivation; V1 exposes reservations and existing personal actions.
export const GO_BOOKING_ASSISTANT_V1 = true;
export function GOChatScreen(props: BookingAssistantProps) {
  const admin=useAdminAccess();
  if(admin.allowed&&!!admin.userId&&!admin.checking&&!admin.unavailable&&!props.consultation)
    return <CentralAssistant key={admin.userId} {...props} userId={admin.userId}/>;
  return GO_BOOKING_ASSISTANT_V1 ? (
    <BookingAssistantScreen {...props} />
  ) : (
    <GOChatLegacyScreen {...props} />
  );
}
