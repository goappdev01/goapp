# GO Tableros: parche local para revisión — 16/11/2026

Fase de fábrica: programación y pruebas locales. Sin publicación, commits, cambios de infraestructura ni escrituras en Trello. La aceptación física sigue pendiente de Raúl. Las pruebas usan identidades, documentos y proveedores sintéticos en memoria; no modifican datos reales.

## Auditoría previa

- Ruta activa: `app/index.tsx` monta `useGoBoards()` y `GoBoardsPanel`, desde **ADMIN → Calendario y Reservas → Tablero**. No hay referencias activas al `TablerosView` antiguo.
- Autorización: `data/adminAccess.ts` exige identidad autenticada coincidente y el contrato del servidor (`role=admin`, `allowed`, nivel `owner`/`technical`, permiso `admin.access`). `GoAdminAccessContext` invalida privilegios al cambiar sesión o estado de la aplicación; no persiste permisos. La selección visual ADMIN es una condición adicional, nunca la fuente del permiso.
- Servidor existente: `requireAdmin` verifica JWT en `/auth/v1/user` y membresía activa en `admin_memberships`; `requireAdminPermission("admin.access")` protege todas las rutas de Tableros. Las operaciones exigen contexto ADMIN y propietario. No se ha modificado API, RLS, SQL, roles ni permisos.
- Causa confirmada en código: el panel sustituía todos los editores y tableros por un aviso si `remoteReady=false`; la carga del hook podía interrumpirse antes de listar la caché. La cola del almacén incluía esperas de red, bloqueando también operaciones locales.
- Almacenamiento actual: `go_boards_v1:ADMIN:<UUID>`, con caché y pendientes. En iOS/Android el adaptador existente usa dos archivos y un puntero confirmado después de escribir. Se conserva ese formato y adaptador.
- Almacenamiento antiguo: `components/TablerosScreen.tsx`, clave `go_tableros_v1`, sin propietario en su esquema. Se detecta únicamente su existencia y se informa sin adoptar registros ni cambiar el valor. No es seguro adjudicarlo automáticamente al ADMIN que entre.

## Matriz de funciones

| Función | Antes del parche | Resultado local / pendiente |
| --- | --- | --- |
| Crear, abrir, renombrar tableros | Existente; interfaz bloqueada por API | Disponible con autorización ADMIN y caché legible, aunque falle la API de Tableros |
| 50 tableros, búsqueda y paginación | Existente en remoto; caché parcialmente visible | 50 sintéticos también con API ausente; búsqueda, archivo y orden locales; paginación remota usa su propio desplazamiento |
| Duplicar estructura, portada | Existente | Reutilizado; copia sin duplicar tareas; portada guarda bytes de la imagen elegida |
| Archivo y recuperación | Existente | Guardado local durable, visible mediante filtros Activos/Archivados/Todos |
| Eliminación confirmada | Solo remota | Confirmación existente y tombstone local durable; guarda contenido pendiente antes de usar DELETE remoto con revisión; conserva tareas vinculadas |
| Columnas, fichas, notas, fechas opcionales | Existente | Reutilizado; captura de tarea con título y Guardar tarea arriba; resto en Más opciones |
| Arrastre y alternativa táctil | Arrastre y cambio de columna por toque | Conservados; se añaden controles táctiles de orden de tablero, columna y tarea |
| Columnas / Días / Semana / Mes / Sin fecha | Existente | Reutilizado; fechas y horas siguen optativas; mover no completa automáticamente la tarea |
| Calendario único y privacidad | Proyección existente, carga dependiente del remoto | Misma entidad e ID; fallo al leer Calendario no oculta el tablero; una proyección antigua no sustituye cambios locales pendientes al reiniciar |
| Guardado local / sincronizado | Confundidos en el bloqueo visual | Estado pequeño; guardado confirmado después de escritura durable; error de disco visible sin confirmar el cambio |
| Reconexión y conflictos | CAS y decisión explícita parciales | Peticiones fuera de la cola local; reintento manual, al volver a primer plano y cada 20 s en primer plano; conflictos durables y revisión de contenido local/remoto/base, con checkpoints conservados |
| Sesión caducada / rol revocado / cambio de cuenta | Comprobación existente | Conservada; denegación explícita de sesión/membresía dispara revalidación y bloquea operaciones; almacenes antiguos quedan invalidados incluso al volver a la misma cuenta |
| Traslado entre tableros | Transacción de servidor existente | Se conserva exclusivamente esa transacción; exige conexión y ambos tableros sincronizados. No bloquea edición dentro del tablero |
| Copia antigua y recuperación | Datos sin identidad | Valor intacto y aviso informativo; recuperación por propietario e identidad requiere revisión separada; sin migración automática |
| Adjuntos arbitrarios / exportación y restauración desde interfaz | Ausentes | No se construyen; portadas existentes y checkpoints internos conservados |
| Alertas, importaciones, OAuth, IA externa, Codex | Etapas separadas | Sin cambios; no se activan ni simulan |
| Ergonomía y persistencia física iPhone | Fallos comunicados por propietario | Eliminado bloqueo visual, aviso duplicado y reintento redundante; límites de encabezado/avisos y controles en flujo. Validación visual y de gestos físicos pendiente |

