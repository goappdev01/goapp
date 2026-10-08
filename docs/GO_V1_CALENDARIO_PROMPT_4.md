# Prompt 4 — Limpieza UX de Calendario / Reservas

Fecha: 2026-10-08.
Rama: integration/go-v1-calendario-ia-landing.
Worktree: C:\Users\Usuario\.codex\worktrees\go-v1-calendario-ia-landing\goapp-profile-logout.
Base validada: 59e7b4dffea7f03060ae551154940bea0bde24ac.

## Resultado por apartado

| Apartado | Estado | Resultado |
| --- | --- | --- |
| 1 | IMPLEMENTADO | Nueva tarea usa note-edit-outline, conservando el mismo botón, posición dentro de la barra y acción. |
| 2 | IMPLEMENTADO | El formulario existente se reutiliza como capa del mismo modal. ↓ cierra la tarea; ⇓ sale del contenedor. La agenda permanece montada y se conservan fecha, vista, mes y señales de desplazamiento. |
| 3 | IMPLEMENTADO | Se reutiliza GoCloseButton para la tarea, configuración, mes y salida del Calendario. Sin migración masiva de otras pantallas. |
| 5 | IMPLEMENTADO | RESERVAR tiene 52 puntos de altura, texto de 12 puntos, mayor anchura y contraste. Conserva toque y pulsación larga. |
| 6 | IMPLEMENTADO | El indicador principal utiliza GoCalendarViewSelector con DÍA / SEMANA / MES existentes. Navegar desde el mes actualiza fecha, mes y destino de desplazamiento. Se sincronizan las dos preferencias de vista existentes. |
| 7 | IMPLEMENTADO | Flotantes en fila lateral inferior sobre la barra, con separación táctil y una franja libre de 64 puntos debajo de la agenda. Se conserva el ancho de las fichas. ↓ aparece solo cuando hay un panel interno. |
| 8 | IMPLEMENTADO | Barra con Nueva tarea, HOY, RESERVAR y GO. GO sustituye al rayo y mantiene exactamente sus callbacks de toque y voz. MIS RESERVAS conserva su acción en una fila empresarial secundaria. |
| 9 | IMPLEMENTADO | Conservados los cuatro estados y sus contrastes. AgendaOperativa.tsx no se modifica. |
| 10 | IMPLEMENTADO | Conservado GoCalConfigPanel; mejora de contraste del acceso CONFIG propio del contenedor. Sin intervención sobre Expo Go. |
| 11 | IMPLEMENTADO | Sin cambios en Landing, IA, almacenes, backend, disponibilidad, reservas persistidas, fichas, estados, horas, clima, orden temporal, Humanity, órbitas ni reconocedores de gestos. |

IMPLEMENTADO describe el código y las comprobaciones automatizadas. La comprobación visual y táctil en iPhone sigue pendiente.

## Archivos de este bloque

- artifacts/go-app-mobile/app/index.tsx: único archivo de aplicación modificado.
- artifacts/go-app-mobile/tests/calendar-container-ux.test.mjs: 13 pruebas nuevas de contexto, navegación, cierres y controles.
- artifacts/go-app-mobile/tests/integration-v1.test.mjs: las dos acciones traducidas ahora deben mantener Calendario abierto.
- artifacts/go-app-mobile/tests/landing-gestures.test.mjs: adapta la comprobación de la cabecera al selector reutilizado; conserva todas las verificaciones de invisibilidad y bloqueo táctil durante Nueva reserva.
- docs/GO_V1_CALENDARIO_PROMPT_4.md: este informe.

El formulario conserva una sola implementación. Su extracción a una función local reutilizable explica el bloque de código movido en el diff. Los demás modales permanecen idénticos a la base; la revisión del árbol TypeScript identifica cambios únicamente en los modales de Calendario y del formulario compartido.

## Validación

Desde artifacts/go-app-mobile, todos los archivos tests/*.test.mjs:
node --test --test-reporter=spec <archivos de pruebas>

Resultado: 161 pruebas correctas, 0 fallos y 0 omitidas, incluidas 13 nuevas. Cubren calendario diario/semanal/mensual, traducciones ES/EN, cierres, reservas, gestos de Landing, tareas por IA, aislamiento de cuentas y persistencia compartida con adaptadores locales.

Desde la raíz:
pnpm --filter @workspace/go-app-mobile typecheck

Resultado: correcto, sin errores.
git diff --check: correcto. Se verifica también el diff preparado antes del commit.

La primera suite conjunta detectó una comprobación antigua que esperaba el texto fijo de SEMANA. Se adaptó al selector real manteniendo la protección de la cabecera durante Nueva reserva; después pasó la suite completa. No se modificó la lógica de Landing.

## Comprobación pendiente en iPhone

- Abrir tareas interna y externa desde distintas fechas y vistas; cerrar con ↓ y comprobar posición horizontal y vertical.
- Abrir fecha/hora desde la tarea, volver al formulario y salir con ⇓.
- Comprobar teclado abierto/cerrado, áreas seguras y pantallas estrechas.
- Comprobar la fila de flotantes, RESERVAR, GO y el acceso empresarial MIS RESERVAS.
- Revisar tacto y distribución visual sin superposiciones; las pruebas locales no sustituyen un dispositivo real.

No se abre Expo Go en esta fase.

## Alcance conservado y pendientes separados

HORAS/MINUTOS, SALTAR HORA, SIN DURACIÓN y sus contrastes siguen registrados como trabajo separado: este bloque no los modifica ni los declara resueltos.
La lógica funcional de IA permanece intacta; cualquier trabajo adicional de conexión corresponde al Prompt 5.
No se declara terminado el documento maestro ni se inicia el Prompt 5.
Las ramas originales y main permanecen en sus commits anteriores.
La edición previa de docs/GO_V1_INTEGRACION_PROMPT_3.md se conserva fuera del commit de este bloque.
Sin instalaciones, subagentes, push, merge a main ni despliegues.
