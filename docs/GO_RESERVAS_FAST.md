# GO Reservas FAST — estado de integración

## Publicado y preparación recuperada

Base remota comprobada: `af57e7ee3d292958a41a27e747350ab60224f40d`, MAIN 194.
Se recuperó íntegramente el commit `71debe1c5c44584e8973dd61ff7d7928eb2fcfa1`
de `codex/agent4-business-calendar-direct`. Se conservan sus validaciones,
referencias de reintento, pruebas de sesión y reparación preparada del emisor
anónimo local. No se integra la rama de verificación empresarial ni su SQL.

El único cambio completo sin dependencia nueva se publica separadamente:
`5309db3568fa0a49bceb6c353a39e74e73955795` — MAIN 195. En el calendario
personal, mantener una franja vacía 500 ms ejecuta **el mismo manejador que
RESERVAR**. No recibe selecciones iniciales ni salta pantallas. Es independiente
del rol de la cuenta: el contexto es el calendario personal. El toque corto sigue
creando NOTA; movimiento mayor de 8 puntos, cancelación, selección y arrastre
impiden la reserva accidental. No se instala el reconocedor sobre fichas ocupadas.

## FAST preparado: mismas pantallas, sin activarlo en MAIN

Se sustituye la ficha alternativa que se había preparado (sin montar) por la
reutilización de `BookingSearchOverlay.tsx`. Aquella ficha se elimina de esta
rama; su versión original sigue recuperable en el commit anterior.

Con un adaptador real autorizado, el recorrido preparado es:

1. `GoReservasConfigScreen` toma negocio, profesional seleccionado, fecha y
   minuto exactos del `AgendaBoard` existente. “Todos”/“Sin asignar” exige escoger
   un calendario profesional; nunca inventa una identidad ni concede autoridad.
2. `BookingSearchOverlay` entra en su **vista existente de SERVICIOS** y utiliza
   su catálogo, selección combinada y `CatalogComplementSelector` actuales.
3. `prepareFastReview` consulta `getTimelineAvailability` existente para ese
   negocio, secuencia, profesional, día y minuto. Requiere un plan autoritativo
   completo. No redondea, no elige la siguiente hora ni crea un HOLD local.
4. Pasa a la **CONFIRMACIÓN existente**, con resumen de precio/duración del
   catálogo/plan y nombre obligatorio/teléfono opcional dentro de esa misma vista.
   “Cambiar hora” reutiliza la vista de franjas existente.
5. Solo un recibo real `CONFIRMED`, del negocio/profesional/operación esperados,
   permite pasar a **RESERVA CONFIRMADA existente**. El contrato de invitado
   representa `customerId: null`, nunca al propietario ni un perfil ficticio.
6. La actualización solicita recargar `useBusinessBookings`; no escribe otra
   agenda ni proyecta al invitado como si fuera el cliente autenticado.

`BusinessFastGateway` es un **puerto sin implementación de producción**. Ningún
consumidor actual proporciona `fastGateway`. Por eso FAST no aparece habilitado
en el calendario empresarial de MAIN ni se pretende que pueda guardar allí.

Se reutilizó el single-flight/reintento de `businessDirectEntry.ts`, ampliándolo
con un validador de recibos. No se duplicó el motor ni el almacenamiento.
El servidor futuro deberá conservar la referencia de operación para recuperar
el resultado incluso tras cierre forzado; el estado en memoria de la preparación
no constituye esa garantía durable.

## Agenda privada y confirmaciones

La propia vista de confirmación incorpora búsqueda por nombre (desde dos
caracteres), coincidencias del negocio actual y selección de nombre/teléfono.
No hay nueva pantalla de contactos ni persistencia de clientes en AsyncStorage.
Nombres iguales pueden devolver registros distintos. No se infiere una cuenta
GO por nombre o teléfono. Corregir un campo no concede identidad ni permisos.

“Conservar en la agenda privada del establecimiento” está desmarcado inicialmente.
El futuro contrato debe aplicar minimización, información/consentimiento o base
legítima aplicable, política de conservación del negocio, acceso, rectificación y
eliminación. No se inventa un período de retención ni se habilita aún la agenda.
La creación/actualización de contacto debe ser atómica con la operación y admitir
idempotencia; no fusionar automáticamente personas por nombre. El servidor debe
verificar el negocio del contacto, y los resultados de otra empresa se rechazan
también en el cliente. Cambiar de sesión limpia los datos privados del editor.

En la vista de éxito se prepara **ENVIAR AL CLIENTE**, solo por pulsación:

- Si el teléfono incluye prefijo internacional explícito, abre un compositor
  WhatsApp con texto preparado; el profesional envía. No hay envío automático,
  proveedor comercial ni confirmación falsa de entrega.
- Sin prefijo internacional verificable, utiliza la hoja nativa de compartir.
  No se adivina un país. Cerrar la hoja no afecta a la reserva confirmada.
- El mensaje contiene los datos básicos reales de la cita sin exigir instalar GO.
- Entrega dentro de GO: pendiente de vínculo verificado y de un servicio adecuado;
  no se implementa una búsqueda de usuario por nombre/teléfono.

