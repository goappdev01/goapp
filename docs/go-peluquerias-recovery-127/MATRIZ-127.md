# Matriz de recuperación de 127 requisitos GO Peluquerías V1

24/10/2026. Base MAIN: `aa5c137968bad97eae35cc49bf52b1f85517afe4`. Rama local: `codex/go-peluquerias-v1-recovery-127-20261023`.

Esta matriz conserva el estado de la auditoría original y añade el estado de la recuperación local. **MAIN y la instancia 8088 no reciben estos cambios. Ningún requisito se declara comprobado físicamente en esta rama.** El registro JSON acompaña la tabla con archivos, fuentes y evidencias detallados por ID.

## Resumen de requisitos individuales

| Estado local | Número |
| --- | ---: |
| AUTOMATIZADO | 43 |
| SIN_EVIDENCIA | 3 |
| PENDIENTE_FISICO | 14 |
| AUTOMATIZADO_CONSERVADO | 55 |
| SOLO_CODIGO | 5 |
| PARCIAL_DEPENDENCIA | 6 |
| DEPENDENCIA_EXTERNA | 1 |

AUTOMATIZADO y AUTOMATIZADO_CONSERVADO acreditan el alcance concreto de sus pruebas, no todo el recorrido en un dispositivo o una base real. PENDIENTE_FISICO conserva esa condición aunque existan tests auxiliares. PARCIAL_DEPENDENCIA no está cerrado.

## Tarjeta 1 — Visualización de contraseña y aviso de mayúsculas

| ID | Requisito | Estado original MAIN | Estado rama local |
| --- | --- | --- | --- |
| 1.01 | Ojo visible a la derecha en acceso y registro | Ausente de MAIN | AUTOMATIZADO |
| 1.02 | Pulsación alterna mostrar/ocultar de forma persistente | Ausente de MAIN | AUTOMATIZADO |
| 1.03 | Conservar el texto, también al alternar con campo vacío | Ausente de MAIN | AUTOMATIZADO |
| 1.04 | Contraseña oculta por defecto | Comprobado en código | AUTOMATIZADO |
| 1.05 | Aplicar al formulario compartido de los tipos de cuenta existentes | Ausente de MAIN | AUTOMATIZADO |
| 1.06 | Aplicar a confirmación de contraseña cuando exista ese campo | Sin evidencia suficiente | SIN_EVIDENCIA |
| 1.07 | Detectar CapsLock real en teclado físico, sin confundir Shift | Ausente de MAIN | AUTOMATIZADO |
| 1.08 | No inventar CapsLock en iOS/Android sin detección fiable | Comprobado en código | AUTOMATIZADO |
| 1.09 | Mantener autenticación/autofill y comprobar PC/iPhone | Parcial | PENDIENTE_FISICO |

### Recuperación, archivos y comprobaciones por requisito

**1.01** — PasswordInput recuperado y utilizado por el único campo de LoginRegisterPanel en acceso y registro; ojo a la derecha con mínimo táctil44.

- Archivos: `artifacts/go-app-mobile/components/auth/PasswordInput.tsx`, `artifacts/go-app-mobile/components/auth/LoginRegisterPanel.tsx`.
- Pruebas: tests/password-input.test.mjs:50; web, empty: eye toggles permanently without changing the controlled password; web, filled: eye toggles permanently without changing the controlled password; ios, empty: eye toggles permanently without changing the controlled password; ios, filled: eye toggles permanently without changing the controlled password; android, empty: eye toggles permanently without changing the controlled password; android, filled: eye toggles permanently without changing the controlled password; tests/account-selection.test.mjs; usuario: iOS exposes a username/password pair without competing autocomplete hints; empresa: iOS exposes a username/password pair without competing autocomplete hints; native credential selection and email editing retain the password field without reading or storing passwords; Next focuses the existing password input; Go submits native-filled credentials through the existing contract; owner authenticates directly before selecting a public role and receives only verified owner contexts; direct owner login cannot expose ADMIN when the server rejects owner authority.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: Render y hosts simulados; comprobar visibilidad real en iPhone/PC.

**1.02** — Cada onPress cambia el estado visible; persiste tras soltar, blur, rerender y edición.

- Archivos: `artifacts/go-app-mobile/components/auth/PasswordInput.tsx`.
- Pruebas: tests/password-input.test.mjs:50; web, empty: eye toggles permanently without changing the controlled password; web, filled: eye toggles permanently without changing the controlled password; ios, empty: eye toggles permanently without changing the controlled password; ios, filled: eye toggles permanently without changing the controlled password; android, empty: eye toggles permanently without changing the controlled password; android, filled: eye toggles permanently without changing the controlled password.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: Gestos físicos todavía pendientes.

**1.03** — El componente conserva el valor controlado; el ojo nunca escribe la contraseña. Casos vacíos y completos en tres plataformas simuladas.

- Archivos: `artifacts/go-app-mobile/components/auth/PasswordInput.tsx`.
- Pruebas: tests/password-input.test.mjs:50; web, empty: eye toggles permanently without changing the controlled password; web, filled: eye toggles permanently without changing the controlled password; ios, empty: eye toggles permanently without changing the controlled password; ios, filled: eye toggles permanently without changing the controlled password; android, empty: eye toggles permanently without changing the controlled password; android, filled: eye toggles permanently without changing the controlled password.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: No se usaron credenciales reales.

**1.04** — visible comienza false; un formulario nuevo reinicia ocultación sin alterar texto.

- Archivos: `artifacts/go-app-mobile/components/auth/PasswordInput.tsx`.
- Pruebas: tests/password-input.test.mjs:50; web, empty: eye toggles permanently without changing the controlled password; web, filled: eye toggles permanently without changing the controlled password; ios, empty: eye toggles permanently without changing the controlled password; ios, filled: eye toggles permanently without changing the controlled password; android, empty: eye toggles permanently without changing the controlled password; android, filled: eye toggles permanently without changing the controlled password; tests/password-input.test.mjs:61; confirmation and password share the component with independent visibility; a new form starts hidden.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite:

**1.05** — Componente compartido recuperado para Usuario, Empresa y acceso Propietario existentes, conservando el contrato del formulario.

- Archivos: `artifacts/go-app-mobile/components/auth/LoginRegisterPanel.tsx`, `artifacts/go-app-mobile/components/auth/PasswordInput.tsx`.
- Pruebas: tests/account-selection.test.mjs; usuario: iOS exposes a username/password pair without competing autocomplete hints; empresa: iOS exposes a username/password pair without competing autocomplete hints; native credential selection and email editing retain the password field without reading or storing passwords; Next focuses the existing password input; Go submits native-filled credentials through the existing contract; owner authenticates directly before selecting a public role and receives only verified owner contexts; direct owner login cannot expose ADMIN when the server rejects owner authority; tests/auth-navigation-lifecycle.test.mjs; real React mount/foreground/context changes do not restart Home authentication; remount hydrates persisted session once and manual logout keeps access open; mounted restoration and foreground permission 401 retains session without navigation loop; mounted restoration and foreground permission 403 retains session without navigation loop; mounted restoration and foreground permission 429 retains session without navigation loop; expired cold start shares one renewal across mounted permissions and Home; confirmed permission transitions never remount the User working screen or repeat auth/me.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: El acceso Propietario mantiene autorización del servidor; no se crearon roles.

**1.06** — No existe campo independiente de confirmar contraseña en las pantallas actuales. El componente admite reutilización y el test con dos campos verifica visibilidad independiente; no se añadió un campo ni validación nueva.

- Archivos: `artifacts/go-app-mobile/components/auth/LoginRegisterPanel.tsx`, `artifacts/go-app-mobile/components/auth/PasswordInput.tsx`.
- Pruebas: tests/password-input.test.mjs:61; confirmation and password share the component with independent visibility; a new form starts hidden.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: Requisito condicional sin pantalla de confirmación existente. Cierre de alcance: no hay campo omitido que conectar ni autorización para inventar una pantalla.

**1.07** — Web consulta getModifierState(CapsLock) en keydown/keyup capturados; no infiere por Shift ni por letras mayúsculas.

- Archivos: `artifacts/go-app-mobile/components/auth/PasswordInput.tsx`.
- Pruebas: tests/password-input.test.mjs:79; web uses captured keydown and keyup CapsLock state, never an uppercase letter or Shift.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: Verificar un teclado físico compatible; los eventos de la prueba están simulados.

**1.08** — iOS/Android nativos no muestran un estado de Bloq Mayús que no pueden detectar; APIs web ausentes, composición o fallo limpian el estado desconocido.

- Archivos: `artifacts/go-app-mobile/components/auth/PasswordInput.tsx`.
- Pruebas: tests/password-input.test.mjs:89; unsupported, composing and failing keyboard APIs never invent Caps Lock state; ios: no unreliable Caps Lock listener or red warning; android: no unreliable Caps Lock listener or red warning; blur, background and unmount clear stale warnings and remove listeners without changing visibility.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: La ausencia de aviso rojo nativo es el comportamiento requerido, no una funcionalidad pendiente de simular.

**1.09** — Autofill, foco, submit y manejadores existentes conservados; fixtures de lifecycle cargan PasswordInput real y preservan 401/403/429, refresh único y estabilidad.

- Archivos: `artifacts/go-app-mobile/components/auth/LoginRegisterPanel.tsx`, `artifacts/go-app-mobile/components/auth/PasswordInput.tsx`, `artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs`.
- Pruebas: tests/password-input.test.mjs:68; autofill metadata, focus ref, key callbacks and submit are retained while the eye is visible; tests/account-selection.test.mjs; usuario: iOS exposes a username/password pair without competing autocomplete hints; empresa: iOS exposes a username/password pair without competing autocomplete hints; native credential selection and email editing retain the password field without reading or storing passwords; Next focuses the existing password input; Go submits native-filled credentials through the existing contract; owner authenticates directly before selecting a public role and receives only verified owner contexts; direct owner login cannot expose ADMIN when the server rejects owner authority; tests/auth-navigation-lifecycle.test.mjs; real React mount/foreground/context changes do not restart Home authentication; remount hydrates persisted session once and manual logout keeps access open; mounted restoration and foreground permission 401 retains session without navigation loop; mounted restoration and foreground permission 403 retains session without navigation loop; mounted restoration and foreground permission 429 retains session without navigation loop; expired cold start shares one renewal across mounted permissions and Home; confirmed permission transitions never remount the User working screen or repeat auth/me.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: Faltan prueba de gestor de contraseñas/Face ID cuando lo ofrezca el sistema e inicio de sesión real desde PC/iPhone de la versión recuperada.

## Tarjeta 2 — Comprobaciones finales del backend — cinco cosas

