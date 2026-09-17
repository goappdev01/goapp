// ══════════════════════════════════════════════════════════════════════
// ARQUITECTURA ECONÓMICA GO — TIPOS Y MODELOS CENTRALES
// Fuente única de verdad para toda la lógica económica del sistema.
// ══════════════════════════════════════════════════════════════════════

// ── 1. PLANES EMPRESA ─────────────────────────────────────────────────

export type PlanTipo = "free" | "pro" | "empresa" | "enterprise";

export interface PlanEmpresa {
  tipo: PlanTipo;
  nombre: string;
  precioMensual: number;
  moneda: string;
  goIncluidos: number;
  usuariosIncluidos: number;
  orbitasIncluidas: number;
  sugerenciasIncluidas: number;
  iaIncluida: boolean;
  soporte: "basico" | "prioritario" | "dedicado";
  descripcion: string;
}

// ── 2. ÓRBITAS ────────────────────────────────────────────────────────

export type OrbitaEstado =
  | "no_contratada"
  | "prueba"
  | "activa"
  | "pausada"
  | "vencida"
  | "cancelada"
  | "premium";

export interface OrbitaDefinicion {
  orbitId: string;
  nombre: string;
  descripcion: string;
  icono: string;
  color: string;
  precioMensualBase: number;
  iaIncluida: boolean;
  sugerenciasIncluidas: boolean;
  categoria: string;
}

export interface OrbitaContratada {
  orbitId: string;
  empresaId: string;
  nombre: string;
  descripcion: string;
  icono: string;
  color: string;
  precioMensual: number;
  estado: OrbitaEstado;
  fechaActivacion: string;
  fechaRenovacion: string;
  usuariosPermitidos: number;
  limiteUsoMensual: number;
  usoActual: number;
  iaIncluida: boolean;
  sugerenciasIncluidas: boolean;
  categoria: string;
}

// ── 3. VOLUMEN DE USO GO ───────────────────────────────────────────────

export type PlanVolumenTipo = "incluido" | "exceso" | "bloque" | "por_usuario" | "empresa";

export interface MetricasVolumen {
  empresaId: string;
  mes: string;
  goCreados: number;
  goEnviados: number;
  goCompletados: number;
  tareasCreadas: number;
  mensajesEnviados: number;
  usuariosActivos: number;
  usoTotal: number;
  limiteIncluido: number;
  exceso: number;
  costeExceso: number;
}

export interface BloqueVolumen {
  bloqueId: string;
  descripcion: string;
  cantidadGO: number;
  precio: number;
  moneda: string;
}

// ── 4. SUGERENCIAS INTELIGENTES ────────────────────────────────────────

export type SugerenciaOrigen = "ia" | "historial" | "partner" | "sistema";
export type SugerenciaEstado = "mostrada" | "seleccionada" | "convertida" | "ignorada" | "cancelada";
export type SugerenciaCategoria =
  | "transporte"
  | "comida"
  | "viaje"
  | "operativa"
  | "partner"
  | "ia";

export interface Sugerencia {
  suggestionId: string;
  empresaId: string;
  usuarioId: string;
  categoria: SugerenciaCategoria;
  orbitId: string;
  titulo: string;
  descripcion: string;
  origen: SugerenciaOrigen;
  costeUnitario: number;
  estado: SugerenciaEstado;
  fechaCreacion: string;
  partnerId?: string;
}

// ── 5. PARTNERS Y CONVERSIONES ────────────────────────────────────────

export type PartnerCategoria =
  | "transporte"
  | "comida"
  | "viaje"
  | "marketplace"
  | "servicios";

export type EventoConversion =
  | "clic"
  | "lead"
  | "apertura"
  | "reserva_iniciada"
  | "reserva_confirmada"
  | "compra_realizada"
  | "pedido_entregado"
  | "conversion"
  | "comision";

