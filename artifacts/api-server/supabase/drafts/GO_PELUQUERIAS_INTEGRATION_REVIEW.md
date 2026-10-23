# GO Peluquerías V1 — revisión técnica para Nelson

Fecha: 23/10/2026. **Preparación local; sin autorización de publicación ni de activación real.**

Repositorio: `goappdev01/goapp`, destino futuro `main`. Base examinada: `6c834db0d02a9ad3d1efc7825287d40767dafdd8`. Rama preparada: `codex/go-peluquerias-v1-integration-20261023`. Los cambios siguen sin commit. Este documento no constituye una entrega aceptada por el propietario.

## Código preparado y contrato vigente

Se han conciliado las 14 divergencias entre motor/catálogo y la copia conjunta. El cliente usa `/api/supabase/catalog/quote`, `/bookings/catalog` y `/booking-availability`, respaldados por el mismo planificador temporal. `/bookings/timeline` conserva el contrato de reservas sin complementos. El contrato anterior `/bookings` con `service_ids` se conserva para compatibilidad; no sustituye al motor avanzado ni al consentimiento de catálogo.

Una confirmación genera una reserva canónica. Los calendarios proyectan esa reserva; no se crean citas independientes por servicio o complemento. El presupuesto y el plan revisados se contrastan de nuevo en servidor. Las propuestas conservan el intervalo vigente hasta su aceptación, sin modificar automáticamente cobros o devoluciones. Los reintentos usan una identidad estable.

DEMO local conserva su circuito continuo y aislamiento por UUID/empresa. Se ha recuperado su selección múltiple mediante Guardar y se ha conciliado con la negociación: la duración y las especialidades se comprueban sobre todos los servicios. Las fases avanzadas y asociaciones del servidor no se simulan en AsyncStorage.

## SQL: orden de revisión y efectos

No aplicar estos archivos directamente a una base real. Comparar primero las seis migraciones versionadas existentes con el historial del entorno de destino. No reproducir una provisión de fixture sobre una base existente.

Orden probado en bases ficticias nuevas:

1. Esquema de las migraciones versionadas existentes.
2. `booking_multi_service_v2.sql`, si se conserva el contrato compatible anterior. Debe preceder a los borradores siguientes. Esta variante está incluida en las pruebas actuales; sigue siendo una decisión de activación.
3. `booking_negotiation_v1.sql`.
4. `booking_verification_v1.sql`.
5. `booking_timeline_v1.sql`.
6. `catalog_associations_v1.sql`.

| Área | Relaciones/configuración afectadas | Efecto que requiere revisión |
| --- | --- | --- |
| Servicios múltiples anteriores | `public.bookings`, `go_booking_private` | Añade selección, detalle, duración, importe, moneda y clave idempotente. Conserva filas e identificadores antiguos. |
| Negociación | `public.bookings`, funciones y esquema privado de negociación | Propuesta, revisión e historial sobre la reserva existente; acuerdo transaccional e idempotencia. |
| Verificación/QR | Esquema privado de verificación y relaciones existentes de reservas/profesionales | Códigos y aceptación/revocación con permisos del participante. Revisar dependencia `pgcrypto` y el vínculo confiable de identidad profesional. |
| Tiempos y recursos | `public.bookings`, `public.availability`, `services/staff/businesses.ui_metadata`, `go_booking_timeline_private` | Snapshot temporal, comandos, turnos nocturnos y sustitución de la exclusión de solapamientos por una exclusión parcial para filas antiguas más el comprobador común para fases nuevas. |
| Asociaciones | `public.services`, `public.bookings`, `go_catalog_private.associations`, `go_catalog_private.booking_commands` | Productos de duración cero identificados explícitamente, relaciones por UUID, consentimiento y snapshot económico aceptado. No crea un catálogo ni un sistema de stock paralelos. |

El motor instala guardas comunes para impedir que una ruta antigua eluda duración, ocupación, recursos o consentimiento. No eliminar esos triggers ni restaurar aisladamente una restricción antigua sin analizar las reservas por fases existentes.

### Configuración de recursos

Todos los servicios participantes deben declarar su configuración de recursos para permitir reutilizar con seguridad los tiempos de espera. Un servicio heredado sin esa configuración conserva una ocupación conservadora. En la nueva prueba conjunta, el servicio complementario tuvo que declarar explícitamente que sus recursos estaban configurados; no se relajó el motor para hacer pasar la prueba.

## Permisos y privacidad

