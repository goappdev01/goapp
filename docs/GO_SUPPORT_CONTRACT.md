# Soporte GO: API implementada, activación de datos pendiente

Estado actual: las rutas reales, gateway, permisos SQL, adjuntos y retención están
implementados y probados de forma aislada. La activación alojada sigue el documento
`artifacts/api-server/supabase/drafts/GO_SUPPORT_ACTIVATION.md`: requiere respaldo
restaurado y autorización específica para la migración. Los apartados siguientes
conservan el historial de diseño; las referencias antiguas a ausencia de API no
describen el código actual. No se declara operativo el circuito alojado hasta
verificar envío → ADMIN → respuesta → remitente con persistencia y Storage reales.

AYUDA cambia temporalmente las etiquetas/acciones de las ocho órbitas reales
de Landing, sin sustituir sus colores ni coordenadas. Cuatro posiciones abren
incidencia, mejora, ayuda y mis solicitudes; una quinta permite volver.
Las cinco acciones conservan su luminosidad y las otras tres quedan visibles,
atenuadas y sin interacción. La asignación funcional se refleja para zurdos,
con prioridad inferior/derecha para diestros. No existe panel intermedio.
La órbita reutiliza PremiumOrbitBtn y la preferencia handedness. Tamaño de 48
puntos en iPhone (60 en anchos mayores), azul GO y mayor espacio para la etiqueta.
La etiqueta AYUDA usa 8 puntos y margen interior de 6 puntos. Los formularios
reutilizan GoCloseButton con una sola flecha inferior en el lado dominante: primero
oculta el teclado, y con el teclado cerrado vuelve a las órbitas de ayuda.
Las cuatro superficies son blancas, con texto oscuro y bordes discretos.
Los campos conservan su borrador al volver. El editor crece hasta un límite,
permanece cerca del pie y admite desplazamiento para textos largos. El teclado
utiliza un único KeyboardAvoidingView y su flecha lo oculta sin borrar el texto.
El envío se integra en el editor con avión de papel pequeño verde y objetivo
táctil de 44 puntos. Sin transporte real permanece desactivado y atenuado.
GO y la flecha quedan juntos justo sobre el editor, en el lado dominante,
reflejados para zurdos. La altura real del editor determina su posición, dentro
de una superficie táctil completa; no se reserva una fila exclusiva para GO.
Las vistas de poca altura redistribuyen micrófono/envío y limitan el campo sin
perder desplazamiento. Mis solicitudes conserva su lista y amplía GO de 56 a
64 puntos, junto al cierre. No hay mensajes provisionales permanentes.
No se ha encontrado una API, almacenamiento o panel de soporte reutilizable.
No se instala ni configura un gateway de producción: ENVIAR está desactivado,
Mis solicitudes tiene una plantilla para resumen, tipo, fecha, estado y detalle/
respuesta expandible de registros reales. El estado vacío no inventa tickets
ni afirma que se ha consultado un servidor que todavía no está conectado.
Los textos permanecen solo en memoria al cerrar; un cambio de cuenta los limpia.
El dictado nativo del teclado funciona como en cualquier campo de texto.
Un micrófono independiente reutiliza useGoNoteVoice/useBookingVoice: comprueba
disponibilidad antes de pedir permisos o grabar, inserta una sola transcripción
final en el cursor y conserva el texto previo. Cancelar/cambiar cuenta invalida
la captura. No hay cuentas regresivas ni envío automático del formulario.
Los fallos del dictado solo se muestran tras intentarlo, como un aviso breve,
neutro y cerrable. Se mantiene la distinción de permiso, sesión y disponibilidad;
las validaciones y los errores nativos originales no se modifican.
No se capturan pantallas, voz, archivos ni datos privados automáticamente.
No hay casilla ni envío automático de contexto Landing, ni placeholder de dictado.

## GO IA y adjuntos compartidos

Las cuatro pantallas abren el GOChatScreen existente en modo de consulta sin
acceso al dispatcher de tareas/reservas. GoScreenHost conserva un solo modal
nativo. La consulta no sustituye el borrador; una propuesta válida requiere
«Usar propuesta en AYUDA» y comprobar que el texto original sigue intacto.
En este contexto el asistente presenta GO y una única flecha a su derecha
(espejo zurdo) flotando sobre el editor inferior, con avión verde integrado.
La flecha oculta primero el teclado y después regresa al formulario; aceptar
una propuesta conserva su retorno directo. El asistente general de reservas y
tareas mantiene su dock, sus controles y su comportamiento anteriores.
No se incorpora automáticamente el historial privado de Mis solicitudes.
No hay otro motor de IA ni peticiones de interpretación de pago.
El puerto de respuesta está preparado y probado con transporte sintético,
pero no está conectado en producción: la API actual declara interpretation:
false y transcription: false. La consulta informa brevemente de su ausencia
solo al intentarlo y conserva el texto. No se afirma que IA/dictado estén activos.
Activar asistencia real requiere un servicio existente compatible/autorizado.

