# GO Puente Universal V2

La cabina V2 se ofrece como entrada optativa `/v2` en el panel local y
`/remote/v2` tras Tailscale Serve. No sustituye `/` ni `/remote`, ni arranca la
fábrica. El código del repositorio no cambia por sí mismo el proceso 8765 que
está en ejecución en Windows; su despliegue requiere una transición controlada.

`orbit_v2.py` guarda únicamente la distribución y los nombres visibles en la
SQLite local del puente, bajo la identidad firmada del propietario. Las
operaciones de Fábrica y Trello siguen sujetas a las autorizaciones de V1.
Mover, añadir o quitar un acceso no ejecuta trabajos ni concede permisos.

El panel de Fábrica en V2 reutiliza la revisión de lote y el ticket de
confirmación de V1. PLAY solo presenta primero el plan, las omisiones y las
renovaciones; la ejecución requiere la confirmación expresa del propietario.
PAUSE y STOP conservan sus causas distintas y exigen confirmación. La
distribución orbital no modifica estas autorizaciones.

El módulo Expo distingue 8088 principal de 8089 fijado. Los enlaces usan las
comprobaciones actuales del puente y caducan. «Comprobar código servido» ejecuta
una comparación de solo lectura entre el bundle iOS y el commit esperado. El
resultado no equivale a una apertura física en iPhone. Si Metro no escucha,
V2 presenta el fallo; no intenta iniciar procesos Windows.

La guía del núcleo GO es local y determinista: consulta el mapa vigente, da
órbita y posición y remite a la revisión de Fábrica para operaciones con efectos. No envía
datos ni preguntas a modelos. Un copiloto conversacional con ejecución de
acciones necesitaría un contrato separado de permisos y privacidad.

La transición del proceso 8765 requiere comprobar su estado, conservar una
referencia recuperable y reiniciar únicamente el puente. V1 permanece
disponible en `/` y `/remote`.

GO móvil muestra el acceso en ADMIN → GO Puente Universal únicamente al OWNER
verificado. Antes de abrir el navegador integrado vuelve a comprobar ese permiso
con el servidor. La dirección se configura por entorno con
`EXPO_PUBLIC_GO_BRIDGE_URL=https://<equipo>.<tailnet>.ts.net/remote/v2`;
la dirección no contiene credenciales. Si falta o no coincide con HTTPS privado
de Tailscale, el acceso queda deshabilitado. El propio puente conserva su
autenticación y autorizaciones por operación. La apertura física en Expo Go
requiere confirmación del propietario.