- Se reutilizan JWT, `auth.uid()`, pertenencia a la empresa y RLS; no se usa `service_role` en el cliente.
- Ningún control visual sustituye autorización del servidor.
- En la base ficticia se examinaron 30 rutinas privadas: cero ejecutables por `anon` y cero funciones privilegiadas con `search_path` inseguro.
- `authenticated` no tiene escritura directa en los snapshots temporal y de catálogo.
- La gestión exige propiedad legítima de la empresa correspondiente. No se amplían permisos globales de profesionales.
- **Pendiente de Nelson/producto:** lectura de reservas por una cuenta profesional independiente, especialmente cuando participa únicamente en una fase. Las vistas filtradas por profesional desde la cuenta empresarial no acreditan esa autorización independiente. Determinar si ese acceso es indispensable para el primer piloto.

## Configuración del backend

Variables existentes: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` o la alternativa existente `SUPABASE_ANON_KEY`, y `PORT`. Revisar además las variables propias del entorno de destino antes del arranque. No incorporar valores privados al repositorio. El cliente recibe únicamente la URL de backend `EXPO_PUBLIC_API_URL`; nunca una clave privada.

La pasarela 3001 sigue siendo de verificación privada, con su allowlist y CORS existentes. No habilitar escrituras del piloto cambiando indiscriminadamente esa pasarela. Una instancia de pruebas requiere un backend independiente autorizado y una conexión identificada a su propia base.

## Evidencia actual de integración

- Instalación habitual: Node 22.14.0, pnpm 10.17.1; `pnpm install --frozen-lockfile --prefer-offline` correcto. Git `sh` se añadió solo al PATH de ese proceso. Lockfile y versiones no fueron cambiados por la instalación.
- `pnpm run typecheck:libs`, TypeScript móvil y TypeScript backend: correctos con sus configuraciones normales.
- 419 pruebas móviles distintas superadas en los grupos dirigidos. Se corrigieron seis expectativas antiguas y se repitieron los dos archivos afectados; no se eliminó cobertura.
- 80 pruebas de servidor superadas: 17 regresiones HTTP, 19 comprobaciones de catálogo combinado y 44 de motor/compatibilidad con el contrato anterior. Los dos últimos grupos usan PostgreSQL 15.19, PostgREST 14.18, JWT y Express reales sobre bases ficticias.
- Nuevo caso conjunto: dos servicios, complementos obligatorios/opcionales/incluidos, consentimiento, importe, 90 minutos de cliente/60 de trabajo, recursos, atención simultánea durante espera, rechazo de retorno solapado y una reserva tras reintentar.
- `git diff --check` correcto. Respaldo con hashes y parche reversible comprobado sin aplicarlo.

No se repitieron las baterías históricas de 1.284/135; se conservan como evidencia de sus versiones de origen, junto con las pruebas actuales de conciliación. Ningún resultado automatizado acredita la validación física.

Hashes SHA-256 de los borradores examinados:

- Tiempos: `3399690140bce0a5afc4e56e3965c410167074d0d9cd7ac4cf8d80a679b8bcac`.
- Catálogo: `e236e5dd29aa24f2edaccffcd4bc8681e1b522eede5fe0b349548c44381c22d3`.
- Compatibilidad múltiple: `5200881fc16c1c167428718aeff24ba04fa2a21761fd6e6de979e8bd1b772e56`.

## Pendientes antes de una activación real

1. Revisión y autorización de Nelson sobre SQL, restricciones, extensiones, RLS, grants y configuración; creación de migraciones versionadas después de aprobar el orden y la variante.
2. Prueba física del propietario en una instancia aislada. Falta concretar el proveedor de login de prueba y autorizar la excepción privada de 8087, que el firewall bloquea actualmente. Metro 8087 arranca y genera el bundle iOS desde la nueva rama; el acceso funcional desde iPhone sigue pendiente. No se ha cambiado el firewall ni configurado un servidor de login aislado.
3. Confirmar zona horaria IANA, turnos, ausencias, recursos y especialidades reales. No migrar automáticamente bloqueos locales históricos sin decidir su correspondencia.
4. Resolver el acceso independiente de profesionales si forma parte del alcance obligatorio del piloto.
5. Aprobar por separado publicación GitHub, migraciones, activación de backend y distribución. Ninguna se deriva automáticamente de las demás.

Ventas, stock y facturación quedan fuera de este cierre. Un producto marcado como gestionado por stock falla de forma explícita mientras no exista una integración real. No se considera vendido ni se inventa una existencia.

## Reversión

Antes de activar en un entorno real: copia de base recuperable y restauración ensayada por Nelson, junto con referencia del código anterior. Mantener los snapshots y las filas nuevas. No ofrecer un rollback destructivo de columnas/esquemas como solución automática. Si se suspende la función, bloquear nuevas operaciones de forma autorizada y conservar la lectura de recibos/historial; la vuelta a un backend anterior necesita comprobar cómo trata las reservas por fases ya creadas.

La rama local está respaldada fuera de Git. Su recuperación usa una copia del commit base, el parche y los archivos nuevos del manifiesto, sin modificar worktrees de origen. No se ha hecho commit, push, merge, migración real ni despliegue. GO Imprimir está excluido.
