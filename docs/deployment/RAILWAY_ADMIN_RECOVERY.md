# Recuperación mínima de ADMIN en el backend antiguo

## Cierre de preparación: SHA fijado y evidencias adicionales

Base de main comprobada al actualizar esta evidencia: `06404e0798b59d0d274fbe1fa4f097844367e230`, sin cambios remotos posteriores en esa consulta. La fuente mínima de recuperación queda fijada en el commit local `153712e652ff1bbb7d9377a2d7ded08842a43bea`, rama `recovery/admin-minimal-fff549c8`, árbol `635e7f4ce51ab79884e00c69f64d0bf09f7a139b`. Su padre es exactamente `fff549c8c297e868a8e69573c31a1198a91c74e5` y sus únicas diferencias son los cuatro archivos del parche probado. No está publicado ni desplegado. Este SHA identifica fuente; no es un digest de imagen Docker.

### Evidencia autenticada de Railway aportada por el propietario

| Campo | Valor |
| --- | --- |
| Proyecto | 445d60bc-6fb5-40bc-b4f8-29430f6cd1e1 |
| Servicio goapp-api | 44e20add-e37d-47f7-a8fa-d3e6b24dd29a |
| Entorno production | 644a9c13-0120-42f3-9a17-195c64df7912 |
| Deployment activo / referencia de rollback | def035d3-bf7a-4c7f-84bd-30b9894684f0 |
| Commit desplegado | fff549c8c297e868a8e69573c31a1198a91c74e5 |
| Estado | SUCCESS |
| canRollback | true |
| Snapshot | 2f96d287-f056-4246-929f-77cae5ed8eb8 |

Estos datos proceden de la consulta directa al conector autenticado realizada y comunicada por el propietario; no de inferir una rama ni de una consulta nueva desde esta sesión. Identifican una referencia elegible de reversión. `canRollback=true` no demuestra una reversión ensayada y no garantiza que la elegibilidad no cambie: comprobarla de nuevo inmediatamente antes de un despliegue autorizado. No se ha llamado a rollback ni se ha restaurado el snapshot.

El propietario aporta comprobación directa de Supabase: proyecto xiyxziyjpgnqfecbhmqn, admin_memberships con user_id UUID, level text, permissions text[], active boolean; una sola membresía activa owner con permissions vacío; política admin_read_own_membership para authenticated con user_id=auth.uid(). Se acepta esta evidencia aportada; elimina la duda sobre esos campos/política y la compatibilidad de un owner con array vacío. No se ha hecho ninguna modificación de la membresía. Falta acreditar con una petición legítima la correspondencia entre el UUID de la sesión actual y ese owner, además de la lectura efectiva bajo sus grants. El middleware valida /auth/v1/user, filtra admin_memberships por ese mismo UUID y comprueba la igualdad del UUID de la fila; el móvil exige que la respuesta autorice su identidad aún vigente. No interviene el correo.

Los controles seguros para esa correspondencia son una consulta autenticada del candidato desde la sesión existente del propietario (por ejemplo en un entorno de ensayo autorizado) o metadatos autorizados que permitan contrastar la identidad sin exportar tokens. No se extraerán credenciales del navegador, dispositivo ni logs. No se ha probado todavía autenticación real.

Persisten dos verificaciones: (1) build Docker limpio con lockfile histórico e identificación de la imagen resultante; (2) consulta autenticada efectiva del owner. En esta sesión no hay Docker/Podman en PATH, ejecutables Docker en las ubicaciones habituales ni servicio Docker; no se ha instalado software ni usado Railway como sustituto para construir/desplegar. Tampoco hay conectores de Railway/Supabase habilitados aquí, ni acceso a una sesión legítima del propietario para realizar la consulta autenticada sin exportar credenciales. La evidencia autenticada aportada resuelve la identificación del deployment anterior, aunque no habilita por sí sola herramientas en este entorno. Los tests y el build local previamente superados no se repiten porque el parche no cambia.

