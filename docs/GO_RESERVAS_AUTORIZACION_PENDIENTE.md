# Reservas: autorización externa pendiente (6/11/2026)

> Actualización: la reparación del emisor local ha sido autorizada y aplicada
> el 6/11/2026. El catálogo vuelve a HTTP 200. La autorización de infraestructura
> para clientes invitados FAST sigue pendiente. Véase
> [resultado de la reparación](./GO_RESERVAS_JWT_REPARADO_20261106.md).
> El diagnóstico y propuesta de abajo se conservan como registro previo.

## Catálogo empresarial: causa vigente

La API de validación accesible por Tailscale 8088 devuelve HTTP 401,
`PGRST303 / JWT expired`, con GET `/api/supabase/businesses` sin Authorization
y también con un Bearer inválido sintético. No se han usado credenciales reales.
El health de la API responde 200; no es una prueba de catálogo operativo.

Se ha leído, sin modificar, el proveedor externo activo:

`D:\GO-Recuperacion-20261028-0800\versiones\20261030-482dad1\runtime\admin-business-registration-20261103\provider.cjs`

Ese puente local, administrado junto al runtime externo de validación, emite
mediante su función `sign` un token de rol anon con 24 horas de vida. La ruta
REST del catálogo utiliza ese mismo token durante toda la vida del proceso.
La petición de negocios del servidor es anónima; renovar al usuario del iPhone
no renueva esta credencial. La cuenta empresarial no tiene una prohibición de
reservar como cliente en MAIN. La prueba real con esa cuenta sigue bloqueada.

### Cambio exacto propuesto, NO aplicado

Copiar al mismo directorio del proveedor el helper ya preparado y sin claves
`tools/go-validation-bridge/anonymous-authorization.cjs` de la rama
`codex/agent4-business-calendar-direct` (commit `1a00973`). Sustituir solo:

```diff
-const anon=sign({role:'anon',exp:Math.floor(Date.now()/1000)+86400});
+const {createAnonymousAuthorization}=require('./anonymous-authorization.cjs');
+const authorizationFor=createAnonymousAuthorization({issueToken:sign});

-Authorization:req.headers.authorization??'Bearer '+anon
+Authorization:authorizationFor(req.headers.authorization)
```

El helper renueva únicamente el token anónimo 60 segundos antes de caducar,
utilizando el mismo firmante/rol. Cualquier Authorization recibido se reenvía
intacto, incluso si es inválido: no se degrada una sesión rechazada a anónimo.
También invalida la caché si retrocede el reloj. No contiene claves ni crea
usuarios, permisos o sesiones empresariales.

**Autorización solicitada:** integrar estas sustituciones y el helper en ese
adaptador externo, revisar sus comprobaciones de procedencia/preloads financieros
y recargar de forma controlada solo el proceso de backend que lo carga si resulta
necesario. Mantener Metro 8088, Tailscale, firmante, reglas de publicación y datos.
No eliminar ni saltarse controles de integridad para aplicar el parche.

Tras autorizar: comprobar catálogo sin sesión antes/después del umbral de expiración,
rechazo de credenciales inválidas en operaciones protegidas, login/refresh,
publicación de negocios, catálogo particular/empresa y una reserva autenticada
real propia y otra ajena con recibo y disponibilidad compartida. Esa comprobación
autenticada no se ha realizado y la incidencia no se considera resuelta.

## FAST: operación de servidor que falta

La preparación `codex/agent4-business-calendar-direct` sigue intacta y desactivada.
Ya conecta condicionalmente la franja de `GoReservasConfigScreen` con las vistas
existentes de `BookingSearchOverlay`: servicios → confirmación → éxito.
No hay `BusinessFastGateway` productivo que se pueda conectar de forma segura.

El contrato actual de `POST /supabase/bookings/timeline` no admite un invitado
con nombre/teléfono. El esquema exige `bookings.customer_id NOT NULL` referido a
`profiles.id` y el RPC comprueba ese perfil. Omitir customer_id representa al
profesional autenticado como cliente; no se utiliza para simular una cita telefónica.

**Autorización solicitada por separado:** diseñar, probar y desplegar una adaptación
del contrato/esquema para clientes invitados y agenda privada por negocio,
con permisos de titular/empleado comprobados en servidor, aislamiento/RLS,
guardado transaccional mediante el planificador actual, validación autoritativa
de catálogo/precio/duración, conflictos y recursos, idempotencia durable y
consulta por referencia tras una respuesta perdida. Revisar antes de aplicar
cualquier migración o política. No afecta a la rama de verificación empresarial.

Después se conectan las operaciones preparadas resolveContext, findCustomers y
commit del gateway. Antes de habilitar FAST: recibo real, reapertura de la misma
cita, disponibilidad pública ocupada, rechazo de una reserva concurrente, rechazo
de acceso de otra empresa y persistencia de cliente/archivos sin duplicación.
Hasta entonces no se monta una confirmación sintética ni una agenda local alternativa.

## Marco visual publicable independientemente

La hoja anterior tenía fondo translúcido y un margen mínimo adicional de 12
puntos (8 sobre teclado). Ahora el modal es fullScreen opaco y el fondo cubre
también las zonas seguras, de modo que no se ven controles de pantallas inferiores.
El marco termina exactamente en el safe area inferior comunicado por iOS o en
el límite del teclado, con su trazo insertado 1 punto y las cuatro esquinas
conservadas. No se cambia fecha, navegación, servicios ni motor de disponibilidad.
Las pruebas de geometría/estados no sustituyen la validación física del propietario.