export interface Partner {
  partnerId: string;
  nombre: string;
  categoria: PartnerCategoria;
  logo: string;
  color: string;
  activo: boolean;
  costeLead: number;
  costeConversion: number;
  porcentajeComision: number;
  descripcion: string;
}

export interface EventoPartner {
  eventoId: string;
  partnerId: string;
  empresaId: string;
  usuarioId: string;
  categoria: PartnerCategoria;
  tipoEvento: EventoConversion;
  importe: number;
  porcentaje: number;
  costeLead: number;
  costeConversion: number;
  estadoConversion: "pendiente" | "completada" | "rechazada";
  fecha: string;
}

// ── 6. ZONAS Y TARIFAS VARIABLES ──────────────────────────────────────

export type NivelComercial = "bajo" | "medio" | "alto" | "premium";

export interface PricingZone {
  zoneId: string;
  pais: string;
  ciudad: string;
  barrio: string;
  coordenadas: { lat: number; lng: number };
  radio: number;
  densidad: number;
  nivelComercial: NivelComercial;
  multiplicadorPrecio: number;
  activa: boolean;
  descripcion: string;
}

// ── 7. REGLAS DE TARIFAS ──────────────────────────────────────────────

export type TipoEventoTarifa =
  | "impresion"
  | "sugerencia"
  | "clic"
  | "lead"
  | "reserva"
  | "compra"
  | "conversion";

export interface ZonePricingRule {
  ruleId: string;
  zoneId: string;
  orbitId: string;
  categoria: string;
  tipoEvento: TipoEventoTarifa;
  precioBase: number;
  multiplicadorZona: number;
  precioFinal: number;
  moneda: string;
  activo: boolean;
}

// ── 8. PUBLICIDAD ─────────────────────────────────────────────────────

export type TipoPublicidad =
  | "banner"
  | "sugerencia_patrocinada"
  | "orbita_patrocinada"
  | "recomendacion_premium"
  | "partner_destacado"
  | "contextual"
  | "local_zona";

export interface AdCampaign {
  campaignId: string;
  partnerId: string;
  titulo: string;
  tipo: TipoPublicidad;
  presupuesto: number;
  gastado: number;
  fechaInicio: string;
  fechaFin: string;
  activa: boolean;
  zonas: string[];
  orbitas: string[];
  frecuenciaMaxima: number;
}

export interface AdSlot {
  slotId: string;
  tipo: TipoPublicidad;
  posicion: string;
  activo: boolean;
  soloUsuariosPremium: boolean;
}

export interface AdView {
  viewId: string;
  campaignId: string;
  usuarioId: string;
  empresaId: string;
  zoneId?: string;
  orbitId?: string;
  fecha: string;
  tipo: TipoPublicidad;
}

export interface AdClick {
  clickId: string;
  viewId: string;
  campaignId: string;
  usuarioId: string;
  fecha: string;
  coste: number;
}

export interface AdConversion {
  conversionId: string;
  clickId: string;
  campaignId: string;
  importe: number;
  fecha: string;
}

// ── 9. FACTURACIÓN ─────────────────────────────────────────────────────

export type EstadoFactura = "pendiente" | "pagada" | "vencida" | "cancelada";

export interface LineaFactura {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
  tipo: "plan" | "orbita" | "volumen" | "sugerencias" | "leads" | "ia";
}

export interface Factura {
  facturaId: string;
  empresaId: string;
  numero: string;
  mes: string;
  fechaEmision: string;
  fechaVencimiento: string;
  estado: EstadoFactura;
  lineas: LineaFactura[];
  subtotal: number;
  iva: number;
  total: number;
  moneda: string;
  metodoPago?: string;
}

// ── 10. EMPRESA (PERFIL COMPLETO) ─────────────────────────────────────

export interface Empresa {
  empresaId: string;
  nombre: string;
  sector: string;
  plan: PlanTipo;
  fechaRegistro: string;
  proximaRenovacion: string;
  usuariosActivos: number;
  usuariosLicencia: number;
  limiteAlerta: number;
  costeEstimadoMes: number;
}
