# GO IA — Avisos asociados a tareas (Agente 2)

Trabajo preparado sin commit en `codex/agent-2-zona-habitual-v1`, sobre `c2d0299`.
Los borradores previos de zona habitual y voz se conservan.

## Vinculación y persistencia

La petición de aviso se intercepta antes del planificador de creación. Texto y voz
utilizan el mismo `go.dispatch`. No se llama a OpenAI para gestionar estos avisos.
Se modifica exclusivamente la tarea seleccionada por su `id`, dentro de
`go_log_v1` y mediante la cola compartida con Landing; no se crea otra tarea,
calendario, tabla o clave de preferencias.

Los campos existentes `reminders` (minutos de anticipación),
`firedReminderMins`, `notificationsEnabled` y `snoozeUntil` se reutilizan.
Se mantiene el límite de tres avisos por tarea. Anticipaciones válidas: enteros
positivos de hasta 525600 minutos; incluye los intervalos solicitados, 75 minutos
y una hora y media. Repetir una orden no añade otra tarea ni otro offset.

El contexto de la última tarea creada/consultada como aviso guarda su identificador,
no una copia del título. Si falta contexto después de reiniciar, se solicita la
tarea. Si hay varias coincidencias, se presentan título, fecha y hora y se pide
selección. Eliminar un aviso exige confirmación explícita y conserva la tarea.
No se afirma que se ha eliminado un aviso inexistente.

El dato adicional `taskContext` usa el contexto actual de usuario/empresa/DEMO.
La selección exige el propietario de sesión y ese contexto. No se adoptan tareas
sin propietario. Los registros anteriores sin `taskContext` mantienen la
compatibilidad de usuario personal (`live:USER`), pero no se atribuyen a DEMO o
empresa. Una tarea antigua de DEMO sin contexto verificado requerirá una
recuperación coordinada de su procedencia; esta implementación no migra ni
reasigna datos. La gestión se bloquea si la identidad/contexto no está listo.

## Horarios

Los avisos son relativos a `dateISO + time`, en la zona local del teléfono, igual
que el calendario actual. No se guardan UTC ficticios ni fechas artificiales.
Cambiar fecha/hora mediante IA o persistencia manual conserva los offsets y
reinicia el historial de disparos y el snooze antiguo. El instante se recalcula.
Un día significa 1440 minutos transcurridos, siguiendo el motor existente;
cerca de un cambio horario puede no equivaler a la misma hora civil del día previo.

Se comprueban fechas/horas válidas, anticipaciones futuras, cruce de medianoche
y cambios de horario. Una hora inexistente o repetida requiere corregir/precisar
la tarea antes de asociar el aviso: no se elige una ocurrencia silenciosamente.
Las tareas sin fecha/hora se conservan intactas y se pide completarlas mediante
su gestor existente.

## Estado real de notificaciones

La integración nativa posterior ya está implementada en este mismo borrador.
Los avisos se programan con fecha e identificador estable en la cola del sistema
operativo y se cancelan/reprograman según la tarea, sus preferencias y el ámbito.
La conversación confirma programación solo después de comprobar la cola nativa.

Se reutilizan expo-notifications y el handler común; no existe otro calendario
ni un temporizador como sustituto de la entrega con GO cerrado. Las pruebas
locales no demuestran entrega física en el iPhone. Véase el circuito, los archivos,
las limitaciones y la prueba exacta pendiente en
[GO_IA_NOTIFICACIONES_LOCALES.md](GO_IA_NOTIFICACIONES_LOCALES.md).

## Validación local

`node --test --test-reporter=dot tests/task-reminders.test.mjs tests/go-log-sync.test.mjs`
(importa además las regresiones existentes de creación/gestión de tareas).

Incluye creación y aviso posterior contextual, consulta, edición, eliminación,
confirmación/cancelación, ambigüedad, reapertura del registro y pantalla,
repeticiones, concurrencia, errores de escritura, identidad estable tras cambiar
el título, cambio manual/IA de hora, aislamiento y protección de contexto.

Caso obligatorio: `Hacer la compra`, `13/10/2026`, `17:00` +
`Pon un recordatorio una hora antes` => mismo `id`, misma fecha/hora,
`reminders: [60]`, aviso calculado `13/10/2026 16:00`, una sola ficha.

El montaje de voz no se altera. Las pruebas no graban audio ni llaman a servicios
externos. La recarga/reinicio se modela leyendo de nuevo el almacenamiento y
montando una conversación nueva; queda pendiente repetirlo físicamente en Expo Go.

## Resultado y archivos de este bloque

El bloque anterior aprobó 69 pruebas locales (21 de avisos, 35 de creación/gestión y 13 de
sincronización). Typecheck móvil correcto y `git diff --check` correcto usando
la configuración normal de Git para finales de línea de Windows.

Archivos nuevos: `hooks/useTaskReminders.ts`, `lib/goTaskReminders.ts`,
`tests/task-reminders.test.mjs` (dentro de `artifacts/go-app-mobile`) y este documento.

Archivos existentes modificados en este bloque, bajo `artifacts/go-app-mobile`:

- `hooks/useGoActions.ts`: enrutamiento y referencia de la tarea creada.
- `lib/goPersonalActions.ts`: contexto y deduplicación por usuario/contexto.
- `lib/goLogStore.ts`: contexto inmutable y reinicio de disparos al cambiar horarios.
- `components/booking-assistant/BookingAssistantScreen.tsx`: pasar el contexto listo a las acciones; una línea, conservando el borrador previo de zona.
- `tests/task-creation.test.mjs`: fixture compartida para probar el circuito completo.

Los otros quince archivos pendientes previos conservan sus hashes originales.
La pantalla del asistente conserva todo su contenido previo salvo esa conexión
del contexto (comprobado revirtiendo la sustitución únicamente en memoria).
`app/index.tsx`, las pantallas de Calendario y los servicios de notificaciones
no se han modificado. No hay archivos staged ni commits nuevos.
