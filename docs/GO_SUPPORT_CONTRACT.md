# GO AYUDA: contrato del circuito

El editor aprobado conserva incidencia, mejora, consulta y MIS SOLICITUDES.
GO Asistente y dictado solo se muestran como disponibles cuando sus motores
existentes lo estén. Enviar una solicitud no depende de IA ni transcripción.
Los borradores se conservan en la sesión del editor; la papelera limpia solo
el texto del formulario activo.

## API y datos

`/api/supabase/support` recibe un JWT de sesión vigente. El servidor verifica
la identidad en Auth y llama a funciones PostgreSQL que vuelven a aplicar RLS.
No acepta un `sender_id` ni un rol enviado por el móvil. Las rutas son:

- `POST /requests`: tipo, cuerpo, UUID `requestKey`, `businessId` opcional.
- `GET /requests`: bandeja propia o ADMIN, paginada y filtrada por estado,
  tipo, archivo, fechas y remitente. `GET /requests/:id`: hilo y auditoría.
- `POST /requests/:id/actions`: respuesta pública, nota interna, estado,
  archivo o reapertura; requiere UUID idempotente y revisión vigente.
- `POST /requests/:id/files`, `POST /files/:id/content` y
  `POST /files/:id/confirm`: reserva, carga binaria y confirmación.
  `GET /files/:id/link` emite un enlace privado de 60 segundos. La X retira
  cada adjunto individualmente.
- `POST /retention/purge`: solo ADMIN, elimina objetos mediante Storage API
  antes de purgar el contenido vencido de PostgreSQL.

La referencia `AY-...` es visible, pero nunca concede acceso. Crear o repetir
con el mismo `requestKey` devuelve el mismo registro; una carga incierta puede
reintentarse con el mismo identificador. Las acciones comprueban `revision`
para evitar escrituras concurrentes y registran actor, estado anterior,
estado nuevo y fecha. Recibida, en revisión, pendiente, solucionada y
rechazada son estados; archivo es una clasificación separada.

Las personas ven únicamente sus solicitudes. Una solicitud de empresa exige
que el remitente sea propietario de esa empresa y que siga verificada. ADMIN
AYUDA está limitado a la membresía activa `owner` del servidor. Las notas
internas son invisibles para el remitente, incluso en la auditoría. Los
adjuntos están en `go-support-private`, con RLS para carga, lectura y borrado.
Se admiten PDF, JPEG, PNG, HEIC, HEIF y WebP, máximo 10 MiB por archivo, cinco
archivos y 25 MiB por solicitud. La API comprueba tamaño, MIME, extensión y
firma binaria antes de cargar. No se usan URL públicas permanentes.

## Conservación

El plazo aprobado es de **12 meses a partir del archivado**. Reabrir elimina
ese vencimiento; volver a archivar inicia un nuevo plazo. La limpieza retira
primero los objetos privados mediante Storage API, después mensajes, eventos,
archivos y solicitud. Solo conserva recuentos agregados por mes, tipo y estado,
sin identificadores ni contenido. La bandeja de archivo ADMIN ejecuta la
limpieza de vencidas al abrirse. La ejecución estrictamente programada sin
visita de ADMIN requiere un ejecutor de servicio persistente y credenciales
de mantenimiento que aún no están configurados; no se simula esa garantía.

## Comprobación y despliegue

Las pruebas aisladas usan PostgreSQL temporal y datos sintéticos. La conexión
real requiere que la migración esté aplicada, que la API desplegada incluya
las rutas y que Expo sirva el bundle del mismo MAIN. Una respuesta de ENVIAR
solo se acepta tras recibir confirmación de persistencia y de todos los
adjuntos. La prueba física y el recorrido con cuentas autorizadas deben
comprobarse después del despliegue; las pruebas sintéticas no los sustituyen.
