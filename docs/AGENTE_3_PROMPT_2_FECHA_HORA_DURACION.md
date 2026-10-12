# Prompt 2 — Fecha, hora y duración

Base: `0f7c373`, rama `codex/agent-3-calendario-v1`, worktree `f418`.

## Flujo real y alcance

`app/index.tsx` renderiza el reloj y el selector de duración de Calendario. Sus acciones utilizan `hooks/useGoCalendarFlow.tsx`. El componente `GoTimePicker.tsx` pertenece a otros flujos y no se ha modificado.

Se elimina únicamente la espera de 120 ms al terminar la selección de horas en el hook: la fase pasa inmediatamente a minutos. No se reconstruye el reloj ni se cambian contratos, guardado o validaciones.

La interfaz solicitada depende de `app/index.tsx`. Conforme al límite de documentar esas dependencias para integración, ese archivo permanece intacto. La autorización del Prompt 1 comprendía exclusivamente sus dos etiquetas de tipo de tarea.

## Validación A–G

| Punto | Estado | Resultado |
| --- | --- | --- |
| A. Reconocer HORAS / MINUTOS | PENDIENTE | El contenedor todavía muestra HORA / MINUTOS; faltan plural, traducción y contraste. |
| B. Cambiar de unidad | PARCIAL | El hook cambia inmediatamente a minutos y permite volver a horas; probado. Falta revisar visualmente el indicador en el contenedor. |
| C. SALTAR HORA | PARCIAL | `skipTime()` continúa con hora vacía y respeta callbacks específicos; probado. Falta aumentar contraste en el contenedor. |
| D. SIN DURACIÓN | PENDIENTE | El botón todavía usa `t('skip_label')`. No se ha cambiado esa clave compartida. |
| E. 15m / 30m / 1h / 2h | PARCIAL | Las cuatro opciones ya avanzan y guardan automáticamente; probado. No requieren CONTINUAR. El refuerzo visual queda pendiente. |
| F. Continuar sin duración | PARCIAL | `selectDuration("")` ya entrega duración vacía incluso con un borrador previo; probado. Falta conectar el botón SIN DURACIÓN. |
| G. Ningún bloqueo | PARCIAL | Probados avance, omisión y corrección tras validación en el hook. Pendiente comprobación completa de interfaz en dispositivo. |

## Integración pendiente en el contenedor

- Duración, alrededor de la línea 20322: añadir una clave específica ES «SIN DURACIÓN» / EN «NO DURATION» en el sistema de traducciones existente, sin redefinir `skip_label`; conectar el botón a `calFlow.selectDuration("")`.
- No convertir `skip()` globalmente en omisión de duración: también se usa para cerrar y conserva deliberadamente una duración previa. Las pruebas protegen esa distinción.
- Reloj, alrededor de la línea 20939: traducir HORAS / MINUTOS y destacar la unidad activa con contraste alto. Mantener el reloj existente.
- SALTAR HORA, alrededor de la línea 20978: conservar `skip_time_label` y el comportamiento del botón, aumentando contraste.
- Revisar jerarquía de acciones disponibles, selección, información secundaria y deshabilitados en estos controles, sin modificar otras pantallas.

## Comprobaciones

- `node --test tests/calendar-flow.test.mjs tests/calendar-navigation.test.mjs tests/customer-booking.test.mjs tests/landing-gestures.test.mjs`, desde `artifacts/go-app-mobile`: 27 pruebas superadas, incluidas 9 nuevas del hook real ejecutado con adaptadores de estado, animación y temporizadores.
- `pnpm.cmd --filter @workspace/go-app-mobile typecheck`: superado.
- `git diff --check`: superado.
- No se ha ejecutado una validación visual en dispositivo. Los tests no prueban backend ni persistencia real.

Archivos del cambio: el hook, `tests/calendar-flow.test.mjs` y este informe. No se modifican `app/index.tsx`, almacenes compartidos, Landing, IA, backend ni disponibilidad de reservas. Prompt 2 queda parcial; no se inicia Prompt 3.
