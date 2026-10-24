# GO Tableros V1 — DESARROLLO PENDIENTE DE CORRECCIONES

Base oficial: `e700ee80ab357546e6af7fe5c3fc8d9817f868c9`.
Copia de trabajo: la misma que alimenta GO Peluquerías · Validación, puerto 8088.
Backend y bundle iOS activados en el entorno aislado existente el 24 de octubre de 2026. El propietario ha abierto el módulo en su iPhone y autoriza guardar exactamente este estado en GitHub MAIN. Esta autorización conserva el trabajo: no implica aprobación del diseño ni finalización del módulo.

## Incidencias observadas y pendientes

- Distribución visual incorrecta y elementos superpuestos, observados en el iPhone.
- Aviso de fallo de sincronización observado en el iPhone. Las pruebas automáticas anteriores no descartan esta incidencia real; su causa no está confirmada.
- No se investigan ni corrigen estas incidencias dentro de la operación de publicación. Deben permanecer identificadas como pendientes.
- La comprobación definitiva desde el código publicado queda pendiente del propietario.

## Implementación preparada

- Entrada ADMIN: Landing → Calendario y Reservas → Tablero. Empresa/Usuario no tienen botón ni acceso al módulo.
- `lib/api-zod/src/go-boards.ts`: contrato y política V1 compartidos. Perfil explícito; una sola implementación.
- `lib/goBoards.ts`: operaciones sobre las mismas estructuras `GoEntry` de GO, columnas y posiciones.
- `lib/goBoardsStore.ts`: páginas de 30 tableros, caché por identidad, cola persistente, revisiones CAS, resolución explícita de conflictos. No hay límite comercial de diez tableros.
- `lib/goBoardsCache.ts`: dos archivos duraderos privados en iOS/Android; AsyncStorage conserva solo su puntero. Evita guardar portadas grandes en una fila de AsyncStorage. Web conserva el adaptador AsyncStorage existente.
- `components/boards`: edición de tablero/portada, archivo/recuperación, eliminación confirmada y duplicación de estructura sin tareas; columnas, tareas, notas, filtros, arrastre y alternativa táctil.
- Vistas: columnas, días, semana, mes, sin fecha. Preferencia de vista/fecha guardada en el tablero; presentación del listado por cuenta en preferencias locales.
- Tareas sin fecha ni hora por defecto; añadir/quitar fecha/hora explícitamente. Sin inventar eventos a medianoche.
- Vinculación con Calendario explícita: se proyecta el mismo identificador en `go_log_v1`, sin convertir la tarea en reserva. Las privadas permanecen fuera. Los cambios de los registros compartidos se reconcilian desde Calendario. La cola local se conserva ante fallos de red.
- Al eliminar un tablero se conserva un registro lógico no visible para mantener las tareas ya vinculadas con Calendario, también al sincronizar otro dispositivo. No se borran sus tareas compartidas por accidente. La eliminación directa de la tabla está revocada.
- Los estados usan `localResolutionStatus`, `completionKey` y el almacén de confirmaciones existente. Mover a una columna llamada Terminadas no completa la tarea.
- Las notas usan `messages` y `goId` existentes. Se reutilizan el reloj GO, cierre GO y formulario adaptado al teclado.
- `goBoardsActions.ts` prepara operaciones revisables para la IA central y exige las dos confirmaciones. No añade motor ni pantalla de IA.

## Persistencia y permisos

La API `/api/supabase/boards` usa `requireAdmin`, permiso `admin.access`, contexto ADMIN y el JWT del solicitante. No usa service-role ni roles indicados por el cliente. Los registros tienen propietario explícito y política RLS. Otro administrador no recibe acceso a esos datos.

`supabase/drafts/go_boards_v1.sql` añade únicamente `go_board_documents`, funciones de guardado/traslado y su protección. La revisión esperada evita sobrescribir otro dispositivo. El traslado entre tableros se hace dentro de una transacción. Los IDs de las tareas no cambian. No modifica reservas, profesionales, negocios ni datos previos.

Las tareas vinculadas de Tableros quedan filtradas fuera de los perfiles no habilitados. El motor compartido de tareas usa esa misma restricción para estas nuevas entradas, conservando el comportamiento anterior de las demás tareas.

### Adaptación de autorización en el entorno aislado existente

El backend 3002 de 8088 utiliza un adaptador que verifica en vivo la identidad y membresía habituales del propietario y las asocia a una identidad local. PostgreSQL aislado no tiene `public.admin_memberships`; el adaptador responde esa consulta sin una tabla local.

Tras la autorización del propietario se conserva esa verificación en vivo y el mapeo UUID ya existente. Solo las operaciones de Tableros reciben un JWT local firmado con `go_boards_scope=ADMIN`, con duración máxima de 60 segundos y limitada también por la caducidad de la sesión original. No se almacena otra contraseña ni se crea una membresía permanente.

Una vista `admin_memberships` exclusivamente local, de tipo `security_invoker`, hace visible a las políticas de Tableros ese permiso verificado. Exige el emisor local y el ámbito firmado. Las demás rutas no reciben ese ámbito; las cuentas ficticias y los demás módulos conservan sus comprobaciones anteriores. Esa vista es una adaptación de este entorno, no una migración destinada a Supabase ni a producción.

