> Estado de consolidación 23/10/2026: consultar [GO_PELUQUERIAS_INTEGRATION_REVIEW.md](./GO_PELUQUERIAS_INTEGRATION_REVIEW.md). El documento inferior conserva la revisión de origen. La instalación normal ya se comprobó en la nueva rama aislada; el cliente actual utiliza el contrato de catálogo/tiempos, manteniendo v2 como compatibilidad anterior. No implica activación real ni validación física.

# Reservas con varios servicios — preparación local

## Estado y límite de validación

El selector compartido y el circuito DEMO están implementados y probados. La app confirma la selección con Guardar y conserva una sola reserva, con instantáneas de todos los servicios. Los datos DEMO siguen aislados por propietario y negocio; no se envían al backend.

El backend fuente tiene un contrato v2 preparado. Las pruebas HTTP usan Supabase simulado: NO demuestran la ejecución del SQL ni una reserva real. El compilado activo del backend no se ha sustituido. No se ha aplicado SQL ni reiniciado ningún servicio.

El borrador está en `supabase/drafts/booking_multi_service_v2.sql`, deliberadamente fuera de `migrations`. La suite SQL está en `supabase/tests/booking_multi_service_v2.sql`; está preparada y **no ejecutada**, conforme a la prohibición de aplicar migraciones. No considerar lista para piloto comercial la reserva múltiple real.

## Contrato compatible

* El POST existente `/api/supabase/bookings` conserva el cuerpo y comportamiento de un servicio.
* Para varios servicios añade `service_ids` (IDs únicos, ordenados, primero igual a `service_id`) y `request_key` (ID estable del HOLD, máximo 128 caracteres alfanuméricos, `_` o `-`). No se confía en precios ni duraciones enviados por el cliente.
* El servidor valida la sesión real, el propietario de la reserva, el catálogo del negocio y la duración acumulada. La RPC `go_create_service_booking` repite la validación dentro de la transacción, guarda una única fila y calcula instantáneas y precio del catálogo. Un precio desconocido se conserva como desconocido, nunca como gratuito.
* La fila mantiene `id`, `service_id`, relaciones y estados existentes. Añade `service_ids`, `service_details`, `total_duration_minutes`, `total_price`, `currency` y `request_key`. Las filas históricas quedan sin reescribir, con columnas nuevas nulas. La consulta de reservas devuelve también los campos nuevos.
* La clave de reintento es única por cliente. Reintentar una operación no crea otra cita. La RPC rechaza reutilizar la clave con otra selección/intervalo. La prevalidación HTTP exige que el catálogo siga siendo válido: si cambió entre una respuesta perdida y el reintento, puede rechazarlo; consultar las reservas existentes antes de iniciar otra operación.
* `GET /api/supabase/booking-capabilities` verifica la RPC de capacidad bajo el JWT del usuario. La app exige versión 2 antes de avanzar con varios servicios y antes de confirmar. Un backend/esquema anterior no recibe una reserva degradada al primer servicio. No hay reintentos infinitos.

## Borrador SQL: seguridad y disponibilidad

* Funciones públicas SECURITY INVOKER, ejecución solo para `authenticated`, con comprobación de `auth.uid()` y RLS existentes. No se utiliza service_role ni se modifican cuentas/roles.
* Solo se concede INSERT sobre IDs seleccionados y clave de reintento. El trigger genera las instantáneas y totales; no se conceden permisos para escribir los totales.
* Los servicios deben ser activos, visibles, del mismo negocio y moneda. El profesional debe cubrir todas las especialidades configuradas en `staff.ui_metadata.serviceIds` (lista vacía significa todos, como en la app).
* El intervalo completo debe caber en la disponibilidad de cada servicio. Los turnos específicos del profesional prevalecen sobre los del negocio. Es una regla conservadora: los servicios se atienden consecutivamente por un mismo profesional y deben caber juntos en el turno; no se reparte una reserva entre varios profesionales.
* Se usa la zona IANA almacenada en `availability.timezone` para los límites de turnos, incluidos cambios de hora. Es imprescindible comprobar su coherencia con la configuración real antes de aplicar. No se inventan horarios.
* La exclusión GiST existente protege los intervalos asignados. Un bloqueo transaccional común a inserciones nuevas y antiguas evita carreras entre rutas. Un único auxiliar SECURITY DEFINER en esquema privado consulta si un intervalo está ocupado, porque RLS oculta las reservas de otros clientes. Devuelve solo un booleano para negocios publicados/verificados o propios, nunca datos personales. No amplía las políticas de lectura de reservas ni concede permisos ADMIN.
* Este auxiliar también impide solapar una reserva antigua sin profesional con otra asignada. Es una validación más estricta de disponibilidad; las reservas antiguas válidas se conservan. Los negocios sin profesionales mantienen el recurso único del esquema actual. El borrador NO añade capacidad paralela, múltiples mesas ni recursos físicos diferentes a una misma reserva.
* Sin preferencia intenta asignar un profesional real cualificado. El trigger y la exclusión impiden confirmar un intervalo ocupado. La información de huecos mostrada por el móvil es orientativa: la RLS actual no le permite descargar reservas de otros clientes. La decisión final corresponde al servidor. Antes de piloto debe probarse la disponibilidad pública sin exponer datos personales, junto con la infraestructura de Nelson.

