/**
 * goHaptics — Sistema háptico TESO
 * ─────────────────────────────────
 * Funciones semánticas para feedback táctil.
 * Inspiración: iPhone · Apple Wallet · Face ID · toggles nativos iOS.
 *
 * REGLA TESO: menos es más.
 * Solo en acciones significativas. Nunca en navegación ni taps simples.
 */
import * as Haptics from "expo-haptics";

const noop = () => {};

/** Guardar correctamente — confirmación limpia */
export async function hapticSave(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
}

/** Reserva completada — positivo, ligeramente más presente */
export async function hapticBookingDone(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
}

/** Siguiente paso en configuración guiada — confirmación suave */
export async function hapticNextStep(): Promise<void> {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(noop);
}

/**
 * Error importante — doble vibración corta.
 * notificationAsync(Error) ya produce el patrón correcto en iOS.
 */
export async function hapticError(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(noop);
}

/** Activar / desactivar switch — toggle táctil tipo iPhone */
export function hapticToggle(): void {
  Haptics.selectionAsync().catch(noop);
}

/** Soltar elemento del plano — pequeño "click" táctil al soltar */
export function hapticDrop(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(noop);
}

/** Verificación completada — confirmación premium */
export async function hapticVerification(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
}
