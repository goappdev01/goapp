# Reservas: catálogo, marco inferior y bloqueo FAST

Base: `09fd5df115ef715d0c2bf57fca3029c7f9992b50`. Comprobación del 6/11/2026.

## Calendario personal de una cuenta empresarial

No hay una prohibición por rol en la entrada personal. La pulsación larga sigue
el mismo manejador RESERVAR y conserva la fecha inicial.

El adaptador móvil hacía pasar también las consultas públicas por
`fetchWithAuth` → `ensureAuthSession`. Una sesión caducada cuyo refresh falla
impedía llegar al catálogo y mostraba el error de renovación. Se separan solo los
GET públicos de negocios, servicios, profesionales, ventanas y publicación.
La selección de catálogos internos ADMIN conserva sesión y autorización del
servidor; las escrituras, cotizaciones y disponibilidad protegidas siguen usando
el contrato autenticado. No se conceden permisos a partir del rol del perfil.

Las pruebas usan sesiones y respuestas sintéticas. No se ha efectuado una reserva
con credenciales reales. El guardado normal conserva la identidad del cliente
tanto si el negocio es propio como si es ajeno.

### Bloqueo externo reproducido

`GET http://100.105.48.111:8088/api/supabase/businesses` devuelve **401 / PGRST303 /
JWT expired** sin Authorization y con un Bearer inválido sintético. Por tanto,
el servidor actual también falla independientemente de la sesión del iPhone.
No se devuelve catálogo ficticio ni se transforma el error en éxito.

El diagnóstico y reparación aislada ya preparados están en la rama
`codex/agent4-business-calendar-direct`, documentación
`docs/business-direct-readiness.md` y `tools/go-validation-bridge/`:
el proveedor externo del entorno de validación reutiliza un JWT anónimo de
24 horas generado al arrancar. Renovar la sesión del usuario no renueva ese JWT.

Se necesita autorización específica para aplicar la reparación al **emisor del
adaptador externo** conservando firmante, rol y reenvío de los tokens de usuario,
además de sus controles de procedencia y preloads financieros. Esta tarea no lo
altera ni lo reinicia. Tras autorizarlo, verificar catálogo sin sesión, catálogo
particular/empresa, refresh auténtico, publicación, servicios y reserva real con
su recibo canónico. No desactivar validaciones JWT ni ampliar publicación.

## Marco inferior

La hoja ocupaba el viewport hasta el borde físico inferior; el safe area estaba
solo dentro del dock de contenido. El borde absoluto se pintaba hasta ese límite
y el contenedor solo tenía radios/bordes superiores y laterales.

Se reserva el safe area fuera de toda la hoja (mínimo 12 puntos), o un margen de
8 puntos sobre el teclado. El dock mantiene su separación interna sin duplicar
el safe area. La hoja y su marco comparten cuatro esquinas; el trazo amarillo
se inserta 1 punto para no cortarlo con `overflow: hidden`. Se conserva la altura
flexible y el scroll de las pantallas existentes, botones y colores.

La comprobación automática recorre el flujo existente y verifica su contenedor
común en 320×568, 375×667 y 390×844, con teclado abierto/cerrado. No constituye
una comprobación física de iPhone; revisar allí ambas esquinas inferiores y los
controles en las dos lateralidades.

## FAST: capacidad pendiente, sin activación

Se conserva la preparación `codex/agent4-business-calendar-direct` (`1a00973`):
`GoReservasConfigScreen` → `BookingSearchOverlay` existente, servicios →
confirmación → reserva confirmada, con profesional/fecha/hora de la franja.
La rama de verificación empresarial permanece independiente.

El calendario publicado no instala el callback FAST porque no existe un
`BusinessFastGateway` de producción. La preparación solo lo conecta cuando se
inyecta ese adaptador. No es un fallo del reconocedor de arrastre o pulsación.

Falta una operación autenticada que guarde un cliente invitado sin perfil GO:

- El contrato actual `POST /supabase/bookings/timeline` admite IDs de cliente GO,
  no nombre/teléfono de invitado ni una agenda privada de clientes empresariales.
- `bookings.customer_id` es NOT NULL y referencia `profiles.id`.
- El RPC `go_create_timeline_booking` exige un perfil para el cliente; omitir su
  ID asignaría al profesional autenticado como cliente. Eso no representa una
  reserva telefónica y no se usa como solución.

Para activarlo se necesita autorización para diseñar, probar y desplegar una
adaptación revisada del contrato y esquema: invitado/contacto privado por negocio,
titular/empleado autorizado por el servidor, búsqueda privada y eliminación de
contactos, guardado transaccional con el mismo planificador, conflictos y recursos,
precio/duración autoritativos, idempotencia durable y consulta del resultado por
referencia tras una respuesta perdida. Conectar después las operaciones ya
preparadas de contexto, búsqueda de clientes y commit/recuperación del gateway.
No hay autorización en esta tarea para aplicar SQL, RLS, migraciones o cambios
productivos, ni para sustituir al invitado por un perfil ficticio.

La validación posterior requiere un recibo real CONFIRMED, lectura tras reabrir,
misma cita en la agenda profesional, hueco ocupado en la disponibilidad de
cliente, rechazo de una reserva concurrente y rechazo de acceso de otra empresa.
Solo entonces se habilita el callback y la pantalla existente de éxito. Hasta
entonces FAST permanece en su rama, sin confirmaciones locales o sintéticas en
MAIN.

## Comprobaciones de esta corrección

- Catálogo/autenticación pública nueva: 8/8, con las funciones de datos y sesión
  reales y transporte sintético. Incluye empresa/particular caducados, ADMIN,
  identidad, error upstream, confirmación propia/ajena y escrituras protegidas.
- Fechas/gestos/interfaz de reservas: 35/35; el marco compartido se verifica
  en búsqueda, servicios, profesional, franjas, revisión y confirmación.
- Sesión existente: 42/43. La única aserción fallida busca literalmente
  `saveAuthSession(payload)` cuando el componente actual usa `sessionPayload`.
  Se reproduce sin cambios en MAIN `09fd5df`; no es un fallo nuevo de ejecución.
- TypeScript y `git diff --check`: correctos.
- Exportación iOS SDK 58 con caché aislada: correcta, 2547 módulos. Mapa de
  fuentes contrastado con el contenido exacto de `app/index.tsx`,
  `BookingSearchOverlay.tsx` y `data/booking.ts`. Se rechazó el primer export
  que reutilizaba una caché de rutas vacía; no se considera evidencia válida.

No se han utilizado credenciales de usuario ni modificado registros reales.
La reserva autenticada completa, la recuperación del catálogo tras arreglar el
emisor externo y el resultado visual en iPhone siguen pendientes de validación.
