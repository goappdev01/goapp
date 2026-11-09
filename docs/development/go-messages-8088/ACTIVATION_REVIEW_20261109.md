# GO mensajes de reserva: activación alojada PENDIENTE

Base: origin/main a88d930aa98a029ed520d8a818f90052210ab6a8.
Rama y worktree independientes: codex/agent4-booking-messages-live-20261109,
.validation/booking-messages-live. No se modificaron trabajos ajenos ni Trello.

## Estado real

Supabase xiyxziyjpgnqfecbhmqn / PostgreSQL 17.6 conserva public.bookings,
go_reservation_negotiation.requests y las funciones existentes de negociación.
No existen go_reservation_negotiation.messages ni las RPC go_booking_conversations
y go_send_booking_message. Tampoco está activado el SOPORTE previo.

Railway goapp-api mantiene la revisión c259730fc6a1723f3f7da0faa5cda3d14f2a0906
observada al preparar esta entrega: healthz 200 y booking-conversations sin sesión
401. La ruta está protegida; no acredita persistencia ni recepción real.
No hay identidades alojadas de prueba autorizadas para efectuar el intercambio.
No se usaron cuentas o reservas de clientes reales.

## Código seguro

Se conserva MessagesScreen, el GO de IA, los controles, el retorno a fichas y
las entradas de Calendario/Listados/Empresa. No se añadieron chats ni reservas.
Las fichas empresariales siguen EmpresaPanel → GoReservasConfigScreen →
AgendaBoard → openEntryMessage → el mismo MessagesScreen y booking_id.

- JWT comprobado por Auth antes de las operaciones de mensajes. Las RPC reciben
  ese mismo JWT y resuelven cliente/titular verificado por reserva. Un empleado
  activo no obtiene permisos por esa sola condición; no hay delegación específica
  en el contrato actual.
- scope personal restringe a reservas donde customer_id es el actor autenticado;
  la consulta usa los permisos RLS existentes. scope business estrecha el conjunto
  ya autorizado por la RPC al establecimiento seleccionado. No concede membresía
  ni transforma al remitente en empresa. La función SQL sigue siendo la autoridad.
- La comprobación empresarial no depende de que el catálogo esté publicado.
  Sus políticas actuales solo permiten lectura pública con booking_enabled y
  verified; reutilizarlas como autorización empresarial ocultaría hilos legítimos.
- La respuesta incorpora inboxScope. El cliente rechaza una bandeja de una API
  antigua que ignore el filtro; no muestra todas las empresas por compatibilidad.
- Las lecturas al entrar, cada 15 segundos con pantalla visible y al recuperar
  primer plano consultan servidor. Se detienen en segundo plano. Una lectura
  anterior al envío no puede sobrescribir el mensaje confirmado.
- Cambio de cuenta/contexto invalida contenido y respuestas tardías. Los borradores
  y la cola de reintentos se separan por cuenta/reserva; sus escrituras se serializan.
  Solo se limpia el borrador que corresponde al mensaje confirmado.
- Doble pulsación comparte un único envío. Un 200 sin el ID, texto y autor
  persistidos no confirma éxito. El reintento conserva su identificador.
- El historial no se guarda en el almacén local de contactos ni se recupera desde
  copias antiguas de ese almacén. Contactos/WhatsApp mantienen su recorrido.
- Claves React por autor+mensaje y orden estable por fecha/ID/autor auténtico,
  incluso cuando dos participantes eligen el mismo message_id.
- El indicador de un mensaje de reserva significa guardado en servidor. No se
  declara leído, en línea, push ni entrega al dispositivo contrario.

Política conservada y probada: los participantes autenticados de la reserva
mantienen el hilo tras cancelación, finalización o no presentación. El chat no
modifica fechas, estado contractual, precio, servicio ni negociación. No añade
borrados ni nuevos plazos de conservación.

## Pruebas y límites

Resultado final: 73/73 comprobaciones móviles, 34/34 API/reservas y 1/1
PostgreSQL nativo; TypeScript móvil/API y diff check correctos.
Exportación iOS final: entry-b13d875cdfa076beee226e1ac356ef9d.hbc.

- Suite móvil dirigida: Mensajes, retorno nativo a ficha/Calendario, GO de IA,
  lateralidad/controles aprobados y regresiones de SOPORTE.
- Suite API y reservas: JWT, filtros, contenido, permisos, idempotencia, errores,
  catálogo no publicado y aislamiento entre empresas.
