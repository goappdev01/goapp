# GO IA — persistencia de la zona habitual

Fecha: 2026-10-12. Rama: codex/agent-2-zona-habitual-v1.
Worktree: C:\Users\Usuario\.codex\worktrees\9998\goapp-profile-logout.
Base: c2d02996b5bc7b5f44090431078fe70cc44b5570, segunda consolidación vigente.
Cambios preparados sin git add, commit, push, merge, PR ni despliegue.

## Causa comprobada

El botón Recordar solo alternaba saveZone. La escritura ocurría en chooseZone,
después de Aplicar, en una clave global sin usuario/contexto. Al abrir el panel
se desmarcaba saveZone y se reconstruía el formulario desde la zona aplicada.
La hidratación de pantalla se ejecutaba una sola vez por instancia y no recuperaba
el borrador ni la marca guardada. Por ello recordar y salir sin aplicar no guardaba,
y aplicar una búsqueda puntual podía afectar a la preferencia armada previamente.

## Corrección

Se reutilizan AsyncStorage y la familia go_booking_assistant_zone_v1. El adaptador
extiende esa clave por usuario/contexto, valida el documento y serializa lecturas
y escrituras por clave. No se crea otra tabla ni se usa Supabase/Railway para escribir.

Recordar guarda inmediatamente el borrador validado y su radio. La marca ✓ se
calcula comparando el borrador con la preferencia confirmada por almacenamiento;
no representa una intención pendiente de guardar. Aplicar solo cambia la búsqueda.
La zona habitual, la aplicada y la pendiente se muestran separadas con los mismos
componentes y controles existentes. La lectura inicial de una dirección habitual
puede usarla como centro predeterminado; una búsqueda puntual posterior se conserva
como zona aplicada y no cambia la habitual. Al abrir Zona se recupera el borrador
habitual y se mantiene visible la zona aplicada, si es diferente.

Las direcciones fijas conservan coordenadas, etiqueta y radio. Mi ubicación actual
conserva solo la modalidad current-location y el radio, sin dirección ni coordenadas.
Al recuperar esa modalidad no se invoca GPS. El botón existente Mi ubicación actual
obtiene una nueva posición cuando el usuario lo solicita. Una dirección fija nunca
se refresca silenciosamente desde el GPS.

El contexto reutiliza la identidad local y las presentaciones USER/BUSINESS/ADMIN
ya existentes. Las vistas DEMO del propietario se separan de las vistas live;
BUSINESS DEMO también se separa por negocio seleccionado. La preferencia no concede
permisos. Una revalidación temporal de permisos conserva el ámbito cosmético y el
borrador; cambiar de sesión descarta lecturas y resultados tardíos de la anterior.
Se comprueba otra vez la identidad local antes de escribir. Pulsaciones repetidas
se bloquean, y una escritura autorizada puede finalizar tras salir de la pantalla.

La clave global antigua se conserva íntegra. No se adopta automáticamente para
ninguna cuenta porque no contiene un propietario verificable. Tras incorporar
la corrección, los usuarios deben seleccionar y guardar su habitual una vez para
establecer su preferencia identificada; no se borra el valor antiguo.

## Archivos de lógica e interfaz

- C:\Users\Usuario\.codex\worktrees\9998\goapp-profile-logout\artifacts\go-app-mobile\lib\assistantZonePreference.ts
- C:\Users\Usuario\.codex\worktrees\9998\goapp-profile-logout\artifacts\go-app-mobile\hooks\useAssistantZoneScope.ts
- C:\Users\Usuario\.codex\worktrees\9998\goapp-profile-logout\artifacts\go-app-mobile\hooks\useBookingAssistant.ts
- C:\Users\Usuario\.codex\worktrees\9998\goapp-profile-logout\artifacts\go-app-mobile\components\booking-assistant\BookingAssistantScreen.tsx
- C:\Users\Usuario\.codex\worktrees\9998\goapp-profile-logout\artifacts\go-app-mobile\components\booking-assistant\BookingAssistantPanels.tsx

## Pruebas

Archivos afectados, todos bajo el mismo worktree:

- artifacts/go-app-mobile/tests/assistant-zone-preference.test.mjs: 17 regresiones nuevas.
- artifacts/go-app-mobile/tests/assistant-location.test.mjs: guardado explícito y fixtures actualizados.
- artifacts/go-app-mobile/tests/booking-assistant.test.mjs: adaptador de la nueva dependencia.
- artifacts/go-app-mobile/tests/listening-indicator.test.mjs: adaptador del ámbito, sin cambiar pruebas de escucha.

Comando, desde artifacts/go-app-mobile:

```powershell
node --test --test-concurrency=1 tests/assistant-zone-preference.test.mjs tests/assistant-location.test.mjs tests/booking-assistant.test.mjs tests/listening-indicator.test.mjs
```

Resultado: 67/67 pasan, sin fallos, cancelaciones ni omisiones. Cubren guardado sin
aplicar, cierre/reapertura, navegación entre paneles, nuevo runtime simulado con el
mismo almacenamiento, radios predefinidos y personalizado, sustitución explícita,
búsqueda puntual, GPS sin coordenadas persistidas ni consultas en segundo plano,
aislamiento entre cuentas/contextos/negocios DEMO, datos heredados intactos, errores
de lectura/escritura, doble pulsación, cierre durante guardado, cambios de sesión,
lecturas tardías y regreso de permisos sin perder el borrador. Todos los servicios
son simulados: no se envía audio ni se consulta el backend real.

Typecheck móvil: pnpm --filter @workspace/go-app-mobile typecheck.
El resultado final de esta ejecución se consigna en la entrega.
Comprobación adicional: git diff --check.

## Validación física pendiente, tras autorización de integración

1. Seleccionar una dirección y radio; pulsar Recordar y esperar ✓ sin pulsar Aplicar.
2. Cerrar IA, cambiar de pantalla y regresar a Zona. Verificar habitual, radio y ✓.
3. Recargar Expo Go y reiniciar la app. Repetir la comprobación.
4. Aplicar otra localidad/radio sin Recordar. Verificar que la habitual sigue intacta.
5. Recordar explícitamente esa localidad. Verificar sustitución después de reiniciar.
6. Repetir con 500 m, 1/2/5/10/25 km y radio personalizado.
7. Probar Mi ubicación actual: recuperar modalidad/radio sin pedir GPS al abrir;
   obtener una nueva posición solo al pulsar el botón correspondiente.
8. Alternar cuentas y contextos DEMO, incluyendo negocios distintos, y comprobar
   que cada uno recupera su propia preferencia.

La recarga/reinicio real de Expo Go y las solicitudes nativas de permisos no se
han probado en dispositivo en esta tarea. Metro y Expo Go activos no se tocaron.
No se modifican Landing, Calendario, grabación/transcripción, proveedores de ADMIN,
autenticación, variables de entorno, datos reales ni otros worktrees.
## Resultado final de comprobaciones

Typecheck móvil aprobado (tsc --noEmit, sin errores). git diff --check aprobado;
los archivos nuevos también se comprobaron sin espacios finales ni marcadores de
conflicto. Las 17 regresiones nuevas se repitieron tras precisar el fixture de GPS:
17/17 aprobadas. El conjunto relacionado suma 67/67 aprobado.

La consolidación de origen permanece en c2d0299 y limpia. Esta rama mantiene HEAD
c2d0299 con diez archivos propios nuevos/modificados sin staging ni commit,
preparados para revisión y el próximo bloque autorizado de Pull Request.
