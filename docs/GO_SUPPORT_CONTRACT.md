# Soporte GO: acceso preparado, recepción pendiente

Landing abre directamente cuatro opciones: incidencia, mejora, ayuda y mis
solicitudes. La órbita reutiliza PremiumOrbitBtn y la preferencia handedness.
No se ha encontrado una API, almacenamiento o panel de soporte reutilizable.
No se instala ni configura un gateway de producción: ENVIAR está desactivado,
se informa de la indisponibilidad y Mis solicitudes no muestra un vacío ficticio.
Los textos permanecen solo en memoria al cerrar; un cambio de cuenta los limpia.
El dictado nativo del teclado funciona como en cualquier campo de texto.
No se capturan pantallas, voz, archivos ni datos privados automáticamente.

## Contrato para activar recepción real

El puerto SupportGateway es la única integración prevista; las pruebas usan
transporte sintético, que nunca se monta en la aplicación. No hay sistema DEMO.

- POST /support/requests recibe kind (incident/improvement/help), message
  (1–4000 caracteres), contexto opcional Landing y requestKey idempotente.
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
Adjuntos pendientes hasta disponer de almacenamiento privado con validación
de tipo/tamaño, permisos por solicitud, descarga autorizada y política de borrado.
No se muestran botones de adjuntos sin servicio funcional.

## Autorización pendiente

Para habilitar envíos y atención de extremo a extremo se requiere autorización
específica para implementar/desplegar el servicio y almacenamiento revisados,
sus permisos de remitente/soporte y política de datos. No se ha cambiado Railway,
Supabase, SQL, permisos, datos reales ni activado servicios de pago.
Tras desplegar: verificar escritura real, reapertura, estados/respuesta, ausencia
de duplicados y rechazo de consultas ajenas por ID con cuentas sintéticas.
La comprobación física de posición, teclado y cierres en iPhone queda al propietario.