**SIN EVIDENCIA SUFICIENTE.** La captura acredita el título, no cuáles eran las cinco comprobaciones. Trello no ofrece una sesión accesible en este contexto; no se leyeron su descripción ni su comentario.

## Tarjeta 3 — Limpieza de pantalla Nueva reserva

| ID | Requisito | Estado original MAIN | Estado rama local |
| --- | --- | --- | --- |
| 3.01 | Eliminar el bloque superior Mis reservas y sus estados | Comprobado automáticamente | AUTOMATIZADO |
| 3.02 | Conservar título Nueva reserva | Comprobado automáticamente | AUTOMATIZADO |
| 3.03 | Conservar categorías, recientes y buscador solicitados en esa instrucción | Comprobado automáticamente | AUTOMATIZADO |
| 3.04 | Recuperar el espacio sin dejar altura reservada al historial | Comprobado automáticamente | AUTOMATIZADO |
| 3.05 | Conservar reservas en Calendario/Listados y el diseño restante | Presente; falta prueba física | PENDIENTE_FISICO |

### Recuperación, archivos y comprobaciones por requisito

**3.01** — Limpieza publicada conservada; la proyección posterior del piloto filtra actividades sin recuperar el historial superior eliminado.

- Archivos: `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs; artifacts/go-app-mobile/tests/customer-booking.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**3.02** — Limpieza publicada conservada; la proyección posterior del piloto filtra actividades sin recuperar el historial superior eliminado.

- Archivos: `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs; artifacts/go-app-mobile/tests/customer-booking.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**3.03** — Limpieza publicada conservada; la proyección posterior del piloto filtra actividades sin recuperar el historial superior eliminado.

- Archivos: `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs; artifacts/go-app-mobile/tests/customer-booking.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**3.04** — Limpieza publicada conservada; la proyección posterior del piloto filtra actividades sin recuperar el historial superior eliminado.

- Archivos: `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs; artifacts/go-app-mobile/tests/customer-booking.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**3.05** — Limpieza publicada conservada; la proyección posterior del piloto filtra actividades sin recuperar el historial superior eliminado.

- Archivos: `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs; artifacts/go-app-mobile/tests/customer-booking.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

## Tarjeta 4 — Fluidez de tareas vencidas y corrección de textos cortados

| ID | Requisito | Estado original MAIN | Estado rama local |
| --- | --- | --- | --- |
| 4.01 | Conservar el panel legítimo de vencidas y Próxima visita | Ausente de MAIN | AUTOMATIZADO |
| 4.02 | REALIZADO retira la tarea actual y muestra la siguiente inmediatamente | Ausente de MAIN | AUTOMATIZADO |
| 4.03 | Aceptar siete decisiones rápidas sin esperar almacenamiento/notificaciones | Ausente de MAIN | AUTOMATIZADO |
| 4.04 | Persistir cada decisión en la tarea correcta, una sola vez | Ausente de MAIN | AUTOMATIZADO |
| 4.05 | Informar fallos y reintentar la tarea afectada sin perder las demás | Ausente de MAIN | AUTOMATIZADO |
| 4.06 | PENDIENTE conserva su comportamiento personal y fluido | Ausente de MAIN | AUTOMATIZADO |
| 4.07 | PROPONER CAMBIO abre el flujo correcto sin guardar hasta confirmar | Ausente de MAIN | AUTOMATIZADO |
| 4.08 | Mostrar los tres textos completos, centrados y legibles | Ausente de MAIN | AUTOMATIZADO |
| 4.09 | Preservar carrusel legítimo, gestos y geometría congelada | Parcial | AUTOMATIZADO |

### Recuperación, archivos y comprobaciones por requisito

**4.01** — Modelo y flujo recuperados. Decisiones personales explícitas, cola optimista con reintento por acción, propuesta mediante negociación canónica y guardias de propietario/contexto tras las esperas.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/components/AgendaOperativa.tsx`, `artifacts/go-app-mobile/components/landing/LandingActionCompletion.tsx`, `artifacts/go-app-mobile/hooks/useActionCompletion.ts`, `artifacts/go-app-mobile/hooks/useGoCalendarEntries.ts`, `artifacts/go-app-mobile/hooks/useGoLog.ts`, `artifacts/go-app-mobile/lib/goActionCompletion.ts`, `artifacts/go-app-mobile/lib/goActionCompletionStore.ts`, `artifacts/go-app-mobile/lib/goActionCompletionNotifications.ts`, `artifacts/go-app-mobile/lib/goLogStore.ts`.
- Pruebas: artifacts/go-app-mobile/tests/action-completion.test.mjs; artifacts/go-app-mobile/tests/action-completion-fluency.test.mjs; artifacts/go-app-mobile/tests/action-completion-integration.test.mjs; artifacts/go-app-mobile/tests/calendar-slot-flow.test.mjs; artifacts/go-app-mobile/tests/calendar-layout.test.mjs; artifacts/go-app-mobile/tests/go-log-sync.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**4.02** — Modelo y flujo recuperados. Decisiones personales explícitas, cola optimista con reintento por acción, propuesta mediante negociación canónica y guardias de propietario/contexto tras las esperas.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/components/AgendaOperativa.tsx`, `artifacts/go-app-mobile/components/landing/LandingActionCompletion.tsx`, `artifacts/go-app-mobile/hooks/useActionCompletion.ts`, `artifacts/go-app-mobile/hooks/useGoCalendarEntries.ts`, `artifacts/go-app-mobile/hooks/useGoLog.ts`, `artifacts/go-app-mobile/lib/goActionCompletion.ts`, `artifacts/go-app-mobile/lib/goActionCompletionStore.ts`, `artifacts/go-app-mobile/lib/goActionCompletionNotifications.ts`, `artifacts/go-app-mobile/lib/goLogStore.ts`.
- Pruebas: artifacts/go-app-mobile/tests/action-completion.test.mjs; artifacts/go-app-mobile/tests/action-completion-fluency.test.mjs; artifacts/go-app-mobile/tests/action-completion-integration.test.mjs; artifacts/go-app-mobile/tests/calendar-slot-flow.test.mjs; artifacts/go-app-mobile/tests/calendar-layout.test.mjs; artifacts/go-app-mobile/tests/go-log-sync.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**4.03** — Modelo y flujo recuperados. Decisiones personales explícitas, cola optimista con reintento por acción, propuesta mediante negociación canónica y guardias de propietario/contexto tras las esperas.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/components/AgendaOperativa.tsx`, `artifacts/go-app-mobile/components/landing/LandingActionCompletion.tsx`, `artifacts/go-app-mobile/hooks/useActionCompletion.ts`, `artifacts/go-app-mobile/hooks/useGoCalendarEntries.ts`, `artifacts/go-app-mobile/hooks/useGoLog.ts`, `artifacts/go-app-mobile/lib/goActionCompletion.ts`, `artifacts/go-app-mobile/lib/goActionCompletionStore.ts`, `artifacts/go-app-mobile/lib/goActionCompletionNotifications.ts`, `artifacts/go-app-mobile/lib/goLogStore.ts`.
- Pruebas: artifacts/go-app-mobile/tests/action-completion.test.mjs; artifacts/go-app-mobile/tests/action-completion-fluency.test.mjs; artifacts/go-app-mobile/tests/action-completion-integration.test.mjs; artifacts/go-app-mobile/tests/calendar-slot-flow.test.mjs; artifacts/go-app-mobile/tests/calendar-layout.test.mjs; artifacts/go-app-mobile/tests/go-log-sync.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**4.04** — Modelo y flujo recuperados. Decisiones personales explícitas, cola optimista con reintento por acción, propuesta mediante negociación canónica y guardias de propietario/contexto tras las esperas.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/components/AgendaOperativa.tsx`, `artifacts/go-app-mobile/components/landing/LandingActionCompletion.tsx`, `artifacts/go-app-mobile/hooks/useActionCompletion.ts`, `artifacts/go-app-mobile/hooks/useGoCalendarEntries.ts`, `artifacts/go-app-mobile/hooks/useGoLog.ts`, `artifacts/go-app-mobile/lib/goActionCompletion.ts`, `artifacts/go-app-mobile/lib/goActionCompletionStore.ts`, `artifacts/go-app-mobile/lib/goActionCompletionNotifications.ts`, `artifacts/go-app-mobile/lib/goLogStore.ts`.
- Pruebas: artifacts/go-app-mobile/tests/action-completion.test.mjs; artifacts/go-app-mobile/tests/action-completion-fluency.test.mjs; artifacts/go-app-mobile/tests/action-completion-integration.test.mjs; artifacts/go-app-mobile/tests/calendar-slot-flow.test.mjs; artifacts/go-app-mobile/tests/calendar-layout.test.mjs; artifacts/go-app-mobile/tests/go-log-sync.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**4.05** — Modelo y flujo recuperados. Decisiones personales explícitas, cola optimista con reintento por acción, propuesta mediante negociación canónica y guardias de propietario/contexto tras las esperas.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/components/AgendaOperativa.tsx`, `artifacts/go-app-mobile/components/landing/LandingActionCompletion.tsx`, `artifacts/go-app-mobile/hooks/useActionCompletion.ts`, `artifacts/go-app-mobile/hooks/useGoCalendarEntries.ts`, `artifacts/go-app-mobile/hooks/useGoLog.ts`, `artifacts/go-app-mobile/lib/goActionCompletion.ts`, `artifacts/go-app-mobile/lib/goActionCompletionStore.ts`, `artifacts/go-app-mobile/lib/goActionCompletionNotifications.ts`, `artifacts/go-app-mobile/lib/goLogStore.ts`.
- Pruebas: artifacts/go-app-mobile/tests/action-completion.test.mjs; artifacts/go-app-mobile/tests/action-completion-fluency.test.mjs; artifacts/go-app-mobile/tests/action-completion-integration.test.mjs; artifacts/go-app-mobile/tests/calendar-slot-flow.test.mjs; artifacts/go-app-mobile/tests/calendar-layout.test.mjs; artifacts/go-app-mobile/tests/go-log-sync.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**4.06** — Modelo y flujo recuperados. Decisiones personales explícitas, cola optimista con reintento por acción, propuesta mediante negociación canónica y guardias de propietario/contexto tras las esperas.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/components/AgendaOperativa.tsx`, `artifacts/go-app-mobile/components/landing/LandingActionCompletion.tsx`, `artifacts/go-app-mobile/hooks/useActionCompletion.ts`, `artifacts/go-app-mobile/hooks/useGoCalendarEntries.ts`, `artifacts/go-app-mobile/hooks/useGoLog.ts`, `artifacts/go-app-mobile/lib/goActionCompletion.ts`, `artifacts/go-app-mobile/lib/goActionCompletionStore.ts`, `artifacts/go-app-mobile/lib/goActionCompletionNotifications.ts`, `artifacts/go-app-mobile/lib/goLogStore.ts`.
- Pruebas: artifacts/go-app-mobile/tests/action-completion.test.mjs; artifacts/go-app-mobile/tests/action-completion-fluency.test.mjs; artifacts/go-app-mobile/tests/action-completion-integration.test.mjs; artifacts/go-app-mobile/tests/calendar-slot-flow.test.mjs; artifacts/go-app-mobile/tests/calendar-layout.test.mjs; artifacts/go-app-mobile/tests/go-log-sync.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**4.07** — Modelo y flujo recuperados. Decisiones personales explícitas, cola optimista con reintento por acción, propuesta mediante negociación canónica y guardias de propietario/contexto tras las esperas.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/components/AgendaOperativa.tsx`, `artifacts/go-app-mobile/components/landing/LandingActionCompletion.tsx`, `artifacts/go-app-mobile/hooks/useActionCompletion.ts`, `artifacts/go-app-mobile/hooks/useGoCalendarEntries.ts`, `artifacts/go-app-mobile/hooks/useGoLog.ts`, `artifacts/go-app-mobile/lib/goActionCompletion.ts`, `artifacts/go-app-mobile/lib/goActionCompletionStore.ts`, `artifacts/go-app-mobile/lib/goActionCompletionNotifications.ts`, `artifacts/go-app-mobile/lib/goLogStore.ts`.
- Pruebas: artifacts/go-app-mobile/tests/action-completion.test.mjs; artifacts/go-app-mobile/tests/action-completion-fluency.test.mjs; artifacts/go-app-mobile/tests/action-completion-integration.test.mjs; artifacts/go-app-mobile/tests/calendar-slot-flow.test.mjs; artifacts/go-app-mobile/tests/calendar-layout.test.mjs; artifacts/go-app-mobile/tests/go-log-sync.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**4.08** — Modelo y flujo recuperados. Decisiones personales explícitas, cola optimista con reintento por acción, propuesta mediante negociación canónica y guardias de propietario/contexto tras las esperas.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/components/AgendaOperativa.tsx`, `artifacts/go-app-mobile/components/landing/LandingActionCompletion.tsx`, `artifacts/go-app-mobile/hooks/useActionCompletion.ts`, `artifacts/go-app-mobile/hooks/useGoCalendarEntries.ts`, `artifacts/go-app-mobile/hooks/useGoLog.ts`, `artifacts/go-app-mobile/lib/goActionCompletion.ts`, `artifacts/go-app-mobile/lib/goActionCompletionStore.ts`, `artifacts/go-app-mobile/lib/goActionCompletionNotifications.ts`, `artifacts/go-app-mobile/lib/goLogStore.ts`.
- Pruebas: artifacts/go-app-mobile/tests/action-completion.test.mjs; artifacts/go-app-mobile/tests/action-completion-fluency.test.mjs; artifacts/go-app-mobile/tests/action-completion-integration.test.mjs; artifacts/go-app-mobile/tests/calendar-slot-flow.test.mjs; artifacts/go-app-mobile/tests/calendar-layout.test.mjs; artifacts/go-app-mobile/tests/go-log-sync.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**4.09** — Modelo y flujo recuperados. Decisiones personales explícitas, cola optimista con reintento por acción, propuesta mediante negociación canónica y guardias de propietario/contexto tras las esperas.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/components/AgendaOperativa.tsx`, `artifacts/go-app-mobile/components/landing/LandingActionCompletion.tsx`, `artifacts/go-app-mobile/hooks/useActionCompletion.ts`, `artifacts/go-app-mobile/hooks/useGoCalendarEntries.ts`, `artifacts/go-app-mobile/hooks/useGoLog.ts`, `artifacts/go-app-mobile/lib/goActionCompletion.ts`, `artifacts/go-app-mobile/lib/goActionCompletionStore.ts`, `artifacts/go-app-mobile/lib/goActionCompletionNotifications.ts`, `artifacts/go-app-mobile/lib/goLogStore.ts`.
- Pruebas: artifacts/go-app-mobile/tests/action-completion.test.mjs; artifacts/go-app-mobile/tests/action-completion-fluency.test.mjs; artifacts/go-app-mobile/tests/action-completion-integration.test.mjs; artifacts/go-app-mobile/tests/calendar-slot-flow.test.mjs; artifacts/go-app-mobile/tests/calendar-layout.test.mjs; artifacts/go-app-mobile/tests/go-log-sync.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

