# Tercera consolidación GO V1

## Base y protección

Base: main 75cfd6a2a507cac9f02d2085b8e4c67bce12935e, con PR #14 y #15 fusionados.
16 worktrees originales inventariados; 191 archivos locales de producto respaldados con SHA-256 y sin cambios posteriores al respaldo. Bundle Git de todas las referencias verificado. Ramas, worktrees y respaldos anteriores se conservan.
El respaldo local está registrado en el informe privado de cierre; no se incorpora al repositorio ningún archivo .env, credencial, caché ni dependencia instalada.

## Trabajo incorporado

- Agente 1: continuidad y renovación de sesión, SecureStore con migración verificada y cierre voluntario seguro; formulario nativo iOS; parche de renovación de pasarela; fondo superior del Landing, responsive GO grande, variantes A–D con previsualización y confirmación, navegación multinegocio y sincronización de recursos físicos con plano.
- Agente 2: zona habitual por identidad/contexto, voz y temporizador compatible con React Native, control visual de escucha, recordatorios vinculados a tareas y notificaciones locales nativas con cancelación/reprogramación y apertura de la tarea original.
- Agente 3: presentación compacta GO Tasks, propuestas, traducciones ES/EN y ocultación de GO cuando no cabe el contenido; fechas de pruebas futuras sin debilitar las reglas de disponibilidad. El circuito DEMO y los calendarios completos del PR #15 se conservan.
- Agente 4: pie y desplazamiento con teclado en los pasos 1–2, navegación contextual compacta y hora de fichas de calendario en una sola línea.

## Exclusiones y límites

- Las variantes históricas Actual/Profesional/Máxima confianza, incluido GO amarillo, continúan completas en development/archive/expo57-before-integration y en las referencias b8254e5 y 4eb295f. Su incorporación al selector nuevo no estaba implementada ni verificada sobre main; se excluye su activación del alcance de este PR. Actual sigue siendo la presentación inicial; ninguna alternativa se activa automáticamente.
- No se incluye trabajo descrito pero no implementado ni una nueva ronda de mejoras.
- El parche de pasarela se integra como código, sin activar ni reiniciar 3001. La pasarela estaba detenida al comprobar los servicios. Su arranque/actualización requiere autorización independiente antes de la prueba real de renovación.
- La validación física en iPhone sigue pendiente. Las notificaciones locales de iOS y el autocompletado/Face ID dependen del sistema; estas pruebas no certifican entrega física ni sugerencias de contraseñas.
- Sin cambios de Supabase, Railway, permisos reales, datos de negocios ni despliegues.

## Integración y conflictos

Se aplicaron comparaciones de tres vías únicamente en el worktree independiente. No se modificaron fuentes de los agentes.
Los conflictos superpuestos de DEMO conservaron los bloques existentes y añadieron recursos físicos estables, validación del alta y navegación entre negocios. La función de cierre cancela avisos antes de eliminar credenciales mediante SecureStore. El cliente de voz conserva el temporizador/AbortController del agente 2 y utiliza fetchWithAuth del agente 1. El fondo superior y el viewport responsive son adiciones independientes. Los cambios de navegación de Empresa conservaron la selección por cabecera y los ajustes con teclado.
Se adaptaron fixtures a los módulos seguros y métodos del teclado, sin eliminar aserciones de seguridad. La reserva pasada de prueba usa una fecha determinista dentro de un horario válido para comprobar realmente su rechazo.

## Validaciones

- Móvil: 776/776 pruebas en 50 archivos; 0 fallos y 0 omitidas.
- Backend: 16/16 pruebas; incluye migración a almacén protegido y cierre en el cliente real con transporte simulado.
- Pasarela privada: 73/73 pruebas; incluye circuito completo de renovación simulado.
- TypeScript móvil y backend: correcto.
- git diff --check: correcto.
- Expo 57.0.26, SecureStore 57.0.4 y Notifications 57.0.21; configuración nativa SDK 57 comprobada.
- Escaneo de marcadores de secretos y conflictos del candidato: sin hallazgos; los archivos privados y generados quedan excluidos.
- Compilación iOS con React Compiler y Expo SDK 57: correcta; bundle generado localmente para depuración, sin publicar.

## Validación física

