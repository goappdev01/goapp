# GO V1 · 15B · Preparación independiente de transcripción

Fecha de revisión: 2026-10-09. Worktree autorizado: `C:\Users\Usuario\.codex\worktrees\9998\goapp-profile-logout`, rama `codex/agent-2-ia-reservas-v1`.

## Entrega y alcance

Esta preparación contiene un contrato TypeScript y un coordinador con proveedores inyectados. Se prueba exclusivamente mediante simulaciones. El módulo no importa bibliotecas, abre el micrófono, descarga modelos, lee configuración ni llama a servicios. No se conecta a pantallas, reservas, autenticación, backend ni al flujo de voz existente.

Archivos de esta entrega:

- [Contrato y coordinador](../artifacts/go-app-mobile/lib/voiceTranscription.ts).
- [Pruebas con mocks](../artifacts/go-app-mobile/tests/voice-transcription.test.mjs).
- Este documento.

No se instala la biblioteca candidata ni se modifican Expo, dependencias, permisos, variables de entorno o servicios. No se realiza build nativa, integración, push, merge ni acción en producción. Los commits locales aislados están autorizados en el prompt y se identifican en la entrega. El contrato es preparación revisable, no una transcripción nativa disponible.

## Versiones y candidato

El [package.json móvil](../artifacts/go-app-mobile/package.json) declara:

| Componente | Versión declarada | Instalada, resuelta desde la app |
| --- | --- | --- |
| Expo | ~57.0.26 | 57.0.26 |
| React Native | 0.86.3 | 0.86.3 |
| expo-audio | 57.0.5 | 57.0.5 |
| TypeScript móvil | ~5.9.2 | 5.9.3 |

