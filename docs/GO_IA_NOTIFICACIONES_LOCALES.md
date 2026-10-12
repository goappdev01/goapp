# GO IA — Notificaciones locales de tareas

Implementación preparada en el worktree del Agente 2, rama `codex/agent-2-zona-habitual-v1`, sobre `c2d0299`. Sin commit, publicación, instalaciones, cambios de servidores ni llamadas a OpenAI.

## Circuito implementado

La tarea y sus anticipaciones siguen en `go_log_v1`, con la misma cola de persistencia que Landing. El controlador lee ese registro y reconcilia únicamente sus notificaciones con `expo-notifications` instalado: `scheduleNotificationAsync`, trigger `DATE`, identificador estable por usuario, contexto, tarea y anticipación. No se crea otra agenda ni un backend de avisos.

El sistema operativo conserva las peticiones programadas y realiza la entrega cuando JavaScript no está activo. No se utiliza un temporizador de GO como sustituto. La promesa de programación y una lectura de la cola nativa deben confirmar la firma antes de mostrar «notificación local programada». Esto verifica registro, no entrega física.

Al guardar, modificar o borrar un aviso, cambiar la fecha/hora, silenciar una tarea, cambiar de cuenta/contexto o regresar a primer plano, la cola se reconcilia. Al salir de sesión se espera la cancelación; si falla, ese cierre no se completa. Solo se cancelan/retiran identificadores de tareas gestionados: no se toca Marketplace ni avisos de terceros.

El desmontaje del componente cancela las operaciones JS pendientes, pero conserva los avisos nativos ya confirmados. Al reabrir se vuelve a comparar el registro con la cola del sistema. El polling antiguo no duplica estos avisos en iOS/Android.

Los taps validan cuenta/contexto y una tarea única todavía existente, y usan el enfoque de fecha/tarea del Calendario existente. Se atiende también la respuesta que abre GO desde un arranque en frío; no se abren datos de otra cuenta o empresa. Este arranque todavía requiere comprobarse en el dispositivo.

## Permisos, silencio y límites

Los permisos se consultan y se solicitan desde una orden explícita de creación/modificación de aviso cuando todavía se pueden pedir. Denegación, permiso provisional, modo visual, silencio global y silencio por tarea se distinguen. Sin permisos no se afirma activación. Un permiso provisional o sonido deshabilitado se describe como entrega discreta; sin ninguna superficie de presentación se considera denegado.

Se conservan los controles existentes. Eliminar el último aviso produce silencio automático; añadirlo de nuevo restaura solo ese silencio automático, nunca un silencio elegido manualmente. Un fallo al cancelar se comunica sin afirmar que el teléfono ha dejado de tener el aviso.

Se aplica un cupo conservador de 64 peticiones, descontando otras notificaciones pendientes y priorizando las más próximas. Es una política de seguridad basada en el límite histórico documentado por Apple para UILocalNotification, no una garantía de límite universal de todas las versiones actuales. Los avisos fuera del cupo se conservan asociados y se indican pendientes, nunca activados. Requieren liberar cupo/reconciliar antes de vencer.

Las fechas del Calendario siguen la zona local del dispositivo. El instante se calcula para la fecha futura, incluyendo el cambio de horario; las anticipaciones son minutos transcurridos (un día = 1440 minutos). Las horas inexistentes o repetidas requieren aclaración. Al regresar a primer plano se reevalúa un cambio de zona. Si el teléfono cambia de zona con GO cerrado, el aviso ya registrado conserva el instante absoluto calculado antes del cambio hasta que GO vuelva a reconciliar. No se ejecuta ubicación ni JS oculto para modificarlo.

## Expo Go y aplicación instalada

Versiones comprobadas: Expo 57.0.26, expo-notifications 57.0.21. El plugin ya está en app.json; no se ha cambiado configuración ni instalado dependencias.

Las [notificaciones locales siguen disponibles en Expo Go SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/). La restricción de push remoto en Expo Go Android no bloquea este circuito local. No requiere token Expo, APNs, OpenAI, Railway ni backend.

