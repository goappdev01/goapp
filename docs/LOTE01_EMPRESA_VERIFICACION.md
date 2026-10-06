# LOTE 01 — Verificación empresarial

## Autoridad y alcance

La identidad y la sesión son únicas. El contexto Usuario/Empresa no cambia el correo, la contraseña ni los tokens. Solo `businesses.verified === true` recibido mediante la consulta autenticada del propietario permite GO Empresa. Los roles, empresas demo y `go_verification_v1` no conceden permisos.

El 5 de octubre de 2026 el usuario confirmó desde Supabase SQL Editor que `public.businesses` estaba vacía. No se crean empresas ficticias, ni se importan demos, ni se aprueba automáticamente ninguna empresa.

Estados del móvil: `sin_empresa`, `pendiente_verificacion`, `rechazada`, `verificada`. El rechazo se obtiene de la solicitud privada; la autorización procede siempre del booleano del negocio.

## Implementación

- Un proveedor consulta los negocios del propietario al iniciar, cambiar contexto y volver del segundo plano. Comparte consultas simultáneas, invalida resultados anteriores tras cambios de sesión y deniega acceso durante la comprobación o si falla la red. No elimina sesiones por estos errores.
- El límite del Landing decide antes de montar su contenido. Pendiente/rechazada: solo estado, corrección de datos, regreso a Usuario y logout. Los accesos internos a Empresa utilizan el mismo contexto y los componentes privados requieren la misma autorización.
- La configuración privada no se carga, conserva en memoria ni sincroniza sin autorización.
- El alta pide razón social, NIF/CIF, nombre comercial opcional y dirección. La operación RPC comprueba `auth.uid()`, propiedad y datos; crea el negocio con `verified=false` y reservas desactivadas. Una solicitud corregida vuelve a pendiente, nunca a verificada. El bloqueo por identidad serializa altas y evita duplicados por repetición.
- Los datos fiscales se almacenan en `business_verification_requests`, separada de los campos públicos y con lectura exclusiva del propietario. El cliente no puede escribir el estado ni el motivo de revisión directamente.
- Express exige propiedad y verificación para recursos y configuración privados. La migración también restringe RLS para servicios, profesionales, horarios, configuración y reservas empresariales, incluido el acceso directo a Supabase.
- La revisión manual por GO requiere administración confiable. El usuario autenticado no tiene permiso de modificar `businesses.verified`; no se añade ningún endpoint de autoaprobación. Rechazar una solicitud no concede acceso; solo un negocio con `verified=true` está aprobado.

## Publicación — estado del 6 de octubre de 2026

La migración `artifacts/api-server/supabase/migrations/20261006064253_business_verification_access.sql` está aplicada y registrada en el proyecto GO mediante la integración autorizada de Supabase. Se comprobó antes que las tablas empresariales estaban vacías y que sus columnas, RLS y políticas coincidían con la base esperada. No se borraron ni reescribieron datos existentes.

El backend está desplegado en el servicio existente `goapp-api`, entorno `production`, dominio `goapp-api-production.up.railway.app`. Railway confirma SUCCESS para el despliegue `2773afd8-5aa0-46ab-973e-370c4400986f`, desde el commit `fff549c8c297e868a8e69573c31a1198a91c74e5` de `batch/go-ux-2026-10-05`. Se fijó ese commit exclusivamente en este entorno, conservando Dockerfile, variables y dominio, para que los siguientes push del lote no desplieguen automáticamente. No se fusionó main.

El build Linux de Railway terminó correctamente. El servidor arrancó y su healthcheck pasó; GET `/api/healthz` devuelve 200 con `status=ok`. POST `/api/supabase/manage/enrollment` sin sesión devuelve 401; POST `/api/supabase/auth/refresh` vacío devuelve 400/REFRESH_TOKEN_REQUIRED. Estos controles comprueban salud y rechazo de acceso sin sesión; no demuestran por sí solos una inserción autenticada.

La base conserva cero negocios y cero solicitudes después de estas comprobaciones: no se crearon fixtures ni sesiones artificiales. El recorrido positivo y su persistencia real quedan por confirmar enviando UNA solicitud real desde Expo Go y contrastando sus filas en Supabase (`verified=false`, reservas desactivadas y solicitud pendiente). El código publicado y la RPC aplicada realizan esa operación atómicamente; los tests locales verifican sus contratos con respuestas simuladas. No presentar esta prueba real como superada antes de observarla.

## Pruebas manuales

