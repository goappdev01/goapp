# GO AYUDA: activación pendiente

## Controles fijos y bloqueo de envío — 8 de noviembre de 2026

La corrección de los formularios no activa la infraestructura. Incidencia, Mejora
y Ayuda anclan Papelera, Adjuntar, GO y Volver en el mismo flujo que el editor, con
6 puntos de separación. No montan el reconocedor de arrastre ni leen posiciones
`fab_pos` anteriores. KeyboardAvoidingView es el único desplazamiento por teclado;
la bandeja de adjuntos utiliza la altura medida del conjunto. Mis solicitudes,
ADMIN y los controles flotantes de otros módulos conservan su implementación.

Cuando falta la conexión autorizada, ENVIAR permanece deshabilitado y la explicación
«Envío temporalmente deshabilitado» está junto al editor, fuera del scroll de
adjuntos. No se descartan borradores ni archivos y no se muestra recepción ficticia.
`GO_SUPPORT_LIVE_ENABLED` sigue en `false`.

Se ha vuelto a comprobar en lectura el proyecto `xiyxziyjpgnqfecbhmqn`: las cuatro
tablas operativas, el esquema privado y el bucket continúan ausentes. Railway
responde 200 en `/api/healthz` y 401 `AUTH_REQUIRED` en capacidades de SOPORTE sin
sesión; esto acredita la ruta y su protección, no una recepción persistida.

Revisión íntegra del SQL: conserva la huella indicada abajo y no se ha modificado
ni ejecutado en producción. Las escrituras y `DELETE` de la purga están limitados
a objetos de SOPORTE; no hay `DROP` ni cambios de registros de otros módulos.
Las funciones privilegiadas conservan comprobación de identidad/autorización,
`search_path` vacío y revocación a PUBLIC/anon. El acceso Storage está limitado al
bucket privado y al expediente autorizado. Estas operaciones privilegiadas y la
purga irreversible de expedientes vencidos siguen requiriendo revisión y
autorización específica antes de aplicar la migración alojada.

Las pruebas aisladas ejecutan el contrato real de Express y SQL sobre PostgreSQL
PGlite persistente, con identidades y adaptador de Storage sintéticos: envío de los
tres tipos, respuesta ADMIN y del remitente, notas internas ocultas, adjuntos,
idempotencia, retención y reapertura del almacenamiento tras reiniciar. No son una
restauración de un respaldo alojado ni una prueba de Auth/Storage de producción.

**Bloqueo productivo conservado:** no se ha acreditado un respaldo recuperable del
proyecto alojado ni la restauración aislada de ese respaldo; tampoco existe
autorización específica para ejecutar este SQL en producción. El conector
disponible no expone el inventario de copias. Se debe identificar la copia en
Supabase → Database → Backups (o un respaldo privado equivalente), verificar su
origen e integridad y restaurarla en un entorno aislado antes de pedir autorización
del SQL exacto. El respaldo de base de datos no incluye los objetos de Storage:
debe documentarse también su recuperación antes de activar adjuntos reales.

No se solicita ni ejecuta un cambio productivo saltando estas condiciones. Tras
cumplirlas, la activación requiere una transacción autenticada real completa
USUARIO → ADMIN → respuesta → MIS SOLICITUDES antes de habilitar el cliente.

## Comprobación del 8 de noviembre de 2026

Proyecto alojado comprobado en lectura: `goapp` / `xiyxziyjpgnqfecbhmqn`, PostgreSQL 17.
SQL revisado SHA-256: `B49121044B7F8D7530282F06B95B420C13C7C3AA89C2A41438E0DEC665EB1041`.
No existen `go_support_requests`, `go_support_messages`, el esquema privado ni el
bucket `go-support-private`. Las columnas utilizadas de profiles/businesses/admin_memberships
son compatibles. Storage no tiene políticas de objetos existentes que amplíen este
acceso y no están instaladas pg_cron/pg_net. No se ejecutó SQL de escritura alojado.

La ruta `/capabilities` requiere una sesión y solo declara disponibilidad cuando
la RPC de disponibilidad está instalada. Una RPC/tabla ausente devuelve 503
`SUPPORT_SETUP_REQUIRED`, sin fingir recepción. El cliente continúa protegido por
su interruptor de activación hasta superar la prueba alojada con cuentas autorizadas.

El borrador completo crea cinco tablas públicas, dos privadas con RLS, quince
funciones y un bucket privado con tres políticas. No modifica registros de otros
módulos. Todos los ejecutables privilegiados tienen search_path vacío, controles
de identidad/propiedad y EXECUTE revocado a PUBLIC/anon. Los permisos authenticated
son exclusivamente las RPC y lecturas filtradas por RLS del módulo.

