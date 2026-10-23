> Estado de consolidación 23/10/2026: consultar [GO_PELUQUERIAS_INTEGRATION_REVIEW.md](./GO_PELUQUERIAS_INTEGRATION_REVIEW.md). El documento inferior conserva la revisión de origen. La instalación normal ya se comprobó en la nueva rama aislada; el cliente actual utiliza el contrato de catálogo/tiempos, manteniendo v2 como compatibilidad anterior. No implica activación real ni validación física.

# Fichas de reserva y verificación compartida — revisión de Nelson

Rama aislada `codex/go-reservas-peluqueria-20261021`, base `6c834db`. Código preparado, sin commit ni incorporación a main. Ningún SQL aplicado a Supabase/Railway ni a una base real. No activar automáticamente estos borradores.

## Fichas y negociación

Se reutiliza la reserva canónica, su revisión y su historial. El recibo autorizado incorpora `customer_name` desde `profiles.full_name` mediante `customer_id`; no utiliza el nombre del profesional, servicio o establecimiento. No se amplía el SELECT general de perfiles. Si el perfil solo tiene un email o carece de nombre, la ficha indica que no hay nombre disponible; no se deduce ni inventa. El registro existente ya envía `full_name`; el enlace se perdía en el recibo y en la proyección empresarial que fijaba `Cliente`.

El detalle de Calendario muestra ACEPTADA en verde, PROPONER CAMBIO en naranja, CANCELAR para reservas activas y respuestas a propuestas entrantes. Las reservas canónicas no utilizan los botones de estado de tareas para simular aceptaciones locales. Cancelar conserva la reserva y su historial. Una reserva cancelada/completada no ofrece acciones de edición. Los estados NO_SHOW/EXPIRED/REJECTED conservan su etiqueta original sin cambiar la semántica existente de inactividad. Las reservas sin profesional asignado pueden abrir su detalle: el servidor protege el recurso del establecimiento.

La negociación anterior se conserva. Se añade `confirm` al mismo comando `POST /api/supabase/bookings/:bookingId/change`: solo el propietario verificado acepta una reserva PENDING sin propuesta abierta, con revisión esperada y comprobación de disponibilidad. No vuelve a aceptar una CONFIRMED. El identificador de petición durable evita decisiones duplicadas. No modifica importes ni llama a pagos.

## Servicio compartido de verificación

`POST /api/supabase/booking-verification` utiliza el JWT existente, sin service_role ni identidad recibida del cuerpo. Cuerpo estricto:

| Operación | Datos adicionales | Efecto |
|---|---|---|
| `issue` | `bookingId` | El titular actual genera/rota QR y código alternativo |
| `preview` | `businessId`, `secret` | Profesional autorizado comprueba el derecho; no confirma llegada |
| `arrive` | `businessId`, `challenge` | Confirmación expresa de llegada; nunca servicio realizado ni pago |
| `invite` | `bookingId` | Titular crea una invitación temporal de entrega |
| `claim` | `secret` | Otra cuenta autenticada acepta expresamente el único derecho |
| `revoke` | `bookingId` | Titular/comprador revoca códigos/entrega; derecho vuelve al comprador |
| `wallet` | ninguno | Solo autorizaciones de la cuenta actual |

Los secretos se envían exclusivamente en el cuerpo POST; respuestas `Cache-Control: no-store, private`. No aparecen en URLs, recibos normales, AsyncStorage ni logs de esta implementación. Los errores no devuelven diagnósticos SQL ni datos de un código ajeno. Utilizar HTTPS o el transporte privado cifrado de Tailscale, nunca HTTP público sin protección.

Los códigos se generan dentro del servidor PostgreSQL mediante `pgcrypto.gen_random_bytes`: QR de 256 bits, alternativa manual de 128 bits y desafíos de 256 bits. Se guarda únicamente SHA-256 con separación por propósito. El QR no contiene IDs internos, nombres, teléfonos, correos ni datos de pago. La alternativa manual es el mismo procedimiento seguro mediante un código aleatorio largo; conocer un nombre no permite verificar.

