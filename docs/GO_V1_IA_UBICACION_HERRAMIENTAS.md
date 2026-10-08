# GO V1 — IA, ubicación y Herramientas

Rama: `integration/go-v1-calendario-ia-landing`. Base revisada: `e8ba409`.
Worktree: `C:\Users\Usuario\.codex\worktrees\go-v1-calendario-ia-landing\goapp-profile-logout`.

## Estado de las diez incidencias

Toda interacción física y visual queda pendiente de validación en iPhone con Expo Go.
«Corregida» describe el código y las pruebas automáticas, no una validación en dispositivo.

| Incidencia | Estado | Resultado |
| --- | --- | --- |
| 1. Selector superior en IA | Corregida | Retirado; configuración exclusiva en Herramientas. |
| 2. Cierre demasiado alto | Corregida | GoCloseButton y DraggableFAB en una fila inferior reservada dentro del área que evita el teclado. |
| 3. GO ovalado | Corregida | Sin crecimiento ni contracción flex; dimensiones iguales y radio exacto, tamaños Mini/Medio/Grande conectados al ajuste existente. |
| 4. Autocompletado | Bloqueada en servicio externo | Integración con /places existente, debounce, resultados reales, selección, carga y errores; API pública devuelve 404. |
| 5. Buscar ubicación | Bloqueada en servicio externo | Acción conectada, respuesta observable y errores útiles; requiere endpoint disponible. |
| 6. Voz redundante | Corregida | Retirado el botón extra; el mismo GO visible en Zona dicta al buscador. Permiso de micrófono diferenciado del error de conexión. Voz real pendiente en dispositivo/backend. |
| 7. GPS sin confirmación visual | Corregida | Dirección o coordenadas reales visibles; selección pendiente separada de zona aplicada. Denegación, coordenadas inválidas y fallo de dirección tratados. |
| 8. X en Zona | Corregida | Sustituida por cierre negro compartido, sin X simultánea. |
| 9. Zona inconsistente | Corregida | Inter, colores #111827/#6B7280/#4A80BD, geometría de formularios de Herramientas. |
| 10. Lateralidad incompleta | Corregida | Izquierda/Centro/Derecha con la misma preferencia persistida consumida por IA. Tamaño independiente conservado. |

## Componentes recuperados y protección

- `HerramientasPanel.tsx`: sistema visual y selector de tamaño originales.
- `bookingDockOrder`: orden de las cinco acciones y tres posiciones ya implementado.
- `go_booking_assistant_dock_v1`: preferencia existente; un único store observable, sin clave paralela.
- `GoCloseButton` y `DraggableFAB`: cierre, pulsación y persistencia originales; límites opcionales para el espacio reservado de IA. Valores predeterminados conservados en otros consumidores.
- `useBookingVoice`, `expo-audio`, `expo-location`, `/places` y proveedor Photon: infraestructura existente.
- No se localizó una versión histórica de Herramientas con Centro: el historial revisado solo mostraba Zurdo/Diestro. Se reconectaron las tres posiciones existentes de IA; no se afirma haber recuperado un componente histórico inexistente en lo revisado.
- El botón central y las órbitas de Landing permanecen intactos. Su única línea modificada pasa `uiScale` al asistente. El icono `zap` de Acciones permanece.
- Sin cambios en reservas manuales, registro de tareas, Calendario, Contactos ni backend.

## Archivos de este cambio

Rutas relativas a la raíz del worktree de integración:

- `artifacts/go-app-mobile/app/index.tsx` (solo conexión de uiScale).
- `artifacts/go-app-mobile/components/DraggableFAB.tsx`.
- `artifacts/go-app-mobile/components/ui/GoCloseButton.tsx`.
- `artifacts/go-app-mobile/components/herramientas/HerramientasPanel.tsx`.
- `artifacts/go-app-mobile/components/booking-assistant/AssistantCloseControls.tsx`.
- `artifacts/go-app-mobile/components/booking-assistant/BookingAssistantScreen.tsx`.
- `artifacts/go-app-mobile/components/booking-assistant/BookingAssistantPanels.tsx`.
- `artifacts/go-app-mobile/components/booking-assistant/BookingAssistantUI.tsx`.
- `artifacts/go-app-mobile/hooks/useGoDockPreference.ts`.
- `artifacts/go-app-mobile/hooks/useBookingAssistant.ts`.
- `artifacts/go-app-mobile/hooks/useBookingVoice.ts`.
- `artifacts/go-app-mobile/lib/bookingAssistant.ts`.
- `artifacts/go-app-mobile/tests/assistant-location.test.mjs`.
- `artifacts/go-app-mobile/tests/booking-assistant.test.mjs`.
- `artifacts/go-app-mobile/tests/go-log-sync.test.mjs` (mock Platform, sin cambiar expectativas).
- Este informe.

## Validación

91 pruebas pasan con `pnpm exec node --test --test-reporter=spec` sobre:
`assistant-location.test.mjs`, `booking-assistant.test.mjs`, `task-creation.test.mjs`,
`go-log-sync.test.mjs`, `calendar-container-ux.test.mjs`, `integration-v1.test.mjs`.
Incluyen renderizado de componentes con mocks, tamaños circulares, un solo GO, cierres,
autocompletado, respuestas tardías, dictado, GPS, persistencia, aislamiento y tareas.
Las pruebas con mocks no verifican el teclado, los gestos ni permisos del iPhone real.

Comprobaciones adicionales: typecheck móvil y `git diff --check`.
Un fallo de fixture por el nuevo import de Platform se corrigió en el mock; las 91 pruebas finales pasan.

## Servicios y comprobación física pendientes

GET de solo lectura realizados el 9 de octubre de 2026:

- `https://goapp-api-production.up.railway.app/api/booking-assistant/places?q=Cieza`: HTTP 404. Es la URL pública indicada en `.env.example`; no se afirma que sea la configuración cargada en el iPhone.
- `https://photon.komoot.io/api/?q=Cieza&limit=5`: HTTP 200, cinco resultados con coordenadas reales. Se usaron los mismos parámetros del backend, sin conectar el cliente directamente al proveedor.

Hace falta configurar `EXPO_PUBLIC_API_URL` con un backend que exponga los endpoints existentes.
Voz nativa requiere sesión, permiso de micrófono y transcripción habilitada en servidor;
no se verificaron credenciales ni se pusieron claves en el cliente.
GPS requiere permiso de ubicación y servicios del dispositivo; si falla la dirección, se muestran coordenadas reales.
Se respetan los límites de solicitudes del backend y sus errores visibles.

En iPhone comprobar tamaños y tres posiciones tras reabrir, cierre con teclado abierto/cerrado,
selección táctil sin perder foco, GPS concedido/denegado, dictado al buscador y confirmación de tareas.
No se declara ninguna de estas comprobaciones físicas realizada.

Se conservan fuera del commit los cambios previos ajenos en `expo-env.d.ts` y
`docs/GO_V1_INTEGRACION_PROMPT_3.md`. No se hicieron push, merge ni despliegue.