iOS registra las peticiones mediante UNUserNotificationCenter; [Apple documenta su programación local](https://developer.apple.com/documentation/UserNotifications/scheduling-a-notification-locally-from-your-app). Una app instalada permite validar GO con identidad propia; Expo Go usa su aplicación anfitriona y su presentación/arranque puede diferir. No se ha validado un arranque en frío en el iPhone con este borrador.

En Android 12+, las alarmas exactas pueden requerir un permiso de aplicación/ajustes adicional. No se ha añadido ese permiso ni reconstruido la aplicación en este bloque. Si el sistema rechaza la programación se muestra el fallo y no se confirma activación. La validación Android y cualquier cambio de permisos de compilación se deben coordinar aparte.

La entrega depende también de permisos, Focus/No molestar, ajustes de sonido y resúmenes de iOS. No se promete eludir esos ajustes. No se usa background audio ni ejecución JS permanente para mantener los avisos.

## Prueba física pendiente, después de consolidar el borrador autorizado

1. Cargar en el iPhone un bundle que incluya esta implementación. El Metro actual no se ha tocado y no demuestra que sirva estos cambios del worktree independiente.
2. Desde el usuario/contexto correcto, crear por texto una tarea a tres minutos de la hora actual y pedir un aviso un minuto antes. Aceptar notificaciones. Comprobar que GO confirma programación local; si informa solo guardado/pendiente, no continuar suponiendo activación.
3. Poner GO en segundo plano y bloquear el iPhone antes del aviso. Verificar la notificación del sistema y su hora. Pulsarla y comprobar el enfoque de la tarea original.
4. Repetir con un aviso futuro diferente, cerrando normalmente GO/Expo Go antes de la hora. No depender de Metro/JS abierto para la entrega; anotar si al pulsarlo Expo Go carga el proyecto o abre su portada.
5. Repetir los pasos en una development build o app instalada de GO para confirmar arranque en frío con identidad propia. No se ha compilado ni desplegado esa app aquí.
6. Cambiar hora/anticipación y comprobar que el aviso anterior no llega. Eliminar con confirmación y comprobar ausencia; repetir la misma orden y comprobar una sola notificación.
7. Denegar permiso, volver a permitirlo desde Ajustes y consultar el aviso para reconciliar. Cambiar cuenta/empresa/DEMO y comprobar que los avisos privados anteriores se cancelan; volver al contexto original y consultar de nuevo.
8. Caso obligatorio: «Hacer la compra», 13/10/2026 a las 17:00, aviso una hora antes: mismo id y una única notificación programada el 13/10/2026 a las 16:00 (zona del teléfono). Si esa fecha ya pasó al probar, usar una fecha futura, conservando ese caso como regresión automatizada.

No se ha emitido ninguna notificación real en el iPhone ni ejecutado llamadas de pago durante esta implementación. La programación, cancelación, readback, persistencia del SO, permisos, carreras y aislamiento se verifican con puertos nativos controlados en pruebas; no son evidencia de entrega física.

## Archivos de este bloque

Bajo artifacts/go-app-mobile:

- lib/goNativeReminderScheduler.ts: reconciliación serializada y protección por ámbito.
- lib/goNativeNotificationAdapter.ts: API nativa real de Expo, permisos y canales.
- lib/goTaskReminderRuntime.ts: registro compartido, identidad y preferencias existentes.
- lib/goTaskNotificationFocus.ts: puente de enfoque de la tarea seleccionada.
- services/GoTaskReminderService.tsx: ciclo de vida, sesiones y taps.
- services/GoPushService.tsx: reutilizar el handler común con validación de privacidad/silencio.
- app/_layout.tsx: montar el componente invisible.
- app/index.tsx: cancelación antes de logout, evitar duplicar polling y enfocar con estados existentes; sin cambios visuales.
- hooks/useTaskReminders.ts y lib/goTaskReminders.ts: confirmar solo estados verificados y conservar silencios manuales.
- lib/goLogStore.ts: prioridad de cambios manuales de silencio.
- tests/native-reminder-scheduler.test.mjs, native-notification-adapter.test.mjs, native-reminder-runtime.test.mjs, native-reminder-service.test.mjs: regresiones del circuito nativo.
- tests/task-reminders.test.mjs y tests/task-creation.test.mjs: asociación y confirmación conversacional.

Los archivos previos de zona habitual, procesamiento y diseño de voz se conservan. GO_IA_RECORDATORIOS_TAREAS.md se actualiza para enlazar este estado nativo.

## Resultado de validación local

- 129 pruebas relevantes superadas: 71 de asociación/creación/gestión/sincronización, 28 del programador, 7 del adaptador Expo, 9 del circuito ensamblado y 14 de ciclo de vida/taps.
- Typecheck móvil correcto: `node --max-old-space-size=3072 node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` desde artifacts/go-app-mobile. El límite explícito evita el problema de memoria del primer intento en el equipo de 4 GB; los errores de tipos nuevos se corrigieron antes del resultado final.
- `git diff --check`: correcto. Los avisos de conversión LF/CRLF son de la configuración habitual de Git en Windows.
- 16 archivos previos de zona/voz comprobados por SHA-256 sin pérdida; BookingAssistantScreen mantiene exclusivamente la línea de conexión de contexto que ya había quedado en el bloque anterior.
- Pruebas sin llamadas a OpenAI, Supabase, Railway ni uso de notificaciones físicas. Las pruebas nativas usan puertos controlados; el adaptador de producción llama realmente al SDK instalado.
- HEAD continúa en c2d02996b5bc7b5f44090431078fe70cc44b5570. No se ha creado commit, push, merge ni despliegue. Los cambios quedan sin commit para consolidación autorizada.