## Tarjeta 5 — Horarios adaptativos por profesional y sincronización de agendas/reservas

| ID | Requisito | Estado original MAIN | Estado rama local |
| --- | --- | --- | --- |
| 5.01 | Un motor central para disponibilidad, confirmación y agendas | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.02 | Minutos enteros exactos sin redondeos obligatorios | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.03 | Ofrecer 11:37 y alternativas válidas | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.04 | Modo simple continuo compatible con servicios antiguos | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.05 | Fases ordenadas de trabajo/espera con minutos exactos | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.06 | Separar tiempo cliente e intervalos reales de intervención | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.07 | Reutilizar espera solo si el siguiente trabajo permite regresar a tiempo | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.08 | Disponibilidad independiente de cada profesional | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.09 | Cruzar horarios de empresa/profesional y horarios partidos | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.10 | Respetar ausencias, descansos, excepciones y bloqueos persistidos | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.11 | Respetar preparación/limpieza configuradas explícitamente | Comprobado en código | SOLO_CODIGO |
| 5.12 | Recursos por fase o visita completa y capacidades | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.13 | Servicios múltiples con secuencia y dependencias, sin simultaneidad arbitraria | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.14 | Fecha, hora, servicio y profesional consultan la misma autoridad | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.15 | Cambio de fecha/servicio/profesional invalida la selección anterior | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.16 | Asignación automática conserva un profesional concreto al confirmar | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.17 | Revalidación transaccional, concurrencia e idempotencia | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.18 | Catálogo obsoleto informa y no confirma otra secuencia/precio silenciosamente | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.19 | Una reserva conserva intervalo completo, fases y recibo persistente | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.20 | Calendario cliente muestra toda la duración | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.21 | Empresa/profesional distinguen trabajo, espera y recursos | Presente; falta prueba física | PENDIENTE_FISICO |
| 5.22 | Cuenta profesional independiente accede solo a sus datos autorizados | Parcial | PARCIAL_DEPENDENCIA |
| 5.23 | Modificar/cancelar/reprogramar recalcula ocupación y preserva historial/pagos | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.24 | Medianoche y cambios de horario sin adivinar instantes ambiguos | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 5.25 | Compatibilidad completa de datos antiguos, circuitos DEMO/SQL y activación real | Parcial | PARCIAL_DEPENDENCIA |

### Recuperación, archivos y comprobaciones por requisito

