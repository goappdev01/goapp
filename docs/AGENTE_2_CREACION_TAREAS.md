# Agente 2 — creación conversacional de tareas

Base: `5b199e4`, rama `codex/agent-2-ia-reservas-v1`.

## Alcance

Crear tareas internas (`TAREA_INTERNA`) y actividades (`GO_INTERNO`) desde el texto o la transcripción de voz del asistente existente. Se reutilizan `GoEntry`, `go_log_v1`, `updatePersonalGoLog` y la cola compartida con Landing. No se modifica Landing ni se añade otro calendario o almacenamiento.

El extractor local reconoce fechas relativas, días de la semana y horas numéricas o dictadas. Las tareas pueden quedar sin fecha y sin hora. Las actividades de calendario requieren fecha. Se pregunta solo por el título o la fecha necesaria que falte, o por un valor solicitado que resulte inválido. Las horas sin período, como «las diez», muestran el título, tipo, día y alternativas antes de guardar; se pueden aclarar por voz, texto o selección. Los plazos imprecisos se conservan como detalle y requieren confirmación.

El bloqueo de envío y confirmación evita pulsaciones simultáneas. Dentro de la transacción compartida se reutiliza una tarea idéntica creada por el asistente en los últimos cinco minutos, incluso al reabrir la pantalla. No se deduplican ni sobrescriben tareas manuales. Un fallo de persistencia conserva el borrador y no anuncia éxito.

Las reservas siguen utilizando su flujo existente. Los borradores de consulta, edición, eliminación, notas y listas se conservan sin habilitar esas operaciones. La interpretación remota opcional sigue siendo del servidor; si no está disponible se utiliza el extractor local. No se ha desplegado el borrador pendiente del endpoint `/plan`.

## Validación local

- `node --test --test-concurrency=1 tests/task-creation.test.mjs tests/go-log-sync.test.mjs tests/booking-assistant.test.mjs`: 39 pruebas correctas (14 de creación, 13 de sincronización y 12 de reservas/voz).
- `pnpm.cmd --filter @workspace/go-app-mobile typecheck`: correcto.
- Pruebas con el adaptador, la cola y el filtro de día reales; almacenamiento y permisos/transcripción simulados. Incluyen los tres ejemplos solicitados, guardado sin hora, fechas relativas, proyección en calendario, reapertura, duplicados, errores de almacenamiento y rechazo de operaciones fuera del alcance.

Queda pendiente la validación en dispositivo con micrófono real y la interpretación remota contra servicios configurados. No hay dependencia externa que impida la creación local soportada. La consulta, edición, eliminación, notas y listas pertenecen a pasos posteriores.