Incidencia/mejora usan un único acceso compacto y GoNoteAttachmentMenu, extraído
de las opciones reales del editor de Notas. Notas conserva su campo de enlace,
su estilo de opciones y sus manejadores originales. AYUDA reutiliza sus opciones
de PDF/fotografías dentro de la bandeja lateral, reflejada según la mano; conserva
el almacén privado de soporte y la retirada individual descritos más abajo.

## Contrato para activar recepción real

El puerto SupportGateway es la única integración prevista; las pruebas usan
transporte sintético, que nunca se monta en la aplicación. No hay sistema DEMO.

- POST /support/requests recibe kind (incident/improvement/help), message
  (1–4000 caracteres) y requestKey idempotente. Cualquier contexto futuro
  requiere consentimiento apropiado; los formularios no lo incorporan.
  El servidor deriva el remitente de la sesión validada; no acepta ownerId,
  rol de soporte ni estado elegidos por el cliente. Debe guardar atómicamente
  antes de responder con id, reference, requestKey y estado received.
- GET /support/requests devuelve exclusivamente solicitudes del remitente
  autenticado, con estados received/in_progress/answered/closed y respuesta.
  Debe incluir paginación y comprobación de identidad en cada petición.
- Operaciones del equipo de soporte: permisos efectivos del servidor para
  consultar, clasificar y responder. Denegar por defecto y comprobar también
  el acceso por identificador. Ninguna autorización basada en metadata editable.
- La referencia visible no concede acceso. Reintentos con la misma requestKey
  recuperan el mismo registro; cambios de contenido requieren otra operación.
  Un fallo o resultado incierto conserva el texto y nunca muestra recibido.
- Al desplegar, añadir límites de tamaño y frecuencia, validación, protección
  frente a abuso y registros sin contenido privado, credenciales ni tokens.
  Definir conservación, eliminación y acceso autorizado antes de almacenar.

## Sin cuenta y archivos

El acceso al formulario no exige cuenta. Una recepción anónima futura necesita
un contrato explícito: protección contra abuso y comprobación voluntaria de un
medio de contacto o credencial privada de seguimiento. No se inventan usuarios
ni se consulta por teléfono/nombre. No se activa ese flujo sin soporte de servidor.
Incidencia y mejora abren los selectores nativos de fotografías/documentos.
La selección, vista previa de imágenes, nombre de archivo y retirada individual
funcionan localmente. Se admiten JPEG/PNG/HEIC/HEIF/WebP y PDF, máximo 10 MB
por archivo, 5 archivos y 25 MB por sesión. Se comprueban MIME/extensión y tamaño
real antes y después de copiar. La futura recepción debe comprobar también
el contenido real, además de las validaciones del cliente.
Las copias se guardan bajo una carpeta opaca de sesión en caché privada de la
aplicación, separada de Notas. Retirar borra solo la copia propia; cambiar cuenta/
desmontar limpia esa carpeta. Cerrar el formulario conserva el borrador en memoria.
No hay subida, URL pública ni persistencia de solicitudes. La caché temporal no
garantiza recuperación después de reiniciar o limpieza de caché del dispositivo.
El gateway futuro debe declarar soporte de adjuntos y confirmar cada clientId
con un identificador almacenado antes de mostrar recepción. Su almacenamiento
privado, permisos por solicitud, descarga autorizada y borrado siguen pendientes.

## Autorización pendiente

Para habilitar envíos y atención de extremo a extremo se requiere autorización
específica para implementar/desplegar el servicio y almacenamiento revisados,
sus permisos de remitente/soporte y política de datos. No se ha cambiado Railway,
Supabase, SQL, permisos, datos reales ni activado servicios de pago.
Tras desplegar: verificar escritura real, reapertura, estados/respuesta, ausencia
de duplicados y rechazo de consultas ajenas por ID con cuentas sintéticas.
La comprobación física de posición, teclado y cierres en iPhone queda al propietario.
