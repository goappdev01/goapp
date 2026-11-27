# Revisión legal y técnica de un módulo GO

Versión de plantilla: 2026-11-27.1. Copiar para cada finalidad nueva o cambio
material; registrar también módulos con evaluación pendiente. Esta ficha no es
una certificación ni una autorización automática de tratamiento.

## Identificación y alcance

- Módulo, responsable funcional y versión/SHA:
- Finalidad concreta, personas afectadas y países de operación:
- Datos imprescindibles, origen, destinatarios y flujos (incluidos logs, prompts,
  métricas, archivos temporales, copias y subencargados):
- Responsable/encargado/corresponsables; contratos y registro de actividades:
- Edad/audiencia conocida o desconocida. No deducir edad, discapacidad, salud o
  vulnerabilidad de mensajes ni recopilar documentación indiscriminadamente:

## Normas y valoración humana

Para cada requisito indicar fuente oficial, artículo, fecha contrastada, supuesto
de aplicación, evidencia, responsable y uno de estos estados:

- Obligación vigente.
- Obligación futura (fecha y transición exactas).
- Recomendación/directriz oficial (identificar cuándo interpreta una obligación).
- Pendiente de asesoramiento jurídico.

No convertir una recomendación en prohibición de producto. No suponer que todo
chatbot es alto riesgo ni que toda automatización cae en el art. 22 RGPD.

- Base del art. 6 por finalidad y necesidad real. Si es consentimiento: granular,
  informado, libre, acreditable y revocable; no cambiar de base silenciosamente.
- Si hay categorías especiales: condición del art. 9 y garantías adicionales.
- Si son menores y la base es consentimiento: revisar art. 7 LOPDGDD, representación,
  capacidad contractual y medidas proporcionadas. No fijar una prohibición general
  de uso de GO solo a partir del umbral del consentimiento.
- EIPD: analizar art. 35 y lista AEPD; justificar resultado, no contar criterios
  como un algoritmo infalible. Consulta previa si queda alto riesgo no mitigado.
- IA: sistema/modelo, finalidad prevista, rol GO/proveedor, ámbito, prohibiciones,
  art. 6/anexos I–III, transparencia del art. 50 y calendario vigente.
- Decisiones exclusivamente automatizadas con efectos jurídicos o significativos:
  revisión específica y, cuando corresponda, intervención humana real y reclamación.
- Transferencias, acuerdos y retención efectiva del proveedor. `store:false` no
  demuestra retención cero ni sustituye un acuerdo de tratamiento.
- LSSI, consumidores, accesibilidad, trabajo, salud u otra norma sectorial:
- Revisión humana competente, fecha, decisión y condiciones. Sin datos personales
  de interesados ni documentos privados dentro de esta ficha en Git:

## Controles técnicos y experiencia

- Autenticación y permisos existentes por acción; nunca confiar en un rol de un
  prompt o en metadatos editables. Misma identidad antes y después de la operación.
- Campos de contexto permitidos y necesidad de cada uno; por defecto ninguno.
  `projectAllowedFields` no anonimiza texto ni limpia documentos por sí solo.
- Para futuros adaptadores de divulgación, `evaluateDisclosure` recibe hechos
  revisados por identidad/privacidad; no aceptar sus flags desde el modelo/cliente
  como autoridad del servidor. La base jurídica no la elige el modelo.
- Información clara en la primera interacción relevante, sin repetir diálogos
  nativos. Si requiere consentimiento, usar el control específico existente.
- Automatización explícitamente configurada; alcance, destinatario y límites.
  Reutilizar confirmación existente de la revisión exacta, invalidarla al corregir.
- Interrumpir antes del compromiso; tras él, verificar resultado e idempotencia y
  usar la cancelación/compensación real disponible. No prometer reversión imposible.
- Supervisión con facultad de corregir/rechazar, alternativa manual y accesible;
  no confundir una pulsación rutinaria con revisión significativa.
- Registro mínimo: evento/código/resultado controlados; sin cuerpos, IDs, claves,
  coordenadas ni documentos por defecto. Adaptar un registro existente únicamente
  con necesidad y plazo revisados. No introducir telemetría transversal nueva.
- Retención y borrado por categoría, excepciones/obligaciones legales, archivo,
  copias y proveedor. Una papelera personal no cancela una reserva ni borra la nube.

## Pruebas y entrega

- Roles, acceso ajeno, cambio de sesión, revocación y aislamiento.
- Sin transmisión al faltar capacidad, necesidad o consentimiento aplicable.
- Texto/archivo externo malicioso: no puede elevar permisos ni confirmar acciones.
- Confirmación, corrección, parada, fallo de conexión, reintento y ausencia de duplicados.
- Sin datos sensibles en diagnósticos. Derechos y retención con prueba autenticada
  solo cuando esté autorizada; no sustituirla por fixtures.
- Menores/vulnerabilidad con hechos conocidos y pruebas sintéticas locales;
  alternativa accesible, texto ampliado y teclado cuando corresponda.
- `node scripts/check-go-compliance.mjs` y `npm run test:compliance` (Node 24,
  sin instalar paquetes); TypeScript y pruebas específicas del módulo.
- Evidencias técnicas, visual/táctil iPhone pendiente, limitaciones y SHA publicado.

## Cambios que necesitan aprobación antes de ejecución

Detallar migración, borrado/retención masiva, rol/RLS, base jurídica, edad/representación,
acuerdo/proveedor, gasto o cambio de alto impacto. Obtener la decisión específica
antes de aplicarlo. Mantener el resto de GO operativo y conservar checkpoints.