No se solicita aún autorización de despliegue: primero cerrar el build Docker y el contrato autenticado del owner; después presentar una sola aprobación para desplegar exclusivamente la fuente 153712e652ff1bbb7d9377a2d7ded08842a43bea con el digest de imagen verificado. El retorno queda referido a def035d3-bf7a-4c7f-84bd-30b9894684f0 y su snapshot identificado, sin revertir ni modificar Supabase. El resto del documento conserva el historial de preparación; los puntos anteriores actualizan sus condiciones pendientes.

## Evidencia y alcance

Base desplegada indicada por el propietario: `fff549c8c297e868a8e69573c31a1198a91c74e5`. Su árbol Git contiene `app.use('/api', router)`, pero no contiene `src/routes/admin.ts` ni importa/monta ese router en `src/routes/index.ts`. Por tanto, ese código no puede responder al GET que necesita el móvil. Las consultas públicas actuales devuelven salud 200, ADMIN 404 y gestión sin token 401. No es una divergencia del prefijo del móvil.

El SHA de Railway y su deployment ID se aceptan de la evidencia autenticada aportada en la tabla anterior, no de su rama configurada. Esa identificación ya no se considera un bloqueo pendiente.

Main revisado: `7762ca2cc325c3bf9cbd42228b729bd2afad6eb5`, ya contiene la ruta y el control ADMIN completo. No se debe sustituir main por el backend antiguo. La recuperación propuesta es un artefacto separado de compatibilidad que añade únicamente GET ADMIN al backend desplegado, mientras main conserva todas las funcionalidades actuales.

## Fuente exacta de la recuperación

- Base fija: `fff549c8c297e868a8e69573c31a1198a91c74e5`.
- Parche: `admin-recovery-fff549c8.patch` de este directorio.
- SHA256 del parche: `275b03f2d05963f9b80032697f67e93352c5f3e9a0199b78d33110b4e20e045c`.
- Cuatro archivos, 82 líneas añadidas: registro del router, GET /access, requireAdmin y adminPermissions. Los dos últimos se copian sin cambios del main revisado.
- Supabase client, rutas existentes de autenticación, Empresa y reservas, Dockerfile y lockfile de la base se conservan. No hay SQL ni nuevas dependencias runtime.
- El router de recuperación no incorpora operaciones para crear/cambiar membresías, finanzas, fases, huecos o catálogo avanzado. Su alcance no resuelve la compatibilidad de los flujos avanzados del móvil con el backend antiguo.

El script `artifacts/api-server/scripts/prepare-admin-recovery.mjs` reproduce el snapshot y el parche exclusivamente en una carpeta temporal. Comprueba que solo cambian esos cuatro archivos, aplica y revierte el parche, genera declaraciones de dependencias, ejecuta TypeScript, compila el backend completo y arranca su dist temporal en un puerto libre. Utiliza dependencias ya instaladas; no instala, no despliega ni llama a bases reales. Devuelve las rutas del snapshot y del parche. Sus temporales se conservan para inspección.

## Pruebas y límites

Superados en el snapshot parcheado: aplicación/reversión del parche; TypeScript; build de producción con el build.mjs original; arranque del dist completo; salud 200; ADMIN sin token 401; gestión empresarial sin token 401. El proceso temporal se cierra al terminar. No se altera Metro 8088.

Además pasaron las seis pruebas dirigidas existentes de ADMIN, acceso empresarial e integración del main revisado. Cubren OWNER, revocación, usuario normal sin membresía, identidad del servidor, JWT caducado/rechazado, 401/403 y fallos del proveedor. Estas pruebas usan respuestas sintéticas del proveedor, no credenciales ni cuentas reales. No prueban un inicio de sesión real ni el esquema remoto.

