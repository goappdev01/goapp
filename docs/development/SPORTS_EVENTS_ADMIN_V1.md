# GO Eventos Deportivos · preparación ADMIN V1

## Alcance implementado

La entrada **EVENTOS** se añade como una capa dentro de DEPORTES sin cambiar la geometría de las ocho órbitas existentes. La capa y su panel solo se muestran cuando el contexto es ADMIN, la comprobación de membresía vigente permite `admin.access` y existe una identidad autenticada. EMPRESA, USUARIO, sesiones caducadas y cambios de rol quedan cerrados en cliente y API.

El panel permite a cada identidad ADMIN registrar y editar borradores privados de ofertas, abonos y búsquedas guardadas. Los registros se consultan por propietario, no se publican ni se comparten entre cuentas ADMIN. Una lista sin esquema devuelve `SPORTS_EVENTS_NOT_READY`; nunca se sustituye por datos de muestra ni se comunica un guardado ficticio.

## Límites de operación y seguridad

- Todo registro comienza como borrador; los estados son etiquetas internas del espacio ADMIN.
- Titularidad y derecho de acceso constan como no verificados/autodeclarados. GO no garantiza que una entrada sea válida.
- No se captura ni guarda QR, código de acceso ni información de pago. No hay pagos, anuncios públicos, compradores, reservas, transferencias, intercambios ejecutados, custodia ni disputas automatizadas.
- La búsqueda filtra los registros privados de la identidad ADMIN actual; no es un marketplace ni consulta proveedores externos.
- Los partidos de un abono se introducen como referencia por ADMIN. No se afirma que procedan de un calendario oficial ni que esa persona tenga derecho a ceder el abono.
- La API vuelve a comprobar JWT, membresía activa, permiso `admin.access`, contexto ADMIN y propietario. RPC/RLS repiten autorización y aislamiento por titular. Edición usa control de versión; retirar es baja lógica.
- `go_sports_events_admin_v1.sql` es solo borrador. No se ha aplicado a Supabase, activado almacenamiento ni iniciado un despliegue productivo. La API se cierra con 503 hasta que el esquema exista.

## Compatibilidad pendiente antes de cualquier operación real

La autorización del organizador debe comprobarse por evento, competición y tipo de entrada. No se debe inferir compatibilidad universal a partir de que una plataforma ofrezca transferencias: Ticketmaster indica que la transferencia depende de que el organizador la habilite y genera un código nuevo para el destinatario; la UEFA advierte sobre entradas no transferibles y limita las ventas a sus canales oficiales en ciertos eventos. Las reglas legales también varían por territorio: la Ley vasca 10/2015, art. 17, prohíbe la reventa no autorizada con recargo, y el Centro Europeo del Consumidor recoge diferencias autonómicas y riesgos de reventa.

- [Ley 10/2015 de Espectáculos Públicos y Actividades Recreativas del País Vasco, art. 17](https://www.boe.es/buscar/act.php?id=BOE-A-2016-729)
- [Centro Europeo del Consumidor: riesgos de reventa de entradas](https://portal-cec.consumo.gob.es/es/informacion-general/compras-online/reventa-de-entradas)
- [Ticketmaster España: transferencia sujeta a habilitación del organizador](https://help.ticketmaster.es/hc/es/articles/5442967080081--C%C3%B3mo-funciona-la-transferencia-de-entradas)
- [UEFA: advertencia sobre compra no autorizada y entradas no transferibles](https://www.uefa.com/news-media/news/02a5-20a99f8db810-278e2d7a8e20-1000--uefa-warns-fans-over-risks-of-unauthorised-ticket-purchases/)

Una futura integración de calendario oficial, validación de titularidad, transferencias, intercambio con dos partes, pagos, soporte de disputas o cualquier acceso EMPRESA/USUARIO requiere revisar condiciones del organizador, pruebas, permisos e infraestructura, y obtener su autorización específica antes de activarla.
