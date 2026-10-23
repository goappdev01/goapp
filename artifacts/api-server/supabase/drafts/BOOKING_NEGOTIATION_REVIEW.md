# Negociación de reservas — revisión para Nelson

Estado: código preparado en `codex/go-reservas-peluqueria-20261021`, sobre `6c834db`. Sin commit, integración, despliegue ni migraciones en bases reales. Metro 8086 servía otro worktree al inicio y actualmente no responde. No se ha reiniciado ni contiene este paquete.

## Contrato y conservación

Ya existían creación, lectura y cancelación de reservas reales con JWT, RLS, pertenencia de servicio/profesional y exclusión de intervalos. No existían operaciones persistentes de negociación. El circuito DEMO y el adaptador móvil estaban separados y se conservan.

`POST /api/supabase/bookings/:bookingId/change` recibe `operation` (`propose`, `counter`, `accept`, `reject`, `cancel`, `confirm`), `expectedRevision`, `proposalId` cuando hay propuesta y `dateISO`/`time` al proponer. `acceptFinancialTerms: true` es obligatorio al proponer/aceptar. `requestId` UUID es opcional: el servidor deriva un identificador estable del comando cuando falta. La identidad procede exclusivamente del JWT, nunca del cuerpo.

`GET /api/supabase/bookings?negotiation=1[&business_id=UUID]` devuelve recibos de las mismas reservas: horario, estado, revisión, propuesta, historial y etiquetas permitidas. El GET antiguo se conserva. No hay otra tabla de reservas, tareas duplicadas ni copia local de las reservas reales.

El RPC `go_negotiate_booking` bloquea por establecimiento y por fila, valida revisión/participantes y registra cada comando de forma durable. Solo el cliente o propietario verificado del establecimiento pueden negociar. Nadie acepta su propia propuesta. El horario/estado original se conserva durante la negociación. Aceptar cambia solo el intervalo, una vez, y vuelve a comprobar servicios, profesional, turno completo, zona horaria y ocupación (incluidas filas ocultas por RLS y reservas antiguas sin profesional). Un conflicto revierte toda la operación y mantiene la propuesta anterior. Rechazar no mueve la reserva. Cancelar utiliza los estados/permisos existentes y conserva la trazabilidad, también por el endpoint antiguo.

La duración es la contratada originalmente. Los servicios, profesional, notas, propiedad, identificador, importes, instantáneas y referencias económicas no se modifican. No se llama a ningún servicio de pagos, cobros o devoluciones. La aceptación de condiciones existentes queda registrada; una liquidación económica adicional requiere su procedimiento externo autorizado. Las reservas antiguas de un servicio no adquieren artificialmente una instantánea de precio que nunca guardaron.

Calendario del cliente, Mis reservas y Próxima visita consumen una misma proyección canónica. El calendario de empresa/profesional filtra la misma reserva por `staffId`. Se refrescan al guardar, volver al primer plano y cada 30 segundos; no se ha introducido otro sistema de tiempo real. Los permisos delegados de empleados/profesionales no propietarios siguen siendo los existentes: no se han ampliado.

## SQL propuesto, sin aplicar

`booking_negotiation_v1.sql` es un borrador deliberadamente fuera de `migrations/`. Requiere las seis migraciones ya incluidas en esta rama. Nelson debe comparar esas premisas con el esquema real antes de generar una migración mediante Supabase CLI.

Añade tres columnas de negociación a `bookings` y un registro privado de comandos. No cambia autenticación, roles globales ni concede UPDATE de fechas a clientes. Las funciones públicas son INVOKER. El núcleo DEFINER está en un esquema privado, con `search_path=''`, EXECUTE revocado a PUBLIC/anon y comprobación explícita de `auth.uid()` y participante. Este privilegio limitado es necesario para actualizar el horario acordado sin dar permiso general de edición y para comprobar intervalos de otros clientes sin revelar sus datos. El guard existente solo admite esa ruta bajo el propietario de la función, con comparación de columnas inmutables; ningún GUC o metadato del cliente autoriza cambios. La función de recibos utiliza una lista explícita de campos.

Revisar especialmente propietario de las funciones, grants/RLS, guard de actualización, orden de triggers y bloqueo `go-booking:<businessId>`. La cancelación directa ya autorizada conserva su funcionamiento; el trigger registra el cierre de propuestas abiertas.

