# Agente 2: sincronización IA y agenda

Corrección sobre `codex/agent-2-ia-reservas-v1`, después de `f09f630`.

Landing mantenía un estado privado y guardaba snapshots completos. Una escritura posterior de sus temporizadores podía eliminar acciones que IA había añadido directamente a AsyncStorage.

Se conserva el modelo GoEntry y la clave existente `go_log_v1`. `goLogStore` centraliza lectura, cola de modificaciones y notificación después del guardado; `useGoLog` conecta Landing y el calendario de reservas. El puente de visitas/reservas, la cancelación de IA y la proyección de reservas del proveedor utilizan esa misma cola. Los snapshots calculados antes de un cambio se concilian por ID y campo, conservando ediciones más recientes y nuevas entradas.

Un fallo de lectura no sustituye los datos por un registro vacío. Un fallo de escritura no publica la modificación. Los updaters reciben copias para que una mutación fallida tampoco altere el estado en memoria. La hidratación conserva `dateISO: ""` como acción sin fecha y no recorta el registro cargado a 200 entradas.

Validación local:

- 13 pruebas de sincronización, concurrencia, errores, conservación de fechas, reapertura y compatibilidad de escritores manuales.
- 20 pruebas existentes de reservas manuales/IA y voz.
- Typecheck móvil correcto.
- Sin llamadas a producción.

La cola coordina los escritores dentro de la instancia de la app. No añade sincronización entre dispositivos ni aislamiento por cuenta al almacén local existente. Los borradores de interpretación, calendario/tareas y listas siguen pendientes de completar y validar; no se han ampliado en esta corrección.