El manifiesto no contiene `expo-speech-recognition`. La [release v57.0.0 del mantenedor](https://github.com/jamsch/expo-speech-recognition/releases/tag/v57.0.0) declara soporte oficial para Expo SDK 57 y React Native 0.86. La familia 57.x es un candidato compatible según esa declaración, sin validación de build o dispositivo en GO. El [package.json actual del mantenedor](https://github.com/jamsch/expo-speech-recognition/blob/main/package.json) muestra 57.1.1 y peers amplios; eso no sustituye la declaración de release ni demuestra compatibilidad de cada combinación.

Una integración futura necesitaría elegir y fijar una versión concreta, añadir su plugin/configuración y permisos nativos, y generar una development build propia que incluya el módulo. Expo Go incluye un conjunto fijo de bibliotecas y no permite incorporar módulos nativos arbitrarios. Véanse [development builds de Expo](https://docs.expo.dev/develop/development-builds/introduction/) e [instalación del mantenedor](https://github.com/jamsch/expo-speech-recognition#installation). Esos trabajos quedan fuera de 15B y no se ejecutan aquí.

## Tres clases de motor

| Motor del contrato | Significado | Red/coste exigidos antes de audio |
| --- | --- | --- |
| `verified-local` | Modelo disponible para es-ES, ejecución local impuesta y evidencia de pruebas para la configuración actual | Se fuerza red y coste deshabilitados |
| `system` | Reconocedor del sistema que puede recurrir a red | Autorización de red; también de coste si puede facturar |
| `external` | Servicio externo bajo contrato que puede facturar | Autorización separada de motor/proveedor, red y coste |

La política es conservadora: un proveedor `system` siempre requiere red autorizada, incluso si declara una preferencia offline. Un proveedor `external` siempre requiere coste autorizado, aunque su capacidad declare coste nulo. Las autorizaciones identifican al proveedor y al motor exactos; no habilitan otros proveedores ni son equivalentes al permiso del sistema operativo.

## Contrato y ejecución simulada

`getCapability("es-ES", signal)` inspecciona únicamente datos locales/cached sobre disponibilidad, idioma, entrada de archivo, política de red/coste y evidencia local. No puede capturar audio, usar red, pedir permisos ni descargar modelos. Si una plataforma necesita preparar o descargar un modelo, será una acción separada con autorización futura.

`start` recibe una URI `file:///...` de un archivo ya cerrado y completo. Solo se admite es-ES en esta versión. No se registra otro idioma como equivalente y no se aceptan URLs remotas. La captura, conversión del formato y eliminación del archivo pertenecen a su propietario futuro y no están implementadas aquí.

El coordinador ordena una copia del registro por prioridad fija: `verified-local` → `system` → `external`. Dentro de cada clase conserva el orden aportado, sin modificar el registro original. Registrar primero un proveedor externo no le da prioridad sobre uno local disponible. Cada intento comprueba su autorización y su capacidad antes de recibir audio. El siguiente espera a que el anterior haya terminado y liberado recursos. El coordinador copia las autorizaciones y la URI al iniciar; un cambio posterior del objeto original no amplía el permiso. Sin autorización de otro proveedor, un fallo local devuelve el fallo o indisponibilidad y no escala a red.

La sesión del proveedor tiene una promesa `completion` con un único texto final. El adaptador futuro debe juntar segmentos, filtrar duplicados/eventos tardíos y resolver o rechazar solo después del cierre y retirada de listeners. Si `start` lanza sin devolver sesión, debe haber liberado todos los recursos. El módulo no interpreta el texto ni ejecuta reservas.

Un coordinador admite una sola tarea activa y responde `busy` a otra. Su propietario futuro debe compartir la misma instancia para el mismo recurso de audio; distintas instancias no crean un bloqueo global. Cancelar aborta la señal, invoca el cierre una sola vez, descarta texto tardío y no permite fallback. Si el cierre falla, conserva el bloqueo hasta que `completion` confirme la liberación. Si el proveedor nunca confirma el cierre, la tarea sigue pendiente: no se fuerza otro motor con recursos posiblemente activos.

Los errores públicos contienen códigos y la identidad del proveedor, sin copiar excepciones, transcripciones fallidas o la URI al diagnóstico.

## Requisitos nativos y evidencia de procesamiento local

En iOS se necesita comprobar `supportsOnDeviceRecognition` en el reconocedor del idioma solicitado y establecer `requiresOnDeviceRecognition` en la petición. Apple documenta que la petición solo respeta esa exigencia si el reconocedor soporta ejecución local. No basta con que el dispositivo tenga reconocimiento de voz general. Fuentes: [capacidad local de Apple](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition), [exigencia local de Apple](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition).

En Android, `createOnDeviceSpeechRecognizer` e `isOnDeviceRecognitionAvailable` existen desde API 31; hay que comprobar disponibilidad y destruir el reconocedor cuando termina. La API `EXTRA_PREFER_OFFLINE` puede ser ignorada según el reconocedor, por lo que no acredita ejecución local. Fuentes: [SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer), [RecognizerIntent](https://developer.android.com/reference/android/speech/RecognizerIntent#EXTRA_PREFER_OFFLINE).

Esto no elimina las restricciones del adaptador candidato: su documentación limita la transcripción de archivos y persistencia de grabación a Android 13+ e iOS, y requiere comprobar modelos del idioma instalados en Android. También hay que validar el formato del archivo en cada plataforma. Véanse [archivos](https://github.com/jamsch/expo-speech-recognition#transcribing-audio-files) y [grabaciones](https://github.com/jamsch/expo-speech-recognition#persisting-audio-recordings). API 31 no demuestra que la transcripción de archivos de esa biblioteca funcione en Android 12.

Para acreditar `verified-local` en una tarea futura:

1. Registrar en una referencia de evidencia el dispositivo, SO, versión del módulo/app, servicio reconocedor, modelo y locale es-ES. Revalidar disponibilidad y esa correspondencia antes de cada intento. Un cambio de configuración invalida la evidencia previa.
2. Imponer reconocimiento local y comprobar el modelo es-ES. Si no está listo o la exigencia no puede imponerse, declarar indisponibilidad; no cambiar silenciosamente a reconocimiento general.
3. Transcribir muestras nuevas en español con todos los radios de red desactivados; el modo avión por sí solo no garantiza que Wi-Fi esté apagado. Repetir desde inicio limpio y probar que faltar el modelo produce un fallo honesto.
4. Auditar tráfico durante la operación y tras restaurar conectividad, incluyendo los procesos/servicios del reconocedor del sistema y posibles envíos diferidos, no solo las llamadas HTTP de la app.
5. Comprobar cierre normal, errores, cancelación y paso a segundo plano. Guardar evidencia sin audio ni transcripciones personales y volver a probar tras cambios de SO/modelo/módulo.

Estas pruebas aportan evidencia acotada a esa configuración; los campos booleanos del contrato no verifican hardware ni red por sí mismos. La evidencia que usan los tests es ficticia y no certifica ningún dispositivo real.

## Validación local

Comando desde la raíz del worktree:

```powershell
node --test artifacts/go-app-mobile/tests/voice-transcription.test.mjs
```

La suite valida tipos del archivo con TypeScript existente y prueba autorizaciones, locale, evidencia, exclusión de URL remota, orden de fallback, cierre antes del siguiente intento, bloqueo, cancelación, resultados tardíos, entrega final única y errores con códigos. Todas las operaciones de proveedor son mocks; no hay peticiones de transcripción reales.

Resultado final: 19/19 pruebas aprobadas (incluida la comprobación aislada de tipos); 0 fallos. No se ha validado reconocimiento nativo, calidad de es-ES, compatibilidad binaria, acceso a micrófono, formato de audio ni procesamiento local en dispositivo.

## Recorrido actual y punto de integración futuro

useBookingVoice captura con HIGH_QUALITY de expo-audio, guarda la URI temporal,
para el grabador, lee el archivo como Base64 y llama assistantApi('/transcribe')
con mime audio/m4a. Finalmente elimina el archivo y entrega el texto una vez a
onText; la pantalla decide después si es una zona o una petición del asistente.
La captura actual comprueba antes capabilities y sesión autenticada. No se cambia
ninguno de estos pasos. El contrato nuevo no figura en sus imports.

En la futura integración de archivo se conservaría un único propietario del audio:
detener y cerrar primero la grabación; ejecutar el coordinador con la URI; entregar
el texto final al callback existente; borrar el archivo al terminar o cancelar.
El adaptador externo reutilizaría assistantApi y la autenticación actual. La
comprobación de capabilities del backend pertenece a ese adaptador, no a una
precondición universal para transcribir localmente. Esa separación requiere
revisión y autorización posterior; no elimina la sesión necesaria para ejecutar
acciones del usuario ni cambia los permisos actuales.

El archivo m4a actual no equivale automáticamente al formato de entrada de un
reconocedor nativo Android. Se necesitará comprobar o convertir formato/muestreo
antes de darlo al adaptador, sin crear un segundo grabador simultáneo. Cuando no
se soporte entrada de archivo, se declarará indisponibilidad en ese dispositivo.
Una alternativa en directo se estudiará después, manteniendo un solo dueño del
micrófono y cancelando el reconocimiento anterior antes de cualquier alternativa.

## Permisos y estados propuestos, todavía sin conexión operativa

Para SFSpeechRecognizer en iOS se necesitan las descripciones
NSMicrophoneUsageDescription y NSSpeechRecognitionUsageDescription y las
autorizaciones correspondientes. Son diferentes del consentimiento para enviar
audio a una red. Si se deniega o restringe reconocimiento, ofrecer texto y
respetar canAskAgain, sin bucles de solicitudes. Fuente: [permisos de Apple](https://developer.apple.com/documentation/speech/asking-permission-to-use-speech-recognition).

En Android el reconocedor necesita RECORD_AUDIO concedido en ejecución. Desde
Android 11 se debe declarar la consulta del servicio RecognitionService para su
visibilidad, que se verificará en el manifiesto generado. El fabricante y servicio
instalado determinan las capacidades; no basta la versión Android. Fuente:
[SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer).

Flujo previsto: preparando (capacidad/consentimiento/permisos) → escuchando
(captura activa) → transcribiendo (captura detenida) → procesando (interpretación
del texto) → respuesta. Error o cancelación detienen el trabajo, descartan eventos
tardíos y liberan recursos antes de otra sesión. El indicador 15C solo corresponde
a escuchando. El contrato de archivo preparado empieza al transcribir y no
implementa permisos, escucha ni interpretación.

## SpeechAnalyzer y transcripción parcial

Apple introdujo SpeechAnalyzer en iOS 26. SpeechTranscriber procesa en dispositivo
con modelos que deben estar disponibles, según idioma y hardware. Se comprueban
supportedLocales e installedLocales para es-ES antes de usarlo; descargar modelos
sería una operación separada y autorizada. No se presupone que la biblioteca
candidata exponga SpeechAnalyzer: hoy envuelve SFSpeechRecognizer. Un puente
específico sería una fase posterior. Fuente: [Apple WWDC25](https://developer.apple.com/videos/play/wwdc2025/277/).

El contrato actual entrega solo el texto final. Una ampliación futura para parciales
necesitará sessionId, segmento/secuencia y marca final: reemplazar el parcial del
mismo segmento, juntar únicamente finales confirmados y descartar eventos de una
sesión cancelada. No ejecutar tareas ni enviar cada parcial a IA. Empezar por
archivo final evita reconstruir la captura existente; el reconocimiento continuo
se probará después con un único grabador y sin llamadas externas simultáneas.

## Métricas y fases de autorización

Medir con muestras consentidas, sin guardar audio/texto personal en logs: latencia
p50/p95 hasta primer parcial y final, tasa de error de palabras y de datos críticos
(fecha, hora, nombre), porcentaje local/fallback, cierres y duplicados, batería y
CPU en sesiones repetidas y minutos externos evitados. Ahorro bruto mensual
estimado = usuarios activos × minutos de voz/usuario × proporción realmente local
× tarifa externa/minuto. Restar mantenimiento/builds; no es ahorro medido ni una
promesa de precisión. Reconocimiento local no implica interpretación gratuita.

1. Estabilizar GO y verificar ADMIN; autorizar integración separada de 15C junto
   a 15A vigente, sin trasladar pantallas antiguas completas.
2. Autorizar versión fijada de expo-speech-recognition, cambios concretos de
   package/lockfile y plugin Expo/permisos. Preparar adaptadores y probar los
   formatos en una rama aislada. Ninguno está instalado en este trabajo.
3. Autorizar development builds iOS y Android y su distribución de prueba.
   En Windows, iOS requiere un Mac/Xcode o servicio de compilación autorizado;
   no crear servicios de pago automáticamente. Expo Go estándar seguirá usando
   su flujo actual y no se presentará como compatible con el módulo añadido.
4. Validar es-ES y evidencia offline/red, denegación de permisos, cierres,
   interrupciones, reentrada y dispositivos sin modelo, antes de activar el motor.
   Mantener el fallback deshabilitado salvo autorización explícita por proveedor.
5. Solo después evaluar parciales/continuo y reglas locales sencillas reutilizando
   intérpretes de tareas existentes. Operaciones ambiguas o sensibles conservan
   confirmación; no duplicar almacenamiento ni acciones.

TESO puede reutilizar el contrato, coordinador y pruebas si comparte TypeScript;
los adaptadores, permisos y modelos dependen de su plataforma. No se integra TESO,
HUMANITY ni una nueva capa de agentes en este trabajo.