**5.01** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/booking.ts`, `artifacts/api-server/src/routes/bookingTimeline.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/booking-timeline.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.02** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/serviceTiming.ts`, `artifacts/go-app-mobile/data/bookingTimeline.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/service-timing-config.test.mjs (histórica/disponible; no reejecutada); artifacts/go-app-mobile/tests/booking-timeline.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.03** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/bookingTimeline.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/booking-timeline.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline.test.mjs
- Límite: Caso C SQL histórico; el test móvil 11:37 fue revalidado en esta recuperación. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.04** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/serviceTiming.ts`, `artifacts/go-app-mobile/data/booking.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/service-timing-config.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: Legacy continuo conservador; no convertir espera inexistente. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.05** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/serviceTiming.ts`, `artifacts/go-app-mobile/components/empresa/EmpresaConfigScreen.tsx`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/service-timing-config.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.06** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/bookingTimeline.ts`, `artifacts/go-app-mobile/data/customerBookingProjection.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/booking-timeline.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline.test.mjs
- Límite: La prueba móvil usa planes de servidor ficticio; la ejecución del plan SQL tiene evidencia histórica separada. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.07** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: Casos L/M de SQL; no reejecutados por este agente. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.08** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/booking.ts`, `artifacts/api-server/src/routes/bookingTimeline.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/booking-timeline-ui.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline-ui.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.09** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/contexts/GoBusinessConfigContext.tsx`, `artifacts/go-app-mobile/data/serviceTiming.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/service-timing-config.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.10** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/contexts/GoBusinessConfigContext.tsx`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/service-timing-config.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: No acredita conversión de los ManualBlock locales anteriores. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.11** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/serviceTiming.ts`, `artifacts/go-app-mobile/components/empresa/EmpresaConfigScreen.tsx`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/service-timing-config.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: Preparación y limpieza se pueden configurar como fases explícitas; no se infieren por nombre. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.12** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/serviceTiming.ts`, `artifacts/go-app-mobile/contexts/GoBusinessConfigContext.tsx`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/service-timing-config.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.13** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/bookingServices.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/booking-services.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.14** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/booking.ts`, `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`, `artifacts/go-app-mobile/components/booking/GoProveedorReservaSheet.tsx`, `artifacts/api-server/src/routes/bookingTimeline.ts`.
- Pruebas: artifacts/go-app-mobile/tests/booking-timeline.test.mjs (recuperación local; alcance limitado); artifacts/go-app-mobile/tests/booking-timeline-ui.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline.test.mjs, artifacts/go-app-mobile/tests/booking-timeline-ui.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.15** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`, `artifacts/go-app-mobile/components/booking/GoProveedorReservaSheet.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/booking-timeline-ui.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline-ui.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.16** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/booking.ts`, `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`, `artifacts/go-app-mobile/components/booking/GoProveedorReservaSheet.tsx`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/booking-timeline.test.mjs (recuperación local; alcance limitado); artifacts/go-app-mobile/tests/booking-timeline-ui.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline.test.mjs, artifacts/go-app-mobile/tests/booking-timeline-ui.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.17** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`, `artifacts/go-app-mobile/data/booking.ts`.
- Pruebas: artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada); artifacts/go-app-mobile/tests/booking-timeline.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline.test.mjs
- Límite: Reintento HTTP con command estable verificado ahora; concurrencia de la transacción SQL solo evidencia aislada histórica. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.18** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/booking.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/booking-timeline.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.19** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/booking.ts`, `artifacts/go-app-mobile/data/bookingTimeline.ts`, `artifacts/go-app-mobile/data/customerBookingProjection.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/booking-timeline.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.20** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/customerBookingProjection.ts`, `artifacts/go-app-mobile/components/AgendaOperativa.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/booking-timeline.test.mjs (recuperación local; alcance limitado); artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline.test.mjs, artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.21** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/AgendaOperativa.tsx`, `artifacts/go-app-mobile/data/customerBookingProjection.ts`.
- Pruebas: artifacts/go-app-mobile/tests/booking-timeline.test.mjs (recuperación local; alcance limitado); artifacts/go-app-mobile/tests/business-booking-source.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline.test.mjs
- Límite: Representación física de trabajo/espera/recursos en iPhone sigue pendiente. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.22** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/AgendaOperativa.tsx`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/business-booking-source.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: PARCIAL: no se ha implementado una cuenta profesional independiente ni una nueva política de lectura profesional. La perspectiva Empresa no demuestra autorización de esa cuenta. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.23** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/api-server/src/routes/bookingNegotiation.ts`, `artifacts/api-server/supabase/drafts/booking_negotiation_v1.sql`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`, `artifacts/go-app-mobile/data/demoBookingRepository.ts`.
- Pruebas: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-negotiation.postgres.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.24** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/booking.ts`, `artifacts/go-app-mobile/data/bookingTimeline.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/booking-timeline.test.mjs (recuperación local; alcance limitado); artifacts/go-app-mobile/tests/booking-timeline-ui.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline.test.mjs, artifacts/go-app-mobile/tests/booking-timeline-ui.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**5.25** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/demoBookingRepository.ts`, `artifacts/go-app-mobile/data/booking.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/customer-booking.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/customer-booking.test.mjs
- Límite: PARCIAL: datos antiguos conservados; AsyncStorage DEMO no ejecuta fases SQL ni asociaciones, ManualBlock antiguo no migrado, SQL de producción no aprobado/aplicado. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

## Tarjeta 6 — Asociación transversal de productos y servicios en GO Empresa

| ID | Requisito | Estado original MAIN | Estado rama local |
| --- | --- | --- | --- |
| 6.01 | Reutilizar catálogo existente, sin sistema paralelo | Comprobado en código | SOLO_CODIGO |
| 6.02 | Relación servicio → producto | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 6.03 | Relación servicio → servicio | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 6.04 | Relaciones producto → producto y producto → servicio | Comprobado en código | SOLO_CODIGO |
| 6.05 | Múltiples asociaciones por elemento | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 6.06 | Distinguir incluido/opcional/obligatorio | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 6.07 | Opcional solo tras aceptación; rechazarlo no lo cobra | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 6.08 | Obligatorio requiere consentimiento antes de continuar | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 6.09 | Nombre y tarifa actual de cada complemento | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 6.10 | Incluido no produce doble cargo | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 6.11 | Crear/modificar/activar/desactivar/eliminar asociaciones | Comprobado en código | SOLO_CODIGO |
| 6.12 | Usar IDs existentes, sin duplicar productos/servicios | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 6.13 | Aislamiento por empresa y permisos | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 6.14 | Rechazar ciclos, duplicados, inexistentes e inactivos | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 6.15 | Guardar detalle y precio aceptados en una reserva única | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 6.16 | Registrar complementos en ventas cuando se venda el elemento | Parcial | PARCIAL_DEPENDENCIA |
| 6.17 | Respetar duración/disponibilidad/stock sin inventarlos | Parcial | PARCIAL_DEPENDENCIA |
| 6.18 | Reutilización transversal e interfaz sin regresiones | Presente; falta prueba física | PENDIENTE_FISICO |

### Recuperación, archivos y comprobaciones por requisito

**6.01** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/catalogAssociations.ts`, `artifacts/go-app-mobile/components/empresa/CatalogAssociationManager.tsx`, `artifacts/go-app-mobile/components/empresa/EmpresaConfigScreen.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/catalog-associations.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: Catálogo existente conservado; no se añade sistema paralelo. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.02** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/catalogAssociations.ts`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`, `artifacts/go-app-mobile/components/booking/CatalogComplementSelector.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/catalog-associations.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.03** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/catalogAssociations.ts`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/catalog-associations.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.04** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/empresa/CatalogAssociationManager.tsx`, `artifacts/api-server/src/routes/catalogAssociations.ts`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: Las cuatro relaciones están representadas y tienen prueba SQL existente; no se afirma que exista un circuito de venta/stock. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.05** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/empresa/CatalogAssociationManager.tsx`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.06** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/catalogAssociations.ts`, `artifacts/go-app-mobile/components/empresa/CatalogAssociationManager.tsx`, `artifacts/go-app-mobile/components/booking/CatalogComplementSelector.tsx`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/catalog-associations.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.07** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/booking/CatalogComplementSelector.tsx`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/catalog-associations.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.08** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/booking/CatalogComplementSelector.tsx`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/catalog-associations.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.09** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/booking/CatalogComplementSelector.tsx`, `artifacts/api-server/src/routes/catalogAssociations.ts`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/catalog-associations.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.10** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/catalogAssociations.ts`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/catalog-associations.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.11** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/empresa/CatalogAssociationManager.tsx`, `artifacts/api-server/src/routes/catalogAssociations.ts`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/catalog-associations.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: La prueba táctil del gestor en dispositivo no está acreditada. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.12** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/api-server/src/routes/catalogAssociations.ts`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/catalog-associations.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.13** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/api-server/src/routes/catalogAssociations.ts`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada); artifacts/go-app-mobile/tests/catalog-associations.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.14** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`, `artifacts/api-server/src/routes/catalogAssociations.ts`.
- Pruebas: artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.15** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/booking.ts`, `artifacts/go-app-mobile/data/customerBookingProjection.ts`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada); artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: Negociación DEMO y de SQL son circuitos distintos; conservar esa distinción. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.16** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/catalogAssociations.ts`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: .
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: PARCIAL y dependencia real: no hay autoridad de ventas operativa en esta base. No se implementa una venta ficticia ni se considera cubierta por el presupuesto de reserva. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.17** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/serviceTiming.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: PARCIAL: duración/ocupación cubiertas por el motor. Stock gestionado se rechaza hasta contar con autoridad de inventario; no se inventa existencias. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**6.18** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/catalogAssociations.ts`, `artifacts/go-app-mobile/components/booking/CatalogComplementSelector.tsx`, `artifacts/go-app-mobile/components/empresa/CatalogAssociationManager.tsx`, `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`, `artifacts/go-app-mobile/components/booking/GoProveedorReservaSheet.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/catalog-associations.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada); artifacts/go-app-mobile/tests/booking-timeline-ui.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline-ui.test.mjs
- Límite: Pendiente física y activación revisada del SQL; DEMO no ofrece el contrato completo de asociaciones. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

## Tarjeta 7 — Lógica de orden de citas vencidas

**SIN EVIDENCIA SUFICIENTE.** El título está confirmado, pero no se recuperó su descripción/comentario ni una regla inequívoca de orden de citas vencidas. No se sustituye por el orden de próximas citas ni se presupone que equivale íntegramente a Confirmación personal de acciones.

## Tarjeta 8 — Varios servicios; dirección actual y bug de lectura; filtro de formularios DEMO

| ID | Requisito | Estado original MAIN | Estado rama local |
| --- | --- | --- | --- |
| 8.01 | Seleccionar varios servicios sin avance automático al primero | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 8.02 | Selecciones marcadas; pulsar de nuevo desmarca | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 8.03 | Guardar confirma y continúa el flujo habitual | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 8.04 | Una reserva conserva todos los IDs y servicios | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 8.05 | Precio total exacto, precios desconocidos no se presentan como cero | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 8.06 | Duración total y especialidades de todos los servicios | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 8.07 | Disponibilidad y recursos durante todo el intervalo/fases | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 8.08 | Sin duplicados; una cita lógica en calendarios; reabrir y cancelar | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 8.09 | Compatibilidad con un servicio y otros sectores del selector | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 8.10 | Obtener coordenadas con permisos existentes | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 8.11 | Geocodificación inversa fiable rellena dirección legible | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 8.12 | Guardar dirección y coordenadas en la misma empresa sin pisar edición manual | Comprobado en código | AUTOMATIZADO_CONSERVADO |
| 8.13 | Sin dirección fiable conserva coordenadas y avisa, sin inventar | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 8.14 | Comprobar geolocalización real y persistencia en iPhone | Presente; falta prueba física | PENDIENTE_FISICO |
| 8.15 | Corregir el «bug lectura» exacto de la tarjeta | Sin evidencia suficiente | SIN_EVIDENCIA |
| 8.16 | Eliminar el filtro de formularios DEMO al que se refería la tarjeta | Sin evidencia suficiente | SIN_EVIDENCIA |

### Recuperación, archivos y comprobaciones por requisito

