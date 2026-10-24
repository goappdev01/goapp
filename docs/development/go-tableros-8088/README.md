# Adaptación local existente de GO Tableros

Estos archivos conservan exactamente la adaptación activada en el entorno aislado 8088. No se ejecutan al arrancar GO ni al publicar MAIN.

- `identity-bridge.patch`: cambio sobre el puente de identidad habitual ya existente. Añade el ámbito firmado `go_boards_scope=ADMIN` solo a las cinco rutas de datos de Tableros y después de verificar identidad y permiso `admin.access`. No cambia cuentas, contraseñas ni otros permisos.
- `provider.patch`: cambio del proveedor local de datos existente. Mantiene su límite de lectura de 200.000 bytes y admite 2 MB únicamente en las rutas de Tableros.
- `isolated-board-membership.sql`: vista local de autorización que consume ese ámbito firmado. Su guarda exige la base de desarrollo existente, la interfaz loopback y el puerto PostgreSQL 65439; se niega a sustituir una relación de membresías ya existente. Nunca aplicar a Supabase alojado ni a producción.

El esquema del módulo está en `artifacts/api-server/supabase/drafts/go_boards_v1.sql`. La instalación de desarrollo ya fue autorizada y realizada. La publicación del código no autoriza ejecutar SQL en otro entorno.

El recorrido existente permanece: Expo 8088 `/api` → backend loopback 3002 → puente de identidad loopback 65441 → PostgREST loopback 65440 → PostgreSQL aislado 65439. La identidad y membresía habituales se verifican mediante el proveedor previo; los datos de Tableros permanecen en PostgreSQL aislado. No se envían operaciones de prueba a la base real.

Parámetros de Expo conservados: nombre `GO Peluquerías · Validación`, slug `go-peluquerias-github-aa5c137-20261023`, SDK 57, host privado `100.105.48.111`, puerto 8088 y API `http://100.105.48.111:8088/api`. La vigilancia de archivos está activa, con `CI` y `EXPO_OFFLINE` sin definir. Las credenciales y la configuración privada previa permanecen fuera del repositorio.

Los parches son diferencias contra los adaptadores conservados antes de esta tarea; no sustituyen el proveedor habitual por otro sistema de autenticación. Los archivos completos y sus respaldos siguen conservados en el entorno local. Los registros, claves, contraseñas, configuraciones privadas y compilados no forman parte de esta entrega.

Estado: **DESARROLLO PENDIENTE DE CORRECCIONES**. El propietario ha observado superposiciones visuales y un aviso de fallo de sincronización; quedan pendientes sin modificarse durante esta publicación.