Se instaló el esquema aditivo de Tableros en `go_peluquerias_github_20261023`, puerto 65439. Se sustituyeron únicamente el adaptador local 65441, PostgREST 65440 y backend aislado 3002. PostgreSQL y los procesos de 3000, 3001, 8086 y 8087 no se reiniciaron. El adaptador admite hasta 2 MB solo en las operaciones de Tableros, para conservar portadas; mantiene el límite previo de las demás rutas.

La integración real detectó que usar `40001` para un conflicto de revisión causaba reintentos en PostgREST 14.18 y agotaba el tiempo de espera. Las funciones nuevas usan `PT409`, un conflicto de negocio inmediato. La regresión comprueba HTTP 409 y una respuesta inferior a dos segundos. Referencia oficial: https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions

Expo 8088 conserva nombre, slug y ámbito de almacenamiento del proyecto existente. Se arrancó con vigilancia de archivos, sin `CI=1` ni `EXPO_OFFLINE=1`, y con una caché separada sin borrar las anteriores. Su proxy `/api` sigue apuntando exclusivamente a 3002. El JavaScript iOS descargado devuelve HTTP 200 e incluye `GoBoardsPanel`, el almacén ADMIN y la URL de ese mismo proxy. La publicación autorizada debe conservar estos parámetros y servir el mismo árbol de código publicado, sin cambios funcionales adicionales.

La adaptación local necesaria queda conservada sin secretos en `docs/development/go-tableros-8088/`: diferencias exactas de los adaptadores existentes y SQL de la vista exclusiva de desarrollo. Son referencias de reproducción, no pasos de despliegue ni migraciones automáticas.

## Portadas

El selector Expo utiliza solo la imagen elegida, recorte 16:9 y compresión. Conserva los bytes en el documento persistente; no depende de la URI temporal del selector. Hay validación de tamaño y aviso si una imagen sigue siendo demasiado grande. Google Photos Picker no está simulado ni conectado: necesita un proyecto/API habilitada, OAuth y su flujo de selección oficial. Referencia: https://developers.google.com/photos/picker/guides/get-started-picker

## Evidencias automáticas

- Pruebas de modelo, almacén y montaje de interfaz: `tests/go-boards*.test.mjs`.
- Incluyen 50 tableros en el almacén, reapertura, varios dispositivos simulados, conflictos, cola sin conexión, cambio de identidad/perfil, notas, fechas/horas, portadas, borrado y traslado sin duplicación.
- Regresiones dirigidas de tareas, estados y GO Log: 132 pruebas correctas en `go-recovery/go-boards-targeted-20261024.tap` (evidencia externa al repositorio).
- Pruebas de rutas reales con proveedor ficticio: `api-server/tests/go-boards.test.mjs`, cuatro correctas, sin abrir otro servidor.
- SQL real probado previamente dentro de una transacción revertida: 50 tableros, revisión obsoleta, traslado, identidad estable, aislamiento entre administradores, usuario sin permiso, revocación y denegación anónima. Los usuarios y registros de esa prueba no se conservaron. Posteriormente se instaló únicamente el esquema definitivo del módulo, según la autorización de desarrollo.
- TypeScript de librería, móvil y backend superado en este estado de código; la activación posterior no modifica esos fuentes TypeScript. `git diff --check` correcto.
- Integración corregida: una prueba de ámbito firmado y revocación, una de puente de identidad con PostgreSQL/PostgREST reales y una regresión de la ruta de conflicto, todas correctas. La identidad aguas arriba de estas pruebas es simulada; no equivalen a iniciar sesión físicamente con el propietario.
- La prueba de integración guarda/reabre una portada superior al antiguo límite de 200 KB, lista tableros, rechaza revisiones obsoletas sin reintentos, traslada la misma tarea, conserva el vínculo de Calendario tras borrar el tablero y comprueba que el negocio ficticio anterior sigue accesible. Sus dos tableros transitorios se eliminan al terminar, sin alterar otros registros.
- Evidencias y respaldos del adaptador, procesos y bundle: `go-recovery/go-boards-activation-20261024`, fuera del repositorio.

## Pendiente de esta misma tarea

1. Tras guardar el estado en MAIN, comprobar su conservación en el mismo iPhone: ADMIN → Landing → Calendario y Reservas → Tablero. El propietario ya ha comprobado la apertura y ha comunicado las incidencias anteriores; el resto de comprobaciones funcionales y Android físico siguen pendientes.
2. La conexión directa con Google Photos Picker requiere configuración OAuth externa; no está operativa. La selección de fotos del dispositivo sí está implementada. No se ha instalado un simulador de Google Fotos.
3. La publicación de este estado está expresamente autorizada pese a las incidencias pendientes. Guardar únicamente este módulo en MAIN, verificar SHA remoto y sincronizar el mismo Expo 8088. No interpretar esa autorización como aprobación visual ni como permiso para corregir ahora.

El módulo continúa en desarrollo. La publicación de este avance no valida su diseño, no resuelve el aviso de sincronización y no equivale a un despliegue en producción.