1. Abrir Expo Go en la URL privada comunicada tras servir el main consolidado; no reinstalar ni limpiar datos.
2. Probar inicio de sesión, contextos autorizados y cierre voluntario. Reanudación/renovación real exige primero disponer de la pasarela autorizada.
3. En Empresa DEMO, alternar entre negocios; revisar profesionales, servicios, mesas/espacios, posiciones del plano y los pasos 1–2 con teclado. Hacer Reload y reabrir Expo Go.
4. Desde Usuario DEMO, buscar el negocio, reservar, comprobar calendarios de cliente/profesional y cancelar. Comprobar que no aparece una segunda reserva y que el horario vuelve a liberarse.
5. Probar GO Tasks, voz, zona habitual y recordatorios; verificar entrega de avisos en iPhone según permisos del dispositivo.
6. Probar todos los tamaños GO y Herramientas > Personalización > Variantes del Landing. Previsualizar, confirmar, volver a la anterior y comprobar que ADMIN mantiene su presentación.

## Archivos del bloque

- artifacts/api-server/tests/mobile-sync.test.mjs
- artifacts/go-app-mobile/app.json
- artifacts/go-app-mobile/app/_layout.tsx
- artifacts/go-app-mobile/app/index.tsx
- artifacts/go-app-mobile/components/AgendaOperativa.tsx
- artifacts/go-app-mobile/components/auth/BusinessAccessGate.tsx
- artifacts/go-app-mobile/components/auth/LoginRegisterPanel.tsx
- artifacts/go-app-mobile/components/booking-assistant/BookingAssistantPanels.tsx
- artifacts/go-app-mobile/components/booking-assistant/BookingAssistantScreen.tsx
- artifacts/go-app-mobile/components/booking-assistant/BookingAssistantUI.tsx
- artifacts/go-app-mobile/components/booking-assistant/ListeningIndicator.tsx
- artifacts/go-app-mobile/components/booking/PlanoEmpresaScreen.tsx
- artifacts/go-app-mobile/components/debug/OwnerContextIndicator.tsx
- artifacts/go-app-mobile/components/empresa/DemoCompanyManager.tsx
- artifacts/go-app-mobile/components/empresa/EmpresaConfigScreen.tsx
- artifacts/go-app-mobile/components/empresa/EmpresaPanel.tsx
- artifacts/go-app-mobile/components/herramientas/HerramientasPanel.tsx
- artifacts/go-app-mobile/components/landing/LandingContentViewport.tsx
- artifacts/go-app-mobile/components/landing/LandingVariantSelector.tsx
- artifacts/go-app-mobile/components/landing/LandingVisualArtwork.tsx
- artifacts/go-app-mobile/components/landing/landingResponsiveLayout.ts
- artifacts/go-app-mobile/components/landing/landingVariant.ts
- artifacts/go-app-mobile/components/landing/landingVisualPreference.ts
- artifacts/go-app-mobile/contexts/GoAdminAccessContext.tsx
- artifacts/go-app-mobile/contexts/GoViewContext.tsx
- artifacts/go-app-mobile/data/adminAccess.ts
- artifacts/go-app-mobile/data/booking.ts
- artifacts/go-app-mobile/data/businessAccess.ts
- artifacts/go-app-mobile/data/businessDemoCatalog.ts
- artifacts/go-app-mobile/data/businessDemoStore.ts
- artifacts/go-app-mobile/data/floorPlan.ts
- artifacts/go-app-mobile/docs/session-secure-storage.md
- artifacts/go-app-mobile/hooks/useAssistantZoneScope.ts
- artifacts/go-app-mobile/hooks/useBookingAssistant.ts
- artifacts/go-app-mobile/hooks/useBookingVoice.ts
- artifacts/go-app-mobile/hooks/useGoActions.ts
- artifacts/go-app-mobile/hooks/useLandingVisualVariant.ts
- artifacts/go-app-mobile/hooks/useTaskReminders.ts
- artifacts/go-app-mobile/i18n/translations.ts
- artifacts/go-app-mobile/lib/assistantZonePreference.ts
- artifacts/go-app-mobile/lib/authCredentialStorage.ts
- artifacts/go-app-mobile/lib/authSession.ts
- artifacts/go-app-mobile/lib/bookingAssistant.ts
- artifacts/go-app-mobile/lib/goLogStore.ts
- artifacts/go-app-mobile/lib/goNativeNotificationAdapter.ts
- artifacts/go-app-mobile/lib/goNativeReminderScheduler.ts
- artifacts/go-app-mobile/lib/goPersonalActions.ts
- artifacts/go-app-mobile/lib/goTaskNotificationFocus.ts
- artifacts/go-app-mobile/lib/goTaskReminderRuntime.ts
- artifacts/go-app-mobile/lib/goTaskReminders.ts
- artifacts/go-app-mobile/lib/registrationReturn.ts
- artifacts/go-app-mobile/package.json
- artifacts/go-app-mobile/services/GoPushService.tsx
- artifacts/go-app-mobile/services/GoTaskReminderService.tsx
- artifacts/go-app-mobile/tests/account-selection.test.mjs
- artifacts/go-app-mobile/tests/admin-access.test.mjs
- artifacts/go-app-mobile/tests/assistant-location.test.mjs
- artifacts/go-app-mobile/tests/assistant-zone-preference.test.mjs
- artifacts/go-app-mobile/tests/booking-assistant.test.mjs
- artifacts/go-app-mobile/tests/business-access.test.mjs
- artifacts/go-app-mobile/tests/business-demo.test.mjs
- artifacts/go-app-mobile/tests/business-enrollment.test.mjs
- artifacts/go-app-mobile/tests/business-form.test.mjs
- artifacts/go-app-mobile/tests/calendar-slot-flow.test.mjs
- artifacts/go-app-mobile/tests/configuration-auth.test.mjs
- artifacts/go-app-mobile/tests/customer-booking.test.mjs
- artifacts/go-app-mobile/tests/demo-company-manager.test.mjs
- artifacts/go-app-mobile/tests/demo-professional-plan.test.mjs
- artifacts/go-app-mobile/tests/fixtures/landing-visual-baseline.json
- artifacts/go-app-mobile/tests/go-log-sync.test.mjs
- artifacts/go-app-mobile/tests/go-view-context.test.mjs
- artifacts/go-app-mobile/tests/helpers/auth-session-fixture.mjs
- artifacts/go-app-mobile/tests/landing-help-context.test.mjs
- artifacts/go-app-mobile/tests/landing-recovery.test.mjs
- artifacts/go-app-mobile/tests/landing-responsive.test.mjs
- artifacts/go-app-mobile/tests/landing-v1-surface.test.mjs
- artifacts/go-app-mobile/tests/landing-visual-variants.test.mjs
- artifacts/go-app-mobile/tests/listening-indicator.test.mjs
- artifacts/go-app-mobile/tests/native-notification-adapter.test.mjs
- artifacts/go-app-mobile/tests/native-reminder-runtime.test.mjs
- artifacts/go-app-mobile/tests/native-reminder-scheduler.test.mjs
- artifacts/go-app-mobile/tests/native-reminder-service.test.mjs
- artifacts/go-app-mobile/tests/owner-demo-context.test.mjs
- artifacts/go-app-mobile/tests/profile-logout.test.mjs
- artifacts/go-app-mobile/tests/registration-return.test.mjs
- artifacts/go-app-mobile/tests/session-bootstrap.test.mjs
- artifacts/go-app-mobile/tests/session-persistence.test.mjs
- artifacts/go-app-mobile/tests/session-secure-storage.test.mjs
- artifacts/go-app-mobile/tests/task-creation.test.mjs
- artifacts/go-app-mobile/tests/task-reminders.test.mjs
- artifacts/go-app-mobile/tests/tasks-visual.test.mjs
- artifacts/go-app-mobile/tests/voice-processing.test.mjs
- docs/GO_IA_NOTIFICACIONES_LOCALES.md
- docs/GO_IA_RECORDATORIOS_TAREAS.md
- docs/GO_IA_VOZ_PROCESAMIENTO.md
- docs/GO_IA_ZONA_HABITUAL.md
- pnpm-lock.yaml
- tools/go-private-gateway/gateway.mjs
- tools/go-private-gateway/gateway.test.mjs
- tools/go-private-gateway/login.test.mjs
- tools/go-private-gateway/refresh.test.mjs
- tools/go-private-gateway/session-circuit.test.mjs
- docs/GO_V1_TERCERA_CONSOLIDACION.md
