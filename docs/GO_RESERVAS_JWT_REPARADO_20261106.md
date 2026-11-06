# Emisor JWT local reparado — 6/11/2026

Base MAIN inspeccionada: `2122b3bfa05e934c70adf93bf55eba322ec54344` (204).
Se aplicó la autorización directa del propietario para el proveedor local de
validación, no una modificación de Supabase Auth ni un despliegue Railway.

## Causa y reparación

Antes: `/api/supabase/businesses` devolvía 401 / PGRST303 / JWT expired aun sin
sesión. El proveedor firmaba un fallback anon de 24 h al arrancar y lo reutilizaba
indefinidamente. La sesión del usuario no era la causa de esa consulta pública.

Se recuperó `createAnonymousAuthorization` de la rama de preparación. Se conserva
el mismo firmante y rol anon, se renueva 60 segundos antes de expirar y se invalida
la caché si retrocede el reloj. Cualquier Authorization recibido se reenvía intacto,
también si es inválido; no se degrada a anónimo para ocultar un rechazo.

`tools/go-validation-bridge/repair-provider.cjs` restringe la intervención al
proveedor y SHA revisados. Antes de escribir comprueba los hashes de ambos archivos
originales/overlays contra `provenance.json` y guarda copias recuperables. Solo
sustituye el emisor fijo y el fallback del header. Actualiza el digest esperado
del overlay modificado; no elimina ni desactiva su comprobación.

El preload compila el overlay con el nombre del archivo original: el require
relativo se resuelve en `phone-fixture`. Se copió allí el mismo helper verificado,
y se conservó una copia idéntica junto al overlay. No se tocó el preload, su
verificación de procedencia, el puente de identidad, los permisos, las reglas
de publicación, la API, los tokens de usuarios ni archivos financieros.

- Overlay original SHA256: `3d5dd37f2b8b1a53dc2059d4ff4b319486e5e2eb87a20f38b686661058ae7dda`.
- Overlay reparado SHA256: `65c42b60133146821f69aa6d2dc9c1969690804a4a74a97f613be998a485f3b8`.
- Helper SHA256: `0613d21533f03fd739119f815feab7b2068873fb920283225d7a0e725dbdcf32`.
- Preload intacto SHA256: `486c4d6800fc29dfa4bf0bee1db5e26c8dc6a1e2a952f6c46286cfa3380d97b5`.
- Copia recuperable: `runtime/admin-business-registration-20261103/jwt-renewal-backup-2026-11-06T01-28-55-807Z`
  dentro de la recuperación externa. Conserva fuente, procedencia anterior y prueba.

Tras pasar `--preflight` con el mismo cargador se recargó únicamente el proceso
loopback 65441 (4832 → 18832). API 3002 (13192), PostgREST 65440 (1124), Metro
Tailscale 8088 (2392) y proxy local (8928) siguieron sin reinicio. Se conservan
los headers de comprobación financiera y de registro empresarial.

## Evidencia y límites

- Catálogo público por Tailscale: **HTTP 200**, dos establecimientos.
- Servicios del primer establecimiento: **HTTP 200**.
- API health: **HTTP 200**; Metro: `packager-status:running`.
- Petición inválida a `/auth/v1/user`: **401**.
- Escritura de reserva sin sesión: **401**, sin crear datos.
- Helper/parche: **9/9**; incluye expiración simulada >24 h, umbral, retroceso
  del reloj, reenvío intacto, fallos del firmante y rechazo de fuente inesperada.
- Puente de identidad existente: **24/24**, con datos/transporte sintéticos.
  No se han usado credenciales reales ni cambiado registros de clientes.

La consulta pública no depende del tipo de cuenta: las regresiones móviles
ejecutan particular/empresa con sesión caducada y conservan la autenticación de
escrituras. No equivale a iniciar sesión empresarial ni a confirmar una reserva
real propia/ajena. Esa comprobación autenticada y el iPhone quedan pendientes.
La renovación después de 24 h se prueba con reloj sintético, no esperando 24 h
en el servidor activo ni alterando el reloj del equipo.

## FAST: preparado por separado, NO activo

La continuación se conserva/publica en `codex/agent4-fast-confirmation-20261106`:
reutiliza vistas 4/7/8, contexto profesional, catálogo, cliente invitado y agenda
privada; añade imagen PNG y opciones de compartir en la misma confirmación.
La lógica de servidor aislada prueba permisos, revalidación de plan, idempotencia,
recuperación y rollback contra un repositorio sintético, no PostgreSQL productivo.

Falta el adaptador transaccional/RPC y la ampliación revisada del esquema para
`customer_id` nullable, snapshot invitado, contactos privados y operaciones durables,
con RLS y permisos de empleados. El motor actual exige un perfil GO y usa al actor
si se omite el cliente. No se conecta de esa forma ni se simula un invitado.
La rama detalla la intervención que debe revisarse y autorizarse antes de activar
FAST. No se ejecutaron migraciones, SQL, cambios de permisos ni despliegues.

GO: dependencia de destinatario verificado y mensajería autorizada; no hay envío.
WhatsApp: mecanismo nativo de compartir PNG/texto preparado y probado con mocks,
no envío ni prueba física. QR/enlace omitidos mientras no exista URL oficial
verificada. Cancelar o compartir de nuevo nunca crea otra reserva.