La purga ahora reclama el expediente bajo bloqueo de fila antes de borrar objetos.
Una reapertura concurrente queda rechazada durante la limpieza; las reclamaciones
persisten para reintentar tras fallos/reinicios. El borrado de filas exige que ya no
existan objetos. Reabrir antes de reclamar elimina el vencimiento. Las pruebas solo
borran registros sintéticos aislados.

No se ha acreditado una copia recuperable del proyecto alojado ni una restauración
de esa copia. El archivo encontrado `local-database.dump` pertenece al entorno local
de validación y no acredita respaldo de Supabase. Por ello **no se solicita aún la
ejecución de la migración**: primero obtener un respaldo autorizado y restaurarlo
en un PostgreSQL aislado. Después solicitar aprobación específica del SQL completo
con su SHA-256, revisar el resultado del preflight y ejecutar una sola transacción.
El rollback previo a datos reales solo se autorizará tras verificar que las nuevas
estructuras siguen vacías; con expedientes reales se conserva el esquema y se
revierte la versión del API, nunca se destruyen expedientes como rollback.

`scripts/run-support-retention.mjs` es el ejecutor para un programador existente.
Por defecto solo consulta capacidades; `--execute` procesa lotes acotados. Requiere
base HTTPS y una identidad vigente inyectada por un almacén de secretos autorizado,
no acepta credenciales en argumentos y no registra su valor. No se ha instalado un
programador ni una identidad renovable. No almacenar un refresh token OWNER para
resolverlo: aprobar primero una identidad limitada a retención y su mecanismo de
renovación. Abrir Archivo en ADMIN no constituye limpieza automática garantizada.

La prueba `support-persistence.test.mjs` une Express con PostgreSQL persistente y
archivos de prueba, comprueba la conversación, la separación de notas internas y
la recuperación al reiniciar. Sus adaptadores Auth/Storage son sintéticos: no
sustituye la prueba con sesiones y Storage alojados tras la activación autorizada.

`go_support_v1.sql` es un borrador ejecutable, probado en PostgreSQL aislado mediante
`tests/support-db.test.mjs`. Su presencia en MAIN no aplica cambios a producción.

El API `/api/supabase/support` reutiliza el JWT del usuario y las funciones de
Supabase. La aplicación conserva `GO_SUPPORT_LIVE_ENABLED = false` hasta que
esquema, API desplegada, permisos, almacenamiento y pruebas reales estén verificados.
Por tanto, la interfaz no anuncia una recepción que aún no existe.

## Revisión antes de activar

1. Confirmar una copia de seguridad recuperable y revisar el esquema productivo.
   El borrador presupone `auth.users`, `public.profiles`, `public.businesses`,
   `public.admin_memberships` y Storage. No modifica sus registros existentes.
2. Revisar y autorizar específicamente el SQL completo. Crea cinco tablas públicas,
   dos tablas privadas, funciones `SECURITY DEFINER` con `search_path` vacío, políticas
   RLS y el bucket privado `go-support-private`. La función
   `go_support_purge_expired` contiene `DELETE` de solicitudes, mensajes, eventos,
   adjuntos y claves de idempotencia **solo tras el plazo de 12 meses desde archivo**.
   No se debe aplicar este borrador sin autorización concreta de producción.
3. Aplicar primero en un entorno de pruebas equivalente. Comprobar lectura y
   escritura con identidades reales de prueba de USUARIO y ADMIN, aislamiento entre
   empresas, archivos privados, reintentos, concurrencia y restauración.
4. Desplegar el API y verificar `/api/supabase/support/requests`: sin sesión debe
   devolver 401, nunca 404. Activar el cliente únicamente tras comprobar el ciclo
   envío → bandeja ADMIN → respuesta → MIS SOLICITUDES con persistencia real.
5. El borrador ofrece una operación de purga segura y reintentable que borra primero
   objetos privados y después filas vencidas. Aún falta un ejecutor periódico con
   identidad de servicio restringida, gestión de secretos, observabilidad y control
   de errores. La limpieza disparada al abrir Archivo no garantiza el plazo. No
   anunciar borrado automático hasta instalar y probar ese ejecutor.

La reversión antes de recibir solicitudes consiste en retirar el API y las
estructuras nuevas tras comprobar que siguen vacías. Una vez haya datos reales,
la reversión debe preservar expedientes y archivos; no ejecutar `DROP` ni borrar
el bucket como respuesta a un fallo de despliegue.
