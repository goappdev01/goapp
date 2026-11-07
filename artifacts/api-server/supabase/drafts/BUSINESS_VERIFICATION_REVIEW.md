GO empresarial — implementación preparada y activación pendiente

Integración preparada el 7 de noviembre de 2026 sobre `origin/main` 8d881ed210d0d4f35964123746e0e4dce59c8a01, en la rama `codex/agent4-business-verification-integration-20261107`. Recupera la implementación de `codex/business-verification-20261105` y conserva los cambios posteriores de MAIN, incluida la navegación flotante del panel de verificación. No está activada ni publicada en MAIN.

La publicación requiere autorización productiva. Railway goapp-api está conectado a main y construye Dockerfile.api. La API preparada depende de funciones y columnas que todavía no existen en Supabase. Publicarla por separado puede bloquear la configuración empresarial hasta activar su esquema.

Arquitectura reutilizada

- Se conserva la identidad de Supabase Auth y el registro e inicio de sesión existentes. profiles.role sigue siendo una clasificación, sin conceder autorización empresarial ni administrativa.
- businesses.owner_id relaciona cada negocio con su titular. businesses.verified continúa siendo la autoridad operativa que consultan las APIs y el motor de reservas existentes.
- business_verification_requests se amplía con actividad, revisión, requisitos de la solicitud y estados. No se crea otra tabla de solicitudes ni otro sistema de reservas.
- Se reutilizan admin_memberships, admin_membership_audit y la delegación de permisos existente. OWNER dispone de businesses.verify. Un técnico necesita una delegación expresa de ese permiso.
- Se conservan BusinessAccessGate, VerificacionEmpresaPanel, EmpresaPanel, GoBusinessAccessContext y la plantilla operativa de ocho pasos. Las pantallas de verificación comparten BusinessDossierWorkspace. El selector carga configuración y borradores por usuario y negocio.

Estado real inspeccionado

- Supabase goapp, proyecto xiyxziyjpgnqfecbhmqn, tiene businesses, business_verification_requests, admin_memberships y admin_membership_audit. La solicitud desplegada solo admite pending y rejected.
- La consulta de inventario devolvió cero negocios, cero configuraciones empresariales y cero buckets en ese proyecto. Esto corresponde al proyecto remoto consultado, no a los datos de la recuperación local del PC.
- El historial de Supabase incluye business_verification_access y admin_memberships_go_v1, además de las migraciones de reservas y catálogo. Los comentarios DRAFT de varios archivos del repositorio no equivalen al estado del servidor.
- El motor remoto tiene go_booking_timeline, pero no el validador actual de fases con firma validate_service_timing(uuid,jsonb,integer,boolean). La activación del expediente no debe presentarse como validación de todas las funciones de reservas en producción. Las pruebas locales sí incorporan las funciones consolidadas de fases, huecos y catálogo.
- No se ha aplicado el SQL nuevo a producción ni a la base recuperada de GO. Las pruebas crean bases independientes con prefijo go_business_verification_test_ en el PostgreSQL local ya existente. Solo contienen datos sintéticos y no participan en el funcionamiento de la aplicación.

Flujo y seguridad

