# GO Proyecciones: migración preparada, no aplicada

Destino previsto: Supabase `goapp`, referencia `xiyxziyjpgnqfecbhmqn`.

## Comprobación previa

`financial_plans_production_review.sql` incluye la transacción y el guardia de
`financial_plans_production_guard.sql`. Antes de solicitar la ejecución, comparar
su SHA-256 con el consignado en el acta de autorización, comprobar de nuevo el
proyecto, `current_database()`, `current_user`, versión de PostgreSQL, ausencia
de `go_finance_private` y RPC `finance_%`, y contrato/propietario/RLS de
`public.admin_memberships`. El guardia aborta si cualquiera difiere.

El SQL crea exclusivamente tablas y funciones financieras nuevas, revoca el
acceso por defecto y concede ejecución de las RPC financieras solo a
`authenticated`. La pertenencia ADMIN se verifica en base de datos y cada plan
comprueba su titular o concesión explícita. Las pruebas aisladas cubrieron
lectura, creación, guardado, recarga y rechazo a un usuario no autorizado.

El fichero NO está autorizado para ejecución en producción por este encargo.
Una copia PostgreSQL previamente restaurada y verificada existe, pero su
existencia tampoco constituye autorización de migración.

## Reversión preparada

`financial_plans_production_rollback.sql` solo es apto **antes de guardar datos
financieros**. Comprueba destino y propietario, inventario exacto, vaciedad de
las quince tablas y ausencia de dependencias externas; después elimina las
doce RPC con `RESTRICT` y el esquema privado dentro de una transacción. En el
PostgreSQL local aislado se aplicó el SQL de revisión, se probó con datos
sintéticos revertidos y luego esta reversión terminó con `COMMIT`. No se
restauró ni modificó producción.

Una vez que existan planes, la reversión destructiva debe reemplazarse por un
procedimiento específico que preserve esos datos y se pruebe con un respaldo
actual. Ante cualquier error de la migración productiva, detenerse, conservar
evidencias y decidir la recuperación; no ejecutar la reversión automáticamente.

## Estado funcional

La aplicación y la API ya calculan y presentan los escenarios. Mientras
falte la persistencia financiera en producción, `/access` responde
`FINANCE_SETUP_REQUIRED` (HTTP 503) y `REINTENTAR` conserva ese resultado.
Solo después de una autorización productiva separada y una prueba autenticada
de apertura, creación, guardado y recarga podrá darse por recuperada la
funcionalidad completa en iPhone.