**8.01** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`, `artifacts/go-app-mobile/components/booking/GoProveedorReservaSheet.tsx`, `artifacts/go-app-mobile/data/bookingServices.ts`.
- Pruebas: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs (recuperación local; alcance limitado); artifacts/go-app-mobile/tests/booking-services.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**8.02** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**8.03** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**8.04** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/booking.ts`, `artifacts/go-app-mobile/data/demoBookingRepository.ts`, `artifacts/go-app-mobile/data/customerBookingProjection.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs (recuperación local; alcance limitado); artifacts/go-app-mobile/tests/booking-timeline.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/go-app-mobile/tests/booking-timeline.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**8.05** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/bookingServices.ts`, `artifacts/api-server/supabase/drafts/catalog_associations_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/booking-services.test.mjs (histórica/disponible; no reejecutada); artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**8.06** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/bookingServices.ts`, `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/booking-services.test.mjs (histórica/disponible; no reejecutada); artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**8.07** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/booking.ts`, `artifacts/api-server/supabase/drafts/booking_timeline_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/booking-timeline.test.mjs (recuperación local; alcance limitado); artifacts/go-app-mobile/tests/booking-timeline-ui.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-timeline.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/booking-timeline.test.mjs, artifacts/go-app-mobile/tests/booking-timeline-ui.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**8.08** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/demoBookingRepository.ts`, `artifacts/go-app-mobile/data/booking.ts`, `artifacts/go-app-mobile/data/customerBookingProjection.ts`.
- Pruebas: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs (recuperación local; alcance limitado); artifacts/go-app-mobile/tests/customer-booking.test.mjs (recuperación local; alcance limitado); artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/go-app-mobile/tests/customer-booking.test.mjs, artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**8.09** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/bookingServices.ts`, `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`, `artifacts/go-app-mobile/data/demoBookingRepository.ts`.
- Pruebas: artifacts/go-app-mobile/tests/booking-services.test.mjs (histórica/disponible; no reejecutada); artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs
- Límite: La regresión de fisioterapia se ejecuta en EMPRESA DEMO propietaria autorizada; no vuelve a publicarla en USUARIO piloto. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**8.10** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/empresa/EmpresaConfigScreen.tsx`, `artifacts/go-app-mobile/components/empresa/EmpresaConfigScreen.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/business-form.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**8.11** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/empresa/EmpresaConfigScreen.tsx`, `artifacts/go-app-mobile/components/empresa/EmpresaConfigScreen.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/business-form.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**8.12** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/empresa/EmpresaConfigScreen.tsx`, `artifacts/go-app-mobile/components/empresa/EmpresaConfigScreen.tsx`, `artifacts/go-app-mobile/contexts/GoBusinessConfigContext.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/business-form.test.mjs (histórica/disponible; no reejecutada); DEMO GPS fills the editable street field and keeps both address and coordinates after Reload (recuperación local; alcance limitado); typing a manual address while the native lookup is pending is not overwritten (recuperación local; alcance limitado).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: Guardado capturado por UUID/owner y protección de edición manual preservados; no se ha editado una empresa del usuario. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy. Son callbacks reales de la pantalla y almacenamiento DEMO ligado al store de esa empresa, con proveedor GPS y vínculo owner/UUID controlados. No prueban GPS físico ni una carrera real de cambio de usuario/empresa mientras iOS concede permisos; no elevan 8.14 a superado.

**8.13** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/empresa/EmpresaConfigScreen.tsx`, `artifacts/go-app-mobile/components/empresa/EmpresaConfigScreen.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/business-form.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**8.14** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/components/empresa/EmpresaConfigScreen.tsx`, `artifacts/go-app-mobile/contexts/GoBusinessConfigContext.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/business-form.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: PENDIENTE FÍSICA: pruebas del adaptador no equivalen a GPS real ni a reapertura de datos en iPhone. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**8.15** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: .
- Pruebas: .
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: SIN EVIDENCIA: no se ha recuperado el síntoma original de «bug lectura». La normalización adicional de categoría no se presenta como resolución de este requisito desconocido. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**8.16** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: .
- Pruebas: .
- Regresiones: Se conserva la evidencia anterior; no se atribuye una nueva ejecución a este requisito.
- Límite: SIN EVIDENCIA: no se conoce qué filtro de formularios DEMO quiso eliminar la tarjeta. No se elimina una allowlist protectora por suposición. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

## Tarjeta 9 — Variantes de Landing solo en Administrador y letras en satélites

| ID | Requisito | Estado original MAIN | Estado rama local |
| --- | --- | --- | --- |
| 9.01 | Configurar variantes solo en Herramientas ADMIN autorizado | Fallo confirmado | AUTOMATIZADO |
| 9.02 | USUARIO/EMPRESA no pueden seleccionar ni previsualizar variantes | Fallo confirmado | AUTOMATIZADO |
| 9.03 | USUARIO conserva la presentación asignada sin perder preferencia | Comprobado automáticamente | AUTOMATIZADO |
| 9.04 | ADMIN conserva las cuatro variantes A/B/C/D | Comprobado automáticamente | AUTOMATIZADO |
| 9.05 | Nombres de satélites funcionales siempre visibles | Fallo confirmado | AUTOMATIZADO |
| 9.06 | Órbitas pasivas pueden conservar su minimalismo | Comprobado en código | AUTOMATIZADO |
| 9.07 | Conservar rutas, handlers, colores y geometría congelada | Comprobado automáticamente | AUTOMATIZADO |
| 9.08 | Verificar en iPhone todas las variantes y apariencia conservada | Presente; falta prueba física | PENDIENTE_FISICO |

### Recuperación, archivos y comprobaciones por requisito

**9.01** — Delta histórico recuperado: selector solo ADMIN, lectura de preferencia conservada en USUARIO y nombres funcionales visibles. No se reemplazan el renderer, las rutas ni la geometría congelados.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/admin-tools-matrix.test.mjs; artifacts/go-app-mobile/tests/landing-visual-variants.test.mjs; artifacts/go-app-mobile/tests/landing-satellite-labels.test.mjs; artifacts/go-app-mobile/tests/landing-lower-redistribution.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**9.02** — Delta histórico recuperado: selector solo ADMIN, lectura de preferencia conservada en USUARIO y nombres funcionales visibles. No se reemplazan el renderer, las rutas ni la geometría congelados.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/admin-tools-matrix.test.mjs; artifacts/go-app-mobile/tests/landing-visual-variants.test.mjs; artifacts/go-app-mobile/tests/landing-satellite-labels.test.mjs; artifacts/go-app-mobile/tests/landing-lower-redistribution.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**9.03** — Delta histórico recuperado: selector solo ADMIN, lectura de preferencia conservada en USUARIO y nombres funcionales visibles. No se reemplazan el renderer, las rutas ni la geometría congelados.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/admin-tools-matrix.test.mjs; artifacts/go-app-mobile/tests/landing-visual-variants.test.mjs; artifacts/go-app-mobile/tests/landing-satellite-labels.test.mjs; artifacts/go-app-mobile/tests/landing-lower-redistribution.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**9.04** — Delta histórico recuperado: selector solo ADMIN, lectura de preferencia conservada en USUARIO y nombres funcionales visibles. No se reemplazan el renderer, las rutas ni la geometría congelados.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/admin-tools-matrix.test.mjs; artifacts/go-app-mobile/tests/landing-visual-variants.test.mjs; artifacts/go-app-mobile/tests/landing-satellite-labels.test.mjs; artifacts/go-app-mobile/tests/landing-lower-redistribution.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**9.05** — Delta histórico recuperado: selector solo ADMIN, lectura de preferencia conservada en USUARIO y nombres funcionales visibles. No se reemplazan el renderer, las rutas ni la geometría congelados.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/admin-tools-matrix.test.mjs; artifacts/go-app-mobile/tests/landing-visual-variants.test.mjs; artifacts/go-app-mobile/tests/landing-satellite-labels.test.mjs; artifacts/go-app-mobile/tests/landing-lower-redistribution.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**9.06** — Delta histórico recuperado: selector solo ADMIN, lectura de preferencia conservada en USUARIO y nombres funcionales visibles. No se reemplazan el renderer, las rutas ni la geometría congelados.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/admin-tools-matrix.test.mjs; artifacts/go-app-mobile/tests/landing-visual-variants.test.mjs; artifacts/go-app-mobile/tests/landing-satellite-labels.test.mjs; artifacts/go-app-mobile/tests/landing-lower-redistribution.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**9.07** — Delta histórico recuperado: selector solo ADMIN, lectura de preferencia conservada en USUARIO y nombres funcionales visibles. No se reemplazan el renderer, las rutas ni la geometría congelados.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/admin-tools-matrix.test.mjs; artifacts/go-app-mobile/tests/landing-visual-variants.test.mjs; artifacts/go-app-mobile/tests/landing-satellite-labels.test.mjs; artifacts/go-app-mobile/tests/landing-lower-redistribution.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

**9.08** — Delta histórico recuperado: selector solo ADMIN, lectura de preferencia conservada en USUARIO y nombres funcionales visibles. No se reemplazan el renderer, las rutas ni la geometría congelados.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/admin-tools-matrix.test.mjs; artifacts/go-app-mobile/tests/landing-visual-variants.test.mjs; artifacts/go-app-mobile/tests/landing-satellite-labels.test.mjs; artifacts/go-app-mobile/tests/landing-lower-redistribution.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/landing-fixed-headers.test.mjs, artifacts/go-app-mobile/tests/landing-panel-commands.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-actions.test.mjs, artifacts/go-app-mobile/tests/landing-proposal-navigation.test.mjs
- Límite: Pruebas con hosts/almacenamiento ficticios y cálculos de geometría; sin aceptación física de esta rama en iPhone.

## Tarjeta 10 — Notas pisadas por teclado; micrófono y campana de la instrucción original

| ID | Requisito | Estado original MAIN | Estado rama local |
| --- | --- | --- | --- |
| 10.01 | Ajustar ventana de Notas al teclado sin perder el diseño cerrado | Ausente de MAIN | PENDIENTE_FISICO |
| 10.02 | Campo activo visible y desplazamiento interior cuando haga falta | Ausente de MAIN | PENDIENTE_FISICO |
| 10.03 | Conservar accesibles campana, controles y cierre | Ausente de MAIN | PENDIENTE_FISICO |
| 10.04 | Micrófono dicta al campo activo respetando permisos | Ausente de MAIN | DEPENDENCIA_EXTERNA |
| 10.05 | Conservar texto previo al dictar y rechazar respuestas tardías | Ausente de MAIN | AUTOMATIZADO |
| 10.06 | Indicar escucha/error real, sin fingir transcripción | Ausente de MAIN | AUTOMATIZADO |
| 10.07 | Campana con once anticipaciones entre 5 minutos y 24 horas | Ausente de MAIN | AUTOMATIZADO |
| 10.08 | Guardar anticipación/fecha/hora con nota y contexto | Ausente de MAIN | AUTOMATIZADO |
| 10.09 | Programar/cancelar/reprogramar aviso nativo sin fechas pasadas | Ausente de MAIN | PENDIENTE_FISICO |
| 10.10 | Un aviso efectivo si nota adjunta y GO comparten recordatorio | Ausente de MAIN | AUTOMATIZADO |
| 10.11 | Persistencia, aislamiento y prueba física de teclado/voz/avisos | Ausente de MAIN | PENDIENTE_FISICO |

### Recuperación, archivos y comprobaciones por requisito

**10.01** — Recuperados cálculo de altura según ventana/teclado/safe area/cabecera y opción noteKeyboardScroll solo para NOTA.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/lib/goNoteTools.ts`.
- Pruebas: tests/go-note-functions.test.mjs:124,170; keyboard viewport adapts to screen, safe area, keyboard frame and measured header instead of a phone-specific height; keyboard scrolling is opt-in for Nota only; normal closed-keyboard layout, other sheets and Landing remain untouched.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: El cálculo y conexión se prueban; falta comparar apertura/cierre del teclado en iPhone sin cambio visual residual.

**10.02** — KeyboardAwareScrollView y foco por campo habilitados únicamente dentro del cuerpo de Nota; no scroll global de Landing.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/lib/goNoteTools.ts`.
- Pruebas: tests/go-note-functions.test.mjs:124,170; keyboard viewport adapts to screen, safe area, keyboard frame and measured header instead of a phone-specific height; keyboard scrolling is opt-in for Nota only; normal closed-keyboard layout, other sheets and Landing remain untouched.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: La prueba estructural no acredita oclusión real del teclado o desplazamiento táctil.

**10.03** — Campana y controles conservados; gesto lateral de cierre no captura el desplazamiento cuando Nota tiene teclado abierto.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/components/notes/GoNoteReminderPicker.tsx`.
- Pruebas: tests/go-note-functions.test.mjs:124,170; keyboard viewport adapts to screen, safe area, keyboard frame and measured header instead of a phone-specific height; keyboard scrolling is opt-in for Nota only; normal closed-keyboard layout, other sheets and Landing remain untouched; tests/go-note-functions.test.mjs:52,186; bell offers exactly the eleven requested offsets, with Spanish and English labels; bell menu ES: all choices, clear selection and saved-note access are explicit; bell menu EN: all choices, clear selection and saved-note access are explicit.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: Comprobar accesibilidad táctil de controles/cierre con tamaños y teclado reales.

