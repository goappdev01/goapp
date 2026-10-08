# Prompt 5 — GO y creación desde franjas horarias

Fecha: 2026-10-08.
Rama: integration/go-v1-calendario-ia-landing.
Worktree: C:\Users\Usuario\.codex\worktrees\go-v1-calendario-ia-landing\goapp-profile-logout.
Base comprobada directamente antes de modificar: 61719daf34ec115f6efacf1f6a7df209cc2329be.

## Estado

IMPLEMENTADO se refiere al código y a su validación automatizada local. La validación táctil y visual en iPhone permanece PENDIENTE.

| Requisito | Estado | Resultado |
| --- | --- | --- |
| Apartado 4: GO | IMPLEMENTADO | GO visible, sin rayo en sus controles de Calendario/Reservas. Usa el mismo openAi → GOChatScreen → BookingAssistantScreen integrado del Agente 2. En iOS espera onDismiss del Calendario antes de presentar la IA; en Android/web realiza la transición después del cierre. El GO central de Landing conserva su función de IA. |
| 1: franja vacía de HOY | IMPLEMENTADO | Abre el formulario existente NOTA_INTERNA con fecha de la columna y hora HH:MM de la franja. No hereda datos de otro borrador del Landing ni aplica su creación inmediata. |
| 2: franja vacía de MAÑANA y otros días | IMPLEMENTADO | Mismo flujo en DÍA, SEMANA y MES, conservando el día de cada columna. Respeta las densidades y franjas visibles existentes. |
| 3: ficha existente | IMPLEMENTADO | Conserva su detalle existente. Solo las filas sin fichas reciben el reconocedor de creación; las fichas no crean otra tarea. |
| 4: scroll, swipe y arrastre | IMPLEMENTADO | Toque corto: hasta 250 ms y 8 puntos de desplazamiento, solo cuando el gesto termina correctamente. Scroll, swipe, cancelación y mantener pulsado no crean tareas. Durante selección o arrastre no se habilitan franjas. Los reconocedores existentes de arrastre de fichas se conservan. |
| 5: cierre ↓ y contexto | IMPLEMENTADO | Reutiliza GoCloseButton y closeFieldSelectorPanel del Prompt 4. La agenda y Reservas permanecen montadas debajo del mismo formulario; no se modifican sus señales de desplazamiento. Se restaura fecha, vista y mes. |
| 6: IA real | IMPLEMENTADO | Se reutiliza el asistente real; no se crea chat, historial ni respuestas simuladas. El nuevo acceso de Reservas cabe en la columna flotante existente con separación táctil. |
| 7: crear y reabrir | IMPLEMENTADO | Conserva ID GO, fecha, hora, título y detalle mediante updateGoLog y go_log_v1 existentes. Espera confirmación del almacenamiento antes de cerrar; un fallo conserva el formulario para reintentar. |
| 8: duplicados | IMPLEMENTADO | Bloquea apertura/guardado simultáneos, reutiliza el ID en reintentos y comprueba su existencia dentro de la cola compartida. |
| 9: cuentas | IMPLEMENTADO | Usa getTaskUser/assertTaskUser existentes; propietario obtenido de la sesión y comprobado dentro de la cola. El cambio de sesión invalida apertura/borrador. Calendario filtra registros con propietario ajeno, tareas personales sin propietario y selecciones antiguas. |
| 10: reservas y navegación | IMPLEMENTADO | Sin cambios en backend, disponibilidad, contratos de datos ni operaciones de reservas. Pasan pruebas existentes de navegación, reservas, Landing e IA. |
| Pulsación larga en franja vacía | PENDIENTE | El callback anterior onAddEntry(dateISO) requiere contacto y no recibe hora. No ofrece un contrato compatible de generar acción desde una franja. No se conecta ni se inventa un flujo paralelo; mantener pulsado no crea tareas. |