- Nuevo negocio guarda un registro provisional y su expediente de forma transaccional. Una solicitud nueva no reutiliza el último negocio del usuario. Cada comando lleva un identificador de reintento y una revisión esperada.
- Los estados son draft, documents_pending, pending, correction, rejected, authorized, suspended y revoked. Guardar datos o subir un archivo nunca aprueba el negocio.
- La empresa solo puede editar y enviar su expediente. ADMIN revisa documentos, solicita correcciones y toma decisiones con motivo, actor, fecha, revisión e historial privado.
- La aprobación fija verified=true y deja booking_enabled=false. La publicación de servicios y la disponibilidad pública conservan sus requisitos independientes. Suspender o revocar fija verified=false y booking_enabled=false, sin borrar reservas, servicios ni profesionales.
- Las APIs comprueban identidad, titular y autorización efectiva de la empresa. RLS y triggers refuerzan las escrituras directas a PostgREST y utilizan el bloqueo de negocio existente. Las cancelaciones personales conservan sus reglas anteriores.
- Los requisitos se configuran por actividad con versiones. La ausencia de configuración impide el envío. Una lista vacía solo se admite como decisión explícita de un verificador habilitado. Los requisitos de una solicitud en revisión quedan guardados con su versión.
- business_verification_documents almacena metadatos y versiones, no los archivos. Se prepara un bucket privado business-verification, limitado a PDF, JPEG y PNG de hasta 10 MiB. Las rutas las genera el servidor con los UUID de negocio y documento.
- La aplicación valida firmas de archivo y tamaño en la API. Storage aplica sus límites y RLS por expediente. El documento se confirma contra los metadatos reales de storage.objects. Para abrirlo, la API vuelve a comprobar permisos y bytes, y solicita un enlace de 60 segundos con el JWT del participante. No utiliza una clave service_role ni URLs públicas permanentes.
- Los objetos no se sobrescriben, mueven o eliminan mediante estas políticas. Una sustitución conserva la información y el historial anteriores.
- Los borradores anteriores se recuperan por identidad y negocio. Los fallos de conexión conservan el comando pendiente para reintentar con el mismo ID. Un rechazo definitivo de validación, permisos o revisión libera ese intento para poder corregirlo.

Transición de registros anteriores que requiere revisión antes de aplicar

- Se conservan las aprobaciones explícitas existentes que no tienen una solicitud contradictoria. No se aprueba ningún negocio con verified=false.
- Si `businesses.verified` y una solicitud antigua discrepan en cualquier dirección, la migración falla con `AMBIGUOUS_LEGACY_AUTHORITY` y revierte toda su transacción. No modifica la empresa, la solicitud ni sus reservas. Un administrador debe revisar y reconciliar ese registro antes de volver a intentar la activación. No se revocan permisos anteriores automáticamente ni se inventan aprobaciones.
- La transición registra el estado anterior y posterior. Los eventos de migración tienen actor de base de datos y no atribuyen una decisión humana ficticia a un administrador.
- El RPC antiguo submit_business_verification queda cerrado con USE_BUSINESS_DOSSIER. La activación de esquema y cliente debe coordinarse para que los clientes anteriores no sigan usando ese recorrido sin documentos.

Pruebas completadas

| Requisito | Evidencia automática |
|---|---|
| Registro y acceso personal | Pruebas existentes de signup, login, recuperación y callbacks |
| Alta con cuenta existente y una sola identidad | PostgreSQL comprueba profiles.role sin cambios y nuevos expedientes por owner_id |
| Varias empresas independientes | Dos negocios distintos, selección móvil y rechazo del acceso operativo al negocio pendiente |
| Persistencia de expediente | Transacciones confirmadas y lectura desde una conexión PostgreSQL nueva |
| Documentos privados | RLS real de tablas Storage en base aislada, denegación a otro titular y a anon, validación HTTP de bytes |
| Envío y estado | Transiciones reales a pending y rechazo por requisitos pendientes |
| Rechazo, corrección y reenvío | Sustitución con conservación de documentos rechazados e historial |
| ADMIN habilitado | Delegación explícita, aprobación exclusiva y denegación después de revocar el permiso |
| Suspensión y revocación | Denegación inmediata de nuevas operaciones y consulta del estado efectivo |
| Configuración restringida | Escritura de servicios denegada a pendientes y permitida a autorizadas |
| Aislamiento e identificadores | Otro titular, ruta manipulada y documento ajeno rechazados |
| Separación entre titular y ADMIN | Autoaprobación del empresario denegada y permisos administrativos independientes |
| Registros anteriores | Prueba PostgreSQL preparada: una contradicción aborta la migración sin tocar empresa ni solicitud; tras revisión sintética, conserva la reserva histórica |
| Regresión de reservas | Creación mediante el motor real de fases, configuración persistente y pruebas API de servicios múltiples |
| Concurrencia | Alta repetida con dos conexiones crea un negocio. Dos revisiones simultáneas producen una confirmación y un conflicto |
| Fallos parciales | Alta inválida revierte sin negocio huérfano. Borrador y comando sobreviven a un error o recarga |
| TypeScript | Librerías, móvil y API correctos. Backend compilado correctamente |
| iOS SDK 58 | Exportación con Hermes y mapas de fuentes. Coincidencia exacta de los doce módulos móviles modificados |