Un único derecho por reserva, separado de la propiedad de la reserva y los pagos. Una entrega requiere código de un solo uso y aceptación por otra cuenta autenticada. La aceptación invalida inmediatamente los códigos anteriores; no modifica `customer_id`, no duplica la reserva y no concede al destinatario permisos para negociar/cancelar en nombre del comprador. El profesional ve cliente y, si es distinto, persona autorizada. Estos nombres proceden de cuentas; NO acreditan identidad civil. El comprador puede revocar una entrega antes de la llegada.

El verificador es el propietario verificado del establecimiento o el profesional activo asignado a esa reserva mediante `staff.profile_id`. Esta asignación debe proceder de administración fiable: los grants actuales no permiten a un cliente escribir `profile_id`. No se conceden permisos generales de calendario, perfiles ni negociación a empleados. **Nelson debe confirmar el procedimiento real de asignación de profesionales y su integración con la interfaz empresarial.** No introducir asignaciones desde metadatos editables del cliente.

Política propuesta para revisión: QR y código manual duran 10 minutos, como máximo hasta finalizar la reserva; cada emisión rota los anteriores. Invitación 30 minutos, como máximo hasta finalizar; desafío de llegada 2 minutos. Se puede comprobar una reserva futura, pero confirmar llegada solo desde 2 horas antes de empezar hasta su finalización. Reservas no confirmadas, canceladas, completadas, no presentadas o pasadas no emiten códigos. Estas ventanas son explícitas y requieren aprobación para el piloto.

Preview no confirma llegada. Llegada exige otro gesto y desafío ligado a verificador, empresa, versión y caducidad. Bloqueo transaccional común por empresa → reserva → derecho; la primera confirmación genera un evento, los reintentos muestran llegada ya verificada. Dos dispositivos no pueden confirmar dos llegadas ni transferir simultáneamente el mismo derecho. No existe en este servicio una operación de cobro o de consumo/realización.

Cambiar fecha/hora, profesional, cliente, empresa, servicios o estado revoca credenciales y desafíos en la misma transacción. Una mera propuesta sin acuerdo no invalida el horario/QR original. La trazabilidad de llegadas y transferencias se conserva en eventos privados, sin tokens. Límite durable de 30 operaciones/minuto por identidad, también en RPC directo; los intentos fallidos cuentan. Revisar retención de eventos y limpieza de tablas de seguridad antes de producción.

## SQL y dependencias

1. Aplicar las seis migraciones existentes solo en la base aislada elegida.
2. Revisar `booking_negotiation_v1.sql` (ahora incluye nombre autorizado y confirmación inicial).
3. Revisar `booking_verification_v1.sql`; requiere `pgcrypto` en `extensions`. Se detiene si la extensión preexistente está en otro esquema, sin moverla automáticamente.
4. Nelson genera las migraciones reales con Supabase CLI después de comparar el esquema desplegado. No ejecutar este archivo por el nombre ni copiarlo ciegamente a producción.

Funciones públicas INVOKER, núcleos DEFINER privados con `search_path=''`, `auth.uid()` y comprobación de permisos en cada operación. Tablas privadas con RLS, sin grants directos a PUBLIC/anon/authenticated. No hay permisos de edición general de fechas ni perfiles. Revisión requerida del propietario de funciones, triggers, grants, asignaciones de staff y retención.

La referencia separada del Agente 1 `booking_multi_service_v2.sql` se prueba únicamente en una segunda base ficticia. No se incorpora a esta rama. QR y negociación conservan la instantánea de servicios/importes. Debe revisarse su versión y orden de incorporación junto con Nelson.

La interfaz reutiliza `react-native-qrcode-svg` e incorpora `expo-camera ~57.0.6`, compatible con SDK 57. Config plugin: cámara y lectura QR, sin audio Android. Manifiesto y lockfile incluidos. [Documentación oficial SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/camera/). La librería está incluida en Expo Go; una compilación propia necesita incorporar el plugin/permisos nativos.

`ReservationVerificationPanel` se abre desde la ficha del cliente o la empresarial. Respeta área segura y teclado, ofrece entrada manual si no hay cámara/permiso y elimina secretos de memoria al caducar, pasar a segundo plano o cambiar de cuenta. Para recibir una entrega: abrir `go-app://reservation-right` sin secretos en la URL, iniciar sesión mediante el acceso existente si es necesario, introducir el código recibido y aceptar expresamente. No se cambia autenticación ni la geometría del Landing.

## Pruebas y activación

