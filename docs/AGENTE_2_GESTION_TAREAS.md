# Agente 2 — gestión conversacional de tareas

Base: `983d905`. Rama: `codex/agent-2-ia-reservas-v1`.

## Funciones

- Consulta de tareas por fecha, semana actual (lunes a domingo) y estado pendiente. Conserva horas, fechas vacías y estados reales.
- Cambios de fecha y hora sobre la tarea existente; conserva su ID, contenido y campos no afectados. Admite dejar fecha u hora vacías expresamente.
- Selección cuando coinciden varias tareas, mediante opciones o número escrito/dictado.
- Revisión de cambios y resolución de horas ambiguas antes de guardar.
- Eliminación con confirmación explícita y borrado reversible (`deleted`, `estado: rechazado`), conforme al calendario existente. Una respuesta ambigua, una selección pendiente o una confirmación repetida no elimina otras tareas.
- Control de cuenta activa, colisiones de ID y cambios posteriores a la selección. Una confirmación obsoleta no sobrescribe la tarea.

Se reutilizan `GoEntry`, `go_log_v1` y la cola de persistencia compartida. La cola admite comprobaciones asíncronas para verificar de nuevo la cuenta justo al ejecutar. La consulta y las mutaciones se resuelven localmente: no se envía el inventario de tareas al modelo ni se utiliza el borrador pendiente del backend. La creación existente, el flujo de reservas y la entrada común por texto/transcripción se conservan.

## Propiedad y límites

El registro histórico del dispositivo no identifica al propietario de muchas entradas. No es seguro atribuirlas automáticamente a quien inicie sesión. La gestión de IA requiere una sesión activa y solo accede a tareas con `ownerUserId` coincidente. Las nuevas tareas personales creadas por IA o por los flujos manuales que pasan por la cola reciben ese dato de la sesión; la cola conserva el propietario de las existentes. La deduplicación también respeta la cuenta.

Las tareas anteriores a este cambio sin propietario (incluidas creaciones de `983d905`) permanecen intactas y no se muestran ni modifican desde esta gestión. Recuperarlas requiere establecer su propiedad con una fuente fiable; esa migración queda pendiente. La creación local sin sesión sigue disponible, pero sus registros sin propietario tampoco se atribuyen a una cuenta posterior.

Esta protección corresponde a las operaciones de IA. No constituye una migración del aislamiento global de las pantallas antiguas de Landing/Calendario, que no se han modificado. Notas, listas y acciones sobre reservas siguen fuera de este módulo.

La modificación conversacional implementada cubre fecha y hora. No añade edición de contenido o de asignaciones, ni envío a terceros.

## Validaciones

- `node --test --test-concurrency=1 --test-reporter=spec tests/task-creation.test.mjs tests/go-log-sync.test.mjs tests/booking-assistant.test.mjs`: 60 correctas (35 tareas, 13 sincronización, 12 reservas/voz).
- `pnpm.cmd --filter @workspace/go-app-mobile typecheck`: correcto.
- Pruebas de consulta, selección, revisión, cancelación, borrado, cambios persistentes tras reapertura, ausencia de fechas artificiales, conflictos con edición manual, errores de almacenamiento, confirmación repetida, propietario inmutable y cambio de cuenta durante la cola.
- Almacenamiento, sesión, permisos y transcripción simulados; adaptadores, cola, intérpretes y filtro de calendario reales. El micrófono real en dispositivo y los servicios remotos no se han validado.

No se han modificado Landing ni Calendario, instalado dependencias, lanzado subagentes, integrado otros borradores, realizado merge, push o despliegue.