El control añadido valida el bearer mediante Supabase Auth y luego lee admin_memberships con el JWT original y el mismo UUID. No usa correo, profiles.role, metadatos editables, service_role ni excepciones para el propietario. Requiere active=true, level válido y permissions con formato válido. Devuelve el contrato esperado por el móvil: userId, role=admin, allowed, level y permissions; no persiste privilegios en el teléfono.

## Compatibilidad Supabase pendiente de verificar

El propietario confirma membresía activa OWNER. Falta verificar mediante acceso autorizado de lectura: proyecto `xiyxziyjpgnqfecbhmqn`, coincidencia del UUID autenticado, columnas user_id/level/permissions/active, level almacenado como `owner`, permissions como array permitido y SELECT propio autorizado por RLS/grants con el JWT del usuario. La existencia de una fila no acredita por sí sola su visibilidad vía PostgREST.

No hacen falta nuevas RPC de fases/huecos ni migraciones para el código añadido. Si faltan columnas o permisos del contrato ADMIN, detener la publicación y solicitar una revisión independiente; no cambiar la base ni flexibilizar el middleware. No existe todavía evidencia suficiente para declarar compatible la base actual o superada la autenticación real. No se ha realizado un build Docker limpio con el lockfile histórico; el build local usa las dependencias instaladas, con las mismas declaraciones runtime del API.

## Despliegue propuesto, pendiente de autorización

1. Usar los IDs verificados de la tabla anterior y revalidar que el rollback sigue disponible antes de actuar. Confirmar directorio de build, Dockerfile/comando y dominio; verificar el contrato autenticado del owner sin exportar secretos. Conservar la referencia al deployment y snapshot anteriores.
2. Reproducir el snapshot fijo con el script y contrastar el hash del parche. Producir un artefacto/commit de recuperación identificable desde la base fija más ese parche; no usar main entero para este despliegue mínimo. No se ha creado ni publicado una rama release remota.
3. Validar un build limpio con el lockfile de la base. Cualquier despliegue de ensayo también requiere autorización. Una comprobación autenticada debe usar la sesión legítima del propietario, sin registrar ni pedir que pegue su contraseña o tokens. Hasta entonces, la prueba de OWNER real permanece pendiente.
4. Cuando esos requisitos estén satisfechos, presentar una única solicitud de autorización indicando artefacto/SHA definitivo, servicio goapp-api, production y rollback ID. No se solicita aún esa aprobación porque faltan verificaciones externas.
5. Tras autorización, cambiar solo el artefacto del API, conservando configuración y base. No ejecutar SQL ni conceder permisos. Verificar salud 200, ADMIN/gestión sin token 401; sesión expirada 401; usuario sin membresía 403; owner legítimo 200 con su UUID. No crear usuarios o empresas como parte de este smoke.
6. Comprobar desde Expo por el puente existente la entrada ADMIN y selección de contexto; las reservas avanzadas no se declaran habilitadas por este parche. La creación de empresas u otras escrituras reales requieren la acción expresa del propietario o autorización específica.

## Reversión

Si falla el smoke tras un despliegue autorizado, usar la reversión de Railway hacia el deployment def035d3-bf7a-4c7f-84bd-30b9894684f0, snapshot 2f96d287-f056-4246-929f-77cae5ed8eb8, en el mismo servicio/entorno, previa comprobación de elegibilidad. No tocar Supabase. No reconstruir un supuesto rollback a partir de la rama actual. Confirmar salud y protección de gestión empresarial; ADMIN volverá a 404 si así se comportaba el artefacto anterior. No borrar ni deshacer datos. La aplicación/reversión del parche fuente se ha probado localmente; el rollback de Railway no se ha ejecutado ni ensayado con acceso real.

Producción no se ha modificado. Solo se han hecho consultas HTTP GET públicas y pruebas locales. El documento previo AGENT6_RAILWAY_BACKEND_RELEASE_REVIEW.md y los commits del Agente 6 se conservan.