Las pruebas reales usan PostgreSQL 15 y PostgREST con JWT firmados con secreto aleatorio temporal, perfiles ficticios y Express real. No son respuestas DEMO ni un mock de transacciones. Se ejecutan en `127.0.0.1:65439`, usuario `go_booking_test_owner`, bases `go_booking_negotiation_test_*` marcadas `isolated`. El helper rechaza hosts, nombres, propietario/estado no previstos y bases ya inicializadas. La instalación desde cero se comprueba además en `..._qr_clean`.

Comando desde `artifacts/api-server`: configurar SOLO en ese proceso `GO_BOOKING_TEST_CONFIRM=isolated`, `GO_BOOKING_TEST_URL=postgresql://go_booking_test_owner@127.0.0.1:<puerto>/go_booking_negotiation_test_legacy` y `GO_BOOKING_POSTGREST_BINARY=<binario-local>`, y ejecutar `node --test tests/*.test.mjs`. No cargar `.env` ni `DATABASE_URL`. Los tests usan también `..._multi`. Para la provisión, consultar el helper y la revisión de negociación. No ejecutar contra una base existente con datos reales.

La batería verifica estados/aceptación, dos nombres, negociación persistida, permisos y privacidad, QR/manipulación/empresa incorrecta, alternativas, caducidad/rotación, invalidación por cambios, entrega y revocación, escaneos y transferencias simultáneos, llegada vs entrega concurrente, ausencia de cobros, una reserva canónica, y esquemas antiguo/múltiple. Pruebas móviles ejercitan botones reales del detalle, ES/EN, cámara/permisos con adaptadores deterministas, expiración, alcance de cuenta y regresiones generales. **Estos adaptadores no sustituyen una cámara física.**

Pendiente: revisión de Nelson, autorización de activación del backend/SQL en un entorno compartido aislado, instalación normal de dependencias tras revisión, allowlist específica de la pasarela si se autoriza y prueba física iPhone/Android. No se modifica la pasarela 3001 ni se amplían sus permisos. El circuito DEMO no genera credenciales que sirvan en un entorno real.

## Incidencia de entorno conservada

Esta copia utiliza uniones de `node_modules` hacia la carpeta visual y el almacén compartido. Aunque se pidió a pnpm generar solo el lockfile, se observaron enlaces de dependencias y metadatos actualizados a través de esas uniones. El diff de lockfile añade únicamente cámara y dependencias asociadas; no cambia versiones anteriores. Se han detenido todas las operaciones de instalación. No se revierten enlaces compartidos sin coordinación ni se afirma que esas carpetas quedaron intactas. Conservar inventario y revisar esta incidencia antes de otra instalación.

Metro 8086 estaba activo al inicio, sirviendo el worktree conjunto, y posteriormente dejó de escuchar. No se ha ejecutado parada ni reinicio de Metro; no se ha determinado la causa de su salida ni se descarta una relación sin evidencia. 3000 y 3001 seguían activos. El paquete permanece aislado: no se presenta `exp://100.105.48.111:8086` como una versión QR lista para Reload.

## Comprobación física posterior, en una sola versión autorizada

1. Cliente: reserva aceptada verde, cambio naranja, cancelación, estado pendiente solo con aceptación empresarial autorizada; consultar historia sin duplicar.
2. Empresa: dos clientes distintos, nombre/servicio/profesional correctos antes y después de propuesta, contrapropuesta, aceptación/rechazo y Reload; otra empresa no accede.
3. Mostrar QR; escanear con cámara iPhone y Android, negar permiso y usar alternativa manual. Ver datos autorizados y aviso de derecho de uso, sin afirmar identidad civil.
4. Confirmar llegada explícitamente en ventana válida; segundo escaneo/dispositivo muestra llegada ya verificada. No se marca pagado ni servicio realizado.
5. Rotar, cambiar horario por acuerdo, reasignar o cancelar: el código anterior deja de valer. Rechazar una propuesta conserva el original.
6. Entregar a otra cuenta y aceptar: una sola autorización, QR anterior inválido; comprador y destinatario identificados correctamente. Reintento de entrega falla; revocación antes de llegada funciona.
7. Caducidad, segundo plano, cambio de cuenta, conexión caída y recuperación sin mostrar secretos/recibos de otra cuenta; Calendario, Mis reservas y Próxima visita mantienen la misma reserva.
