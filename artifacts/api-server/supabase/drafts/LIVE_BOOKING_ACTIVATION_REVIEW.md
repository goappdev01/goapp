# GO Peluquerías V1: activación de reservas alojadas

Estado al 14/11/2026: revisión y preparación; **ningún SQL de esta carpeta se ha ejecutado en producción**.

## Contrato que ya existe

La app envía reservas reales con un JWT de cliente a Railway. El servidor delega disponibilidad, idempotencia, conflicto, recibos y negociación en RPC de Supabase, con el JWT original. La configuración empresarial solo puede sincronizar servicios, profesionales y horarios de una empresa propia y verificada. La solicitud de verificación no concede aprobación. El circuito DEMO utiliza almacenamiento local separado.

`/supabase/booking-calendar-business?source_id=<id local>` devuelve 501 cuando el servidor carece de un vínculo legítimo para ese identificador. No es correcto crear el vínculo por nombre ni tratar una empresa DEMO como empresa verificada. Una empresa registrada con UUID canónico puede usar la ruta de lectura existente si es propia y verificada, aunque falte la RPC opcional; eso no demuestra que las RPC de escritura estén instaladas.

## Precondiciones pendientes para producción

1. Confirmar el proyecto de destino con el valor efectivo de `SUPABASE_URL` en Railway mediante una vía administrativa que no divulgue credenciales. Los DNS históricos y la URL pública del móvil no prueban el valor efectivo actual.
2. Obtener una copia recuperable de la base productiva y verificar una restauración aislada. Una copia lógica de la base no incluye los archivos de Storage. No hay constancia de una restauración probada para esta activación.
3. Ejecutar `booking_live_preflight.sql` por la conexión administrativa autorizada y conservar sus resultados en privado. Comparar objetos, columnas, políticas, restricciones, permisos y huellas de funciones con las migraciones realmente aplicadas.
4. Solo después adaptar los borradores al esquema encontrado, ensayar la migración y su reversión sobre una copia aislada, y solicitar autorización específica para ejecutarla en producción.

## Por qué los borradores no son una migración aplicable todavía

`booking_multi_service_v2.sql`, `booking_negotiation_v1.sql` y `booking_timeline_v1.sql` alteran `public.bookings`; el último sustituye restricciones de disponibilidad y solapamiento. `booking_calendar_source_guard_v1.sql` reescribe el cuerpo de funciones existentes mediante sustitución de texto. `booking_calendar_timezone_v1.sql` también reemplaza la función de vínculo. Son cambios a objetos existentes, no una instalación exclusivamente aditiva. Su orden y variante dependen de las versiones desplegadas. No ejecutarlos directamente ni presentar una reversión que borre reservas creadas después.

La reversión operativa tras activar reservas debe preservar sus filas y recibos. Si falla una fase, detener nuevas escrituras de esa capacidad de forma autorizada, conservar las lecturas y recuperar desde la copia ensayada o una corrección transaccional revisada. Restaurar la base completa sobre producción perdería cambios posteriores.

## Prueba que autoriza declarar el circuito funcional

Con dos identidades reales autorizadas y una empresa aprobada: crear servicio, profesional y horario; comprobar disponibilidad; confirmar una reserva con clave idempotente; leer **el mismo UUID** desde cliente y empresa tras reiniciar y en otro dispositivo; reintentar sin duplicar; negociar/cancelar; comprobar que otra empresa y una sesión caducada no acceden. Las pruebas sintéticas o un HTTP 200 del catálogo no sustituyen esta prueba alojada.
