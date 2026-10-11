# GO V1 — 15A / 15C: auditoría y cambio independiente

Fecha: 2026-10-09. Rama codex/agent-2-ia-reservas-v1; base 54a2779.

## Estado y protección

La integración está en 7786872 (ADMIN), con siete cambios pendientes: app/index.tsx,
BookingAssistantScreen.tsx, expo-env.d.ts, assistant-location.test.mjs,
calendar-slot-flow.test.mjs, integration-v1.test.mjs y GO_V1_INTEGRACION_PROMPT_3.md.
Se registraron SHA-256 de los siete archivos antes del trabajo. No se editaron ni
se trasladaron completos a esta rama. No se reiniciaron Metro ni backend.

La rama independiente no contiene los merges ni las correcciones posteriores de
integración. Por eso sus pruebas no certifican el estado combinado con ADMIN.

## 15A: presente en integración, dependencia pendiente en esta rama

15A está en los borradores protegidos de integración, confirmado visualmente por
el usuario en iPhone. Landing genera listenRequest únicamente para GO central;
BookingAssistantScreen lo consume una vez en Modal.onShow; GOChatScreen propaga
las propiedades al asistente real. El hook conserva permisos, guardas de generación
y cola del grabador. No se altera esa implementación funcionando.

En la base 54a2779 todavía hay un temporizador hacia startIaListening antiguo en
Landing y autoarranque en el efecto de apertura del asistente. Este efecto espera
AsyncStorage y puede iniciar escucha después de escribir/abrir un panel durante
la hidratación. Es una diferencia PREEXISTENTE respecto a la implementación15A
protegida; no es causada por el indicador. Su recuperación debe ser coordinada
con la integración, sin copiar Landing o la pantalla completos.

También existe en esta base una diferencia de limpieza si recorder.stop falla;
el hook posterior de integración incorpora tratamiento adicional. No se cambia
la transcripción ni el hook en este paso. No declarar esta rama equivalente al
entorno activo ni promocionarla directamente sobre él.

## 15C: indicador pasivo

ListeningIndicator recibe solo active, compact y diameter. No accede al micrófono,
no llama servicios, no cambia permisos ni crea botones. Solo escucha REAL
(voice.status === listening), con pantalla visible y sin error/panel/procesamiento,
activa el feedback. Tres anillos suaves, núcleo GO dorado y Habla; loops nativos
moderados de 2,2 segundos y fundido de 180ms. La preferencia de reducción de
movimiento desactiva los latidos; se liberan loops y listeners al desmontar.
No se usa una animación como medidor de volumen.

expo-audio57.0.5 soporta metering, pero HIGH_QUALITY no lo activa y el grabador
no lee esa información. Se mantiene intacto para evitar añadir polling o cambiar
la captura por un efecto visual.

La pantalla mide viewport y contenido. El indicador grande queda en espacio
sobrante bajo los mensajes, fuera del ScrollView; no añade altura ni cambia el
scroll. Si no cabe, la medida está desactualizada o hay teclado, utiliza un círculo
compacto en la fila de estado existente con Habla. Todos los overlays son
pointerEvents=none. Parar, escritura y controles conservan sus callbacks.
La actualización de mensajes invalida la posición hasta medir el nuevo contenido.

## Validación y límites

Pruebas nuevas: geometría libre/saturada, fases de voz, cierre/reapertura,
limpieza de animaciones, consultas asíncronas tardías de accesibilidad, reducción
de movimiento, ausencia de controles táctiles nuevos y conservación de mensajes.
Se ejecutan con adaptadores locales; no certifican iPhone/Android físicos.
Los resultados finales completos se consignan en la entrega de este trabajo.

## Verificación visual posterior, solo con autorización de integración

1. Incorporar el cambio pequeño del indicador sobre la pantalla vigente junto a
   15A ya probado, revisando las diferencias de layout existentes; no sustituir
   archivos completos por los de esta rama más antigua.
2. Abrir desde GO central: escuchar una sola vez y mostrar GO/Habla al entrar
   en listening, no durante preparing.
3. Pulsar Parar: dejar de latir y mostrar transcripción/procesamiento actual.
4. Cerrar durante permiso/escucha/procesamiento y reabrir: sin grabaciones ni
   pulsos residuales. Otras rutas no deben comenzar a escuchar automáticamente.
5. Probar conversación vacía, saludo, muchos mensajes y teclado, comprobando
   que todos los mensajes/controles siguen accesibles y no hay saltos de scroll.
6. Activar Reducir movimiento: indicador estático, sin latido.

No se ejecutan transcripciones reales ni builds nativas. No se cambia ADMIN,
autenticación, Supabase, credenciales, rutas ni configuración del entorno activo.
## Fallos encontrados y cierre técnico

La primera suite completa encontró dos fallos: un adaptador antiguo de
customer-booking.test.mjs no cargaba goTaskAccess, y una aserción del test nuevo
15B comparaba arrays de contextos VM distintos. El segundo se corrigió en su
prueba; el primero se adaptó cargando el módulo real goTaskAccess, igual que la
adaptación ya revisada en el commit de integración59e7b4d. Ninguno requirió cambiar
reservas, autenticación o backend. Después pasan75 pruebas relevantes del
indicador, reservas, voz, gestión de tareas y cola compartida.
Typecheck móvil correcto. La suite completa final se repite tras cerrar todos
los cambios nuevos, sin proveedores reales ni pago.

## Cierre de verificaciones

Suite móvil completa: 146/146 pruebas aprobadas, sin fallos, omisiones ni
cancelaciones; incluye 7 pruebas del indicador y 19 de contratos 15B. Typecheck
móvil y comprobación aislada de tipos del contrato correctos. No se usaron
proveedores reales. Se conservó el indicador compacto durante el estado de
transcripción para completar su fundido sin mantener Habla ni latidos.

Las versiones instaladas, resueltas desde la app, son Expo 57.0.26, React Native
0.86.3, expo-audio 57.0.5 y TypeScript 5.9.3. HEAD de integración permanece en
7786872145076909b497ead88c3ecf1ef74da93d y los siete SHA-256 coinciden con la
captura inicial. Las pruebas de esta rama no sustituyen las pruebas de integración
con ADMIN ni la verificación física del indicador.
