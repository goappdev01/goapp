# GO IA: preferencias y conversación — 27/11/2026

Partida: MAIN `4420d0805366d2923b764eb0326523ba79737215`. Solo cambios móviles,
pruebas y documentación; no cambios de servidor, credenciales, presupuesto o datos
de reservas. Se conserva el checkpoint original `c6141e1`.

## Interfaz y preferencias

El engranaje utiliza `GoCloseButton` de GO y el panel de herramientas existente.
No se reproduce ni controla el engranaje externo de Expo Go. Contiene autorización
de envío, recordar historial, lectura, privacidad, borrado, consumo y el texto de
limitaciones/condiciones pendiente de validación jurídica. Los estados de errores
y las confirmaciones expresas conservan su lugar en la conversación.

La primera autorización explica proveedor, finalidad, minimización, ausencia de
audio OpenAI y límite acumulado. Su decisión versionada se conserva por cuenta
en AsyncStorage, usando el espacio de preferencias del chat existente. No se
promete sincronización de preferencias entre dispositivos. Cerrar, salir al fondo
o cambiar sesión interrumpe trabajo/voz sin revocar una decisión guardada. Revocar
desde configuración se conserva; una nueva versión de consentimiento exige decidir
de nuevo. El historial sigue siendo optativo e independiente del permiso de envío.
La lectura empieza activada y puede desactivarse de forma persistente.

GO central utiliza la disposición vertical del grupo flotante existente, encima
de Atrás, con el mismo centro y lateralidad. El pie medido protege el editor;
el historial reserva el ancho de una sola columna y espacio de desplazamiento
final para los controles. Los otros asistentes conservan su disposición.

El aviso aprobado aparece compacto y sobre fondo claro como la conversación.
Se cierra con un control de 44 puntos y devuelve su espacio al contenido. Vuelve
a mostrarse al entrar; el texto siempre se puede consultar en configuración y
en `docs/legal/go-ai-terms-draft.md`. No hay temporizador que lo retire antes de leer.

## Voz: capacidad real y dependencia pendiente

Se mantiene `expo-speech` para reproducción del dispositivo, en el idioma existente
seleccionado. No se llama a audio de OpenAI ni se activa transcripción del servidor.

La captura de GO IA reutiliza `useBookingVoice`, con un adaptador de reconocimiento
local opcional: comprobar capacidad, permiso nativo al pulsar, escuchar, mostrar
transcripción parcial, enviar una única transcripción final al chat y reproducir
su respuesta. Parar, cerrar, editar o ir al fondo invalida eventos tardíos. No guarda
archivos de audio ni utiliza un fallback de pago o reconocimiento remoto.

**Expo Go no contiene el módulo `ExpoSpeechRecognition`, y el proyecto no instala
`expo-speech-recognition`. Por tanto, pulsar GO en Expo Go NO inicia escucha directa.**
Se muestra la limitación completa en vez del resumen genérico «Dictado no disponible».
Texto y dictado voluntario del teclado siguen disponibles; no se abre el teclado
automáticamente al pulsar GO.

Para la aplicación nativa falta incorporar y fijar una versión compatible de ese
módulo, su plugin y textos de permiso en una compilación propia, y probar permisos,
idiomas/modelos locales y audio en iOS/Android reales. Esto NO se ha instalado,
compilado ni simulado como funcional en Expo Go. El adaptador exige reconocimiento
en el dispositivo; si falta el modelo local, no lo descarga ni envía audio a terceros.

Fuentes primarias consultadas:

- [Expo Speech, incluido en Expo Go](https://docs.expo.dev/versions/latest/sdk/speech/).
- [Compilaciones propias y limitaciones de Expo Go](https://docs.expo.dev/develop/development-builds/introduction/).
- [API del módulo nativo y reconocimiento en dispositivo](https://github.com/jamsch/expo-speech-recognition).

## Verificación

Pruebas dirigidas de preferencias, aislamiento entre cuentas, revocación, renovación,
historial, interrupción, transcripción final única, módulo ausente, permiso denegado,
reconocimiento local, cierre del aviso, grupo vertical, engranaje y regresiones del
asistente compartido. Son pruebas técnicas con adaptadores, sin consumo de IA.
TypeScript móvil y `git diff --check`.

Pendiente del propietario: tamaño y distribución en iPhone, guardar preferencias
al cerrar y reabrir, autorización inicial, lectura real y cierre del aviso. La voz
directa nativa requiere además la compilación descrita; no se declara comprobada.
Reservas permanecen deshabilitadas y presupuesto acumulado de 4 USD intacto.
