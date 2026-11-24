# Orden manual de complementos de Peluquerías — pendiente de autorización

Comprobación de solo lectura en `goapp` (`xiyxziyjpgnqfecbhmqn`, 24/11/2026):
`go_catalog_private.associations`, `public.go_catalog_quote` y
`public.go_create_catalog_booking` existen; `public.bookings.catalog_snapshot`
existe y `public.services.price` es `numeric(12,2)`. La tabla de asociaciones
no tiene una columna de orden. No se aplicó ninguna modificación al servidor.

El modelo vigente ya permite varios productos opcionales por servicio y fija
precio y detalle en la reserva. Cada producto complementario nuevo tiene duración
cero y no modifica capacidad. La app permite crearlos, editarlos, desactivarlos y
retirar su asociación; la selección múltiple se cotiza en el servidor. El orden
manual se conserva en el catálogo local DEMO, pero se mantiene inhabilitado para
empresas reales hasta completar la intervención siguiente.

## Intervención mínima propuesta

1. Añadir `sort_order integer` a `go_catalog_private.associations` y rellenar
   solo las filas existentes con una secuencia estable por `(business_id,
   source_id)`, preservando sus identificadores, relaciones y revisiones.
2. Ampliar la operación **existente** `go_catalog_associations` con `reorder`:
   recibir la lista completa de IDs del mismo servicio; comprobar propiedad de
   empresa, pertenencia, ausencia de duplicados y revisión vigente; asignar las
   posiciones en una sola transacción. Conservar el bloqueo de propietario y
   todas las restricciones actuales. No crear una tabla ni una política nueva.
3. Ordenar el resultado de `list` y las opciones de `go_catalog_quote` por
   `sort_order, id`; extender únicamente la validación de
   `/supabase/catalog/associations` para aceptar esa operación.
4. Habilitar los controles Subir/Bajar de empresa real solo después del
   despliegue y de comprobar cotización, reserva histórica, aislamiento entre
   empresas y concurrencia en una base aislada y posteriormente en producción
   autorizada. No recalcular `catalog_snapshot` de reservas existentes.

Antes de ejecutar: copia recuperable actual, prueba de restauración, revisión
de la definición viva de las RPC y prueba de compatibilidad con el cliente
anterior. La reversión funcional consiste en volver a la RPC anterior; no se
debe borrar la columna ni sus datos durante la recuperación.
