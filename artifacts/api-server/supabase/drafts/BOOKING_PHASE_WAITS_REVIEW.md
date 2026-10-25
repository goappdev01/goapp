# Tiempos por fases y esperas autorizadas — revisión de backend

Estado: código preparado y probado en PostgreSQL aislado. **No aplicado en Supabase/Railway ni en bases de producción.** Esta entrega no autoriza una migración remota.

## Configuración y datos existentes

Se reutilizan `services.ui_metadata.timing`, los profesionales, horarios, recursos y reservas del motor actual. No se crean calendarios ni reservas para representar fases. El editor sigue dentro de «Qué ofreces»; el proceso empresarial conserva ocho pasos.

`mode: "simple"` conserva un trabajo continuo de duración exacta. `mode: "phases"` permite nombres opcionales, orden y minutos enteros positivos. La suma debe coincidir con `duration_minutes`; no se corrige silenciosamente. Los requisitos explícitos de profesional y recursos de un servicio continuo se conservan al editarlo.

```json
{"version":1,"mode":"phases","resourcesConfigured":true,"phases":[
 {"id":"apply","name":"Aplicar tinte","kind":"work","durationMinutes":15,"resources":[]},
 {"id":"wait","name":"Actuación","kind":"wait","durationMinutes":30,"releaseProfessional":true,"resources":[]},
 {"id":"finish","name":"Finalizar","kind":"work","durationMinutes":15,"resources":[]}
]}
```

Una espera nueva solo libera al profesional con `releaseProfessional: true`. Omitirlo equivale a NO. Una espera no autorizada forma parte de los intervalos ocupados, aunque se mantenga identificada como espera. Debe existir al menos una fase que ocupe al profesional.

`professionalTimings[staffUUID]` permite otra duración y secuencia para ese profesional. Tiene su propia suma exacta. No le asigna servicios ni permisos: el motor sigue comprobando la asignación real. El mínimo por profesional utiliza la duración efectiva de sus servicios activos y reservables. La selección automática valida el plan completo de un profesional concreto.

## Una sola autoridad

`go_booking_timeline_private.plan` sigue gobernando búsqueda, días/horas, creación, aceptación y cambios horarios. Los mismos intervalos congelados se proyectan en los calendarios. Los instantes se calculan a partir del comienzo real, conservando zona horaria, horarios, bloqueos y límites físicos.

La reserva cliente conserva todo su intervalo. `workIntervals` contiene trabajo y esperas ocupadas; `releasedWaitIntervals` identifica solo la capacidad autorizada. `workMinutes`, `waitMinutes`, `releasedWaitMinutes` y `occupiedMinutes` describen dimensiones diferentes.

El predicado `valid_gap` permanece intacto: los huecos ordinarios cumplen cero o múltiplo exacto de M. `valid_ordinary_remainders` resta únicamente intervalos con origen demostrable en una espera autorizada de una reserva. Un corte de 20 minutos cabe en la espera de 30 del tinte; el resto de 10 no flexibiliza ningún hueco ordinario. Las excepciones por proximidad siguen siendo independientes.

Los recursos se validan por intervalos y capacidades reales. `occupancy: "booking"` mantiene una silla/sala durante toda la visita, incluida la espera. `resourcesConfigured: true` es la declaración explícita de que se han indicado todos los recursos o que no se necesita ninguno. No significa recursos ilimitados. Con configuración desconocida se mantienen las comprobaciones conservadoras del motor anterior.

La función profesional de lectura `go_booking_professional_capacity` devuelve el resto de las esperas después de restar reservas, descansos y bloqueos. Es una proyección autorizada del mismo motor, no un segundo calculador en móvil. Solo el propietario ya autorizado puede consultarla; no se amplían roles o permisos empresariales globales. Una espera libre de profesional no promete disponibilidad de instalaciones para cualquier servicio.

La creación y la negociación conservan el bloqueo transaccional por empresa y cliente y las verificaciones de recursos. Las consultas del Calendario se coordinan con el mismo bloqueo. No se modifica autenticación, pagos ni aceptación de participantes. La API existente de negociación permite fecha/hora; esta entrega no inventa una reasignación unilateral de profesional para reservas aceptadas. La elección de otro profesional para nuevas reservas utiliza su distribución independiente.

## Historia y persistencia

Las reservas aceptadas guardan su secuencia y requisitos. Cambiar el catálogo no las reescribe. Al negociar otra hora, se desplaza la secuencia congelada completa, incluidas las esperas, y se revalidan los conflictos. Las otras reservas conservan sus derechos cuando se modifica o cancela la reserva que originó una espera.

