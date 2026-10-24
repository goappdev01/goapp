# Servicios, asociaciones voluntarias y controles de reserva

## Funcionamiento

- La plantilla de ocho pasos conserva la configuración en el paso Servicios. Antes de abrir sus asociaciones se guarda el borrador de servicios. Se conservan nombres, descripciones opcionales, precios, duración y fases.
- El catálogo propio proporciona productos y servicios. Las asociaciones admitidas son `optional`, `recommended` e `included`. Se pueden consultar, editar, activar, desactivar y eliminar desde el mismo editor.
- Nueva reserva y el acceso directo a un proveedor utilizan `BookingSearchOverlay`. Seleccionar o desmarcar servicios no avanza; Guardar confirma la selección y sus opciones voluntarias. Los productos no añaden minutos; los servicios asociados conservan su duración y la planificación existente del servidor.
- Las asociaciones históricas `required` se resuelven como incluidas: sin aceptación separada y con cargo cero. No se cambian sus nombres, los precios del catálogo ni los contratos de reservas ya confirmadas.
- El mismo `catalogSnapshot` conserva el detalle y el importe en la reserva, disponible desde sus proyecciones de cliente y empresa. Se conservan la identidad de reserva, la clave idempotente y los controles de disponibilidad y permisos.
- Las fichas canónicas muestran los cuatro controles existentes. Pendiente y Aceptada reflejan el estado compartido; no permiten que un cliente confirme a la empresa ni cambie arbitrariamente el estado. Aceptar/rechazar una propuesta solo corresponde al receptor; rechazar una reserva utiliza la cancelación ya existente. Proponer cambio está disponible para ambos participantes en reservas activas, incluidas las creadas por el cliente.
- La fecha y la ocupación originales se conservan hasta aceptar la propuesta. No se crea otra reserva al proponerla.
- El marcador sintético exacto `Cliente DEMO local` deja de usarse como identidad visual. Los nombres de registros y los datos almacenados se conservan; se usa la presentación existente para cliente no informado.

## Almacenamiento y actualización SQL

El adaptador local autorizado usa el mismo selector y el documento persistente de su empresa. Nunca escribe en el repositorio remoto de reservas. El recorrido con PostgreSQL utiliza las RPC existentes y sus verificaciones de propiedad y participantes.

`artifacts/api-server/supabase/drafts/catalog_associations_v1.sql` define una instalación nueva. Para una instalación que ya tenga ese borrador, `catalog_voluntary_v1.sql` es la actualización específica: amplía la restricción del modo y sustituye tres funciones de catálogo. Conserva tablas, filas, propietarios de funciones, concesiones, RLS y snapshots de reservas anteriores. No se debe volver a ejecutar el borrador completo sobre una instalación existente.

La actualización se ha comprobado y aplicado únicamente al PostgreSQL aislado de desarrollo utilizado por 8088 y a la base exclusiva de pruebas automatizadas. Se ha actualizado solo su backend de prueba 3002. Los servicios 3000, 3001, 8086 y 8087 se conservan.

Producción no se ha modificado. Una activación futura del backend en otro entorno necesita revisar y autorizar la actualización SQL allí antes de usar los modos nuevos. Los borradores no se aplican automáticamente al publicar código en GitHub.

## Validación técnica del 24 de octubre de 2026

- TypeScript móvil y backend: correctos.
- Pruebas dirigidas de selección múltiple, los dos accesos al selector, editor de asociaciones, persistencia local, fichas, permisos, sincronización y fases: correctas.
- PostgreSQL, PostgREST y rutas Express con identidades ficticias: 20 pruebas correctas. Incluyen opciones recomendadas sin seleccionar, migración semántica de required, conservación del precio aceptado, inclusión sin doble cargo, fases/recursos, colisiones, reintentos, ciclos y aislamiento por empresa.
- Backend de 8088: salud HTTP 200; una configuración recomendada sin autenticación sigue devolviendo 401 y una nueva configuración required se rechaza con 400.
- Pendiente: comprobación física final del propietario en el iPhone después de publicar y sincronizar el mismo proyecto 8088.

La comprobación física debe usar una empresa concreta en ambos perfiles: Empresa → plantilla → Servicios para configurar; Usuario → Nueva reserva → esa empresa para elegir varios servicios y guardar. Después abrir la misma reserva en ambos calendarios, proponer un cambio desde Usuario y responder desde Empresa.
