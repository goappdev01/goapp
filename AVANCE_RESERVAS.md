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

Se mantienen las pantallas aprobadas. El asistente y las pantallas empresariales ya utilizan rutas de propietario para consultar y guardar negocios, servicios, profesionales y horarios. Los registros locales de demostración conservan su almacenamiento anterior. Falta validar el recorrido visual completo en Expo Go; no se debe presentar esta entrega como un módulo completo para pilotos.

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
1. Verificar en Expo Go el asistente, su recuperación en otro dispositivo y las pantallas de edición con el API desplegado.
2. Validar horarios de apertura y zonas horarias al reservar también en la base de datos; completar estados de gestión empresarial y renovación de sesión.
3. Prueba completa de registro con correo, configuración, reserva y cancelación desde Expo Go.
4. Integración Stripe Connect en pruebas para anticipos 10/25/50/100%, además del pago fuera de GO. Activar suscripción solo tras definir las condiciones comerciales/fiscales.

Este API aún no está desplegado en un servidor público. Las protecciones de base de datos sí están aplicadas.

## Conexión móvil — siguiente entrega
- El formulario empresarial consulta exclusivamente negocios de la cuenta autenticada. Un negocio nuevo comienza desactivado y no se reactiva por abrir una pantalla.
- Se guardan teléfono, categoría, color y política configurada del negocio; atributos del servicio; especialidades del profesional; turnos y minutos del horario en ui_metadata. Estos datos no confieren permisos ni activan cobros.
- business_settings guarda una copia privada del asistente bajo RLS. Al iniciar sesión se recupera la copia remota; los borradores locales se separan por usuario. Un inicio de sesión por sí solo no sube borradores antiguos.
- Los guardados automáticos se agrupan tras 800 ms y se ejecutan en orden. Se conserva el ID del negocio tan pronto se crea para reutilizarlo si falla el resto. Hay aviso de fallo y opción de reintento. La sincronización de todos los recursos no es una transacción única: un fallo intermedio puede dejar cambios parciales, que deben reintentarse.
- Eliminar servicios, profesionales u horarios los archiva; no borra sus referencias históricas. Las desactivaciones normales siguen siendo editables.
- Las mutaciones UUID remotas no se sustituyen por un guardado local al fallar. Las llamadas de pago siguen pendientes.
- Migración mobile_booking_fields aplicada en Supabase. Prueba de persistencia de configuración, campos adicionales y aislamiento entre propietarios aprobada mediante rollback. Asesor de seguridad sin avisos.
- Tres suites automatizadas del API/capa de datos móvil aprobadas; TypeScript y build del API aprobados. Los errores TypeScript del móvil se corrigen en la entrega descrita abajo. No se ha ejecutado la prueba visual completa en Expo Go.
- Esta entrega no despliega el API. Es necesario que Expo apunte con EXPO_PUBLIC_API_URL al backend actualizado para utilizar las nuevas rutas.


## Corrección TypeScript del móvil — 19 septiembre 2026
- Corregidos los 86 diagnósticos iniciales manteniendo strict y todos los archivos dentro de la comprobación.
- Agenda y pantalla principal comparten GoEntry, incluidos los tipos de reserva y campos históricos opcionales. La ordenación tolera entradas antiguas sin createdAt.
- Corregidos nombres de campos de reservas y planos, inicialización del mes, claves de traducción, iconos inexistentes y propiedades incompatibles con React Native.
- El botón SELEC. controla la selección real de AgendaBoard y se limpia al cerrar. El selector de contactos del flujo rápido tiene implementación y alternativa manual.
- Notificaciones conservan los modos silencioso, visual y sonido con las propiedades requeridas por la versión instalada de Expo.
- Verificado: TypeScript móvil sin errores; tres pruebas automatizadas existentes del API/capa de datos móvil aprobadas; git diff --check correcto.
- Pendiente: prueba visual en Expo Go y pruebas en dispositivos iOS/Android. La comprobación de tipos no equivale a publicación en tiendas ni a validación completa del flujo de reservas.
