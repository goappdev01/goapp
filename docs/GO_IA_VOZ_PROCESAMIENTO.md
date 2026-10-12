# GO V1: reparación del procesamiento de voz

## Causa reproducida

`assistantApi` utilizaba `AbortSignal.timeout(35000)`. El React Native 0.86.3 instalado inicializa `AbortSignal` mediante `abort-controller` 3.0.0; ese módulo no contiene el método estático `timeout`.

La excepción se producía al construir la primera solicitud `/booking-assistant/capabilities`, antes de llamar a `fetch`. `useBookingVoice` ya había detenido la grabación y comprobado la existencia y tamaño del archivo; su captura del error mostraba «Tu voz se ha grabado, pero no he podido procesarla ahora».

La prueba de regresión usa el módulo real que React Native instala como polyfill. Antes de la reparación falla con `AbortSignal.timeout is not a function`; después alcanza el servidor simulado. Este resultado acredita el defecto de código; todavía no sustituye a una prueba del bundle reparado en iPhone.

## Cambio

- Se mantiene `assistantApi` y el circuito existente: grabador -> archivo temporal -> capacidades y sesión -> transcripción del backend -> callback del chat -> interpretación existente.
- Se reutiliza el patrón de `AbortController` y temporizador de `registrationReturn.ts`. El temporizador se libera también cuando fallan la solicitud o la lectura de la respuesta.
- Se conservan 35 segundos para el resto de solicitudes y se reservan 55 segundos para voz: el backend puede emplear hasta 15 segundos en autenticación y 30 en transcripción.
- Los errores públicos proceden de mensajes controlados; el diagnóstico interno contiene códigos, operación y estado HTTP. No incluye cuerpos, audio, transcripciones, URLs ni tokens.
- Una respuesta 401 permite identificar la necesidad de iniciar sesión; un timeout se diferencia de un fallo de conexión.
- Los clips de menos de 300 ms se descartan antes del envío. Se mantienen las comprobaciones de archivo vacío, existencia y tamaño máximo de 5 MB.
- Se mantienen el preset HIGH_QUALITY de expo-audio, M4A/AAC, el envío base64 al mismo backend y el multipart del servidor. No se modifica el servicio de transcripción, el diseño, las preferencias ni la autenticación de otros módulos.

El contrato del grabador y su duración están documentados en [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/). El formato M4A y el archivo multipart con nombre y tipo están admitidos por [OpenAI Audio Transcriptions](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create). El backend mantiene la validación de la sesión; la presencia de una sesión en el cliente no certifica su vigencia.

## Validación local

- 14 nuevas regresiones con el AbortController nativo real y grabador, archivos y servicios simulados: audio corto y de 45 segundos, entrega única, permisos denegados, audio vacío o demasiado breve, cierre/reapertura, respuesta tardía, falta de sesión, 401, indisponibilidad, recuperación de conexión, privacidad y timeouts de solicitud/respuesta.
- 55 pruebas existentes de conversación, grabación, ubicación y apariencia.
- 3 pruebas del backend existente, con autenticación y proveedor simulados en un servidor efímero.
- Typecheck móvil correcto.
- No se enviaron grabaciones reales ni se realizaron llamadas a OpenAI.

Desde `artifacts/go-app-mobile`:

```powershell
node --test --test-concurrency=1 tests/voice-processing.test.mjs
node --test --test-concurrency=1 tests/booking-assistant.test.mjs tests/assistant-location.test.mjs tests/listening-indicator.test.mjs
```

Desde `artifacts/api-server`:

```powershell
node --test --test-concurrency=1 tests/booking-assistant.test.mjs
```

Desde la raíz:

```powershell
pnpm --filter @workspace/go-app-mobile typecheck
git diff --check
```

## Estado real y prueba pendiente

En la revisión, el backend local del puerto 3000 responde HTTP 200 en `/api/healthz` y `/api/booking-assistant/capabilities`, con `interpretation: true` y `transcription: true`. El endpoint de capacidades solo comprueba la presencia de la configuración; no verifica la validez de la clave, permisos del proveedor, cuota ni la sesión del iPhone.

Este worktree independiente no contiene archivos locales de entorno. No se han creado ni copiado credenciales y no se ha cambiado ningún proceso activo. La URL efectiva del bundle del iPhone y su sesión siguen pendientes de comprobación.

Después de incorporar el parche en el bloque de consolidación autorizado, la prueba debe utilizar un bundle que incluya esta reparación, la base de desarrollo configurada y una sesión válida. Probar una frase breve de búsqueda, comprobar el texto que llega al chat y la continuidad de GO, y repetir con una frase más larga y tras cerrar/reabrir la IA. La primera prueba real puede utilizar el servicio externo ya existente y requiere comprobar su disponibilidad efectiva.

Si el dispositivo devuelve una falta de conexión, 401 o indisponibilidad del proveedor, identificar el código técnico seguro correspondiente y resolver únicamente esa configuración con autorización. No cambiar secretos ni infraestructura automáticamente. La incidencia no se considera resuelta en dispositivo hasta obtener una transcripción real.