**10.04** — Hook final recuperado; captura el campo activo al iniciar y reutiliza permisos/captura/transcripción existentes. No crea un servicio de voz paralelo.

- Archivos: `artifacts/go-app-mobile/hooks/useGoNoteVoice.ts`, `artifacts/go-app-mobile/hooks/useBookingVoice.ts`, `artifacts/go-app-mobile/lib/bookingAssistant.ts`, `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: tests/go-note-functions.test.mjs:147,154,160; microphone targets the field selected when listening starts and appends without clearing existing writing; closing the note or changing identity aborts dictation and rejects delayed transcription; the existing title limit is preserved, with a visible full dictation notice rather than silent truncation.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: Pasarela 3001 de verificación no permite GET capabilities (404) ni POST transcribe (405); el hook se detiene en capabilities. No se abrieron rutas. Falta conexión de prueba autorizada con proveedor y sesión, y dictado físico. Web usa SpeechRecognition, sujeto al navegador y sus permisos.

**10.05** — Dictado añade al texto, conserva identidad/campo del inicio y descarta resultados tras cierre/cambio de identidad. Título16 conserva límite con aviso de transcripción completa en lugar de corte silencioso.

- Archivos: `artifacts/go-app-mobile/hooks/useGoNoteVoice.ts`, `artifacts/go-app-mobile/lib/goNoteTools.ts`.
- Pruebas: tests/go-note-functions.test.mjs:147,154,160; microphone targets the field selected when listening starts and appends without clearing existing writing; closing the note or changing identity aborts dictation and rejects delayed transcription; the existing title limit is preserved, with a visible full dictation notice rather than silent truncation.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: Transcripciones inyectadas en el fixture; depende de 10.04 para dictado real.

**10.06** — Panel conecta estados preparing/listening/transcribing/error y aviso de límite; no comunica un texto ficticio cuando falla el proveedor.

- Archivos: `artifacts/go-app-mobile/hooks/useGoNoteVoice.ts`, `artifacts/go-app-mobile/hooks/useBookingVoice.ts`, `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: tests/go-note-functions.test.mjs:147,154,160; microphone targets the field selected when listening starts and appends without clearing existing writing; closing the note or changing identity aborts dictation and rejects delayed transcription; the existing title limit is preserved, with a visible full dictation notice rather than silent truncation; tests/go-note-functions.test.mjs:124,170; keyboard viewport adapts to screen, safe area, keyboard frame and measured header instead of a phone-specific height; keyboard scrolling is opt-in for Nota only; normal closed-keyboard layout, other sheets and Landing remain untouched.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: El error inyectado y JSX están comprobados; verificar mensajes de permiso/conexión reales en dispositivo.

**10.07** — Recuperados once valores 5/10/15/30/45/60/120/180/360/720/1440 minutos, Sin aviso y selector de notas guardadas con ES/EN.

- Archivos: `artifacts/go-app-mobile/components/notes/GoNoteReminderPicker.tsx`, `artifacts/go-app-mobile/lib/goNoteTools.ts`, `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: tests/go-note-functions.test.mjs:52,186; bell offers exactly the eleven requested offsets, with Spanish and English labels; bell menu ES: all choices, clear selection and saved-note access are explicit; bell menu EN: all choices, clear selection and saved-note access are explicit.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: Revisión visual de campana/menú en dispositivo pendiente.

**10.08** — Nota y anticipación se guardan en la cola serializada existente con usuario/contexto, fecha/hora; reabrir no crea otra nota y doble pulsación queda bloqueada. Tras reproducir una carrera al cambiar solo de empresa durante el último await de identidad, ambos métodos incorporan la guardia síncrona existente de updateGoLog antes del commit.

- Archivos: `artifacts/go-app-mobile/lib/goNoteReminder.ts`, `artifacts/go-app-mobile/lib/goNoteTools.ts`, `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: tests/go-note-functions.test.mjs:57,67,77,108,116,198; 15 minutes: persisted note programs exactly one real-queue request at the right instant; retry keeps one note, and changing/removing its offset updates/cancels the same native queue; moving the note date/time cancels the old schedule without discarding the relative offset; identity and company isolation fence saved-note edits without changing other data; duplicate IDs, deleted notes and arbitrary non-note records cannot be adopted by the bell editor; the real Note creation connection carries the selected offset and guards duplicate taps; tests/go-note-functions.test.mjs:304-330; real Note save rechecks company context after the final identity await and preserves the shared write queue; real Note change rechecks company context after the final identity await and preserves the shared write queue.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: Persistencia AsyncStorage simulada; falta cierre/reapertura real de Expo Go. Se impide admitir un commit con contexto ya obsoleto; no se afirma cancelar una escritura que AsyncStorage ya hubiera aceptado.

**10.09** — Misma cola nativa existente confirma tras readback; cambios cancelan/reprograman, fechas pasadas no se programan y denegación/capacidad/web se comunican sin falso éxito.

- Archivos: `artifacts/go-app-mobile/lib/goNoteReminder.ts`, `artifacts/go-app-mobile/lib/goNativeReminderScheduler.ts`, `artifacts/go-app-mobile/lib/goTaskReminderRuntime.ts`, `artifacts/go-app-mobile/lib/goNativeNotificationAdapter.ts`.
- Pruebas: tests/go-note-functions.test.mjs:57,67,77,108,116,198; 15 minutes: persisted note programs exactly one real-queue request at the right instant; retry keeps one note, and changing/removing its offset updates/cancels the same native queue; moving the note date/time cancels the old schedule without discarding the relative offset; identity and company isolation fence saved-note edits without changing other data; duplicate IDs, deleted notes and arbitrary non-note records cannot be adopted by the bell editor; the real Note creation connection carries the selected offset and guards duplicate taps; tests/go-note-functions.test.mjs:84,91,95; past or undated notes keep their selection but never schedule a past/fabricated alarm; permission denial is explicit, preserves the note, and never claims scheduling succeeded; web fallback is explicit; Android and iOS use the same existing native scheduler; tests/native-reminder-runtime.test.mjs:57-92; shared note/GO reminder and completion notice coexist in one native queue without duplicate refreshes; removing a note-only alert preserves completion; resolving completion preserves an independent GO alert; completion policy cannot present/open across account changes and stale cleanup cannot remove a newer policy.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: No se ha entregado físicamente una notificación iOS/Android. El fixture no acredita permisos/capacidad del binario Expo Go del dispositivo. Web devuelve unsupported; no se implementa ni simula notificación nativa en Safari. Esta implementación es local, no push remoto.

**10.10** — Aviso compartido conserva ID del GO y procedencia de su offset. Editar sustituye, retirar cancela lo propio y desvincular conserva avisos independientes. Cola conciliada con avisos de vencidas distintos.

- Archivos: `artifacts/go-app-mobile/lib/goNoteTools.ts`, `artifacts/go-app-mobile/lib/goNoteReminder.ts`, `artifacts/go-app-mobile/lib/goNativeReminderScheduler.ts`, `artifacts/go-app-mobile/lib/goTaskReminderRuntime.ts`, `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: tests/go-note-functions.test.mjs:217-301; ios: attached note and GO share one persisted request; edit/remove/re-enable never create another task; android: attached note and GO share one persisted request; edit/remove/re-enable never create another task; unlinking a shared alert keeps the valid GO alert and never creates or deletes another action; unlinking a note-only offset cancels only that offset; independent GOs at the same time remain intact; unlinking the only note-owned alarm leaves the GO saved without restoring default polling alerts; editing a linked note preserves unrelated offsets, firing history and manual mute; retries are idempotent; linked notes cannot cross users/businesses, and identity switches cancel their private queue; the real attachment branch carries the chosen alarm inside GO without creating a separate note entry; the real GO creation connection persists one shared note/GO record and confirms through the existing queue; tests/native-reminder-runtime.test.mjs:57-92; shared note/GO reminder and completion notice coexist in one native queue without duplicate refreshes; removing a note-only alert preserves completion; resolving completion preserves an independent GO alert; completion policy cannot present/open across account changes and stale cleanup cannot remove a newer policy.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: La desvinculación de datos se prueba sin añadir un control de UI inexistente. Anticipaciones antiguas nunca guardadas no pueden reconstruirse. Confirmar una única entrega efectiva en teléfono; pruebas actuales usan cola simulada.

**10.11** — Recuperación local completa con persistencia, aislamiento, dictado, teclado, campana y aviso compartido; las interfaces Completion se conciliaron sin reemplazar Notas por una versión antigua.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/hooks/useGoNoteVoice.ts`, `artifacts/go-app-mobile/lib/goNoteTools.ts`, `artifacts/go-app-mobile/lib/goNoteReminder.ts`, `artifacts/go-app-mobile/lib/goNativeReminderScheduler.ts`, `artifacts/go-app-mobile/lib/goTaskReminderRuntime.ts`.
- Pruebas: tests/go-note-functions.test.mjs:124,170; keyboard viewport adapts to screen, safe area, keyboard frame and measured header instead of a phone-specific height; keyboard scrolling is opt-in for Nota only; normal closed-keyboard layout, other sheets and Landing remain untouched; tests/go-note-functions.test.mjs:147,154,160; microphone targets the field selected when listening starts and appends without clearing existing writing; closing the note or changing identity aborts dictation and rejects delayed transcription; the existing title limit is preserved, with a visible full dictation notice rather than silent truncation; tests/go-note-functions.test.mjs:57,67,77,108,116,198; 15 minutes: persisted note programs exactly one real-queue request at the right instant; retry keeps one note, and changing/removing its offset updates/cancels the same native queue; moving the note date/time cancels the old schedule without discarding the relative offset; identity and company isolation fence saved-note edits without changing other data; duplicate IDs, deleted notes and arbitrary non-note records cannot be adopted by the bell editor; the real Note creation connection carries the selected offset and guards duplicate taps; tests/go-note-functions.test.mjs:84,91,95; past or undated notes keep their selection but never schedule a past/fabricated alarm; permission denial is explicit, preserves the note, and never claims scheduling succeeded; web fallback is explicit; Android and iOS use the same existing native scheduler; tests/go-note-functions.test.mjs:217-301; ios: attached note and GO share one persisted request; edit/remove/re-enable never create another task; android: attached note and GO share one persisted request; edit/remove/re-enable never create another task; unlinking a shared alert keeps the valid GO alert and never creates or deletes another action; unlinking a note-only offset cancels only that offset; independent GOs at the same time remain intact; unlinking the only note-owned alarm leaves the GO saved without restoring default polling alerts; editing a linked note preserves unrelated offsets, firing history and manual mute; retries are idempotent; linked notes cannot cross users/businesses, and identity switches cancel their private queue; the real attachment branch carries the chosen alarm inside GO without creating a separate note entry; the real GO creation connection persists one shared note/GO record and confirms through the existing queue; tests/native-reminder-runtime.test.mjs:57-92; shared note/GO reminder and completion notice coexist in one native queue without duplicate refreshes; removing a note-only alert preserves completion; resolving completion preserves an independent GO alert; completion policy cannot present/open across account changes and stale cleanup cannot remove a newer policy; tests/go-note-functions.test.mjs:304-330; real Note save rechecks company context after the final identity await and preserves the shared write queue; real Note change rechecks company context after the final identity await and preserves the shared write queue.
- Regresiones: artifacts/go-app-mobile/tests/password-input.test.mjs, artifacts/go-app-mobile/tests/account-selection.test.mjs, artifacts/go-app-mobile/tests/auth-navigation-lifecycle.test.mjs, artifacts/go-app-mobile/tests/go-note-functions.test.mjs, artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs, artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- Límite: No hay validación física de teclado, dictado, permisos o entrega nativa en esta rama. No se sustituye la prueba nativa por acceso Safari. La prueba de app instalada/distribuida será distinta a una sesión de Expo Go. La disponibilidad nativa del dictado depende de 10.04; no se alteró 3001 ni el backend aislado para ocultar esa dependencia.