Los snapshots anteriores no se migran. Antes de existir el consentimiento explícito, el motor liberaba las fases `wait`; esa semántica comprometida se conserva leyendo exclusivamente el recibo persistido del servidor. La configuración nueva sin indicador se interpreta conservadoramente como ocupada. No se infiere una espera a partir del nombre ni de restar totales.

La DEMO local anterior mantiene su adaptador continuo y AsyncStorage. Puede guardar la configuración nueva, pero rechaza nuevas reservas/reprogramaciones por fases o tiempos individuales que no puede validar. No simula que dispone del motor SQL ni confirma horarios falsos. Las reservas continuas y los compromisos ya guardados se conservan.

## Activación para Nelson

1. Revisar los borradores previos de negociación, recibos y timeline que ya requiere esta arquitectura. El upgrade siguiente es para una instalación existente de `booking_timeline_v1` y las políticas actuales, no una inicialización de producción.
2. Generar el upgrade completo, sin conexión a BD:

   `node scripts/render-booking-phase-upgrade.mjs <archivo-de-revision.sql>`

3. Revisar el archivo generado: una transacción que incluye los helpers de fases, `shift`, las políticas de huecos y las definiciones canónicas de `plan`, `availability` y bloqueo de configuración. No ejecutar solo el antiguo renderer de huecos ni activar partes por separado. No contiene migraciones de datos ni reescrituras de reservas.
4. Probarlo primero con copia y respaldo en un entorno expresamente autorizado. Comprobar RLS con propietario, cliente y empresa ajena, permisos de funciones, inicios de sesión y conflictos simultáneos. Solo después de su revisión se autorizaría una activación remota separada y el despliegue del API que expone las rutas nuevas.
5. Verificar `go_booking_phase_policy_version() = 1` y `go_booking_gap_policy_version() = 1`, además de búsqueda, confirmación y capacidad profesional. Si falta alguna capacidad, el móvil/API rechaza horarios nuevos en lugar de usar una lógica antigua. Cancelación y rechazo continúan disponibles con sus permisos vigentes.

No se ha reiniciado ni desplegado el backend de validación. Publicar móvil/SQL en GitHub y sincronizar Expo no activa el SQL remoto.

## Comprobaciones reproducibles

- `tests/booking-phase-waits.postgres.test.mjs`: los 20 casos obligatorios, más validación de configuración, primera fase específica por profesional, conflictos de modificación y circuito real adaptador móvil → handlers API → RPC PostgreSQL. No crea listeners y no simula el cálculo de disponibilidad.
- `tests/booking-gap-policy.postgres.test.mjs`: mínimos, múltiplos, tramos, excepciones, historial, concurrencia y análisis. Permite exclusivamente las dos bases locales de prueba identificadas y exige su marcador de aislamiento.
- Las pruebas SQL usan solo `go_booking_phase_test_20261025`, propietario de pruebas, loopback y marcador `phase-isolated`; no datos ni credenciales reales.
- Pruebas móviles: editor con sumas exactas, autorización SÍ/NO, reordenación, recursos y persistencia independiente; proyección del Calendario, refresco y respuestas tardías; búsqueda, selección y guardas de capacidades. TypeScript móvil/servidor y bundle iOS se verifican por separado.

La validación física de pantalla no se presume por estas pruebas. En iPhone hay que comprobar la edición y, tras activar el servidor autorizado, el tinte 10:00–11:00, corte 10:15–10:35, resto libre de 10 y rechazo de conflictos, recursos ocupados y esperas configuradas como NO.

## Resultado técnico de esta entrega

Validación local del 25/10/2026 sobre `df09ae6c7bed5a26399b38b1cbf932bf29d37062`: 189/189 pruebas móviles dirigidas; 72/72 de servidor y PostgreSQL aislado, incluidos los 20 casos obligatorios y seis casos adicionales de integración, configuración, profesionales y permisos concurrentes. TypeScript móvil/servidor y JavaScript iOS completo de SDK 58 correctos.

La batería ampliada detectó 19 fallos preexistentes. Se reprodujeron los mismos 19 nombres y escenarios leyendo el código base desde Git, sin restauraciones: cuatro fixtures antiguos de `customer-booking.test.mjs`, trece de `hairdresser-booking.test.mjs` que no tienen el enlace válido a puestos profesionales, y dos expectativas anteriores de disposición de `demo-booking-ui.test.mjs`. Se conservan sin debilitar sus pruebas ni modificar otras pantallas. No se declara la batería general completamente verde. La aceptación física en iPhone y la activación remota del SQL/API continúan pendientes.
