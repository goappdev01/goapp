const INTENCION_LABEL_EN: Record<string, string> = {
  planificar_visita:        "Plan visit",
  solicitar_disponibilidad: "Request availability",
  confirmar_revision:       "Confirm review",
  seguimiento_comercial:    "Sales follow-up",
  solicitar_documentacion:  "Request documents",
  organizar_mantenimiento:  "Organise maintenance",
  entrega_recogida:         "Delivery / pick-up",
  renovacion:               "Renewal",
  revision_prl:             "PRL review",
  inspeccion:               "Inspection",
  reunion:                  "Meeting",
  otro:                     "Other",
};

const INTENCION_DESC_EN: Record<string, string> = {
  planificar_visita:        "Schedule an in-person client visit",
  solicitar_disponibilidad: "Ask when contacts are available",
  confirmar_revision:       "Validate that a review was completed",
  seguimiento_comercial:    "Reconnect or follow up on a commercial proposal",
  solicitar_documentacion:  "Ask for documents, contracts or files",
  organizar_mantenimiento:  "Coordinate technical maintenance",
  entrega_recogida:         "Manage delivery or collection of materials",
  renovacion:               "Renew a contract, service or subscription",
  revision_prl:             "Risk prevention inspection",
  inspeccion:               "Technical or quality check",
  reunion:                  "General meeting with the contact",
  otro:                     "Custom intention",
};

export function intencionLabel(tipo: string, lang: string): string {
  return lang === "en" ? (INTENCION_LABEL_EN[tipo] ?? tipo) : tipo;
}

export function intencionDesc(tipo: string, lang: string): string {
  return lang === "en" ? (INTENCION_DESC_EN[tipo] ?? tipo) : tipo;
}