## Tarjeta 11 — Visibilidad de módulos y activación progresiva GO V1

| ID | Requisito | Estado original MAIN | Estado rama local |
| --- | --- | --- | --- |
| 11.01 | Primer piloto publica solo Belleza/Peluquería como sector de reservas | Ausente de MAIN | AUTOMATIZADO |
| 11.02 | Ocultar otros sectores en categorías, accesos y botones públicos | Ausente de MAIN | AUTOMATIZADO |
| 11.03 | Cerrar acceso público directo, búsqueda libre, recientes y entradas por ID | Ausente de MAIN | PARCIAL_DEPENDENCIA |
| 11.04 | Mantener módulos generales Contactos/Calendario/Comunicación/IA | Comprobado en código | SOLO_CODIGO |
| 11.05 | Conservar Restaurantes y los demás módulos/datos | Comprobado en código | AUTOMATIZADO |
| 11.06 | ADMIN autorizado distingue desarrollo/interno/piloto/público | Ausente de MAIN | AUTOMATIZADO |
| 11.07 | ADMIN mantiene control interno sin permiso automático sobre datos privados | Parcial | AUTOMATIZADO |
| 11.08 | Un mecanismo central compartido y extensible | Ausente de MAIN | AUTOMATIZADO |
| 11.09 | Configurar por entorno, rol y piloto cuando lo permita la arquitectura | Ausente de MAIN | AUTOMATIZADO |
| 11.10 | Separar módulo visible, operativo y usuario autorizado | Ausente de MAIN | AUTOMATIZADO |
| 11.11 | Backend rechaza operaciones de módulos no habilitados | Ausente de MAIN | PARCIAL_DEPENDENCIA |
| 11.12 | Activar luego módulos sin reconstruirlos ni otra app | Parcial | AUTOMATIZADO |
| 11.13 | Propagar mejoras por componentes compartidos, también a sectores ocultos | Comprobado en código | AUTOMATIZADO |
| 11.14 | Persistencia de configuración y pruebas de roles/rutas/piloto | Ausente de MAIN | PENDIENTE_FISICO |

### Recuperación, archivos y comprobaciones por requisito

**11.01** — Implementado y probado automáticamente; falta revisión física y activación autorizada

- Archivos: `lib/api-zod/src/module-publication.ts`, `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`.
- Pruebas: module-publication.test.mjs: pilot exposes only hairdressers; demo-booking-ui.test.mjs: categorías USER/ADMIN.
- Regresiones: artifacts/go-app-mobile/tests/module-publication.test.mjs, artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/api-server/tests/module-publication.test.mjs, tools/go-private-gateway/module-publication.test.mjs
- Límite: No está activo en Metro ni en producción

**11.02** — Implementado y probado automáticamente; falta revisión física

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`, `artifacts/go-app-mobile/components/booking/GoProveedorReservaSheet.tsx`.
- Pruebas: module-publication.test.mjs: proyección de categorías; demo-booking-ui.test.mjs: USER una categoría, ADMIN nueve.
- Regresiones: artifacts/go-app-mobile/tests/module-publication.test.mjs, artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/api-server/tests/module-publication.test.mjs, tools/go-private-gateway/module-publication.test.mjs
- Límite: La geometría de Landing no se modifica; la comprobación visual en dispositivo sigue pendiente

**11.03** — Implementado y probado en entradas del cliente y rutas HTTP del backend; límite de acceso directo a PostgREST pendiente

- Archivos: `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`, `artifacts/go-app-mobile/app/index.tsx`, `artifacts/api-server/src/lib/modulePublication.ts`, `artifacts/api-server/src/routes/modulePublication.ts`.
- Pruebas: module-publication HTTP: text/ID discovery; module-publication móvil: search projection; booking-timeline-ui.test.mjs; demo-booking-ui.test.mjs.
- Regresiones: artifacts/go-app-mobile/tests/module-publication.test.mjs, artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/api-server/tests/module-publication.test.mjs, tools/go-private-gateway/module-publication.test.mjs
- Límite: No se ha cambiado la exposición directa a Supabase/PostgREST ni RLS real

**11.04** — Conservado en código; sin cambios a módulos generales

- Archivos: `lib/api-zod/src/module-publication.ts`, `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: Revisión del diff: el filtro se limita al catálogo de reservas.
- Regresiones: artifacts/go-app-mobile/tests/module-publication.test.mjs, artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/api-server/tests/module-publication.test.mjs, tools/go-private-gateway/module-publication.test.mjs
- Límite: No se presenta una prueba física nueva de Contactos, Calendario, Comunicación o IA

**11.05** — Conservado en código y prueba de proyección inmutable; no se ha escrito ni borrado ningún dato

- Archivos: `artifacts/go-app-mobile/data/goSectorData.ts`, `lib/api-zod/src/module-publication.ts`.
- Pruebas: module-publication móvil: catálogo original inmutable y todas las actividades retenidas; module-publication HTTP: historial de restaurante preservado.
- Regresiones: artifacts/go-app-mobile/tests/module-publication.test.mjs, artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/api-server/tests/module-publication.test.mjs, tools/go-private-gateway/module-publication.test.mjs
- Límite: GO Imprimir solo aparece como metadato de desarrollo; proyecto, puertos y código de Imprimir excluidos

**11.06** — Implementado y probado para consultar etapas; cambios efectivos mediante configuración autorizada del servidor

- Archivos: `artifacts/go-app-mobile/components/empresa/GoModulePublicationPanel.tsx`, `artifacts/go-app-mobile/components/empresa/GoAdminDashboard.tsx`, `artifacts/api-server/src/routes/admin.ts`.
- Pruebas: module-publication HTTP: ADMIN metadata legítimo/forjado/revocado.
- Regresiones: artifacts/go-app-mobile/tests/module-publication.test.mjs, artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/api-server/tests/module-publication.test.mjs, tools/go-private-gateway/module-publication.test.mjs
- Límite: Panel de consulta con instrucciones; no se inventa un editor persistente ni se publica con un interruptor local

**11.07** — Implementado y probado mediante roles reales simulados y acceso de datos conservado

- Archivos: `artifacts/api-server/src/lib/modulePublication.ts`, `artifacts/go-app-mobile/hooks/useBookingModulePublication.ts`, `artifacts/go-app-mobile/data/booking.ts`.
- Pruebas: module-publication HTTP: owner interno y lecturas públicas siguen anónimas; module-publication móvil: USER DEMO no habilita módulos internos.
- Regresiones: artifacts/go-app-mobile/tests/module-publication.test.mjs, artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/api-server/tests/module-publication.test.mjs, tools/go-private-gateway/module-publication.test.mjs
- Límite: Membresía ADMIN + development se comprueba en servidor; no se conceden roles ni acceso privado adicional

**11.08** — Implementado como política compartida, sin duplicar pantallas ni motores

- Archivos: `lib/api-zod/src/module-publication.ts`, `lib/api-zod/src/index.ts`, `artifacts/go-app-mobile/hooks/useBookingModulePublication.ts`, `artifacts/api-server/src/lib/modulePublication.ts`.
- Pruebas: module-publication móvil: registro compartido de actividades y configuración posterior.
- Regresiones: artifacts/go-app-mobile/tests/module-publication.test.mjs, artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/api-server/tests/module-publication.test.mjs, tools/go-private-gateway/module-publication.test.mjs
- Límite: El catálogo visual existente permanece completo; el registro central contiene identificadores de publicación

**11.09** — Implementado por entorno, audiencia de piloto/general y permisos internos; cohortes individuales no inventadas

- Archivos: `lib/api-zod/src/module-publication.ts`, `artifacts/api-server/src/lib/modulePublication.ts`, `docs/GO-MODULE-PUBLICATION.md`.
- Pruebas: module-publication móvil: later releases configurable; module-publication HTTP: later activation from server config.
- Regresiones: artifacts/go-app-mobile/tests/module-publication.test.mjs, artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/api-server/tests/module-publication.test.mjs, tools/go-private-gateway/module-publication.test.mjs
- Límite: GO_MODULE_PUBLICATION es configuración administrada del servidor; no hay arquitectura previa de cohortes individuales y no se crea una nueva

**11.10** — Implementado y probado; publicación separada de permisos de datos

- Archivos: `lib/api-zod/src/module-publication.ts`, `artifacts/api-server/src/lib/modulePublication.ts`.
- Pruebas: module-publication móvil: internal view and business authorization are different decisions; module-publication HTTP: forged role/header denied.
- Regresiones: artifacts/go-app-mobile/tests/module-publication.test.mjs, artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/api-server/tests/module-publication.test.mjs, tools/go-private-gateway/module-publication.test.mjs
- Límite: allowed requiere enabled y authorized; la autorización efectiva de datos sigue en servidor/RLS

**11.11** — Implementado y probado para todas las rutas HTTP de nuevas operaciones; no se declara protección directa de la base real