La rama original superó 22 pruebas API y regresión, 16 móviles y 8 PostgreSQL el 5 de noviembre. En la integración actual pasan TypeScript móvil y API, la compilación de API, la exportación iOS SDK 58, 27 pruebas API ampliadas y 16 pruebas móviles dirigidas. Una suite móvil más amplia dio 100 aprobadas, 8 fallidas y 1 omitida; los ocho fallos están en pruebas de registro y sesión sin cambios de esta rama: el arnés no inyecta `loginApiBase` y una aserción espera el nombre antiguo del argumento de `saveAuthSession`. No se atribuyen a la integración empresarial ni se presentan como pruebas superadas. La migración modificada todavía no se ha vuelto a ejecutar en PostgreSQL aislado porque no hay un servidor local de pruebas disponible en este entorno. Aquella validación anterior no demuestra que el SQL actualizado funcione.

Límites de lo comprobado

- La API Storage se prueba con transporte controlado. Las políticas de Storage se prueban en PostgreSQL real con tablas de prueba. La carga y lectura contra el servicio Storage alojado de Supabase sigue pendiente de autorización y activación.
- Las pruebas de autenticación son automáticas. La validación con las credenciales personales y el dispositivo corresponde al propietario.
- La nueva funcionalidad no se ha activado en Metro ni en producción. No se debe confundir una compilación local con un recorrido empresarial operativo.

Plan de integración reservado a la autorización del propietario

1. Volver a comprobar MAIN, configuración de Railway y esquema desplegado. Revisar diferencias concurrentes y el inventario de estados anteriores; resolver cualquier contradicción de autorización con una decisión humana documentada antes de activar.
2. Conservar un respaldo seguro del esquema y de los registros afectados. Confirmar la posibilidad de recuperación sin eliminar archivos o expedientes nuevos.
3. Autorizar y aplicar business_verification_lifecycle_v1.sql como migración en Supabase goapp. Incluye tablas documentales y de auditoría, funciones, trigger de permisos, delegación específica y bucket privado con RLS. La migración se ejecuta en una transacción.
4. Configurar los requisitos documentales por actividad desde ADMIN. El código no impone una lista normativa universal ni decide qué documentación es legalmente suficiente.
5. Publicar la implementación revisada en MAIN y permitir el despliegue del servicio goapp-api existente en Railway. Verificar salud y disponibilidad de los RPC necesarios. No crear servicios ni cambiar secretos o credenciales.
6. Validar carga privada y denegaciones con el proveedor real, y comprobar el recorrido empresarial autorizado. Resolver previamente cualquier incompatibilidad de las funciones de reservas ya desplegadas sin afirmar que están validadas por estas pruebas aisladas.
7. Sincronizar el mismo Expo 8088 con la revisión publicada y verificar manifiesto, fuentes entregadas y conexión con la API de destino. La recuperación local y Supabase remoto tienen datos distintos y no se fusionan implícitamente.
8. Realizar una comprobación física final. El Agente 4 podrá usar snapshot.business, snapshot.businesses, selectBusiness, allowed y los estados del expediente para su posterior simplificación visual.

Ante una incidencia se conserva el historial y la información documental. Volver al SHA anterior no debe acompañarse de un borrado automático de las tablas o documentos añadidos.
