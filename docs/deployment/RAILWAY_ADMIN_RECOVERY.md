# Recuperación mínima de ADMIN en el backend antiguo

## Evidencia y alcance

Base desplegada indicada por el propietario: `fff549c8c297e868a8e69573c31a1198a91c74e5`. Su árbol Git contiene `app.use('/api', router)`, pero no contiene `src/routes/admin.ts` ni importa/monta ese router en `src/routes/index.ts`. Por tanto, ese código no puede responder al GET que necesita el móvil. Las consultas públicas actuales devuelven salud 200, ADMIN 404 y gestión sin token 401. No es una divergencia del prefijo del móvil.

El SHA de Railway se toma del dato confirmado por el propietario, no de su rama configurada. La sesión actual no dispone de metadatos autenticados del servicio para acreditar de nuevo deployment ID, SHA y artefacto en ejecución. Esa comprobación sigue siendo una condición previa.

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

1. Obtener acceso de lectura a Railway y Supabase; confirmar deployment real, directorio de build, Dockerfile/comando, dominio y contrato ADMIN anterior. Guardar deployment ID y artefacto de rollback, sin exportar secretos.
2. Reproducir el snapshot fijo con el script y contrastar el hash del parche. Producir un artefacto/commit de recuperación identificable desde la base fija más ese parche; no usar main entero para este despliegue mínimo. No se ha creado ni publicado una rama release remota.
3. Validar un build limpio con el lockfile de la base. Cualquier despliegue de ensayo también requiere autorización. Una comprobación autenticada debe usar la sesión legítima del propietario, sin registrar ni pedir que pegue su contraseña o tokens. Hasta entonces, la prueba de OWNER real permanece pendiente.
4. Cuando esos requisitos estén satisfechos, presentar una única solicitud de autorización indicando artefacto/SHA definitivo, servicio goapp-api, production y rollback ID. No se solicita aún esa aprobación porque faltan verificaciones externas.
5. Tras autorización, cambiar solo el artefacto del API, conservando configuración y base. No ejecutar SQL ni conceder permisos. Verificar salud 200, ADMIN/gestión sin token 401; sesión expirada 401; usuario sin membresía 403; owner legítimo 200 con su UUID. No crear usuarios o empresas como parte de este smoke.
6. Comprobar desde Expo por el puente existente la entrada ADMIN y selección de contexto; las reservas avanzadas no se declaran habilitadas por este parche. La creación de empresas u otras escrituras reales requieren la acción expresa del propietario o autorización específica.

## Reversión

Si falla el smoke, restaurar el deployment ID/artefacto previo capturado en el paso 1, sin tocar Supabase. No reconstruir un supuesto rollback a partir de la rama actual. Confirmar salud y protección de gestión empresarial; ADMIN volverá a 404 si así se comportaba el artefacto anterior. No borrar ni deshacer datos. La aplicación/reversión del parche fuente se ha probado localmente; el rollback de Railway no se ha ejecutado ni ensayado con acceso real.

Producción no se ha modificado. Solo se han hecho consultas HTTP GET públicas y pruebas locales. El documento previo AGENT6_RAILWAY_BACKEND_RELEASE_REVIEW.md y los commits del Agente 6 se conservan.