Los registros personales antiguos sin propietario se conservan íntegros en el almacén, sin adjudicarlos a ninguna cuenta; no se muestran como tareas personales verificadas. La creación desde franjas requiere una sesión. Los registros de reservas conservan su flujo de acceso existente.

## Archivos de este commit

- artifacts/go-app-mobile/app/index.tsx: conexiones con formulario, cola y asistente existentes; contexto, cuenta, reintentos y transición de modales.
- artifacts/go-app-mobile/components/AgendaOperativa.tsx: franjas vacías y filtro de presentación/selección autorizado.
- artifacts/go-app-mobile/components/booking/GoReservasConfigScreen.tsx: reenvía creación desde franjas y acceso GO.
- artifacts/go-app-mobile/components/ui/GoCalendarSlot.tsx: reconocedor acotado del toque corto sobre una franja vacía.
- artifacts/go-app-mobile/hooks/useGoCalendarEntries.ts: presentación según sesión y propietario existentes; sin almacenamiento nuevo.
- artifacts/go-app-mobile/tests/calendar-slot-flow.test.mjs: 16 pruebas nuevas de los handlers/componentes reales con adaptadores nativos y almacenamiento local en memoria.
- artifacts/go-app-mobile/tests/helpers/calendar-fixture.mjs y calendar-container-fixture.mjs: reutilizan los adaptadores de pruebas existentes.
- artifacts/go-app-mobile/tests/calendar-navigation.test.mjs y calendar-container-ux.test.mjs: importan esos adaptadores, conservando sus comprobaciones.
- docs/GO_V1_CALENDARIO_PROMPT_5.md: este informe.

## Validación

- Suite móvil completa: node --test --test-reporter=spec con todos los archivos tests/*.test.mjs. **177 correctas, 0 fallos, 0 omitidas**, incluidas las 16 nuevas.
- Typecheck: pnpm --filter @workspace/go-app-mobile typecheck. **Correcto**.
- git diff --check y git diff --cached --check: **correctos** antes del commit.
- Comparación de alcance: GOChatScreen, BookingAssistantScreen, goLogStore, goLogBridge, useGoActions, traducciones y API no modificados respecto a 61719da.
- Los bloques de reloj y duración de app/index.tsx son idénticos a 61719da. HORAS/MINUTOS, SALTAR HORA, SIN DURACIÓN y contraste siguen pendientes como trabajo separado.

Las pruebas ejecutan código real con adaptadores locales, no un iPhone ni peticiones al servicio IA de producción. Cubren hoy/mañana, vistas, detalle, valores guardados/reabiertos, reintentos, doble pulsación, cambio de cuenta, cola compartida, cierres y conexiones GO. La comprobación nativa de competición de gestos no se sustituye con esta suite.

## Comprobación pendiente en iPhone

1. Tocar franjas vacías de HOY y MAÑANA en DÍA/SEMANA/MES; verificar fecha/hora y posiciones al cerrar con ↓.
2. Abrir fichas, guardar y reabrir tareas; repetir toques rápidos y comprobar que no aparecen duplicados.
3. Scroll vertical, swipe horizontal, mantener pulsado y arrastrar fichas: sin aperturas accidentales. Comprobar también teclado, áreas seguras y pantallas estrechas.
4. GO desde Calendario y Reservas: una sola IA real después de cerrar el modal; GO central de Landing conserva su acceso exclusivo.
5. Cambiar de cuenta durante apertura/guardado y comprobar ocultación de tareas ajenas.
6. Revisar Reservas, cierres y navegaciones existentes sin regresiones.

## Control del entorno

La modificación previa de docs/GO_V1_INTEGRACION_PROMPT_3.md (retirada del # inicial de su título) ya existía al comenzar y se conserva fuera de este commit. Git no permite atribuir su autor con certeza.

No se modifica main ni las ramas originales: Landing 40e2d6e, IA 54a2779, Calendario 767a0e2.
Sin instalaciones, subagentes, push, merge a main, despliegues ni apertura de Expo Go.
No se declara terminado el documento maestro. No se inicia el Prompt 6.
