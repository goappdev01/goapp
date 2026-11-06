# FAST: confirmación compartible preparada, persistencia pendiente

Rama: `codex/agent4-fast-confirmation-20261106`, sobre MAIN `2122b3b`.
Conserva la preparación anterior y todos los cambios posteriores de MAIN,
incluidos fecha inicial, marco amarillo, soporte y notas. No integra la rama
de verificación empresarial ni altera sus permisos.

## Qué está preparado y probado aisladamente

- Calendario profesional → pulsación larga de la franja libre → vistas actuales
  SERVICIOS → CONFIRMACIÓN → RESERVA CONFIRMADA. El callback solo se instala
  si existe `BusinessFastGateway`; ningún consumidor de producción lo inyecta.
- Conserva empresa, profesional, día y minuto. Usa catálogo, cotización y
  disponibilidad por fases existentes. Nombre obligatorio, teléfono opcional,
  búsqueda privada por negocio y conservación de contacto por elección expresa.
- Solo un recibo canónico CONFIRMED del negocio/profesional/operación permite
  llegar al éxito. Nunca usa al propietario como cliente invitado ni escribe
  una agenda local. Actualiza la proyección empresarial mediante su refresh.
- ENVIAR CONFIRMACIÓN abre opciones dentro de la misma pantalla 8, no una
  pantalla adicional. El PNG usa la presentación oscura/acento y contiene
  establecimiento, servicio, profesional, fecha/hora, duración, precio y la
  referencia real del recibo. No incluye nombre/teléfono del cliente, tokens
  ni una credencial para reclamar la reserva. Texto largo adapta líneas/alto.
- Con teléfono internacional explícito, ENVIAR POR WHATSAPP prepara la imagen
  con `react-native-svg`, guarda temporalmente el PNG en caché privada y abre
  `Share.share({url,message})` de iOS. La profesional elige WhatsApp y destinatario.
  No promete preseleccionar simultáneamente aplicación, imagen y destinatario.
  La entrega no se afirma por abrir/cerrar la hoja; cancelar o fallar no elimina
  la cita ni vuelve a crearla. El archivo temporal se retira después del retorno.
- GO permanece deshabilitado: faltan asociación de cliente verificada y canal
  autorizado con recibo/idempotencia. No hay búsqueda de cuentas por teléfono.
- No existe enlace oficial de instalación verificado en la configuración. No
  se incorpora QR ni enlace inventado; se conserva su configuración opcional.

## Servidor: desarrollo aislado y límite real

`artifacts/api-server/src/prepared/businessFast.ts` prepara la operación de
aplicación y su contrato de transacción: autorización efectiva, bloqueo de negocio,
revisión del plan canónico (incluido precio/duración/recursos), invitado sin perfil,
contacto por selección expresa, recibo, idempotencia y recuperación por operación.
No está importado por un router y no se ha desplegado. Las pruebas de esa lógica
usan un repositorio transaccional sintético con rollback y ocupación compartida;
no constituyen una prueba PostgreSQL/RLS ni una reserva persistida real.

No hay adaptador productivo de `GuestStore`/`BusinessFastGateway`. Para activarlo,
la intervención de infraestructura a revisar/autorizar debe comprender:

1. Ampliación revisada de `bookings`: cliente GO nullable exclusivamente para una
   reserva empresarial con snapshot invitado válido; conservar las filas previas.
   No insertar perfiles ficticios ni usar al empleado como cliente.
2. Contactos privados por establecimiento y operaciones durables con unicidad
   `(actor, negocio, request_key)`, firma del comando y recibo recuperable.
   Sin fusión automática de personas por nombre/teléfono. Política de conservación,
   eliminación y acceso necesaria antes de almacenar datos de clientes.
3. Ajuste del contrato RPC/API existente y de sus triggers/RLS para invitados y
   empleados expresamente autorizados. El planificador actual usa `coalesce` al
   cliente y comprobaciones de titular; no puede conectarse al invitado sin revisar
   también conflictos de cliente, consulta, arrastre y edición autorizada.
4. Mantener el MISMO planificador/transacción/bloqueo de negocio para reserva
   convencional e invitada, recursos, fases, horarios y conflictos. Validar el
   recibo canónico y convertirlo al mismo modelo de agenda, sin otra tabla de citas.
5. Instalar adaptadores, recuperación durable del request_key en el cliente y
   pruebas PostgreSQL aisladas de concurrencia, rollback, RLS y empresas ajenas
   antes de solicitar despliegue. Estas piezas no se presentan como implementadas.
6. Después de aprobación: despliegue revisado, recibo real, reapertura, agenda
   profesional y disponibilidad pública ocupada, conflicto concurrente rechazado,
   arrastre autorizado y pruebas de aislamiento. Solo entonces inyectar el gateway.

No se adjunta una migración sin validar ni se ha ejecutado SQL, modificado RLS,
Supabase, Railway, credenciales, usuarios o datos productivos. El JWT local se
repara por separado en MAIN; no habilita el contrato de invitados.

## Verificación técnica

- Suite móvil focalizada: 76/76 (FAST, imagen/compartir, sesión, catálogo público,
  reservas convencionales, fecha inicial y gestos).
- Servicio de invitados preparado: 4/4, transporte/repositorio sintéticos.
- TypeScript móvil y API: correctos; `git diff --check`: correcto.
- Exportación iOS SDK 58: correcta, 2559 módulos; mapa contrastado con las fuentes
  exactas de index, editor de reservas, imagen y helpers FAST/compartir.

Pendiente en iPhone: render PNG nativo, hoja Compartir/WhatsApp y cancelación.
FAST completo, directorio y escritura real no están activos en MAIN: requieren
los adaptadores y autorización productiva anteriores. La prueba autenticada de
un empresario reservando convencionalmente en negocio propio/ajeno corresponde
a una sesión legítima de prueba; no se han utilizado credenciales del propietario.
