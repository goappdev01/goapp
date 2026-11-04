import React from "react";
import { TextInput, type TextInputProps } from "react-native";

export function GoMinuteInput(props: TextInputProps) {
  return <TextInput accessibilityLabel="Minutos (00–59)" {...props}
    keyboardType="number-pad" inputMode="numeric" maxLength={2} selectTextOnFocus />;
}
