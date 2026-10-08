import React from "react";
import {
  BookingAssistantScreen,
  type BookingAssistantProps,
} from "./booking-assistant/BookingAssistantScreen";
import { GOChatLegacyScreen } from "./GOChatLegacyScreen";

// Preserve the previous assistant for future reactivation; V1 exposes reservations and existing personal actions.
export const GO_BOOKING_ASSISTANT_V1 = true;
export function GOChatScreen(props: BookingAssistantProps) {
  return GO_BOOKING_ASSISTANT_V1 ? (
    <BookingAssistantScreen {...props} />
  ) : (
    <GOChatLegacyScreen {...props} />
  );
}