- Archivos: `artifacts/api-server/src/routes/modulePublication.ts`, `artifacts/api-server/src/routes/index.ts`, `artifacts/api-server/src/routes/supabase.ts`.
- Pruebas: module-publication HTTP: POST legacy/timeline/catalog/quote y GET availability; module-publication HTTP: JSON malformado y fallo temporal.
- Regresiones: artifacts/go-app-mobile/tests/module-publication.test.mjs, artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/api-server/tests/module-publication.test.mjs, tools/go-private-gateway/module-publication.test.mjs
- Límite: Un acceso directo autorizado a RPC/PostgREST podría eludir este middleware; revisar permisos/RLS o protección transaccional equivalente antes del piloto comercial. Sin SQL aplicado.

**11.12** — Implementado y probado como activación por configuración del servidor, sin reconstrucción

- Archivos: `lib/api-zod/src/module-publication.ts`, `docs/GO-MODULE-PUBLICATION.md`.
- Pruebas: module-publication móvil: activación de restaurante sin reescribir componentes; module-publication HTTP: configuración inválida vuelve a la proyección mínima.
- Regresiones: artifacts/go-app-mobile/tests/module-publication.test.mjs, artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/api-server/tests/module-publication.test.mjs, tools/go-private-gateway/module-publication.test.mjs
- Límite: Cualquier cambio de variables o reinicio de servicios requiere autorización independiente; no se ha realizado

**11.13** — Arquitectura compartida conservada y regresión transversal dirigida superada

- Archivos: `artifacts/go-app-mobile/components/booking/BookingSearchOverlay.tsx`, `artifacts/go-app-mobile/data/booking.ts`, `artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs`.
- Pruebas: demo-booking-ui: multiselección en fisioterapia mediante EMPRESA DEMO autorizada; booking-timeline-ui y booking-timeline; hairdresser-booking.
- Regresiones: artifacts/go-app-mobile/tests/module-publication.test.mjs, artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/api-server/tests/module-publication.test.mjs, tools/go-private-gateway/module-publication.test.mjs
- Límite: La prueba de fisioterapia verifica el adaptador DEMO compartido; no una reserva real de ese sector en producción

**11.14** — Implementado y probado con configuración del servidor y contextos; prueba física y operación del entorno pendientes

- Archivos: `artifacts/go-app-mobile/hooks/useBookingModulePublication.ts`, `lib/api-zod/src/module-publication.ts`, `artifacts/api-server/src/lib/modulePublication.ts`, `docs/GO-MODULE-PUBLICATION.md`.
- Pruebas: 8 pruebas de política/hook móvil; 10 casos HTTP; 2 nuevos gateway +19 CORS; USER/ADMIN/BUSINESS DEMO en fixtures reales.
- Regresiones: artifacts/go-app-mobile/tests/module-publication.test.mjs, artifacts/go-app-mobile/tests/demo-booking-ui.test.mjs, artifacts/api-server/tests/module-publication.test.mjs, tools/go-private-gateway/module-publication.test.mjs
- Límite: La persistencia efectiva es la variable del servidor por entorno, separada de datos empresariales; el cliente consulta al abrir. Sin conexión usa proyección mínima, nunca privilegios persistidos. No se ha reiniciado ningún servicio para activarlo ni se ha realizado la comprobación física

## Tarjeta 12 — Tres cambios de mejoras para reservas

| ID | Requisito | Estado original MAIN | Estado rama local |
| --- | --- | --- | --- |
| 12.01 | Filtro Mis reservas exclusivo de USUARIO, junto a filtros existentes | Comprobado en código | AUTOMATIZADO_CONSERVADO |
| 12.02 | Solo reservas propias, con estado; sin tareas ni duplicados | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 12.03 | Conservar los tres tamaños de ficha y los demás filtros | Presente; falta prueba física | PENDIENTE_FISICO |
| 12.04 | Proponer cambio junto a Cancelar desde ficha cliente en Calendario | Comprobado en código | AUTOMATIZADO |
| 12.05 | Reutilizar flujo de propuestas, permisos y negociación real | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 12.06 | Empresa acepta/rechaza/contrapropone; cliente responde | Comprobado en código | AUTOMATIZADO_CONSERVADO |
| 12.07 | Mantener fecha/ubicación vigentes hasta aceptación | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 12.08 | Actualizar una misma reserva/calendarios al acordar, sin duplicar | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 12.09 | No alterar pagos/devoluciones automáticamente; aceptar condiciones económicas | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 12.10 | Próxima visita incluye reservas confirmadas en orden vigente | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 12.11 | Cambio/cancelación actualiza Listados, Calendario y Próxima visita | Comprobado automáticamente | AUTOMATIZADO_CONSERVADO |
| 12.12 | Verificar todo el recorrido en iPhone y tras reapertura | Presente; falta prueba física | PENDIENTE_FISICO |

### Recuperación, archivos y comprobaciones por requisito

**12.01** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado); artifacts/go-app-mobile/tests/tasks-visual.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: Conexión al filtro existente de Listados, conservada; no es un nuevo listado paralelo. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy. Validación de árbol de interfaz y callbacks de producción con anfitrión nativo controlado; falta comprobación táctil física. No se modifica la presentación aprobada.

**12.02** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/hooks/useCustomerBookings.ts`, `artifacts/go-app-mobile/data/customerBookingProjection.ts`, `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/customer-booking-source.test.mjs (histórica/disponible; no reejecutada); artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**12.03** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/components/AgendaOperativa.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: PENDIENTE FÍSICA: la prueba de selectores no verifica las dimensiones de las tres fichas. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**12.04** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo. Corregida la omisión de slotKey en la proyección DEMO compartida; se conserva la clave vigente y la reserva original mientras la propuesta está pendiente.

- Archivos: `artifacts/go-app-mobile/components/AgendaOperativa.tsx`, `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/data/businessDemoStore.ts`.
- Pruebas: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado); artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: Acción conectada al flujo existente; su presentación táctil sigue pendiente. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy. Prueba de interfaz y flujo real con transporte de reserva ficticio respaldado por el repositorio DEMO existente; no equivale a una negociación SQL o prueba física de iPhone.

**12.05** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/api-server/src/routes/bookingNegotiation.ts`, `artifacts/api-server/supabase/drafts/booking_negotiation_v1.sql`, `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-negotiation.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**12.06** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/api-server/src/routes/bookingNegotiation.ts`, `artifacts/api-server/supabase/drafts/booking_negotiation_v1.sql`, `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/data/demoBookingRepository.ts`.
- Pruebas: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-negotiation.postgres.test.mjs (histórica/disponible; no reejecutada); artifacts/api-server/tests/catalog-associations.postgres.test.mjs (histórica/disponible; no reejecutada); create → request → company acceptance → reload uses one booking and both original calendar perspectives (recuperación local; alcance limitado); rejection preserves original schedule, slot and financial data; business counterproposal requires customer acceptance (recuperación local; alcance limitado); only incoming proposals offer accept/reject, while both sides retain propose-change (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: Flujo DEMO sí ejercitado ahora; no trasladar ese resultado al flujo PostgreSQL o iPhone sin su prueba específica. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy. Prueba funcional de negociación persistente DEMO y callbacks UI; no acredita una nueva ejecución PostgreSQL ni negociación física en iPhone. No convierte 12.05 o 12.12 en validados en producción/dispositivo.

**12.07** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/customerBookingProjection.ts`, `artifacts/go-app-mobile/app/index.tsx`, `artifacts/api-server/supabase/drafts/booking_negotiation_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-negotiation.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**12.08** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/data/customerBookingProjection.ts`, `artifacts/go-app-mobile/data/demoBookingRepository.ts`, `artifacts/api-server/supabase/drafts/booking_negotiation_v1.sql`.
- Pruebas: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-negotiation.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**12.09** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/api-server/supabase/drafts/booking_negotiation_v1.sql`, `artifacts/go-app-mobile/data/demoBookingRepository.ts`, `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado); artifacts/api-server/tests/booking-negotiation.postgres.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**12.10** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/data/customerBookingProjection.ts`.
- Pruebas: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**12.11** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/hooks/useCustomerBookings.ts`, `artifacts/go-app-mobile/hooks/useBusinessBookings.ts`, `artifacts/go-app-mobile/data/customerBookingProjection.ts`, `artifacts/go-app-mobile/app/index.tsx`.
- Pruebas: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado); artifacts/go-app-mobile/tests/customer-booking-source.test.mjs (histórica/disponible; no reejecutada); artifacts/go-app-mobile/tests/business-booking-source.test.mjs (histórica/disponible; no reejecutada).
- Regresiones: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

**12.12** — Preservar código ya publicado; fixtures adaptados solo cuando cambiaron dependencias o conexiones compartidas. No se reconstruye el motor/catálogo.

- Archivos: `artifacts/go-app-mobile/app/index.tsx`, `artifacts/go-app-mobile/components/AgendaOperativa.tsx`, `artifacts/go-app-mobile/data/booking.ts`.
- Pruebas: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs (recuperación local; alcance limitado).
- Regresiones: artifacts/go-app-mobile/tests/hairdresser-booking.test.mjs
- Límite: PENDIENTE FÍSICA: el acceso Safari confirmado no acredita este recorrido completo ni la reapertura de reservas SQL. El código o una prueba disponible no equivale a activación SQL/producción ni a validación física. Los resultados de PostgreSQL históricos no se declaran reejecutados hoy.

## Tarjeta 13 — TARJETA PENDIENTE DE IDENTIFICACIÓN

**SIN EVIDENCIA SUFICIENTE.** Las capturas muestran doce tarjetas funcionales y una de cierre, con contador 13. La orden actual pide trece funcionales más cierre. No hay evidencia de una decimotercera funcional distinta y no se sustituye por otra.

## Requisitos adicionales documentados

- **AD-01: Normalización histórica exacta Belleza Peluquería → peluqueria.** AUTOMATIZADO. Sin modificar datos existentes; no equivale a resolver los subapartados desconocidos 8.15/8.16.
- **AD-02: Callbacks de agenda y escrituras de Notas mantienen contexto tras hidratación/cambio de empresa.** AUTOMATIZADO. Revalidación antes de admitir el commit; no revoca una escritura al sistema operativo que ya haya comenzado.
- **AD-03: Imagen Tierra y geometría de Landing congelados conservados.** CONSERVADO. No se reconstruye Tierra; la confirmación física anterior no acredita las nuevas conexiones de esta rama.

## Instrucciones que siguen sin recuperarse

Las tarjetas 2, 7 y 13 no añaden requisitos inventados al total 127. Tampoco se atribuye al cambio de categoría el alcance desconocido del «bug lectura» o del «filtro de formularios DEMO» (8.15/8.16). El campo independiente de confirmar contraseña no existe en los formularios actuales (1.06); el componente compartido sí tiene prueba de visibilidad independiente para ese uso.