No se encontró un enlace oficial activo de descarga en las fuentes revisadas.
`EXPO_PUBLIC_GO_DISCOVERY_URL` queda **sin configurar**. El helper admite únicamente
una página HTTPS pública explícitamente revisada, sin credenciales, query ni
fragmento. El enlace y QR se omiten mientras falte ese valor: no se inventa una
App Store ni un enlace de Expo privado. El QR preparado usa solo el mismo enlace
público, nunca teléfono, identidad, token o código privado de reserva.
La vista puede mostrarlo cuando se configure; el envío actual preparado es texto
con enlace pulsable. La exportación de una imagen completa con QR no está
implementada ni se presenta como tal.

La asociación posterior de una reserva a GO **no está activada**. Ya existen
`data/bookingVerification.ts`, `ReservationVerificationPanel` y las operaciones
de servidor `invite`/`claim`/`revoke`; son el punto de revisión/reutilización, no
la rama separada de verificación empresarial. Su compatibilidad con un invitado
sin perfil GO necesita comprobarse antes de habilitarla. Debe reutilizarse
un derecho/credencial de reserva de un solo uso emitido por el servidor, con
comprobación de posesión/identidad, caducidad, revocación, límites de intentos y
reclamación transaccional. No basta con conocer el teléfono o el nombre. Un QR
promocional público no es una credencial para reclamar una reserva privada.

## Dependencias que impiden activar FAST

El contrato actual `POST /supabase/bookings/timeline` solo admite un perfil GO
como cliente y el RPC exige `profiles.id`. No se halló una agenda privada de
clientes invitados por negocio en las rutas/esquemas revisados. La información
`customer_name/customer_phone` actual del recibo procede de perfiles existentes.

Se requiere autorización específica para diseñar/aplicar una adaptación revisada
del contrato/esquema que:

- Represente invitado y agenda privada con aislamiento de negocio, datos mínimos
  y conservación/eliminación adecuada. No modifique reservas existentes.
- Verifique titular/empleado autorizado en el servidor. El cliente no decide
  autoridad, propietario, cliente GO ni verificación empresarial.
- Reutilice la transacción de reservas, recursos, fases, horarios, disponibilidad,
  conflicto e idempotencia existentes, también en cambios de hora por arrastre.
- Valide precio y duración en el servidor y rechace una propuesta obsoleta antes
  de escribir. La confirmación debe devolver el recibo canónico consultable.
- Permita mover una reserva invitada con los mismos mecanismos empresariales de
  revisión/propuesta; no dar por compatible el RPC que exige un cliente GO.
- Preserve recuperación de operaciones inciertas al reabrir y no duplique reservas,
  contactos, pagos ni notificaciones.

No se ha aplicado SQL, cambiado RLS/permisos, ejecutado una migración ni modificado
datos, Supabase, Railway, buckets o adaptadores externos. No se han hecho reservas
de prueba con cuentas reales. El arrastre existente no se modifica.

## JWT independiente de FAST

Se conserva el diagnóstico y emisor preparado de `tools/go-validation-bridge/`.
El proveedor externo genera una credencial anónima de 24 horas solo al arrancar.
No se modifica ese componente sin autorización específica. Su fallo se reproduce
sin sesión: renovar el usuario no lo soluciona. No se ha convertido un error del
catálogo en una justificación para saltarse autenticación o verificación.

## Verificación

- Publicación particular: 30/30 pruebas de gesto, ruta real, nota desde franja y
  arrastre; TypeScript y exportación iOS SDK 58 correctos.
- Preparación FAST: se ejecutan los manejadores reales de `BookingSearchOverlay`
  con React; servicios → confirmación → éxito, nombre, autocompletado, teléfono,
  consentimiento opcional, conflicto, cambio de sesión y compartir voluntario.
  Transporte y recibos sintéticos, no disponibilidad/persistencia de producción.
- La regresión del recorrido existente usa `demo-booking-ui.test.mjs`: 20/20.
  No equivale al recorrido autenticado del cliente real ni a validación de iPhone.
- Ejecución focalizada conjunta final: **85/85**, sin saltos ni fallos. TypeScript
  de la preparación: correcto. Exportaciones iOS SDK 58 separadas de MAIN y de
  la preparación: correctas. No se ha arrancado otro servidor persistente.
- Las pruebas heredadas con fixtures obsoletos de MAIN documentadas en
  `business-direct-readiness.md` no se declaran reparadas por esta tarea.

Metro 8088 no se ha reiniciado. La comprobación real del mapa de fuentes confirma
los archivos publicados de `app/index.tsx`, `AgendaOperativa.tsx` y `GoCalendarSlot.tsx`
en `5309db3568fa0a49bceb6c353a39e74e73955795`. Estado, manifiesto, JavaScript y mapa:
HTTP 200; API configurada y health 200. El catálogo sigue 401/PGRST303. La etiqueta
antigua del manifiesto `82ab873bc0d10a5f4cab981b7976ac03d5f376c8` no identifica el código
actual servido y no se ha falseado para aparentar otro estado.

Pendiente de validación física: pulsación larga personal frente al botón RESERVAR,
cancelación al desplazar y arrastre normal en iPhone/iPad. FAST, agenda privada,
reserva telefónica compartiendo disponibilidad, persistencia real, conflictos,
QR oficial y asociación posterior no pueden validarse como activos hasta resolver
los contratos y autorizaciones anteriores.
