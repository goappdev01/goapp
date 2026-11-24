# Clientes por empresa — propuesta pendiente de autorización

La pantalla de Clientes puede leer el listado de personas con reservas reales mediante el contrato existente `go_booking_receipts`. Esa lectura exige sesión autenticada y propiedad verificada del negocio; no consulta perfiles globales. El esquema de producción no tiene una estructura para favoritos, observaciones ni preferencias. `business_settings.payload` guarda la configuración completa del negocio y se reemplaza al guardarla: mezclar allí fichas de clientes podría perder datos por escrituras concurrentes.

## Cambio mínimo propuesto

Crear una tabla `business_client_details` con clave compuesta `(business_id, customer_id)`, referencias a `businesses` y `profiles`, `favorite boolean not null default false`, `business_notes text` y `service_preferences text` opcionales, cada texto limitado a 500 caracteres, y `updated_at`. No copiar nombres, teléfonos ni reservas: se consultan desde el recibo autorizado. Ninguna fila se crea automáticamente al reservar.

Habilitar RLS y conceder solo `SELECT`, `INSERT`, `UPDATE` y `DELETE` a `authenticated`. Las políticas deben exigir simultáneamente `auth.uid() = businesses.owner_id` y una reserva existente para el mismo par negocio/cliente, tanto en lectura como en escritura (`USING` y `WITH CHECK`). Las claves `(business_id, customer_id)` no deben poder cambiarse por una actualización. No conceder acceso al personal hasta disponer de una vinculación autenticada y autorizada; la relación `staff.profile_id` por sí sola no acredita permiso sobre fichas. No incluir estos datos en búsquedas públicas, calendarios del cliente ni mensajes.

Exponer una operación autenticada y acotada por negocio/cliente, con validación de longitud y actualización independiente de cada campo, más borrado explícito. Comprobar la identidad también en el servidor. Tratar el contenido como texto privado: no registrarlo en logs ni devolverlo en errores. La interfaz deberá recordar que no se introduzcan datos sensibles o personales irrelevantes y no usar estas notas para marketing ni perfiles automáticos.

## Antes de activar

Se requiere autorización específica para crear la tabla, sus políticas y permisos productivos, con respaldo actual y prueba de aislamiento en dos empresas y dos identidades. Hasta entonces, la pantalla publicada es **solo lectura**: no muestra favoritos ficticios ni permite introducir notas sin persistencia segura. No hay migración aplicada ni endpoint de escritura desplegado por este cambio.
