/** Visual modules plus the existing setup and bookings screens backed by the owner-local DEMO adapter.
 * Other operational modules remain closed until they have isolated data adapters. */
const BUSINESS_PREVIEW_MODULES: ReadonlySet<string> = new Set([
  "home", "plan", "orbitas", "facturacion", "consumo", "zonas",
  "sugerencias", "partners", "publicidad", "suscripcion", "empresa_config", "reservas_config",
]);

export function isBusinessPreviewModule(module: string): boolean {
  return BUSINESS_PREVIEW_MODULES.has(module);
}
