import type { TextInputInstance } from "react-native";
import React, { forwardRef, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { Feather } from "@expo/vector-icons";

type PasswordInputProps = Omit<TextInputProps, "secureTextEntry" | "multiline"> & {
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
  capsLockLabel?: string;
};

/** Presentation only: the caller keeps ownership of the value and credential/autofill contract. */
export const PasswordInput = forwardRef<TextInputInstance, PasswordInputProps>(function PasswordInput({
  style, onFocus, onBlur, testID = "password", showPasswordLabel = "Mostrar contraseña",
  hidePasswordLabel = "Ocultar contraseña", capsLockLabel = "Bloq Mayús activado", ...props
}, ref) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const [capsLock, setCapsLock] = useState<boolean | null>(null);
  const focusRef = useRef(false);

  useEffect(() => {
    // RN's mobile key events do not expose a reliable Caps Lock state.
    if (Platform.OS !== "web" || !focused || typeof document === "undefined") return;
    const observe = (event: KeyboardEvent) => {
      if (!focusRef.current) return;
      if (event.isComposing || typeof event.getModifierState !== "function") { setCapsLock(null); return; }
      try {
        const state = event.getModifierState("CapsLock");
        setCapsLock(typeof state === "boolean" ? state : null);
      } catch { setCapsLock(null); }
    };
    const reset = () => setCapsLock(null);
    const visibility = () => { if (document.visibilityState !== "visible") reset(); };
    // Capture is necessary: react-native-web's TextInput stops keydown bubbling.
    document.addEventListener("keydown", observe, true);
    document.addEventListener("keyup", observe, true);
    document.addEventListener("visibilitychange", visibility);
    if (typeof window !== "undefined") window.addEventListener("blur", reset);
    return () => {
      document.removeEventListener("keydown", observe, true);
      document.removeEventListener("keyup", observe, true);
      document.removeEventListener("visibilitychange", visibility);
      if (typeof window !== "undefined") window.removeEventListener("blur", reset);
    };
  }, [focused]);

  return <View style={styles.container}>
    <TextInput
      {...props}
      ref={ref}
      testID={testID}
      secureTextEntry={!visible}
      multiline={false}
      style={[style, styles.input, capsLock === true && styles.withCapsLock]}
      onFocus={event => { focusRef.current = true; setFocused(true); onFocus?.(event); }}
      onBlur={event => { focusRef.current = false; setFocused(false); setCapsLock(null); onBlur?.(event); }}
    />
    {capsLock === true && <View testID={`${testID}-caps-lock`} style={styles.capsLock}
      pointerEvents="none" accessible accessibilityRole="text" accessibilityLabel={capsLockLabel}
      accessibilityLiveRegion="polite">
      <Text accessible={false} style={styles.capsLockText}>⇪</Text>
    </View>}
    <Pressable testID={`${testID}-visibility-toggle`} accessibilityRole="button"
      accessibilityLabel={visible ? hidePasswordLabel : showPasswordLabel}
      onPress={() => setVisible(current => !current)}
      onPressIn={Platform.OS === "web" ? event => event.preventDefault() : undefined}
      style={styles.toggle}>
      <Feather name={visible ? "eye-off" : "eye"} size={20} color="#475569" accessible={false} />
    </Pressable>
  </View>;
});

const styles = StyleSheet.create({
  container: { width: "100%", position: "relative" },
  input: { paddingRight: 52 },
  withCapsLock: { paddingLeft: 42 },
  toggle: { position: "absolute", right: 2, top: 0, bottom: 0, minWidth: 44, minHeight: 44,
    alignItems: "center", justifyContent: "center" },
  capsLock: { position: "absolute", left: 10, top: 0, bottom: 0, width: 24,
    alignItems: "center", justifyContent: "center" },
  capsLockText: { color: "#DC2626", fontSize: 24, fontWeight: "700" },
});