## Integridad y recuperación técnica

La hidratación valida documentos, propietario, IDs, bases y cola antes de exponerlos. Si la lectura falla, no se sobrescribe el valor con una caché vacía. Cada edición prepara una nueva caché/cola, la persiste y solo entonces publica el cambio. Un fallo de disco conserva la última copia confirmada; una respuesta remota posterior no borra el aviso del cambio local fallido.

Las respuestas de guardado conservan el ID y deben confirmar la revisión esperada. Si se edita durante una petición, se conserva la edición posterior y se actualiza su revisión base al recibir la confirmación. Una respuesta perdida puede generar un conflicto revisable; no crea otro ID ni fuerza una sobrescritura.

Los conflictos quedan en la misma cola durable y no se reintentan automáticamente. La pantalla muestra nombre, descripción, portada, columnas, tareas, estado, fecha y notas de las versiones local, remota y base. La decisión conserva las tres en `checkpoints` dentro del mismo documento privado. Si alguna copia cambia después de mostrar la revisión, la elección se rechaza y exige revisar de nuevo.

Para una recuperación técnica posterior se deben conservar el puntero y ambos archivos de `go-boards/`, además del valor antiguo `go_tableros_v1`, antes de cualquier reparación. Los checkpoints contienen documentos completos, no solo resúmenes. No hay todavía un control de exportación/restauración ni un flujo seguro para atribuir el almacenamiento heredado: hace falta verificar la identidad antes de restaurarlo. No reinstalar, limpiar almacenamiento ni asignarlo a otra cuenta como reparación automática.

## Límites reales

- El modo local requiere autorización ADMIN efectiva del mecanismo existente. Una caída de la API de Tableros o de su esquema no impide editar. Una caída completa que impida verificar ADMIN al iniciar/reanudar sí mantiene el acceso denegado, conservando los datos. No se ha creado una concesión ADMIN offline.
- Las pruebas de reconexión, conflicto y varias identidades usan proveedores simulados. No acreditan sincronización real con el backend del propietario.
- El traslado entre tableros requiere la operación remota atómica. Al perder la respuesta se debe reconsultar antes de interpretar el resultado; no se inventa un traslado local alternativo.
- No se han obtenido capturas físicas ni abierto un iPhone. No se declara resuelta la superposición visual observada hasta que Raúl pruebe el parche. La guía física está en la entrega de fábrica.
- La lista de 50 tableros se prueba con datos sintéticos en memoria y no acredita rendimiento físico ni persistencia real en el sistema de archivos de un iPhone.

## Archivos del parche

1. `lib/goBoardsStore.ts`: hidratación, cola local separada, escrituras confirmadas, listado local, borrado pendiente, protección de revisiones y checkpoints.
2. `hooks/useGoBoards.ts`: hidratación independiente de Calendario/API, reintentos, aislamiento de instancias y revalidación por denegación de identidad/rol.
3. `components/boards/GoBoardsPanel.tsx`: interfaz local, estado compacto, captura rápida, revisión de conflictos y controles táctiles.
4. `tests/go-boards.test.mjs`: modelo, integridad, persistencia simulada, 50 tableros offline, concurrencia y conflictos.
5. `tests/go-boards-ui.test.mjs`: montaje real de componentes, creación local completa, estados de error y revisión de conflictos.
6. `tests/go-boards-hook.test.mjs`: hook real, fallo de Calendario/API, permisos, cuentas y StrictMode de desarrollo.
7. Este informe.

## Comprobaciones locales observadas

- 46 pruebas enfocadas del módulo: `pnpm --dir artifacts/go-app-mobile exec node --test --test-reporter=spec tests/go-boards.test.mjs tests/go-boards-ui.test.mjs tests/go-boards-hook.test.mjs`.
- 135 pruebas móviles correctas en la ejecución final: las 46 del módulo y 89 regresiones dirigidas de autorización, GO Log, navegación de Calendario/Reservas, creación y presentación de tareas. Comando: `pnpm --dir artifacts/go-app-mobile exec node --test --test-reporter=spec tests/go-boards.test.mjs tests/go-boards-ui.test.mjs tests/go-boards-hook.test.mjs tests/admin-access.test.mjs tests/go-log-sync.test.mjs tests/calendar-navigation.test.mjs tests/task-creation.test.mjs tests/tasks-visual.test.mjs`.
- 4 pruebas de las rutas existentes correctas, con proveedor simulado: `pnpm --dir artifacts/api-server exec node --test tests/go-boards.test.mjs`.
- TypeScript móvil superado: `pnpm --dir artifacts/go-app-mobile exec tsc -p tsconfig.json --noEmit`.
- `git diff --check` correcto. Git informa únicamente de normalización futura LF/CRLF en `goBoardsStore.ts`, sin errores de espacios.

No se ejecutaron suites generales ni pruebas SQL, ni se modificaron procesos Metro. Publicación y verificación física pendientes de sus fases correspondientes.
