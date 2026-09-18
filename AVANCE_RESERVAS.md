# Reservas — gestión de empresa y permisos (18 septiembre 2026)

## Implementado en el API
Todas las rutas siguientes requieren Authorization: Bearer y usan el JWT del usuario, nunca una clave service_role.

Base: /api/supabase/manage

| Método | Ruta | Función |
| --- | --- | --- |
| GET / POST | /businesses | Listar negocios propios / crear negocio |
| PATCH | /businesses/:businessId | Actualizar negocio propio |
| GET / POST | /businesses/:businessId/services | Consultar / crear servicios |
| PATCH | /businesses/:businessId/services/:id | Editar o desactivar servicio |
| GET / POST | /businesses/:businessId/staff | Consultar / crear profesionales |
| PATCH | /businesses/:businessId/staff/:id | Editar o desactivar profesional |
| GET / POST | /businesses/:businessId/availability | Consultar / crear horarios |
| PATCH | /businesses/:businessId/availability/:id | Editar o desactivar horario |

Un negocio nuevo empieza con reservas desactivadas, zona Europe/Madrid por defecto. Los servicios del piloto usan EUR. El propietario procede de la sesión; el cliente no puede establecer owner_id, verified ni business_id de recursos mediante el cuerpo de las peticiones. Los horarios son intervalos dentro del mismo día, con precisión de minutos.

Se mantienen las pantallas aprobadas. Esta entrega agrega operaciones del backend: aún falta conectar las escrituras de la interfaz empresarial, que siguen siendo locales. No se debe presentar esta entrega como un módulo completo para pilotos.

## Aplicado en Supabase
- Alta pública limitada a usuario/empresa. Roles privilegiados no se copian desde user_metadata.
- Eliminada del código API la sincronización insegura del rol durante /auth/me.
- Permisos por columna protegen roles, propietarios, verificación y referencias entre negocios.
- Restricciones compuestas impiden enlazar profesional o servicio de otro negocio.
- El cliente solo puede cancelar sus propias reservas activas; no completarlas ni alterar sus datos.
- Funciones de trigger dejan de ser ejecutables mediante RPC por clientes.
- btree_gist trasladada a extensions. El asesor de seguridad devuelve cero avisos tras el cambio; esto no sustituye una auditoría funcional completa.

Las tres migraciones de esta entrega ya están aplicadas en el proyecto xiyxziyjpgnqfecbhmqn. Sus nombres de archivo coinciden con el historial remoto. La migración inicial histórica sigue con el nombre original de la exportación; reconciliar ese historial antes de automatizar despliegues con CLI.

## Verificado
- API: comprobación TypeScript, build y dos suites HTTP automatizadas aprobadas.
- Supabase real: fixtures dentro de BEGIN/ROLLBACK verifican rol de registro, permisos por columna, separación entre empresas, referencias entre empresas, solapamientos y cancelación. No se conservan usuarios ni reservas de prueba.
- Los pagos y las suscripciones no se han activado.

## Siguiente trabajo
1. Conectar el formulario de configuración empresarial a estas rutas, incluyendo campos de interfaz todavía sin correspondencia en la base de datos.
2. Validar horarios de apertura y zonas horarias al reservar también en la base de datos; completar estados de gestión empresarial y renovación de sesión.
3. Prueba completa de registro con correo, configuración, reserva y cancelación desde Expo Go; resolver errores TypeScript del móvil.
4. Integración Stripe Connect en pruebas para anticipos 10/25/50/100%, además del pago fuera de GO. Activar suscripción solo tras definir las condiciones comerciales/fiscales.

Este API aún no está desplegado en un servidor público. Las protecciones de base de datos sí están aplicadas.
