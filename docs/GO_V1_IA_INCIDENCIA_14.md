# GO V1 — Incidencia 14: teclado y conversación

## Causa y corrección

La barra con los cinco controles permanecía dentro de KeyboardAvoidingView al abrir el teclado. Ocupaba espacio sobre el teclado junto con el margen inferior de la zona segura. El ScrollView tampoco solicitaba cierre interactivo y desplazaba al final cada vez que cambiaba el contenido.

BookingAssistantScreen escucha los eventos nativos del teclado mientras está visible. En iOS sincroniza el cambio de distribución con la animación del teclado. Oculta el dock completo y retira el margen inferior duplicado, conservando el composer dentro del KeyboardAvoidingView existente. Al cerrarse el teclado restaura el dock y la zona segura sin cambiar el borrador. El panel de ubicación reutiliza el mismo estado.

La conversación ocupa el espacio restante y extiende su contenido por el espacio libre. Usa keyboardDismissMode interactive en iOS (on-drag en Android) y keyboardShouldPersistTaps handled: el ScrollView nativo permite cerrar al tocar espacio libre sin interceptar controles hijos. Enviar una solicitud válida también pide cerrar el teclado; conserva las condiciones originales de envío y procesamiento. La lectura de mensajes anteriores no se desplaza automáticamente al final; el seguimiento continúa cuando el usuario está cerca del último mensaje.

Se conservan los componentes de micrófono, cierre flotante, acciones y persistencia. Landing, Calendario y Reservas no se modifican.

## Archivos

- artifacts/go-app-mobile/components/booking-assistant/BookingAssistantScreen.tsx
- artifacts/go-app-mobile/components/booking-assistant/BookingAssistantPanels.tsx
- artifacts/go-app-mobile/tests/assistant-location.test.mjs
- Este informe.

## Validación automatizada

106 pruebas pasan en booking-assistant, assistant-location, assistant-floating-close, task-creation, go-log-sync, calendar-container-ux e integration-v1. Las cuatro regresiones nuevas ejercitan el render y sus eventos con contratos nativos simulados:

1. Apertura/cierre repetidos en las tres escalas de GO: oculta los cinco controles, recupera espacio y restaura la zona segura, conservando el borrador multilínea.
2. Conversación vacía y 100 mensajes largos: configura cierre nativo por gesto/toque libre, conserva controles hijos y evita mover al final a quien está leyendo mensajes anteriores.
3. Solo el envío válido cierra el teclado, procesa el texto original una vez y limpia el borrador; entradas vacías u operaciones ocupadas no envían.
4. El panel de zona oculta el mismo dock y al cerrar la pantalla se eliminan los listeners.

Typecheck móvil y git diff --check correctos.

## Validación física pendiente en Expo Go / iPhone

No se ha probado un iPhone físico. Los tests no certifican gestos, solapamientos ni animaciones reales. Comprobar:

- Abrir con conversación vacía y con varios mensajes; verificar composer inmediatamente encima del teclado.
- Escribir varias líneas y recorrer una conversación larga sin saltos.
- Cerrar deslizando hacia abajo y tocando espacio libre; pulsar acciones/enlaces sin que el cierre intercepte su función.
- Enviar y comprobar la distribución restaurada.
- Cerrar con borrador sin enviar, reabrir y comprobar conservación y nueva ocultación del dock.
- Completar y cancelar un gesto interactivo; verificar ausencia de parpadeos o huecos.
- Repetir con distintos tamaños de iPhone, zonas seguras y teclado predictivo.
- Verificar límites del cierre flotante y funcionamiento del micrófono tras restaurar el dock.

Rama utilizada: integration/go-v1-calendario-ia-landing, continuación de las incidencias 11–13. Sin push, merge ni despliegue. Los cambios previos de expo-env.d.ts y GO_V1_INTEGRACION_PROMPT_3.md permanecen fuera de este trabajo.