## Qué debe revisar Nelson antes de activar

1. Confirmar el esquema del entorno de pruebas, restricciones, RLS, grants, versión de PostgreSQL, dependencias y ausencia de nombres en conflicto. Crear copia recuperable y probar restauración. No aplicar sobre GO real sin autorización específica.
2. Revisar especialmente el auxiliar privado, serialización, calendario de turnos y la convención de especialidades/visibilidad en `ui_metadata`. Confirmar que la zona real de cada turno no ha quedado en UTC por defecto cuando debería ser Europe/Madrid.
3. En base aislada, revisar/aplicar el borrador y ejecutar la suite SQL con `go.booking_test_environment='isolated'`. Añadir prueba real con dos conexiones simultáneas: mismo cliente/clave, clientes distintos, con y sin profesional; confirmar una sola fila o conflicto 23P01 y ausencia de escrituras parciales.
4. Ejecutar pruebas reales del API frente a esa base: totales exactos, especialidades, turno completo, conflicto con otra cuenta invisible por RLS, lectura, reapertura y cancelación. Probar también catálogo modificado entre selección y confirmación. Los mocks HTTP no sustituyen estas pruebas.
5. Revisar con autorización la conectividad privada del cliente: catálogo, disponibilidad, GET/POST `/api/supabase/bookings`, PATCH `/api/supabase/bookings/:id/cancel` y GET `/api/supabase/booking-capabilities`. La pasarela actual no se ha ampliado ni reiniciado; integrar código no autoriza a cambiar su allowlist o CORS.
6. Solo tras autorización: generar la migración mediante el procedimiento oficial, compilar/activar el backend y desplegar o sustituir procesos según corresponda. No ejecutar estas acciones como parte de esta entrega.
7. Mantener el contrato anterior durante el despliegue gradual. Ante fallo, desactivar el acceso v2 en la infraestructura/volver al backend anterior y conservar columnas e instantáneas: no ejecutar un rollback destructivo que borre servicios ya reservados. La app fallará de forma explícita en vez de degradar silenciosamente.

## Prueba manual en GO App

En la misma cuenta propietaria: EMPRESA DEMO → negocio → configurar Corte, Tinte y Tratamiento con precio/duración y profesional cualificado. USUARIO DEMO LOCAL → Reservas → buscar ese negocio → marcar/desmarcar servicios → Guardar → profesional → horario → confirmar. Debe aparecer una sola reserva con el conjunto de servicios y el intervalo total. Revisar calendarios de cliente, empresa y profesional; volver a abrir, Reload, cerrar/reabrir Expo Go, cancelar y comprobar que se libera todo el intervalo. Cambiar a otro negocio y verificar aislamiento.

Las pruebas físicas en iPhone están pendientes. Con backend antiguo la selección múltiple real debe detenerse con un aviso y conservarse, sin enviar solo un servicio. La URL de desarrollo observada sigue siendo `exp://100.105.48.111:8086`; no se ha cambiado el proceso que la sirve.

## Referencias consultadas

* [Funciones y permisos](https://supabase.com/docs/guides/database/functions)
* [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
* [Cambios PostgreSQL 15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes): el caso de btree_gist descrito afecta índices float/NaN; el recurso de GO es UUID. Verificar de todos modos la instalación de destino.

La guía del plugin Supabase se ha utilizado para el diseño. No se ha ejecutado ninguna operación sobre el proyecto real.
