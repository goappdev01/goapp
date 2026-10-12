# GO V1 — Incidencia 13: micrófono GO

Continuación de `24328e1`, rama `integration/go-v1-calendario-ia-landing`.
No se modifican Landing, Calendario, reservas manuales, autenticación, las cinco acciones ni el diseño del botón GO.

## Causa comprobada en código

El botón tenía conectado `onPress` a `voice.start()`/`voice.stop()`.
La grabación no era solo visual: ya usaba `expo-audio`, preparación nativa, grabación y archivo temporal.
El inicio solicitaba permiso iOS, pero después esperaba `/capabilities` y una sesión antes de activar el grabador.
Por ello un permiso concedido no bastaba: un backend sin configurar, inaccesible o sin transcripción impedía llegar a `recorder.record()`.
Además, abrir la pantalla activaba ese flujo automáticamente, antes de pulsar GO.
La configuración de backend pendiente está documentada en el informe de las incidencias 11 y 12.
Esta es una causa reproducida con pruebas del flujo existente; no se ha instrumentado el iPhone del usuario para afirmar que fuera su único fallo.

## Corrección

- Abrir la pantalla hidrata la conversación y consulta capacidades de IA, sin pedir ni activar el micrófono automáticamente.
- Pulsar GO solicita/verifica el permiso; solo `granted` permite preparar y activar el grabador nativo.
- Se comprueban `recorder.isRecording` y `getStatus().isRecording` antes de mostrar escucha.
- Se conserva el estado visual ya existente: botón activo, icono de parar y texto «GO está escuchando… Toca GO para terminar».
- La indicación de voz y sus errores tienen prioridad sobre avisos anteriores de conversación, también en Zona.
- Una segunda pulsación detiene la captura, desactiva el modo de grabación y comprueba que existe audio no vacío.
- Solo después se consultan capacidades y sesión antes de enviar el audio al endpoint de transcripción existente.
- Si la transcripción devuelve texto válido, se utiliza el mismo callback y flujo de conversación o búsqueda de Zona. No se genera texto sustituto.
- Si falta backend, sesión o transcripción, se informa de que la captura se hizo pero no se pudo procesar. Eso no afirma que se haya reconocido voz ni creado una acción.
- Grabación fallida, archivo vacío, fallo de lectura/transcripción e interrupción muestran mensajes públicos comprensibles. No se exponen excepciones técnicas.
- Los eventos nativos de interrupción apagan el estado de escucha; los eventos asociados al archivo anterior no cancelan una nueva captura.
- Permanecen la cola del grabador, cancelación por generación, parada al salir/background, límite de 60 segundos y límite de 5 MB.
- Los archivos temporales se eliminan al finalizar o cancelar; no se crea almacenamiento de audio paralelo.

Los logs internos usan `console.info` con códigos y etapa, sin URI, audio, transcripción, usuario ni credenciales.
`PERMISSION_GRANTED`, `PERMISSION_DENIED` y `CAPTURE_STARTED` permiten comprobar en Metro si el permiso llegó y el grabador se activó. No aparecen como paneles del chat.

## Compatibilidad revisada

El proyecto instala Expo `57.0.26` y `expo-audio` `57.0.5`.
El manifiesto instalado `expo/bundledNativeModules.json` exige `~57.0.5`, compatible con la versión presente.
La [documentación oficial de Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/) incluye la librería en Expo Go y recomienda esa versión.
Se revisaron los tipos instalados y la implementación iOS: preparación, `record`, `isRecording`, `getStatus` y callback de estado existen en esta versión.
La configuración del proyecto ya incluye `expo-audio` y permiso de micrófono; no se cambió ni se instalaron dependencias.
No se conoce la versión exacta de Expo Go instalada en el iPhone; debe admitir el SDK del proyecto.

## Pruebas

102 pruebas relevantes: voz nativa/web, permiso denegado/concedido/cancelado, captura independiente del backend/sesión, doble parada sin duplicados, archivo vacío, fallo nativo, transcripción fallida, interrupción, evento tardío, inicio solo al pulsar GO y regresiones de las incidencias anteriores.
Suites: `booking-assistant`, `assistant-location`, `assistant-floating-close`, `task-creation`, `go-log-sync`, `calendar-container-ux`, `integration-v1`.
Typecheck móvil y `git diff --check` antes del commit local.
Las pruebas utilizan mocks del hardware; no se afirma haber grabado audio real en iPhone.

## Validación física pendiente

1. Abrir IA: no debe comenzar la grabación hasta tocar GO.
2. Tocar GO con el permiso concedido: comprobar indicador de iOS, estado activo del botón y texto de escucha; hablar y volver a tocar para detener.
3. Con el backend inaccesible, la captura debe seguir funcionando; al finalizar debe explicar que no pudo procesarse, sin texto conversacional inventado.
4. Con backend accesible, sesión y transcripción habilitada, verificar que la frase real llega una sola vez al chat y que en Zona llega al buscador existente.
5. Denegar permiso, interrumpir mediante background/llamada y cerrar/reabrir: no deben quedar grabaciones ni indicadores activos.

Sigue pendiente la URL correcta del backend de desarrollo y la disponibilidad de `/capabilities` y `/transcribe`, con credenciales únicamente en servidor. No se desplegó ni se afirmó que ese servicio estuviera operativo.
La captura local puede verificarse independientemente: estado nativo activo y archivo no vacío antes de cualquier petición de transcripción.

## Archivos

- `artifacts/go-app-mobile/hooks/useBookingVoice.ts`.
- `artifacts/go-app-mobile/components/booking-assistant/BookingAssistantScreen.tsx`.
- `artifacts/go-app-mobile/components/booking-assistant/BookingAssistantPanels.tsx` (prioridad del estado de voz).
- `artifacts/go-app-mobile/tests/booking-assistant.test.mjs`.
- `artifacts/go-app-mobile/tests/assistant-location.test.mjs`.
- Este informe y nota en el informe de las incidencias 11 y 12.

Se conservan los cambios ajenos previos en `expo-env.d.ts` y `docs/GO_V1_INTEGRACION_PROMPT_3.md` sin incorporarlos al commit. Sin push, merge, despliegue ni subagentes.