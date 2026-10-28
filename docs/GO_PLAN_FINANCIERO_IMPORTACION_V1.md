# GO — Formato de carga de mercados v1

Esta es la interfaz de la SEGUNDA instrucción. La primera construye la herramienta y no carga cifras reales. Las plantillas no contienen registros ni cantidades. No se deben cargar los fixtures sintéticos de tests en un entorno real.

## JSON

UTF-8; objeto con exactamente estas propiedades:

```json
{
  "schemaVersion": "go-finance-market/1",
  "rows": []
}
```

Completar rows con uno o más objetos. La plantilla vacía permite preparar un archivo, pero no es una importación aplicable. Máximo 25000 filas y 20 MB por archivo; máximo 25000 hechos de mercado y 25000 fuentes por plan en V1.

| Campo de cada fila | Tipo y regla |
|---|---|
| countryCode | Código ISO 3166-1 alpha-2 en mayúsculas del catálogo compatible. |
| countryName | Nombre no vacío, máximo 160 caracteres. Un nombre existente del plan se conserva. |
| activityId | Identificador estable, 1–80 caracteres: letras, números, punto, guion, guion bajo o dos puntos; empieza por letra/número. |
| activityName | Nombre de actividad, 1–160 caracteres. Si el identificador ya existe, el nombre y la unidad deben coincidir. |
| companies | Número no negativo de hasta 10^12, o null para desconocido. Empresa/establecimiento exige recuento entero; otra unidad puede tener fracciones. Cero es un dato explícito. |
| unit | Exactamente empresa, establecimiento u otra. Mantener la misma unidad por actividad; describir otras unidades en observaciones. |
| referenceYear | Año entero entre 1800 y 2300. |
| sourceOrganization | Organismo o fuente, 1–160 caracteres. |
| sourceUrl | URL HTTP/HTTPS, máximo 2000 caracteres. No se descarga automáticamente. |
| consultedOn | Fecha válida AAAA-MM-DD. |
| updatedOn | Fecha válida AAAA-MM-DD de actualización del dato registrado. |
| verification | NO_VERIFICADO, VERIFICADO, ESTIMACION o CONFLICTO, exactamente. |
| notes | Observaciones, máximo 2000 caracteres; cadena vacía si no procede. |

No introducir porcentajes, escenarios, tarifas, costes, permisos o claves en estas filas: son campos ajenos al formato y se rechazan. El estado VERIFICADO lo declara quien aporta el dato; el importador no realiza una auditoría estadística automática.

## CSV

UTF-8, cabecera obligatoria (plantilla CSV disponible en templates):

```csv
schemaVersion,countryCode,countryName,activityId,activityName,companies,unit,referenceYear,sourceOrganization,sourceUrl,consultedOn,updatedOn,verification,notes
```

Cada fila repite schemaVersion=go-finance-market/1. Se aplican las mismas reglas que en JSON. companies vacío significa desconocido; 0 significa cero. Usar números sin separadores de miles y punto decimal solo cuando corresponda a otra unidad. No usar coma decimal ni fórmulas de hoja de cálculo. Los campos con comas o saltos deben ir entre comillas CSV.

El lector usa PapaParse ya instalado y convierte al mismo formato JSON validado. No se ejecutan fórmulas. No hay un segundo circuito de aplicación para CSV.

## Identidad, duplicados y compatibilidad

La clave del dato es actividad + país + año. Se conserva una unidad y una fuente activa por dato. Las fuentes se identifican por organismo y URL normalizados; una colisión de identificador se rechaza, nunca sobrescribe otro origen.

- Filas idénticas repetidas: se detectan y aplican una vez, con advertencia.
- Misma clave con cantidades/unidades/orígenes incompatibles dentro del archivo: error antes de aplicar.
- Fuente diferente con cantidad discrepante, unidad incompatible o degradación de un dato VERIFICADO: requiere revisión; el importador bloquea la sustitución.
- Actualización compatible del mismo origen: conserva versiones y trazabilidad.
- Campos desconocidos, códigos no compatibles, cantidades negativas o fechas inválidas: error con fila y campo.
- Un error invalida toda la operación: no se aplican parcialmente las filas válidas.

Una actividad nueva se añade al catálogo financiero con la unidad declarada. Un país nuevo usa inicialmente la moneda base de proyección del plan, no una afirmación sobre su moneda nacional. El administrador debe revisar moneda y tarifas antes de calcular. La importación no selecciona países ni crea porcentajes o modelos de ingresos.

## Flujo y atomicidad

1. Guardar el borrador financiero personal antes de preparar la carga.
2. Seleccionar JSON/CSV. Validación local y validación autoritativa del backend.
3. Revisar errores, duplicados, contadores y muestra de hasta 20 filas.
4. El backend guarda una vista previa privada vinculada al actor, plan y versión; expira en una hora. Los mercados siguen intactos.
5. Aceptar expresamente o cancelar. Aceptar ejecuta una sola transacción PostgreSQL.
6. Si cambió la versión del plan, no se aplica el snapshot antiguo; hay que generar otra vista previa.
7. Repetir la aceptación de la misma vista previa ya aplicada no duplica registros ni versiones.
8. Consultar historial y, si procede, confirmar reversión.

La reversión restaura solo los mercados y la procedencia afectados. No descarta modificaciones posteriores de hipótesis, precios o costes. Si un dato importado o su fuente fueron modificados después, bloquea la reversión para evitar sobrescribirlos. Los catálogos de actividades/países incorporados se conservan para no borrar trabajo personal posterior; las fuentes nuevas aún referenciadas tampoco se eliminan.

## API existente de GO

Base: /api/supabase/admin/finance. JWT de sesión y permisos comprobados en servidor y dentro de la operación SQL. No requiere claves nuevas en el cliente.

- GET /access
- POST /plans
- GET /plans/:id
- PUT /plans/:id con version, document y reason
- GET /plans/:id/results con filtros activityId/countryCode/scenario/year; offset y limit (250 por defecto, máximo 1000). Incluye versión, total de filas y consolidado global.
- GET /plans/:id/history
- GET y PUT /plans/:id/grants (solo principal para consultar/conceder/revocar)
- POST /plans/:id/imports/preview con version y file (objeto JSON de este formato)
- POST /plans/:id/imports/:previewId/apply con confirm:true
- DELETE /plans/:id/imports/:previewId
- GET /plans/:id/imports
- POST /plans/:id/imports/:importId/revert con version y confirm:true

Enviar cuerpos con Content-Type: application/vnd.go.finance+json para que las cargas grandes usen el parser privado de 20 MB sin alterar el límite JSON de las demás rutas. No enviar credenciales dentro del archivo. Las respuestas privadas usan Cache-Control: no-store. La aplicación no publica automáticamente exportaciones ni estadísticas.
