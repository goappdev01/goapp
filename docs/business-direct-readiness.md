# GO Empresa: acceso y citas directas — preparación, no activada

> Informe de la preparación original `71debe1`. La continuación FAST reutiliza
> las pantallas existentes y sustituye la ficha alternativa no montada. Consultar
> [GO_RESERVAS_FAST.md](./GO_RESERVAS_FAST.md) para el estado y las pruebas actuales.

Base inspeccionada: `af57e7ee3d292958a41a27e747350ab60224f40d` (MAIN 194).
Rama de trabajo: `codex/agent4-business-calendar-direct`.

**No listo para producción ni integrado en MAIN.** No se han cambiado rutas de
la aplicación, infraestructura, registros, permisos, políticas, migraciones ni
servicios activos. No se ha integrado `codex/business-verification-20261105`.
Las pruebas nuevas usan únicamente identidades, transporte y datos sintéticos.

## 1. Causa observada del catálogo caducado

En el puente de validación accesible a través de `8088`, el catálogo público
devuelve HTTP 401 con `PGRST303 / JWT expired` **también sin Authorization**.
La respuesta es idéntica con un Bearer inválido sintético. `healthz` devuelve 200.
Esto no demuestra un defecto de sincronización de calendarios ni un token de
empresa defectuoso en el teléfono.

La ruta pública `artifacts/api-server/src/routes/supabase.ts`, GET `/businesses`,
consulta REST sin reenviar la sesión del usuario. El proveedor local externo
genera su fallback anónimo una sola vez al arrancar, con `exp = now + 86400`,
y lo reutiliza en todas las consultas REST sin Bearer. Después de 24 h caduca.
El backend activo no se ejecuta desde este checkout: utiliza un bundle en el
runtime externo `admin-business-registration-20261103` de la copia de recuperación
del equipo. Incluye un puente de identidad y un preload de reparación financiera
con controles de procedencia. No se ha modificado ni reiniciado.

`tools/go-validation-bridge/anonymous-authorization.cjs` prepara la reparación
**en el emisor local**: renovar el fallback anónimo antes de caducar conservando
firmante y rol, y reenviar intacto cualquier token de usuario. No se carga en el
runtime actual. Su README contiene las dos sustituciones concretas para revisión.
No genera sesiones empresariales, no firma nuevos usuarios ni concede permisos.

La sesión móvil existente (`lib/authSession.ts`) ya usa almacenamiento protegido,
renovación compartida, credenciales rotadas, comprobación de identidad y una sola
repetición tras un rechazo. Solo `SESSION_UNRECOVERABLE` revoca una sesión
renovable. El catálogo anónimo caducado no puede repararse repitiendo un login.
Las nuevas pruebas ejecutan `getOwnedBusinesses()` real con la sesión caducada,
su renovación, reapertura, concurrencia, fallo temporal, revocación y cambio de
identidad; no conceden verificación empresarial por metadatos o por rol local.

**Bloqueo de activación:** autorización y coordinación para corregir ese emisor
externo, conservar los adaptadores existentes y verificar sus controles de
integridad. No se ha interpretado la autorización para publicar MAIN como permiso
para alterar infraestructura ajena a MAIN ni su configuración privada.

## 2. Reservas telefónicas: contrato que falta

La ruta actual POST `/api/supabase/bookings/timeline` rechaza campos ajenos a su
contrato y solo admite `customer_id` UUID. El RPC `go_create_timeline_booking`
requiere un perfil existente; `bookings.customer_id` no admite un cliente invitado.
Su contrato no admite nombre/teléfono de invitado, origen teléfono/presencial,
concepto libre ni duración arbitraria autorizada. No es correcto asignar esas
reservas al propietario o crear perfiles/clientes ficticios.

La preparación incluye:

- `data/businessDirectEntry.ts`: propuesta desde una fecha/franja exacta, duración
  del servicio, profesionales pertenecientes al negocio, validaciones locales de
  fecha/hora/zona y datos mínimos; no calcula disponibilidad ni convierte horas
  locales a UTC inventando una resolución del cambio horario.
- `components/booking/BusinessQuickBookingSheet.tsx`: ficha compacta con los
  controles horarios GO existentes, cliente, servicio, profesional, duración,
  teléfono/observaciones opcionales y modalidad bloqueo. Usa callbacks del
  calendario existente para elegir fecha. **No montada en ninguna ruta.**
- Un puerto de contrato `DirectEntryGateway`, sin endpoint ni implementación
  simulada en la aplicación. Sin adaptador real falla explícitamente. Conserva
  una referencia por reintento y comparte pulsaciones simultáneas durante la
  sesión del formulario. Solo acepta un recibo confirmado del negocio, tipo y
  operación esperados. Conserva los datos ante conflictos o fallos.