El borrador separado `booking_multi_service_v2.sql` del Agente 1 NO está incluido ni activado por este paquete. La negociación se ha probado sin él y con su referencia aplicada solo a una base ficticia. Comparte el mismo bloqueo y conserva íntegros `service_ids`, `service_details`, duración, precio, moneda y clave de creación. Nelson debe revisar conjuntamente el orden de incorporación, su versión actual y los cambios concurrentes de rutas/adaptadores. No se debe ejecutar una copia histórica sin revisar su hash y diferencias.

## Pruebas reproducibles sin producción

Se necesita PostgreSQL >=15 con `btree_gist`, Node y PostgREST real; no se sustituye la base por un mock o DEMO. El servidor PostgreSQL debe escuchar exclusivamente en `127.0.0.1` y utilizar una instancia desechable independiente con usuario `go_booking_test_owner`.

Crear únicamente en esa instancia vacía dos bases `go_booking_negotiation_test_legacy` y `go_booking_negotiation_test_multi`, marcadas mediante `ALTER DATABASE <nombre> SET go.booking_test_environment='isolated'`. El helper no crea bases ni borra esquemas y rechaza una base ya inicializada.

Desde `artifacts/api-server`, configurar variables SOLO en el proceso de pruebas:

```powershell
$env:GO_BOOKING_TEST_CONFIRM='isolated'
$env:GO_BOOKING_TEST_URL='postgresql://go_booking_test_owner@127.0.0.1:<puerto-pruebas>/go_booking_negotiation_test_legacy'
node tests/helpers/prepare-booking-negotiation-db.mjs
# Cambiar el nombre a ..._multi y proporcionar la referencia explícita del Agente 1:
$env:GO_BOOKING_TEST_MULTI_SQL='<ruta-revisada>/booking_multi_service_v2.sql'
node tests/helpers/prepare-booking-negotiation-db.mjs
$env:GO_BOOKING_POSTGREST_BINARY='<ruta-portatil>/postgrest.exe'
# Volver a URL ..._legacy; la prueba comprueba ambas bases por separado.
node --test tests/*.test.mjs
```

Las DLL de PostgreSQL deben estar disponibles para ese proceso de PostgREST en Windows. No cambiar PATH global, `.env` ni configuraciones reales. Los JWT de prueba usan un secreto aleatorio temporal y perfiles ficticios en el esquema de pruebas; se valida la firma con PostgREST. No se prueba el inicio de sesión real de Supabase ni se utilizan credenciales de producción. El proxy local del test solo traduce el prefijo `/rest/v1`; las operaciones son RPC SQL reales, no respuestas simuladas.

La batería comprueba participantes distintos, acceso ajeno, JWT inválido, grants, propuesta/aceptación/rechazo/contrapropuesta, cancelación antigua y nueva, reintentos tras recarga, revisión obsoleta, cambios simultáneos, intervalos ocultos/sin profesional, disponibilidad y horario de verano. Ejecuta el adaptador móvil y los selectores reales de Calendario, Listados y Próxima visita contra esas respuestas. Incluye una columna económica ficticia para comprobar que no se altera ni se expone en el recibo. Las pruebas de hooks comprueban cambio de empresa/cuenta y rechazo de callbacks retenidos.

## Autorizaciones y validación pendientes

1. Revisión de Nelson del SQL y de las dependencias de reservas múltiples. No se ha ejecutado ninguna migración real.
2. Autorización para incorporar la migración revisada y ejecutar este backend en un entorno de pruebas compartido. Los servicios 3000, 3001 y 8086 actuales siguen intactos.
3. Revisar por separado la allowlist de la pasarela privada: no se han habilitado escrituras. No abrir un permiso genérico de POST/PATCH. Si se autoriza, limitar la negociación a esta ruta autenticada y al entorno elegido.
4. Validación física en iPhone de propuesta, respuesta desde la empresa, contrapropuesta, rechazo, cancelación y actualización de las tres vistas. La maquetación congelada del Landing no se modifica en este paquete. Aún no se ha hecho esa comprobación con este servidor.
5. No considerar desplegado ni completo en producción por pasar las pruebas aisladas. El paquete está preparado para revisión e integración controlada, pendiente de estas autorizaciones.

## Ampliación de fichas y QR

Consultar [BOOKING_VERIFICATION_REVIEW.md](BOOKING_VERIFICATION_REVIEW.md): nombre de cliente autorizado, aceptación inicial PENDING por la empresa y servicio compartido de QR/derechos/llegada. Mantiene la reserva, negociación y pagos. El paquete está preparado exclusivamente para revisión; no está activado en los servicios compartidos.
