# Bloqueo de reservas tras la recuperación ADMIN

## Evidencia dirigida (03/11/2026)

- API efectiva de Metro: https://goapp-api-production.up.railway.app/api, configurada explícitamente al arrancar el Metro existente. No se reutiliza /api relativo en peticiones nativas de reservas.
- GET /api/supabase/businesses devuelve 200 y []; la empresa observada en el teléfono no queda acreditada como fila del catálogo público remoto por esta respuesta. No se ha leído el almacenamiento del iPhone.
- La búsqueda del propietario conserva su catálogo local. Su adaptador registrado carga servicios/profesionales a través de sourceFor, que exige identidad actual y llama GET /api/supabase/booking-calendar-business?source_id=<ID del catálogo>, con el bearer interno y el UUID esperado. Esta ruta devuelve actualmente 404 HTML en Railway, incluso sin token y con un source_id sintético. El manejador no existe en el backend 153712e6.
- Solo después de un enlace válido se llaman GET /supabase/manage/businesses/<businessId>/services y /staff. La respuesta del enlace debe contener businessId UUID, sourceId coincidente, timezone, serviceLinks, staffLinks y bookingLinks. El móvil conserva los UUID canónicos para disponibilidad y confirmación.
- GET /supabase/services y /staff responde 200 anónimamente; ese no es el fallo de enlace descrito. GET /supabase/booking-gap-policy y /booking-phase-policy devuelve 404. No se han confirmado reservas ni consultado datos privados con tokens.

El flujo anterior documentado en docs/development/go-tableros-8088/README.md usaba backend/puente/PostgREST/PostgreSQL aislados en 3002/65441/65440/65439. Sus empresas y contratos no se presuponen presentes en Supabase real. Main conserva los componentes de búsqueda, servicios, profesional, calendario y confirmación, así como la integración aa5c137; no es necesario revertir el móvil ni sus correcciones de login.

## Propuesta mínima de revisión, no autorizada para producción

booking-source-read-proposal.patch añade al código 153712e6 únicamente el registro y GET de enlace copiado del manejador actual de main, sin otros cambios de backend ni SQL. Es una propuesta para el primer fallo, no una recuperación completa ni una entrega lista para desplegar.

Depende de public.go_booking_calendar_business(p_source_id), sus permisos/RLS y los vínculos persistidos del propietario. Si faltan, devuelve indisponibilidad; no crea empresas o enlaces y no debe aplicarse un borrador SQL automáticamente. Antes de plantear un despliegue deben verificarse esas dependencias y las RPC/rutas canónicas de disponibilidad, fases/huecos, catálogo y confirmación que usa registeredBookingRepository. Añadir únicamente este GET dejaría los pasos siguientes sin comprobar y no permite declarar el flujo restaurado.

No se deben reinterpretar los IDs demo como UUID reales, copiar empresas locales a Supabase, desactivar las guardas del motor ni sustituir una reserva de servidor por una confirmación AsyncStorage. Recuperar el proveedor aislado anterior o habilitar contratos compatibles en el servidor requiere acceso y autorización específicos; ninguna de esas operaciones se ha realizado.

## Verificación móvil

Las pruebas dirigidas cubren carga de servicios/profesionales mediante enlaces válidos, traducción de IDs hasta consulta de fechas, rechazo por 404/501 sin fallback ni confirmación, diferencia con 403/empresa no enlazada, y el recorrido visual existente hasta confirmar y abrir calendario con fixtures DEMO explícitos. Esto último prueba la navegación, no una reserva real en Railway. La confirmación real permanece bloqueada hasta disponer de los contratos de servidor compatibles y deberá comprobarse expresamente desde el iPhone.

El ajuste USUARIOS modifica solo tamaño/ajuste de su texto dentro del círculo actual, sin cambiar coordenadas ni diámetro orbital. Su aspecto final también requiere comprobación física.