1. Expo Go en 8083: Reload, login Usuario, Configuración, logout y nuevo login conservan el flujo existente.
2. Con la misma sesión: Cambiar contexto → Empresa. Si no tiene empresa, aparece únicamente Alta de empresa. No se muestra el Landing empresarial ni módulos detrás ni durante la consulta.
3. Volver a Usuario: se conserva la sesión y no se solicita una segunda contraseña. Reload mantiene ese contexto.
4. Tras publicar backend y migración en el entorno autorizado: enviar un alta real; comprobar `verified=false` y solicitud pendiente. Corregir datos sin obtener permisos.
5. Revisión manual de rechazo en el entorno de pruebas: mostrar motivo, mantener bloqueo y permitir corregir/reenviar.
6. Revisión manual de aprobación en el entorno de pruebas: solo después de que GO conceda `verified=true`, volver del segundo plano o volver a entrar en Empresa permite el contenido.
7. Revocar en el entorno de pruebas: al volver/comprobar contexto se oculta el contenido. Las peticiones privadas deben quedar denegadas por Express/RLS incluso si el cliente conserva una respuesta anterior.
8. Cerrar sesión desde el estado pendiente y desde Perfil. Reload vuelve a autenticación; una consulta anterior no puede restablecer permisos.

No crear cuentas ni aprobar negocios en producción para ejecutar tests automáticos. Las pruebas unitarias usan identidades, tokens y respuestas simuladas. La revisión estática de SQL no sustituye su ejecución en PostgreSQL.

## Archivos del cambio

Móvil:

- `artifacts/go-app-mobile/app/_layout.tsx`
- `artifacts/go-app-mobile/app/index.tsx`
- `artifacts/go-app-mobile/components/auth/LoginRegisterPanel.tsx`
- `artifacts/go-app-mobile/components/auth/BusinessAccessGate.tsx`
- `artifacts/go-app-mobile/contexts/GoBusinessAccessContext.tsx`
- `artifacts/go-app-mobile/contexts/GoBusinessConfigContext.tsx`
- `artifacts/go-app-mobile/data/businessAccess.ts`
- `artifacts/go-app-mobile/data/businessEnrollmentDraft.ts`
- `artifacts/go-app-mobile/data/booking.ts`
- `artifacts/go-app-mobile/hooks/useVerification.ts`
- `artifacts/go-app-mobile/tests/business-access.test.mjs`
- `artifacts/go-app-mobile/tests/business-enrollment.test.mjs`

Backend y migración preparada:

- `artifacts/api-server/src/routes/management.ts`
- `artifacts/api-server/tests/management.test.mjs`
- `artifacts/api-server/tests/business-access.test.mjs`
- `artifacts/api-server/supabase/migrations/20261006064253_business_verification_access.sql`

Documentación: `docs/LOTE01_EMPRESA_VERIFICACION.md`.

## Validación local

TypeScript móvil y backend: sin errores. Build existente del backend: correcto. Pruebas seleccionadas: 44 del móvil y 9 del backend, todas correctas, con respuestas simuladas. `git diff --check`: correcto. La migración sí se ha ejecutado en PostgreSQL. Después se comprobaron tabla privada/RLS, permisos de la RPC, ausencia de permisos cliente para aprobar y valores iniciales false. Una llamada SQL sin identidad fue rechazada con 42501 y dejó ambas tablas sin filas. No se insertaron fixtures ni se simularon sesiones en producción.

## Continuación de Alta de empresa

Se conservaron y validaron los ajustes previos del formulario: borrador aislado por identidad/empresa, manejo del teclado en iPhone, envío único y borrado del borrador únicamente tras confirmar un registro real no verificado. El backend y el móvil rechazan respuestas vacías, identidades ajenas y cualquier confirmación que no indique verified=false. Los fallos de red mantienen los datos y no conceden permisos.

El test empresarial del backend se encontró dañado (solo bytes nulos); se guardó una copia en la carpeta temporal del usuario y se recuperó la versión válida del commit fa776fe antes de ampliar sus casos de respuesta inválida y fallo de conexión.

El asesor de Supabase advierte sobre la RPC SECURITY DEFINER accesible al rol authenticated. Su acceso es intencional y limitado: auth.uid() obligatorio, propiedad comprobada, search_path vacío, argumentos fiscales permitidos, bloqueo concurrente por identidad, sin parámetro de aprobación, EXECUTE revocado a PUBLIC/anon y sin permiso cliente de escritura sobre solicitudes o verified. [Descripción del aviso](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). No se cambió la configuración de contraseñas por el aviso preexistente de protección de contraseñas filtradas.
