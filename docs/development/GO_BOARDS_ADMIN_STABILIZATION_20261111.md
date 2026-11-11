# GO Tableros: estabilización ADMIN del piloto

Tarjeta de origen: `V1 — SIGUIENTE PROMPT — GO TABLEROS: CORREGIR VISUAL, SINCRONIZACIÓN Y VALIDAR V1` (`jg1kkRCm`). Esta rama parte de `origin/main` en `ca46845aefc844e28bad1a56cb990352a4037502`. La regla transversal del 11/11/2026 limita las funciones nuevas de esta entrega a ADMIN autorizado; no cambia funciones V1 ya aprobadas.

## Cambios seguros realizados

- La cabecera de GO Tableros deja espacio al título largo y a los controles de navegación en un iPhone compacto.
- La fila horizontal de acciones deja de tener una altura máxima inferior a la necesaria para sus botones táctiles y márgenes.
- El panel ADMIN mantiene las acciones de tablero deshabilitadas hasta que las consultas de lista y calendario confirmen el esquema remoto y sus RPC; la copia local pendiente se conserva y se ofrece reintentar.
- No se cambian datos, importaciones, navegación, contratos, permisos ni la lógica de sincronización. La importación pertenece a otra tarjeta.

## Autorización existente comprobada

El acceso móvil usa `useAdminAccess` y `canUseGoBoards`, con identidad y membresía verificadas por el servidor. Las rutas `/api/supabase/boards` requieren JWT válido, contexto ADMIN y permiso `admin.access`. El documento usa un propietario y la política SQL preparada limita las filas al usuario ADMIN autorizado. La etiqueta visual ADMIN no concede acceso. Las pruebas existentes cubren la denegación a perfiles EMPRESA y USUARIO, contexto incorrecto y cambios de identidad.

## Bloqueo de sincronización alojada

En el proyecto Supabase alojado `xiyxziyjpgnqfecbhmqn` se comprobó **solo lectura** que existe `public.admin_memberships`, pero no existen `public.go_board_documents`, `public.go_board_save(jsonb,integer)` ni `public.go_board_calendar(integer)`. Por ello no se puede validar allí una escritura y lectura persistentes de GO Tableros, ni presentarlas como operativas. No se ejecutó SQL productivo ni se cambió ningún permiso.

El borrador existente `artifacts/api-server/supabase/drafts/go_boards_v1.sql` tiene SHA-256 `2492F3EB62F37B72C28E404A20DF58A88F34142BC9018F568E2C53A4DDD38780`. Su encabezado limita expresamente su aplicación a la base aislada de desarrollo y exige autorización productiva revisada. Antes de cualquier activación alojada hacen falta respaldo recuperable, revisión de RLS/RPC/roles y autorización específica para esa operación. Esta rama no habilita la función empresarial ni aplica ese borrador.

## Verificación realizada y pendiente

- Móvil: 26 pruebas dirigidas de GO Tableros tras añadir la protección de disponibilidad; servidor API: 4/4.
- TypeScript móvil y `git diff --check`: correctos.
- La mejora de disposición sigue pendiente de comprobación física en iPhone. No se ha demostrado sincronización alojada ni persistencia entre dispositivos.
- El ajuste visual y la barrera de disponibilidad son independientes del DDL y pueden publicarse en MAIN. El CRUD sincronizado sigue deshabilitado hasta activar el esquema alojado y verificar persistencia entre sesiones. La validación física en iPhone y la sincronización real quedan pendientes. No se modificó Trello.
