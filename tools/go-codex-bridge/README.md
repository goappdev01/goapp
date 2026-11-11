# GO Puente Codex — V2

Fuente versionada de la instalación existente; no es un segundo coordinador.
La instalación local conserva `config.json`, SQLite, autorizaciones, auditoría,
sesiones y credenciales DPAPI. Nunca copiar esos datos al repositorio. La copia
de ejemplo solo sirve para instalaciones explícitas y pruebas sintéticas; todos
sus agentes están desactivados. No sustituye la configuración local vigente.

## Panel privado

Ruta: `https://<equipo>.<tailnet>.ts.net/remote/`. El servidor sigue escuchando
exclusivamente en `127.0.0.1:8765`. Tailscale Serve (HTTPS, sin Funnel) es el
proxy. La cuenta autorizada se configura localmente mediante una huella HMAC
de `Tailscale-User-Login`. Se comprueban proxy de loopback, Host, HTTPS y esa
identidad en cada petición. Las mutaciones requieren además origen exacto,
cookie segura y CSRF. Las rutas locales antiguas no se abren al proxy remoto.

El estado se consulta cada cinco segundos y al recuperar primer plano. Muestra
tarjetas, fase A–D, errores y tipos de eventos reales, sin transmitir las salidas
de comandos ni conversaciones privadas. No deduce actividad del gasto de cuota.

Activar, vincular cuenta, recuperar un diagnóstico y seleccionar versión Expo
exigen revisión de la operación exacta y confirmación con un ticket de un solo
uso y tres minutos de vigencia. Activar solo admite el lote previamente firmado,
con cuenta y cuota comprobadas. Vincular otra cuenta no activa la rueda ni
repite intentos. Instalar o reiniciar siempre deja la rueda pausada.

Las preguntas llevan tarjeta, intento, huella de instrucción y operación. Las
decisiones son persistentes y no se consumen dos veces. **El ejecutor actual
`codex exec --json` no acepta respuestas en vivo**. Responder o permitir conserva
la decisión en `review_required`; no lanza otra programación automáticamente.
La continuación de esa sesión exige conciliación específica. Denegar no
concede permisos ni provoca una nueva ejecución. No se reutilizan sesiones
personales ni se conceden permisos sensibles de forma implícita.

## Continuidad por tarjeta

La autorización continua del propietario para la cola viva de Peluquerías se
guarda firmada en `wheel_live_authorization`. Registra tablero, lista origen y
destino, identidad Trello, cuenta Codex, huella de la instrucción de autorización
y las tarjetas presentes al activarla. Cada tarjeta nueva se vuelve a leer de
Trello, exige comentario del propietario y entrada verificable en la cola, y
recibe un permiso A/B/C/D firmado para su versión concreta. Los números de
agente antiguos del título no asignan el ejecutor: esta cola usa únicamente la
carpeta del Agente 4. Pausa y revocación conservan los checkpoints.

La publicación automática de esta vía limita el parche a los archivos móviles;
los cambios de API alojada, SQL e infraestructura quedan conservados para
revisión y requieren autorización y prueba adicional. 8089 continúa fijado.
El sondeo usa el bucle existente de 60 segundos. Una incidencia de tarjeta
comprobada se comenta como pendiente y se traslada arriba de COMPROBAR cuando
la escritura es verificable; un efecto externo incierto pausa la rueda.

La política `independent-v2` solo se incorpora al lote mediante la acción
explícita Activar fábrica. Las autorizaciones A–D siguen siendo individuales.
El estado de cada tarjeta se conserva independientemente del global. Una tarjeta
bloqueada o esperando respuesta deja paso a otra autorizada e independiente;
las dependencias explícitas esperan el cierre verificado de su antecedente.
Se mantiene una única ejecución por workspace y publicación serializada. Se
registra por qué se selecciona una tarjeta posterior.

Los errores de integridad, cuenta, permisos globales, publicación incierta o
pérdida de aislamiento pausan globalmente. Sin candidata segura se muestra
esperando, nunca finalizada. Las guías largas se dividen sin perder palabras ni
repetir Codex. Solo se reintentan errores HTTP temporales antes de emitir un
permiso de efecto externo, con tres intentos y esperas de 15, 30 y 45 segundos.
Los efectos inciertos siguen sujetos a conciliación, nunca a repetición ciega.

Un diagnóstico terminado sin cambios puede acreditar la inspección y conservar
la etiqueta **PENDIENTE DE COMPROBACIÓN REAL**. Se exige informe estructurado,
salidas registradas, código 0 y ausencia de cambios, infracciones y publicaciones.
Una publicación que solo añade este puente no invalida las fuentes GO
inspeccionadas; cualquier otro cambio exige revisar su vigencia. Recuperar un
diagnóstico antiguo requiere una decisión explícita vinculada al intento y no
activa la rueda. La instalación V2 no recupera el diagnóstico existente.

## Expo 8089 fijado

`owner_expo.py` administra un worktree separado, con dependencias instaladas
desde el mismo lockfile y sin scripts. Su configuración firmada vive únicamente
en `estado/owner-expo.json`. El SHA no sigue a MAIN. Se conserva el anterior
para una vuelta deliberada. No se toca Metro 8088.

La selección requiere un SHA completo ya alcanzable desde `origin/main`, un
directorio limpio y dependencias compatibles. Los cambios de lockfile o de
paquetes exigen preparar la instalación aislada antes de seleccionar. Se
detiene exclusivamente el PID registrado cuyo comando corresponde al worktree
y a `--port 8089`; no se roba un puerto ocupado. El cambio usa `git switch
--detach` sin forzar. Un fallo queda en revisión, sin descartar archivos.

La verificación compara el manifiesto SDK 58, bundle iOS y contenido del mapa
de fuentes con el SHA fijado; también comprueba Tailscale y la API protegida.
Un servidor arrancado no se etiqueta como verificado antes de esa comparación.
**8088 y 8089 comparten API, Auth y base de datos**: solo se aíslan el código,
las dependencias y Metro, no los datos alojados.

## Chat de reservas

Inspección de fuentes de la base `ba6c6307`: el móvil reutiliza `goMessages.ts` y
`booking.ts`, GET `/api/supabase/booking-conversations` y POST
`/api/supabase/bookings/:bookingId/messages`. La API existente utiliza Supabase
Auth y las RPC `go_booking_conversations` y `go_send_booking_message`. Su SQL
preparado está en `artifacts/api-server/supabase/drafts/booking_messages_v1.sql`.
No se instala SQL, cambia permisos ni activa tiempo real desde V2. Un 401
anónimo acredita protección de la ruta, no el funcionamiento del chat.
La prueba alojada de ida y vuelta requiere dos identidades de prueba autorizadas
y consentimiento específico de escritura. Sigue pendiente hasta ejecutarla.

## Pruebas y despliegue

`python -m unittest discover -s tests -v` utiliza SQLite temporal, Git bare
descartable y transportes sintéticos. No ejecuta tarjetas ni comentarios reales.
Comprobar sintaxis de `remote.js` y diferencia de fuentes antes de desplegar.

Desplegar solo fuentes sobre la instalación original, con respaldo previo de
fuentes y SQLite mediante `Connection.backup`, rueda pausada y ninguna ejecución
ni escritura incierta. El reinicio controlado existente `/api/wheel/restart`
rechaza trabajos o permisos inmediatos activos. No arrancar otro puente.
`/api/health` informa versión y huella de las fuentes cargadas al inicio; se
compara con los archivos publicados para verificar el proceso efectivo. Los
archivos de estado, configuración y credenciales permanecen fuera del despliegue.