Para activarlo, un cambio de esquema/contrato expresamente autorizado tendrá que
representar clientes sin cuenta GO y su origen, con datos privados mínimos. El
RPC autorizado debe usar el **mismo** planificador, transacción, bloqueos de
concurrencia, reglas de horarios, recursos y disponibilidad de las reservas GO;
no un motor paralelo. Tiene que comprobar titular/empleado autorizado en el
servidor, idempotencia con unicidad y recibo consultable tras respuesta perdida,
duración modificable solo cuando esté autorizada, conflictos y aislamiento.
El reintento tras cierre forzado requiere una referencia de operación recuperable
por usuario antes de activar la ficha; el prototipo no promete esa garantía.

La integración pendiente debe abrir esa ficha desde una franja del `AgendaBoard`
que ya usa `components/booking/GoReservasConfigScreen.tsx`, con negocio y sesión
servidor actuales. Tras éxito, recargar la proyección canónica de
`useBusinessBookings` y la disponibilidad del motor, sin escribir espejos locales.
La ficha deberá desmontarse/recrearse si cambia la identidad o el negocio.

## 3. Bloqueos: reutilización y límites

`data/booking.ts` conserva bloqueos locales en AsyncStorage. **No se usan** en la
preparación para confirmar ocupación a clientes; no son una garantía compartida.

Ya existen `data/calendarExceptions.ts`, `CalendarExceptionsSection.tsx` y las
rutas/RPCs de `bookingCalendar.ts` para intervalos cerrados por fecha/profesional:
lectura, edición, eliminación, revisión esperada y referencia de operación. Son
la base a reutilizar para bloqueo/desbloqueo, sin clientes ficticios ni otra
agenda. La pantalla existente informa de compromisos afectados sin cancelarlos.
Hay que comprobar qué RPCs están realmente desplegados en el entorno activo;
el fallo del JWT impide considerarlo verificado. No se ha aplicado su SQL.

El adaptador pendiente debe conservar los demás intervalos de una excepción al
añadir/quitar un bloqueo, rechazar revisiones antiguas y mantener la identidad de
cada bloqueo si el producto requiere motivo e historial individual. No reemplazar
un día entero ni eliminar otras reservas al quitar un intervalo. La ficha aislada
solo prepara inicio/final y motivo; no pretende que ya estén persistidos.

## 4. Comprobaciones y publicación

Pruebas nuevas: renovación empresarial por el adaptador de datos real; formulario
con React y sus manejadores reales; propuesta temporal, servicio/duración,
profesionales, errores, cambios de cuenta, recibos, doble pulsación, reintento
idempotente y bloqueos sin cliente ficticio. El transporte del nuevo contrato es
sintético y no valida disponibilidad de producción.

Pruebas nuevas de interfaz, contrato y renovación empresarial: **25/25**.
Regresión existente del servidor: permisos empresariales, reservas, excepciones
y política de huecos, **19/19**. Pruebas del emisor preparado: **7/7**.
TypeScript móvil y API: sin errores. Exportación iOS SDK 58: correcta; el mapa de
fuentes contiene el `app/index.tsx` exacto del checkout. No equivale a prueba de
la nueva función en producción, pues la ficha preparada no está montada.

La regresión móvil ampliada ejecutada tiene fallos preexistentes en MAIN:
fixtures que no resuelven los imports actuales `react-native`/`loginResponse`, y
una aserción estática antigua sobre la forma de `saveAuthSession`. Los fallos de
`booking-timeline.test.mjs` se reprodujeron también en el checkout servido de
MAIN sin esta preparación. No se han ocultado ni corregido alterando el producto.
Regresión móvil focalizada: **109/120** (11 fallos). Los 10 fallos de fixtures de
timeline y la aserción estática de sesión se reprodujeron en el checkout de MAIN
sin cambios nuevos. No afirmar suite completa verde.

Verificación real final de 8088: estado, manifiesto iOS, bundle y mapa de fuentes
HTTP 200, API configurada y health HTTP 200. El mapa contiene las versiones
exactas publicadas de `app/index.tsx`, `lib/authSession.ts` y `data/booking.ts` en
`af57e7ee3d292958a41a27e747350ab60224f40d`. La etiqueta del manifiesto sigue siendo
`82ab873bc0d10a5f4cab981b7976ac03d5f376c8`; no es el SHA del código servido.
El catálogo continúa HTTP 401 / `PGRST303`. Metro no se ha reiniciado ni cambiado.

No integrar esta rama hasta autorizar y validar los contratos pendientes. No
reiniciar Metro para cargar una preparación sin servicios reales. La validación
autenticada y física en iPhone (acceso, cita telefónica, conflicto con reserva GO,
persistencia, aislamiento, bloqueo/desbloqueo) permanece pendiente.
