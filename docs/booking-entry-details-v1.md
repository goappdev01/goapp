# Fichas compartidas de reservas y tareas

`GoEntryDetailsSheet` presenta el mismo registro sobre el Calendario o Landing. La columna permanece montada y no cambia sus dimensiones. Solo el contenido del detalle se desplaza; el gesto de cierre está en el asa y se conservan los botones de cierre de GO.

- Empresa muestra el cliente del recibo autorizado; Usuario muestra su empresa y profesional. Los nombres históricos de desarrollo conocidos se omiten en la presentación, sin modificar registros legítimos.
- WhatsApp y Llamar usan el contacto de esa perspectiva. Los números internacionales se normalizan; un dato ausente o mal formado no genera botón.
- Las propuestas conservan y muestran la fecha vigente, separada de la propuesta, con contorno naranja.
- Las acciones usan los comandos existentes de reservas. Las tareas internas usan `changeTask`, con comprobación de propietario; las compartidas mantienen su flujo de negociación. Aceptada no significa realizada.
- Servicios, complementos, importes y fases se leen del recibo guardado. No se cobran componentes incluidos ni se muestran opciones no contratadas.

## Proyección de contactos del backend

La definición de `go_reservation_negotiation.receipt(uuid)` en `artifacts/api-server/supabase/drafts/booking_negotiation_v1.sql` añade `business_phone`, `business_whatsapp` y `customer_phone`. Este último solo se devuelve al propietario de la empresa verificada. La función privada sigue sin ejecución directa para `authenticated`; los RPC existentes verifican cada participante.

Para una base que ya tiene negociación, actualizar **únicamente esa función**, con `CREATE OR REPLACE FUNCTION`, conservando su firma y permisos. No volver a ejecutar el borrador entero sobre un esquema ya instalado. Esta actualización no modifica filas ni credenciales.

La prueba `booking-receipt-contacts.postgres.test.mjs` usa el PostgreSQL local ya existente y revierte todas sus operaciones. Verifica acceso de propietario y cliente, rechazo de terceros y lectura actualizada del teléfono.

La publicación del código no acredita un inicio de sesión, una llamada o una reserva física en producción cuando el alojamiento del backend está inaccesible. La comprobación final en dispositivo sigue siendo necesaria.
# Corrección de fichas y Comunicación GO

Las tarjetas compactas del Landing son estáticas. Sus acciones de estado están
dentro del recuadro; comunicación, transporte y controles congelados permanecen
en su zona existente. El texto extenso se consulta en la misma ficha ampliada.
El cierre ampliado es flotante, inmediato, con área táctil adicional y sin una
fila de formulario reservada. Los estados de la reserva original y de una
propuesta pendiente se identifican separadamente.

MENSAJE GO abre el componente existente `MessagesScreen`, también utilizado por
Comunicación general. Para reservas persistidas, ambos accesos leen el mismo
hilo `booking:<UUID>` mediante el backend y PostgreSQL. La identidad del remitente
y el destinatario se resuelven desde la reserva y la sesión; el cliente no puede
indicar otros participantes. Una respuesta es visible desde cualquiera de los
dos accesos. No se modifica la reserva al abrir o enviar mensajes.

La extensión SQL aditiva está en `supabase/drafts/booking_messages_v1.sql`, después
de negociación. La tabla privada tiene RLS y carece de acceso directo para los
clientes. Las funciones verifican cliente o propietario verificado. Los reintentos
usan un identificador persistido por usuario y reserva; nunca se muestra un envío
como entregado antes de recibir confirmación del servidor. Los borradores se
conservan ante errores, y el cambio de sesión retira el hilo anterior de pantalla.

Los mensajes locales históricos se conservan en sus almacenes originales. No se
importan automáticamente como entregados ni se atribuyen a identidades remotas
sin evidencia. Una reserva exclusivamente local no se convierte en un hilo real
ni se envía por WhatsApp como sustitución de Comunicación GO.

La activación en 8088 utiliza su backend y PostgreSQL aislados existentes. La
disponibilidad de la URL pública del backend y la activación de este SQL en el
entorno público son comprobaciones distintas de publicar el código en MAIN.