- Express con PostgreSQL PGlite persistente y adaptadores Auth/REST sintéticos:
  CLIENTE → EMPRESA → CLIENTE y comienzo desde la empresa; otra empresa/empleado/
  tercero denegados, dos autores con el mismo ID, reinicio, estados terminales.
- PostgreSQL nativo 15.19 en cluster temporal exclusivo y loopback: SQL exacto,
  ida/vuelta, repetición, anon y terceros denegados, parada/arranque y reserva
  intacta. Detenido al finalizar. No se conectó a la base local compartida.
- TypeScript móvil/API, diff check y exportación iOS SDK 58.
- Las fixtures antiguas de Calendario se actualizaron a sus controladores
  openCalendarNote/openCalendarReservation, paleta y etiqueta actuales; no se
  modificó su implementación.
- El preflight y la deshabilitación locales se ejecutaron solo en la base
  persistente sintética; la deshabilitación conserva todas las filas.

Estas pruebas NO son Auth/Supabase alojado ni prueba física de iPhone. No hay
evidencia aún de conversación alojada entre dos cuentas reales autorizadas.

## Paquete exacto para revisión; no ejecutado ni SQL nuevo publicado

Se reutiliza sin modificaciones artifacts/api-server/supabase/drafts/booking_messages_v1.sql.
Blob Git: b12b1c5d27925ac15e956f739c2144e4f742f109.
SHA-256 UTF-8/LF: 7D780D72CCA9353AEBF7D0BD08961CB6DEAF8F4E8E77C2737607D1663ECF9B60.

Paquete privado local del worktree: tmp/booking-messages-activation/activation.json.
Contiene copia exacta del SQL existente, preflight.sql y disable_messages.sql.
Los archivos de activación locales no se incluyen en este commit ni se ejecutan
por publicar MAIN. Huellas:
- preflight.sql: B0CF00927F254F7C899131D73510498F905EE7B0240C6AA9BC049C043540780E.
- disable_messages.sql: AAE0CCDF5EF7E6086738EA888ABF92F2812CF15DE2A79F7C17580639C807DBD0.

La operación propuesta crea solo la tabla privada messages, su índice, dos
funciones privadas y dos envoltorios públicos SECURITY INVOKER. No se vuelve a
ejecutar booking_negotiation_v1: su esquema/USAGE ya están presentes y sus tablas,
triggers y operaciones no son dependencias nuevas del chat. Los SECURITY DEFINER
privados tienen search_path vacío, identidad y pertenencia verificadas; PUBLIC/anon
no reciben EXECUTE ni acceso directo a tabla/esquema. Revisar owner postgres y
ACL efectivas después de la aplicación. Las FK retienen la relación con reserva
y perfil: cualquier futura eliminación de esos registros requiere tratamiento
expreso del historial, no un borrado en cascada.

Orden pendiente obligatorio:
1. Completar la activación previa de SOPORTE. Obtener respaldo alojado autorizado
   y restaurarlo realmente en PostgreSQL aislado compatible 17.6. No hay un respaldo
   verificado reutilizable de la tarea anterior. El conector no permite inventariarlo
   y el navegador de Work estaba deshabilitado. Hace falta acceso al navegador o
   ruta privada de una exportación alojada. Un dump local sintético no es respaldo.
2. Comparar el SQL exacto con el último MAIN y repetir inventario. Si aparece ya una
   tabla/RPC de mensajes, detener y reconciliar; no repetir la creación.
3. Solicitar autorización ESPECÍFICA del propietario para el SQL/huella/proyecto,
   permisos mínimos y reversión. La tarjeta no la concede. Ningún gasto/rol global.
4. Desplegar y verificar el contrato API publicado, aplicar una sola transacción
   autorizada y verificar objetos, owner, GRANT/REVOKE, RLS, índices y anonimato.
   No cambiar empresas, reservas ni permisos existentes.
5. Con reserva legítima e identidades de prueba autorizadas separadas: A desde
   cliente, recepción empresarial correcta, B desde empresa, lectura del cliente
   y nueva sesión/dispositivo, envío inverso, terceros, reintentos y reconexión.
   Registrar IDs sintéticos sin datos personales ni tokens en los informes.
6. Solo después declarar REAL. La validación visual/táctil definitiva es del iPhone.

Reversión local preparada: revocar únicamente EXECUTE de las cuatro funciones de
mensajes y acceso directo a su tabla. Conservar schema USAGE para no romper
negociación, historial, reservas y todos los datos; no DROP, DELETE ni cambio global.
La reversión productiva también requiere autorización específica.
